#!/usr/bin/env node
'use strict';
/**
 * sessions-active — which Claude sessions on this machine are WORKING right now,
 * or are about to work again without a person? The answer decides whether a
 * shutdown may go ahead (do-run autonomous Step 8a, the Home pane's bedtime
 * button via bedtime-shutdown.js).
 *
 * Source of truth: `~/.claude/sessions/<pid>.json`, the record every Claude
 * Code process keeps about itself (`status: "busy" | "idle"`, `statusUpdatedAt`,
 * `sessionId`, `hostSessionId`, `name`). A transcript's mtime is NOT the signal:
 * a title rename, a heartbeat or an open concept page all write or keep things
 * alive without any work going on, and a ten-minute test run writes nothing.
 *
 * A session counts as ACTIVE when its process is alive and
 *   working   status is busy — unless it waits on the person (a question older
 *             than ASK_GRACE_MS) or shows no sign of life for STALL_MS (wedged);
 *   tasks     the turn ended but background work is open that re-invokes it
 *             (agents, backgrounded commands, workflows). Concept-bridge
 *             plumbing, dev servers and waits on other sessions are not work
 *             (hooks/lib/pending-tasks.js + WAITER_RE). Quiet for TASK_QUIET_MS →
 *             no longer counted;
 *   wakeup    the turn ended and a wake-up it scheduled itself (ScheduleWakeup,
 *             a one-shot cron) is due within SOON_MS;
 *   question  a question asked less than ASK_GRACE_MS ago — an autostart timer
 *             or the person may still answer it;
 *   transcript  fallback only: a process without a status field, or a transcript
 *             no live record claims, written within FRESH_MS.
 * Everything else is idle: an ended turn, an open concept page, a session
 * waiting for an answer nobody will give tonight, a crashed process.
 *
 * CLI (stdout: one JSON line):
 *   check [--self <id>]... [--all]
 *       → { active: [{ id, hostId, name, why, detail }], sessions }
 *       exit 0 none active, 3 some active
 *   wait [--quiet-min 4] [--interval-sec 30] [--cap-min 120] [--self <id>]... [--all]
 *       poll until no session was active for quiet-min in a row, or the cap
 *       → { active, capped, waitedMin }; exit 0 quiet, 3 capped while active
 * The calling session (CLAUDE_CODE_SESSION_ID / CLAUDE_SESSION_ID, plus every
 * --self) is never counted; --all counts it too. Any other failure exits 1 with
 * { error } — callers treat that like the cap (they decide, never "quiet").
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXIT_ACTIVE = 3;
/** Busy without any sign of life this long: wedged (API hang, dead tool), not working. */
const STALL_MS = 60 * 60_000;
/** Open background work whose session wrote nothing this long is no longer waited for. */
const TASK_QUIET_MS = 2 * 3_600_000;
/** A pending question younger than this may still be answered (3-minute autostart, the person). */
const ASK_GRACE_MS = 5 * 60_000;
/** A self-scheduled wake-up this close means the session is about to work again. */
const SOON_MS = 30 * 60_000;
/** A wake-up this far past its time has fired or will never fire. */
const WAKE_OVERDUE_MS = 2 * 60_000;
/** Fallback rule: a transcript written this recently counts as work. */
const FRESH_MS = 3 * 60_000;
/** How much of a transcript's end is read for questions and wake-ups. */
const TAIL_BYTES = 512 * 1024;
/** Fast-path slice for the open-task scan (larger files are streamed). */
const TASK_TAIL_BYTES = 8 * 1024 * 1024;
/** Tools that wait on the person. */
const ASK_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);
/** Background commands that only wait for other sessions or jobs — two sessions must not wait on each other. */
const WAITER_RE = /sessions-active\.js|autonomous-busy-check\.js|bedtime-shutdown\.js/i;

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function mtimeOf(p) {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}

/**
 * The live session records in `dir`. A record whose process is gone, or that
 * was written before the last boot (Windows reuses pids), is skipped.
 */
function readRecords(dir, { isAlive = pidAlive, bootMs } = {}) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!/^\d+\.json$/.test(n)) continue;
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch { continue; }
    if (!r || typeof r !== 'object' || typeof r.sessionId !== 'string' || !Number.isInteger(r.pid)) continue;
    if (Number.isFinite(bootMs) && Number.isFinite(r.startedAt) && r.startedAt < bootMs - 60_000) continue;
    if (!isAlive(r.pid)) continue;
    out.push(r);
  }
  return out;
}

/** session id → every `<projects>/<slug>/<id>.jsonl` (a session can sit under several slugs). */
function indexTranscripts(root) {
  const byId = new Map();
  let slugs;
  try { slugs = fs.readdirSync(root, { withFileTypes: true }); } catch { return byId; }
  for (const s of slugs) {
    if (!s.isDirectory()) continue;
    let names;
    try { names = fs.readdirSync(path.join(root, s.name)); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith('.jsonl')) continue;
      const id = n.slice(0, -6);
      const list = byId.get(id);
      if (list) list.push(path.join(root, s.name, n));
      else byId.set(id, [path.join(root, s.name, n)]);
    }
  }
  return byId;
}

/** The newest of a session's transcripts and the latest write to it or to one of its subagents. */
function transcriptOf(files) {
  let file = '';
  let mtime = 0;
  let life = 0;
  for (const f of files || []) {
    const m = mtimeOf(f);
    if (m > mtime) { mtime = m; file = f; }
    life = Math.max(life, m);
    const sub = path.join(f.slice(0, -6), 'subagents');
    let names;
    try { names = fs.readdirSync(sub); } catch { continue; }
    for (const n of names) if (n.endsWith('.jsonl')) life = Math.max(life, mtimeOf(path.join(sub, n)));
  }
  return { file, mtime, life };
}

/** `m h dom mon *` (a one-shot cron, local time) → its next fire time at or after `baseMs`, or 0. */
function cronFireAt(expr, baseMs) {
  const p = String(expr || '').trim().split(/\s+/);
  if (p.length !== 5 || !Number.isFinite(baseMs)) return 0;
  const [mi, h, dom, mon] = p.slice(0, 4).map(v => (/^\d+$/.test(v) ? Number(v) : NaN));
  if (![mi, h, dom, mon].every(Number.isFinite)) return 0;
  const base = new Date(baseMs);
  let d = new Date(base.getFullYear(), mon - 1, dom, h, mi, 0, 0);
  if (d.getTime() < baseMs - 60_000) d = new Date(base.getFullYear() + 1, mon - 1, dom, h, mi, 0, 0);
  return d.getTime();
}

function blockText(c) {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.map(b => (b && typeof b.text === 'string' ? b.text : '')).join('\n');
}

/** A user entry that starts a turn (a prompt, a fired wake-up), not a tool result. */
function isPrompt(content) {
  if (typeof content === 'string') return content.trim() !== '';
  if (!Array.isArray(content)) return false;
  return !content.some(b => b && b.type === 'tool_result') && content.some(b => b && b.type === 'text');
}

/**
 * What the end of a transcript says about waiting: a question still open, and
 * the wake-ups the session scheduled for itself.
 * @param {string} text — raw JSONL (a tail slice is fine)
 * @returns {{ questionAt: number, wakes: Array<{ setAt: number, fireAt: number }> }} questionAt 0 = none
 */
function parseTail(text) {
  const pending = new Map();
  const crons = new Map();
  let wakes = [];
  for (const raw of String(text || '').split('\n')) {
    if (!raw || raw.startsWith('{"type":"api-request')) continue;
    if (!raw.includes('"tool_use"') && !raw.includes('"tool_result"') && !raw.includes('"type":"user"')) continue;
    let e;
    try { e = JSON.parse(raw); } catch { continue; }
    if (!e || e.isSidechain === true || (e.type !== 'assistant' && e.type !== 'user')) continue;
    const at = Date.parse(e.timestamp);
    const content = e.message && e.message.content;
    if (e.type === 'user' && isPrompt(content)) {
      // A new turn: the wake-up before it has fired, or the turn schedules its own.
      wakes = [];
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'tool_use' && b.id) {
        pending.set(b.id, { name: b.name, at });
        const i = b.input && typeof b.input === 'object' ? b.input : {};
        if (b.name === 'ScheduleWakeup') {
          const delay = Number(i.delaySeconds);
          if (i.stop === true) wakes = [];
          else if (Number.isFinite(delay) && Number.isFinite(at)) wakes.push({ setAt: at, fireAt: at + delay * 1000 });
        } else if (b.name === 'CronCreate' && i.recurring === false) {
          const fireAt = cronFireAt(i.cron, at);
          if (fireAt) crons.set(b.id, { setAt: at, fireAt, result: '' });
        } else if (b.name === 'CronDelete' && i.id) {
          for (const [k, c] of crons) if (c.result.includes(String(i.id))) crons.delete(k);
        }
      } else if (b.type === 'tool_result') {
        pending.delete(b.tool_use_id);
        const c = crons.get(b.tool_use_id);
        if (c) c.result = `${blockText(b.content)}\n${JSON.stringify(e.toolUseResult || '')}`;
      }
    }
  }
  let questionAt = 0;
  for (const p of pending.values()) if (ASK_TOOLS.has(p.name) && Number.isFinite(p.at)) questionAt = Math.max(questionAt, p.at);
  return { questionAt, wakes: [...wakes, ...[...crons.values()].map(c => ({ setAt: c.setAt, fireAt: c.fireAt }))] };
}

function readTail(file, bytes = TAIL_BYTES) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, bytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* closed */ }
  }
}

/** HH:MM, local. */
function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The verdict for one live session. Pure.
 * @param {{ status?: string, statusAt?: number, life?: number, questionAt?: number,
 *   wakes?: number[], tasks?: string[], now: number }} s
 *   `life` = the latest sign of life (status change, transcript or subagent write).
 * @returns {{ active: boolean, why: string, detail: string }}
 */
function verdictFor(s) {
  const now = s.now;
  const life = Math.max(Number(s.life) || 0, Number(s.statusAt) || 0);
  const idle = why => ({ active: false, why, detail: '' });
  const asked = Number(s.questionAt) || 0;
  if (asked) {
    return now - asked < ASK_GRACE_MS ? { active: true, why: 'question', detail: '' } : idle('waits-for-answer');
  }
  if (s.status === 'busy') {
    return now - life > STALL_MS ? idle('stalled') : { active: true, why: 'working', detail: '' };
  }
  const tasks = (s.tasks || []).filter(Boolean);
  if (tasks.length && now - life <= TASK_QUIET_MS) return { active: true, why: 'tasks', detail: tasks.slice(0, 3).join(', ') };
  const due = (s.wakes || []).filter(w => w > now - WAKE_OVERDUE_MS && w <= now + SOON_MS).sort((a, b) => a - b)[0];
  if (due) return { active: true, why: 'wakeup', detail: clock(due) };
  if (typeof s.status !== 'string' && now - life < FRESH_MS) return { active: true, why: 'transcript', detail: '' };
  return idle(tasks.length ? 'tasks-quiet' : 'idle');
}

/**
 * A session title without its status head ("⏳ ➜ 🤖 X" → "X", also the worded
 * head with keyword and bar of before title-scheme 3.0) — the scheme's own strip, so
 * every head generation goes; the title as it is when the scheme cannot load.
 */
function shortName(name, cwd) {
  const n = String(name || '').trim();
  let rest = n;
  try { rest = require('../hooks/lib/title-scheme.js').stripPrefixes(n).trim(); } catch { /* keep the title */ }
  return (rest || path.basename(String(cwd || '')) || 'Session').slice(0, 60);
}

/**
 * One snapshot of every session on this machine.
 * @param {{ home?: string, now?: number, selfIds?: string[], isAlive?: (pid: number) => boolean,
 *   bootMs?: number, cache?: Map<string, object>, openTasks?: (file: string) => Array<{ name: string, at?: number }> }} [o]
 *   `cache` (kept by a polling caller) spares re-reading a transcript that did not change.
 * @returns {{ active: Array<{ id: string, hostId: string, name: string, why: string, detail: string }>, sessions: number }}
 */
function check(o = {}) {
  const home = o.home || path.join(os.homedir(), '.claude');
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const self = new Set((o.selfIds || []).filter(Boolean));
  const bootMs = Number.isFinite(o.bootMs) ? o.bootMs : Date.now() - os.uptime() * 1000;
  const cache = o.cache || new Map();
  const openTasks = o.openTasks || (file => {
    const { scanOpenTasksInFile } = require('../hooks/lib/pending-tasks.js');
    return scanOpenTasksInFile(file, TASK_TAIL_BYTES, {
      times: true,
      skipTask: input => WAITER_RE.test(`${input.command || ''}\n${input.description || ''}`),
    });
  });
  const records = readRecords(path.join(home, 'sessions'), { isAlive: o.isAlive, bootMs });
  const index = indexTranscripts(path.join(home, 'projects'));
  const claimed = new Set();
  const active = [];

  for (const r of records) {
    claimed.add(r.sessionId);
    if (self.has(r.sessionId) || (r.hostSessionId && self.has(r.hostSessionId))) continue;
    const t = transcriptOf(index.get(r.sessionId));
    let read = cache.get(r.sessionId);
    if (!read || read.file !== t.file || read.mtime !== t.mtime) {
      read = { file: t.file, mtime: t.mtime, tail: t.file ? parseTail(readTail(t.file)) : { questionAt: 0, wakes: [] }, tasks: null };
      cache.set(r.sessionId, read);
    }
    const busy = r.status === 'busy';
    // The task scan streams the whole file: only for an ended turn, once per transcript state.
    if (!busy && read.tasks === null) {
      try { read.tasks = t.file ? openTasks(t.file) : []; } catch { read.tasks = []; }
    }
    // Background work and wake-ups live inside the process: whatever was launched or
    // scheduled before this process started (an app restart, a resumed session) is gone.
    const born = Number.isFinite(r.startedAt) ? r.startedAt - 60_000 : 0;
    const ofThisProcess = at => !at || at >= born;
    const v = verdictFor({
      status: r.status,
      statusAt: Math.max(Number(r.statusUpdatedAt) || 0, Number(r.updatedAt) || 0),
      life: t.life,
      questionAt: read.tail.questionAt,
      wakes: read.tail.wakes.filter(w => ofThisProcess(w.setAt)).map(w => w.fireAt),
      tasks: busy ? [] : [...new Set((read.tasks || []).filter(x => ofThisProcess(x.at)).map(x => x.name).filter(Boolean))],
      now,
    });
    if (v.active) active.push({ id: r.sessionId, hostId: r.hostSessionId || '', name: shortName(r.name, r.cwd), why: v.why, detail: v.detail });
  }

  // Fallback net: a transcript no live record claims, written just now (a client that keeps no record).
  for (const [id, files] of index) {
    if (claimed.has(id) || self.has(id)) continue;
    const t = transcriptOf(files);
    if (t.life && now - t.life < FRESH_MS) {
      active.push({ id, hostId: '', name: shortName('', path.basename(path.dirname(t.file))), why: 'transcript', detail: '' });
    }
  }
  return { active, sessions: records.length };
}

/**
 * Poll until no session was active for `quietMin` in a row, or the cap.
 * deps: now(), sleep(ms), plus everything check() takes.
 * @returns {Promise<{ active: object[], capped: boolean, waitedMin: number }>}
 */
async function waitUntilQuiet({ quietMin = 4, intervalSec = 30, capMin = 120 } = {}, deps = {}) {
  const now = deps.now || Date.now;
  const sleep = deps.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const cache = new Map();
  const start = now();
  const deadline = start + capMin * 60_000;
  let quietSince = 0;
  let res = check({ ...deps, cache, now: now() });
  for (;;) {
    const t = now();
    if (res.active.length) quietSince = 0;
    else if (!quietSince) quietSince = t;
    if (quietSince && t - quietSince >= quietMin * 60_000) return { active: [], capped: false, waitedMin: Math.round((t - start) / 60_000) };
    if (t >= deadline) return { active: res.active, capped: res.active.length > 0, waitedMin: Math.round((t - start) / 60_000) };
    await sleep(Math.min(intervalSec * 1000, Math.max(1000, deadline - t)));
    res = check({ ...deps, cache, now: now() });
  }
}

function argNum(argv, flag, def) {
  const i = argv.indexOf(flag);
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

/** The sessions a CLI call never counts: itself (env) and every --self. */
function selfIdsFrom(argv, env = process.env) {
  if (argv.includes('--all')) return [];
  const ids = [env.CLAUDE_CODE_SESSION_ID, env.CLAUDE_SESSION_ID];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--self' && argv[i + 1]) ids.push(argv[i + 1]);
  return ids.filter(Boolean);
}

async function main(argv) {
  const cmd = argv[0];
  try {
    const selfIds = selfIdsFrom(argv);
    let res;
    if (cmd === 'check') res = check({ selfIds });
    else if (cmd === 'wait') {
      res = await waitUntilQuiet({
        quietMin: argNum(argv, '--quiet-min', 4), intervalSec: argNum(argv, '--interval-sec', 30), capMin: argNum(argv, '--cap-min', 120),
      }, { selfIds });
    } else {
      process.stderr.write('usage: sessions-active.js check | wait [--quiet-min N] [--interval-sec N] [--cap-min N] [--self <id>] [--all]\n');
      return 1;
    }
    process.stdout.write(`${JSON.stringify(res)}\n`);
    return res.active.length ? EXIT_ACTIVE : 0;
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ error: String((e && e.message) || e) })}\n`);
    return 1;
  }
}

if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c));

module.exports = {
  check, waitUntilQuiet, verdictFor, parseTail, cronFireAt, readRecords, indexTranscripts, transcriptOf, shortName, selfIdsFrom,
  EXIT_ACTIVE, STALL_MS, TASK_QUIET_MS, ASK_GRACE_MS, SOON_MS, FRESH_MS, WAITER_RE,
};

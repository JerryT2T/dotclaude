#!/usr/bin/env node
'use strict';
/**
 * bedtime-shutdown — "I am going to bed": power the PC off once no Claude
 * session works any more. Started by the Home pane's 🛏 button and by do-run's
 * bedtime path when nothing is left to do (skills/do-run/deep-knowledge/questions.md).
 * A detached watcher does the waiting, so no session has to stay awake for it
 * and no token is spent.
 *
 * The watcher powers off only when ALL of these hold:
 *   1. no session was active for QUIET_MS in a row (scripts/sessions-active.js —
 *      working, open background work, a wake-up due soon; an open concept page
 *      or a session waiting for an answer is not active);
 *   2. the person is away: no keyboard or mouse input for AWAY_MS (somebody
 *      still sitting at the PC is never shut down under their hands);
 *   3. no long-running job is going (scripts/autonomous-busy-check.js: config
 *      `shutdown.busyProcesses` and the busy lock files).
 * Then `shutdown.exe /s /t 60` — the same graceful 60 s shutdown as do-run
 * Step 8b; `shutdown /a` or `cancel` aborts it. After CAP_MIN without reaching
 * that point the watcher stands down and the PC stays on: it never cuts off a
 * session that still works.
 *
 * State: `~/.claude/bedtime-shutdown.json`, rewritten on every poll —
 *   { pid, startedAt, capAt, updatedAt, phase, active: [{ name, why, detail }],
 *     quietSince, shutdownAt, note }
 *   phase: waiting | person | busy-job | shutdown | expired | cancelled | failed
 * A reader treats a `waiting`-family state not updated for STALE_MS as dead.
 *
 * CLI (stdout: one JSON line, the state plus `ok`):
 *   start [--cap-min 600]   arm (idempotent: a live watcher is reported, not doubled)
 *   status                  the current state (`armed` true/false)
 *   cancel                  stop the watcher and abort a shutdown it placed
 *   run                     the watcher loop itself (spawned by start)
 * Windows only; elsewhere start answers { ok: false, skipped: true }.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const POLL_MS = 30_000;
const QUIET_MS = 4 * 60_000;
const AWAY_MS = 5 * 60_000;
const CAP_MIN = 600;
const SHUTDOWN_DELAY_SEC = 60;
const BUSY_RECHECK_MS = 5 * 60_000;
/** A waiting state older than this has no watcher behind it any more. */
const STALE_MS = 3 * 60_000;
const LIVE_PHASES = new Set(['waiting', 'person', 'busy-job']);
/** The owner the fail-safe timer's marker names for a shutdown this script placed. */
const OWNER = 'bedtime';

function statePath(env = process.env) {
  return env.BEDTIME_SHUTDOWN_STATE || path.join(os.homedir(), '.claude', 'bedtime-shutdown.json');
}

function readState(file = statePath()) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    return s && typeof s === 'object' ? s : null;
  } catch {
    return null;
  }
}

function writeState(state, file = statePath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  try { fs.renameSync(tmp, file); } catch { fs.writeFileSync(file, JSON.stringify(state)); try { fs.unlinkSync(tmp); } catch { /* gone */ } }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** True while a watcher stands behind `state`: a live phase, a live pid, a fresh update. */
function isArmed(state, now, isAlive = pidAlive) {
  if (!state || !LIVE_PHASES.has(state.phase)) return false;
  if (!Number.isFinite(state.updatedAt) || now - state.updatedAt > STALE_MS) return false;
  return isAlive(state.pid);
}

/**
 * One watcher step. Pure: what the watcher does next, given what it sees.
 * @param {{ now: number, capAt: number, quietSince: number, active: object[],
 *   idleSec: number|null, busy: Array<{name: string}>|null }} s
 *   `idleSec` and `busy` are only looked at once the sessions were quiet long
 *   enough — pass null until then (they cost a process spawn each).
 *   idleSec null = unknown (the query failed) → the person counts as away.
 * @returns {{ phase: string, quietSince: number, need?: 'presence'|'busy', note?: string }}
 */
function step(s) {
  if (s.active.length) {
    return s.now >= s.capAt ? { phase: 'expired', quietSince: 0, note: 'sessions' } : { phase: 'waiting', quietSince: 0 };
  }
  const quietSince = s.quietSince || s.now;
  if (s.now >= s.capAt) return { phase: 'expired', quietSince, note: 'cap' };
  if (s.now - quietSince < QUIET_MS) return { phase: 'waiting', quietSince };
  if (s.idleSec === undefined) return { phase: 'waiting', quietSince, need: 'presence' };
  if (s.idleSec !== null && s.idleSec * 1000 < AWAY_MS) return { phase: 'person', quietSince };
  if (s.busy === undefined) return { phase: 'waiting', quietSince, need: 'busy' };
  if (s.busy && s.busy.length) return { phase: 'busy-job', quietSince, note: String(s.busy[0].name || '') };
  return { phase: 'shutdown', quietSince };
}

function shutdownExe() {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.join(root, 'System32', 'shutdown.exe');
}

// A UNC working directory must not break the native calls (see autonomous-shutdown-timer.js).
function safeCwd() {
  const home = os.homedir();
  return home && !home.startsWith('\\\\') ? home : os.tmpdir();
}

/** Seconds since the last keyboard or mouse input, or null when it cannot be read. */
function userIdleSeconds() {
  if (process.platform !== 'win32') return null;
  const ps = [
    "Add-Type -TypeDefinition @'",
    'using System; using System.Runtime.InteropServices;',
    'public static class DcIdle {',
    '  [StructLayout(LayoutKind.Sequential)] struct LII { public uint cbSize; public uint dwTime; }',
    '  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII p);',
    '  public static long Seconds() { LII l = new LII(); l.cbSize = (uint)Marshal.SizeOf(l);',
    '    if (!GetLastInputInfo(ref l)) return -1; return (long)(unchecked((uint)Environment.TickCount - l.dwTime) / 1000); }',
    '}',
    "'@",
    '[DcIdle]::Seconds()',
  ].join('\n');
  try {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')],
      { encoding: 'utf8', timeout: 30_000, windowsHide: true, cwd: safeCwd() });
    const n = Number(String(r.stdout || '').trim().split(/\s+/).pop());
    return r.status === 0 && Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function busyJobs() {
  try { return require('./autonomous-busy-check.js').check(); } catch { return []; }
}

/** Place the graceful shutdown. A fail-safe timer still pending belongs to a session that is idle by now: replaced. */
function placeShutdown(now = Date.now()) {
  const exe = shutdownExe();
  const cwd = safeCwd();
  spawnSync(exe, ['/a'], { windowsHide: true, encoding: 'utf8', cwd, timeout: 30_000 });
  const msg = `devops: alle Claude-Sitzungen sind fertig. Der PC fährt in ${SHUTDOWN_DELAY_SEC} s herunter. Abbrechen: shutdown /a`;
  const r = spawnSync(exe, ['/s', '/t', String(SHUTDOWN_DELAY_SEC), '/c', msg], { windowsHide: true, encoding: 'utf8', cwd, timeout: 30_000 });
  if (r.status !== 0) return { ok: false, error: `shutdown /s failed (status ${r.status}): ${String(r.stderr || r.stdout || '').trim()}` };
  const shutdownAt = now + SHUTDOWN_DELAY_SEC * 1000;
  try { require('./autonomous-shutdown-timer.js').writeMarker({ sessionId: OWNER, fireAt: shutdownAt }); } catch { /* the shutdown itself is placed */ }
  return { ok: true, shutdownAt };
}

function abortShutdown() {
  spawnSync(shutdownExe(), ['/a'], { windowsHide: true, encoding: 'utf8', cwd: safeCwd(), timeout: 30_000 });
  try {
    const t = require('./autonomous-shutdown-timer.js');
    const m = t.readMarker();
    if (m && m.sessionId === OWNER) t.clearMarker();
  } catch { /* no marker */ }
}

const brief = active => active.slice(0, 12).map(a => ({ name: a.name, why: a.why, detail: a.detail }));

/**
 * The watcher loop. deps (tests): now, sleep, check, idleSec, busy, shutdown, write, cancelled.
 * @returns {Promise<object>} the final state
 */
async function run({ capMin = CAP_MIN } = {}, deps = {}) {
  const now = deps.now || Date.now;
  const sleep = deps.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const sessions = require('./sessions-active.js');
  const cache = new Map();
  const check = deps.check || (() => sessions.check({ cache }));
  const write = deps.write || writeState;
  const startedAt = now();
  const state = { pid: process.pid, startedAt, capAt: startedAt + capMin * 60_000, updatedAt: startedAt, phase: 'waiting', active: [], quietSince: 0, shutdownAt: 0, note: '' };
  // Claim the state before the first poll: from here on a foreign pid in it means "stop".
  write(state);
  const cancelled = deps.cancelled || (() => { const s = readState(); return !!s && s.pid !== process.pid; });
  let presence = null;
  let jobs = null;
  for (;;) {
    // Another start or a cancel took the state over: this watcher is done.
    if (cancelled()) return state;
    let active;
    try { active = check().active; } catch { active = state.active.length ? state.active : [{ name: 'Sitzungsprüfung', why: 'error', detail: '' }]; }
    const seen = { now: now(), capAt: state.capAt, quietSince: state.quietSince, active };
    let next = step(seen);
    if (next.need === 'presence') {
      // Somebody seen at the PC cannot be away for AWAY_MS before that much time has passed: no query until then.
      const still = presence && presence.idleSec !== null ? presence.idleSec * 1000 + (seen.now - presence.at) : Infinity;
      if (still < AWAY_MS) seen.idleSec = still / 1000;
      else {
        presence = { idleSec: (deps.idleSec || userIdleSeconds)(), at: seen.now };
        seen.idleSec = presence.idleSec;
      }
      next = step(seen);
    }
    if (next.need === 'busy') {
      // The process list is expensive: a job seen running is looked at again after BUSY_RECHECK_MS.
      if (!jobs || !jobs.busy.length || seen.now - jobs.at >= BUSY_RECHECK_MS) jobs = { busy: (deps.busy || busyJobs)(), at: seen.now };
      seen.busy = jobs.busy;
      next = step(seen);
    }
    Object.assign(state, { phase: next.phase, quietSince: next.quietSince, note: next.note || '', active: brief(active), updatedAt: now() });
    if (next.phase === 'shutdown') {
      const r = (deps.shutdown || placeShutdown)(now());
      if (r.ok) state.shutdownAt = r.shutdownAt;
      else Object.assign(state, { phase: 'failed', note: r.error || 'shutdown failed' });
    }
    write(state);
    if (!LIVE_PHASES.has(state.phase)) return state;
    await sleep(POLL_MS);
  }
}

function argNum(argv, flag, def) {
  const i = argv.indexOf(flag);
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

function start(argv) {
  if (process.platform !== 'win32') return { ok: false, skipped: true, reason: 'non-windows platform' };
  const now = Date.now();
  const cur = readState();
  if (isArmed(cur, now)) return { ok: true, armed: true, already: true, ...cur };
  const capMin = argNum(argv, '--cap-min', CAP_MIN);
  let active = [];
  try { active = require('./sessions-active.js').check().active; } catch { /* the watcher's first poll fills it */ }
  const child = spawn(process.execPath, [__filename, 'run', '--cap-min', String(capMin)], { detached: true, stdio: 'ignore', windowsHide: true, cwd: safeCwd() });
  child.unref();
  const state = { pid: child.pid, startedAt: now, capAt: now + capMin * 60_000, updatedAt: now, phase: 'waiting', active: brief(active), quietSince: 0, shutdownAt: 0, note: '' };
  writeState(state);
  return { ok: true, armed: true, ...state };
}

function status() {
  const now = Date.now();
  const cur = readState();
  if (!cur) return { ok: true, armed: false };
  const pending = cur.phase === 'shutdown' && Number.isFinite(cur.shutdownAt) && cur.shutdownAt > now;
  return { ok: true, armed: isArmed(cur, now) || pending, ...cur };
}

function cancel() {
  const now = Date.now();
  const cur = readState();
  if (!cur) return { ok: true, armed: false, cancelled: false };
  const wasArmed = isArmed(cur, now);
  const pending = cur.phase === 'shutdown' && Number.isFinite(cur.shutdownAt) && cur.shutdownAt > now - 5_000;
  // The state goes first: a watcher between two polls sees a foreign pid and stops by itself.
  writeState({ ...cur, pid: 0, phase: 'cancelled', updatedAt: now, note: '' });
  if (wasArmed && cur.pid !== process.pid) try { process.kill(cur.pid); } catch { /* already gone */ }
  if (pending && process.platform === 'win32') abortShutdown();
  return { ok: true, armed: false, cancelled: wasArmed || pending, phase: 'cancelled' };
}

async function main(argv) {
  const cmd = argv[0];
  try {
    if (cmd === 'run') {
      await run({ capMin: argNum(argv, '--cap-min', CAP_MIN) });
      return 0;
    }
    const res = cmd === 'start' ? start(argv) : cmd === 'status' ? status() : cmd === 'cancel' ? cancel() : null;
    if (!res) {
      process.stderr.write('usage: bedtime-shutdown.js start [--cap-min N] | status | cancel\n');
      return 1;
    }
    process.stdout.write(`${JSON.stringify(res)}\n`);
    return res.ok ? 0 : 1;
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: String((e && e.message) || e) })}\n`);
    return 1;
  }
}

if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c));

module.exports = { step, run, isArmed, readState, writeState, statePath, start, status, cancel, QUIET_MS, AWAY_MS, STALE_MS, CAP_MIN, POLL_MS, LIVE_PHASES };

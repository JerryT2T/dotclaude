'use strict';
/**
 * @module hook-telemetry
 * @version 0.3.0
 * @plugin devops
 * @description Fail-safe hook telemetry. Silent hooks never show up in a
 *   transcript, so an audit of hook cost and timeouts was blind for them.
 *   Loaded by lib/plugin-guard.js (the first line of every hook) once the
 *   plugin is known to be enabled; costs two small appends (< 1 ms each).
 *
 *   File: ~/.claude/devops-hook-telemetry.jsonl (env DEVOPS_HOOK_TELEMETRY
 *   overrides the path; `off` disables). Rotated at 1 MB, one `.1` kept.
 *   Two records per run:
 *     start  {ts, id, hook, phase:'start'}
 *     end    {ts, id, hook, phase:'end', event, tool, ms, outcome, chars}
 *   outcome: ok (no output) | output (stdout written) | block (exit 2) |
 *   error (other non-zero exit). A start without an end = the process was
 *   killed (hook timeout). event/tool come from parseHookInput via note().
 *
 *   Dispatcher (hooks/dispatch/dispatch.js): every module runs in a worker
 *   thread of one process; its run id comes from the dispatcher
 *   (workerData.telemetryId) so pid-based ids cannot collide. The dispatcher
 *   writes a module's end record itself when it kills or skips the module:
 *     end    {…, phase:'end', outcome:'timeout'|'skipped', dispatched:true}
 *   killRates() counts both as killed runs. The dispatcher's own run is
 *   named `dispatch:<Event>` (setHook).
 *
 *   Daily rollup (memory beyond the 1 MB raw window, ~11 min on a busy
 *   machine): ~/.claude/devops-hook-telemetry-daily.json (next to the raw
 *   file: `<raw minus .jsonl>-daily.json`). Per UTC day × `hook|event|tool`:
 *   runs, outcome counts, chars sum, duration histogram (fixed log buckets,
 *   p50/p95 = bucket upper bound). 60 days kept, older pruned. It costs
 *   nothing per record: at rotation the winner of an atomic rename moves the
 *   raw file to `<raw>.fold-<random>`, then folds all pending fold files into
 *   the rollup under a lock file (`<rollup>.lock`, stale after 30 s) with
 *   merge-on-write (read, add, tmp+random-suffix rename). A busy lock leaves
 *   the fold file for the next rotation, so nothing is lost; folded file ids
 *   are remembered so a crash between merge and cleanup cannot double count.
 *   Read it with scripts/hook-telemetry-report.js (rollup + unfolded raw).
 *   `off` disables raw and rollup alike.
 *
 *   Never throws, never writes to stdout/stderr, never changes an exit code.
 *   Skipped under vitest unless the env path is set explicitly (tests of other
 *   hooks must not write the user's real file).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_BYTES = 1024 * 1024;
const DIR_EVENT = {
  'pre-tool-use': 'PreToolUse', 'post-tool-use': 'PostToolUse', 'session-start': 'SessionStart', stop: 'Stop',
  'user-prompt-submit': 'UserPromptSubmit', prompt: 'UserPromptSubmit',
};
const state = { on: false, id: null, hook: '', event: '', tool: '', t0: 0, chars: 0 };

function filePath() {
  const env = process.env.DEVOPS_HOOK_TELEMETRY;
  if (env && !/^(off|0|false)$/i.test(env)) return env;
  if (env) return null;
  if (process.env.VITEST) return null;
  return path.join(os.homedir(), '.claude', 'devops-hook-telemetry.jsonl');
}

/** Run id handed in by the dispatcher when this hook runs in its worker. */
function workerId() {
  try {
    const wt = require('worker_threads');
    if (!wt.isMainThread && wt.workerData && typeof wt.workerData.telemetryId === 'string') return wt.workerData.telemetryId;
  } catch { /* no worker_threads */ }
  return null;
}

function append(file, rec) {
  fs.appendFileSync(file, `${JSON.stringify(rec)}\n`);
}

const KEEP_DAYS = 60;
const LOCK_STALE_MS = 30000;
const BUCKETS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000]; // upper bounds, ms; +1 overflow
const OUTCOMES = ['ok', 'output', 'block', 'error', 'timeout', 'skipped'];

function rollupPath(file) {
  return `${file.replace(/\.jsonl$/, '')}-daily.json`;
}

function bucketOf(ms) {
  let i = 0;
  while (i < BUCKETS.length && ms > BUCKETS[i]) i++;
  return i;
}

/** Add the end records of raw `text` into `days` (mutates). Starts are ignored. */
function aggregateText(text, days) {
  for (const line of text.split('\n')) {
    if (!line || line.charCodeAt(0) !== 123) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r || r.phase !== 'end' || !r.hook || !(r.ts > 0)) continue;
    const day = new Date(r.ts).toISOString().slice(0, 10);
    const key = `${r.hook}|${r.event || ''}|${r.tool || ''}`;
    const d = days[day] || (days[day] = {});
    const e = d[key] || (d[key] = { runs: 0, chars: 0, out: {}, ms: new Array(BUCKETS.length + 1).fill(0) });
    e.runs++;
    e.chars += r.chars > 0 ? r.chars : 0;
    const o = OUTCOMES.includes(r.outcome) ? r.outcome : 'error';
    e.out[o] = (e.out[o] || 0) + 1;
    if (typeof r.ms === 'number' && r.ms >= 0) e.ms[bucketOf(r.ms)]++;
  }
  return days;
}

/** Merge rollup day maps: b into a (mutates a). */
function mergeDays(a, b) {
  for (const [day, keys] of Object.entries(b)) {
    const d = a[day] || (a[day] = {});
    for (const [key, e] of Object.entries(keys)) {
      const t = d[key] || (d[key] = { runs: 0, chars: 0, out: {}, ms: new Array(BUCKETS.length + 1).fill(0) });
      t.runs += e.runs || 0;
      t.chars += e.chars || 0;
      for (const [o, n] of Object.entries(e.out || {})) t.out[o] = (t.out[o] || 0) + n;
      (e.ms || []).forEach((n, i) => { if (i < t.ms.length) t.ms[i] += n; });
    }
  }
  return a;
}

/** Duration percentile (0..1) of a histogram, as the bucket's upper bound in ms. */
function percentile(hist, p) {
  const total = hist.reduce((s, n) => s + n, 0);
  if (!total) return null;
  const target = Math.max(1, Math.ceil(total * p));
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= target) return i < BUCKETS.length ? BUCKETS[i] : BUCKETS[BUCKETS.length - 1] * 2;
  }
  return null;
}

function loadRollup(file) {
  try {
    const j = JSON.parse(fs.readFileSync(rollupPath(file), 'utf8'));
    if (j && typeof j.days === 'object') return { v: 1, days: j.days, folded: Array.isArray(j.folded) ? j.folded : [] };
  } catch { /* none or unreadable: start fresh */ }
  return { v: 1, days: {}, folded: [] };
}

function withLock(lock, fn) {
  let fd;
  try {
    try { fd = fs.openSync(lock, 'wx'); } catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) { fs.unlinkSync(lock); fd = fs.openSync(lock, 'wx'); } } catch { /* lost the race */ }
    }
    if (fd === undefined) return false;
    fn();
    return true;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } try { fs.unlinkSync(lock); } catch { /* ignore */ } }
  }
}

/** Fold every pending `<file>.fold-*` into the rollup, then keep the newest as `.1`. */
function foldPending(file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  const pending = fs.readdirSync(dir).filter((n) => n.startsWith(`${base}.fold-`)).sort();
  if (!pending.length) return;
  const rp = rollupPath(file);
  withLock(`${rp}.lock`, () => {
    const roll = loadRollup(file);
    for (const name of pending) {
      const full = path.join(dir, name);
      let text;
      try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
      if (!roll.folded.includes(name)) {
        mergeDays(roll.days, aggregateText(text, {}));
        roll.folded.push(name);
      }
      try { fs.renameSync(full, `${file}.1`); } catch { try { fs.unlinkSync(full); } catch { /* ignore */ } }
    }
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
    for (const day of Object.keys(roll.days)) if (day < cutoff) delete roll.days[day];
    roll.folded = roll.folded.slice(-50);
    const tmp = `${rp}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(roll));
    try { fs.renameSync(tmp, rp); } catch (e) { try { fs.unlinkSync(tmp); } catch { /* ignore */ } throw e; }
  });
}

function rotateIfBig(file) {
  try {
    if (fs.statSync(file).size > MAX_BYTES) {
      // Atomic: exactly one of several racing processes wins the rename.
      fs.renameSync(file, `${file}.fold-${process.pid}-${Math.random().toString(36).slice(2, 10)}`);
    }
  } catch { /* none yet, or raced with a parallel hook */ }
  try { foldPending(file); } catch { /* fail-safe; the fold file stays for the next rotation */ }
}

function needsRotation(file) {
  try { return fs.statSync(file).size > MAX_BYTES; } catch { return false; }
}

/** Attach the payload's event and tool to this run's end record. */
function note(hook) {
  if (!state.on || !hook || typeof hook !== 'object') return;
  if (typeof hook.hook_event_name === 'string') state.event = hook.hook_event_name;
  if (typeof hook.tool_name === 'string') state.tool = hook.tool_name;
}

/** Rename this run's hook (the dispatcher: `dispatch:<Event>`). */
function setHook(name) {
  if (typeof name === 'string' && name) state.hook = name;
}

/**
 * Append one record on behalf of another run (the dispatcher's end record of
 * a module it killed or skipped). Fail-safe like everything here.
 */
function record(rec) {
  try {
    const file = filePath();
    if (!file || !rec || typeof rec !== 'object') return;
    append(file, { ts: Date.now(), ...rec });
  } catch { /* fail-safe */ }
}

function start() {
  if (state.on) return;
  try {
    const file = filePath();
    if (!file) return;
    state.hook = path.basename(process.argv[1] || 'unknown', '.js');
    const dir = path.basename(path.dirname(process.argv[1] || ''));
    state.event = DIR_EVENT[dir] || '';
    state.t0 = Date.now();
    state.id = workerId() || `${process.pid}-${state.t0.toString(36)}`;
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch { /* exists */ }
    if (needsRotation(file)) rotateIfBig(file);
    append(file, { ts: state.t0, id: state.id, hook: state.hook, phase: 'start' });
    state.on = true;
    const realWrite = process.stdout.write;
    process.stdout.write = function write(chunk, ...rest) {
      try { state.chars += typeof chunk === 'string' ? chunk.length : (chunk && chunk.length) || 0; } catch { /* count only */ }
      return realWrite.call(this, chunk, ...rest);
    };
    process.on('exit', (code) => {
      try {
        const c = code;
        const outcome = c === 2 ? 'block' : (c ? 'error' : (state.chars ? 'output' : 'ok'));
        append(file, {
          ts: Date.now(), id: state.id, hook: state.hook, phase: 'end', event: state.event, tool: state.tool,
          ms: Date.now() - state.t0, outcome, chars: state.chars,
        });
      } catch { /* telemetry never disturbs a hook */ }
    });
  } catch { /* fail-safe */ }
}

/**
 * Per-hook kill rate over each hook's last `window` runs.
 * A start with no end that is older than `graceMs` counts as killed.
 * @returns {Array<{hook:string, runs:number, killed:number, rate:number}>}
 */
function killRates(file, { window = 200, graceMs = 120000, now = Date.now(), tailBytes = 1024 * 1024 } = {}) {
  let text = '';
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r');
    try {
      const len = Math.min(size, tailBytes);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      text = buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return []; }
  const runs = new Map(); // id -> {hook, ts, ended}
  for (const line of text.split('\n')) {
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r || !r.id || !r.hook) continue;
    if (r.phase === 'start') runs.set(r.id, { hook: r.hook, ts: r.ts, ended: runs.has(r.id) && runs.get(r.id).ended });
    else if (r.phase === 'end') {
      const killed = r.outcome === 'timeout' || r.outcome === 'skipped';
      runs.set(r.id, { hook: r.hook, ts: (runs.get(r.id) || r).ts, ended: !killed, final: killed });
    }
  }
  const byHook = new Map();
  for (const run of [...runs.values()].sort((a, b) => a.ts - b.ts)) {
    if (!run.ended && !run.final && now - run.ts < graceMs) continue; // maybe still running
    if (!byHook.has(run.hook)) byHook.set(run.hook, []);
    byHook.get(run.hook).push(run);
  }
  const out = [];
  for (const [hook, list] of byHook) {
    const last = list.slice(-window);
    const killed = last.filter((r) => !r.ended).length;
    out.push({ hook, runs: last.length, killed, rate: killed / last.length });
  }
  return out;
}

module.exports = {
  start, note, setHook, record, killRates, filePath, MAX_BYTES,
  rollupPath, loadRollup, aggregateText, mergeDays, percentile, foldPending, BUCKETS, KEEP_DAYS,
};

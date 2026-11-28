'use strict';
/**
 * @module full-suite-lock
 * @version 1.0.0
 * @description Machine-wide lock: only ONE full test-suite run at a time per
 *   machine. Several Claude sessions starting `npm test` in parallel froze the
 *   PC (hundreds of short-lived git processes, 2026-11-22); the load governor
 *   only reacts once the storm runs. The second run is blocked by
 *   pre.test.fullguard (with holder + age), the first releases it in
 *   post.test.release.
 *
 *   State: `<governor home>/full-suite.lock` = {sessionId, toolUseId, cwd,
 *   startedAt, pid}. Plain fs, no process spawn. A hook runs as a short-lived
 *   child of the dispatcher, so `pid` is informational only; liveness is a
 *   lease: a holder older than LOCK_TTL_MS (crash, quit, never-released) is
 *   stale and taken over (isPulseStale). A run_in_background suite is not
 *   released by PostToolUse (the tool call returns at once); it keeps the lock
 *   until the lease expires.
 *   The same session may re-run (lock refreshed). Fails open on any fs error.
 */

const fs = require('fs');
const path = require('path');
const { isPulseStale } = require('./pulse-ttl');

const LOCK_TTL_MS = 30 * 60_000;

function lockFile() {
  const { paths } = require('../../scripts/governor/config');
  return path.join(paths().home, 'full-suite.lock');
}

function read(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * Try to take the lock.
 * @param {{sessionId?:string, toolUseId?:string, cwd?:string}} who
 * @param {{file?:string, now?:number}} [o]
 * @returns {{ok:true}|{ok:false, holder:object}}
 */
function acquire(who, o = {}) {
  const file = o.file || lockFile();
  const now = o.now || Date.now();
  const entry = { sessionId: who.sessionId || '', toolUseId: who.toolUseId || '', cwd: who.cwd || '', startedAt: now, pid: process.ppid };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try { fs.writeFileSync(file, JSON.stringify(entry), { flag: 'wx' }); return { ok: true }; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const cur = read(file);
    const own = cur && cur.sessionId && cur.sessionId === entry.sessionId;
    if (cur && !own && !isPulseStale(cur.startedAt, now, LOCK_TTL_MS)) return { ok: false, holder: cur };
    fs.writeFileSync(file, JSON.stringify(entry));
    return { ok: true };
  } catch { return { ok: true }; }
}

/** Release the lock when this tool call holds it. */
function release(who, o = {}) {
  const file = o.file || lockFile();
  try {
    const cur = read(file);
    if (!cur) return false;
    if (cur.sessionId !== (who.sessionId || '') || cur.toolUseId !== (who.toolUseId || '')) return false;
    fs.unlinkSync(file);
    return true;
  } catch { return false; }
}

/** Human message for a blocked run. */
function blockMessage(holder, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - holder.startedAt) / 60_000));
  const left = Math.max(1, Math.round((LOCK_TTL_MS - (now - holder.startedAt)) / 60_000));
  return `Another full test-suite run holds the machine lock: session ${holder.sessionId || '?'} in ${holder.cwd || '?'}, ` +
    `running for ~${mins} min (the lock expires in at most ~${left} min). Only one full run at a time per machine ` +
    '(parallel suites froze the PC). Wait and retry later, or run the tests of the files you touched: `npx vitest run <paths>`.';
}

module.exports = { LOCK_TTL_MS, lockFile, acquire, release, blockMessage };

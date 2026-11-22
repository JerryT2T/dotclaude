/**
 * @module stale-titles
 * @version 0.4.0
 * @description Finds sessions whose sidebar title still says ⏳ although no
 *   Claude process works on them any more — left behind when the Desktop app
 *   or Claude Code crashed or was quit mid-turn, so no Stop hook (F5) could
 *   swap the hourglass for `👉 ➜ ⚡ Interrupted ┃ `.
 *
 *   Source: the Desktop app keeps each session's current title in the sidecar
 *   `~/.claude/projects/<slug>/<sessionId>/custom-title.json`
 *   (`{"customTitle": …}`) — a few bytes, no transcript tail to read. A
 *   session id can sit under several slugs (it moved into a worktree); the
 *   newest sidecar wins. A candidate needs a ⏳ title (or a 👉 approval head:
 *   a crash mid-approval leaves the finger with nobody left to approve), a transcript idle for
 *   `idleMs`, and no live Claude process in the governor's session file. The
 *   caller's own session is never one. The hook only pre-filters: Claude
 *   still checks `isRunning:false` in list_sessions before renaming.
 *
 *   0.3.0 — concept offline: a concept title (`👉 ➜ 🧭 Concept ┃` waiting,
 *   `⏳ ➜ 🧭 Concept ┃` working) whose bridge server is gone becomes
 *   `🔴 ➜ 🧭 Concept ┃` — the page cannot reach Claude until the session is
 *   resumed (ss.concept.resume relaunches the bridge). The bridge counts as
 *   alive only when a registry entry (`~/.claude/concept-bridges/<port>.json`)
 *   for the session's worktree names a live pid that started after the last
 *   boot — Windows reuses pids, and after a reboot every entry is stale.
 *
 *   0.4.0 — limit stop: a ⏳ title whose transcript ends on Claude Code's
 *   "limit hit" record (lib/burn-state limitEvidence) becomes
 *   `🟦 ➜ 🔋 Limit ┃`, not Interrupted. Until then only the paused card set
 *   that title, so a session the limit cut mid-turn kept its ⏳ for good.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  STATUS, INTERRUPTED_PREFIX, LIMIT_PREFIX, CONCEPT_PREFIX, CONCEPT_WORKING_PREFIX, CONCEPT_OFFLINE_PREFIX,
  stripPrefixes, classify, startsWithPrefix, SUB_MARK,
} = require('./title-scheme');

const IDLE_MS = 2 * 60_000;
/** A live session idle this long with no open background work is treated as idle too (#964). */
const LIVE_IDLE_MS = 60 * 60_000;
const MAX_AGE_MS = 7 * 24 * 3_600_000;
/** How much of the transcript tail is read for the session's cwd. */
const CWD_TAIL_BYTES = 64 * 1024;

function mtime(p) {
  try { return fs.statSync(p).mtimeMs; } catch { return null; }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** True when the governor still tracks a live Claude process for `id`. */
function governorAlive(id, governorDir) {
  if (!governorDir) return false;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(governorDir, `${id}.json`), 'utf8'));
    return pidAlive(Number(s.claudePid));
  } catch { return false; }
}

/** True when the transcript shows no open background work (dev servers do not count). Unknown → false. */
function noOpenWork(transcript) {
  try {
    const { scanOpenTasksInFile } = require("./pending-tasks");
    return scanOpenTasksInFile(transcript).length === 0;
  } catch { return false; }
}

/** The title `title` becomes: Interrupted in front of its bare text, or null. */
function interruptedFor(title) {
  if (typeof title !== 'string') return null;
  if (!title.startsWith(STATUS.work) && classify(title) !== 'approval') return null;
  const rest = stripPrefixes(title).trim();
  return rest ? INTERRUPTED_PREFIX + rest : null;
}

/**
 * The title a session becomes whose turn a usage limit cut: `🟦 ➜ 🔋 Limit ┃`
 * in front of its bare text (a sub marker kept), or null. Entry rule as
 * interruptedFor — a limit stop runs no model turn, so no card could set this
 * title itself.
 */
function limitFor(title) {
  if (typeof title !== 'string') return null;
  // A linked side session carries `🔗 ` in front of its head; the limit cuts it like any other.
  const core = title.startsWith(SUB_MARK) ? title.slice(SUB_MARK.length).trimStart() : title;
  if (!core.startsWith(STATUS.work) && classify(core) !== 'approval') return null;
  const rest = stripPrefixes(core).trim();
  if (!rest) return null;
  return (core === title ? '' : SUB_MARK + ' ') + LIMIT_PREFIX + rest;
}

/** True when the transcript's newest answer is Claude Code's own "limit hit" record. */
function limitStopped(jsonl) {
  try { return require('./burn-state').limitEvidence(jsonl).limited === true; } catch { return false; }
}

/** True for a concept head that promises a live page (waiting or working). */
function isConceptTitle(title) {
  return typeof title === 'string'
    && (startsWithPrefix(title, CONCEPT_PREFIX) || startsWithPrefix(title, CONCEPT_WORKING_PREFIX));
}

/** The title a concept session with a dead bridge becomes, or null. */
function offlineFor(title) {
  if (!isConceptTitle(title)) return null;
  const rest = stripPrefixes(title).trim();
  return rest ? CONCEPT_OFFLINE_PREFIX + rest : null;
}

/** The last `cwd` a transcript recorded, or null. Reads only the tail. */
function transcriptCwd(jsonl) {
  let fd;
  try {
    fd = fs.openSync(jsonl, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, CWD_TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const text = buf.toString('utf8');
    const re = /"cwd":("(?:[^"\\]|\\.)*")/g;
    let last = null;
    for (let m = re.exec(text); m; m = re.exec(text)) last = m[1];
    return last ? JSON.parse(last) : null;
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* closed */ } }
}

function normPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * The roots a session's concept bridge can serve from: its cwd, and the
 * other checkout its concept watcher was launched for (#1090 — the pointer
 * post.concept.title leaves in the temp dir).
 *
 * @param {string} sessionId
 * @param {string} jsonl
 * @param {string} [tmpDir]
 * @returns {string[]}
 */
function conceptRoots(sessionId, jsonl, tmpDir = os.tmpdir()) {
  const roots = [];
  const cwd = transcriptCwd(jsonl);
  if (cwd) roots.push(cwd);
  try {
    const state = fs.readFileSync(path.join(tmpDir, `dotclaude-devops-concept-state-${sessionId}`), 'utf8').trim();
    if (state) roots.push(path.dirname(path.dirname(state)));
  } catch { /* no pointer */ }
  return roots;
}

/**
 * True when a concept bridge for one of `roots` is alive: a registry entry
 * for that worktree with a live pid that started after the last boot. No
 * root known → true (no evidence, keep the title).
 *
 * @param {string[]} roots
 * @param {{ registryDir?: string, bootMs?: number, isAlive?: (pid: number) => boolean }} [o]
 */
function bridgeAlive(roots, { registryDir, bootMs, isAlive = pidAlive } = {}) {
  if (!roots.length) return true;
  const dir = registryDir || process.env.CONCEPT_BRIDGE_REGISTRY_DIR || path.join(os.homedir(), '.claude', 'concept-bridges');
  const boot = Number.isFinite(bootMs) ? bootMs : Date.now() - os.uptime() * 1000;
  let names;
  try { names = fs.readdirSync(dir); } catch { return false; }
  const want = new Set(roots.map(normPath));
  for (const n of names) {
    if (!/^\d+\.json$/.test(n)) continue;
    let e;
    try { e = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch { continue; }
    if (!e || !want.has(normPath(e.worktree))) continue;
    const started = Date.parse(e.started_at);
    if (Number.isFinite(started) && started < boot) continue;
    if (isAlive(Number(e.pid))) return true;
  }
  return false;
}

/**
 * Stale ⏳ sessions under `root` (`~/.claude/projects`), and concept sessions
 * whose bridge is gone.
 *
 * @param {{ root?: string, governorDir?: string|null, selfId?: string,
 *   now?: number, idleMs?: number, seen?: Record<string, number>,
 *   bridge?: { registryDir?: string, bootMs?: number, tmpDir?: string,
 *     isAlive?: (pid: number) => boolean } }} [o]
 *   `seen` maps session id → transcript mtime already reported; an unchanged
 *   one is skipped so every session start does not repeat the sweep.
 * @returns {{ sessionId: string, title: string, next: string, mtimeMs: number }[]}
 */
function findStaleTitles({
  root = path.join(os.homedir(), '.claude', 'projects'),
  governorDir = path.join(os.homedir(), '.claude', 'governor', 'sessions'),
  selfId = '', now = Date.now(), idleMs = IDLE_MS, seen = {}, bridge = {},
} = {}) {
  const newest = new Map();
  let slugs;
  try { slugs = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  for (const slug of slugs) {
    if (!slug.isDirectory()) continue;
    let ids;
    try { ids = fs.readdirSync(path.join(root, slug.name), { withFileTypes: true }); } catch { continue; }
    for (const id of ids) {
      if (!id.isDirectory() || !/^[\w-]+$/.test(id.name) || id.name === selfId) continue;
      const sidecar = path.join(root, slug.name, id.name, 'custom-title.json');
      const sm = mtime(sidecar);
      if (sm === null || now - sm > MAX_AGE_MS) continue;
      const jsonl = path.join(root, slug.name, `${id.name}.jsonl`);
      const tm = mtime(jsonl) ?? sm;
      const prev = newest.get(id.name);
      if (!prev || sm > prev.sm) newest.set(id.name, { sidecar, sm, jsonl, tm: Math.max(tm, prev ? prev.tm : 0) });
      else prev.tm = Math.max(prev.tm, tm);
    }
  }
  const out = [];
  for (const [sessionId, { sidecar, tm, jsonl }] of newest) {
    if (now - tm < idleMs || seen[sessionId] === tm) continue;
    let title;
    try { title = JSON.parse(fs.readFileSync(sidecar, 'utf8')).customTitle; } catch { continue; }
    // A concept page whose bridge is gone cannot reach Claude: say so in red,
    // whether the page waited (👉) or Claude was working on it (⏳).
    const offline = offlineFor(title);
    if (offline && !bridgeAlive(conceptRoots(sessionId, jsonl, bridge.tmpDir), bridge)) {
      out.push({ sessionId, title, next: offline, mtimeMs: tm });
      continue;
    }
    const next = interruptedFor(title);
    // A usage limit ended the turn: the process is still there and waits, and
    // "Interrupted" would hide why. Say Limit, whether or not the process lives.
    const limit = limitFor(title);
    if (limit && limitStopped(jsonl)) {
      out.push({ sessionId, title, next: limit, mtimeMs: tm });
      continue;
    }
    if (!next) continue;
    // A live process normally keeps the title; only a long idle session whose
    // transcript holds no open work (a dev server does not count) is handed on.
    if (governorAlive(sessionId, governorDir) && (now - tm < LIVE_IDLE_MS || !noOpenWork(jsonl))) continue;
    out.push({ sessionId, title, next, mtimeMs: tm });
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

module.exports = { findStaleTitles, interruptedFor, limitFor, offlineFor, bridgeAlive, conceptRoots, transcriptCwd, IDLE_MS, LIVE_IDLE_MS };

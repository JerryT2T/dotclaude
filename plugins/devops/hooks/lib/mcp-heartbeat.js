/**
 * @module mcp-heartbeat
 * @version 0.6.0
 * @description Best-effort liveness probe for the plugin's MCP servers, read
 *   from the PID files each server writes on boot (mcp-server/lib/heartbeat.js).
 *
 *   Hooks cannot see Claude Code's client-side MCP connection state, so this
 *   is a proxy: a live PID means SOME session has the server up, no live PID
 *   means nobody does. The false-negative window is a server that is still
 *   booting; the false-positive is a neighbouring session's server. Both are
 *   acceptable for what this feeds — the ORDER of fallback instructions in the
 *   completion-card reminders (#371) and pre.mcp.health's dead-server block.
 *
 *   Every server process writes its own `dotclaude-mcp-<name>-<pid>.pid`. The
 *   legacy single `dotclaude-mcp-<name>.pid` (one slot shared by every
 *   session, deleted by whichever server exited first → false "dead") is still
 *   read for one release, so a server of an older install counts too.
 *
 *   AUD-C043: servers >= heartbeat.js 0.3.0 write into the subdir
 *   `<tmp>/dotclaude-mcp-heartbeats/` (small, pruned by each server on
 *   start). That dir and the legacy single file are read first; the flat
 *   per-process layout in TEMP itself (one readdir of ~146 k entries) is
 *   only scanned when neither names a live process — kept for one release.
 *   isMcpServerAlive() stops at the first live PID.
 *
 *   Single reader for all hooks: mcp-status.js and pre.mcp.health.js delegate here.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const PREFIX = 'dotclaude-mcp-';
/** Twin of mcp-server/lib/heartbeat.js HEARTBEAT_DIR. */
const HEARTBEAT_DIR = 'dotclaude-mcp-heartbeats';

/** The legacy single PID file (pre-0.194.2 servers). */
function pidFileFor(serverName) {
  return path.join(os.tmpdir(), `${PREFIX}${serverName}.pid`);
}

/** One server process's own PID file (the subdir layout, heartbeat.js >= 0.3.0). */
function processPidFileFor(serverName, pid) {
  return path.join(os.tmpdir(), HEARTBEAT_DIR, `${serverName}-${pid}.pid`);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0); // signal 0 = existence check, no kill
    return true;
  } catch (err) {
    // EPERM = process exists but we lack permission → alive
    return !!err && err.code === 'EPERM';
  }
}


/** `<head><digits>.pid` → true (plain string checks: names may hold dots). */
function matchesPidFile(fileName, head) {
  if (!fileName.startsWith(head) || !fileName.endsWith('.pid')) return false;
  const digits = fileName.slice(head.length, -4);
  return digits.length > 0 && /^[0-9]+$/.test(digits);
}

function readEntry(file, legacy) {
  try {
    const lines = fs.readFileSync(file, 'utf8').trim().split(/\s+/);
    const pid = parseInt(lines[0], 10);
    const ppid = parseInt(lines[1], 10);
    return { file, pid: pid > 0 ? pid : null, ppid: ppid > 0 ? ppid : null, mtimeMs: fs.statSync(file).mtimeMs, legacy };
  } catch { return null; /* vanished between readdir and read */ }
}

function listPidFiles(folder, head) {
  let names = [];
  try { names = fs.readdirSync(folder); } catch { return []; }
  return names.filter((n) => matchesPidFile(n, head)).map((n) => path.join(folder, n));
}

/**
 * Heartbeat files of a server in scan order: the subdir, the legacy single
 * file, and — only when `opts.stopAtLive` found nothing live in those, or
 * always without it — the flat pre-0.3.0 per-process files in TEMP.
 * @param {string} serverName
 * @param {{ stopAtLive?: boolean }} [opts] stop after the first live entry
 * @returns {Array<{ file: string, pid: number|null, mtimeMs: number, legacy: boolean }>}
 */
function heartbeats(serverName, opts = {}) {
  const dir = os.tmpdir();
  const out = [];
  let live = false;
  const take = (file, legacy) => {
    const e = readEntry(file, legacy);
    if (!e) return false;
    out.push(e);
    if (e.pid && isProcessAlive(e.pid)) live = true;
    return live && opts.stopAtLive;
  };
  for (const f of listPidFiles(path.join(dir, HEARTBEAT_DIR), `${serverName}-`)) {
    if (take(f, false)) return out;
  }
  if (fs.existsSync(pidFileFor(serverName)) && take(pidFileFor(serverName), true)) return out;
  if (live) return out; // the subdir answered — skip the expensive TEMP scan
  for (const f of listPidFiles(dir, `${PREFIX}${serverName}-`)) {
    if (take(f, false)) return out;
  }
  return out;
}

/**
 * @param {string} serverName
 * @returns {{ alive: number[], dead: Array<{ file: string, pid: number|null, legacy: boolean, mtimeMs: number }>, latestLiveMtimeMs: number, any: boolean }}
 */
function heartbeatState(serverName, opts) {
  const all = heartbeats(serverName, opts);
  const alive = [];
  const dead = [];
  let latestLiveMtimeMs = 0;
  for (const h of all) {
    if (h.pid && isProcessAlive(h.pid)) {
      if (!alive.includes(h.pid)) alive.push(h.pid);
      latestLiveMtimeMs = Math.max(latestLiveMtimeMs, h.mtimeMs);
    } else {
      dead.push({ file: h.file, pid: h.pid, legacy: h.legacy, mtimeMs: h.mtimeMs });
    }
  }
  return { alive, dead, latestLiveMtimeMs, any: all.length > 0 };
}

/**
 * @param {string} serverName — e.g. 'dotclaude'
 * @returns {boolean} true when any heartbeat file names a process that answers.
 *  
 */
function isMcpServerAlive(serverName) {
  const live = (name) => heartbeats(name, { stopAtLive: true }).some((h) => h.pid && isProcessAlive(h.pid));
  return live(serverName);
}

/**
 * Per session: is a live server THIS session's own? A server records its
 * parent (the Claude Code process) in its heartbeat; a hook shares that
 * parent. Another session's live server no longer vouches for this one — a
 * session whose own server never connected then gets the offline ladder.
 * Entries without a recorded parent (older servers, the legacy file) cannot
 * be attributed: they count machine-wide, as before. Without a usable own
 * parent the check is machine-wide too.
 * The own parent is CLAUDE_PID, never process.ppid: hooks run through a
 * shell wrapper (`bash -c "… node dispatch.js"`), so a hook's ppid is that
 * shell, while the server's parent is Claude Code itself.
 * @param {string} serverName
 * @param {{ ppid?: number }} [opts] the session's Claude Code pid (default env CLAUDE_PID)
 */
function isMcpServerAliveForSession(serverName, opts = {}) {
  return tracedSessionLiveness(serverName, opts).alive;
}

/** sessionLiveness() that also records a foreign-only verdict (unless `opts.trace === false`). */
function tracedSessionLiveness(serverName, opts = {}) {
  const detail = sessionLiveness(serverName, opts);
  if (detail.verdict === 'foreign-only' && opts.trace !== false) traceForeignOnly(serverName, detail);
  return detail;
}

/**
 * What a card reminder needs: false = this session's server answers, true = no
 * server answers, 'foreign' = servers answer but none is attributed to this
 * session — the tool may still be connected, so the reminder says to look.
 * @returns {false|true|'foreign'}
 */
function completionMcpDown(serverName = SERVER_NAME, opts = {}) {
  const detail = tracedSessionLiveness(serverName, opts);
  if (detail.alive) return false;
  return detail.verdict === 'foreign-only' ? 'foreign' : true;
}

/**
 * The per-session answer with its evidence. `foreign-only` is the one verdict
 * that can be wrong in both directions: live servers exist, every one names a
 * parent other than this session's. In an ordinary Desktop session that is a
 * neighbour's server (correctly "not mine"); in a session started another way
 * (a Remote Control project thread) the server's parent and CLAUDE_PID may
 * simply differ while the tools are connected. Callers word their reminder by
 * the verdict instead of claiming "dead".
 * @param {string} serverName
 * @param {{ ppid?: number }} [opts] the session's Claude Code pid (default env CLAUDE_PID)
 * @returns {{ alive: boolean, verdict: 'own'|'unattributed'|'machine-wide'|'foreign-only'|'none', own: number|null, servers: Array<{ pid: number, ppid: number|null }> }}
 */
function sessionLiveness(serverName, opts = {}) {
  const own = opts.ppid === undefined ? parseInt(process.env.CLAUDE_PID, 10) : opts.ppid;
  if (!(own > 1)) {
    const alive = isMcpServerAlive(serverName);
    return { alive, verdict: alive ? 'machine-wide' : 'none', own: null, servers: [] };
  }
  const all = heartbeats(serverName).filter((h) => h.pid && isProcessAlive(h.pid));
  // A current server also writes the shared legacy file (pid only): it is the
  // same server as its per-process entry, not an unattributable one.
  const perProcess = new Set(all.filter((h) => !h.legacy).map((h) => h.pid));
  const live = all.filter((h) => !(h.legacy && perProcess.has(h.pid)));
  const servers = live.map((h) => ({ pid: h.pid, ppid: h.ppid }));
  if (live.length === 0) return { alive: false, verdict: 'none', own, servers };
  if (live.some((h) => h.ppid === own)) return { alive: true, verdict: 'own', own, servers };
  if (live.some((h) => !h.ppid)) return { alive: true, verdict: 'unattributed', own, servers };
  return { alive: false, verdict: 'foreign-only', own, servers };
}

/** Where `foreign-only` verdicts are recorded (one line per distinct picture). */
function livenessLogFile() {
  return path.join(os.tmpdir(), HEARTBEAT_DIR, 'liveness.log');
}

const LIVENESS_LOG_MAX_LINES = 200;

/**
 * Record a `foreign-only` verdict: CLAUDE_PID next to every live server's
 * parent, plus what tells a project thread or cloud session apart. The line is
 * the evidence a later check needs to decide whether the per-session match
 * misreads a session kind; without it the mismatch leaves no trace at all.
 * A picture identical to the last recorded one is not written again.
 * Best-effort: a failed write never reaches the hook.
 */
function traceForeignOnly(serverName, detail) {
  try {
    const signature = `server=${serverName} own=${detail.own} servers=${detail.servers.map((s) => `${s.pid}:${s.ppid}`).sort().join(',')}`;
    const kind = [
      process.env.CLAUDE_CODE_ENTRYPOINT ? `entrypoint=${process.env.CLAUDE_CODE_ENTRYPOINT}` : '',
      process.env.CLAUDE_CODE_REMOTE ? 'remote=1' : '',
      process.env.CLAUDE_CODE_SESSION_ID ? `session=${process.env.CLAUDE_CODE_SESSION_ID}` : '',
    ].filter(Boolean).join(' ');
    const file = livenessLogFile();
    let lines = [];
    try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch { /* first record */ }
    const last = lines[lines.length - 1] || '';
    if (last.includes(signature)) return;
    lines.push(`${new Date().toISOString()} foreign-only ${signature}${kind ? ` ${kind}` : ''}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${lines.slice(-LIVENESS_LOG_MAX_LINES).join('\n')}\n`);
  } catch { /* diagnostics only */ }
}

/** The one devops MCP server (mcp-server/index.js, .mcp.json key). */
const SERVER_NAME = 'dotclaude';

module.exports = {
  PREFIX, HEARTBEAT_DIR, SERVER_NAME, pidFileFor, processPidFileFor, isProcessAlive,
  heartbeats, heartbeatState, isMcpServerAlive, isMcpServerAliveForSession,
  sessionLiveness, tracedSessionLiveness, completionMcpDown, livenessLogFile,
};

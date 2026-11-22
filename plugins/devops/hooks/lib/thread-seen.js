'use strict';
/**
 * @module thread-seen
 * @version 0.2.0
 * @plugin devops
 * @description "A Claude Project thread ran on this machine" — a persisted
 *   marker, so the cloud-copy lag is judged by whether cloud threads exist, not
 *   by this session's own channel.
 *
 *   The live signal is lib/project-thread.js: every thread session leaves a
 *   `dotclaude-devops-project-thread-<session>` flag in the tmp dir. That flag
 *   dies with the next reboot or tmp cleanup, so `recordThreadSeen` copies it
 *   into `~/.claude/devops-thread-seen.json` (written by ss.project.setup at
 *   every session start, and by anything that knows better — pass `force`).
 *   `threadSeen` only reads that file: no tmp scan, hermetic in tests.
 *
 *   The same file records which Claude Projects (`chan_…` ids) already got the
 *   one-time setup hint (`projects`: id → ISO time, `projectHinted` /
 *   `markProjectHinted`); `recordThreadSeen` keeps that map when it rewrites.
 *
 *   Pure fs, no dependencies — desktop-copy.js and cloud-update.js both read it.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE = 'devops-thread-seen.json';
/** Same prefix as THREAD_FLAG in lib/project-thread.js. */
const FLAG_PREFIX = 'dotclaude-devops-project-thread-';

const stateFile = (home) => path.join(home, '.claude', FILE);

/** Is a thread flag of any session in `tmpDir`? */
function liveFlag(tmpDir) {
  try {
    return fs.readdirSync(tmpDir).some((n) => n.startsWith(FLAG_PREFIX) && !n.endsWith('.tmp'));
  } catch {
    return false;
  }
}

/** The persisted marker, or null. */
function readMarker(home = os.homedir()) {
  try {
    const m = JSON.parse(fs.readFileSync(stateFile(home), 'utf8'));
    return m && typeof m.firstSeen === 'string' ? m : null;
  } catch {
    return null;
  }
}

/** Did a thread ever run on this machine (per the persisted marker)? */
function threadSeen(home = os.homedir()) {
  return readMarker(home) !== null;
}

/**
 * Persist the marker when a thread flag is live (or `force`). Writes only the
 * first time and when `lastSeen` is a day old — a session start must stay cheap.
 * @returns {boolean} whether a thread is known on this machine afterwards
 */
function recordThreadSeen({ home = os.homedir(), tmpDir = os.tmpdir(), now = Date.now(), force = false } = {}) {
  const known = readMarker(home);
  if (!force && !liveFlag(tmpDir)) return known !== null;
  const iso = new Date(now).toISOString();
  if (known && now - Date.parse(known.lastSeen || known.firstSeen) < 24 * 60 * 60 * 1000) return true;
  try {
    fs.mkdirSync(path.dirname(stateFile(home)), { recursive: true });
    fs.writeFileSync(stateFile(home), JSON.stringify({ ...(known || {}), firstSeen: known ? known.firstSeen : iso, lastSeen: iso }) + '\n');
  } catch { /* advisory: the next session tries again */ }
  return true;
}

/** Did this project already get the setup hint? */
function projectHinted(id, home = os.homedir()) {
  const m = readMarker(home);
  return !!(id && m && m.projects && typeof m.projects === 'object' && Object.prototype.hasOwnProperty.call(m.projects, id));
}

/**
 * Record `id` as hinted (keeps everything else in the file; creates the marker when absent).
 * @returns {boolean} whether the record was written
 */
function markProjectHinted(id, { home = os.homedir(), now = Date.now() } = {}) {
  if (!id) return false;
  const iso = new Date(now).toISOString();
  const known = readMarker(home) || { firstSeen: iso, lastSeen: iso };
  const projects = known.projects && typeof known.projects === 'object' ? known.projects : {};
  try {
    fs.mkdirSync(path.dirname(stateFile(home)), { recursive: true });
    fs.writeFileSync(stateFile(home), JSON.stringify({ ...known, projects: { ...projects, [id]: iso } }) + '\n');
    return true;
  } catch { return false; }
}

module.exports = { FILE, FLAG_PREFIX, readMarker, threadSeen, recordThreadSeen, liveFlag, projectHinted, markProjectHinted };

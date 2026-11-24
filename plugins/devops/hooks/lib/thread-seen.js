'use strict';
/**
 * @module thread-seen
 * @version 0.5.0
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
 *   `markProjectHinted`). A second sibling map, `blockChecked` (id →
 *   `<value>@v<N>`), records for which location value and block version the
 *   "Where threads run" check was last asked of a project. The Desktop Home
 *   reads a third, `projectNames` (id → string). The wake envelope carries no
 *   name, so `setProjectName` records the folder a thread first works in
 *   (prompt.thread.notices) or the name the user gives
 *   (`scripts/thread-location.js name`). `recordThreadSeen` rewrites the file as
 *   `{...known, …}` and so keeps every sibling map.
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

/**
 * Write the marker in one step (temp file + rename): several thread sessions
 * write this file, and a torn one would read as "no thread ever ran".
 */
function save(home, data) {
  const file = stateFile(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Random part on purpose: a pid-only name makes this file a "pid-tmp writer" (dispatch/lanes.js), and every
  // hook that can reach project-thread.js would then share one sequential lane.
  const tmp = `${file}.${process.pid}.${require('crypto').randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data) + '\n');
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ }
    throw e;
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
    save(home, { ...(known || {}), firstSeen: known ? known.firstSeen : iso, lastSeen: iso });
  } catch { /* advisory: the next session tries again */ }
  return true;
}

/**
 * The `<value>@v<N>` the location-block check was last emitted for in this project, or null.
 * @returns {string|null}
 */
function blockChecked(id, home = os.homedir()) {
  const m = readMarker(home);
  const v = id && m && m.blockChecked && typeof m.blockChecked === 'object' ? m.blockChecked[id] : undefined;
  return typeof v === 'string' ? v : null;
}

/**
 * Record that the location-block check for `id` was emitted for `stamp` (`<value>@v<N>`).
 * Keeps every other field and sibling map.
 * @returns {boolean} whether the record was written
 */
function markBlockChecked(id, stamp, { home = os.homedir(), now = Date.now() } = {}) {
  if (!id || !stamp) return false;
  const iso = new Date(now).toISOString();
  const known = readMarker(home) || { firstSeen: iso, lastSeen: iso };
  const map = known.blockChecked && typeof known.blockChecked === 'object' ? known.blockChecked : {};
  try {
    save(home, { ...known, blockChecked: { ...map, [id]: stamp } });
    return true;
  } catch { return false; }
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
    save(home, { ...known, projects: { ...projects, [id]: iso } });
    return true;
  } catch { return false; }
}

/** A display name: one line, no control characters, at most NAME_MAX characters. */
const NAME_MAX = 40;
function cleanName(name) {
  // eslint-disable-next-line no-control-regex
  return String(name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** The display name recorded for a project (`projectNames`: id → string), or ''. */
function projectName(id, home = os.homedir()) {
  const m = readMarker(home);
  const v = id && m && m.projectNames && typeof m.projectNames === 'object' ? m.projectNames[id] : undefined;
  return typeof v === 'string' ? v : '';
}

/**
 * Record a display name for a project. The wake envelope carries only the id,
 * so the name comes from the folder a thread works in (`overwrite: false`, the
 * first one stays) or from the user (`scripts/thread-location.js name`).
 * Keeps every other field and sibling map.
 * @returns {boolean} whether the record was written
 */
function setProjectName(id, name, { home = os.homedir(), now = Date.now(), overwrite = true } = {}) {
  const clean = cleanName(name);
  if (!id || !clean) return false;
  const iso = new Date(now).toISOString();
  const known = readMarker(home) || { firstSeen: iso, lastSeen: iso };
  const map = known.projectNames && typeof known.projectNames === 'object' ? known.projectNames : {};
  if (!overwrite && typeof map[id] === 'string' && map[id]) return false;
  if (map[id] === clean) return true;
  try {
    save(home, { ...known, projectNames: { ...map, [id]: clean } });
    return true;
  } catch { return false; }
}

module.exports = { FILE, FLAG_PREFIX, NAME_MAX, readMarker, threadSeen, recordThreadSeen, liveFlag, projectHinted, markProjectHinted, blockChecked, markBlockChecked, projectName, setProjectName };

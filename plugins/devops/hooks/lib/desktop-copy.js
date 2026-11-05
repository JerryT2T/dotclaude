/**
 * Desktop plugin copy lag check.
 *
 * The Claude Desktop app (Code tab) does not load plugins from
 * ~/.claude/plugins/cache — it loads the copy its claude.ai account marketplace
 * synced into <Claude-Data>/rpm/<org>/<user>/plugin_<id>/. ss.plugin.update
 * keeps only the CLI cache current, so a Desktop copy can sit on an old version
 * for days with no warning (observed 2026-10-30: Desktop on 0.326.0 while the
 * CLI cache and alpha were on 0.334.1 — 28 of the last 30 changes missing).
 *
 * The claude.ai sync itself cannot be triggered from a hook, but the files on
 * this machine can be replaced: mirrorToRpm copies the local install over the
 * rpm copy. The app re-downloads only when the server reports a newer updatedAt
 * than the sibling manifest.json (remote_newer in app.asar, checked with app
 * 4.16336, verified by a new session loading the mirrored version 2026-11-05),
 * so a mirrored copy stays until the next real sync. The mirror overwrites the
 * version the account copy really has, so a marker file remembers it for the
 * one-line version notice (versionNotice).
 *
 * Mirrored files reach sessions already running: their next hook runs the new
 * file while their MCP server keeps the old code until it restarts.
 *
 * A machine with only the account copy has no clone to compare with:
 * remoteCopyLag takes the latest version from the caller instead
 * (hooks/session-start/ss.catalog.remote.js reads it from GitHub).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { compareVersions } = require('./channels');
const { getVersion } = require('./cache-rebuild');

const RPM_DIR = /[\\/]rpm[\\/][^\\/]+[\\/][^\\/]+[\\/]plugin_[^\\/]+[\\/]?$/i;

function isRpmCopy(pluginRoot) {
  return RPM_DIR.test(String(pluginRoot || ''));
}

/** marketplaceName of the rpm entry for this plugin dir, from its sibling manifest.json. */
function rpmMarketplace(pluginRoot) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(pluginRoot), 'manifest.json'), 'utf8'));
    const id = path.basename(pluginRoot);
    const entry = (manifest.plugins || []).find((p) => p.id === id);
    return entry ? { marketplace: entry.marketplaceName || null, updatedAt: entry.updatedAt || null } : null;
  } catch {
    return null;
  }
}

/** Plugin dir inside a marketplace clone: plugins/<name>, else a root-level plugin. */
function clonePluginDir(marketplacesDir, marketplace, pluginName) {
  const mDir = path.join(marketplacesDir, marketplace);
  const nested = path.join(mDir, 'plugins', pluginName);
  if (fs.existsSync(path.join(nested, '.claude-plugin', 'plugin.json'))) return nested;
  if (fs.existsSync(path.join(mDir, '.claude-plugin', 'plugin.json'))) return mDir;
  return null;
}

/**
 * @returns {null | { name, running, latest, marketplace, updatedAt }}
 *   null when the running copy is not an rpm copy, cannot be matched to a
 *   local marketplace clone, or is not behind it.
 */
function desktopCopyLag({ pluginRoot, marketplacesDir }) {
  if (!isRpmCopy(pluginRoot)) return null;
  const running = getVersion(pluginRoot);
  if (!running) return null;
  let name;
  try {
    name = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).name;
  } catch {
    return null;
  }
  const rpm = rpmMarketplace(pluginRoot);
  if (!name || !rpm || !rpm.marketplace) return null;
  const cloneDir = clonePluginDir(marketplacesDir, rpm.marketplace, name);
  const latest = cloneDir && getVersion(cloneDir);
  if (!latest || compareVersions(running, latest) >= 0) return null;
  return { name, running, latest, marketplace: rpm.marketplace, updatedAt: rpm.updatedAt };
}

/**
 * Same verdict as desktopCopyLag, against a version the caller fetched.
 * @returns {null | { name, running, latest, marketplace, updatedAt }}
 *   null when the running copy is not an rpm copy, has no manifest entry, or is
 *   not behind `latest`.
 */
function remoteCopyLag({ pluginRoot, latest }) {
  if (!isRpmCopy(pluginRoot) || !/^\d+\.\d+\.\d+/.test(String(latest || ''))) return null;
  const running = getVersion(pluginRoot);
  if (!running) return null;
  let name;
  try {
    name = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).name;
  } catch {
    return null;
  }
  const rpm = rpmMarketplace(pluginRoot);
  if (!name || !rpm || !rpm.marketplace || compareVersions(running, latest) >= 0) return null;
  return { name, running, latest, marketplace: rpm.marketplace, updatedAt: rpm.updatedAt };
}

/**
 * The newest user-scope devops entry of installed_plugins.json: the Claude Code
 * install the channel pin updates. Dev clones (`..clone`) do not count.
 * @returns {null | { version, channel, installPath, marketplace }}
 */
function localInstall(home = os.homedir()) {
  try {
    const file = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
    const plugins = JSON.parse(fs.readFileSync(file, 'utf8')).plugins || {};
    let best = null;
    let marketplace = null;
    for (const [key, entries] of Object.entries(plugins)) {
      if (!/^devops@/.test(key) || key.includes('..clone') || !Array.isArray(entries)) continue;
      for (const e of entries) {
        if (!e || e.scope !== 'user' || !/^v?\d+\.\d+\.\d+/.test(String(e.version))) continue;
        if (!best || String(e.lastUpdated || '') > String(best.lastUpdated || '')) {
          best = e;
          marketplace = key.slice('devops@'.length);
        }
      }
    }
    return best
      ? { version: String(best.version).replace(/^v/, ''), channel: best.channel || null, installPath: best.installPath || null, marketplace }
      : null;
  } catch {
    return null;
  }
}

function markerFile(home) {
  return path.join(home, '.claude', 'plugins', '.desktop-mirror.json');
}

function readMarker(home) {
  try { return JSON.parse(fs.readFileSync(markerFile(home), 'utf8')); } catch { return null; }
}

/**
 * The version the claude.ai account copy really has, or null when unknown.
 * A marker counts until the manifest's updatedAt moves: that is a real sync,
 * which replaced the mirrored files, so the rpm copy's own version is true again.
 */
function cloudVersion({ pluginRoot, home = os.homedir() }) {
  const marker = readMarker(home);
  const rpmRoot = isRpmCopy(pluginRoot) ? pluginRoot : marker && marker.rpmRoot;
  if (!rpmRoot) return null;
  const rpm = rpmMarketplace(rpmRoot);
  if (!rpm) return null;
  if (marker && marker.rpmRoot === rpmRoot && marker.updatedAt === rpm.updatedAt) return marker.cloudVersion || null;
  return isRpmCopy(pluginRoot) ? getVersion(rpmRoot) : null;
}

const MIRROR_SKIP = new Set(['node_modules', '.git']);

/** Relative paths of the regular files below dir; node_modules and .git stay out. */
function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (MIRROR_SKIP.has(entry.name)) continue;
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function removeEmptyDirs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || MIRROR_SKIP.has(entry.name)) continue;
    const sub = path.join(dir, entry.name);
    removeEmptyDirs(sub);
    if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub);
  }
}

const MIRROR_LOCK_STALE_MS = 5 * 60 * 1000;

function takeMirrorLock(lockDir, now) {
  try {
    fs.mkdirSync(lockDir);
    return true;
  } catch {
    try {
      if (now - fs.statSync(lockDir).mtimeMs < MIRROR_LOCK_STALE_MS) return false;
      fs.rmSync(lockDir, { recursive: true, force: true });
      fs.mkdirSync(lockDir);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Copy the local install over an older rpm copy. plugin.json goes last, so an
 * interrupted run still reads as behind and the next session finishes the job.
 * mcp-server/node_modules stays: the install has none, the copy's is a junction.
 * @returns {null | { ok: true, from, to } | { ok: false, from, to, reason }}
 *   null when there is nothing to do or another session is on it.
 */
function mirrorToRpm({ pluginRoot, home = os.homedir(), now = Date.now(), lockDir = path.join(os.tmpdir(), 'dotclaude-desktop-mirror.lock') }) {
  if (!isRpmCopy(pluginRoot)) return null;
  const inst = localInstall(home);
  const running = getVersion(pluginRoot);
  const rpm = rpmMarketplace(pluginRoot);
  if (!inst || !inst.installPath || !running || !rpm) return null;
  if (inst.marketplace !== rpm.marketplace || compareVersions(inst.version, running) <= 0) return null;
  const result = { from: running, to: inst.version };
  if (getVersion(inst.installPath) !== inst.version) return { ...result, ok: false, reason: `install dir holds no ${inst.version}` };
  if (!takeMirrorLock(lockDir, now)) return null;
  try {
    const cloud = cloudVersion({ pluginRoot, home }) || running;
    fs.writeFileSync(markerFile(home), JSON.stringify({ rpmRoot: pluginRoot, updatedAt: rpm.updatedAt, cloudVersion: cloud, mirrored: inst.version }));
    const manifest = path.join('.claude-plugin', 'plugin.json');
    const files = listFiles(inst.installPath);
    const wanted = new Set(files);
    for (const rel of files) {
      if (rel === manifest) continue;
      const src = fs.readFileSync(path.join(inst.installPath, rel));
      const dst = path.join(pluginRoot, rel);
      let same = false;
      try { same = src.equals(fs.readFileSync(dst)); } catch { /* new file */ }
      if (same) continue;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, src);
    }
    for (const rel of listFiles(pluginRoot)) {
      if (!wanted.has(rel)) fs.rmSync(path.join(pluginRoot, rel), { force: true });
    }
    removeEmptyDirs(pluginRoot);
    fs.copyFileSync(path.join(inst.installPath, manifest), path.join(pluginRoot, manifest));
    return { ...result, ok: true };
  } catch (e) {
    return { ...result, ok: false, reason: e.message };
  } finally {
    try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* goes stale */ }
  }
}

const CLOUD_PROMPT = { de: 'Cloud updaten', en: 'update cloud' };

/**
 * The one version line of a CLI or Desktop session, or null when the local
 * install and the account copy agree. Always lokal first, then Cloud.
 * A cloud session has no local install: ss.catalog.remote speaks there.
 */
function versionNotice({ pluginRoot, home = os.homedir(), lang = 'de' }) {
  const en = lang === 'en';
  const inst = localInstall(home);
  if (!inst) return null;
  const desktop = isRpmCopy(pluginRoot);
  const cloud = cloudVersion({ pluginRoot, home });
  if (!cloud || compareVersions(cloud, inst.version) >= 0) return null;
  const channel = inst.channel ? ` (${inst.channel})` : '';
  const local = en ? `local ${inst.version}${channel} current` : `lokal ${inst.version}${channel} aktuell`;
  const arrow = en ? `→ "${CLOUD_PROMPT.en}"` : `→ „${CLOUD_PROMPT.de}“`;
  const running = desktop ? getVersion(pluginRoot) : null;
  if (running && compareVersions(running, inst.version) < 0) {
    return en
      ? `ℹ devops: ${local}, Desktop catches up next session · update Cloud ${cloud} ${arrow}`
      : `ℹ devops: ${local}, Desktop zieht ab der nächsten Session nach · Cloud ${cloud} updaten ${arrow}`;
  }
  const note = desktop ? (en ? ' (Desktop already runs local)' : ' (Desktop nutzt schon lokal)') : '';
  return en
    ? `ℹ devops: ${local} · update Cloud ${cloud}${note}, not urgent ${arrow}`
    : `ℹ devops: ${local} · Cloud ${cloud} updaten${note}, unkritisch ${arrow}`;
}

module.exports = { isRpmCopy, desktopCopyLag, remoteCopyLag, localInstall, cloudVersion, mirrorToRpm, versionNotice, CLOUD_PROMPT };

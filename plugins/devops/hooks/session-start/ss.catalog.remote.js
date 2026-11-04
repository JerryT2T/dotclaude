#!/usr/bin/env node
/**
 * @hook ss.catalog.remote
 * @version 0.1.0
 * @event SessionStart
 * @plugin devops
 * @description Warns when the Desktop app's claude.ai account copy of devops
 *   trails GitHub `main`, also on a machine without a local install.
 *
 *   ss.plugin.update and ss.project.setup compare the account copy with a local
 *   clone or install, so a user who only has the account copy never hears about
 *   a stale one. The account copy tracks `main` with no channels, so this hook
 *   compares with `main`'s manifest. It stays silent when a local check already
 *   warned, so one state never gets two notices from this pair.
 *
 *   The fetch runs off the critical path (lib/deferred-results); the notice is
 *   delivered with the next user prompt. The fetched version is cached for 6 h,
 *   and the notice repeats every session until the copy catches up. A failed
 *   fetch or an unusable reply stays silent and caches nothing. `--force` (the
 *   auto-update skill) runs inline and skips the cached version.
 *
 *   The hook cannot trigger the sync: see deep-knowledge/claude-desktop-app-setup.md
 *   § Account copy of a plugin.
 */

require('../lib/plugin-guard');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isRpmCopy, desktopCopyLag, remoteCopyLag } = require('../lib/desktop-copy');
const { catalogShadowWarning } = require('./ss.project.setup');

const MANIFEST_URL = 'https://raw.githubusercontent.com/Jerry0022/dotclaude/main/plugins/devops/.claude-plugin/plugin.json';
const MARKETPLACE = 'dotclaude';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

const defaultCacheFile = () => path.join(os.tmpdir(), 'dotclaude-devops-catalog-latest.json');

/** The version in a manifest reply; null unless it is a plain SemVer string. */
function parseLatest(text) {
  try {
    const v = JSON.parse(text).version;
    return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

async function fetchLatest() {
  const res = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  return res.ok ? parseLatest(await res.text()) : null;
}

function readCache(cacheFile, now) {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return now - c.checkedAt < CACHE_TTL_MS && parseLatest(JSON.stringify({ version: c.latest })) ? c.latest : null;
  } catch {
    return null;
  }
}

function writeCache(cacheFile, latest, now) {
  try {
    fs.writeFileSync(cacheFile, JSON.stringify({ checkedAt: now, latest }));
  } catch { /* the next session fetches again */ }
}

/** The notice for this state, or '' when nothing is to be said. */
async function run({
  pluginRoot = path.resolve(__dirname, '..', '..'),
  home = os.homedir(),
  cacheFile = defaultCacheFile(),
  now = Date.now(),
  fetcher = fetchLatest,
  fresh = false,
} = {}) {
  if (!isRpmCopy(pluginRoot)) return '';
  const marketplacesDir = path.join(home, '.claude', 'plugins', 'marketplaces');
  if (desktopCopyLag({ pluginRoot, marketplacesDir }) || catalogShadowWarning({ pluginRoot, home })) return '';

  let latest = fresh ? null : readCache(cacheFile, now);
  if (!latest) {
    try { latest = await fetcher(); } catch { latest = null; }
    if (!latest) return '';
    writeCache(cacheFile, latest, now);
  }

  const lag = remoteCopyLag({ pluginRoot, latest });
  if (!lag || lag.marketplace !== MARKETPLACE) return '';
  const synced = lag.updatedAt ? String(lag.updatedAt).slice(0, 10) : '?';
  return [
    `⚠ **The Desktop app runs ${lag.name} ${lag.running} (claude.ai marketplace "${lag.marketplace}", synced ${synced}), but ${lag.latest} is on GitHub.** ` +
      `On claude.ai: Customize → Plugins → Manage marketplaces → "${lag.marketplace}" → Check for updates, then restart the Desktop app.`,
    'Show the user this notice verbatim, once.',
    '',
  ].join('\n');
}

if (require.main === module) {
  // Cheap gate first: a Claude Code install never needs the worker.
  if (!isRpmCopy(path.resolve(__dirname, '..', '..'))) process.exit(0);
  const inline = process.argv.includes('--force');
  if (require('../lib/deferred-results').deferOrRun({ name: 'catalog-remote', script: __filename, inline })) process.exit(0);
  run({ fresh: inline })
    .then((text) => { if (text) process.stdout.write(text); })
    .catch(() => { /* never block a session */ });
}

module.exports = { run, parseLatest, MANIFEST_URL };

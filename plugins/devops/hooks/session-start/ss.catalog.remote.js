#!/usr/bin/env node
/**
 * @hook ss.catalog.remote
 * @version 0.1.0
 * @event SessionStart
 * @plugin devops
 * @description Warns when a session runs an old claude.ai account copy of devops
 *   with no local install to fall back on: a cloud session, or a Desktop app on
 *   a machine without Claude Code's install.
 *
 *   With a local install ss.plugin.update mirrors it over the Desktop copy and
 *   ss.project.setup prints the version line, so this hook stays silent. The
 *   account copy tracks `main` with no channels, so it compares with `main`'s
 *   manifest. A cloud session is recognised by CLAUDE_CODE_REMOTE=true.
 *
 *   The fetch runs off the critical path (lib/deferred-results); the notice is
 *   delivered with the next user prompt. The fetched version is cached for 6 h,
 *   and the notice repeats every session until the copy catches up. A failed
 *   fetch or an unusable reply stays silent and caches nothing. `--force` (the
 *   auto-update skill) runs inline and skips the cached version.
 *
 *   The hook cannot trigger the claude.ai sync: see deep-knowledge/claude-desktop-app-setup.md
 *   § Account copy of a plugin.
 */

require('../lib/plugin-guard');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isRpmCopy, desktopCopyLag, remoteCopyLag, localInstall, CLOUD_PROMPT } = require('../lib/desktop-copy');
const { getVersion } = require('../lib/cache-rebuild');
const { compareVersions } = require('../lib/channels');

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

const isCloudSession = (env = process.env) => env.CLAUDE_CODE_REMOTE === 'true';

/** The notice for this state, or '' when nothing is to be said. */
async function run({
  pluginRoot = path.resolve(__dirname, '..', '..'),
  home = os.homedir(),
  cacheFile = defaultCacheFile(),
  now = Date.now(),
  fetcher = fetchLatest,
  fresh = false,
  cloud = isCloudSession(),
  lang = 'de',
} = {}) {
  if (!cloud) {
    if (!isRpmCopy(pluginRoot)) return '';
    const marketplacesDir = path.join(home, '.claude', 'plugins', 'marketplaces');
    if (desktopCopyLag({ pluginRoot, marketplacesDir }) || localInstall(home)) return '';
  }

  let latest = fresh ? null : readCache(cacheFile, now);
  if (!latest) {
    try { latest = await fetcher(); } catch { latest = null; }
    if (!latest) return '';
    writeCache(cacheFile, latest, now);
  }

  const en = lang === 'en';
  const arrow = en ? `→ "${CLOUD_PROMPT.en}"` : `→ „${CLOUD_PROMPT.de}“`;
  let line;
  if (cloud) {
    const running = getVersion(pluginRoot);
    if (!running || compareVersions(running, latest) >= 0) return '';
    line = en ? `⚠ devops: Cloud ${running} outdated, newest is ${latest} ${arrow}` : `⚠ devops: Cloud ${running} veraltet, neueste ist ${latest} ${arrow}`;
  } else {
    const lag = remoteCopyLag({ pluginRoot, latest });
    if (!lag || lag.marketplace !== MARKETPLACE) return '';
    line = en
      ? `⚠ devops: no local install · Cloud ${lag.running} outdated (runs here), newest is ${lag.latest} ${arrow}`
      : `⚠ devops: kein lokaler Install · Cloud ${lag.running} veraltet (läuft hier), neueste ist ${lag.latest} ${arrow}`;
  }
  return [line, 'Show the user this line verbatim, once.', ''].join('\n');
}

if (require.main === module) {
  // Cheap gate first: a Claude Code install never needs the worker.
  if (!isCloudSession() && !isRpmCopy(path.resolve(__dirname, '..', '..'))) process.exit(0);
  const inline = process.argv.includes('--force');
  if (require('../lib/deferred-results').deferOrRun({ name: 'catalog-remote', script: __filename, inline })) process.exit(0);
  run({ fresh: inline })
    .then((text) => { if (text) process.stdout.write(text); })
    .catch(() => { /* never block a session */ });
}

module.exports = { run, parseLatest, MANIFEST_URL };

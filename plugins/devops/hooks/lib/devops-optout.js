'use strict';
/**
 * @module devops-optout
 * @version 0.1.0
 * @plugin devops
 * @description The one resolver for "is devops on here?" — shared by
 *   plugin-guard, the dispatcher, the permission hooks, the MCP server and
 *   scripts/devops-optout.js. The band mod (hooks/mods, no Node) mirrors the
 *   same reads and writes in TS — keep both in sync with this contract.
 *
 *   Order, first hit wins (Claude Code precedence):
 *     1. session flag  `~/.claude/devops-optout/sessions/<session_id>.json`
 *     2. `<project>/.claude/settings.local.json`
 *     3. `<project>/.claude/settings.json`
 *     4. `~/.claude/settings.json`
 *        — the first file with an explicit boolean for a devops key decides;
 *        several devops keys in one file: any `false` → off. Corrupt/unreadable
 *        JSON is skipped, never read as "off".
 *     5. no file decides: a plugin root outside `~/.claude/plugins/cache/`
 *        (account copy, `--plugin-dir`, eval) → on (`adhoc`); else off (`none`).
 *
 *   An explicit `false` therefore silences every copy of the plugin.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEVOPS_KEYS = Object.freeze([
  'devops@dotclaude',
  'dotclaude-dev-ops@dotclaude-dev-ops',
  'dotclaude-dev-ops@Jerry0022',
]);

/** `devops@dotclaude`, the legacy keys, and any `devops@<marketplace containing dotclaude>`. */
function isDevopsKey(k) {
  if (typeof k !== 'string') return false;
  if (DEVOPS_KEYS.includes(k)) return true;
  const m = /^devops@(.+)$/.exec(k);
  return !!m && m[1].toLowerCase().includes('dotclaude');
}

function sessionFlagPath(home, id) {
  return path.join(home, '.claude', 'devops-optout', 'sessions', `${String(id).replace(/[^\w.-]/g, '_')}.json`);
}

function realpathOr(p) {
  try { return fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p); }
  catch { return path.resolve(p); }
}

/** Is the plugin root outside the install cache (ad hoc / account-synced copy)? Both sides through realpath. */
function isAdHocRoot(pluginRoot, home) {
  if (!pluginRoot) return false;
  const cacheDir = realpathOr(path.join(home, '.claude', 'plugins', 'cache'));
  const rel = path.relative(cacheDir, realpathOr(pluginRoot));
  return rel.startsWith('..') || path.isAbsolute(rel);
}

/** The explicit devops verdict of one settings file: true | false | null (no entry / unreadable). */
function fileVerdict(file) {
  let ep;
  try { ep = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^[\ufeff]/, '')).enabledPlugins; } catch { return null; }
  if (!ep || typeof ep !== 'object') return null;
  let seen = null;
  for (const k of Object.keys(ep)) {
    if (!isDevopsKey(k) || typeof ep[k] !== 'boolean') continue;
    if (ep[k] === false) return false;
    seen = true;
  }
  return seen;
}

/**
 * @param {{cwd?: string, sessionId?: string, pluginRoot?: string, home?: string}} [o]
 * @returns {{on: boolean, scope: 'session'|'local'|'project'|'user'|'adhoc'|'none', file?: string}}
 */
function resolve(o = {}) {
  const home = o.home || os.homedir();
  if (o.sessionId) {
    const f = sessionFlagPath(home, o.sessionId);
    if (fs.existsSync(f)) return { on: false, scope: 'session', file: f };
  }
  const dir = require('./project-root').projectClaudeDir(o.cwd || process.cwd());
  const chain = [
    ['local', path.join(dir, 'settings.local.json')],
    ['project', path.join(dir, 'settings.json')],
    ['user', path.join(home, '.claude', 'settings.json')],
  ];
  for (const [scope, file] of chain) {
    const v = fileVerdict(file);
    if (v !== null) return { on: v, scope, file };
  }
  return isAdHocRoot(o.pluginRoot, home) ? { on: true, scope: 'adhoc' } : { on: false, scope: 'none' };
}

/** True only when a file or flag says off explicitly (a bare cache copy with no entry is not "opted out"). */
function optedOut(o) {
  const r = resolve(o);
  return !r.on && r.scope !== 'none';
}

module.exports = { resolve, optedOut, sessionFlagPath, DEVOPS_KEYS, isDevopsKey, isAdHocRoot, fileVerdict };

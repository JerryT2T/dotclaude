#!/usr/bin/env node
/**
 * @module plugin-guard
 * @version 0.5.0
 * @description Project isolation guard — self-executing on require().
 *   Asks lib/devops-optout.js whether devops is on for this project and exits
 *   silently with code 0 when it is not, so Claude Code does not treat it as
 *   a hook failure.
 *
 *   Precedence (Claude Code's): session flag > settings.local.json >
 *   settings.json > user settings — the first explicit true/false for a
 *   devops key decides, and an explicit `false` silences EVERY copy of the
 *   plugin (cache, the account-synced copy, --plugin-dir). The guard runs
 *   before stdin is read, so the SESSION flag is checked by the dispatcher
 *   and the permission hooks (`sessionOptedOut`), where `session_id` is known.
 *
 *   No file deciding: a plugin loaded ad hoc — `claude --plugin-dir <src>`,
 *   the `claude plugin eval` sandbox (fresh HOME), the account copy — runs
 *   from outside `~/.claude/plugins/cache/` and passes; the cache copy is off
 *   unless enabled. Corrupt settings JSON is skipped, never read as "off".
 *
 *   Once the plugin is on the guard also starts lib/hook-telemetry.js
 *   (fail-safe run log, see there) — every hook requires this file first.
 *
 * Usage (first line in any hook script):
 *   require('../lib/plugin-guard');
 */

const O = require('./devops-optout');

// Project settings live at the repo root, not wherever the session cwd has
// wandered to (lib/project-root.js — resolve() applies it).
if (!O.resolve({ cwd: process.cwd(), pluginRoot: process.env.CLAUDE_PLUGIN_ROOT }).on) {
  process.exit(0);
}

/**
 * True when the session `sessionId` was switched off ("devops only off for
 * this session"). For the hooks that parse their payload.
 * @param {string} [sessionId]
 */
function sessionOptedOut(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return false;
  try { return require('fs').existsSync(O.sessionFlagPath(require('os').homedir(), sessionId)); }
  catch { return false; }
}

try { require('./hook-telemetry').start(); } catch { /* telemetry is optional */ }

module.exports = { sessionOptedOut };

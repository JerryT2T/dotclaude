#!/usr/bin/env node
/**
 * @hook post.test.release
 * @version 0.1.0
 * @event PostToolUse
 * @plugin devops
 * @matcher Bash|PowerShell
 * @description Releases the machine-wide full-suite lock (lib/full-suite-lock)
 *   that pre.test.fullguard took for this tool call. Also registered for
 *   PostToolUseFailure. A run_in_background call keeps the lock until its
 *   lease expires. Silent, fail open.
 */

require('../lib/plugin-guard');

const { containsFullSuite } = require('../lib/full-suite-cmd');

function main(hook, deps = {}) {
  if (!hook || (hook.tool_name !== 'Bash' && hook.tool_name !== 'PowerShell')) return null;
  const input = hook.tool_input || {};
  if (input.run_in_background) return null;
  if (!containsFullSuite(String(input.command || ''))) return null;
  (deps.lock || require('../lib/full-suite-lock')).release({ sessionId: hook.session_id, toolUseId: hook.tool_use_id });
  return null;
}

if (require.main === module) {
  try { require('../lib/hook-input').runHook(main, { event: 'PostToolUse' }); } catch { /* fail open */ }
}

module.exports = { main };

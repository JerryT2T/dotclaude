#!/usr/bin/env node
/**
 * @hook stop.hook.hardend
 * @version 0.1.0
 * @event Stop
 * @plugin devops
 * @description After a hard dispatcher end (a stuck hook module, #1151),
 *   Claude Code cancels the other tool calls of that message with a text that
 *   reads like a refusal by the user, and the model tends to stop the turn
 *   on it. When the session has such a marker (lib/hook-hardend.js), block
 *   this stop once: the batch was ended by a hook failure, resend and go on.
 *   The marker is consumed, so it blocks exactly once per hard end.
 *   Never acts on stop_hook_active (loop guard) or inside a subagent.
 */

require('../lib/plugin-guard');

function main(hook, deps = {}) {
  if (hook.stop_hook_active || hook.agent_id) return null;
  const H = deps.hardend || require('../lib/hook-hardend');
  const rec = H.consume(hook.session_id, deps.opts);
  if (!rec) return null;
  return { block: H.stopText(rec) };
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'Stop' });
  } catch {
    // fail open
  }
}

module.exports = { main };

#!/usr/bin/env node
/**
 * @hook prompt.hook.hardend
 * @version 0.1.0
 * @event UserPromptSubmit
 * @plugin devops
 * @description Fallback of stop.hook.hardend (#1151): when a hard dispatcher
 *   end left its marker and no Stop consumed it (the session ended another
 *   way), the next prompt says once that the previous turn's last tool batch
 *   was ended by a hook failure, not by the user. A prompt that only gets
 *   collected (do-batch) produces no turn and leaves the marker in place.
 */

require('../lib/plugin-guard');

function main(hook, deps = {}) {
  try { if (!deps.hardend && require('../lib/batch-state').willBeCollected(hook)) return null; } catch { /* fail open */ }
  const H = deps.hardend || require('../lib/hook-hardend');
  const rec = H.consume(hook.session_id, deps.opts);
  if (!rec) return null;
  return { context: H.promptText(rec) };
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'UserPromptSubmit' });
  } catch {
    // fail open
  }
}

module.exports = { main };

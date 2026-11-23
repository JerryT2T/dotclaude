#!/usr/bin/env node
/**
 * @hook prompt.cleanup.gate
 * @version 0.1.0
 * @event UserPromptSubmit
 * @plugin devops
 * @description Claude Projects thread form of the /auto-cleanup Dry-Run
 *   confirm (lib/cleanup-gate.js): when the gate is armed and a Dry-Run
 *   list was posted to the thread, the person's own next thread message (a
 *   wake whose trigger message is from="human" trust="principal") answers it —
 *   "Ja"/"Yes" first approves exactly that post, anything else drops it.
 *   Outside an armed session, or without a pending post, it does nothing.
 */

function main(hook) {
  if (!hook.session_id) return null;
  const gate = require('../lib/cleanup-gate');
  const state = gate.readState(hook.session_id);
  if (!state || !state.threadPending) return null;
  gate.confirmThreadPrompt(state, hook.prompt);
  gate.writeState(hook.session_id, state);
  return null;
}

if (require.main === module) {
  try {
    require('../lib/plugin-guard');
    require('../lib/hook-input').runHook(main, { event: 'UserPromptSubmit' });
  } catch {
    // fail open
  }
}

module.exports = { main };

#!/usr/bin/env node
/**
 * @hook pre.thread.rights
 * @version 0.2.0
 * @event PreToolUse
 * @plugin devops
 * @matcher Bash|PowerShell|mcp__.*__ship_promote
 * @description Claude Projects rights (d-trust "alpha", line A4): a turn that a
 *   COLLEAGUE started (a coordinator note or another thread's message; the one
 *   decision is `turnRights` of lib/project-thread.js) may not run a
 *   force-push, a remote branch delete, `git branch -D`, a forced worktree
 *   removal, a recursive delete outside the scratch and temp folders,
 *   `gh repo delete` / `gh release delete`, nor promote to beta / stable: the
 *   MCP tool `ship_promote`, a push of a channel tag, `gh release create`
 *   (lib/thread-rights.js). Those need a message of the person in the thread
 *   itself. An alpha ship stays allowed. Exit 2 = block.
 *
 *   A safety rule, not a feature: no feature gate. A person or typed turn and
 *   every Desktop session pass untouched. A subagent is NOT exempt: its call
 *   carries the PARENT's `transcript_path`, so the parent turn's prompt decides.
 *   A machine prompt (task notification) continues the last non-machine prompt.
 *   Fail-closed in a marked thread: a prompt that cannot be read is a colleague.
 */

require('../lib/plugin-guard');

const DENY =
  '[thread-rights] BLOCKED: {reason} — this turn was started by a coordinator note or another thread, not by the ' +
  'person. That needs a message of the person in this thread itself. Do not retry and do not work around it; ' +
  'report it in the thread and wait for the person\'s message.';

function main(hook) {
  const rights = require('../lib/thread-rights');
  let reason = null;
  if (rights.isPromoteTool(hook.tool_name)) {
    reason = 'a promote to beta/stable (ship_promote)';
  } else {
    const command = hook.tool_input && typeof hook.tool_input.command === 'string' ? hook.tool_input.command : '';
    if (!command) return null;
    reason = rights.destructiveReason(command, hook.cwd);
  }
  if (!reason) return null; // the common case: nothing destructive, no transcript read
  const thread = require('../lib/project-thread');
  let rightsOfTurn;
  try {
    const card = require('../lib/card-guard');
    const transcript = card.safeReadTranscript(hook.transcript_path, 4 * 1024 * 1024); // a long turn pushes its prompt far back
    rightsOfTurn = thread.turnRights(hook, transcript);
  } catch {
    rightsOfTurn = thread.isMarked(hook.session_id) ? 'colleague' : 'person';
  }
  if (rightsOfTurn !== 'colleague') return null;
  return { block: DENY.replace('{reason}', reason) };
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'PreToolUse' });
  } catch {
    // fail open
  }
}

module.exports = { main };

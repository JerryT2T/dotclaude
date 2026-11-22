#!/usr/bin/env node
/**
 * @hook pre.thread.rights
 * @version 0.1.0
 * @event PreToolUse
 * @plugin devops
 * @matcher Bash|PowerShell
 * @description Claude Projects rights (d-trust "alpha", line A4): a turn that a
 *   COLLEAGUE started — a coordinator note or another thread's message
 *   (`turnOrigin` of the transcript, lib/project-thread.js) — may not run a
 *   force-push, a remote branch delete, `git branch -D`, a forced worktree
 *   removal, a recursive delete outside the scratch and temp folders,
 *   `gh repo delete` or `gh release delete` (lib/thread-rights.js). Those need
 *   a message of the person in the thread itself. Exit 2 = block.
 *
 *   A safety rule, not a feature: no feature gate. A person or typed origin, a
 *   machine turn, a subagent and every Desktop session pass untouched
 *   (the origin is `typed` there). Fail-open: an unreadable transcript or any
 *   internal error never blocks.
 */

require('../lib/plugin-guard');

const DENY =
  '[thread-rights] BLOCKED: {reason} — this turn was started by a coordinator note or another thread, not by the ' +
  'person. That needs a message of the person in this thread itself. Do not retry and do not work around it; ' +
  'report it in the thread and wait for the person\'s message.';

function main(hook) {
  if (hook.agent_id) return null; // a subagent acts for the turn that spawned it; the main turn is gated
  const command = hook.tool_input && typeof hook.tool_input.command === 'string' ? hook.tool_input.command : '';
  if (!command) return null;
  const rights = require('../lib/thread-rights');
  const reason = rights.destructiveReason(command, hook.cwd);
  if (!reason) return null; // the common case: nothing destructive, no transcript read
  const thread = require('../lib/project-thread');
  const card = require('../lib/card-guard');
  const transcript = card.safeReadTranscript(hook.transcript_path, 4 * 1024 * 1024); // a long turn pushes its prompt far back
  if (!thread.isColleagueOrigin(thread.turnOrigin(transcript))) return null;
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

#!/usr/bin/env node
/**
 * @hook pre.ask.title
 * @version 0.4.0
 * @event PreToolUse
 * @plugin devops
 * @matcher AskUserQuestion|ExitPlanMode|mcp__ccd_session__start_session
 * @description Puts `👉 ➜ ❓ Question ┃ ` on the session title BEFORE a
 *   call blocks on the user (a question, a plan approval, a start_session
 *   approval): a title still on ⏳ (and no set_session_title to the question
 *   title in the same message) refuses the call once per turn with the exact
 *   set call to send alongside the repeated call. Rules:
 *   lib/ask-title.js. Silent inside a subagent, for a batch title and when
 *   the title is unknown (no Desktop app). Fail-open. Normally nothing to
 *   refuse: prompt.flow.title-work already names the exact question-title
 *   call with its turn-start title line; this block is the safety net.
 *   A call that passes and starts a session gets the ⏳ head on the NEW
 *   session's title (lib/ask-title.js startSessionInput), so its sidebar row
 *   shows the hourglass from its first moment.
 *   In a Claude Projects thread (feature `project-threads`) an AskUserQuestion
 *   is refused with the exact instruction to ask as a numbered `post_message`
 *   reply plus the question head on the THREAD title (`rename_thread`); the
 *   person's next message is the answer. A Desktop session is untouched.
 */

require('../lib/plugin-guard');

const ask = require('../lib/ask-title');

/** The refusal for a call the title does not announce yet, or null. */
function refusal(hook) {
  const { readCurrentTitle } = require('../lib/session-title');
  const target = ask.questionTitle(readCurrentTitle(hook.transcript_path));
  if (!target) return null;
  const text = require('../lib/agent-card-relay').readTail(hook.transcript_path);
  if (!text.trim()) return null;
  const { titleSet, refused } = ask.turnState(text, hook.tool_use_id);
  return titleSet || refused ? null : { block: ask.refusalText(target) };
}

/** The new session's title with the ⏳ head, as the rewritten tool input. */
function startReply(hook) {
  if (hook.tool_name !== 'mcp__ccd_session__start_session') return null;
  const updatedInput = ask.startSessionInput(hook.tool_input);
  return updatedInput ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput } }) : null;
}

/** The thread redirect for an AskUserQuestion, or null (not a thread, feature off, another tool). */
function threadRedirect(hook) {
  if (hook.tool_name !== 'AskUserQuestion') return null;
  const thread = require('../lib/project-thread');
  if (thread.threadMode(hook, { deep: true }) !== 'on') return null;
  const current = thread.lastThreadTitle(hook.transcript_path);
  const target = current === null ? null : ask.questionTitle(current);
  const call = current === null ? thread.renameCallUnknown(ask.QUESTION_PREFIX)
    : target ? thread.renameCall(target) : null; // already a question head: nothing to rename
  return { block: ask.threadQuestionText(call || 'no rename (the title already shows the question head)') };
}

function main(hook) {
  if (hook.agent_id) return null;
  const redirect = threadRedirect(hook);
  if (redirect) return redirect;
  // A non-blocking own_initiative / proposal start still carries its head (🔗 ⏳ ➜ 🤖 Solo).
  if (hook.tool_name && !ask.isBlockingCall(hook.tool_name, hook.tool_input)) return startReply(hook);
  return refusal(hook) || startReply(hook);
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'PreToolUse' });
  } catch {
    // fail open
  }
}

module.exports = { main };

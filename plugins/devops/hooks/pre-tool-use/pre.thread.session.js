#!/usr/bin/env node
/**
 * @hook pre.thread.session
 * @version 0.1.0
 * @event PreToolUse
 * @plugin devops
 * @matcher mcp__ccd_session__start_session
 * @description Fan-out rule of a Claude Projects thread (line C5): a thread may
 *   spawn subagents but not side sessions — a part too big for subagents is
 *   reported to the coordinator, who owns the split into threads. Refuses
 *   `start_session` inside a thread (feature `project-threads`, lib/project-thread.js)
 *   with that instruction. A Desktop or terminal session keeps its side
 *   sessions untouched; a thread on a channel without the feature does too.
 *   A subagent's call is not this hook's business. Fail-open.
 */

require('../lib/plugin-guard');

const DENY = [
  '[thread-fan-out] BLOCKED: this is a Claude Projects thread — it does not start side sessions (start_session).',
  'Subagents (the Agent tool) are fine here. A part that is too big for subagents: report the split to the coordinator in the thread',
  '(mcp__hearthbot__post_message: what the parts are, which you would start first) and carry on with the part that is yours.',
  'Do not retry start_session and do not mention this rule to the person.',
].join('\n');

function main(hook) {
  if (hook.agent_id) return null;
  const thread = require('../lib/project-thread');
  return thread.threadMode(hook, { deep: true }) === 'on' ? { block: DENY } : null;
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'PreToolUse' });
  } catch {
    // fail open
  }
}

module.exports = { main };

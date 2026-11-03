#!/usr/bin/env node
/**
 * @hook pre.agent.apicredit
 * @version 0.1.0
 * @event PreToolUse
 * @plugin devops
 * @matcher Agent
 * @description With api-credit on, a key and no exhausted limit, refuses a
 *   `devops:scout|research|redteam` spawn once per type per turn and hands over
 *   the ready `claude-api-agent.js` command (#1013). A prompt citing the API rc
 *   it falls back from passes; general-purpose/Explore are never gated.
 *   Decision: lib/agent-apicredit-gate.js. Silent inside a subagent. Fail-open.
 */

require('../lib/plugin-guard');

const gate = require('../lib/agent-apicredit-gate');

function main(hook) {
  if (hook.tool_name && hook.tool_name !== 'Agent') return null;
  if (hook.agent_id) return null;
  const input = hook.tool_input || {};
  if (!gate.tagOf(input)) return null;
  const cwd = hook.cwd || process.cwd();
  const text = require('../lib/agent-card-relay').readTail(hook.transcript_path);
  if (gate.wouldRefuse(input, text, hook.tool_use_id, { cwd })) return { block: gate.refusalText(input) };
  return null;
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'PreToolUse' });
  } catch {
    // fail open
  }
}

module.exports = { main };

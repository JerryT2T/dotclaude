#!/usr/bin/env node
/**
 * @hook pre.waitloop.guard
 * @version 0.1.0
 * @event PreToolUse
 * @plugin devops
 * @matcher Bash
 * @description Block unbounded `until`/`while` wait loops and sleepless spin loops in Bash.
 *   They outlive their session: 9 of them polled logs for hours on 2026-11-05
 *   and only a reboot ended them. run_in_background is no exemption, because a
 *   background loop with no bound is exactly what leaked; neither is the Bash
 *   tool's timeout, which moves the call to the background instead of killing it.
 *   Matching lives in lib/wait-loop-match. The manifest's `commandFilter` keeps
 *   this module from starting at all unless the command names while or until.
 *
 *   Bypass (only when the user explicitly wants a loop that runs until stopped):
 *   inline `DEVOPS_ALLOW_UNBOUNDED_LOOP=1` in the command, or the variable set in
 *   the hook environment. Fails open on any error.
 */

require('../lib/plugin-guard');

const REASONS = {
  unbounded: 'polls with no bound',
  busy: 'has no sleep, so it spins a core',
};

function message(found) {
  const lines = found.slice(0, 3).map((f) => {
    const shown = f.loop.length > 120 ? `${f.loop.slice(0, 117)}...` : f.loop;
    return `- ${REASONS[f.kind]}: ${shown}`;
  });
  return `[wait-loop] Not started. This loop can outlive the session and only a reboot would end it:\n${lines.join('\n')}\n`
    + 'Instead, pick one:\n'
    + '- Waiting for your own job: start the job itself with run_in_background; you get notified when it exits.\n'
    + '- Waiting for a log line or file: use the Monitor tool.\n'
    + "- A loop you need: bound it and sleep, e.g. timeout 300 bash -c 'until CHECK; do sleep 5; done' or SECONDS=0; until CHECK || [ $SECONDS -ge 300 ]; do sleep 5; done\n"
    + "The Bash tool's timeout and run_in_background do not bound a loop. "
    + 'Inline DEVOPS_ALLOW_UNBOUNDED_LOOP=1 overrides, only when the user asked for a loop that runs until stopped.';
}

/**
 * @param {object} hook parsed payload
 * @returns {{block: string}|null}
 */
function main(hook) {
  if (!hook || hook.tool_name !== 'Bash') return null;
  const command = hook.tool_input && typeof hook.tool_input.command === 'string' ? hook.tool_input.command : '';
  if (!/\b(?:while|until)\b/.test(command)) return null;
  const { findWaitLoops, hasBypass } = require('../lib/wait-loop-match');
  if (process.env.DEVOPS_ALLOW_UNBOUNDED_LOOP === '1' || hasBypass(command)) return null;
  const found = findWaitLoops(command);
  return found.length ? { block: message(found) } : null;
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'PreToolUse' });
  } catch {
    // fail open
  }
}

module.exports = { main };

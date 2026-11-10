#!/usr/bin/env node
/**
 * @hook prompt.knowledge.anchor
 * @version 0.1.0
 * @event UserPromptSubmit
 * @plugin devops
 * @description Records the knowledge anchor (Wissensstand) of this worktree:
 *   the origin/<base> tip the user knew at the session's first user prompt.
 *   The survival check (hooks/lib/survival.js) treats everything that landed
 *   on <base> after this commit as "other people's work the user never saw".
 *   A fresh worktree inherits the anchor of the worktree it descends from
 *   instead of recording its own start (hooks/lib/anchor-recording.js); after
 *   a completed ship the anchor moves forward (ship_cleanup), a concept page
 *   pins it earlier (scripts/concept-open.js).
 *
 *   Silent — no output, ever. Cheap once an anchor exists (one file read).
 *   Machine turns (ticks, notifications) never record. Fails open.
 */

require('../lib/plugin-guard');

function main(hook) {
  if (!hook) return null;
  const { isNonUserPrompt } = require('../lib/non-user-prompt');
  if (isNonUserPrompt(hook.prompt)) return null;
  const cwd = typeof hook.cwd === 'string' && hook.cwd ? hook.cwd : process.cwd();
  require('../lib/anchor-recording').ensureAnchor(cwd, { session: hook.session_id });
  return null;
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'UserPromptSubmit' });
  } catch {
    // fail open
  }
}

module.exports = { main };

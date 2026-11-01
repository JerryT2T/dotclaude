/**
 * @module prompt-text
 * @description The words the user typed, for UserPromptSubmit hooks that scan
 *   a prompt for keywords. The runtime's `prompt` carries more than that: the
 *   Desktop app prefixes the first prompt of a worktree session with a
 *   `<system-reminder>` naming the worktree path, and pasted material arrives
 *   in `<pasted_content>` blocks. Scanning the raw prompt matched a worktree
 *   named `…-feature-refine-…` as "feature refinement" and injected
 *   feature-elaboration.md into an unrelated architecture question.
 *
 *   Prefix checks (machine turns, task notifications, `<command-name>`) still
 *   read the raw prompt via `rawPrompt`; keyword matching reads `userText`.
 *   No dependencies, so any lib (locale.js) can require it without a cycle.
 */

/** The prompt as the runtime sent it (`prompt`; the others are legacy names). */
function rawPrompt(hook) {
  if (!hook || typeof hook !== 'object') return '';
  const raw = hook.prompt || hook.user_message || hook.message || '';
  return typeof raw === 'string' ? raw : '';
}

/** Strip harness reminders and pasted material from a prompt string. */
function ownWords(prompt) {
  if (typeof prompt !== 'string') return '';
  return prompt
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
    .replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content[^>]*>/g, ' ')
    .trim();
}

/** The user's own words of a UserPromptSubmit payload. */
function userText(hook) {
  return ownWords(rawPrompt(hook));
}

module.exports = { rawPrompt, ownWords, userText };

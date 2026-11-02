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
  return stripBlocks(stripBlocks(prompt, '<system-reminder>', '</system-reminder>', false), '<pasted_content', '</pasted_content', true).trim();
}

/**
 * Replace every `open … close` block with a space, linear time. Same result as
 * /open[\s\S]*?close/g (or, with `tagged`, /open[^>]*>[\s\S]*?close[^>]*>/g): an
 * unterminated opener stays as text and never rescans the rest of the prompt
 * (the regex went quadratic on thousands of unterminated tags).
 */
function stripBlocks(text, open, close, tagged) {
  let out = '';
  let pos = 0;
  let from = 0;
  while (true) {
    const a = text.indexOf(open, from);
    if (a === -1) break;
    let bodyStart = a + open.length;
    if (tagged) {
      const gt = text.indexOf('>', bodyStart);
      if (gt === -1) break; // no opener ends anywhere after: nothing more to strip
      bodyStart = gt + 1;
    }
    const c = text.indexOf(close, bodyStart);
    if (c === -1) break; // unterminated: no later opener can close either
    let end = c + close.length;
    if (tagged) {
      const gt = text.indexOf('>', end);
      if (gt === -1) break;
      end = gt + 1;
    }
    out += text.slice(pos, a) + ' ';
    pos = from = end;
  }
  return out + text.slice(pos);
}

/** The user's own words of a UserPromptSubmit payload. */
function userText(hook) {
  return ownWords(rawPrompt(hook));
}

module.exports = { rawPrompt, ownWords, userText };

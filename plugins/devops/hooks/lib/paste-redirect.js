'use strict';
/**
 * Deterministic paste / tool-output redirect — the pure half of #1106 (part 6a).
 *
 * A large paste or tool output stays in the conversation as an excerpt — the
 * first and last lines plus the path of a file holding the original — instead
 * of the full text. No model ever rewrites the content (red-team finding 1 of
 * docs/dev/mods.md: a Haiku summary loses exact content), so every function
 * here is a pure, repeatable transformation.
 *
 * NOT wired yet: the caller (the mod's prompt.submit hook, part 6b, and a
 * tool-output path coordinated with pre.tokens.guard, part 6c) decides where
 * the original is written. This module only decides WHETHER to redirect and
 * WHAT the excerpt says.
 */
const crypto = require('crypto');

/** Pastes from this size on are redirected (#1106: "pastes ≥ 8k tokens"). */
const PASTE_THRESHOLD_TOKENS = 8000;
/** Tool output from this size on is redirected. */
const OUTPUT_THRESHOLD_TOKENS = 8000;
const HEAD_LINES = 40;
const TAIL_LINES = 40;
/** Cap per excerpt half, so one giant line cannot defeat the line budget. */
const HALF_MAX_CHARS = 6000;

/**
 * Rough token count — the same ~4 characters per token the rest of the plugin
 * uses for budget estimates. Deterministic, no tokenizer.
 * @param {string} text
 */
function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

// Prompts other hooks read verbatim: ss.run.task re-injects the /do-run task
// and prompt.run.contract parses it; autostart / resume markers carry state;
// a slash command arrives wrapped in <command-name>. An excerpt there would
// hide the instruction itself.
const EXEMPT_PROMPT_RE = /^\s*\/(?:devops:)?do-run\b|\b(?:AUTONOMOUS_AUTOSTART|RUN_BACKLOG_AUTOSTART|AUTONOMOUS_RESUME|BURN_RESUME):|<command-name>/;

/** @param {string} prompt */
function isExemptPrompt(prompt) {
  return EXEMPT_PROMPT_RE.test(String(prompt || ''));
}

// Commands whose full output is the evidence: a test run (an excerpt can hide
// the failing test), git (diffs, logs feed merges and reviews) and CI / PR
// checks. Matched at the START of each shell segment, so `cd x && npm test`
// counts but `echo "npm test"` does not.
const EXEMPT_SEGMENT_RE = new RegExp('^(?:\\w+=\\S*\\s+)*(?:' + [
  String.raw`(?:git|gh)(?:\.exe)?\s`,
  String.raw`(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b`,
  String.raw`(?:npx\s+)?(?:vitest|jest|mocha|ava|playwright\s+test)\b`,
  String.raw`(?:pytest|tox|nox)\b`,
  String.raw`python\d*(?:\.exe)?\s+-m\s+(?:pytest|unittest)\b`,
  String.raw`(?:dotnet|go|cargo|mvn|gradle|\.?\/?gradlew|swift|mix|rspec|phpunit)\s+test\b`,
  String.raw`(?:npm|pnpm|yarn)\s+run\s+(?:ci|lint|typecheck)\b`,
].join('|') + ')', 'i');

/** @param {string} command */
function isExemptCommand(command) {
  return String(command || '').split(/&&|\|\||[;|&()\n]/).some((seg) => EXEMPT_SEGMENT_RE.test(seg.trim()));
}

/**
 * Should a pasted prompt be redirected?
 * @param {string} prompt
 * @param {{ thresholdTokens?: number }} [opts]
 * @returns {{ redirect: boolean, reason: string, tokens: number }}
 */
function planPaste(prompt, opts = {}) {
  const text = String(prompt || '');
  const tokens = estimateTokens(text);
  if (isExemptPrompt(text)) return { redirect: false, reason: 'exempt-prompt', tokens };
  const limit = Number.isFinite(opts.thresholdTokens) ? opts.thresholdTokens : PASTE_THRESHOLD_TOKENS;
  if (tokens < limit) return { redirect: false, reason: 'small', tokens };
  return { redirect: true, reason: 'large-paste', tokens };
}

/**
 * Should a tool output be redirected?
 * @param {string} command — the shell command that produced it ('' for non-shell tools)
 * @param {string} output
 * @param {{ thresholdTokens?: number }} [opts]
 * @returns {{ redirect: boolean, reason: string, tokens: number }}
 */
function planOutput(command, output, opts = {}) {
  const tokens = estimateTokens(output);
  if (isExemptCommand(command)) return { redirect: false, reason: 'exempt-command', tokens };
  const limit = Number.isFinite(opts.thresholdTokens) ? opts.thresholdTokens : OUTPUT_THRESHOLD_TOKENS;
  if (tokens < limit) return { redirect: false, reason: 'small', tokens };
  return { redirect: true, reason: 'large-output', tokens };
}

function clampHead(s, max) { return s.length > max ? s.slice(0, max) + ' …' : s; }
function clampTail(s, max) { return s.length > max ? '… ' + s.slice(s.length - max) : s; }

/**
 * Head + tail + path. Deterministic: the same text and path always give the
 * same excerpt. Text that already fits head + tail is returned unchanged.
 * @param {string} text
 * @param {string} filePath — where the caller stored the original
 * @param {{ headLines?: number, tailLines?: number, halfMaxChars?: number }} [opts]
 */
function excerpt(text, filePath, opts = {}) {
  const src = String(text || '');
  const headN = opts.headLines ?? HEAD_LINES;
  const tailN = opts.tailLines ?? TAIL_LINES;
  const maxChars = opts.halfMaxChars ?? HALF_MAX_CHARS;
  const lines = src.split(/\r?\n/);
  if (lines.length <= headN + tailN && src.length <= 2 * maxChars) return src;
  const head = clampHead(lines.slice(0, headN).join('\n'), maxChars);
  const tail = clampTail(lines.slice(Math.max(headN, lines.length - tailN)).join('\n'), maxChars);
  const omittedLines = Math.max(0, lines.length - headN - tailN);
  // Count what is really missing, also inside a clamped giant line.
  const omittedTokens = estimateTokens(' '.repeat(Math.max(0, src.length - head.length - tail.length)));
  const marker = `[… ${omittedLines} lines (~${omittedTokens} of ~${estimateTokens(src)} tokens) omitted here — full original: ${filePath} …]`;
  return `${head}\n${marker}\n${tail}`;
}

/**
 * Stable file name for the original: same content → same name, so a retried
 * hook overwrites instead of piling up copies.
 * @param {string} text
 * @param {'paste'|'output'} [kind]
 */
function fileNameFor(text, kind = 'paste') {
  const hash = crypto.createHash('sha1').update(String(text || '')).digest('hex').slice(0, 12);
  return `${kind}-${hash}.txt`;
}

module.exports = {
  PASTE_THRESHOLD_TOKENS, OUTPUT_THRESHOLD_TOKENS, HEAD_LINES, TAIL_LINES,
  estimateTokens, isExemptPrompt, isExemptCommand, planPaste, planOutput, excerpt, fileNameFor,
};

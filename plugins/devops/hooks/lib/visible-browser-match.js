'use strict';
/**
 * @module visible-browser-match
 * @version 0.1.0
 * @plugin devops
 * @description Finds scripts and commands that would open a visible non-Edge
 *   browser window. Pure text matching, used by pre.visible-browser.guard.
 *
 *   Three shapes count:
 *     - launch options: `headless: false` (Python: `headless=False`) in script
 *       text that names a browser library, unless the same options object names
 *       Edge (`channel: 'msedge'`, `executablePath: EDGE`)
 *     - runner flags: `--headed`, `playwright open`, `playwright codegen`
 *     - a Chrome executable started directly without `--headless`
 *
 *   Known gaps, on purpose: options built elsewhere (`launch(opts)`), a browser
 *   path in a shell variable (`"$CHROME" url`) and scripts already on disk are
 *   not seen. Text matching cannot follow those without flagging normal code.
 */

const CODE_FILE = /\.(?:[cm]?js|jsx|[cm]?ts|tsx|py)$/i;
const BROWSER_LIB = /playwright|puppeteer|chromium|firefox|webkit|\.launch\w*\s*\(/i;
const VISIBLE_OPTION = /['"]?\bheadless['"]?\s*[:=]\s*(?:false|False)\b/g;
// Case-sensitive parts keep "knowledge" and "bridge" from counting as Edge.
const EDGE = /[Mm][Ss][Ee][Dd][Gg][Ee]|\b[Ee][Dd][Gg][Ee]|[a-z]Edge|_EDGE/;
const INLINE_SCRIPT = /<<|\bnode\s+(?:-e|--eval|-p)\b|\bpython3?\s+-c\b|@['"]/;
const BYPASS = /\bDEVOPS_ALLOW_VISIBLE_BROWSER\b/;

const ENV_PREFIX = String.raw`(?:\w+=\S*\s+)*`;
const RUNNER = new RegExp(`^\\s*${ENV_PREFIX}(?:npx|pnpm|yarn|bunx|npm|node|playwright|python3?|pytest)\\b`, 'i');
const PLAYWRIGHT_WINDOW = new RegExp(`^\\s*${ENV_PREFIX}(?:(?:npx|bunx|yarn|pnpm(?:\\s+exec)?)\\s+)?(?:python3?\\s+-m\\s+)?playwright\\s+(?:open|codegen|cr|ff|wk)\\b`, 'i');
const CHROME_EXE = new RegExp(
  `^\\s*${ENV_PREFIX}(?:start\\s+(?:""\\s+)?(?:/\\w+\\s+)*|Start-Process\\s+(?:-FilePath\\s+)?|&\\s*|exec\\s+|open\\s+-a\\s+)?`
  + `(?:"(?:[^"]*[\\\\/])?(?:chrome(?:\\.exe)?|Google Chrome)"|'(?:[^']*[\\\\/])?(?:chrome(?:\\.exe)?|Google Chrome)'`
  + `|(?:[^\\s"'=;&|]*[\\\\/])?(?:chrome(?:\\.exe)?|google-chrome(?:-stable)?))(?=\\s|$)`,
  'i',
);

function shown(text) {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

/** The innermost `{...}` or `(...)` around `index`, or the whole text when there is none. */
function enclosing(text, index) {
  const walk = (start, step, open, close) => {
    let depth = 0;
    for (let i = start; i >= 0 && i < text.length; i += step) {
      if (close.includes(text[i])) depth += 1;
      else if (open.includes(text[i])) {
        if (depth === 0) return i;
        depth -= 1;
      }
    }
    return -1;
  };
  const from = walk(index - 1, -1, '{(', '})');
  if (from === -1) return text;
  const to = walk(index, 1, '})', '{(');
  return to === -1 ? text.slice(from) : text.slice(from, to + 1);
}

/** Visible launch options in script text. */
function findInScript(text) {
  if (typeof text !== 'string' || !BROWSER_LIB.test(text)) return [];
  const found = [];
  for (const m of text.matchAll(VISIBLE_OPTION)) {
    const options = enclosing(text, m.index);
    if (!EDGE.test(options)) found.push({ kind: 'option', shown: shown(options) });
  }
  return found;
}

function splitSegments(command) {
  return command.split(/&&|\|\||[;|\n]/);
}

/** Runner flags and direct Chrome starts in a shell command. */
function findInCommand(command) {
  if (typeof command !== 'string') return [];
  const found = [];
  for (const segment of splitSegments(command)) {
    if (EDGE.test(segment)) continue;
    if (PLAYWRIGHT_WINDOW.test(segment) || (RUNNER.test(segment) && /(?:^|\s)--headed\b/.test(segment))) {
      found.push({ kind: 'runner', shown: shown(segment) });
    } else if (CHROME_EXE.test(segment) && !/--headless\b|--version\b/.test(segment)) {
      found.push({ kind: 'executable', shown: shown(segment) });
    }
  }
  if (INLINE_SCRIPT.test(command)) found.push(...findInScript(command));
  return found;
}

/**
 * @param {string} toolName
 * @param {object} input tool_input
 * @returns {Array<{kind: string, shown: string}>}
 */
function findVisibleBrowser(toolName, input) {
  if (!input) return [];
  if (toolName === 'Bash' || toolName === 'PowerShell') return findInCommand(input.command);
  if (typeof input.file_path !== 'string' || !CODE_FILE.test(input.file_path)) return [];
  if (toolName === 'Write') return findInScript(input.content);
  if (toolName === 'Edit') return findInScript(input.new_string);
  if (toolName === 'MultiEdit' && Array.isArray(input.edits)) return input.edits.flatMap((e) => findInScript(e && e.new_string));
  return [];
}

/** The written text or command carries the override. */
function hasBypass(input) {
  if (!input) return false;
  const edits = Array.isArray(input.edits) ? input.edits.map((e) => (e && e.new_string) || '') : [];
  return [input.command, input.content, input.new_string, ...edits].some((t) => typeof t === 'string' && BYPASS.test(t));
}

module.exports = { findVisibleBrowser, findInScript, findInCommand, hasBypass };

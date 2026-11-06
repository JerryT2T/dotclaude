#!/usr/bin/env node
/**
 * @hook pre.visible-browser.guard
 * @version 0.1.0
 * @event PreToolUse
 * @plugin devops
 * @matcher Bash|PowerShell|Write|Edit|MultiEdit
 * @description Block scripts and commands that open a visible non-Edge browser window.
 *   On 2026-11-06 a GPU benchmark launched Chrome for Testing with
 *   `headless: false` and a window appeared on the user's desktop. A rule in
 *   browser-tool-strategy.md did not stop it, because the script was written
 *   rather than driven through a browser tool. Headless runs stay allowed; they
 *   open no window. Matching lives in lib/visible-browser-match.
 *
 *   Bypass (only when the user explicitly wants this non-Edge window): the text
 *   DEVOPS_ALLOW_VISIBLE_BROWSER in the command or written code, or
 *   DEVOPS_ALLOW_VISIBLE_BROWSER=1 in the hook environment. Fails open on any error.
 */

require('../lib/plugin-guard');

const TOOLS = new Set(['Bash', 'PowerShell', 'Write', 'Edit', 'MultiEdit']);

function message(found) {
  const lines = found.slice(0, 3).map((f) => `- ${f.shown}`);
  return `[visible-browser] Not started. This would open a visible non-Edge browser window on the user's desktop:\n${lines.join('\n')}\n`
    + 'Instead, pick one:\n'
    + "- A window is needed: use Edge. Playwright: channel: 'msedge' in the same launch options, or --browser=msedge. Puppeteer: executablePath pointing at msedge.exe.\n"
    + '- No window is needed: run headless. Chrome for Testing is fine there.\n'
    + 'Rule: deep-knowledge/browser-tool-strategy.md. '
    + 'The text DEVOPS_ALLOW_VISIBLE_BROWSER in the command or code overrides, only when the user asked for this window.';
}

/**
 * @param {object} hook parsed payload
 * @returns {{block: string}|null}
 */
function main(hook) {
  if (!hook || !TOOLS.has(hook.tool_name) || !hook.tool_input) return null;
  const { findVisibleBrowser, hasBypass } = require('../lib/visible-browser-match');
  if (process.env.DEVOPS_ALLOW_VISIBLE_BROWSER === '1' || hasBypass(hook.tool_input)) return null;
  const found = findVisibleBrowser(hook.tool_name, hook.tool_input);
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

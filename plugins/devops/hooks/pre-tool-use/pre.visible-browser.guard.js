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
    + '- Default: run headless, also for a real GPU (--enable-gpu --use-angle=d3d11 --ignore-gpu-blocklist, confirm UNMASKED_RENDERER_WEBGL). Chrome for Testing is fine there.\n'
    + "- A window is really needed (the user asked for one, or is away): use Edge, started minimized and never brought to the front. Playwright: channel: 'msedge' in the same launch options, or --browser=msedge. Puppeteer: executablePath pointing at msedge.exe.\n"
    + 'Rule: deep-knowledge/browser-tool-strategy.md. '
    + 'The text DEVOPS_ALLOW_VISIBLE_BROWSER in the command or code overrides, only when the user asked for this window.';
}

function userBrowser(cwd) {
  try { return require('../lib/browser-choice').resolveBrowser({ cwd }).id; } catch { return 'edge'; }
}

/**
 * @param {object} hook parsed payload
 * @returns {{block: string}|null}
 */
function check(hook, browserOf = userBrowser) {
  if (!hook || !TOOLS.has(hook.tool_name) || !hook.tool_input) return null;
  const { findVisibleBrowser, hasBypass } = require('../lib/visible-browser-match');
  if (process.env.DEVOPS_ALLOW_VISIBLE_BROWSER === '1' || hasBypass(hook.tool_input)) return null;
  let found = findVisibleBrowser(hook.tool_name, hook.tool_input);
  // Chrome chosen as the user's browser (devops Home → Einstellungen): starting it is the rule, not a breach.
  if (found.some((f) => f.kind === 'executable') && browserOf(hook.cwd) === 'chrome') found = found.filter((f) => f.kind !== 'executable');
  return found.length ? { block: message(found) } : null;
}

function main(hook) {
  return check(hook);
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'PreToolUse' });
  } catch {
    // fail open
  }
}

module.exports = { main, check };

#!/usr/bin/env node
/**
 * @hook pre.bash.output-filter
 * @version 0.1.0
 * @event PreToolUse
 * @plugin devops
 * @matcher Bash|PowerShell
 * @description Alpha feature `bash-output-filter`. Rewrites ONE plain
 *   test/build/lint command (`npm test`, `npm run test*|build*|lint*`,
 *   `vitest run`, `jest`, `pytest`, `cargo|go|dotnet test|build`, `tsc`,
 *   `eslint`, pnpm/yarn forms), optionally after one `cd <path> &&`, to
 *   `node "<root>/scripts/run-filtered.js" -- <command>` so only the summary
 *   and the failure lines reach the context and the full output goes to a
 *   file. Only in permission mode bypassPermissions (a rewritten command
 *   would miss the user's allow rules otherwise), never for a background
 *   call, a watch mode, a pipe/redirect/chain or an env prefix. Fail-open.
 */

require('../lib/plugin-guard');

const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const FEATURE = 'bash-output-filter';

const CD_PREFIX = /^\s*(cd\s+(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s&|;<>"'`$()]+))\s*&&\s*/;
// `%`, `^` and an escaped quote mean something else to cmd.exe, which runs the
// command on Windows: such a command is left as it is.
const FORBIDDEN = /[|;&<>`\r\n%^]|\$\(|\\["']/;
const SCRIPT = '(?:test|build|lint)[\\w:.-]*';
const RUNNERS = [
  new RegExp(`^(?:npm|pnpm|yarn)\\s+test\\b`),
  new RegExp(`^(?:npm|pnpm|yarn)\\s+(?:run|run-script)\\s+${SCRIPT}(?:\\s|$)`),
  new RegExp(`^(?:pnpm|yarn)\\s+${SCRIPT}(?:\\s|$)`),
  /^(?:npx\s+)?vitest\s+run\b/,
  /^(?:npx\s+)?jest\b/,
  /^(?:python3?\s+-m\s+)?pytest\b/,
  /^cargo\s+(?:test|build)\b/,
  /^go\s+(?:test|build)\b/,
  /^dotnet\s+(?:test|build)\b/,
  /^(?:npx\s+)?tsc\b/,
  /^(?:npx\s+)?eslint\b/,
];

/**
 * The rewritten command, or null when the command is not eligible.
 * @param {string} command
 * @param {string} root plugin root, forward slashes
 */
function rewrite(command, root) {
  if (typeof command !== 'string' || /run-filtered/.test(command)) return null;
  let rest = command;
  let cd = '';
  const m = CD_PREFIX.exec(rest);
  if (m) { cd = m[1]; rest = rest.slice(m[0].length); }
  rest = rest.trim();
  if (!rest || FORBIDDEN.test(rest) || /^\w+=/.test(rest)) return null;
  if (!RUNNERS.some((re) => re.test(rest))) return null;
  const tokens = rest.split(/\s+/);
  if (tokens.some((t) => t === '-w' || /^--watch/i.test(t))) return null;
  if (/^(?:npm|pnpm|yarn)\s+(?:run(?:-script)?\s+)?\S*(?:watch|dev)/i.test(rest)) return null;
  return `${cd ? `${cd} && ` : ''}node "${root}/scripts/run-filtered.js" -- ${rest}`;
}

/**
 * @param {object} hook parsed payload
 * @param {{allowed?: () => boolean, root?: string}} [deps] test seam
 */
function main(hook, deps = {}) {
  if (!hook || !SHELL_TOOLS.has(hook.tool_name)) return null;
  const input = hook.tool_input || {};
  if (input.run_in_background === true) return null;
  if (hook.permission_mode !== 'bypassPermissions') return null;
  const allowed = deps.allowed || (() => require('../lib/features').featureAllowed(FEATURE));
  if (!allowed()) return null;
  const root = deps.root || require('../lib/plugin-root').pluginRoot();
  const command = rewrite(input.command, root);
  if (!command) return null;
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...input, command } },
  });
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'PreToolUse' });
  } catch {
    // fail open
  }
}

module.exports = { main, rewrite };

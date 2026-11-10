#!/usr/bin/env node
/**
 * @hook pre.merge.guard
 * @version 0.1.0
 * @event PreToolUse
 * @plugin devops
 * @matcher Bash|PowerShell|Write
 * @description Never pick a side wholesale — on EVERY branch and worktree.
 *   Parallel work only survives a merge when conflicts are resolved hunk by
 *   hunk with both intents kept (deep-knowledge/merge-safety.md § Parallel
 *   Shipping Without Losses). A whole-side pick is how a teammate's work
 *   silently vanished. Blocked:
 *     - `git checkout --ours|--theirs`, `git restore --ours|--theirs`,
 *       `git merge-file --ours|--theirs|--union`
 *     - `-X ours|theirs` / `-Xours` / `--strategy-option=ours|theirs`
 *       on merge, pull, rebase, cherry-pick, revert, am
 *     - `-s ours` / `--strategy=ours` on the same commands
 *     - a Write tool call that replaces a file whose index entry is currently
 *       unmerged (`git ls-files -u -- <path>` non-empty). Edit stays allowed:
 *       it changes one hunk and keeps the rest.
 *   Supersedes the --ours/--theirs ban that pre.main.guard applied on main only.
 *
 *   Bypass (only when the user explicitly asks for a whole-side pick):
 *   inline `DEVOPS_ALLOW_SIDE_PICK=1` in the command, or the variable set in
 *   the hook environment. A Write over a conflicted file has no bypass: use
 *   Edit, or `git add` the hand-merged result through Edit. Fails open on any
 *   error (a probe that cannot run never blocks).
 */

require('../lib/plugin-guard');

const fs = require('fs');
const path = require('path');

const SIDE = String.raw`(?:ours|theirs)`;
const MERGING = String.raw`(?:merge|pull|rebase|cherry-pick|revert|am)`;
const ARG = String.raw`(?:\s+[^\n;&|]*)?`;

const MESSAGE_CMD = 'Never take a whole side (--ours/--theirs/-X ours|theirs/-s ours): it silently drops the other person\'s work. '
  + 'Resolve conflicts hunk by hunk with Edit and keep both intents; for a real either-or, ask the user '
  + '(visual -> concept page, logic -> text question; deep-knowledge/merge-safety.md). '
  + 'Only when the user explicitly asked for a whole-side pick: inline DEVOPS_ALLOW_SIDE_PICK=1.';

const MESSAGE_WRITE = 'hunkweise auflösen, beide Absichten behalten: this file is unmerged (conflicted), '
  + 'a Write replaces it wholesale and drops one side. Use Edit on the conflict hunks instead '
  + '(read both sides: git diff :1:<file> :2:<file>, git diff :1:<file> :3:<file>).';

let patterns = null;
function sidePatterns() {
  if (patterns) return patterns;
  const { gitCommandRe } = require('../lib/ship-guard-match');
  patterns = [
    gitCommandRe(String.raw`(?:checkout|restore)` + ARG + String.raw`\s--` + SIDE + String.raw`\b`),
    gitCommandRe(String.raw`merge-file` + ARG + String.raw`\s--(?:ours|theirs|union)\b`),
    gitCommandRe(MERGING + ARG + String.raw`\s(?:-X\s*|--strategy-option(?:=|\s+))` + SIDE + String.raw`\b`),
    gitCommandRe(MERGING + ARG + String.raw`\s(?:-s\s*|--strategy(?:=|\s+))ours\b`),
  ];
  return patterns;
}

/** True when `cmd` (Bash/PowerShell) takes a whole side. */
function takesWholeSide(cmd) {
  const { matchesGitCommand } = require('../lib/ship-guard-match');
  return matchesGitCommand(cmd, sidePatterns());
}

/** True when `file` has unmerged index entries in the repo containing `cwd`. */
function isUnmerged(file, cwd) {
  const { gitOut } = require('../lib/git-timeout');
  const abs = path.isAbsolute(file) ? file : path.resolve(cwd, file);
  let stat;
  try { stat = fs.statSync(abs); } catch { return false; } // a new file cannot be unmerged
  if (!stat.isFile()) return false;
  const out = gitOut(path.dirname(abs), ['ls-files', '-u', '--', path.basename(abs)]);
  return typeof out === 'string' && out.trim() !== '';
}

/**
 * @param {object} hook parsed payload
 * @returns {{block: string}|null}
 */
function main(hook) {
  if (!hook) return null;
  const tool = hook.tool_name;
  const input = hook.tool_input || {};
  if (tool === 'Write') {
    const file = typeof input.file_path === 'string' ? input.file_path : '';
    if (!file) return null;
    return isUnmerged(file, hook.cwd || process.cwd()) ? { block: `[pre.merge.guard] ${MESSAGE_WRITE}` } : null;
  }
  if (tool !== 'Bash' && tool !== 'PowerShell') return null;
  const cmd = typeof input.command === 'string' ? input.command : '';
  if (!cmd || !/\b(?:ours|theirs|union)\b|-X|-s\b/.test(cmd)) return null;
  if (process.env.DEVOPS_ALLOW_SIDE_PICK === '1' || /(?:^|[\s;&|])DEVOPS_ALLOW_SIDE_PICK=1\b/.test(cmd)) return null;
  return takesWholeSide(cmd) ? { block: `[pre.merge.guard] ${MESSAGE_CMD}` } : null;
}

if (require.main === module) {
  try {
    require('../lib/hook-input').runHook(main, { event: 'PreToolUse' });
  } catch {
    // fail open
  }
}

module.exports = { main, takesWholeSide, isUnmerged };

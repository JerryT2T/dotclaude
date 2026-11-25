#!/usr/bin/env node
/**
 * @hook pre.main.guard
 * @version 0.8.0
 * @event PreToolUse
 * @plugin devops
 * @matcher Bash|PowerShell
 * @description Prevent accidental writes on local main/master.
 *
 *   Blocks Bash commands that would mutate main when HEAD is on main/master:
 *     git commit, git merge, git rebase, git cherry-pick,
 *     git push (any form except the remote deletes below), git reset --hard,
 *     git revert, git apply, git am
 *
 *   Bypass conditions (any one of them → exit 0):
 *     - The directory the command acts on is not inside a git repo
 *     - HEAD is NOT main/master
 *     - The repo has no commit at all (project setup: the first commit has
 *       nothing to branch off), and the push of that single first commit while
 *       no remote-tracking branch exists. Never a force push or delete.
 *     - A write to a repo the session does not sit in, when that repo is new
 *       (unborn main), lies in a session scratchpad, or is pushed for the
 *       first time (no remote-tracking branch yet)
 *     - Sentinel file .claude/.ship-in-progress exists (ship pipeline active)
 *     - DEVOPS_ALLOW_MAIN=1 in environment
 *
 *   Allowed on main: deleting remote branches that are not the default
 *   branch (`git push <remote> --delete|-d <ref>...`, `git push <remote>
 *   :<ref>`) — it writes neither local nor remote main. Protected
 *   (case-insensitive): main, master and the branch refs/remotes/<remote>/HEAD
 *   points to for every remote named; a remote without a known HEAD blocks
 *   (fail closed). Every push in the command must be such a pure delete (no
 *   --force/--mirror/--all/--prune, plain ref names only); any other write
 *   command chained in (`&& git commit`) still blocks. Bash only: a
 *   PowerShell command keeps the plain block.
 *
 *   Shell wrappers are unwrapped (lib/shell-inner.js, up to 3 levels): the
 *   inner command of `bash|sh|zsh|dash|ksh -c '…'` (also `-lc`), `cmd /c …`,
 *   `pwsh|powershell -c|-Command …` and the body of a here-doc fed to a bare
 *   shell (`bash <<'EOF'`, `bash -s <<EOF`) is judged like a plain command,
 *   with the directory in effect at the wrapper and its own `cd`s (which do
 *   not leak out). A here-doc that is content (`cat > f <<EOF`) is not.
 *   Not seen: `ssh host '…'`, `xargs git …`, `eval "…"`, `cat <<EOF | bash`.
 *
 *   Read-only git commands (status, log, diff, fetch, branch listing) pass
 *   through untouched.
 *
 *   The remedy depends on where the block happens (lib/branch-fix.js): in
 *   the repo's MAIN checkout — possibly shared by several sessions — the
 *   session moves into its own worktree instead of switching the shared
 *   checkout's branch; in a linked worktree `git switch -c` stays the fix.
 *
 *   Every git probe goes through lib/git-timeout.js's gitOut — GIT_TIMEOUT_MS
 *   per call; before, these calls had no timeout at all. A failed or hung
 *   probe reads as "not a repo" / "no branch" / "no origin", as a failure
 *   always did.
 */

// A lib that fails to load (half-written during a plugin update, version skew)
// makes this hook a silent no-op instead of a hook error on every Bash call
// (AUD-028).
let gitOut, hasNoCommits, isFirstCommitOnly, insideSafe, sentinelActive, isLinkedWorktree, gitCommonDir, samePath, isFastForwardOfMain, branchFix, foreignFix, threadWorktreeFor, ownWorktreeDecided, BYPASS, gitCommandRe, matchesGitCommand, gitSegments, unattributedGitWrite, WORD_END, remoteDeleteTargets;
try {
  require('../lib/plugin-guard');
  ({ gitCommandRe, matchesGitCommand, gitSegments, unattributedGitWrite, isFastForwardOfMain, WORD_END, remoteDeleteTargets } = require('../lib/ship-guard-match'));
  ({ gitOut } = require('../lib/git-timeout'));
  ({ hasNoCommits, isFirstCommitOnly } = require('../lib/empty-repo'));
  ({ insideSafe } = require('../lib/thread-rights'));
  ({ isActive: sentinelActive } = require('../lib/ship-sentinel'));
  ({ isLinkedWorktree, gitCommonDir, samePath } = require('../lib/project-root'));
  ({ branchFix, foreignFix, threadWorktreeFor, ownWorktreeDecided, BYPASS } = require('../lib/branch-fix'));
} catch (err) {
  // Silent to the user and the model (exit 0), but not traceless: the line
  // lands in the hook log, so a persistent load error can be found (AUD-068).
  process.stderr.write(`[pre.main.guard] off — a lib failed to load: ${(err && err.message) || err}\n`);
  process.exit(0);
}

// Matched at every command position of the (quote-masked) command, so a
// chained `git add -A && git commit`, `git -C <dir> commit` and
// `git -c k=v commit` are caught; a commit message or echo that merely
// mentions "git commit" is not (lib/ship-guard-match.js).
const WRITE_PATTERNS = [
  'commit', 'merge', 'rebase', 'cherry-pick', 'revert', String.raw`reset\s+--hard`,
  'apply', 'am', 'restore', String.raw`checkout\s+(?:--ours|--theirs|--patch|-p)`,
  'clean', String.raw`stash\s+(?:pop|drop|apply|clear)`, 'update-ref',
].map(rest => gitCommandRe(rest + WORD_END));
// push is separate: a pure remote-branch delete is allowed on main (see header).
const PUSH_PATTERN = gitCommandRe('push' + WORD_END);
WRITE_PATTERNS.push(gitCommandRe(String.raw`checkout(?:\s+[^\n;&|]*)?\s--(?=\s)`));

// The setup push in its one plain shape. Allow-list, not a force-flag search: a
// variable, `-c remote.*.push=+…`, an abbreviated option or another refspec
// leaves a "push" behind and keeps the block.
const SETUP_PUSH = /(^|&&|;|\n)\s*git(?:\s+-C\s+(?:"[^"$`]*"|[\w./:\\-]+))?\s+push(?:\s+(?:-u|--set-upstream))?\s+origin\s+(?:main|master)(?:\s+2>&1)?\s*(?=$|&&|;|\n)/g;
const onlySetupPush = (cmd) => !/push|\$|`/i.test(cmd.replace(SETUP_PUSH, '$1'));

function currentBranch(cwd) {
  return gitOut(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
}

function isGitRepo(cwd) {
  return gitOut(cwd, ['rev-parse', '--is-inside-work-tree']) !== null;
}

/**
 * Does this repo have an `origin` remote?
 *
 * The block itself stays correct without one — "don't work directly on main"
 * is about branch hygiene, not about the remote. But the SUGGESTED FIX was
 * `git fetch origin && git switch -c <topic> origin/main`, which in a
 * local-only repo fails twice over ("'origin' does not appear to be a git
 * repository", then "invalid reference: origin/main"). The user was left
 * blocked with an escape hatch that could not be executed.
 */
function hasRemote(cwd) {
  return gitOut(cwd, ['remote', 'get-url', 'origin']) !== null;
}

let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { inputData += d; });
process.stdin.on('end', () => {
  let hook;
  try { hook = JSON.parse(inputData); } catch { process.exit(0); }

  const tool = hook.tool_name || '';
  if (tool !== 'Bash' && tool !== 'PowerShell') process.exit(0);

  const cmd = (hook.tool_input || {}).command || '';
  if (!cmd) process.exit(0);

  // Cheap exit: no word "git" anywhere (quoted wrapper commands and here-docs
  // included) → nothing to check. The real decision is made per segment below.
  if (!/git/i.test(cmd)) process.exit(0);

  const cwd = hook.cwd || process.cwd();

  if (process.env.DEVOPS_ALLOW_MAIN === '1') process.exit(0);

  // Each git write is checked against the directory IT acts on (`git -C`,
  // `cd <dir> &&`, `pushd`, `Set-Location`), not only the session's start
  // folder: a session started in a non-repo folder such as P:\Projects used to
  // pass every write. An unreadable directory falls back to the cwd, as before.
  const targets = new Map();
  const remoteCache = new Map();
  /** Is `name` a configured remote of the repo at `dir`? No answer (timeout, no repo) reads as no. */
  const remoteOf = (dir) => (name) => {
    if (!remoteCache.has(dir)) {
      const out = gitOut(dir, ['remote']);
      remoteCache.set(dir, out === null ? [] : out.split(/\r?\n/).map(l => l.trim()).filter(Boolean));
    }
    return remoteCache.get(dir).includes(name);
  };
  const segments = gitSegments(cmd, cwd);
  for (const seg of segments) {
    const other = matchesGitCommand(seg.text, WRITE_PATTERNS);
    const push = matchesGitCommand(seg.text, [PUSH_PATTERN]);
    if (!other && !push) continue;
    // Post-ship cleanup: a pure fast-forward of main/master to its remote is no own work on main.
    if (isFastForwardOfMain(seg.text, remoteOf(seg.dir || cwd))) continue;
    const dir = seg.dir || cwd;
    const prev = targets.get(dir) || { otherWrite: false };
    targets.set(dir, { otherWrite: prev.otherWrite || other });
  }
  // A write no attributed segment accounts for (exotic syntax): the session's folder is checked too,
  // also when other segments were attributed or a fast-forward was seen.
  const strayOther = unattributedGitWrite(cmd, segments, WRITE_PATTERNS);
  if (strayOther || unattributedGitWrite(cmd, segments, [PUSH_PATTERN])) {
    const prev = targets.get(cwd) || { otherWrite: false };
    targets.set(cwd, { otherWrite: prev.otherWrite || strayOther });
  }

  for (const [dir, { otherWrite }] of targets) checkDir(hook, tool, cmd, dir, otherWrite);
  process.exit(0);
});

/** Does the write act on another repository than the one the session sits in (or sits in none)? */
function isForeign(sessionCwd, dir) {
  const own = sessionCwd ? gitCommonDir(sessionCwd) : null;
  const target = gitCommonDir(dir);
  return Boolean(target && !(own && samePath(own, target)));
}

/** Exits 2 with the reason when a write in `cmd` acting on `cwd` lands on main/master of its repo. */
function checkDir(hook, tool, cmd, cwd, otherWrite) {
  if (!isGitRepo(cwd)) return;
  if (sentinelActive(cwd)) return;
  // The ship pipeline of THIS session's checkout also covers a write in another
  // worktree of the SAME repository (same git common dir) — never another repo.
  if (hook.cwd && sentinelActive(hook.cwd)) {
    const own = gitCommonDir(hook.cwd);
    const target = gitCommonDir(cwd);
    if (own && target && samePath(own, target)) return;
  }

  const branch = currentBranch(cwd);
  if (!branch) return;
  if (branch !== 'main' && branch !== 'master') return;

  // A repo the session does not sit in: creating one (git init, first commit, first
  // push) and a scratchpad repo are normal work, not a write on somebody's main.
  const foreign = isForeign(hook.cwd, cwd);
  if (foreign) {
    if (gitOut(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']) === null) return;
    if (/[\\/]scratchpad(?:[\\/]|$)/i.test(cwd) && insideSafe(cwd, hook.cwd)) return;
    if (!otherWrite && hasRemote(cwd) && !gitOut(cwd, ['for-each-ref', '--count=1', 'refs/remotes'])) return;
  }

  // A repo without any commit (or with only the setup commit, not yet pushed)
  // has nothing to branch off: project setup may create and push it (#1237).
  // Only the plain `git push [-u] origin main`: a force push or delete could hit an existing remote main.
  if (onlySetupPush(cmd) && (hasNoCommits(cwd) || (!otherWrite && hasRemote(cwd) && isFirstCommitOnly(cwd)))) return;

  // Only a push matched: a pure delete of non-default remote branches is fine.
  // Bash syntax only — PowerShell parses arguments differently, so it keeps
  // the plain block. Each named remote's default branch must be readable
  // (refs/remotes/<remote>/HEAD); unknown → block (fail closed).
  if (!otherWrite && tool === 'Bash') {
    const t = remoteDeleteTargets(cmd);
    if (t) {
      const protectedRefs = new Set(['main', 'master']);
      let known = true;
      for (const remote of t.remotes) {
        const head = gitOut(cwd, ['symbolic-ref', '--quiet', '--short', `refs/remotes/${remote}/HEAD`]);
        if (!head || !head.startsWith(`${remote}/`)) { known = false; break; }
        protectedRefs.add(head.slice(remote.length + 1).toLowerCase());
      }
      if (known && !t.refs.some(r => protectedRefs.has(r.toLowerCase()))) return;
    }
  }

  // Without an origin the remote-based fix is not executable — offer the
  // local-only equivalent instead of a command that is guaranteed to fail.
  const remote = hasRemote(cwd);
  const rule = remote
    ? `Never commit/merge/push directly on ${branch}. Work on a branch derived from origin/${branch} and land via /do-ship.`
    : `Never commit directly on ${branch}. Work on a feature branch and land it via /do-ship.`;
  const top = gitOut(cwd, ['rev-parse', '--show-toplevel']);
  const threadWorktree = threadWorktreeFor(hook, top || cwd);
  const fix = foreign && !threadWorktree && !hook.agent_id ? foreignFix({ branch, remote, repo: top || cwd }) : branchFix({
    branch,
    remote,
    // Unknown top level → treat as the shared main checkout: the safe remedy.
    mainCheckout: !(top && isLinkedWorktree(top)),
    subagent: Boolean(hook.agent_id),
    ownWorktree: ownWorktreeDecided(top || cwd),
    threadWorktree,
  });

  process.stderr.write(
    `[pre.main.guard] BLOCKED: Write operation on local '${branch}' is not allowed.\n` +
    `[pre.main.guard] Rule: ${rule}\n` +
    fix.map(l => `[pre.main.guard] ${l}\n`).join('') +
    `[pre.main.guard] ${BYPASS}\n`
  );
  process.exit(2);
}

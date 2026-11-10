#!/usr/bin/env node
/**
 * @hook ss.git.sync
 * @version 1.4.0
 * @event SessionStart
 * @plugin devops
 * @description Starts ONE detached background git sync for this worktree.
 *   Produces no output — ever. Whatever the sync finds is picked up by
 *   prompt.git.sync on the next user turn.
 *
 *   BREAKING (v1.0.0): no longer registers a ten-minute CronCreate job.
 *   A cron tick is a full Claude turn — inline Bash call, a model reply, and
 *   completion/stop hooks to suppress afterwards — fired every ten minutes for
 *   a fetch+merge that is silent in the overwhelming majority of ticks. The
 *   sync needs no model unless a conflict is genuinely ambiguous, so it now
 *   runs as a detached child process (see hooks/lib/git-sync-bg.js) and only
 *   surfaces in chat when it actually merged something or hit a conflict.
 *   In-session recurrence is covered by stop.git.sync (throttled, per Stop).
 */

require('../lib/plugin-guard');

const { execSync } = require('child_process');
const { claimSyncSlot, startBackgroundSync, remoteMoved, FLOOR_MS } = require('../lib/git-sync-bg');
const gitFs = require('../lib/git-fs');

// The session's directory, not the hook process's: Desktop starts hooks of a
// worktree session in the repo root (see hook-input sessionCwd).
// Only as the hook entry point: imported by a test, a sync stdin read blocks forever.
const cwd = require.main === module ? require('../lib/hook-input').sessionCwd().cwd : process.cwd();

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { windowsHide: true,
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

// Inside the throttle window nothing below matters: the common case ends here.
if (!claimSyncSlot(cwd, { peek: true, throttleMs: FLOOR_MS })) process.exit(0);

// Only sync in a git repo on a branch with a remote. The default branch syncs
// too (#802): git-sync fast-forwards it and detects the default branch itself.
// Read from `.git`, a git spawn costs about a second (lib/git-fs).
const tree = gitFs.workTree(cwd);
if (!tree) process.exit(0);
const remote = gitFs.hasRemote(tree);
if (remote === false || (remote === null && !git('remote'))) process.exit(0);

// HEAD's ref, never `rev-parse --abbrev-ref`: that answers the literal 'HEAD' on
// a detached HEAD, which would burn the 30-minute throttle slot on a sync the
// child then refuses outright. These worktrees sit detached between tasks, so
// that is the common state.
if (!tree.ref) process.exit(0);
if (!tree.branch && !git('symbolic-ref --quiet --short HEAD')) process.exit(0);

// A session resumed in the middle of a ship must not merge under the pipeline:
// ship rebases and releases what it just tested, and a background merge commit
// arriving in between changes the tree out from under it.
try {
  if (require('../lib/ship-sentinel').isActive(cwd)) process.exit(0);
} catch { /* sentinel unreadable — proceed */ }

// Throttle is worktree-scoped, so reopening Claude five times in ten minutes
// (or running two sessions on the same worktree) still yields one sync.
if (!claimSyncSlot(cwd, { throttleMs: FLOOR_MS })) process.exit(0);

// Remote-moved trigger, same as stop.git.sync: sync only when the followed
// remote heads differ from the last completed sync (none recorded = first sync).
const branchName = tree.branch || git('symbolic-ref --quiet --short HEAD');
const { moved, signature } = remoteMoved(cwd, branchName);
if (!moved) process.exit(0);

startBackgroundSync(cwd, { signature });
process.exit(0);

'use strict';
/**
 * @module empty-repo
 * @version 0.1.0
 * @plugin devops
 * @description Is a repository brand new? The main guards (pre.main.guard,
 *   pre.edit.branch) forbid work on main, but a repo without any commit has
 *   nothing to branch off: no worktree can be created, so the guard would
 *   dead-end project setup (#1237). Only a PROVEN answer opens the gate: a
 *   failed or hung git call reads as "not empty" (the guard keeps blocking).
 *
 *   hasNoCommits(root)        no commit on any ref (an orphan `main` next to
 *     other branches, or a fetched remote, is not empty)
 *   isFirstCommitOnly(root)   HEAD is the only commit and no remote-tracking
 *     branch exists yet: the state right after the setup commit, before its push
 */

const { gitRun } = require('./git-timeout');

/** Trimmed stdout ('' stays ''), or null when git failed or timed out. */
function probe(root, args) {
  try { return String(gitRun(root, args)).trim(); } catch { return null; }
}

function hasNoCommits(root) {
  return probe(root, ['rev-list', '-n', '1', '--all']) === '';
}

function isFirstCommitOnly(root) {
  return probe(root, ['rev-list', '--count', '--all']) === '1'
    && probe(root, ['for-each-ref', '--count=1', 'refs/remotes']) === '';
}

module.exports = { hasNoCommits, isFirstCommitOnly };

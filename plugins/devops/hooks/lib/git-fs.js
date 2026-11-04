'use strict';
/**
 * @module git-fs
 * @version 0.1.0
 * @plugin devops
 * @description Answers the git questions SessionStart modules ask on every
 *   start from the files in `.git`, without a process. A `git` spawn costs about
 *   a second on a Windows machine with a few sessions running (measured: even
 *   `git --version` 0.7–1.5 s), and ss.git.check alone made 13 of them.
 *
 *   Every answer is either certain or `null` ("ask git"): a reftable repo
 *   (HEAD names `refs/heads/.invalid`), a config with an `[include]` and an
 *   unborn-looking HEAD fall back to the caller's git call. Never throws.
 */

const fs = require('fs');
const path = require('path');
const { findRepoRoot, gitCommonDir, isLinkedWorktree } = require('./project-root');

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

/** The work tree's own git dir: `.git`, or the admin dir its `.git` file names. */
function ownGitDir(root) {
  const dotGit = path.join(root, '.git');
  try {
    if (fs.statSync(dotGit).isDirectory()) return dotGit;
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, 'utf8'));
    return m ? path.resolve(root, m[1]) : null;
  } catch { return null; }
}

/**
 * What `git rev-parse --is-inside-work-tree` plus `symbolic-ref HEAD` would say.
 * @returns {{root:string, gitDir:string, commonDir:string, linked:boolean, ref:string|null, branch:string|null}|null}
 *   null outside a work tree (also inside a `.git` directory, and for a `.git`
 *   without a readable HEAD). `ref` null = detached HEAD. `branch` is null on a
 *   detached HEAD and when HEAD cannot tell (reftable): compare `ref`.
 */
function workTree(cwd) {
  if (typeof cwd !== 'string' || !cwd) return null;
  if (path.resolve(cwd).split(path.sep).includes('.git')) return null;
  const root = findRepoRoot(cwd);
  if (!root) return null;
  const gitDir = ownGitDir(root);
  const commonDir = gitCommonDir(root);
  if (!gitDir || !commonDir) return null;
  const head = read(path.join(gitDir, 'HEAD'));
  if (head === null) return null;
  const m = /^ref:\s*(\S+)/.exec(head);
  const ref = m ? m[1] : null;
  const branch = ref && ref.startsWith('refs/heads/') && ref !== 'refs/heads/.invalid' ? ref.slice('refs/heads/'.length) : null;
  return { root, gitDir, commonDir, linked: isLinkedWorktree(root), ref, branch };
}

/** @returns {true|null} true when HEAD resolves to a commit; null = ask git. */
function hasCommit(tree) {
  if (!tree) return null;
  if (!tree.ref) return true; // a detached HEAD holds a commit id
  if (read(path.join(tree.gitDir, tree.ref)) !== null) return true;
  if (read(path.join(tree.commonDir, tree.ref)) !== null) return true;
  const packed = read(path.join(tree.commonDir, 'packed-refs'));
  return packed !== null && packed.split(/\r?\n/).some((l) => l.endsWith(` ${tree.ref}`)) ? true : null;
}

/** @returns {boolean|null} is a remote configured? null = ask git (an include may add one). */
function hasRemote(tree) {
  if (!tree) return null;
  const config = read(path.join(tree.commonDir, 'config'));
  if (config === null) return null;
  if (/^\s*\[remote\s+"/m.test(config)) return true;
  return /^\s*\[include/im.test(config) ? null : false;
}

module.exports = { workTree, hasCommit, hasRemote, ownGitDir };

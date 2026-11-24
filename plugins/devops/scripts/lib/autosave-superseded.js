'use strict';
/**
 * @module scripts/lib/autosave-superseded
 * @version 0.1.0
 * @plugin devops
 * @description Is a `parked/autosave/<worktree>` snapshot only an intermediate
 *   state of work that a squash-merged PR carried to the default branch?
 *   The snapshot commit (hooks/lib/session-autosave.js) has the session HEAD
 *   as first parent; its tree adds the uncommitted files of that moment. git
 *   cannot prove a squash, so such a ref read as "partial" forever.
 *
 *   Superseded when one merged PR head H of the SAME session contains the
 *   first parent, and every file the snapshot changed over it was committed
 *   again by H's own later commits (non-merge, not from the base) or equals
 *   the base today. A file saved after the last commit passes neither.
 *   "Same session": the first parent is the session's own commit (not in the
 *   base), or H belongs to a branch named after the worktree. Read-only, fails
 *   closed. Callers still archive the tip by tag before deleting it.
 */

const { execFileSync } = require('child_process');

const PREFIX = 'parked/autosave/';
const SUBJECT = 'wip(session): autosave';
const MAX_HEADS = 1000;

function git(args, cwd) {
  try {
    return execFileSync('git', args, { windowsHide: true, cwd, encoding: 'utf8', timeout: 15_000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch { return null; }
}
const isAncestor = (a, b, cwd) => git(['merge-base', '--is-ancestor', a, b], cwd) !== null;
const names = (out) => out.split('\0').map((s) => s.trim()).filter(Boolean);

/**
 * @param {string} sha snapshot tip
 * @param {string|null} branch ref name without refs/heads/
 * @param {{cwd:string, baseRef:string, merged:{bySha:Set<string>, byName:Map<string,string[]>}|null}} ctx
 */
function autosaveSuperseded(sha, branch, ctx) {
  if (!sha || !ctx.merged || !String(branch || '').startsWith(PREFIX)) return false;
  const subject = git(['log', '-1', '--format=%s', sha], ctx.cwd);
  if (!subject || subject.trim() !== SUBJECT) return false;
  const parent = (git(['rev-parse', '--verify', '-q', `${sha}^1`], ctx.cwd) || '').trim();
  if (!parent) return false;
  const changed = git(['diff', '--no-renames', '--name-only', '-z', parent, sha], ctx.cwd);
  if (changed === null) return false;
  const files = names(changed);

  let heads;
  if (isAncestor(parent, ctx.baseRef, ctx.cwd)) {
    const wt = String(branch).slice(PREFIX.length);
    heads = [...ctx.merged.byName].filter(([n]) => n.split('/').pop() === wt).flatMap(([, shas]) => shas);
  } else if (ctx.viaMerged && !ctx.viaMerged.has(parent)) return false;
  else heads = [...ctx.merged.bySha];

  // paths whose content the base holds already need no later commit
  const differs = git(['diff', '--no-renames', '--name-only', '-z', sha, ctx.baseRef], ctx.cwd);
  if (differs === null) return false;
  const open = new Set(names(differs));
  const need = files.filter((f) => open.has(f));

  for (const head of heads.slice(0, MAX_HEADS)) {
    if (!isAncestor(parent, head, ctx.cwd)) continue; // also: head not available locally
    if (!need.length) return true;
    const log = git(['log', '--no-merges', '--no-renames', '--format=', '--name-only', '-z', head, `^${parent}`, `^${ctx.baseRef}`], ctx.cwd);
    if (log === null) continue;
    const touched = new Set(names(log));
    if (need.every((f) => touched.has(f))) return true;
  }
  return false;
}

module.exports = { autosaveSuperseded };

/**
 * @module anchor-recording
 * @version 0.1.0
 * @description The hook-side glue of the knowledge anchor (knowledge-anchor.js):
 *   which base the anchor tracks, who a fresh worktree inherits from, and the
 *   one entry point `ensureAnchor` that prompt.knowledge.anchor calls on user
 *   prompts.
 *
 *   Rules (concept: parallel ship without losses, d-knowledge / d-anchor):
 *     - first user prompt of a session -> anchor = origin/<base> tip (only when
 *       the worktree has none: an existing anchor is EARLIER-or-equal by
 *       construction, and a longer-lived anchor is the conservative one);
 *     - a fresh worktree / agent / side session INHERITS the earliest anchor of
 *       its chain: the nearest other worktree it was branched from (its HEAD is
 *       an ancestor of ours) that has an anchor — never its own start.
 *
 *   Interface (CommonJS):
 *     baseFor(cwd, branch?) -> string | null     deepest parent branch on the remote, else the default branch
 *     parentWorktree(cwd) -> string | null       path of the worktree this one descends from, with an anchor
 *     ensureAnchor(cwd, { session?, now? }) -> { action: 'exists'|'inherited'|'recorded'|'none', anchor }
 *
 *   Never throws.
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const anchorLib = require('./knowledge-anchor.js');

function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd, encoding: 'utf8', timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

const refExists = (cwd, ref) => Boolean(git(['rev-parse', '--verify', '--quiet', ref], cwd));

function defaultBranch(cwd) {
  const head = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd);
  const candidates = [];
  if (head && head.startsWith('origin/')) candidates.push(head.slice('origin/'.length));
  candidates.push('main', 'master');
  return candidates.find((c) => refExists(cwd, `refs/remotes/origin/${c}`)) || null;
}

/** Base the branch integrates: the deepest path-segment parent that exists on the remote, else the default branch. */
function baseFor(cwd, branch) {
  const br = branch || git(['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd);
  const dflt = defaultBranch(cwd);
  if (!br) return dflt;
  const parts = br.split('/');
  for (let i = parts.length - 1; i >= 1; i--) {
    const p = parts.slice(0, i).join('/');
    if (refExists(cwd, `refs/remotes/origin/${p}`)) return p;
  }
  return dflt;
}

function worktrees(cwd) {
  const out = git(['worktree', 'list', '--porcelain'], cwd);
  if (!out) return [];
  const list = [];
  let cur = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9).trim() }; list.push(cur); }
    else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5).trim();
  }
  return list;
}

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** The nearest other worktree this one descends from that carries an anchor. */
function parentWorktree(cwd) {
  try {
    const top = git(['rev-parse', '--show-toplevel'], cwd) || cwd;
    const ourHead = git(['rev-parse', 'HEAD'], cwd);
    if (!ourHead) return null;
    let best = null;
    for (const wt of worktrees(cwd)) {
      if (!wt.head || same(wt.path, top) || !anchorLib.readAnchor(wt.path)) continue;
      if (git(['merge-base', '--is-ancestor', wt.head, ourHead], cwd) === null) continue;
      const distance = Number(git(['rev-list', '--count', `${wt.head}..${ourHead}`], cwd));
      if (!Number.isFinite(distance)) continue;
      if (!best || distance < best.distance) best = { path: wt.path, distance };
    }
    return best ? best.path : null;
  } catch {
    return null;
  }
}

function ensureAnchor(cwd, { session, now } = {}) {
  try {
    const existing = anchorLib.readAnchor(cwd);
    if (existing) return { action: 'exists', anchor: existing };
    const base = baseFor(cwd);
    if (!base) return { action: 'none', anchor: null };
    const parent = parentWorktree(cwd);
    if (parent) {
      const a = anchorLib.inheritFrom(cwd, parent, { base, now });
      if (a) return { action: 'inherited', anchor: a };
    }
    const a = anchorLib.recordFirstPrompt(cwd, { base, session, now });
    return a ? { action: 'recorded', anchor: a } : { action: 'none', anchor: null };
  } catch {
    return { action: 'none', anchor: null };
  }
}

module.exports = { baseFor, defaultBranch, parentWorktree, ensureAnchor };

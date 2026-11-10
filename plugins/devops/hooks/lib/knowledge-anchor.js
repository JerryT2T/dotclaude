/**
 * @module knowledge-anchor
 * @version 0.1.0
 * @description The knowledge anchor ("Wissensstand") of a worktree: the
 *   origin/<base> commit up to which the user has seen the base branch.
 *   Everything on <base> after it is other people's work the survival check
 *   (survival.js) must find intact in the branch before a ship.
 *
 *   Lifecycle (recording hooks live elsewhere — this module is the store):
 *   - first user prompt of a session → `recordFirstPrompt` (only when no anchor exists)
 *   - each completed ship of the session → `afterShip` (reset forward to the new base tip)
 *   - a concept page opened → `pinEarlier` (moves the anchor back, never forward)
 *   - an agent / side session created from this worktree → `inheritFrom(parent)`:
 *     the EARLIEST anchor of the chain, never the child's own start
 *   Missing or unknown anchor → fallback = the fork point of the branch from
 *   origin/<base> (parent of the oldest own first-parent commit — stays
 *   correct after merge integrations, where plain merge-base would already
 *   be the upstream tip).
 *
 *   Interface (CommonJS):
 *     ANCHOR_FILE = '.claude/knowledge-anchor.json'   (runtime state, git-ignored)
 *     anchorPath(cwd) → absolute path in the worktree root
 *     readAnchor(cwd) → Anchor | null
 *     writeAnchor(cwd, anchor) → boolean
 *     recordFirstPrompt(cwd, { base, sha?, session?, now? }) → Anchor | null
 *     afterShip(cwd, { base, sha?, now? }) → Anchor | null
 *     pinEarlier(cwd, { base, sha, reason = 'concept-open', now? }) → Anchor | null
 *     inheritFrom(cwd, parent, { base?, now? }) → Anchor | null
 *         parent: Anchor object | parent worktree path | sha string
 *     earliest(cwd, shas[]) → sha | null   (ancestor order; unrelated → merge-base)
 *     fallbackAnchor(cwd, base) → sha | null   (fork point of HEAD from origin/<base>)
 *     resolveAnchor(cwd, { base }) → { sha, source: 'file' | 'fallback', reason, base } | null
 *     Anchor = { version: 1, base, sha, reason, at, session?, inheritedFrom?, history: [{ sha, reason, at }] }
 *
 *   Never throws; git failures answer null.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ANCHOR_FILE = path.join('.claude', 'knowledge-anchor.json');
const SHA_RE = /^[0-9a-f]{7,64}$/;
const MAX_HISTORY = 20;

function git(args, cwd) {
  try {
    return execFileSync('git', args, { windowsHide: true, cwd, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

const isoNow = (now) => new Date(now == null ? Date.now() : now).toISOString();
const commitOf = (cwd, rev) => (rev ? git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], cwd) : null);
const rootOf = (cwd) => git(['rev-parse', '--show-toplevel'], cwd) || cwd;

function anchorPath(cwd) {
  return path.join(rootOf(cwd), ANCHOR_FILE);
}

function readAnchor(cwd) {
  try {
    const data = JSON.parse(fs.readFileSync(anchorPath(cwd), 'utf8'));
    if (!data || typeof data.sha !== 'string' || !SHA_RE.test(data.sha)) return null;
    return data;
  } catch {
    return null;
  }
}

function writeAnchor(cwd, anchor) {
  try {
    if (!anchor || !SHA_RE.test(String(anchor.sha || ''))) return false;
    const file = anchorPath(cwd);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(anchor, null, 2)}\n`);
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/** Build the next anchor record, keeping a short history of earlier ones. */
function next(prev, patch, now) {
  const history = prev ? [...(prev.history || []), { sha: prev.sha, reason: prev.reason, at: prev.at }].slice(-MAX_HISTORY) : [];
  const { inheritedFrom, session } = prev || {};
  return { version: 1, ...(session ? { session } : {}), ...(inheritedFrom ? { inheritedFrom } : {}), ...patch, at: isoNow(now), history };
}

const tipOf = (cwd, base, sha) => commitOf(cwd, sha || (base ? `origin/${base}` : null));

/** First user prompt of a session: set only when the worktree has no anchor yet. */
function recordFirstPrompt(cwd, { base, sha, session, now } = {}) {
  const cur = readAnchor(cwd);
  if (cur) return cur;
  const tip = tipOf(cwd, base, sha);
  if (!tip) return null;
  const a = next(null, { base: base || null, sha: tip, reason: 'first-prompt', ...(session ? { session } : {}) }, now);
  return writeAnchor(cwd, a) ? a : null;
}

/** A ship of this session completed: the user now knows the new base tip. */
function afterShip(cwd, { base, sha, now } = {}) {
  const tip = tipOf(cwd, base, sha);
  if (!tip) return null;
  const a = next(readAnchor(cwd), { base: base || null, sha: tip, reason: 'after-ship' }, now);
  delete a.inheritedFrom;
  return writeAnchor(cwd, a) ? a : null;
}

/** Earliest of several commits: an ancestor wins; unrelated pairs collapse to their merge-base. */
function earliest(cwd, shas) {
  const list = (shas || []).map((s) => commitOf(cwd, s)).filter(Boolean);
  if (!list.length) return null;
  return list.reduce((a, b) => {
    if (a === b) return a;
    if (git(['merge-base', '--is-ancestor', a, b], cwd) !== null) return a;
    if (git(['merge-base', '--is-ancestor', b, a], cwd) !== null) return b;
    return git(['merge-base', a, b], cwd) || a;
  });
}

/** Move the anchor back to `sha` when it is earlier (concept open); never forward. */
function pinEarlier(cwd, { base, sha, reason = 'concept-open', now } = {}) {
  const tip = tipOf(cwd, base, sha);
  if (!tip) return null;
  const cur = readAnchor(cwd);
  if (!cur) {
    const a = next(null, { base: base || null, sha: tip, reason }, now);
    return writeAnchor(cwd, a) ? a : null;
  }
  const e = earliest(cwd, [cur.sha, tip]);
  if (!e || e === commitOf(cwd, cur.sha)) return cur;
  const a = next(cur, { base: cur.base || base || null, sha: e, reason }, now);
  return writeAnchor(cwd, a) ? a : null;
}

function parentSha(parent) {
  if (!parent) return { sha: null };
  if (typeof parent === 'string') {
    if (SHA_RE.test(parent)) return { sha: parent };
    const a = readAnchor(parent);
    return a ? { sha: a.sha, path: parent, base: a.base } : { sha: null };
  }
  return typeof parent.sha === 'string' ? { sha: parent.sha, base: parent.base } : { sha: null };
}

/** Agents / side sessions inherit the earliest anchor of their chain (parent's, or own when earlier). */
function inheritFrom(cwd, parent, { base, now } = {}) {
  const p = parentSha(parent);
  if (!p.sha) return null;
  const cur = readAnchor(cwd);
  const e = earliest(cwd, [p.sha, cur && cur.sha].filter(Boolean));
  if (!e) return null;
  if (cur && e === commitOf(cwd, cur.sha) && cur.inheritedFrom) return cur;
  const a = next(cur, { base: base || p.base || (cur && cur.base) || null, sha: e, reason: 'inherited' }, now);
  a.inheritedFrom = { sha: p.sha, ...(p.path ? { path: p.path } : {}) };
  return writeAnchor(cwd, a) ? a : null;
}

/** Fork point of HEAD from origin/<base>: parent of the oldest own first-parent commit. */
function fallbackAnchor(cwd, base) {
  const upstream = `origin/${base}`;
  if (!commitOf(cwd, upstream)) return null;
  const own = git(['rev-list', '--first-parent', '--reverse', 'HEAD', '--not', upstream], cwd);
  const oldest = own ? own.split('\n')[0] : null;
  if (oldest) {
    const parent = commitOf(cwd, `${oldest}^1`);
    if (parent) return git(['merge-base', parent, upstream], cwd) || parent;
  }
  return git(['merge-base', 'HEAD', upstream], cwd);
}

/** The anchor the survival check uses: the stored one, else the fork point (binding: fallback only when absent). */
function resolveAnchor(cwd, { base } = {}) {
  try {
    const stored = readAnchor(cwd);
    const storedSha = stored ? commitOf(cwd, stored.sha) : null;
    if (storedSha) return { sha: storedSha, source: 'file', reason: stored.reason || null, base: base || stored.base || null };
    const fork = base ? fallbackAnchor(cwd, base) : null;
    return fork ? { sha: fork, source: 'fallback', reason: 'fork-point', base: base || null } : null;
  } catch {
    return null;
  }
}

module.exports = {
  ANCHOR_FILE, anchorPath, readAnchor, writeAnchor, recordFirstPrompt, afterShip, pinEarlier,
  inheritFrom, earliest, fallbackAnchor, resolveAnchor,
};

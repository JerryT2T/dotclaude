/**
 * @module implement-order
 * @plugin devops
 * @description The open implement order of an artifact concept (#1240).
 *
 *   `concept-artifact.js digest` records it in the concept's
 *   `.claude/concepts/<slug>/artifact.json` when the round to process is an
 *   implement click; `mark` (or `close`) removes it. While it is open and the
 *   build has not started, `pre.concept.implement-order` holds back a decision
 *   card or question: the click already is the person's go.
 *
 *   "The build has started" is read from the working tree, with no marker of
 *   its own: HEAD moved, or files outside `.claude/` and `docs/concepts/`
 *   changed since the order was recorded. Where git cannot say (no repo, no
 *   commit yet), the order holds back exactly one question.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ORDER_TTL_MS = 24 * 60 * 60 * 1000;
/** Runtime state and the concept page itself are no build. */
const NO_BUILD_RE = /^(?:\.claude\/|docs\/concepts\/)/;
const SLUG_RE = /^[a-zA-Z0-9._-]{1,80}$/;

/** The path of one `git status --porcelain` line (the new name of a rename), forward slashes. */
function pathOfStatusLine(line) {
  let p = String(line).slice(3);
  const arrow = p.indexOf(' -> ');
  if (arrow >= 0) p = p.slice(arrow + 4);
  return p.replace(/^"|"$/g, '').replace(/\\/g, '/');
}

/**
 * HEAD plus a hash over every changed file outside the no-build paths (its
 * status, size and mtime, so a second edit of an already changed file counts).
 * @returns {{head:string, dirty:string}|null} null where git cannot answer
 */
function treeState(root) {
  try {
    const run = (args) => execFileSync('git', args, {
      cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    // One spawn for both: a git process costs about a second on a busy Windows machine.
    const [head, top = root] = run(['rev-parse', 'HEAD', '--show-toplevel']).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!head) return null;
    const lines = run(['status', '--porcelain', '--untracked-files=all']).split(/\r?\n/).filter(Boolean)
      .filter((l) => !NO_BUILD_RE.test(pathOfStatusLine(l)))
      .map((l) => {
        let stat = '';
        try { const s = fs.statSync(path.join(top, pathOfStatusLine(l))); stat = `${s.size}:${Math.floor(s.mtimeMs)}`; } catch { stat = 'gone'; }
        return `${l}\t${stat}`;
      })
      .sort();
    return { head, dirty: crypto.createHash('sha1').update(lines.join('\n')).digest('hex') };
  } catch {
    return null;
  }
}

/** The order `digest` records: which click, and the tree it was clicked on. */
function newOrder({ id, docId, round, by, root, now = Date.now() }) {
  return {
    id: String(id || ''),
    doc_id: String(docId || id || ''),
    round: round == null ? null : String(round),
    by: by ? String(by) : '',
    at: new Date(now).toISOString(),
    base: treeState(root),
  };
}

/** The nearest directory at or above `cwd` that holds `.claude/concepts`, else null. */
function conceptsRoot(cwd) {
  let dir = path.resolve(String(cwd || '.'));
  for (let i = 0; i < 8; i++) {
    try { if (fs.statSync(path.join(dir, '.claude', 'concepts')).isDirectory()) return dir; } catch { /* up */ }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/**
 * Every open, fresh implement order under `root`.
 * @returns {{slug:string, file:string, record:object, order:object}[]}
 */
function openOrders(root, now = Date.now()) {
  const base = path.join(root, '.claude', 'concepts');
  let names = [];
  try { names = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; }
  const out = [];
  for (const slug of names) {
    if (!SLUG_RE.test(slug)) continue;
    const file = path.join(base, slug, 'artifact.json');
    try {
      const record = JSON.parse(fs.readFileSync(file, 'utf8'));
      const order = record && record.implement_order;
      if (!order || record.open === false || typeof order.id !== 'string') continue;
      const at = Date.parse(order.at || '');
      if (!Number.isFinite(at) || now - at > ORDER_TTL_MS || at - now > 5 * 60 * 1000) continue;
      out.push({ slug, file, record, order });
    } catch { /* no record, or not readable */ }
  }
  return out;
}

/**
 * Has the build started since the order was recorded?
 * @returns {true|false|null} null = git cannot say (the caller holds back once)
 */
function buildStarted(order, root, state = treeState) {
  if (!order || !order.base || !order.base.head) return null;
  const cur = state(root);
  if (!cur) return null;
  return cur.head !== order.base.head || cur.dirty !== order.base.dirty;
}

module.exports = { treeState, newOrder, conceptsRoot, openOrders, buildStarted, pathOfStatusLine, ORDER_TTL_MS, NO_BUILD_RE };

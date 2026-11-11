/**
 * @module merge-queue
 * @version 0.1.0
 * @description Per-worktree queue of lost upstream hunks found by the sync's
 *   survival check: `.claude/merge-queue.json` (RUNTIME, ignored — see
 *   runtime-ignores.js). Written by scripts/git-sync.js after a sync merge,
 *   shown by prompt.git.sync as one context line, read by the ship gate.
 *
 *   The file is REPLACED on every run. Hunks the ledger (.claude/merge-decisions.json)
 *   already decides are dropped (merge-decisions.applyDecisions).
 *
 *   Shape: { version: 1, at, branch, base, anchor, survivedCount, truncated,
 *            restore: [Hunk], open: [Hunk], resolvedCount }
 *   restore = lost hunks the skill restores without asking (unseen-lost, moved);
 *   open    = hunks that need a user decision (same-aspect / overlap candidates).
 *   Hunk    = { id, file, verdict, header, commit, author, upstreamPr, hunk }
 *
 *   Interface (CommonJS):
 *     QUEUE_FILE, queuePath(cwd)
 *     buildQueue({ branch, base, check, ledger, now? }) → Queue | null  (pure)
 *     writeQueue(cwd, queue) → boolean;  readQueue(cwd) → Queue | null;  clearQueue(cwd)
 *     renderQueueLine(queue) → string | null
 *
 *   Never throws.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const QUEUE_FILE = path.join('.claude', 'merge-queue.json');
const MAX_HUNK_CHARS = 4000;

function rootOf(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd, encoding: 'utf8', timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || cwd;
  } catch {
    return cwd;
  }
}

function queuePath(cwd) {
  return path.join(rootOf(cwd), QUEUE_FILE);
}

function slim(h) {
  const o = {
    id: h.id, file: h.file, verdict: h.verdict, header: h.header || null,
    commit: h.commit || null, author: h.author || null, upstreamPr: h.upstreamPr || null,
  };
  if (typeof h.hunk === 'string') o.hunk = h.hunk.length > MAX_HUNK_CHARS ? `${h.hunk.slice(0, MAX_HUNK_CHARS)}\n…` : h.hunk;
  return o;
}

/**
 * Pure: turn a survival check result into the queue. Returns null when the
 * check did not run (a check that cannot run never blocks — the old queue is
 * simply left alone by the caller).
 */
function buildQueue({ branch, base, check, ledger = null, now } = {}) {
  if (!check || check.ok !== true) return null;
  const decisionVerdicts = new Set(['same-aspect-candidate', 'overlap-candidate']);
  let lost = Array.isArray(check.lost) ? check.lost : [];
  let resolvedCount = 0;
  if (ledger) {
    try {
      const applied = require('./merge-decisions.js').applyDecisions(ledger, lost);
      resolvedCount = applied.resolved.length;
      lost = applied.open;
    } catch { /* ledger unusable — everything stays open (never silently dropped) */ }
  }
  const restore = [];
  const open = [];
  for (const h of lost) (decisionVerdicts.has(h.verdict) ? open : restore).push(slim(h));
  return {
    version: 1,
    at: new Date(now == null ? Date.now() : now).toISOString(),
    branch: branch || null,
    base: base || null,
    anchor: check.anchor || null,
    survivedCount: check.survivedCount || 0,
    truncated: !!check.truncated,
    resolvedCount,
    restore,
    open,
  };
}

function writeQueue(cwd, queue) {
  try {
    const file = queuePath(cwd);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(queue, null, 2)}\n`);
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

function readQueue(cwd) {
  try {
    const q = JSON.parse(fs.readFileSync(queuePath(cwd), 'utf8'));
    return q && q.version === 1 ? q : null;
  } catch {
    return null;
  }
}

function clearQueue(cwd) {
  try { fs.unlinkSync(queuePath(cwd)); return true; } catch { return false; }
}

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

/**
 * The single context line prompt.git.sync injects: who/what came in upstream,
 * how many lost hunks are restored automatically vs wait for a decision, and
 * when open decisions are answered. Null when nothing is lost.
 */
function renderQueueLine(queue) {
  if (!queue || (!queue.restore.length && !queue.open.length)) return null;
  const all = [...queue.restore, ...queue.open];
  const authors = uniq(all.map(h => h.author));
  const prs = uniq(all.map(h => h.upstreamPr)).map(p => (/^\d+$/.test(String(p)) ? `#${p}` : String(p)));
  const who = authors.length ? ` by ${authors.slice(0, 3).join(', ')}` : '';
  const via = prs.length ? ` (${prs.slice(0, 4).join(', ')})` : '';
  const parts = [
    `[merge-queue] Work${who}${via} that landed upstream is missing from this branch after the sync:`,
    `${queue.restore.length} hunk(s) will be restored automatically, ${queue.open.length} need a decision`,
  ];
  if (queue.resolvedCount) parts[1] += `, ${queue.resolvedCount} already decided in the ledger`;
  let line = `${parts[0]} ${parts[1]}.`;
  if (queue.open.length) {
    line += ' Open decisions are answered BEFORE the ship, not now: visible changes (UI, CSS, templates, assets, copy) go on an auto-concept page (Basis | other shipper | you | proposal), logic/structure as a text question (max 3). Details: skills/do-ship/deep-knowledge/merge-decisions.md; hunks in .claude/merge-queue.json.';
  } else {
    line += ' Restore them hunk by hunk during the ship (nothing to decide); hunks in .claude/merge-queue.json.';
  }
  return line;
}

module.exports = { QUEUE_FILE, queuePath, buildQueue, writeQueue, readQueue, clearQueue, renderQueueLine };

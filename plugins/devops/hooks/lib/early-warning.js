/**
 * @module early-warning
 * @version 0.1.0
 * @description Token-free early warning that another branch ALREADY on the
 *   remote touches the same region as this branch (concept: parallel ship
 *   without losses, d-wip = no extra push). Looks only at branches that are on
 *   the remote for other reasons — open PRs (`gh pr list`) when gh is
 *   available, otherwise the remote heads — and compares changed hunks with
 *   this worktree's own, so a clash is known long before the ship.
 *
 *   NO pushes, ever. Read-only apart from fetching the candidate heads into
 *   their remote-tracking refs. Silent without a remote or gh; a probe that
 *   cannot run yields nothing. Never blocks.
 *
 *   Flow (same shape as git-sync-bg): stop.git.sync / ss.git.sync call
 *   `maybeStart(cwd)` (30-minute floor per worktree) which spawns this module
 *   detached; the child scans and writes ONE result file only when there is a
 *   warning; prompt.git.sync delivers it on the next user turn via `takeWarning`.
 *
 *   Interface (CommonJS):
 *     FLOOR_MS
 *     scan(cwd, { run?, ghJson?, fetch? }) -> string[]        warning lines (pure of state files)
 *     regionsOverlap(ownRanges, theirRanges) -> [[from,to]]
 *     parseRanges(unifiedZeroDiff) -> { [file]: [[from,to]] } old-side line ranges
 *     maybeStart(cwd, { tmpdir?, spawn?, now?, force? }) -> boolean
 *     takeWarning(cwd, { tmpdir? }) -> string | null
 *
 *   Never throws.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { keyFor } = require('./git-sync-bg');

const FLOOR_MS = 30 * 60 * 1000;
const PREFIX = 'dotclaude-devops-early-warning';
const MAX_CANDIDATES = 15;
const MAX_LINES = 3;

const throttleFile = (cwd, tmpdir = os.tmpdir()) => path.join(tmpdir, `${PREFIX}-throttle-${keyFor(cwd)}`);
const resultFile = (cwd, tmpdir = os.tmpdir()) => path.join(tmpdir, `${PREFIX}-result-${keyFor(cwd)}`);
const seenFile = (cwd, tmpdir = os.tmpdir()) => path.join(tmpdir, `${PREFIX}-seen-${keyFor(cwd)}`);

function defaultRun(cwd) {
  return (cmd, args, timeout = 15000) => {
    try {
      return { ok: true, out: execFileSync(cmd, args, {
        cwd, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
      }) };
    } catch (e) {
      return { ok: false, out: typeof (e && e.stdout) === 'string' ? e.stdout : '', status: e && e.status };
    }
  };
}

/** Old-side line ranges per file from a `git diff -U0` text. An insertion counts as a one-line range at its anchor. */
function parseRanges(diff) {
  const out = {};
  let file = null;
  for (const line of String(diff || '').split(/\r?\n/)) {
    const f = /^\+\+\+ b\/(.+)$/.exec(line);
    if (f) { file = f[1]; continue; }
    if (line.startsWith('+++ /dev/null')) { file = null; continue; }
    const h = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line);
    if (h && file) {
      const start = Number(h[1]);
      const len = h[2] === undefined ? 1 : Number(h[2]);
      (out[file] = out[file] || []).push(len === 0 ? [start, start + 1] : [start, start + len - 1]);
    }
  }
  return out;
}

/** The parts of two range lists that intersect (touching an insertion point counts). */
function regionsOverlap(a, b) {
  const hits = [];
  for (const [a1, a2] of a || []) {
    for (const [b1, b2] of b || []) {
      const from = Math.max(a1, b1);
      const to = Math.min(a2, b2);
      if (from <= to) hits.push([from, to]);
    }
  }
  return hits;
}

function candidates(run, ghJson, branch) {
  if (ghJson) {
    const gh = run('gh', ['pr', 'list', '--state', 'open', '--limit', String(MAX_CANDIDATES), '--json', 'headRefName,number,author'], 20000);
    if (gh.ok) {
      try {
        const list = JSON.parse(gh.out);
        return list
          .filter((p) => p && p.headRefName && p.headRefName !== branch)
          .map((p) => ({ head: p.headRefName, pr: p.number, author: p.author && (p.author.login || p.author.name) || null }));
      } catch { /* fall through to the remote heads */ }
    }
  }
  // One read-only ls-remote: the heads that are on the remote right now, whether
  // or not this clone has fetched them yet.
  const heads = run('git', ['ls-remote', '--heads', 'origin'], 20000);
  if (!heads.ok) return [];
  return heads.out.split(/\r?\n/).map((s) => /\srefs\/heads\/(.+)$/.exec(s.trim())).filter(Boolean)
    .map((m) => m[1]).filter((h) => h !== branch)
    .slice(0, MAX_CANDIDATES).map((head) => ({ head, pr: null, author: null }));
}

/**
 * @param {string} cwd
 * @param {{run?: Function, ghJson?: boolean, fetch?: boolean}} [opts]
 * @returns {string[]} one line per overlapping branch
 */
function scan(cwd, opts = {}) {
  try {
    const run = opts.run || defaultRun(cwd);
    const git = (args, t) => run('git', args, t);
    const branchRes = git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const branch = branchRes.ok ? branchRes.out.trim() : '';
    if (!branch) return [];
    const remotes = git(['remote']);
    if (!remotes.ok || !remotes.out.trim()) return [];
    const base = require('./anchor-recording').baseFor(cwd, branch);
    if (!base || base === branch) return [];

    const list = candidates(run, opts.ghJson !== false, branch).filter((c) => c.head !== base);
    const lines = [];
    for (const c of list) {
      const ref = `refs/remotes/origin/${c.head}`;
      if (opts.fetch !== false) git(['fetch', 'origin', `+refs/heads/${c.head}:${ref}`, '--quiet'], 30000);
      if (!git(['rev-parse', '--verify', '--quiet', ref]).out.trim()) continue;
      const mb = git(['merge-base', 'HEAD', ref]);
      if (!mb.ok || !mb.out.trim()) continue;
      const fork = mb.out.trim();
      const own = parseRanges(git(['diff', '-U0', '--no-color', '--no-renames', fork, 'HEAD']).out);
      const theirs = parseRanges(git(['diff', '-U0', '--no-color', '--no-renames', fork, ref]).out);
      const shared = Object.keys(own).filter((f) => theirs[f]);
      const clashes = shared
        .map((f) => ({ file: f, hits: regionsOverlap(own[f], theirs[f]) }))
        .filter((s) => s.hits.length);
      if (!clashes.length) continue;
      const mt = git(['merge-tree', '--write-tree', '--no-messages', 'HEAD', ref]);
      const conflicts = mt.ok === false && mt.status === 1;
      const who = c.pr ? `PR #${c.pr}${c.author ? ` (${c.author})` : ''}` : `branch ${c.head}`;
      const where = clashes.slice(0, 3).map((s) => `${s.file}:${s.hits[0][0]}-${s.hits[0][1]}`).join(', ')
        + (clashes.length > 3 ? ` and ${clashes.length - 3} more` : '');
      lines.push(`[early-warning] ${who} on origin/${c.head} already changes the same region as this branch: ${where}`
        + `${conflicts ? ' (a merge would conflict)' : ''}. Look at it or coordinate now — it is cheaper than a decision at ship.`);
      if (lines.length >= MAX_LINES) break;
    }
    return lines;
  } catch {
    return [];
  }
}

/** Claim the 30-minute slot (atomic 'wx' after moving a stale marker aside) and spawn the scan detached. */
function maybeStart(cwd, opts = {}) {
  try {
    const { tmpdir = os.tmpdir(), now = Date.now(), spawn = require('child_process').spawn } = opts;
    const file = throttleFile(cwd, tmpdir);
    try {
      if (now - fs.statSync(file).mtimeMs < FLOOR_MS && !opts.force) return false;
      fs.unlinkSync(file);
    } catch { /* no marker yet */ }
    fs.writeFileSync(file, String(now), { flag: 'wx' });
    const child = spawn(process.execPath, [__filename, '--scan'], {
      cwd, detached: true, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, DEVOPS_EARLY_WARNING_RESULT: resultFile(cwd, tmpdir), DEVOPS_EARLY_WARNING_SEEN: seenFile(cwd, tmpdir) },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Read and consume the pending warning for this worktree. */
function takeWarning(cwd, opts = {}) {
  const file = resultFile(cwd, opts.tmpdir);
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    try { fs.unlinkSync(file); } catch { /* consumed anyway */ }
    return text || null;
  } catch {
    return null;
  }
}

if (require.main === module && process.argv.includes('--scan')) {
  try {
    const lines = scan(process.cwd());
    const out = process.env.DEVOPS_EARLY_WARNING_RESULT;
    const seen = process.env.DEVOPS_EARLY_WARNING_SEEN;
    if (lines.length && out) {
      const text = lines.join('\n');
      let last = '';
      try { last = fs.readFileSync(seen, 'utf8'); } catch { /* first time */ }
      if (last !== text) {
        fs.writeFileSync(`${out}.tmp`, `${text}\n`, 'utf8');
        fs.renameSync(`${out}.tmp`, out);
        if (seen) fs.writeFileSync(seen, text, 'utf8');
      }
    }
  } catch { /* silent */ }
  process.exit(0);
}

module.exports = { FLOOR_MS, scan, parseRanges, regionsOverlap, maybeStart, takeWarning, throttleFile, resultFile, seenFile };

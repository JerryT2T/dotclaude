/**
 * @module survival
 * @version 0.1.0
 * @description Does other people's shipped work survive in this branch?
 *
 *   The ship gate used to check ancestry only (`isRebasedOnto`): a branch that
 *   merged or rebased onto origin/<base> and resolved the conflicts by taking
 *   its own side passed it and silently discarded an earlier shipper's
 *   changes. This module checks CONTENT: every hunk of
 *   `git diff <anchor> <upstream>` (the changes on <base> the user never saw)
 *   must still be present in the candidate tree.
 *
 *   A hunk survives when
 *   - every added line (whitespace-normalised) is present somewhere in the
 *     corresponding candidate file — moves inside the file are fine; when the
 *     file was renamed, the renamed file is searched;
 *   - every line it deleted is NOT back in the candidate file (unless that
 *     line also exists elsewhere in the upstream file).
 *   Trivial lines (brackets, punctuation, < 3 chars) and project-version lines
 *   (`"version":`, version badges, lock files) are ignored: a re-bump is not
 *   a loss.
 *
 *   Every lost hunk gets a deterministic region verdict against the own
 *   side's diff `git diff <anchor> <own>` (`own` = the intent snapshot taken
 *   before integration):
 *   - `unseen-lost`           own side never touched that region → auto-restore candidate
 *   - `moved`                 own side moved/restructured the region but kept
 *                             the lines upstream changed → values travel into
 *                             the new structure (auto)
 *   - `same-aspect-candidate` both sides replaced the same original line → decision
 *   - `overlap-candidate`     regions overlap otherwise (or own deleted the
 *                             file) → the model classifies (same-aspect /
 *                             rule-vs-exception / orthogonal)
 *   Code never picks a side; the verdict only routes the hunk.
 *
 *   Interface (CommonJS):
 *     checkSurvival({ cwd, anchor, upstream, candidate = 'HEAD', own = null })
 *       → { ok: true, anchor, upstream, candidate, own, survived: string[] (ids),
 *           survivedCount, lost: LostHunk[], truncated }
 *       | { ok: false, reason }
 *     checkBranch({ cwd, base, branch?, candidate = 'HEAD', anchor? })
 *       → same as checkSurvival; anchor from knowledge-anchor.resolveAnchor,
 *         upstream `origin/<base>`, own = intent snapshot (else the candidate)
 *     LostHunk = { id, file, oldFile, candidatePath, status, hunk: { oldStart, oldLines,
 *                  newStart, newLines, context }, header, added, removed,
 *                  missing, resurrected, verdict, commit, author, upstreamPr }
 *     writeIntent(cwd, branch, rev = 'HEAD') → sha | null   (refs/devops/intent/<branch>)
 *     readIntent(cwd, branch) → sha | null
 *     intentRef(branch) → 'refs/devops/intent/<branch>'
 *     parseDiff(text) → [{ oldPath, newPath, status, binary, hunks: [...] }]
 *     hunkId(file, hunk) → stable 12-hex id (content hash, line numbers excluded)
 *     normalizeLine(line), isTrivialLine(normalized), VERDICTS, DECISION_VERDICTS
 *
 *   Read-only except writeIntent. Never throws: any git failure answers
 *   `{ ok: false, reason }` (callers fail open with a warning).
 */

'use strict';

const { execFileSync } = require('child_process');
const crypto = require('crypto');

const TIMEOUT = 15000;
const MAX_HUNKS = 400;
const MAX_ATTRIBUTION = 100;
const INTENT_PREFIX = 'refs/devops/intent/';

const VERDICTS = Object.freeze(['unseen-lost', 'moved', 'same-aspect-candidate', 'overlap-candidate']);
/** Verdicts that must reach the user / the model's classification, never auto-restored blindly. */
const DECISION_VERDICTS = Object.freeze(['same-aspect-candidate', 'overlap-candidate']);

const LOCK_FILE_RE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/;
const VERSION_LINE_RE = /\*\*Version:|badge\/version-|img\.shields\.io\/[^\s)]*version/i;
const TRIVIAL_RE = /^[\s{}()[\];,.:'"`<>/*#|=+-]*$/;

function git(args, cwd, trim = true) {
  try {
    const out = execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
      windowsHide: true, cwd, encoding: 'utf8', timeout: TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    });
    return trim ? out.trim() : out;
  } catch {
    return null;
  }
}

const normalizeLine = (l) => String(l).replace(/\s+/g, ' ').trim();
const isTrivialLine = (n) => n.length < 3 || TRIVIAL_RE.test(n);
const ignoredLine = (file, n) => (/\.json$/.test(file) && /^"version"\s*:/.test(n)) || VERSION_LINE_RE.test(n);
const significant = (file, lines) => lines.map(normalizeLine).filter((n) => !isTrivialLine(n) && !ignoredLine(file, n));

/** Parse `git diff -U0` output into files and hunks. */
function parseDiff(text) {
  const files = [];
  let f = null;
  let h = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      f = { oldPath: m ? m[1] : null, newPath: m ? m[2] : null, status: 'M', binary: false, hunks: [] };
      files.push(f);
      h = null;
      continue;
    }
    if (!f) continue;
    const hm = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/.exec(line);
    if (hm) {
      h = {
        oldStart: +hm[1], oldLines: hm[2] === undefined ? 1 : +hm[2],
        newStart: +hm[3], newLines: hm[4] === undefined ? 1 : +hm[4],
        context: hm[5].trim(), added: [], removed: [],
      };
      f.hunks.push(h);
      continue;
    }
    if (!h) {
      if (line.startsWith('new file mode')) f.status = 'A';
      else if (line.startsWith('deleted file mode')) f.status = 'D';
      else if (line.startsWith('rename from ')) { f.oldPath = line.slice(12); f.status = 'R'; }
      else if (line.startsWith('rename to ')) f.newPath = line.slice(10);
      else if (line.startsWith('--- ') && line !== '--- /dev/null') f.oldPath = line.slice(4).replace(/^a\//, '');
      else if (line.startsWith('+++ ') && line !== '+++ /dev/null') f.newPath = line.slice(4).replace(/^b\//, '');
      else if (line.startsWith('Binary files ')) f.binary = true;
      continue;
    }
    if (line.startsWith('+')) h.added.push(line.slice(1));
    else if (line.startsWith('-')) h.removed.push(line.slice(1));
  }
  return files;
}

/** Stable id of a hunk: file + normalised content, no line numbers. */
function hunkId(file, hunk) {
  const body = `${file}\0${(hunk.removed || []).map(normalizeLine).join('\n')}\0${(hunk.added || []).map(normalizeLine).join('\n')}`;
  return crypto.createHash('sha1').update(body).digest('hex').slice(0, 12);
}

const intentRef = (branch) => `${INTENT_PREFIX}${String(branch || '').replace(/^refs\/heads\//, '')}`;

/** Snapshot the own tip before an integration. Returns the sha written, or null. */
function writeIntent(cwd, branch, rev = 'HEAD') {
  if (!branch) return null;
  const sha = git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], cwd);
  if (!sha) return null;
  return git(['update-ref', intentRef(branch), sha], cwd) === null ? null : sha;
}

function readIntent(cwd, branch) {
  if (!branch) return null;
  return git(['rev-parse', '--verify', '--quiet', `${intentRef(branch)}^{commit}`], cwd) || null;
}

function makeReader(cwd) {
  const cache = new Map();
  return (ref, file) => {
    if (!ref || !file) return null;
    const key = `${ref}:${file}`;
    if (!cache.has(key)) cache.set(key, git(['show', key], cwd, false));
    return cache.get(key);
  };
}

const lineSet = (content) => new Set(content == null ? [] : content.split(/\r?\n/).map(normalizeLine));

/** upstream path → candidate path for files renamed between the two trees. */
function renameMap(cwd, from, to) {
  const out = git(['diff', '--name-status', '-M', from, to], cwd);
  const map = new Map();
  for (const line of (out || '').split('\n')) {
    const p = line.split('\t');
    if (/^R\d*$/.test(p[0]) && p[2]) map.set(p[1], p[2]);
  }
  return map;
}

const PR_RE = /\(#(\d+)\)\s*$|Merge pull request #(\d+)/;
const prOf = (subject) => { const m = PR_RE.exec(subject || ''); return m ? Number(m[1] || m[2]) : null; };

/** Which upstream commit brought a hunk: blame for added lines, else the newest commit on the path. */
function attribute(cwd, anchor, upstream, f, h) {
  if (f.status !== 'D' && h.newLines > 0) {
    const out = git(['blame', '--porcelain', '-L', `${h.newStart},+${h.newLines}`, `${anchor}..${upstream}`, '--', f.newPath], cwd);
    if (out) {
      let sha = null; let author = null; let summary = null; let boundary = false;
      for (const line of out.split('\n')) {
        const m = /^([0-9a-f]{40}) \d+ \d+/.exec(line);
        if (m) {
          if (sha && !boundary && author) break;
          sha = m[1]; author = null; summary = null; boundary = false;
          continue;
        }
        if (line.startsWith('author ')) author = line.slice(7);
        else if (line.startsWith('summary ')) summary = line.slice(8);
        else if (line === 'boundary') boundary = true;
      }
      if (sha && !boundary && author) return { commit: sha, author, upstreamPr: prOf(summary) };
    }
  }
  const paths = [...new Set([f.oldPath, f.newPath].filter(Boolean))];
  const log = git(['log', '-1', '--format=%H%x1f%an%x1f%s', `${anchor}..${upstream}`, '--', ...paths], cwd);
  if (!log) return { commit: null, author: null, upstreamPr: null };
  const [commit, author, subject] = log.split('\x1f');
  return { commit: commit || null, author: author || null, upstreamPr: prOf(subject) };
}

/** Old-side line range a hunk covers; a pure insertion touches the line it follows and the next. */
const rangeOf = (h) => (h.oldLines > 0 ? [h.oldStart, h.oldStart + h.oldLines - 1] : [h.oldStart, h.oldStart + 1]);
const overlaps = (a, b) => a[0] <= b[1] && b[0] <= a[1];

/** Region verdict of one lost upstream hunk against the own side's diff. */
function verdictFor(lost, h, ownByPath, read, own) {
  const ownFile = ownByPath.get(lost.oldFile) || ownByPath.get(lost.file);
  if (!ownFile) return 'unseen-lost';
  if (ownFile.status === 'D') return 'overlap-candidate';
  const region = rangeOf(h);
  const touching = ownFile.hunks.filter((oh) => overlaps(region, rangeOf(oh)));
  if (!touching.length) return 'unseen-lost';
  const ownTip = lineSet(read(own, ownFile.newPath || ownFile.oldPath));
  const upRemoved = significant(lost.file, h.removed);
  const ownRemoved = new Set(touching.flatMap((oh) => significant(lost.file, oh.removed)));
  const same = upRemoved.filter((n) => ownRemoved.has(n));
  if (same.length) return same.some((n) => !ownTip.has(n)) ? 'same-aspect-candidate' : 'moved';
  if (!upRemoved.length) return ownRemoved.size ? 'moved' : 'overlap-candidate';
  return 'overlap-candidate';
}

/**
 * Check that every upstream hunk (anchor..upstream) survives in `candidate`.
 * @param {{cwd:string, anchor:string, upstream:string, candidate?:string, own?:string|null}} o
 */
function checkSurvival({ cwd, anchor, upstream, candidate = 'HEAD', own = null } = {}) {
  try {
    if (!cwd || !anchor || !upstream) return { ok: false, reason: 'missing-ref' };
    const sha = (r) => git(['rev-parse', '--verify', '--quiet', `${r}^{commit}`], cwd);
    const a = sha(anchor); const u = sha(upstream); const c = sha(candidate);
    const o = own ? sha(own) : null;
    if (!a || !u || !c) return { ok: false, reason: 'unknown-ref' };
    const base = { ok: true, anchor: a, upstream: u, candidate: c, own: o, survived: [], survivedCount: 0, lost: [], truncated: false };
    if (a === u) return base;
    const diff = git(['diff', '--no-color', '--no-ext-diff', '-U0', '-M', a, u], cwd, false);
    if (diff === null) return { ok: false, reason: 'diff-failed' };
    const files = parseDiff(diff).filter((f) => !LOCK_FILE_RE.test(f.newPath || f.oldPath || ''));
    const read = makeReader(cwd);
    const renames = renameMap(cwd, u, c);

    // Own side: anchor..own, minus hunks identical to an upstream hunk (an earlier sync merge).
    const ownByPath = new Map();
    if (o) {
      const upKeys = new Set(files.flatMap((f) => f.hunks.map((h) => hunkId(f.oldPath || f.newPath, h))));
      for (const f of parseDiff(git(['diff', '--no-color', '--no-ext-diff', '-U0', '-M', a, o], cwd, false) || '')) {
        f.hunks = f.hunks.filter((h) => !upKeys.has(hunkId(f.oldPath || f.newPath, h)));
        if (f.hunks.length || f.status === 'D' || f.binary) ownByPath.set(f.oldPath || f.newPath, f);
      }
    }

    let seen = 0;
    for (const f of files) {
      const file = f.status === 'D' ? f.oldPath : f.newPath;
      const candidatePath = f.status === 'D' ? f.oldPath : (renames.get(f.newPath) || f.newPath);
      const candContent = read(c, candidatePath);
      const candSet = lineSet(candContent);
      const upSet = lineSet(f.status === 'D' ? '' : read(u, f.newPath));
      const hunks = f.binary && !f.hunks.length ? [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 0, context: '', added: [], removed: [], binary: true }] : f.hunks;
      for (const h of hunks) {
        if (seen++ >= MAX_HUNKS) { base.truncated = true; break; }
        const id = hunkId(file, h);
        let missing; let resurrected;
        if (h.binary) {
          const same = git(['rev-parse', '--verify', '--quiet', `${u}:${f.newPath}`], cwd) === git(['rev-parse', '--verify', '--quiet', `${c}:${candidatePath}`], cwd);
          missing = same ? [] : ['<binary content>'];
          resurrected = [];
        } else {
          missing = significant(file, h.added).filter((n) => !candSet.has(n));
          resurrected = significant(file, h.removed).filter((n) => !upSet.has(n) && candSet.has(n));
        }
        if (!missing.length && !resurrected.length) { base.survived.push(id); continue; }
        base.lost.push({
          id, file, oldFile: f.oldPath, candidatePath: candContent == null ? null : candidatePath, status: f.status,
          hunk: { oldStart: h.oldStart, oldLines: h.oldLines, newStart: h.newStart, newLines: h.newLines, context: h.context },
          header: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@${h.context ? ` ${h.context}` : ''}`,
          added: h.added, removed: h.removed, missing, resurrected,
          verdict: o ? verdictFor({ file, oldFile: f.oldPath }, h, ownByPath, read, o) : 'overlap-candidate',
          ...(base.lost.length < MAX_ATTRIBUTION ? attribute(cwd, a, u, f, h) : { commit: null, author: null, upstreamPr: null }),
        });
      }
      if (base.truncated) break;
    }
    base.survivedCount = base.survived.length;
    return base;
  } catch (e) {
    return { ok: false, reason: `error: ${e && e.message}` };
  }
}

/** The ship/sync composite: anchor from the knowledge anchor, upstream origin/<base>, own = intent snapshot. */
function checkBranch({ cwd, base, branch = null, candidate = 'HEAD', anchor = null } = {}) {
  try {
    if (!cwd || !base) return { ok: false, reason: 'missing-base' };
    const upstream = `origin/${base}`;
    let anchorSha = anchor;
    let anchorSource = anchor ? 'param' : null;
    if (!anchorSha) {
      const r = require('./knowledge-anchor.js').resolveAnchor(cwd, { base });
      if (!r) return { ok: false, reason: 'no-anchor' };
      anchorSha = r.sha;
      anchorSource = r.source;
    }
    const br = branch || git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    const own = (br && br !== 'HEAD' && readIntent(cwd, br)) || candidate;
    const res = checkSurvival({ cwd, anchor: anchorSha, upstream, candidate, own });
    return res.ok ? { ...res, anchorSource, branch: br } : res;
  } catch (e) {
    return { ok: false, reason: `error: ${e && e.message}` };
  }
}

module.exports = {
  checkSurvival, checkBranch, writeIntent, readIntent, intentRef, parseDiff, hunkId,
  normalizeLine, isTrivialLine, VERDICTS, DECISION_VERDICTS, INTENT_PREFIX,
};

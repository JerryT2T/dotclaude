/**
 * @lib concept-unlanded
 * @version 0.1.0
 * @plugin devops
 * @description Is an auto-concept page left at its unfinalized final report
 *   with the report not on the default branch? (#1163)
 *
 *   Marker facts (skills/auto-concept bridge-server-state.md): concept-active.json
 *   carries no phase field. It exists exactly while the concept is open —
 *   `finalize` / discard remove it — so "present" = not finalized. The final
 *   report is a `<section data-final-report>` in the page at `html_path`.
 *
 *   Local only, bounded git calls (3 s each), no network. Whether a PR is open
 *   cannot be known offline: the signal is "report not on the default branch".
 *   Fails open (null) on anything unreadable.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Runs inside a Stop hook on every non-ship stop with an open final report: up to 7 local calls, so keep each short.
const GIT_TIMEOUT = 1500;

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
}

/** The page's live round is a final report (a real section, not template text in a script). */
function isFinalReport(html) {
  return /<section\b[^>]*\bdata-final-report\b/i.test(html);
}

/** "2026-11-15" from a concept file name, or ''. */
function dateOf(htmlPath) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(path.basename(htmlPath));
  return m ? m[1] : '';
}

/**
 * @param {string} cwd session cwd
 * @param {{git?:Function}} [io] test seam
 * @returns {{slug:string, htmlPath:string, date:string, branch:string, unpushed:number, merges:number}|null}
 */
function detect(cwd, io = {}) {
  const run = io.git || git;
  let state;
  try { state = JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'concept-active.json'), 'utf8')); } catch { return null; }
  if (!state || typeof state.html_path !== 'string' || state.paused_at) return null;
  const rel = state.html_path.replace(/\\/g, '/');
  let html;
  try { html = fs.readFileSync(path.resolve(cwd, state.html_path), 'utf8'); } catch { return null; }
  if (!isFinalReport(html)) return null;

  const branch = run(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (!branch || branch === 'HEAD') return null;
  // origin/HEAD, else whichever of origin/main / origin/master exists (a master repo must not read "not in main").
  const base = run(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd)
    || (run(['rev-parse', '--verify', '-q', 'refs/remotes/origin/main'], cwd) ? 'origin/main' : 'origin/master');
  // the report is in main when the default branch holds the very same page blob
  const inBase = run(['rev-parse', '--verify', '-q', `${base}:${rel}`], cwd);
  const mine = run(['rev-parse', '--verify', '-q', `HEAD:${rel}`], cwd);
  if (inBase && mine && inBase === mine) return null;
  // a page that is not even committed has nothing "unlanded" to name yet
  if (!mine && !inBase) return null;

  const upstream = run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd);
  const range = upstream ? `${upstream}..HEAD` : `${base}..HEAD`;
  const unpushed = parseInt(run(['rev-list', '--count', range], cwd), 10) || 0;
  const merges = parseInt(run(['rev-list', '--count', '--merges', range], cwd), 10) || 0;
  return {
    slug: String(state.slug || path.basename(rel, '.html')), htmlPath: rel, date: dateOf(rel), branch, unpushed, merges,
  };
}

/** Card point text (de/en), or null. Names the concept, offers finalize; names unpushed commits when present. */
function message(info, lang = 'de') {
  if (!info) return null;
  const en = lang === 'en';
  let text = en
    ? `Concept close-out open — the report of "${info.slug}" is not in main → reply "finalize"`
    : `Concept-Abschluss offen — Bericht „${info.slug}“ ist nicht in main → „abschließen“ (finalize)`;
  if (info.unpushed > 0) {
    const m = info.merges > 0 ? (en ? ` (${info.merges} merge)` : ` (davon ${info.merges} Merge)`) : '';
    text += en
      ? `. ${info.unpushed} unpushed ${info.unpushed === 1 ? 'commit' : 'commits'}${m} on ${info.branch} → push or ship`
      : `. ${info.unpushed} ungepushte ${info.unpushed === 1 ? 'Commit' : 'Commits'}${m} auf ${info.branch} → pushen oder shippen`;
  }
  return text;
}

module.exports = { detect, message, isFinalReport, dateOf };

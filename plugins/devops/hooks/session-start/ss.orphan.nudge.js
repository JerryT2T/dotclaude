#!/usr/bin/env node
/**
 * @hook ss.orphan.nudge
 * @version 0.4.0
 * @event SessionStart
 * @plugin devops
 * @description One-line nudge when the current repo has unlanded work,
 *   worktrees with uncommitted changes, or safety copies nobody decided on
 *   (autosave snapshots and salvage/rescue/backup/wip copies older than 3
 *   days — park-register isUndecided). When other repos have such work too,
 *   the line adds the machine-wide total; a clean or unknown repo still gets
 *   the total alone, so work in repos nobody opens no longer stays invisible. Reads ~/.claude/orphan-report.json
 *   (written daily by scripts/orphan-scan.js) — no git calls, no network, so
 *   it is boot-window safe. Silent without a report, with a report older than
 *   24 h (the line names the report age otherwise), for an unknown repo, or when nothing is at risk. The report entry
 *   A missing or >24 h old report also starts orphan-scan.js detached (the
 *   daily refresh). The report entry is matched by path prefix (worktrees live under the main checkout).
 *   Also (hook telemetry, lib/hook-telemetry.js): one line when a hook was
 *   killed/timed out in more than 5 % of its last 200 runs, at most once a day.
 *   Output: additionalContext asking Claude to show the line, e.g.
 *   "⚠ Hier: 3 Branches nicht in main gemergt (Stand vor 6 h) → „Branches aufräumen“".
 *   ⚠ only for unmerged or uncommitted work in the current repo. It ends in a
 *   prompt, not a slash command: auto-cleanup is not user-invocable.
 */

require('../lib/plugin-guard');

const fs = require('fs');
const os = require('os');
const path = require('path');

const { isUndecided } = require('../lib/park-register');

const MAX_AGE_MS = 24 * 3_600_000;
const PROMPT = { de: '„Branches aufräumen“', en: '"branch cleanup"' };

function reportPath() {
  return process.env.DEVOPS_ORPHAN_REPORT || path.join(os.homedir(), '.claude', 'orphan-report.json');
}

function norm(p) {
  const n = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? n.toLowerCase() : n;
}

/**
 * The nudge line for `cwd`, or null.
 * @param {{cwd:string, lang?:string, report?:object|null, now?:number}} o
 */
function buildNudge(o) {
  const base = buildCore(o);
  const info = infoLine(o);
  return base && info ? `${base}\n${info}` : base || info;
}

/** Info line: main checkout parked on a landed branch, landed worktrees outside .claude/worktrees (#879, #875). */
function infoLine({ cwd, lang = 'de', report, now = Date.now() }) {
  const t = Date.parse((report && report.generatedAt) || '');
  if (!report || !Array.isArray(report.repos) || !Number.isFinite(t) || now - t > MAX_AGE_MS) return null;
  const here = norm(cwd);
  const entry = report.repos
    .filter((r) => r && r.path && (here === norm(r.path) || here.startsWith(`${norm(r.path)}/`)))
    .sort((a, b) => norm(b.path).length - norm(a.path).length)[0];
  if (!entry) return null;
  const en = lang === 'en';
  const lines = [];
  if (entry.mainOnLanded) {
    lines.push(en ? `ℹ main checkout sits on merged branch ${entry.mainOnLanded} → "switch to main"` : `ℹ Haupt-Checkout steht auf gemergtem Branch ${entry.mainOnLanded} → „auf main wechseln“`);
  }
  const out = Number(entry.landedOutside) || 0;
  if (out > 0) {
    lines.push(en
      ? `ℹ ${out} merged ${out === 1 ? 'worktree' : 'worktrees'} outside .claude/worktrees → ${PROMPT.en}`
      : `ℹ ${out} gemergte ${out === 1 ? 'Worktree' : 'Worktrees'} außerhalb von .claude/worktrees → ${PROMPT.de}`);
  }
  return lines.length ? lines.join('\n') : null;
}

function buildCore({ cwd, lang = 'de', report, now = Date.now() }) {
  if (!report || !Array.isArray(report.repos)) return null;
  const t = Date.parse(report.generatedAt || '');
  if (!Number.isFinite(t) || now - t > MAX_AGE_MS) return null;
  const here = norm(cwd);
  const entry = report.repos
    .filter((r) => r && r.path && (here === norm(r.path) || here.startsWith(`${norm(r.path)}/`)))
    .sort((a, b) => norm(b.path).length - norm(a.path).length)[0];
  const age = formatAge(now - t);
  const en = lang === 'en';
  // the whole machine: work piles up in repos nobody opens, so every start names the total
  let total = 0;
  let repos = 0;
  for (const r of report.repos) {
    const c = r && r.path ? counts(r) : null;
    const n = c ? c.unlanded + c.dirty + c.undecided : 0;
    if (n > 0) { total += n; repos++; }
  }
  const { unlanded, dirty, undecided } = entry ? counts(entry) : { unlanded: 0, dirty: 0, undecided: 0 };
  const stand = en ? `(as of ${age} ago)` : `(Stand vor ${age})`;
  const arrow = `→ ${en ? PROMPT.en : PROMPT.de}`;
  const machine = en
    ? `whole machine: ${total} open in ${repos} ${repos === 1 ? 'repo' : 'repos'}`
    : `Rechner: ${total} offen in ${repos} ${repos === 1 ? 'Repo' : 'Repos'}`;
  if (unlanded + dirty + undecided === 0) {
    // nothing here (or a repo the scan does not know): still name what waits elsewhere
    if (total === 0) return null;
    // a repo the scan does not know gets no "nothing open here" claim
    const lead = entry ? (en ? 'Nothing open here · ' : 'Hier nichts offen · ') : '';
    return `ℹ ${lead}${machine} ${stand} ${arrow}`;
  }
  const parts = [];
  if (unlanded > 0) {
    parts.push(en
      ? `${unlanded} ${unlanded === 1 ? 'branch' : 'branches'} not merged into main`
      : `${unlanded} ${unlanded === 1 ? 'Branch' : 'Branches'} nicht in main gemergt`);
  }
  if (dirty > 0) {
    parts.push(en
      ? `${dirty} ${dirty === 1 ? 'worktree' : 'worktrees'} with uncommitted work`
      : `${dirty} ${dirty === 1 ? 'Worktree' : 'Worktrees'} mit uncommitteter Arbeit`);
  }
  if (undecided > 0) {
    parts.push(en
      ? `${undecided} safety ${undecided === 1 ? 'copy' : 'copies'} without a decision`
      : `${undecided} ${undecided === 1 ? 'Sicherungskopie' : 'Sicherungskopien'} ohne Entscheidung`);
  }
  // a safety copy is a net, nothing is lost by waiting: only real work at risk warns
  const icon = unlanded + dirty > 0 ? '⚠' : 'ℹ';
  const totalPart = repos > 1 ? ` · ${machine}` : '';
  return `${icon} ${en ? 'Here' : 'Hier'}: ${parts.join(' / ')}${totalPart} ${stand} ${arrow}`;
}

/** Copies an autosave or cleanup made count once they are this old — a fresh one is the live session's net. */
const UNDECIDED_AFTER_DAYS = 3;

/** At-risk branches, dirty worktrees and undecided safety copies of one report entry. */
function counts(entry) {
  const risk = Array.isArray(entry.atRisk) ? entry.atRisk : [];
  const dirty = risk.filter((r) => r.dirty > 0).length;
  const parked = Array.isArray(entry.parked) ? entry.parked : [];
  const undecided = parked.filter((p) => (p.ageDays || 0) >= UNDECIDED_AFTER_DAYS && isUndecided(p)).length;
  const remote = Array.isArray(entry.remoteOnly) ? entry.remoteOnly.length : 0;
  return { unlanded: risk.length - dirty + remote, dirty, undecided };
}

/** "3 h" from one hour on, otherwise minutes (at least 1). */
function formatAge(ms) {
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h} h` : `${Math.max(1, Math.round(ms / 60_000))} min`;
}

const REFRESH_MS = 24 * 3_600_000;
const SPAWN_COOLDOWN_MS = 3_600_000;

/**
 * Daily refresh without an external scheduler: a missing or >24 h old report
 * starts scripts/orphan-scan.js detached (fire-and-forget, windowless). A
 * tmp marker keeps concurrent sessions from starting it twice within an hour.
 */
function refreshIfStale(file) {
  if (process.env.DEVOPS_ORPHAN_NO_SPAWN) return;
  try {
    let age = Infinity;
    try { age = Date.now() - fs.statSync(file).mtimeMs; } catch { /* no report yet */ }
    if (age < REFRESH_MS) return;
    const marker = path.join(os.tmpdir(), 'dotclaude-orphan-scan.started');
    try {
      if (Date.now() - fs.statSync(marker).mtimeMs < SPAWN_COOLDOWN_MS) return;
    } catch { /* never started */ }
    fs.writeFileSync(marker, String(Date.now()));
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
    const child = require('child_process').spawn(process.execPath, [path.join(pluginRoot, 'scripts', 'orphan-scan.js')], {
      detached: true, stdio: 'ignore', windowsHide: true, cwd: process.cwd(),
    });
    child.unref();
  } catch { /* the nudge is best effort */ }
}

const KILL_RATE_LIMIT = 0.05;
const KILL_MIN_RUNS = 20;
const NUDGE_INTERVAL_MS = 24 * 3_600_000;

/** "⚠ stop.flow.guard killed in 8 % of its last 200 runs (hook timeout) — ..." or null. */
function telemetryLine({ lang = 'de', file, now = Date.now(), stamp } = {}) {
  const tel = require('../lib/hook-telemetry');
  const target = file || tel.filePath();
  if (!target) return null;
  try { if (now - fs.statSync(stamp).mtimeMs < NUDGE_INTERVAL_MS) return null; } catch { /* never nudged */ }
  const bad = tel.killRates(target, { now })
    .filter((r) => r.runs >= KILL_MIN_RUNS && r.rate > KILL_RATE_LIMIT)
    .sort((a, b) => b.rate - a.rate)[0];
  if (!bad) return null;
  try { fs.writeFileSync(stamp, String(now)); } catch { /* best effort */ }
  const rate = Math.round(bad.rate * 100);
  return lang === 'en'
    ? `⚠ Hook ${bad.hook} was killed/timed out in ${rate} % of its last ${bad.runs} runs (overloaded machine or a slow hook)`
    : `⚠ Hook ${bad.hook} wurde in ${rate} % der letzten ${bad.runs} Läufe abgebrochen/Timeout (überlastete Maschine oder langsamer Hook)`;
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    try {
      const hook = input.trim() ? JSON.parse(input) : {};
      refreshIfStale(reportPath());
      let lang = 'de';
      try { lang = require('../lib/locale').getLocale(hook.session_id); } catch { /* default */ }
      const lines = [];
      try {
        const report = JSON.parse(fs.readFileSync(reportPath(), 'utf8'));
        const orphan = buildNudge({ cwd: hook.cwd || process.cwd(), lang, report });
        if (orphan) lines.push(orphan);
      } catch { /* no report or unreadable */ }
      try {
        const tl = telemetryLine({ lang, stamp: path.join(os.tmpdir(), 'dotclaude-hook-telemetry-nudged') });
        if (tl) lines.push(tl);
      } catch { /* telemetry is optional */ }
      const line = lines.join('\n');
      if (line) {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: `[ss.orphan.nudge] Show the user this line verbatim in your first reply, once:\n${line}`,
          },
        }) + '\n');
      }
    } catch { /* no report or unreadable — stay silent */ }
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { buildNudge, reportPath, telemetryLine };

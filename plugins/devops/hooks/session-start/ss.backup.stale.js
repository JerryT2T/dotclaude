#!/usr/bin/env node
/**
 * @hook ss.backup.stale
 * @version 0.2.0
 * @event SessionStart
 * @plugin devops
 * @description One context line about the opt-in backup of ~/.claude: an info
 *   while files were left out of it, a warning when the last run without an
 *   error is older than 2 days. Names counts only, never a file or matched value; the
 *   prompt "Backup-Details" lists them. File reads only; silent otherwise; fails open.
 */

require('../lib/plugin-guard');

const fs = require('fs');
const os = require('os');
const path = require('path');

const STALE_MS = 2 * 86_400_000;
const PROMPT = '„Backup-Details“';

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** "heute 10:49", "gestern 10:49", "vor 4 Tagen" in local time. */
function when(at, now) {
  const a = new Date(at);
  const n = new Date(now);
  const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
  const clock = `${String(a.getHours()).padStart(2, '0')}:${String(a.getMinutes()).padStart(2, '0')}`;
  if (days <= 0) return `heute ${clock}`;
  if (days === 1) return `gestern ${clock}`;
  return `vor ${days} Tagen`;
}

/** The line, or null. `enabled` comes from devops-config (global only setting). */
function buildLine({ home = os.homedir(), enabled, now = Date.now() } = {}) {
  if (enabled === undefined) {
    try { enabled = require('../lib/devops-config').load(home, { home }).values.homeBackup.enabled; } catch { return null; }
  }
  if (!enabled) return null;
  const claude = path.join(home, '.claude');
  const state = readJson(path.join(claude, 'home-backup-state.json')) || {};
  const report = readJson(path.join(claude, 'home-backup-report.json'));
  const hits = report && Array.isArray(report.hits) ? report.hits : [];
  const skipped = new Set(hits.map((h) => h.file)).size;
  const out = skipped ? `${skipped} ${skipped === 1 ? 'Datei' : 'Dateien'} ausgelassen` : '';
  const failed = Boolean(report && report.kind === 'error');
  // lastBackupAt: the last run without an error, also one that left files out. A failed run leaves it alone. Older state files only have
  // lastSuccessAt, and a partial report written before lastBackupAt existed dates its own run.
  const stamps = [state.lastBackupAt, state.lastSuccessAt, report && report.kind === 'partial' ? report.generatedAt : null]
    .map((v) => Date.parse(v || '')).filter(Number.isFinite);
  const last = stamps.length ? Math.max(...stamps) : NaN;
  const head = 'Claude-Konfig-Backup:';
  if (Number.isNaN(last)) {
    if (!report) return null;
    return `⚠ ${head} noch keine Sicherung bestätigt${out ? `, ${out}` : ''}${failed ? ', letzter Versuch fehlgeschlagen' : ''} → ${PROMPT}`;
  }
  if (last > now) return `⚠ ${head} letzte Sicherung liegt in der Zukunft (Uhr prüfen) → ${PROMPT}`;
  if (now - last > STALE_MS) {
    return `⚠ ${head} zuletzt gesichert ${when(last, now)}${out ? `, ${out}` : ''}${failed ? ', letzter Versuch fehlgeschlagen' : ''} → ${PROMPT}`;
  }
  return out ? `ℹ ${head} ${when(last, now)} gesichert, ${out} → ${PROMPT}` : null;
}

function main() {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', () => {});
  process.stdin.on('end', () => {
    try {
      const line = buildLine();
      if (line) {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: `[ss.backup.stale] Show the user this line verbatim in your first reply, once:\n${line}`,
          },
        }) + '\n');
      }
    } catch { /* fail open */ }
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { buildLine };

#!/usr/bin/env node
/**
 * @hook ss.backup.stale
 * @version 0.1.0
 * @event SessionStart
 * @plugin devops
 * @description One context line when the opt-in Home-Backup is on and its last
 *   successful backup is older than 2 days, naming the reason from the report
 *   (file:line (rule) — never the matched value) and pointing to "Home-Backup
 *   Status". File reads only; silent otherwise; fails open.
 */

require('../lib/plugin-guard');

const fs = require('fs');
const os = require('os');
const path = require('path');

const STALE_MS = 2 * 86_400_000;
const REASONS = { blocked: 'blockiert', partial: 'teilweise gesichert', error: 'fehlgeschlagen' };

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
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
  const last = Date.parse(state.lastSuccessAt || '');
  const reason = report && REASONS[report.kind] ? report : null;
  if (Number.isFinite(last) ? now - last <= STALE_MS : !reason) return null;
  const days = Number.isFinite(last) ? Math.floor((now - last) / 86_400_000) : null;
  let why = '';
  if (reason) {
    const hits = Array.isArray(reason.hits) ? reason.hits : [];
    const first = hits[0] ? `: ${hits[0].file}${hits[0].line ? `:${hits[0].line}` : ''} (${hits[0].rule})` : '';
    why = ` — ${REASONS[reason.kind]}${first}${hits.length > 1 ? ` +${hits.length - 1} weitere` : ''}`;
  }
  const age = days === null ? 'unbekannt' : `vor ${days} Tagen`;
  return `⚠ Home-Backup: letztes erfolgreiches Backup ${age}${why} → „Home-Backup Status“`;
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

'use strict';
/**
 * @module usage-drift
 * @version 0.1.0
 * @plugin devops
 * @description Detects a format change of the claude.ai usage response and
 *   offers the user a plugin issue through `devops learn`, at most once per
 *   calendar month per machine. Nothing is filed here: the notice only names the
 *   signature. An absent or null `five_hour` is NOT drift (idle Max window,
 *   Ultra without a 5 h limit); drift means the weekly data is gone, or the
 *   response is not the expected object.
 *
 *   Files (per machine, under ~/.claude/): usage-format-drift.json (last
 *   signature; removed by the next healthy response), usage-format-drift-notified (the "YYYY-MM" last announced).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** The weekly_all entry of `limits[]`, or null. */
function weeklyAllLimit(usage) {
  const list = usage && Array.isArray(usage.limits) ? usage.limits : [];
  return list.find((l) => l && l.kind === 'weekly_all' && typeof l.percent === 'number') || null;
}

/**
 * Signature of an unexpected response, or null when the shape is understood.
 * The signature holds field names only, never values or ids.
 */
function usageShape(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return 'not-an-object';
  const seven = usage.seven_day;
  const hasSeven = seven && typeof seven === 'object' && typeof seven.utilization === 'number';
  // `seven_day: null` (key present) is an idle week, like `five_hour: null`: not drift.
  if (hasSeven || seven === null || weeklyAllLimit(usage)) return null;
  const keys = Object.keys(usage).sort().slice(0, 12).join(',');
  return `no-weekly-window keys=${keys}`;
}

function driftFile(home) { return path.join(home, '.claude', 'usage-format-drift.json'); }
function noticeFile(home) { return path.join(home, '.claude', 'usage-format-drift-notified'); }
function monthOf(nowMs) { return new Date(nowMs).toISOString().slice(0, 7); }

/** Remember a drift signature (never throws). */
function recordDrift(signature, { home = os.homedir(), nowMs = Date.now() } = {}) {
  try {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(driftFile(home), JSON.stringify({ signature, seenAt: new Date(nowMs).toISOString() }) + '\n');
  } catch { /* a notice is never worth a failure */ }
}

/**
 * A healthy response ends the drift: forget the signature, so a one-off odd
 * response does not announce every month. Never throws.
 */
function clearDrift({ home = os.homedir() } = {}) {
  try { fs.rmSync(driftFile(home), { force: true }); } catch { /* nothing to clear */ }
}

/**
 * The SessionStart line, once per calendar month while a drift is recorded;
 * null otherwise. Writing the marker is what limits it to once.
 */
function driftNotice({ home = os.homedir(), nowMs = Date.now() } = {}) {
  let rec;
  try { rec = JSON.parse(fs.readFileSync(driftFile(home), 'utf8')); } catch { return null; }
  if (!rec || typeof rec.signature !== 'string') return null;
  const month = monthOf(nowMs);
  try { if (fs.readFileSync(noticeFile(home), 'utf8').trim() === month) return null; } catch { /* never announced */ }
  try { fs.writeFileSync(noticeFile(home), month); } catch { return null; }
  return '[ss.usage.drift.notice] Show the user this line verbatim in your first reply, once:\n'
    + `⚠ devops: the claude.ai usage response changed shape (${rec.signature}), so usage numbers may be missing. `
    + 'Say "devops learn" to report it as a plugin issue; nothing is filed unless you do.';
}

module.exports = { usageShape, weeklyAllLimit, recordDrift, clearDrift, driftNotice };

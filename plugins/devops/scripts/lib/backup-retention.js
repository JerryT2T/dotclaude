'use strict';
/**
 * @script backup-retention
 * @version 0.1.0
 * @plugin devops
 * @description The one pure answer to "which backup days survive": the newest
 *   `keepDays` distinct days plus, for the `keepWeeks` most recent ISO weeks,
 *   the FIRST day of each week (the weekly anchor). Used by the github history
 *   rebuild, the folder day dirs and the rclone purge.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO week of a `YYYY-MM-DD` day as `YYYY-Www` (weeks start on Monday, week 1 holds Jan 4th). */
function isoWeekKey(day) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7) + 3); // the Thursday of this week
  const isoYear = dt.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((dt - jan4) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * @param {string[]} days  `YYYY-MM-DD` keys (duplicates and junk are ignored)
 * @param {number} keepDays  newest distinct days kept
 * @param {number} keepWeeks  most recent ISO weeks (that have data) whose first day is kept; 0 = off
 * @returns {Set<string>} the days to keep
 */
function selectKeepDays(days, keepDays, keepWeeks = 0) {
  const sorted = [...new Set(days.filter((d) => DAY_RE.test(d)))].sort().reverse();
  const keep = new Set(sorted.slice(0, Math.max(0, keepDays)));
  if (keepWeeks > 0) {
    const firstOfWeek = new Map();
    for (const d of sorted) firstOfWeek.set(isoWeekKey(d), d); // ascending overwrite → ends on the oldest
    const weeks = [...firstOfWeek.keys()].sort().reverse().slice(0, keepWeeks);
    for (const w of weeks) keep.add(firstOfWeek.get(w));
  }
  return keep;
}

module.exports = { selectKeepDays, isoWeekKey, DAY_RE };

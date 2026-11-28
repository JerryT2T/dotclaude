/**
 * @module pulse-ttl
 * @version 1.0.0
 * @description One rule for every "running" status shown to a person: a
 *   running state counts only while its last pulse is younger than a TTL. A
 *   run that stopped without clearing its state (crash, quit, orphaned
 *   process) must read "abgebrochen?", never "läuft" (backlog run showed
 *   "Ship läuft" for ~11 h; #1246 showed "setzt um" with Claude gone).
 */

/** A running state without a pulse for this long is stale. */
const PULSE_TTL_MS = 15 * 60_000;
/** Upper bound for a live session that still holds open background work. */
const OPEN_WORK_PULSE_TTL_MS = 3 * 3_600_000;

/** True when `ts` (ms epoch) is missing or older than `ttlMs` at `now`. */
function isPulseStale(ts, now = Date.now(), ttlMs = PULSE_TTL_MS) {
  return !Number.isFinite(ts) || now - ts > ttlMs;
}

/** `kein Lebenszeichen seit HH:MM` for a stale pulse. */
function staleLabel(ts) {
  if (!Number.isFinite(ts)) return 'abgebrochen? kein Lebenszeichen';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `abgebrochen? kein Lebenszeichen seit ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The status text to show: `runningText` while the pulse is fresh, else the stale label. */
function runningStatus(runningText, ts, now = Date.now(), ttlMs = PULSE_TTL_MS) {
  return isPulseStale(ts, now, ttlMs) ? staleLabel(ts) : runningText;
}

module.exports = { PULSE_TTL_MS, OPEN_WORK_PULSE_TTL_MS, isPulseStale, staleLabel, runningStatus };

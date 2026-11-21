/**
 * @module run-once
 * @version 0.1.0
 * @description Session-scoped execution guard with optional cooldown.
 *
 * Prevents hooks from running repeatedly when SessionStart fires multiple
 * times per session. Two modes:
 *
 *   runOnce(hookName, sessionId)
 *     → runs exactly once per session (marker file per session ID)
 *
 *   runOnce(hookName, sessionId, { cooldownMs: 600000 })
 *     → runs again only after cooldownMs since last execution
 *
 * Returns true if the hook should run, false if it should skip.
 * Automatically writes the marker file when returning true.
 *
 *   releaseOnce(hookName, sessionId)
 *     → give the token back, so the next call is allowed again
 *
 * `releaseOnce` exists for the case where the guarded work turns out not to
 * happen after all — the classic shape being a throttled spawn that a
 * downstream concurrency guard then declines (issue #291). Consuming a
 * 10-minute token for an action that never ran means the next session redraws
 * the same losing ticket, and on a machine where the downstream guard is
 * usually saturated the work is starved indefinitely with nothing recorded.
 * Release the token whenever the run did not actually occur.
 *
 * Usage:
 *   const { runOnce, releaseOnce } = require('../lib/run-once');
 *   const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
 *   if (!runOnce('ss-tokens-scan', input.session_id, { cooldownMs: 600000 })) process.exit(0);
 *   if (!spawnActuallyIssued()) releaseOnce('ss-tokens-scan', input.session_id);
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function markerPath(hookName, sessionId) {
  const key = sessionId || 'unknown';
  return path.join(os.tmpdir(), `dotclaude-${hookName}-${key}`);
}

const CLAIM_MS = 30 * 1000;

function runOnce(hookName, sessionId, opts = {}) {
  const file = markerPath(hookName, sessionId);
  const cooldownMs = opts.cooldownMs || 0;

  // true while the marker says "do not run": present (no cooldown) or younger than the cooldown
  const throttled = () => {
    try {
      const stat = fs.statSync(file);
      return cooldownMs <= 0 || Date.now() - stat.mtimeMs < cooldownMs;
    } catch {
      return false; // no marker — first run
    }
  };
  if (throttled()) return false;

  // Claim the gate: two sessions starting together must not both pass the check above.
  // The claim is held only across re-check + marker write; a crashed holder's claim
  // goes stale after CLAIM_MS.
  const claim = `${file}.claim`;
  let claimed = false;
  try {
    fs.writeFileSync(claim, String(process.pid), { flag: 'wx' });
    claimed = true;
  } catch (e) {
    if (e.code === 'EEXIST') {
      let fresh = false;
      try { fresh = Date.now() - fs.statSync(claim).mtimeMs < CLAIM_MS; } catch { /* vanished */ }
      if (fresh) return false; // the other session is deciding right now
      try { fs.writeFileSync(claim, String(process.pid)); claimed = true; } catch { /* ignore */ }
    } // any other error (read-only tmp): fall through to the plain marker write
  }
  try {
    if (throttled()) return false; // the other session finished between our check and our claim
    fs.writeFileSync(file, String(Date.now()));
    return true;
  } finally {
    if (claimed) { try { fs.unlinkSync(claim); } catch { /* gone */ } }
  }
}

/**
 * Hand back a token taken by `runOnce` — the guarded work did not run, so the
 * next caller must not be throttled on its behalf. Removing the marker restores
 * the pre-`runOnce` state exactly: a missing marker is "first run".
 *
 * Never throws. A marker that is already gone (another session released it, or
 * temp was swept) is the desired end state, not an error.
 *
 * @param {string} hookName
 * @param {string} sessionId — the same key `runOnce` was called with
 * @returns {boolean} true if a marker was removed
 */
function releaseOnce(hookName, sessionId) {
  try {
    fs.unlinkSync(markerPath(hookName, sessionId));
    return true;
  } catch {
    return false;
  }
}

module.exports = { runOnce, releaseOnce };

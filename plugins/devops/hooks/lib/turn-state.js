/**
 * @module turn-state
 * @version 0.1.0
 * @plugin devops
 * @description One JSON state file per session for the card / title hooks'
 *   small markers, instead of one `os.tmpdir()` marker file each
 *   (`dotclaude-devops-<name>-<session>`). File:
 *   `<tmpdir>/dotclaude-devops-turn-state-<session>.json`, an object of
 *   `{ <key>: <string value> }`. Absent key = the old "no marker file".
 *
 *   Writes go through lib/session-id.js writeSessionFile: a temp file with a
 *   pid + random suffix (CONVENTIONS § Lanes, AUD-027), then an atomic rename,
 *   so a reader never sees half a file. A read-modify-write of two parallel
 *   hooks can still drop the other's key (last rename wins); only keys whose
 *   loss is harmless live here — a lost hint key costs one repeated hint line,
 *   never a skipped gate. Gate flags shared with the MCP server or hooks
 *   outside the card/title family (card-rendered, card-widget, card-pregate,
 *   card-contract-sent, work-happened, validation-*, light-*) stay separate
 *   marker files.
 *
 *   Keys (owner):
 *     cardRenderedHinted   post.flow.completion — render stamp already hinted
 *     conceptInfraHinted   post.flow.completion — concept bridge hint sent
 *     interruptTitle       stop.flow.guard F5 — Interrupted rename asked
 *     notificationCardSig  stop.flow.guard § 5.5 — last notification card
 *     answerReemit         stop.flow.guard #757 — answer re-emit asked
 *
 *   Never throws on read (missing / corrupt file → `{}`); `set` / `del`
 *   rethrow a failed write so callers keep their "unwritable → no block" path.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeSessionFile } = require('./session-id');

const PREFIX = 'dotclaude-devops-turn-state';

/** The state file of `sessionId` (same key rule as sessionFile: missing → "unknown"). */
function stateFile(sessionId) {
  return path.join(os.tmpdir(), `${PREFIX}-${sessionId || 'unknown'}.json`);
}

/** The whole state, `{}` when there is none or it is unreadable. */
function readState(sessionId) {
  try {
    const o = JSON.parse(fs.readFileSync(stateFile(sessionId), 'utf8'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/** The value of `key`, or null when unset. */
function get(sessionId, key) {
  const v = readState(sessionId)[key];
  return v === undefined || v === null ? null : String(v);
}

/** Sets `key` to `value` (stringified). Throws when the write fails. */
function set(sessionId, key, value) {
  const state = readState(sessionId);
  state[key] = String(value);
  writeSessionFile(stateFile(sessionId), JSON.stringify(state));
}

/** Removes `key`; true when it was set. Throws when the write fails. */
function del(sessionId, key) {
  const state = readState(sessionId);
  if (!(key in state)) return false;
  delete state[key];
  writeSessionFile(stateFile(sessionId), JSON.stringify(state));
  return true;
}

module.exports = { PREFIX, stateFile, readState, get, set, del };

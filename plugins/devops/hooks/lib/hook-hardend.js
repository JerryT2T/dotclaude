/**
 * @module hook-hardend
 * @version 0.1.0
 * @description The trace a hard dispatcher end leaves for the session (#1151).
 *
 *   When a hook module is stuck in a call that cannot be ended, the
 *   dispatcher kills itself (dispatch.js). Claude Code holds that call back,
 *   and it also cancels the other tool calls of the same assistant message
 *   with its own text ("The user doesn't want to take this action right
 *   now. STOP …"), which reads like a refusal by the user. The dispatcher
 *   never sees those sibling calls, so it cannot answer them; instead it
 *   leaves a per-session marker here, and two consumers say once what
 *   really happened:
 *     - stop.hook.hardend   — the turn is about to end: block it once with
 *                             "the batch was ended by a hook failure, not
 *                             by you: resend and go on";
 *     - prompt.hook.hardend — the stop did not consume it: tell the next
 *                             prompt once.
 *
 *   One file per session: ~/.claude/devops-hook-hardend/<session>.json
 *   (env DEVOPS_HOOK_HARDEND_DIR overrides the folder). A marker older than
 *   MAX_AGE_MS is dropped unread. Everything here fails open.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function dir(env = process.env) {
  return env.DEVOPS_HOOK_HARDEND_DIR || path.join(os.homedir(), '.claude', 'devops-hook-hardend');
}

function safeId(sessionId) {
  return String(sessionId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
}

function fileFor(sessionId, env) {
  const id = safeId(sessionId);
  return id ? path.join(dir(env), `${id}.json`) : null;
}

/**
 * Record a hard end. Synchronous: the dispatcher kills itself right after.
 * @param {{sessionId:string, event:string, tool?:string, modules:string[], now?:number}} o
 * @returns {boolean} written
 */
function write(o, env = process.env) {
  try {
    const file = fileFor(o && o.sessionId, env);
    if (!file) return false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const rec = { ts: o.now || Date.now(), event: String(o.event || ''), tool: String(o.tool || ''), modules: (o.modules || []).map(String) };
    fs.writeFileSync(file, `${JSON.stringify(rec)}\n`);
    return true;
  } catch { return false; }
}

/**
 * Read and remove the session's marker: one notice per hard end.
 * @returns {{ts:number, event:string, tool:string, modules:string[]}|null}
 */
function consume(sessionId, { now = Date.now(), env = process.env } = {}) {
  const file = fileFor(sessionId, env);
  if (!file) return null;
  let rec = null;
  try { rec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  try { fs.unlinkSync(file); } catch { /* gone already */ }
  if (!rec || typeof rec !== 'object' || !(now - Number(rec.ts) <= MAX_AGE_MS)) return null;
  return rec;
}

/** One line naming what hung, for both consumers. */
function describe(rec) {
  const what = [rec.event, rec.tool].filter(Boolean).join(' · ');
  const mods = (rec.modules || []).filter(Boolean);
  return `${what || 'a hook'}${mods.length ? `, stuck module ${mods.join(', ')}` : ''}`;
}

function stopText(rec) {
  return `[devops] The last batch of tool calls was ended by a hook failure (${describe(rec)}), not by the user. ` +
    'A call that came back as "The user doesn\'t want to take this action right now" in that batch was cancelled by Claude Code ' +
    'because a sibling hook ended hard; the user declined nothing. Send the held-back calls again and continue the task.';
}

function promptText(rec) {
  return `[devops] Note: the previous turn's last tool batch was ended by a hook failure (${describe(rec)}), not by the user. ` +
    'A "The user doesn\'t want to take this action" result in it was no refusal; if that turn stopped because of it, pick its work up again.';
}

module.exports = { write, consume, describe, stopText, promptText, dir, MAX_AGE_MS };

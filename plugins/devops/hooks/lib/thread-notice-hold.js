'use strict';
/**
 * @module thread-notice-hold
 * @version 0.1.0
 * @plugin devops
 * @description Session-start notices for the Desktop user never reach a Claude
 *   Projects thread. At SessionStart a session is not yet known to be a thread
 *   (the wake envelope arrives with the first prompt), so the dispatcher hands
 *   every such piece to `holdSessionStart`, which keeps it in a per-session tmp
 *   file instead of the model's context. The next UserPromptSubmit decides:
 *   a typed prompt releases the held pieces unchanged and in order (a Desktop
 *   session shows what it always showed, one hook event later), a whole wake
 *   envelope or a marked thread clears them and releases nothing.
 *
 *   A notice is a piece of module output that tells the model to show the user
 *   something verbatim: /show the user this … verbatim/ (en) and
 *   /dem user diese … verbatim/ (de, ss.plugin.update). A piece is a module's
 *   whole output, or — where a module wraps several notices in one text
 *   (ss.project.setup) — the part from one `[ss.<name>]` line to the next.
 *
 *   The file exists as soon as the hold is active for the session, even with
 *   no pieces: that is the marker prompt.thread.notices reads to stay silent.
 *   Feature `project-threads` gates it (nothing changes when it is not allowed
 *   on this channel); releasing what is already held never depends on it.
 */

const { sessionFile, readSessionFile, writeSessionFile } = require('./session-id');

const HOLD_FLAG = 'dotclaude-devops-thread-notice-hold';
const FEATURE = 'project-threads';

const NOTICE = /(?:show the user this|dem user diese)\b[^\n]*verbatim/i;
const SEGMENT_START = /(?=^\[ss\.[\w.]+\])/m;

const isNotice = (text) => NOTICE.test(text);

/**
 * Split one module output into what stays and the notices in it.
 * @param {string} text
 * @returns {{ kept: string, held: string[] }} `kept` is `text` itself when nothing is held
 */
function splitNotices(text) {
  const s = String(text || '');
  if (!isNotice(s)) return { kept: s, held: [] };
  const held = [];
  let kept = '';
  for (const seg of s.split(SEGMENT_START)) {
    if (isNotice(seg)) held.push(seg.replace(/\s+$/, ''));
    else kept += seg;
  }
  return { kept, held };
}

function parseJson(stdout) {
  const t = String(stdout || '').trim();
  if (!t.startsWith('{')) return null;
  try { const j = JSON.parse(t); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch { return null; }
}

/**
 * One module result without its notices.
 * @returns {{ result: object, held: string[] }} `result` is the same object when nothing is held
 */
function stripResult(r) {
  if (!r || r.timedOut || r.skipped || (r.code || 0) !== 0 || !isNotice(r.stdout)) return { result: r, held: [] };
  const json = parseJson(r.stdout);
  if (!json) {
    const { kept, held } = splitNotices(r.stdout);
    return { result: held.length ? { ...r, stdout: kept.trim() ? kept : '' } : r, held };
  }
  const hso = json.hookSpecificOutput;
  if (!hso || typeof hso.additionalContext !== 'string') return { result: r, held: [] };
  const { kept, held } = splitNotices(hso.additionalContext);
  if (!held.length) return { result: r, held: [] };
  const next = { ...json, hookSpecificOutput: { ...hso } };
  if (kept.trim()) next.hookSpecificOutput.additionalContext = kept;
  else delete next.hookSpecificOutput.additionalContext;
  const bare = Object.keys(next).every((k) => k === 'hookSpecificOutput') && Object.keys(next.hookSpecificOutput).every((k) => k === 'hookEventName');
  return { result: { ...r, stdout: bare ? '' : JSON.stringify(next) + '\n' }, held };
}

function read(sessionId) {
  const f = readSessionFile(HOLD_FLAG, sessionId, { exact: true });
  if (!f) return null;
  try {
    const j = JSON.parse(f.content);
    return { pieces: Array.isArray(j.pieces) ? j.pieces.filter((p) => typeof p === 'string') : [] };
  } catch { return { pieces: [] }; }
}

function write(sessionId, pieces) {
  writeSessionFile(sessionFile(HOLD_FLAG, sessionId), JSON.stringify({ pieces }));
}

/** Is a hold active for this session (file present, even with no pieces)? */
function holdActive(sessionId) {
  return !!sessionId && read(sessionId) !== null;
}

function featureOn(opts) {
  try { return require('./features').featureAllowed(FEATURE, opts); } catch { return false; }
}

/**
 * SessionStart: take the notices out of the module results and keep them.
 * Without the feature, without a session id or on any failure the results are returned untouched.
 * @param {Array<object>} results the modules' results, manifest order
 * @param {{ session_id?: string }|null} payload
 * @returns {Array<object>}
 */
function holdSessionStart(results, payload, opts = {}) {
  try {
    const sid = payload && typeof payload.session_id === 'string' ? payload.session_id : '';
    if (!sid || !featureOn(opts.features)) return results;
    const heldAll = [];
    const out = results.map((r) => {
      const { result, held } = stripResult(r);
      heldAll.push(...held);
      return result;
    });
    // A session that is already a thread (resume, compact): the notices are dropped right here.
    const thread = require('./project-thread').isMarked(sid);
    const old = read(sid);
    write(sid, thread ? [] : [...(old ? old.pieces : []), ...heldAll]);
    return out;
  } catch { return results; }
}

/**
 * UserPromptSubmit: the held pieces as one context text for a typed prompt,
 * nothing for a thread; the hold is emptied either way (the marker stays).
 * @param {object} hook the normalized payload (`prompt_raw`, `session_id`)
 * @returns {string} '' when nothing is to be released
 */
function releaseOnPrompt(hook) {
  try {
    const sid = hook && typeof hook.session_id === 'string' ? hook.session_id : '';
    const held = sid ? read(sid) : null;
    if (!held || !held.pieces.length) return '';
    const P = require('./project-thread');
    P.isThread(hook, { deep: true }); // a whole wake envelope marks the session
    write(sid, []);
    return P.isMarked(sid) ? '' : held.pieces.join('\n\n');
  } catch { return ''; }
}

module.exports = { HOLD_FLAG, NOTICE, isNotice, splitNotices, stripResult, holdActive, holdSessionStart, releaseOnPrompt };

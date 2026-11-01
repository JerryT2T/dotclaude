'use strict';
/**
 * @module token-log
 * @version 0.1.0
 * @plugin devops
 * @description Where the plugin's tokens go, counted locally at zero model
 *   cost (#1002). Alpha only (`token-log` in features.json). The dispatcher
 *   calls recordEvent() once per hook event; it appends one JSONL line with
 *   the characters each module handed the model (additionalContext, a block
 *   reason, plain stdout of a context event) and, for PostToolUse, the tool
 *   and its result size. On Stop it adds the API usage of the main-thread
 *   assistant calls since the previous Stop of the session.
 *
 *   File: ~/.claude/devops-token-log.jsonl (env DEVOPS_TOKEN_LOG overrides,
 *   `off` disables). Capped at MAX_BYTES: the oldest half is dropped. The
 *   plugin audit (.claude/skills/plugin-audit, monthly) summarises the file
 *   and then truncates it.
 *
 *   Never throws, never prints, never changes a hook's result. Skipped under
 *   vitest unless the env path is set explicitly.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_BYTES = 2 * 1024 * 1024;
const TAIL_BYTES = 512 * 1024;
const PLAIN_IS_CONTEXT = new Set(['SessionStart', 'UserPromptSubmit']);

function filePath() {
  const env = process.env.DEVOPS_TOKEN_LOG;
  if (env && !/^(off|0|false)$/i.test(env)) return env;
  if (env) return null;
  if (process.env.VITEST) return null;
  return path.join(os.homedir(), '.claude', 'devops-token-log.jsonl');
}

function parseJson(s) {
  if (typeof s !== 'string' || !s.trim().startsWith('{')) return null;
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * Characters one module result handed the model.
 * @param {string} event
 * @param {{code?:number, stdout?:string, stderr?:string}} r
 * @returns {number}
 */
function modelChars(event, r) {
  const stdout = typeof r.stdout === 'string' ? r.stdout : '';
  if ((r.code || 0) === 2) return (typeof r.stderr === 'string' ? r.stderr.trim().length : 0);
  const json = parseJson(stdout);
  if (!json) return (r.code || 0) === 0 && PLAIN_IS_CONTEXT.has(event) ? stdout.trim().length : 0;
  const hso = json.hookSpecificOutput && typeof json.hookSpecificOutput === 'object' ? json.hookSpecificOutput : {};
  let n = 0;
  if (typeof hso.additionalContext === 'string') n += hso.additionalContext.length;
  if (json.decision === 'block' && typeof json.reason === 'string') n += json.reason.length;
  if (typeof hso.permissionDecisionReason === 'string' && hso.permissionDecision === 'deny') n += hso.permissionDecisionReason.length;
  return n;
}

function sizeOf(v) {
  if (v == null) return 0;
  if (typeof v === 'string') return v.length;
  try { return JSON.stringify(v).length; } catch { return 0; }
}

/**
 * Sum of the main-thread assistant usage after the line with `after.uuid`.
 * When that line is no longer in the tail (a turn longer than TAIL_BYTES),
 * only lines newer than `after.ts` count, so no call is counted twice.
 * Returns the newest uuid and timestamp too.
 * @param {string} text JSONL tail (may start mid-line)
 * @param {{uuid?:string|null, ts?:string|null}|null} after
 */
function usageSince(text, after) {
  const sum = { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  let last = null;
  let lastTs = null;
  const lines = String(text || '').split('\n');
  let start = 0;
  let minTs = null;
  if (after && after.uuid) {
    const at = lines.findIndex((l) => l.includes(`"uuid":"${after.uuid}"`));
    if (at >= 0) start = at + 1;
    else minTs = after.ts || null;
  }
  const seen = new Set();
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('"assistant"') || !line.includes('"usage"')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'assistant' || o.isSidechain) continue;
    if (minTs && !(typeof o.timestamp === 'string' && o.timestamp > minTs)) continue;
    last = o.uuid || last;
    lastTs = o.timestamp || lastTs;
    // One API call can be split over several lines (one per content block)
    // that repeat the same usage: count each message id once.
    const id = o.message && o.message.id;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const u = (o.message && o.message.usage) || {};
    sum.calls++;
    sum.input += u.input_tokens || 0;
    sum.cacheRead += u.cache_read_input_tokens || 0;
    sum.cacheWrite += u.cache_creation_input_tokens || 0;
    sum.output += u.output_tokens || 0;
  }
  return { sum, last, lastTs };
}

function readTail(file) {
  let fd;
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - TAIL_BYTES);
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } catch { return ''; } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* closed */ }
  }
}

function rotate(file) {
  const text = fs.readFileSync(file, 'utf8');
  const keep = text.slice(Math.floor(text.length / 2));
  const nl = keep.indexOf('\n');
  fs.writeFileSync(file, nl === -1 ? '' : keep.slice(nl + 1));
}

function append(file, rec) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { if (fs.statSync(file).size > MAX_BYTES) rotate(file); } catch { /* absent: append creates it */ }
  fs.appendFileSync(file, `${JSON.stringify(rec)}\n`);
}

function allowed(opts) {
  if (opts && typeof opts.allowed === 'boolean') return opts.allowed;
  try { return require('./features').featureAllowed('token-log'); } catch { return false; }
}

/**
 * Record one dispatched hook event. Never throws.
 * @param {string} event
 * @param {object|null} payload parsed hook input
 * @param {Array<{name:string, code?:number, stdout?:string, stderr?:string}>} results
 * @param {{allowed?:boolean, file?:string}} [opts]
 * @returns {object|null} the record written, or null
 */
function recordEvent(event, payload, results, opts = {}) {
  try {
    const file = opts.file || filePath();
    if (!file || !allowed(opts)) return null;
    const p = payload && typeof payload === 'object' ? payload : {};
    const hooks = {};
    let ctx = 0;
    for (const r of results || []) {
      const n = modelChars(event, r || {});
      if (n > 0) { hooks[r.name] = n; ctx += n; }
    }
    const rec = { v: 1, ts: new Date().toISOString(), sid: p.session_id || null, event, ctx, hooks };
    if (event === 'PostToolUse' || event === 'PreToolUse') rec.tool = p.tool_name || null;
    if (event === 'PostToolUse') rec.result = sizeOf(p.tool_response);
    if (event === 'Stop' && p.transcript_path && p.session_id) {
      const { sessionFile, writeSessionFile } = require('./session-id');
      const marker = sessionFile('dotclaude-token-log-last', p.session_id);
      let after = null;
      try {
        const [uuid, ts] = fs.readFileSync(marker, 'utf8').trim().split('\t');
        if (uuid) after = { uuid, ts: ts || null };
      } catch { /* first Stop */ }
      const { sum, last, lastTs } = usageSince(readTail(p.transcript_path), after);
      if (sum.calls) rec.usage = sum;
      if (last) try { writeSessionFile(marker, `${last}\t${lastTs || ''}`); } catch { /* next Stop counts again */ }
    }
    if (!rec.ctx && !rec.usage && !rec.result) return null;
    append(file, rec);
    return rec;
  } catch {
    return null;
  }
}

module.exports = { recordEvent, modelChars, usageSince, filePath, MAX_BYTES };

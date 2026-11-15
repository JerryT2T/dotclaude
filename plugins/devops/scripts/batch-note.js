#!/usr/bin/env node
/**
 * batch-note — the ONE write path the Claude Code mod uses to file a collected
 * prompt (docs/dev/mods.md § Batch collect). Same rules and the same note
 * format as `hooks/user-prompt-submit/prompt.batch.collect.js`; the hook stays
 * the fallback whenever this entry does not confirm.
 *
 * stdin  JSON  { cwd, sessionId?, text, attachments?: [{ name?, mediaType?, base64 }], key? }
 * stdout JSON  { ok: true, n, images, deduped? }  or  { ok: false, reason }
 * exit   0 only with `ok: true` — the caller drops the prompt on that and on
 *        nothing else.
 *
 * Robustness, in this order:
 *   1. Authority: `classify` of batch-state.js (never machine prompts, slash
 *      commands, the execute marker, /do-batch routes), mode active and inside
 *      its bounds, notes not owned by another session (#841).
 *   2. Images FIRST into `.claude/batch-assets/` (exclusive create, size
 *      verified). One image failing aborts the whole filing and removes the
 *      copies written so far: no half note. The caller then falls back to the
 *      hook, which takes the whole prompt (the safer side — an image is never
 *      silently missing from a note).
 *   3. The note LAST, in one append (`appendNote`), confirmed by the count.
 *   4. Idempotency: the same `key` within IDEMPOTENCY_MS answers with the first
 *      result instead of filing twice (a retried submit).
 * A kill between step 3 and the stdout line would be a double filing after the
 * hook fallback — a duplicate, never a loss.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const B = require('../hooks/lib/batch-state');

const IDEMPOTENCY_MS = 15_000;
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;
const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };

function keyFile(cwd) { return path.join(B.assetsDir(cwd), 'note-keys.json'); }

function readKeys(cwd) {
  try {
    const raw = JSON.parse(fs.readFileSync(keyFile(cwd), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}

function rememberKey(cwd, key, result, now) {
  const keys = readKeys(cwd);
  for (const [k, v] of Object.entries(keys)) if (!v || now - v.at > IDEMPOTENCY_MS) delete keys[k];
  fs.mkdirSync(B.assetsDir(cwd), { recursive: true });
  keys[key] = { at: now, n: result.n, images: result.images };
  const tmp = `${keyFile(cwd)}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(keys), 'utf8');
  fs.renameSync(tmp, keyFile(cwd));
}

function extFor(att) {
  const byMime = EXT_BY_MIME[String(att.mediaType || '').toLowerCase()];
  if (byMime) return byMime;
  const m = /\.(png|jpe?g|gif|webp|bmp)$/i.exec(String(att.name || ''));
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : null;
}

/**
 * Write every attachment as a file under batch-assets. Throws on the first
 * failure after removing what it already wrote.
 * @returns {string[]} absolute paths, in order
 */
function writeImages(cwd, attachments, stampMs) {
  const dir = B.assetsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date(stampMs).toISOString().replace(/[:.]/g, '-');
  const written = [];
  try {
    attachments.forEach((att, i) => {
      const ext = extFor(att);
      if (!ext) throw new Error(`unsupported attachment type ${att.mediaType || att.name || '?'}`);
      if (typeof att.base64 !== 'string' || !att.base64) throw new Error('empty attachment');
      const bytes = Buffer.from(att.base64, 'base64');
      if (!bytes.length) throw new Error('empty attachment');
      if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('attachment too large');
      let file = null;
      for (let k = i + 1; k < i + 50 && !file; k++) {
        const candidate = path.join(dir, `${stamp}-${k}.${ext}`);
        try { fs.writeFileSync(candidate, bytes, { flag: 'wx' }); file = candidate; } catch (err) {
          if (err.code !== 'EEXIST') throw err; // taken by a concurrent writer: next index
        }
      }
      if (!file) throw new Error('no free asset name');
      written.push(file);
      if (fs.statSync(file).size !== bytes.length) throw new Error('short write');
    });
  } catch (err) {
    for (const f of written) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
    throw err;
  }
  return written;
}

/** `@path/file.ext` mentions of the prompt that exist on disk, as absolute paths. */
function fileMentions(cwd, text) {
  const out = [];
  for (const ref of B.attachmentRefs(text, null)) {
    const abs = path.isAbsolute(ref) ? ref : path.resolve(cwd, ref);
    try { if (fs.statSync(abs).isFile()) out.push(abs); } catch { /* not a file: stays in the text only */ }
  }
  return out;
}

/**
 * @param {{cwd:string,sessionId?:string,text:string,attachments?:object[],key?:string}} req
 * @param {number} [now]
 * @returns {{ok:true,n:number,images:number,deduped?:true}|{ok:false,reason:string}}
 */
function fileNote(req, now = Date.now()) {
  if (!req || typeof req !== 'object') return { ok: false, reason: 'bad-request' };
  const { cwd, sessionId } = req;
  if (typeof cwd !== 'string' || !cwd || !path.isAbsolute(cwd)) return { ok: false, reason: 'bad-cwd' };
  const text = typeof req.text === 'string' ? req.text : '';
  const attachments = Array.isArray(req.attachments) ? req.attachments : [];
  if (attachments.length > MAX_ATTACHMENTS) return { ok: false, reason: 'too-many-attachments' };
  if (!text.trim() && !attachments.length) return { ok: false, reason: 'empty' };

  const key = typeof req.key === 'string' && req.key ? req.key : null;
  if (key) {
    const hit = readKeys(cwd)[key];
    if (hit && now - hit.at <= IDEMPOTENCY_MS && Number.isInteger(hit.n)) return { ok: true, n: hit.n, images: hit.images || 0, deduped: true };
  }

  let marker;
  let modeActive;
  let foreign;
  try {
    modeActive = B.isModeActive(cwd, now);
    if (!modeActive) return { ok: false, reason: B.expiryReason(cwd, now) || 'inactive' };
    foreign = B.isForeignSession(cwd, sessionId);
    if (foreign) return { ok: false, reason: 'foreign' };
    marker = B.effectiveMarker(cwd);
  } catch { return { ok: false, reason: 'state-unreadable' }; }

  // Attachments are filed by this entry itself, so the text is classified without them.
  // Their placeholders and @mentions are neutralised for the probe only; the note keeps the text verbatim.
  const probe = text
    .replace(/\[Image\s*#?\d*\]/gi, '')
    .replace(/\[Pasted text[^\]]*\]/gi, '')
    .replace(/(^|\s)@(?=[\w.\-/\\]+\.[A-Za-z0-9]{1,8}(\s|$))/g, '$1');
  // A typed slash command is the harness's, never a note (the hook only meets its expansion).
  if (/^\s*\//.test(text)) return { ok: false, reason: 'not-collectable:slash' };
  if (probe.trim()) {
    const verdict = B.classify({ text: probe, hookInput: {}, marker, modeActive, foreign });
    if (verdict !== 'collect') return { ok: false, reason: `not-collectable:${verdict}` };
  }

  let copies = [];
  try {
    copies = attachments.length ? writeImages(cwd, attachments, now) : [];
    const mentions = fileMentions(cwd, text);
    const noteText = [text.trim(), B.attachmentFileLines([...mentions, ...copies])].filter(Boolean).join('\n');
    if (!noteText) return { ok: false, reason: 'empty' };
    const before = B.countNotes(cwd);
    const n = B.appendNote(cwd, noteText, now);
    if (!(n > before)) throw new Error('note not stored');
    const result = { ok: true, n, images: copies.length };
    try { if (key) rememberKey(cwd, key, result, now); } catch { /* the note is filed; a missed key only weakens the retry guard */ }
    try { B.claimMode(cwd, sessionId); B.touchActivity(cwd); } catch { /* advisory, as in the hook */ }
    return result;
  } catch (err) {
    for (const f of copies) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
    return { ok: false, reason: `write-failed: ${String((err && err.message) || err).slice(0, 120)}` };
  }
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { input += d; });
  process.stdin.on('end', () => {
    let result;
    try { result = fileNote(JSON.parse(input)); } catch (err) { result = { ok: false, reason: `bad-input: ${String((err && err.message) || err).slice(0, 80)}` }; }
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(result.ok ? 0 : 1);
  });
}

if (require.main === module) main();

module.exports = { fileNote, writeImages, IDEMPOTENCY_MS, MAX_ATTACHMENT_BYTES };

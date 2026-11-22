#!/usr/bin/env node
/**
 * batch-off — ends `/do-batch` collect mode without a model turn: the same two
 * steps as the skill's Step 5 (watchdog stop, `deactivate`), for the mod's
 * "Aus" button in the band (docs/dev/mods.md § Batch collect). The notes stay
 * in `.claude/batch.md` for a later `/do-batch go`; nothing is discarded.
 *
 * stdin  JSON  { cwd, sessionId? }
 * stdout JSON  { ok: true, notes }  or  { ok: false, reason }
 * exit   0 only with `ok: true`.
 *
 * Refuses (`foreign`) when the collection belongs to another session (#841),
 * and `inactive` when there is no mode file: the button then changes nothing.
 * The session title keeps its `👉 ➜ 📚` head until the next real prompt:
 * a mod has no title API, so prompt.flow.title-work strips it there
 * (`nextTitle` with `batchArmed: false`).
 */
'use strict';

const B = require('../hooks/lib/batch-state');
const W = require('./batch-watchdog');

function off(request) {
  const cwd = request && typeof request.cwd === 'string' ? request.cwd : '';
  if (!cwd) return { ok: false, reason: 'no-cwd' };
  if (!B.readMode(cwd)) return { ok: false, reason: 'inactive' };
  if (B.isForeignSession(cwd, request.sessionId)) return { ok: false, reason: 'foreign' };
  try { W.stopCmd(cwd); } catch { /* a watchdog that cannot be stopped expires on its own */ }
  B.deactivate(cwd);
  if (B.readMode(cwd)) return { ok: false, reason: 'still-active' };
  let notes = 0;
  try { notes = B.countNotes(cwd); } catch { /* count is display only */ }
  return { ok: true, notes };
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { input += d; });
  process.stdin.on('end', () => {
    let out;
    try { out = off(JSON.parse(input || '{}')); } catch (e) { out = { ok: false, reason: String(e && e.message || e) }; }
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exitCode = out.ok ? 0 : 1;
  });
}

module.exports = { off };

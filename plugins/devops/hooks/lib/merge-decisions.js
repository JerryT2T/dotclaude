/**
 * @module merge-decisions
 * @version 0.1.0
 * @description The merge-decision ledger `.claude/merge-decisions.json`
 *   (TRACKED — it ships with the PR and lives on main, so every later
 *   shipper finds earlier decisions without a search).
 *
 *   Shape: { version: 1, aspects: { "<aspectId>": [Entry, …] } }
 *   aspectId = `<file>›<element/selector or symbol>›<property>`
 *   Entry    = { ship, by, value, decided?: true, at?, hunks?: [hunkId] }
 *   The chain per aspect is ordered: earlier shippers' values, then the
 *   decision of the last shipper (decided: true).
 *
 *   Chain rule (round 2, d-chain): a later shipper is asked about an aspect
 *   only when they changed it themselves WITHOUT knowing the decision (it
 *   landed after their knowledge anchor — i.e. it is missing in the ledger as
 *   of the anchor commit); then they see the whole chain and decide as the
 *   last shipper.
 *     (a) aspect untouched by the shipper          → the decision stands
 *     (b) touched, decision unknown at the anchor  → ask, full chain shown
 *     (c) no decision yet (the 2nd had no collision) → a collision makes this
 *         shipper the first to decide
 *   A decision known at the anchor is not asked again: changing it was informed.
 *   Decided entries carry the lost-hunk ids they settle; a later integration of
 *   the same branch re-applies them silently (`applyDecisions`, rerere-like).
 *
 *   Interface (CommonJS):
 *     LEDGER_FILE, SEP ('›')
 *     aspectId(file, element, property = '*') → string;  parseAspectId(id) → { file, element, property } | null
 *     emptyLedger() → Ledger
 *     readLedger(cwd) → Ledger (empty on missing/corrupt);  readLedgerAt(cwd, ref) → Ledger
 *     writeLedger(cwd, ledger) → boolean (stable key order, trailing newline)
 *     appendEntry(ledger, aspect, entry) → Ledger            (pure)
 *     recordDecision(ledger, aspect, { ship, by, value, at?, hunks?, chain? }) → Ledger  (pure)
 *     chainOf(ledger, aspect) → Entry[];  latestDecision(ledger, aspect) → Entry | null
 *     needsDecision(aspect, { ledger, anchorLedger, touched, collision }) →
 *         { needs, reason: 'untouched'|'decision-stands'|'known-decision'|'unknown-decision'|'first-decision'|'no-collision', chain, decision }
 *     resolvedHunkIds(ledger) → Set<string>
 *     applyDecisions(ledger, lost[]) → { resolved: [{ hunk, aspect, decision }], open: lost[] }
 *     mergeLedgers(a, b) → Ledger   (union, for a conflicted ledger file)
 *
 *   Never throws on I/O; pure helpers validate their input.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LEDGER_FILE = '.claude/merge-decisions.json';
const SEP = '›';

function git(args, cwd) {
  try {
    return execFileSync('git', args, { windowsHide: true, cwd, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

const part = (s) => String(s == null ? '' : s).replace(/›/g, '>').replace(/\s+/g, ' ').trim();

function aspectId(file, element, property = '*') {
  const f = part(file).replace(/\\/g, '/');
  if (!f) throw new TypeError('aspectId: file required');
  return [f, part(element) || '*', part(property) || '*'].join(SEP);
}

function parseAspectId(id) {
  const p = String(id || '').split(SEP);
  return p.length === 3 && p[0] ? { file: p[0], element: p[1], property: p[2] } : null;
}

const emptyLedger = () => ({ version: 1, aspects: {} });

function normalize(data) {
  if (!data || typeof data !== 'object' || !data.aspects || typeof data.aspects !== 'object') return emptyLedger();
  const aspects = {};
  for (const [k, v] of Object.entries(data.aspects)) if (Array.isArray(v)) aspects[k] = v.filter((e) => e && typeof e === 'object');
  return { version: 1, aspects };
}

const parse = (text) => { try { return normalize(JSON.parse(text)); } catch { return emptyLedger(); } };
const rootOf = (cwd) => (git(['rev-parse', '--show-toplevel'], cwd) || '').trim() || cwd;

function readLedger(cwd) {
  try { return parse(fs.readFileSync(path.join(rootOf(cwd), LEDGER_FILE), 'utf8')); } catch { return emptyLedger(); }
}

/** The ledger as it was at a commit (e.g. the knowledge anchor). */
function readLedgerAt(cwd, ref) {
  if (!ref) return emptyLedger();
  const text = git(['show', `${ref}:${LEDGER_FILE}`], cwd);
  return text ? parse(text) : emptyLedger();
}

function writeLedger(cwd, ledger) {
  try {
    const l = normalize(ledger);
    const sorted = { version: 1, aspects: Object.fromEntries(Object.keys(l.aspects).sort().map((k) => [k, l.aspects[k]])) };
    const file = path.join(rootOf(cwd), LEDGER_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

function cleanEntry(e) {
  if (!e || typeof e !== 'object') throw new TypeError('entry must be an object');
  const out = { ship: e.ship == null ? null : String(e.ship), by: e.by == null ? null : String(e.by), value: e.value == null ? null : String(e.value) };
  if (e.decided) out.decided = true;
  if (e.at) out.at = String(e.at);
  if (Array.isArray(e.hunks) && e.hunks.length) out.hunks = [...new Set(e.hunks.map(String))];
  return out;
}

const entryKey = (e) => [e.ship, e.by, e.value, e.decided ? 1 : 0, e.at || ''].join('\u0001');

function appendEntry(ledger, aspect, entry) {
  if (!parseAspectId(aspect)) throw new TypeError(`invalid aspect id: ${aspect}`);
  const l = normalize(ledger);
  const e = cleanEntry(entry);
  const chain = l.aspects[aspect] ? [...l.aspects[aspect]] : [];
  if (!chain.some((x) => entryKey(x) === entryKey(e))) chain.push(e);
  return { version: 1, aspects: { ...l.aspects, [aspect]: chain } };
}

/** Record the last shipper's decision; `chain` = the earlier values shown to them (appended when missing). */
function recordDecision(ledger, aspect, { ship, by, value, at, hunks, chain = [] } = {}) {
  let l = normalize(ledger);
  for (const prior of chain) {
    const p = cleanEntry({ ...prior, decided: prior.decided });
    const known = (l.aspects[aspect] || []).some((x) => x.ship === p.ship && x.by === p.by && x.value === p.value);
    if (!known) l = appendEntry(l, aspect, p);
  }
  return appendEntry(l, aspect, { ship, by, value, at: at || new Date().toISOString(), hunks, decided: true });
}

const chainOf = (ledger, aspect) => [...(normalize(ledger).aspects[aspect] || [])];

function latestDecision(ledger, aspect) {
  const c = chainOf(ledger, aspect);
  for (let i = c.length - 1; i >= 0; i--) if (c[i].decided) return c[i];
  return null;
}

/** The chain rule. `anchorLedger` = the ledger at the shipper's knowledge anchor. */
function needsDecision(aspect, { ledger, anchorLedger = null, touched = false, collision = false } = {}) {
  const chain = chainOf(ledger, aspect);
  const decision = latestDecision(ledger, aspect);
  if (!touched) return { needs: false, reason: decision ? 'decision-stands' : 'untouched', chain, decision };
  if (decision) {
    const known = chainOf(anchorLedger || emptyLedger(), aspect).some((e) => e.decided && entryKey(e) === entryKey(decision));
    return known
      ? { needs: false, reason: 'known-decision', chain, decision }
      : { needs: true, reason: 'unknown-decision', chain, decision };
  }
  return collision
    ? { needs: true, reason: 'first-decision', chain, decision: null }
    : { needs: false, reason: 'no-collision', chain, decision: null };
}

function resolvedHunkIds(ledger) {
  const ids = new Set();
  for (const chain of Object.values(normalize(ledger).aspects)) {
    for (const e of chain) if (e.decided && Array.isArray(e.hunks)) e.hunks.forEach((h) => ids.add(h));
  }
  return ids;
}

/** Split lost hunks into the ones a recorded decision already settles and the open rest. */
function applyDecisions(ledger, lost) {
  const l = normalize(ledger);
  const byHunk = new Map();
  for (const [aspect, chain] of Object.entries(l.aspects)) {
    for (const e of chain) if (e.decided && Array.isArray(e.hunks)) e.hunks.forEach((h) => byHunk.set(h, { aspect, decision: e }));
  }
  const resolved = [];
  const open = [];
  for (const h of lost || []) {
    const hit = h && byHunk.get(h.id);
    if (hit) resolved.push({ hunk: h.id, ...hit });
    else open.push(h);
  }
  return { resolved, open };
}

/** Union of two ledgers (both sides of a conflicted ledger file); entries keep first-seen order. */
function mergeLedgers(a, b) {
  let out = normalize(a);
  for (const [aspect, chain] of Object.entries(normalize(b).aspects)) {
    for (const e of chain) { try { out = appendEntry(out, aspect, e); } catch { /* invalid aspect id skipped */ } }
  }
  return out;
}

module.exports = {
  LEDGER_FILE, SEP, aspectId, parseAspectId, emptyLedger, readLedger, readLedgerAt, writeLedger,
  appendEntry, recordDecision, chainOf, latestDecision, needsDecision, resolvedHunkIds, applyDecisions, mergeLedgers,
};

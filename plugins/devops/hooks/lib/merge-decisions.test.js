import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const D = require('./merge-decisions.js');

const BTN = D.aspectId('src/ui.css', '.button', 'color');

describe('aspect ids', () => {
  test('format file›element›property, round-trips, normalises separators', () => {
    expect(BTN).toBe('src/ui.css›.button›color');
    expect(D.parseAspectId(BTN)).toEqual({ file: 'src/ui.css', element: '.button', property: 'color' });
    expect(D.aspectId('src\\a.js', 'fn›x', '')).toBe('src/a.js›fn>x›*');
    expect(D.parseAspectId('nope')).toBeNull();
    expect(() => D.aspectId('', 'x')).toThrow();
  });
});

describe('ledger chain', () => {
  test('recordDecision appends the shown chain once, then the decision', () => {
    let l = D.emptyLedger();
    l = D.recordDecision(l, BTN, { ship: '#12', by: 'bob', value: 'yellow', at: 't2', hunks: ['h1'], chain: [{ ship: '#11', by: 'alice', value: 'red' }] });
    expect(D.chainOf(l, BTN)).toEqual([
      { ship: '#11', by: 'alice', value: 'red' },
      { ship: '#12', by: 'bob', value: 'yellow', decided: true, at: 't2', hunks: ['h1'] },
    ]);
    expect(D.latestDecision(l, BTN).value).toBe('yellow');
    const again = D.recordDecision(l, BTN, { ship: '#12', by: 'bob', value: 'yellow', at: 't2', chain: [{ ship: '#11', by: 'alice', value: 'red' }] });
    expect(D.chainOf(again, BTN)).toHaveLength(2);
    expect(() => D.appendEntry(l, 'bad', { ship: 1 })).toThrow();
  });

  test('applyDecisions settles lost hunks a decision carries (rerere-like), the rest stays open', () => {
    const l = D.recordDecision(D.emptyLedger(), BTN, { ship: '#12', by: 'bob', value: 'yellow', hunks: ['h1'] });
    const r = D.applyDecisions(l, [{ id: 'h1' }, { id: 'h2' }]);
    expect(r.resolved).toEqual([expect.objectContaining({ hunk: 'h1', aspect: BTN })]);
    expect(r.open).toEqual([{ id: 'h2' }]);
    expect([...D.resolvedHunkIds(l)]).toEqual(['h1']);
  });

  test('mergeLedgers keeps both sides of a conflicted ledger', () => {
    const a = D.recordDecision(D.emptyLedger(), BTN, { ship: '#12', by: 'bob', value: 'yellow', at: 't2' });
    const other = D.aspectId('a.js', 'calc', 'branch');
    const b = D.recordDecision(D.emptyLedger(), other, { ship: '#13', by: 'carol', value: 'B', at: 't3' });
    const m = D.mergeLedgers(a, b);
    expect(Object.keys(m.aspects).sort()).toEqual([other, BTN].sort());
  });
});

describe('needsDecision — 3-person chain cases (round 2)', () => {
  // Alice shipped red, Bob shipped later with yellow and decided "yellow". Carol ships third.
  const decided = D.recordDecision(D.emptyLedger(), BTN, { ship: '#12', by: 'bob', value: 'yellow', at: 't2', chain: [{ ship: '#11', by: 'alice', value: 'red' }] });

  test('(a) Carol did not touch the button: the decision stands, no question', () => {
    expect(D.needsDecision(BTN, { ledger: decided, anchorLedger: D.emptyLedger(), touched: false })).toMatchObject({ needs: false, reason: 'decision-stands' });
  });

  test('(b) Carol changed it without knowing the decision: asked, sees the whole chain, decides last', () => {
    const r = D.needsDecision(BTN, { ledger: decided, anchorLedger: D.emptyLedger(), touched: true, collision: true });
    expect(r).toMatchObject({ needs: true, reason: 'unknown-decision' });
    expect(r.chain.map((e) => e.by)).toEqual(['alice', 'bob']);
    expect(r.decision.value).toBe('yellow');
  });

  test('(b′) Carol knew the decision at her anchor: her change is informed, not asked again', () => {
    expect(D.needsDecision(BTN, { ledger: decided, anchorLedger: decided, touched: true, collision: true })).toMatchObject({ needs: false, reason: 'known-decision' });
  });

  test('(c) Bob had no collision (no ledger entry): Carol is the first to decide', () => {
    const empty = D.emptyLedger();
    expect(D.needsDecision(BTN, { ledger: empty, touched: true, collision: true })).toMatchObject({ needs: true, reason: 'first-decision', chain: [] });
    expect(D.needsDecision(BTN, { ledger: empty, touched: true, collision: false })).toMatchObject({ needs: false, reason: 'no-collision' });
    expect(D.needsDecision(BTN, { ledger: empty, touched: false })).toMatchObject({ needs: false, reason: 'untouched' });
  });
});

describe('ledger I/O', () => {
  let repo;
  const g = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  beforeEach(() => { repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mdec-')); g('init', '-q', '-b', 'main'); });
  afterEach(() => { fs.rmSync(repo, { recursive: true, force: true }); });

  test('write → read round-trip with stable key order; readLedgerAt reads a commit', () => {
    const l = D.recordDecision(D.emptyLedger(), BTN, { ship: '#12', by: 'bob', value: 'yellow', at: 't2' });
    const l2 = D.appendEntry(l, D.aspectId('a.js', 'x', 'y'), { ship: '#1', by: 'a', value: 'v' });
    expect(D.writeLedger(repo, l2)).toBe(true);
    const text = fs.readFileSync(path.join(repo, '.claude', 'merge-decisions.json'), 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(Object.keys(JSON.parse(text).aspects)[0]).toBe('a.js›x›y');
    expect(D.readLedger(repo)).toEqual(D.mergeLedgers(D.emptyLedger(), l2));
    g('add', '-A'); g('commit', '-qm', 'ledger');
    expect(D.latestDecision(D.readLedgerAt(repo, 'HEAD'), BTN).value).toBe('yellow');
    expect(D.readLedgerAt(repo, 'nope')).toEqual(D.emptyLedger());
  });

  test('missing or corrupt ledger reads as empty', () => {
    expect(D.readLedger(repo)).toEqual(D.emptyLedger());
    fs.mkdirSync(path.join(repo, '.claude'));
    fs.writeFileSync(path.join(repo, '.claude', 'merge-decisions.json'), '{oops');
    expect(D.readLedger(repo)).toEqual(D.emptyLedger());
  });
});

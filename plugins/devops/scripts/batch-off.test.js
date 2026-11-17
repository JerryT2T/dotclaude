import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const require = createRequire(import.meta.url);
const B = require('../hooks/lib/batch-state.js');
const { off } = require('./batch-off.js');
const SCRIPT = path.join(__dirname, 'batch-off.js');

let cwd;
beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-off-'));
  B.activate(cwd, { sessionId: 'sess-1' });
  B.appendNote(cwd, 'first');
  B.appendNote(cwd, 'second');
});
afterEach(() => { fs.rmSync(cwd, { recursive: true, force: true }); });

describe('batch-off', () => {
  it('ends the mode and keeps every note', () => {
    expect(off({ cwd, sessionId: 'sess-1' })).toEqual({ ok: true, notes: 2 });
    expect(B.readMode(cwd)).toBeNull();
    expect(B.readNotes(cwd).map(n => n.text)).toEqual(['first', 'second']);
  });

  it('refuses another session\'s collection and leaves it armed', () => {
    expect(off({ cwd, sessionId: 'other' })).toEqual({ ok: false, reason: 'foreign' });
    expect(B.isModeActive(cwd)).toBe(true);
  });

  it('no mode file → inactive, nothing touched', () => {
    B.deactivate(cwd);
    expect(off({ cwd, sessionId: 'sess-1' })).toEqual({ ok: false, reason: 'inactive' });
    expect(B.countNotes(cwd)).toBe(2);
  });

  it('CLI: JSON in, JSON out, exit 0 only on ok', () => {
    const ok = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify({ cwd, sessionId: 'sess-1' }), encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toEqual({ ok: true, notes: 2 });
    const again = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify({ cwd }), encoding: 'utf8' });
    expect(again.status).toBe(1);
    expect(JSON.parse(again.stdout).reason).toBe('inactive');
  });
});

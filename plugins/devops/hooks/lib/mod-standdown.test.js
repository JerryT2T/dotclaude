import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const S = require('./mod-standdown.js');

let home;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'standdown-')); });
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
const NOW = 1_800_000_000_000;

describe('mod-standdown (#1102 Part A)', () => {
  it('default: no marker → the hooks run', () => {
    expect(S.hooksRun('s1', 'title', '0.383.0', { now: NOW, home })).toBe(true);
  });

  it('a fresh beat of the same version stands the hook down for that session and job only', () => {
    expect(S.beat('s1', 'title', '0.383.0', { now: NOW, home })).toBe(true);
    expect(S.hooksRun('s1', 'title', '0.383.0', { now: NOW + 1000, home })).toBe(false);
    expect(S.hooksRun('s2', 'title', '0.383.0', { now: NOW + 1000, home })).toBe(true);
    expect(S.hooksRun('s1', 'concept', '0.383.0', { now: NOW + 1000, home })).toBe(true);
  });

  it('a stale heartbeat, another version or a future stamp → the hooks run', () => {
    S.beat('s1', 'title', '0.383.0', { now: NOW, home });
    expect(S.hooksRun('s1', 'title', '0.383.0', { now: NOW + S.HEARTBEAT_TTL_MS, home })).toBe(true);
    expect(S.hooksRun('s1', 'title', '0.384.0', { now: NOW + 1000, home })).toBe(true);
    expect(S.hooksRun('s1', 'title', '0.383.0', { now: NOW - 60_000, home })).toBe(true);
  });

  it('release hands the job back at once; the file goes with the last job', () => {
    S.beat('s1', 'title', 'v', { now: NOW, home });
    S.beat('s1', 'concept', 'v', { now: NOW, home });
    S.release('s1', 'title', { home });
    expect(S.hooksRun('s1', 'title', 'v', { now: NOW, home })).toBe(true);
    expect(S.hooksRun('s1', 'concept', 'v', { now: NOW, home })).toBe(false);
    S.release('s1', 'concept', { home });
    expect(fs.existsSync(S.markerPath('s1', home))).toBe(false);
  });

  it('garbage or an unsafe session id never stands a hook down', () => {
    fs.mkdirSync(S.markerDir(home), { recursive: true });
    fs.writeFileSync(S.markerPath('s1', home), '{not json');
    expect(S.hooksRun('s1', 'title', 'v', { now: NOW, home })).toBe(true);
    expect(S.markerPath('../evil', home)).toBe(null);
    expect(S.beat('../evil', 'title', 'v', { now: NOW, home })).toBe(false);
    expect(S.hooksRun('../evil', 'title', 'v', { now: NOW, home })).toBe(true);
  });
});

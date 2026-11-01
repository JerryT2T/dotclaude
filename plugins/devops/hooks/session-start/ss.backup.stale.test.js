import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { buildLine } = require('./ss.backup.stale.js');
const config = require('../lib/devops-config');

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ss.backup.stale.js');
const NOW = Date.parse('2026-10-19T12:00:00Z');
const DAY = 86_400_000;
let home;
const claude = () => path.join(home, '.claude');
const put = (name, obj) => {
  fs.mkdirSync(claude(), { recursive: true });
  fs.writeFileSync(path.join(claude(), name), JSON.stringify(obj));
};
const ago = (days) => new Date(NOW - days * DAY).toISOString();

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'ssbs-')); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

describe('ss.backup.stale buildLine', () => {
  it('is silent when the backup is off, fresh, or nothing is known', () => {
    put('home-backup-state.json', { lastSuccessAt: ago(5) });
    expect(buildLine({ home, enabled: false, now: NOW })).toBeNull();
    put('home-backup-state.json', { lastSuccessAt: ago(1) });
    expect(buildLine({ home, enabled: true, now: NOW })).toBeNull();
    fs.rmSync(path.join(claude(), 'home-backup-state.json'));
    expect(buildLine({ home, enabled: true, now: NOW })).toBeNull();
  });

  it('names age and the report reason as file:line (rule), never a value', () => {
    put('home-backup-state.json', { lastSuccessAt: ago(4) });
    put('home-backup-report.json', {
      kind: 'blocked', message: 'x',
      hits: [{ file: 'CLAUDE.md', line: 12, rule: 'email', value: 'a@b.de' }, { file: 'x.md', line: 1, rule: 'phone' }],
    });
    const line = buildLine({ home, enabled: true, now: NOW });
    expect(line).toContain('vor 4 Tagen');
    expect(line).toContain('blockiert: CLAUDE.md:12 (email) +1 weitere');
    expect(line).toContain('Home-Backup Status');
    expect(line).not.toContain('a@b.de');
  });

  it('a stale backup without a report still speaks up', () => {
    put('home-backup-state.json', { lastSuccessAt: ago(3) });
    expect(buildLine({ home, enabled: true, now: NOW })).toContain('vor 3 Tagen');
  });
});

describe('ss.backup.stale as a process', () => {
  const run = () => spawnSync(process.execPath, [HOOK], {
    input: '{}', encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
  });

  it('prints nothing when the backup is not enabled, and exits 0', () => {
    put('home-backup-state.json', { lastSuccessAt: ago(9) });
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('prints one additionalContext line when enabled and stale', () => {
    config.setValue('homeBackup.enabled', true, 'global', home, { home });
    put('home-backup-state.json', { lastSuccessAt: new Date(Date.now() - 9 * DAY).toISOString() });
    const r = run();
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toContain('vor 9 Tagen');
  });
});

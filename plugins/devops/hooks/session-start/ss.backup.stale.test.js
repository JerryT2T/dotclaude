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
  const partial = { kind: 'partial', generatedAt: ago(0), hits: [
    { file: 'CLAUDE.md', line: 12, rule: 'email', value: 'a@b.de' }, { file: 'CLAUDE.md', line: 13, rule: 'email' }, { file: 'x.md', line: 1, rule: 'phone' },
  ] };

  it('is silent when the backup is off, fresh and complete, or nothing is known', () => {
    put('home-backup-state.json', { lastSuccessAt: ago(5) });
    expect(buildLine({ home, enabled: false, now: NOW })).toBeNull();
    put('home-backup-state.json', { lastSuccessAt: ago(1) });
    expect(buildLine({ home, enabled: true, now: NOW })).toBeNull();
    fs.rmSync(path.join(claude(), 'home-backup-state.json'));
    expect(buildLine({ home, enabled: true, now: NOW })).toBeNull();
  });

  it('a fresh run that left files out is an info with the unique file count and no names or values', () => {
    put('home-backup-state.json', { lastBackupAt: ago(0) });
    put('home-backup-report.json', partial);
    const line = buildLine({ home, enabled: true, now: NOW });
    expect(line).toMatch(/^ℹ Claude-Konfig-Backup: heute \d\d:\d\d gesichert, 2 Dateien ausgelassen → „Backup-Details“$/);
    expect(line).not.toContain('CLAUDE.md');
    expect(line).not.toContain('a@b.de');
  });

  it('a partial report from before lastBackupAt existed dates its own run', () => {
    put('home-backup-state.json', {});
    put('home-backup-report.json', partial);
    expect(buildLine({ home, enabled: true, now: NOW })).toMatch(/^ℹ .*heute/);
  });

  it('a blocked run after a recent backup is the same info: everything else is safe', () => {
    put('home-backup-state.json', { lastBackupAt: ago(1) });
    put('home-backup-report.json', { ...partial, kind: 'blocked', generatedAt: undefined });
    expect(buildLine({ home, enabled: true, now: NOW })).toMatch(/^ℹ .*gestern \d\d:\d\d gesichert, 2 Dateien ausgelassen/);
  });

  it('warns when the last finished run is older than 2 days, with or without skipped files', () => {
    put('home-backup-state.json', { lastBackupAt: ago(4) });
    expect(buildLine({ home, enabled: true, now: NOW })).toBe('⚠ Claude-Konfig-Backup: zuletzt gesichert vor 4 Tagen → „Backup-Details“');
    put('home-backup-report.json', { kind: 'error', message: 'x' });
    expect(buildLine({ home, enabled: true, now: NOW })).toContain('vor 4 Tagen, letzter Versuch fehlgeschlagen');
  });

  it('warns when no run is confirmed but a report exists', () => {
    put('home-backup-report.json', { ...partial, kind: 'blocked', generatedAt: undefined });
    expect(buildLine({ home, enabled: true, now: NOW })).toBe('⚠ Claude-Konfig-Backup: noch keine Sicherung bestätigt, 2 Dateien ausgelassen → „Backup-Details“');
  });

  it('warns when the last run is dated in the future', () => {
    put('home-backup-state.json', { lastBackupAt: ago(-3) });
    expect(buildLine({ home, enabled: true, now: NOW })).toContain('Zukunft');
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

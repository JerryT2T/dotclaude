import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const hook = require('./post.backup.routine.js');
const config = require('../lib/devops-config');

let tmp;
let home;
let spawn;
let askFile;

const setCfg = (key, value) => config.setValue(`homeBackup.${key}`, value, 'global', home, { home });
const run = (payload) => hook.main({ session_id: 's1', ...payload }, { home, spawn, askFile, script: '/p/scripts/home-backup.js' });
const desktop = (input, verb = 'create') => ({ tool_name: `mcp__scheduled-tasks__${verb}_scheduled_task`, tool_input: input });

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-'));
  home = path.join(tmp, 'home');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  askFile = path.join(tmp, 'asked');
  spawn = vi.fn();
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('classify', () => {
  it('desktop: cron is recurring, fireAt and ad-hoc are not, an update without schedule counts', () => {
    expect(hook.classify(desktop({ taskId: 'a', cronExpression: '0 9 * * *' })).recurring).toBe(true);
    expect(hook.classify(desktop({ taskId: 'a', fireAt: '2026-11-02T10:00:00+01:00' })).recurring).toBe(false);
    expect(hook.classify(desktop({ taskId: 'a' })).recurring).toBe(false);
    expect(hook.classify(desktop({ taskId: 'a', prompt: 'x' }, 'update')).recurring).toBe(true);
    expect(hook.classify(desktop({ taskId: 'a', fireAt: 'x' }, 'update')).recurring).toBe(false);
  });

  it('cloud: create/update only, cron vs run-once from body or response', () => {
    const rt = (input, response) => hook.classify({ tool_name: 'RemoteTrigger', tool_input: input, tool_response: response });
    expect(rt({ action: 'list' })).toBeNull();
    expect(rt({ action: 'create', body: { name: 'n', cron_expression: '0 8 * * 1' } })).toMatchObject({ recurring: true, name: 'n' });
    expect(rt({ action: 'create', body: { run_once_at: '2026-11-02T10:00:00Z' } }).recurring).toBe(false);
    expect(rt({ action: 'update', trigger_id: 'trig_1', body: { prompt: 'p' } }, '{"id":"trig_1","cron_expression":"0 8 * * *"}'))
      .toMatchObject({ recurring: true, id: 'trig_1' });
    expect(rt({ action: 'create', body: { prompt: 'p' } }, '{"id":"trig_9","run_once_at":"x"}')).toMatchObject({ recurring: false, id: 'trig_9' });
  });

  it('ignores every other tool', () => {
    expect(hook.classify({ tool_name: 'CronCreate', tool_input: { cron: '* * * * *' } })).toBeNull();
  });
});

describe('main', () => {
  const recurring = desktop({ taskId: 'daily-report', cronExpression: '0 9 * * *' });

  it('one-time routines cost nothing', () => {
    setCfg('enabled', true);
    expect(run(desktop({ taskId: 'x', fireAt: 'y' }))).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('not set up: one setup hint per machine, then silence', () => {
    const first = run(recurring);
    expect(first.context).toMatch(/no backup is set up/);
    expect(first.context).toContain('"daily-report"');
    expect(run(recurring)).toBeNull();
  });

  it('auto: spawns the backup run silently, every time', () => {
    setCfg('enabled', true);
    setCfg('onRoutineChange', 'auto');
    expect(run(recurring)).toBeNull();
    expect(run(recurring)).toBeNull();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenCalledWith('/p/scripts/home-backup.js');
  });

  it('ask (default): one line once per session, no spawn', () => {
    setCfg('enabled', true);
    const first = run(recurring);
    expect(first.context).toMatch(/Ask the user once/);
    expect(first.context).toContain('node "/p/scripts/home-backup.js" run');
    expect(first.context).toContain('devops-config.js" set homeBackup.onRoutineChange auto --global');
    expect(run(recurring)).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('off: nothing at all, not even the setup hint', () => {
    setCfg('onRoutineChange', 'off');
    expect(run(recurring)).toBeNull();
    expect(fs.existsSync(path.join(home, '.claude', 'home-backup-routine-hint'))).toBe(false);
  });

  it('cloud routine: snapshot written (and only rewritten on change) before the run', () => {
    setCfg('enabled', true);
    setCfg('onRoutineChange', 'auto');
    const payload = { tool_name: 'RemoteTrigger', tool_input: { action: 'create', body: { name: 'weekly', cron_expression: '0 8 * * 1' } }, tool_response: '{"id":"trig_42"}' };
    run(payload);
    const file = path.join(home, '.claude', 'routine-snapshots', 'cloud', 'trig_42.json');
    const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(snap).toMatchObject({ id: 'trig_42', name: 'weekly', body: { cron_expression: '0 8 * * 1' } });
    expect(spawn).toHaveBeenCalledTimes(1);
    const info = hook.classify(payload);
    expect(hook.writeCloudSnapshot(home, info)).toBe(false);
  });
});

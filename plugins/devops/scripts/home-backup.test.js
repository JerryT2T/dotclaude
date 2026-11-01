import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const hb = require('./home-backup.js');
const config = require('../hooks/lib/devops-config');
const { sha256 } = require('./lib/backup-scan.js');

const FAKE_TOKEN = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const NOW = () => new Date('2026-10-19T12:30:00.000Z');
const day = (d, h = 12) => () => new Date(Date.UTC(2026, 9, d, h, 0, 0));

let tmp;
let home;
let claude;
let bare;
let notify;

const sh = (cmd, args, cwd) => hb.defaultRun(cmd, args, { cwd });
const write = (rel, content = 'hello\n') => {
  const abs = path.join(claude, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};
const remoteFiles = () => {
  const r = sh('git', ['--git-dir', bare, 'ls-tree', '-r', '--name-only', 'main'], tmp);
  return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : [];
};
const remoteCommits = () => {
  const r = sh('git', ['--git-dir', bare, 'log', '--format=%an|%ae|%cn|%ce|%s', 'main'], tmp);
  return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : [];
};
const opts = (extra = {}) => ({ home, now: NOW, notify, ...extra });

function prepareHome() {
  fs.mkdirSync(claude, { recursive: true });
  sh('git', ['init', '-q', '-b', 'main'], claude);
  sh('git', ['remote', 'add', 'origin', bare], claude);
  fs.writeFileSync(path.join(claude, '.gitignore'), hb.renderGitignore());
  config.setValue('homeBackup.enabled', true, 'global', home, { home });
  config.setValue('homeBackup.repo', 'octo/claude-home', 'global', home, { home });
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-'));
  home = path.join(tmp, 'home');
  claude = path.join(home, '.claude');
  bare = path.join(tmp, 'remote.git');
  sh('git', ['init', '-q', '--bare', '-b', 'main', bare], tmp);
  notify = vi.fn();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const INCLUDED = [
  'CLAUDE.md', 'settings.json', 'settings.local.json', 'keybindings.json', 'output-styles/s.md',
  'agents/a.md', 'skills/mine/SKILL.md', 'commands/x.md', 'projects/p1/memory/MEMORY.md',
  'scripts/foo.js', 'scheduled-tasks/t/SKILL.md', 'routine-snapshots/cloud/trig_1.json', 'statusline-x.js', 'statusline.sh', 'delegation.json', 'devops-config.json',
  '.backupallow', '.gitignore',
];
const EXCLUDED = [
  '.credentials.json', 'devops-api.env', 'projects/p1/chat.jsonl', 'projects/p1/notes.txt', 'cache/x',
  'plugins/m/y.js', 'history.jsonl', 'skills/synced/a.md', 'file-history/a', 'foo.log', 'my-token.json',
  'skills/mine/secret.md', 'projects/p1/memory/credentials.md', 'random.txt', 'home-backup-report.json',
  'home-backup-report.txt', 'home-backup.log', 'home-backup.lock', 'home-backup.rerun', 'home-backup-state.json', 'debug/x', 'edge-1-profile/x', 'sub/.env', 'agents/prod.env',
  'telemetry/t', 'todos/t', 'logs/l', 'backups/b', 'statsig/s', 'ide/i', 'session-env/e', 'shell-snapshots/s',
];

describe('allowlist .gitignore', () => {
  it('starts deny-by-default and ends with the never patterns', () => {
    const lines = hb.renderGitignore().split('\n').filter((l) => l && !l.startsWith('#'));
    expect(lines[0]).toBe('/*');
    expect(lines.indexOf('**/*token*')).toBeGreaterThan(lines.indexOf('!/scripts/'));
  });

  it('includes and excludes the right paths according to git check-ignore', () => {
    fs.mkdirSync(claude, { recursive: true });
    sh('git', ['init', '-q'], claude);
    fs.writeFileSync(path.join(claude, '.gitignore'), hb.renderGitignore());
    const ignored = (p) => sh('git', ['check-ignore', '-q', p], claude).status === 0;
    for (const p of INCLUDED) expect(ignored(p), `${p} should be backed up`).toBe(false);
    for (const p of EXCLUDED) expect(ignored(p), `${p} should be ignored`).toBe(true);
  });

  it('has a code-level denylist that agrees on every never path', () => {
    for (const p of EXCLUDED.filter((x) => !['random.txt', 'projects/p1/notes.txt', 'skills/synced/a.md'].includes(x))) {
      expect(hb.isDenied(p), p).toBe(true);
    }
    for (const p of INCLUDED) expect(hb.isDenied(p), p).toBe(false);
  });
});

describe('run', () => {
  it('does nothing when disabled', () => {
    const run = vi.fn();
    const res = hb.runBackup(opts({ run }));
    expect(res).toMatchObject({ code: 0, status: 'disabled' });
    expect(run).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('commits and pushes the allowlisted files only, with a fixed identity', () => {
    prepareHome();
    write('CLAUDE.md', '# my rules\n');
    write('agents/a.md', 'agent\n');
    write('projects/p1/memory/MEMORY.md', 'memory\n');
    write('.credentials.json', '{"oauth":"x"}');
    write('cache/big', 'x');
    write('projects/p1/chat.jsonl', '{}');
    write('skills/synced/plug.md', 'plugin');
    const res = hb.runBackup(opts());
    expect(res).toMatchObject({ code: 0, status: 'pushed' });
    const files = remoteFiles();
    expect(files).toEqual(expect.arrayContaining(['CLAUDE.md', 'agents/a.md', 'projects/p1/memory/MEMORY.md', '.gitignore', 'devops-config.json']));
    expect(files).not.toEqual(expect.arrayContaining(['.credentials.json']));
    expect(files.some((f) => /^cache\/|\.jsonl$|^skills\/synced\//.test(f))).toBe(false);
    expect(remoteCommits()).toEqual(['claude-home-backup|noreply@localhost|claude-home-backup|noreply@localhost|backup: 2026-10-19T12:30:00.000Z']);
    expect(notify).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(claude, hb.REPORT_JSON))).toBe(false);
  });

  it('is silent and commits nothing when nothing changed, then commits a later change', () => {
    prepareHome();
    write('CLAUDE.md', 'one\n');
    hb.runBackup(opts());
    const again = hb.runBackup(opts());
    expect(again).toMatchObject({ code: 0, status: 'unchanged', lines: [] });
    expect(remoteCommits()).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
    write('CLAUDE.md', 'two\n');
    expect(hb.runBackup(opts({ now: day(20) })).status).toBe('pushed');
    expect(remoteCommits()).toHaveLength(2);
  });

  it('keeps one version per day: a same-day change replaces that day\'s commit, also on the remote', () => {
    prepareHome();
    write('CLAUDE.md', 'morning\n');
    hb.runBackup(opts({ now: day(19, 8) }));
    write('CLAUDE.md', 'evening\n');
    expect(hb.runBackup(opts({ now: day(19, 20) })).status).toBe('pushed');
    expect(remoteCommits()).toHaveLength(1);
    expect(sh('git', ['--git-dir', bare, 'show', 'main:CLAUDE.md'], tmp).stdout).toBe('evening\n');
  });

  it('retention: the newest state plus versions from keepDays different days, older ones cut everywhere', () => {
    prepareHome();
    config.setValue('homeBackup.keepDays', 4, 'global', home, { home });
    config.setValue('homeBackup.keepWeeks', 0, 'global', home, { home });
    for (const d of [10, 11, 12, 13, 14, 15]) {
      write('CLAUDE.md', `day ${d}\n`);
      expect(hb.runBackup(opts({ now: day(d) })).status).toBe('pushed');
    }
    const subjects = remoteCommits().map((c) => c.split('|').pop());
    expect(subjects).toEqual(['15', '14', '13', '12'].map((d) => `backup: 2026-10-${d}T12:00:00.000Z`));
    expect(sh('git', ['rev-list', '--count', '--all'], claude).stdout.trim()).toBe('4');
    expect(sh('git', ['show', 'HEAD~3:CLAUDE.md'], claude).stdout).toBe('day 12\n');
    expect(sh('git', ['status', '--porcelain'], claude).stdout.trim()).toBe('');
  });

  it('a run while another one works only leaves a rerun marker', () => {
    prepareHome();
    write('CLAUDE.md', 'x\n');
    fs.writeFileSync(path.join(claude, 'home-backup.lock'), '1');
    expect(hb.runBackup(opts())).toMatchObject({ code: 0, status: 'busy' });
    expect(fs.existsSync(path.join(claude, 'home-backup.rerun'))).toBe(true);
    expect(remoteFiles()).toEqual([]);
  });

  it('refreshes its own outdated .gitignore, never a hand-made one', () => {
    prepareHome();
    const gi = path.join(claude, '.gitignore');
    fs.writeFileSync(gi, hb.renderGitignore().replace('!/routine-snapshots/\n', ''));
    write('routine-snapshots/cloud/trig_1.json', '{}\n');
    hb.runBackup(opts());
    expect(fs.readFileSync(gi, 'utf8')).toBe(hb.renderGitignore());
    expect(remoteFiles()).toContain('routine-snapshots/cloud/trig_1.json');
  });

  it('blocks on a secret: nothing committed, remote untouched, report without value, notified', () => {
    prepareHome();
    sh('git', ['add', '-A'], claude);
    sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base'], claude);
    write('agents/leak.md', `line one\nmy token ${FAKE_TOKEN}\n`);
    const res = hb.runBackup(opts());
    expect(res).toMatchObject({ code: 1, status: 'blocked' });
    expect(sh('git', ['rev-list', '--count', 'HEAD'], claude).stdout.trim()).toBe('1');
    expect(sh('git', ['diff', '--cached', '--name-only'], claude).stdout.trim()).toBe('');
    expect(remoteFiles()).toEqual([]);

    const report = JSON.parse(fs.readFileSync(path.join(claude, hb.REPORT_JSON), 'utf8'));
    expect(report.hits).toEqual([{ file: 'agents/leak.md', line: 2, rule: 'github-token' }]);
    const everything = [
      JSON.stringify(res), JSON.stringify(report),
      fs.readFileSync(path.join(claude, hb.REPORT_TXT), 'utf8'),
      fs.readFileSync(path.join(claude, hb.LOG_FILE), 'utf8'),
      JSON.stringify(notify.mock.calls),
    ].join('\n');
    expect(everything).not.toContain('ghp_');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].body).toBe('Home-Backup blockiert: 1 Funde — siehe ~/.claude/home-backup-report.txt');

    // the same finding the next day: still blocked, no second toast; a new finding notifies again
    expect(hb.runBackup(opts()).status).toBe('blocked');
    expect(notify).toHaveBeenCalledTimes(1);
    write('agents/leak2.md', `token ${FAKE_TOKEN}\n`);
    expect(hb.runBackup(opts()).status).toBe('blocked');
    expect(notify).toHaveBeenCalledTimes(2);
    fs.rmSync(path.join(claude, 'agents/leak2.md'));

    fs.rmSync(path.join(claude, 'agents/leak.md'));
    write('CLAUDE.md', 'clean\n');
    expect(hb.runBackup(opts()).status).toBe('pushed');
    expect(fs.existsSync(path.join(claude, hb.REPORT_JSON))).toBe(false);
    expect(remoteFiles()).toContain('CLAUDE.md');
  });

  it('blocks on private data and on unscannable binaries', () => {
    prepareHome();
    sh('git', ['add', '-A'], claude);
    sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base'], claude);
    write('agents/mail.md', 'contact jane.doe@example.org\n');
    write('commands/blob.bin', Buffer.from([0, 1, 2, 3]));
    const res = hb.runBackup(opts());
    expect(res.status).toBe('blocked');
    expect(res.hits.map((h) => h.rule).sort()).toEqual(['email', 'unscannable']);
    expect(remoteFiles()).toEqual([]);
  });

  it('lets allowlisted hits through, by path rule and by value hash', () => {
    prepareHome();
    write('agents/mail.md', 'contact jane.doe@example.org\n');
    write('agents/leak.md', `token ${FAKE_TOKEN}\n`);
    write('commands/blob.bin', Buffer.from([0, 1, 2, 3]));
    write('.backupallow', [
      '# reviewed',
      'agents/mail.md:email',
      `value-sha256:${sha256(FAKE_TOKEN)}`,
      'commands/blob.bin',
      '',
    ].join('\n'));
    const res = hb.runBackup(opts());
    expect(res.status).toBe('pushed');
    expect(remoteFiles()).toEqual(expect.arrayContaining(['agents/mail.md', 'agents/leak.md', 'commands/blob.bin']));
  });

  it('never stages denylisted paths even when the .gitignore was edited away', () => {
    prepareHome();
    fs.writeFileSync(path.join(claude, '.gitignore'), '# emptied\n');
    write('CLAUDE.md', 'ok\n');
    write('.credentials.json', '{"a":"b"}');
    write('cache/x.txt', 'x');
    write('projects/p1/chat.jsonl', '{}');
    write('my-secret.txt', 'plain');
    write('home-backup.log', 'old');
    const res = hb.runBackup(opts());
    expect(res.status).toBe('pushed');
    expect(remoteFiles().sort()).toEqual(['.gitignore', 'CLAUDE.md', 'devops-config.json']);
  });

  it('never stages symlinks or junctions', () => {
    prepareHome();
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'private.md'), 'outside data\n');
    fs.mkdirSync(path.join(claude, 'agents'), { recursive: true });
    try {
      fs.symlinkSync(outside, path.join(claude, 'agents', 'linked'), 'junction');
    } catch {
      return;
    }
    write('agents/real.md', 'real\n');
    expect(hb.runBackup(opts()).status).toBe('pushed');
    expect(remoteFiles().filter((f) => f.startsWith('agents/'))).toEqual(['agents/real.md']);
  });

  it('reports a failing push with a notification and keeps the commit for the next run', () => {
    prepareHome();
    sh('git', ['remote', 'set-url', 'origin', path.join(tmp, 'missing.git')], claude);
    write('CLAUDE.md', 'one\n');
    const res = hb.runBackup(opts());
    expect(res).toMatchObject({ code: 1, status: 'error' });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fs.readFileSync(path.join(claude, hb.REPORT_JSON), 'utf8')).kind).toBe('error');

    sh('git', ['remote', 'set-url', 'origin', bare], claude);
    expect(hb.runBackup(opts()).code).toBe(0);
    expect(remoteFiles()).toContain('CLAUDE.md');
    expect(remoteCommits()).toHaveLength(1);
    expect(fs.existsSync(path.join(claude, hb.REPORT_JSON))).toBe(false);
  });

  it('passes hardened options to every git call', () => {
    prepareHome();
    write('CLAUDE.md', 'x\n');
    const calls = [];
    const run = (cmd, args, o = {}) => { calls.push({ cmd, args, o }); return hb.defaultRun(cmd, args, o); };
    hb.runBackup(opts({ run }));
    expect(calls.length).toBeGreaterThan(3);
    for (const c of calls) {
      expect(c.cmd).toBe('git');
      expect(Array.isArray(c.args)).toBe(true);
      expect(c.o.cwd).toBe(claude);
      expect(c.o.timeout).toBeGreaterThan(0);
    }
  });
});

describe('targets', () => {
  const useTarget = (key, value) => {
    prepareHome();
    sh('git', ['remote', 'remove', 'origin'], claude);
    config.setValue('homeBackup.target', key, 'global', home, { home });
    if (value) config.setValue(`homeBackup.${{ folder: 'path', rclone: 'remote' }[key]}`, value, 'global', home, { home });
  };

  it('folder: one dated full copy per day, the newest replaces that day, older days deleted', () => {
    const dest = path.join(tmp, 'nas', 'claude');
    useTarget('folder', dest);
    config.setValue('homeBackup.keepDays', 4, 'global', home, { home });
    config.setValue('homeBackup.keepWeeks', 0, 'global', home, { home });
    write('agents/a.md', 'a\n');
    for (const d of [10, 11, 12, 13, 14]) {
      write('CLAUDE.md', `day ${d}\n`);
      expect(hb.runBackup(opts({ now: day(d) })).status).toBe('delivered');
    }
    write('CLAUDE.md', 'day 14 late\n');
    hb.runBackup(opts({ now: day(14, 20) }));
    expect(fs.readdirSync(dest).sort()).toEqual(['.claude-home-backup', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(fs.readFileSync(path.join(dest, '2026-10-14', 'CLAUDE.md'), 'utf8')).toBe('day 14 late\n');
    expect(fs.readFileSync(path.join(dest, '2026-10-11', 'agents', 'a.md'), 'utf8')).toBe('a\n');
    expect(fs.existsSync(path.join(dest, '2026-10-14', '.git'))).toBe(false);
    expect(hb.runBackup(opts({ now: day(14, 21) })).status).toBe('unchanged');
  });

  it('folder: a deleted day folder is written again on the next run', () => {
    const dest = path.join(tmp, 'drive');
    useTarget('folder', dest);
    write('CLAUDE.md', 'x\n');
    hb.runBackup(opts());
    fs.rmSync(path.join(dest, '2026-10-19'), { recursive: true });
    hb.runBackup(opts());
    expect(fs.existsSync(path.join(dest, '2026-10-19', 'CLAUDE.md'))).toBe(true);
  });

  it('command: gets the snapshot folder, day and keep count in its environment', () => {
    const out = path.join(tmp, 'cmd-out.txt');
    useTarget('command');
    config.setValue('homeBackup.command', 'node -e "1"', 'global', home, { home });
    write('CLAUDE.md', 'rules\n');
    const calls = [];
    const run = (cmd, args, o = {}) => {
      if (o.shell) {
        calls.push(o);
        fs.writeFileSync(out, fs.readFileSync(path.join(o.env.HOME_BACKUP_DIR, 'CLAUDE.md'), 'utf8'));
        return { status: 0, stdout: '', stderr: '' };
      }
      return hb.defaultRun(cmd, args, o);
    };
    expect(hb.runBackup(opts({ run })).status).toBe('delivered');
    expect(calls).toHaveLength(1);
    expect(calls[0].env).toMatchObject({ HOME_BACKUP_DAY: '2026-10-19', HOME_BACKUP_KEEP_DAYS: '14', HOME_BACKUP_KEEP_WEEKS: '4' });
    expect(fs.readFileSync(out, 'utf8')).toBe('rules\n');
    expect(fs.existsSync(calls[0].env.HOME_BACKUP_DIR)).toBe(false);
    hb.runBackup(opts({ run }));
    expect(calls).toHaveLength(1);
  });

  it('command: a failing command is reported and retried on the next run', () => {
    useTarget('command');
    config.setValue('homeBackup.command', 'exit 3', 'global', home, { home });
    write('CLAUDE.md', 'rules\n');
    expect(hb.runBackup(opts())).toMatchObject({ code: 1, status: 'error' });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('rclone: syncs the day folder and purges days beyond keepDays', () => {
    useTarget('rclone', 'gdrive:claude-home-backup');
    config.setValue('homeBackup.keepDays', 4, 'global', home, { home });
    config.setValue('homeBackup.keepWeeks', 0, 'global', home, { home });
    write('CLAUDE.md', 'rules\n');
    const calls = [];
    const run = (cmd, args, o = {}) => {
      if (cmd !== 'rclone') return hb.defaultRun(cmd, args, o);
      calls.push(args.join(' '));
      if (args[0] === 'sync') expect(fs.existsSync(path.join(args[1], 'CLAUDE.md'))).toBe(true);
      if (args[0] === 'lsf') return { status: 0, stdout: '2026-10-19/\n2026-10-15/\n2026-10-12/\n2026-10-10/\n2026-10-01/\nother/\n', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    };
    expect(hb.runBackup(opts({ run })).status).toBe('delivered');
    expect(calls[0]).toMatch(/^sync .+ gdrive:claude-home-backup\/2026-10-19$/);
    expect(calls.filter((c) => c.startsWith('purge'))).toEqual(['purge gdrive:claude-home-backup/2026-10-01']);
  });

  it('drive: finds the Google Drive for Desktop folder', () => {
    const exists = (p) => p === 'G:\\Meine Ablage';
    expect(hb.findDriveFolder({ home, platform: 'win32' }, exists)).toBe(path.join('G:\\Meine Ablage', hb.DRIVE_FOLDER));
    expect(hb.findDriveFolder({ home, platform: 'linux' }, () => false)).toBeNull();
  });

  it('setup --target folder needs no gh and keeps no origin', () => {
    const dest = path.join(tmp, 'nas');
    fs.mkdirSync(claude, { recursive: true });
    write('CLAUDE.md', 'rules\n');
    let cron = null;
    const run = (cmd, args, o = {}) => {
      if (cmd === 'crontab') {
        if (args[0] === '-l') return cron === null ? { status: 1, stdout: '', stderr: '' } : { status: 0, stdout: cron, stderr: '' };
        cron = o.input;
        return { status: 0, stdout: '', stderr: '' };
      }
      if (cmd === 'git') return hb.defaultRun(cmd, args, o);
      throw new Error(`unexpected spawn: ${cmd}`);
    };
    const res = hb.setup(opts({ run, platform: 'linux', target: 'folder', path: dest }));
    expect(res).toMatchObject({ code: 0, status: 'delivered' });
    expect(config.load(home, { home }).values.homeBackup).toMatchObject({ enabled: true, target: 'folder', path: dest });
    expect(sh('git', ['remote'], claude).stdout.trim()).toBe('');
    expect(fs.existsSync(path.join(dest, '2026-10-19', 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, hb.FOLDER_MARKER))).toBe(true);
    expect(hb.setup(opts({ run, platform: 'linux', target: 'folder', path: path.join(claude, 'x') })).code).toBe(1);
    const foreign = path.join(tmp, 'photos');
    fs.mkdirSync(path.join(foreign, '2026-01-01'), { recursive: true });
    fs.writeFileSync(path.join(foreign, 'notes.txt'), 'x');
    expect(hb.setup(opts({ run, platform: 'linux', target: 'folder', path: foreign })).code).toBe(1);
    expect(fs.existsSync(path.join(foreign, hb.FOLDER_MARKER))).toBe(false);
  });

  it('parses setup flags', () => {
    expect(hb.parseArgs(['setup', '--target', 'rclone', '--remote', 'gd:x', '--keep-days', '7', '--on-routine-change', 'auto']))
      .toEqual({ command: 'setup', target: 'rclone', remote: 'gd:x', keepDays: 7, onRoutineChange: 'auto' });
  });
});

describe('scan', () => {
  it('lists hits as file, line, rule without values', () => {
    prepareHome();
    write('agents/leak.md', `a\n${FAKE_TOKEN}\n`);
    write('CLAUDE.md', 'fine\n');
    const res = hb.scanDryRun(opts());
    expect(res.code).toBe(1);
    expect(res.lines).toEqual(['agents/leak.md:2  github-token']);
    expect(res.lines.join('')).not.toContain('ghp_');
    expect(sh('git', ['diff', '--cached', '--name-only'], claude).stdout.trim()).toBe('');
  });

  it('reports clean', () => {
    prepareHome();
    write('CLAUDE.md', 'fine\n');
    expect(hb.scanDryRun(opts()).code).toBe(0);
  });
});

describe('setup, disable, status', () => {
  let calls;
  let cron;
  let ghRepoExists;

  const fakeRun = (cmd, args, o = {}) => {
    calls.push([cmd, ...args].join(' '));
    if (cmd === 'gh') {
      if (args[0] === 'auth') return { status: 0, stdout: '', stderr: '' };
      if (args[0] === 'repo' && args[1] === 'view') {
        return ghRepoExists ? { status: 0, stdout: 'true\n', stderr: '' } : { status: 1, stdout: '', stderr: 'not found' };
      }
      if (args[0] === 'repo' && args[1] === 'create') { ghRepoExists = true; return { status: 0, stdout: '', stderr: '' }; }
    }
    if (cmd === 'crontab') {
      if (args[0] === '-l') return cron === null ? { status: 1, stdout: '', stderr: '' } : { status: 0, stdout: cron, stderr: '' };
      cron = o.input;
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'git' && args[0] === 'push') return { status: 0, stdout: '', stderr: '' };
    if (cmd === 'git') return hb.defaultRun(cmd, args, o);
    throw new Error(`unexpected spawn: ${cmd}`);
  };
  const setupOpts = (extra = {}) => opts({ run: fakeRun, platform: 'linux', repo: 'octo/claude-home', ...extra });

  beforeEach(() => {
    calls = [];
    cron = null;
    ghRepoExists = false;
    fs.mkdirSync(claude, { recursive: true });
  });

  it('creates the private repo, git repo, gitignore, config, job and does the first run', () => {
    fs.writeFileSync(path.join(claude, 'CLAUDE.md'), 'rules\n');
    const res = hb.setup(setupOpts());
    expect(res.code).toBe(0);
    expect(calls).toContain('gh auth status');
    expect(calls.some((c) => c.startsWith('gh repo create octo/claude-home --private --description'))).toBe(true);
    expect(fs.readFileSync(path.join(claude, '.gitignore'), 'utf8')).toBe(hb.renderGitignore());
    expect(sh('git', ['remote', 'get-url', 'origin'], claude).stdout.trim()).toBe('https://github.com/octo/claude-home.git');
    const cfg = config.load(home, { home }).values.homeBackup;
    expect(cfg).toMatchObject({ enabled: true, repo: 'octo/claude-home', target: 'github', keepDays: 14 });
    expect(cron).toContain('# devops:home-backup');
    expect(cron).toContain('30 12 * * *');
    expect(cron).toContain('home-backup.js');
    expect(sh('git', ['log', '--format=%s'], claude).stdout).toContain('backup: 2026-10-19');
  });

  it('is idempotent: no second repo, no second job, no duplicate commit', () => {
    fs.writeFileSync(path.join(claude, 'CLAUDE.md'), 'rules\n');
    hb.setup(setupOpts());
    const commitsBefore = sh('git', ['rev-list', '--count', 'HEAD'], claude).stdout.trim();
    calls = [];
    const res = hb.setup(setupOpts());
    expect(res.code).toBe(0);
    expect(calls.some((c) => c.startsWith('gh repo create'))).toBe(false);
    expect(cron.split('\n').filter((l) => l.includes('# devops:home-backup'))).toHaveLength(1);
    expect(sh('git', ['rev-list', '--count', 'HEAD'], claude).stdout.trim()).toBe(commitsBefore);
    expect(sh('git', ['remote'], claude).stdout.trim()).toBe('origin');
  });

  it('refuses a ~/.claude repo with a different origin and registers nothing', () => {
    sh('git', ['init', '-q'], claude);
    sh('git', ['remote', 'add', 'origin', 'https://github.com/someone/else.git'], claude);
    const res = hb.setup(setupOpts());
    expect(res.code).toBe(1);
    expect(res.lines.join('\n')).toMatch(/different|already a git repo/);
    expect(cron).toBeNull();
    expect(config.load(home, { home }).values.homeBackup.enabled).toBe(false);
  });

  it('refuses an existing public repo, an unauthenticated gh and a bad repo name', () => {
    ghRepoExists = true;
    const pub = (cmd, args, o) => (cmd === 'gh' && args[1] === 'view' ? { status: 0, stdout: 'false\n', stderr: '' } : fakeRun(cmd, args, o));
    expect(hb.setup(setupOpts({ run: pub })).lines.join('')).toMatch(/not private/);
    const noAuth = (cmd, args, o) => (cmd === 'gh' && args[0] === 'auth' ? { status: 1, stdout: '', stderr: '' } : fakeRun(cmd, args, o));
    expect(hb.setup(setupOpts({ run: noAuth })).lines.join('')).toMatch(/gh auth login/);
    expect(hb.setup(setupOpts({ repo: 'nonsense' })).code).toBe(1);
    expect(cron).toBeNull();
  });

  it('disable unregisters the job and switches off, leaving .git in place; status reflects it', () => {
    hb.setup(setupOpts());
    expect(hb.status(setupOpts()).lines).toEqual(expect.arrayContaining(['enabled: true', 'repo: octo/claude-home', 'job registered: true']));
    const res = hb.disable(setupOpts());
    expect(res.code).toBe(0);
    expect(res.lines.join('\n')).toMatch(/left in place/);
    expect(cron).toBe('');
    expect(fs.existsSync(path.join(claude, '.git'))).toBe(true);
    expect(hb.status(setupOpts()).lines).toEqual(expect.arrayContaining(['enabled: false', 'job registered: false']));
    expect(hb.runBackup(setupOpts()).status).toBe('disabled');
  });
});

describe('retention: weekly anchors, prune after delivery, marker guard', () => {
  const setKeep = (days, weeks) => {
    config.setValue('homeBackup.keepDays', days, 'global', home, { home });
    config.setValue('homeBackup.keepWeeks', weeks, 'global', home, { home });
  };
  const folderTarget = (dest) => {
    prepareHome();
    sh('git', ['remote', 'remove', 'origin'], claude);
    config.setValue('homeBackup.target', 'folder', 'global', home, { home });
    config.setValue('homeBackup.path', dest, 'global', home, { home });
  };
  const runFailing = (match) => (cmd, args, o = {}) => (match(cmd, args)
    ? { status: 1, stdout: '', stderr: 'boom' }
    : hb.defaultRun(cmd, args, o));
  const chainLen = () => Number(sh('git', ['rev-list', '--count', 'HEAD'], claude).stdout.trim());
  const reportOf = () => JSON.parse(fs.readFileSync(path.join(claude, hb.REPORT_JSON), 'utf8'));

  it('github: keeps the first state of each recent ISO week next to the daily window', () => {
    prepareHome();
    setKeep(2, 4);
    for (const d of [5, 6, 7, 12, 13, 14]) {
      write('CLAUDE.md', 'day ' + d + '\n');
      expect(hb.runBackup(opts({ now: day(d) })).status).toBe('pushed');
    }
    const days = (lines) => lines.map((c) => c.split('|').pop().slice(16, 18));
    expect(days(remoteCommits())).toEqual(['14', '13', '12', '05']);
    expect(chainLen()).toBe(4);
  });

  it('github: a failed push prunes nothing; the next good run delivers, then prunes', () => {
    prepareHome();
    setKeep(2, 0);
    for (const d of [10, 11]) {
      write('CLAUDE.md', 'day ' + d + '\n');
      hb.runBackup(opts({ now: day(d) }));
    }
    write('CLAUDE.md', 'day 12\n');
    const bad = runFailing((cmd, args) => cmd === 'git' && args[0] === 'push');
    expect(hb.runBackup(opts({ now: day(12), run: bad }))).toMatchObject({ code: 1, status: 'error' });
    expect(chainLen()).toBe(3);
    expect(hb.runBackup(opts({ now: day(12) })).status).toBe('unchanged');
    expect(chainLen()).toBe(2);
    expect(remoteCommits()).toHaveLength(2);
  });

  it('github: a failing second (pruning) push is only a warning and retried next run', () => {
    prepareHome();
    setKeep(2, 0);
    let pushes = 0;
    const flaky = (cmd, args, o = {}) => {
      if (cmd === 'git' && args[0] === 'push' && ++pushes === 4) return { status: 1, stdout: '', stderr: 'lease' };
      return hb.defaultRun(cmd, args, o);
    };
    for (const d of [10, 11, 12]) {
      write('CLAUDE.md', 'day ' + d + '\n');
      hb.runBackup(opts({ now: day(d), run: flaky }));
    }
    expect(pushes).toBe(4);
    expect(reportOf()).toMatchObject({ kind: 'warning' });
    expect(remoteCommits()).toHaveLength(3);
    expect(hb.runBackup(opts({ now: day(12), run: flaky })).status).toBe('unchanged');
    expect(remoteCommits()).toHaveLength(2);
    expect(fs.existsSync(path.join(claude, hb.REPORT_JSON))).toBe(false);
  });

  it('folder: a failed delivery deletes no old day folder', () => {
    const dest = path.join(tmp, 'nas');
    folderTarget(dest);
    setKeep(2, 0);
    for (const d of [10, 11]) {
      write('CLAUDE.md', 'day ' + d + '\n');
      hb.runBackup(opts({ now: day(d) }));
    }
    write('CLAUDE.md', 'day 12\n');
    const bad = runFailing((cmd, args) => cmd === 'git' && args[0] === 'ls-tree');
    expect(hb.runBackup(opts({ now: day(12), run: bad })).code).toBe(1);
    expect(fs.readdirSync(dest).filter((n) => n.startsWith('2026')).sort()).toEqual(['2026-10-10', '2026-10-11']);
    expect(hb.runBackup(opts({ now: day(12) })).status).toBe('unchanged');
    expect(fs.readdirSync(dest).filter((n) => n.startsWith('2026')).sort()).toEqual(['2026-10-11', '2026-10-12']);
  });

  it('folder: weekly anchors survive the daily window', () => {
    const dest = path.join(tmp, 'nas');
    folderTarget(dest);
    setKeep(2, 4);
    for (const d of [5, 6, 7, 12, 13, 14]) {
      write('CLAUDE.md', 'day ' + d + '\n');
      hb.runBackup(opts({ now: day(d) }));
    }
    expect(fs.readdirSync(dest).filter((n) => n.startsWith('2026')).sort())
      .toEqual(['2026-10-05', '2026-10-12', '2026-10-13', '2026-10-14']);
  });

  it('folder: without the marker in a non-empty folder nothing is deleted, the run warns but delivers', () => {
    const dest = path.join(tmp, 'foreign');
    folderTarget(dest);
    setKeep(1, 0);
    for (const d of ['2026-01-01', '2026-01-02', '2026-01-03']) fs.mkdirSync(path.join(dest, d), { recursive: true });
    write('CLAUDE.md', 'x\n');
    expect(hb.runBackup(opts()).status).toBe('delivered');
    expect(fs.readdirSync(dest).sort()).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-10-19']);
    expect(fs.existsSync(path.join(dest, hb.FOLDER_MARKER))).toBe(false);
    expect(reportOf()).toMatchObject({ kind: 'warning' });
    expect(reportOf().message).toContain(hb.FOLDER_MARKER);
    expect(fs.readFileSync(path.join(claude, hb.LOG_FILE), 'utf8')).toContain(hb.FOLDER_MARKER);
  });

  it('folder: an existing day folder in an unclaimed folder is never replaced', () => {
    const dest = path.join(tmp, 'foreign-today');
    folderTarget(dest);
    fs.mkdirSync(path.join(dest, '2026-10-19'), { recursive: true });
    fs.writeFileSync(path.join(dest, '2026-10-19', 'mine.txt'), 'keep');
    write('CLAUDE.md', 'x\n');
    expect(hb.runBackup(opts()).status).not.toBe('delivered');
    expect(fs.readdirSync(path.join(dest, '2026-10-19'))).toEqual(['mine.txt']);
    expect(fs.readdirSync(dest).filter((n) => n.startsWith('.tmp-'))).toEqual([]);
  });

  it('folder: an empty folder is claimed with the marker on first delivery', () => {
    const dest = path.join(tmp, 'empty');
    fs.mkdirSync(dest, { recursive: true });
    folderTarget(dest);
    write('CLAUDE.md', 'x\n');
    hb.runBackup(opts());
    expect(fs.existsSync(path.join(dest, hb.FOLDER_MARKER))).toBe(true);
  });

  it('rclone: weekly anchors are not purged; a failing purge is a warning, the run still delivered', () => {
    prepareHome();
    sh('git', ['remote', 'remove', 'origin'], claude);
    config.setValue('homeBackup.target', 'rclone', 'global', home, { home });
    config.setValue('homeBackup.remote', 'gd:b', 'global', home, { home });
    setKeep(2, 4);
    write('CLAUDE.md', 'x\n');
    const purged = [];
    const run = (cmd, args, o = {}) => {
      if (cmd !== 'rclone') return hb.defaultRun(cmd, args, o);
      if (args[0] === 'lsf') return { status: 0, stdout: '2026-10-19/\n2026-10-15/\n2026-10-12/\n2026-10-10/\n2026-10-05/\n2026-10-01/\n', stderr: '' };
      if (args[0] === 'purge') { purged.push(args[1]); return { status: 1, stdout: '', stderr: 'denied' }; }
      return { status: 0, stdout: '', stderr: '' };
    };
    const res = hb.runBackup(opts({ run }));
    expect(res).toMatchObject({ code: 0, status: 'delivered' });
    expect(purged).toEqual(['gd:b/2026-10-10']);
    expect(reportOf()).toMatchObject({ kind: 'warning' });
    expect(reportOf().message).toContain('purge 2026-10-10');
  });

  it('lock: stale after 40 minutes, not before', () => {
    expect(hb.LOCK_STALE_MS).toBe(40 * 60_000);
    prepareHome();
    write('CLAUDE.md', 'x\n');
    const lock = path.join(claude, 'home-backup.lock');
    const age = (min) => {
      fs.writeFileSync(lock, '1');
      const at = new Date(Date.now() - min * 60_000);
      fs.utimesSync(lock, at, at);
    };
    age(30);
    expect(hb.runBackup(opts()).status).toBe('busy');
    age(50);
    expect(hb.runBackup(opts()).status).toBe('pushed');
  });
});

describe('partial runs and reminders', () => {
  const leak = () => write('agents/leak.md', 'line one\nmy token ' + FAKE_TOKEN + '\n');
  const reportOf = () => JSON.parse(fs.readFileSync(path.join(claude, hb.REPORT_JSON), 'utf8'));

  it('a hit excludes only that file; the rest is committed and delivered, the report has no value', () => {
    prepareHome();
    write('CLAUDE.md', 'clean\n');
    leak();
    const res = hb.runBackup(opts());
    expect(res).toMatchObject({ code: 0, status: 'partial' });
    expect(remoteFiles()).toContain('CLAUDE.md');
    expect(remoteFiles()).not.toContain('agents/leak.md');
    expect(reportOf()).toMatchObject({ kind: 'partial', hits: [{ file: 'agents/leak.md', line: 2, rule: 'github-token' }] });
    const everything = [
      JSON.stringify(res), JSON.stringify(reportOf()), fs.readFileSync(path.join(claude, hb.REPORT_TXT), 'utf8'),
      fs.readFileSync(path.join(claude, hb.LOG_FILE), 'utf8'), JSON.stringify(notify.mock.calls),
    ].join('\n');
    expect(everything).not.toContain('ghp_');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(sh('git', ['diff', '--cached', '--name-only'], claude).stdout.trim()).toBe('');
  });

  it('every staged file with a hit stays blocked, as before', () => {
    prepareHome();
    sh('git', ['add', '-A'], claude);
    sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base'], claude);
    leak();
    expect(hb.runBackup(opts())).toMatchObject({ code: 1, status: 'blocked' });
    expect(remoteFiles()).toEqual([]);
  });

  it('reminds every 3 days while the last clean backup is 3+ days old, not more often', () => {
    prepareHome();
    write('CLAUDE.md', 'clean\n');
    hb.runBackup(opts({ now: day(19, 13) }));
    leak();
    const at = (d) => hb.runBackup(opts({ now: day(d, 13) })).status;
    expect(at(20)).toBe('blocked');
    expect(notify).toHaveBeenCalledTimes(1); // first sight of the findings
    at(21);
    expect(notify).toHaveBeenCalledTimes(1); // same findings, success 2 days old
    at(22);
    expect(notify).toHaveBeenCalledTimes(1); // success 3 days old, but the last toast was 2 days ago
    at(23);
    expect(notify).toHaveBeenCalledTimes(2); // 3 days since the toast, success 4 days old → reminder
    at(24);
    expect(notify).toHaveBeenCalledTimes(2); // at most once per 3 days
    at(26);
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it('a clean run records lastSuccessAt in the state', () => {
    prepareHome();
    write('CLAUDE.md', 'clean\n');
    hb.runBackup(opts());
    const st = JSON.parse(fs.readFileSync(path.join(claude, hb.STATE_FILE), 'utf8'));
    expect(st.lastSuccessAt).toBe('2026-10-19T12:30:00.000Z');
  });
});

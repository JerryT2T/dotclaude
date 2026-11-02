import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HOOKS = path.resolve(import.meta.dirname, '..');
const PLUGIN_ROOT = path.resolve(HOOKS, '..');
const { ownWords } = require('./prompt-text.js');
const { findings } = require('./card-pregate.js');
const { overrideBlock, textOnce } = require('./skill-overrides.js');

describe('prompt-text ownWords: linear strip', () => {
  test('many unterminated tags stay fast and untouched', () => {
    for (const s of ['<system-reminder>'.repeat(16000), '<pasted_content>'.repeat(16000), '<pasted_content '.repeat(16000)]) {
      const t0 = Date.now();
      expect(ownWords(s + ' hi')).toBe((s + ' hi').trim());
      expect(Date.now() - t0).toBeLessThan(100);
    }
  });
  test('matches the old regex strip on well-formed and odd input', () => {
    const ref = (p) => p
      .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
      .replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content[^>]*>/g, ' ')
      .trim();
    const cases = [
      'a <system-reminder>x</system-reminder> b <system-reminder>y</system-reminder> c',
      '<system-reminder>open only',
      '<system-reminder>a<system-reminder>b</system-reminder>c</system-reminder>d',
      'x <pasted_content id="1">p</pasted_content id="1"> y',
      '<pasted_content>no close <pasted_content a>z</pasted_content> tail',
      '<pasted_content never closed > text </pasted_content',
      '<pasted_content>a</pasted_content>b<pasted_content>c',
      'plain text', '',
    ];
    for (const c of cases) expect(ownWords(c)).toBe(ref(c));
  });
});

describe('card-pregate: the non-security qualifier is a whole word', () => {
  const ok = { variant: 'ready', summary: '', validation: [{ requirement: 'r', status: 'met', evidence: 'e' }] };
  const sec = (summary) => findings({ ...ok, summary }, { openTasks: [] }).length === 1;
  test('Linux / Build / Infrastruktur compounds count as security', () => {
    for (const s of ['Linux-Schwachstelle im Kernel', 'Build-Schwachstelle gefunden', 'Infrastruktur-Schwachstelle gefunden']) expect(sec(s)).toBe(true);
  });
  test('UX / Architektur / Design compounds do not', () => {
    for (const s of ['UX-Schwachstelle im Flow', 'Architektur-Schwachstelle im Plugin', 'Design-Schwachstelle im Onboarding', 'die Design Schwachstellen']) expect(sec(s)).toBe(false);
  });
});

describe('skill-overrides textOnce: per agent', () => {
  test('main thread, then a subagent of the same session, each get the full text once', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-b-so-'));
    try {
      const block = { text: 'FULL OVERRIDE TEXT', record: { skill: 'do-ship' } };
      expect(typeof overrideBlock).toBe('function');
      expect(textOnce('s1', block, { dir })).toBe('FULL OVERRIDE TEXT');
      expect(textOnce('s1', block, { dir })).toMatch(/unchanged/);
      expect(textOnce('s1', block, { dir, agentId: 'a1' })).toBe('FULL OVERRIDE TEXT');
      expect(textOnce('s1', block, { dir, agentId: 'a1' })).toMatch(/do-ship: unchanged/);
      expect(textOnce('s1', block, { dir, agentId: 'a2' })).toBe('FULL OVERRIDE TEXT');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('session-id writeSessionFile: transient rename errors are retried', () => {
  test('EPERM twice, then success', () => {
    const { writeSessionFile } = require('./session-id.js');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-b-ts-'));
    const real = fs.renameSync;
    let fails = 2;
    fs.renameSync = (a, b) => {
      if (fails-- > 0) { const e = new Error('EPERM'); e.code = 'EPERM'; throw e; }
      return real(a, b);
    };
    try {
      const f = path.join(d, 'state.json');
      writeSessionFile(f, '{"a":"1"}');
      expect(fs.readFileSync(f, 'utf8')).toBe('{"a":"1"}');
      expect(fs.readdirSync(d)).toEqual(['state.json']);
    } finally { fs.renameSync = real; fs.rmSync(d, { recursive: true, force: true }); }
  });
  test('a non-transient error still throws and leaves no temp', () => {
    const { writeSessionFile } = require('./session-id.js');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-b-ts2-'));
    const real = fs.renameSync;
    fs.renameSync = () => { const e = new Error('ENOSPC'); e.code = 'ENOSPC'; throw e; };
    try {
      expect(() => writeSessionFile(path.join(d, 'x'), 'v')).toThrow('ENOSPC');
      expect(fs.readdirSync(d)).toEqual([]);
    } finally { fs.renameSync = real; fs.rmSync(d, { recursive: true, force: true }); }
  });
});

describe('hooks fail open on null / non-string stdin fields', () => {
  const run = (rel, input, args = []) => spawnSync(process.execPath, [path.join(HOOKS, rel), ...args], {
    input, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
  });
  const files = [
    'user-prompt-submit/prompt.knowledge.dispatch.js',
    'session-start/ss.knowledge.index.js',
    'user-prompt-submit/prompt.issue.detect.js',
    'stop/stop.flow.guard.js',
    'user-prompt-submit/prompt.flow.title-work.js',
    'pre-tool-use/pre.mcp.health.js',
  ];
  for (const f of files) {
    test(`${f}: null, non-string fields`, () => {
      for (const input of ['null', '[]', '5', JSON.stringify({ session_id: 's', prompt: { a: 1 }, tool_name: 42, user_message: 7, message: ['x'] })]) {
        const r = run(f, input);
        expect(r.status, `${f} ${input}: ${r.stderr}`).toBe(0);
      }
    });
  }
  test('dispatch.js PreToolUse --fast with null input', () => {
    for (const input of ['null', '']) {
      const r = run('dispatch/dispatch.js', input, ['PreToolUse', '--fast']);
      expect(r.status, r.stderr).toBe(0);
    }
  });
});

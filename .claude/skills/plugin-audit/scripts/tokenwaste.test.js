import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const TW = require('./lib/tokenwaste.js');
const { record } = require('./audit.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-tw-'));
afterAll(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

function sandbox(name) {
  const base = path.join(TMP, name);
  const root = path.join(base, 'repo');
  const home = path.join(base, 'home');
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'projects', 'p'), { recursive: true });
  return { root, home, projectsDir: path.join(home, '.claude', 'projects') };
}
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const byId = (list, id) => list.find((c) => c.id === id);
const assistant = (id, usage, extra = {}) => JSON.stringify({ type: 'assistant', message: { id, model: extra.model || 'claude-opus-5-5', usage }, ...extra });

describe('runTokenWaste', () => {
  it('returns all eight checks in the integrity shape and never throws on an empty machine', async () => {
    const s = sandbox('empty');
    const list = await TW.runTokenWaste({ ...s, env: {}, logFile: null });
    expect(list.map((c) => c.id)).toEqual(['tw-memory', 'tw-tools', 'tw-model', 'tw-hooks', 'tw-subagents', 'tw-scheduled', 'tw-cache', 'tw-token-log']);
    for (const c of list) {
      expect(['green', 'yellow', 'red', 'skipped']).toContain(c.status);
      expect(Array.isArray(c.findings)).toBe(true);
    }
    expect(byId(list, 'tw-cache').status).toBe('skipped');
    expect(byId(list, 'tw-token-log').status).toBe('skipped');
  });

  it('memory: a CLAUDE.md over 5000 tokens is red, @imports count', async () => {
    const s = sandbox('memory');
    write(path.join(s.root, 'CLAUDE.md'), '@docs/extra.md\nshort');
    write(path.join(s.root, 'docs', 'extra.md'), 'x'.repeat(20000));
    const list = await TW.runTokenWaste({ ...s, env: {}, logFile: null });
    const m = byId(list, 'tw-memory');
    expect(m.status).toBe('red');
    expect(m.findings.some((f) => f.file && f.file.endsWith('extra.md'))).toBe(true);
  });

  it('tools: ENABLE_TOOL_SEARCH=false is red, a proxy base URL is yellow', async () => {
    const s = sandbox('tools');
    write(path.join(s.home, '.claude', 'settings.json'), JSON.stringify({ env: { ENABLE_TOOL_SEARCH: 'false' } }));
    expect(byId(await TW.runTokenWaste({ ...s, env: {}, logFile: null }), 'tw-tools').status).toBe('red');
    write(path.join(s.home, '.claude', 'settings.json'), JSON.stringify({ env: {} }));
    expect(byId(await TW.runTokenWaste({ ...s, env: { ANTHROPIC_BASE_URL: 'https://gw.example' }, logFile: null }), 'tw-tools').status).toBe('yellow');
    expect(byId(await TW.runTokenWaste({ ...s, env: { ANTHROPIC_BASE_URL: 'https://api.anthropic.com' }, logFile: null }), 'tw-tools').status).toBe('green');
  });

  it('model switches in the newest session and the cache split come from the transcript', async () => {
    const s = sandbox('session');
    const u = (w) => ({ input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: w, output_tokens: 5 });
    write(path.join(s.projectsDir, 'p', 'a.jsonl'), [
      assistant('m1', u(900), { model: 'claude-opus-5-5' }),
      assistant('m1', u(900), { model: 'claude-opus-5-5' }),
      assistant('m2', u(0), { model: 'claude-sonnet-5-5' }),
      assistant('s1', u(5000), { isSidechain: true }),
    ].join('\n'));
    const list = await TW.runTokenWaste({ ...s, env: {}, logFile: null });
    expect(byId(list, 'tw-model').metrics.switches).toBe(1);
    const c = byId(list, 'tw-cache');
    expect(c.metrics).toMatchObject({ calls: 2, cacheWrite: 900, cacheRead: 200, firstContext: 1010, lastContext: 110 });
    expect(c.status).toBe('red');
  });

  it('subagents without a model pin are yellow', async () => {
    const s = sandbox('agents');
    write(path.join(s.root, '.claude', 'agents', 'a.md'), '---\nname: a\nmodel: sonnet\n---\nx');
    write(path.join(s.root, '.claude', 'agents', 'b.md'), '---\nname: b\n---\nx');
    const sa = byId(await TW.runTokenWaste({ ...s, env: {}, logFile: null }), 'tw-subagents');
    expect(sa.status).toBe('yellow');
    expect(sa.metrics).toEqual({ agents: 2, inherit: 1 });
  });

  it('scheduled: cron lines in task files are counted per day against promptCacheTtl', async () => {
    const s = sandbox('sched');
    write(path.join(s.home, '.claude', 'settings.json'), JSON.stringify({ promptCacheTtl: '1h' }));
    const body = 'fires on cron `*/20 19-23,0 * * *` and cron `0 1,3 * * *`';
    write(path.join(s.home, '.claude', 'scheduled-tasks', 't', 'SKILL.md'), body);
    write(path.join(s.home, '.claude', 'scheduled-tasks', 't-twin', 'SKILL.md'), body);
    const c = byId(await TW.runTokenWaste({ ...s, env: {}, logFile: null }), 'tw-scheduled');
    expect(c.metrics).toMatchObject({ tasks: 2, runsPerDay: 20, ttl: '1h' });
    expect(c.status).toBe('green');
  });
});

describe('output-filter hooks', () => {
  it('counts a PreToolUse module that sets updatedInput in code, not one that only mentions it', async () => {
    const s = sandbox('hooks');
    const dir = path.join(s.root, 'plugins', 'p', 'hooks', 'pre-tool-use');
    write(path.join(dir, 'pre.comment.js'), '/**\n * Claude Code ignores `updatedInput: x` for Agent\n */\nmodule.exports = 1;');
    expect(byId(await TW.runTokenWaste({ ...s, env: {}, logFile: null }), 'tw-hooks').status).toBe('yellow');
    write(path.join(dir, 'pre.filter.js'), 'out({ hookSpecificOutput: { updatedInput: { command: c } } });');
    const h = byId(await TW.runTokenWaste({ ...s, env: {}, logFile: null }), 'tw-hooks');
    expect(h.status).toBe('green');
    expect(h.metrics.rewriters).toBe(1);
  });
});

describe('cronRunsPerDay', () => {
  it('multiplies minute and hour fields', () => {
    expect(TW.cronRunsPerDay('*/20 19-23,0 * * *')).toBe(18);
    expect(TW.cronRunsPerDay('0 1,3,5,7-18 * * *')).toBe(15);
    expect(TW.cronRunsPerDay('*/5 * * * *')).toBe(288);
    expect(TW.cronRunsPerDay('nonsense')).toBeNull();
    expect(TW.cronRunsPerDay('*/0 * * * *')).toBeNull();
  });
});

describe('token log (#1002): summary and prune', () => {
  const rec = (ts, extra) => JSON.stringify({ v: 1, ts, sid: 's', ...extra });
  const lines = [
    rec('2026-11-01T10:00:00.000Z', { event: 'UserPromptSubmit', ctx: 4540, hooks: { 'prompt.knowledge.dispatch': 4540 } }),
    rec('2026-11-01T10:01:00.000Z', { event: 'PostToolUse', ctx: 0, hooks: {}, tool: 'Bash', result: 7000 }),
    'not json',
    rec('2026-11-01T10:02:00.000Z', { event: 'Stop', ctx: 0, hooks: {}, usage: { calls: 2, input: 3, cacheRead: 100, cacheWrite: 10, output: 50 } }),
  ];

  it('ranks hooks and tools and sums the turn usage', () => {
    const s = TW.summarizeTokenLog(lines.join('\n'));
    expect(s.lines).toBe(3);
    expect(s.hooks[0]).toMatchObject({ name: 'UserPromptSubmit:prompt.knowledge.dispatch', chars: 4540, runs: 1 });
    expect(s.tools[0]).toMatchObject({ name: 'Bash', chars: 7000, calls: 1 });
    expect(s.usage).toMatchObject({ turns: 1, calls: 2, output: 50 });
    expect(s.lastTs).toBe('2026-11-01T10:02:00.000Z');
  });

  it('prune drops what was read and keeps lines written later', () => {
    const file = path.join(TMP, 'prune.jsonl');
    fs.writeFileSync(file, `${[...lines, rec('2026-11-01T10:05:00.000Z', { event: 'Stop', ctx: 1 })].join('\n')}\n`);
    expect(TW.pruneTokenLog(file, '2026-11-01T10:02:00.000Z')).toEqual({ kept: 1, dropped: 4 });
    expect(fs.readFileSync(file, 'utf8')).toContain('10:05:00');
    expect(TW.pruneTokenLog(path.join(TMP, 'missing.jsonl'), 'x')).toBeNull();
  });

  it('audit --record prunes the log up to the newest timestamp the run read', async () => {
    const s = sandbox('record');
    const file = path.join(TMP, 'record.jsonl');
    fs.writeFileSync(file, `${lines.join('\n')}\n`);
    const tw = await TW.runTokenWaste({ ...s, env: {}, logFile: file });
    fs.appendFileSync(file, `${rec('2026-11-01T11:00:00.000Z', { event: 'Stop', ctx: 1 })}\n`);
    const dir = path.join(TMP, 'run');
    write(path.join(dir, 'results.json'), JSON.stringify({
      version: '0.0.1', ranAt: '2026-11-01T10:30:00.000Z', trigger: 'manual',
      footprint: { totalTokens: 1 }, net: { costTokens: 1, benefitTokens: 0, estimate: null },
      integrity: [], hygiene: [], tokenWaste: tw,
    }));
    const r = record({ in: dir, stateDir: path.join(TMP, 'state') });
    expect(r.pruned).toEqual({ kept: 1, dropped: 4 });
    expect(r.summary.tokenWaste.skipped).toBeGreaterThanOrEqual(1);
  });
});

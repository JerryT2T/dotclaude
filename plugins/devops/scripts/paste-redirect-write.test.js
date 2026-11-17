import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { run, redirectDir } = require('./paste-redirect-write.js');
const rel = require('../hooks/lib/token-guard-release.js');

const big = (n) => Array.from({ length: n }, (_, i) => `line ${i} ` + 'x'.repeat(60)).join('\n');

let cwd;
beforeEach(() => { cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'redir-')); });
afterEach(() => { fs.rmSync(cwd, { recursive: true, force: true }); });

describe('paste-redirect-write', () => {
  it('redirects a large paste: original byte-exact on disk, excerpt names it', () => {
    const text = big(800) + '\nÜmlaut ✓ end';
    const out = run({ cwd, kind: 'paste', text });
    expect(out.ok).toBe(true);
    expect(out.redirect).toBe(true);
    expect(fs.readFileSync(out.path, 'utf8')).toBe(text);
    expect(out.excerpt).toContain(out.path);
    expect(out.excerpt).toContain('line 0 ');
    expect(out.excerpt).toContain('Ümlaut ✓ end');
    expect(out.excerpt.length).toBeLessThan(text.length / 3);
  });

  it('same content → same file (a retried hook never piles up copies)', () => {
    const text = big(800);
    const a = run({ cwd, kind: 'paste', text });
    const b = run({ cwd, kind: 'paste', text });
    expect(a.path).toBe(b.path);
    expect(fs.readdirSync(redirectDir(cwd))).toHaveLength(1);
  });

  it('keeps small pastes and exempt prompts whole', () => {
    expect(run({ cwd, kind: 'paste', text: 'hello' })).toEqual({ ok: true, redirect: false, reason: 'small' });
    for (const text of ['/do-run backlog ' + big(800), 'RUN_BACKLOG_AUTOSTART: x ' + big(800), '<command-name>/x</command-name>' + big(800)]) {
      expect(run({ cwd, kind: 'paste', text })).toMatchObject({ ok: true, redirect: false, reason: 'exempt-prompt' });
    }
    expect(fs.existsSync(redirectDir(cwd))).toBe(false);
  });

  it('keeps test, git and CI output whole', () => {
    for (const command of ['npm test', 'cd x && npx vitest run', 'git log -p', 'gh pr checks 1', 'npm run lint']) {
      expect(run({ cwd, kind: 'output', command, text: big(800) })).toMatchObject({ redirect: false, reason: 'exempt-command' });
    }
  });

  it('redirects large other output', () => {
    const out = run({ cwd, kind: 'output', command: 'cat big.log', text: big(800) });
    expect(out).toMatchObject({ ok: true, redirect: true });
    expect(path.basename(out.path)).toMatch(/^output-[0-9a-f]{12}\.txt$/);
  });

  it('one decision path with pre.tokens.guard: a released retry keeps its output whole, once', () => {
    const command = 'cat huge.log';
    rel.markReleased(rel.confirmKey('Bash', cwd, { command }));
    expect(run({ cwd, kind: 'output', command, text: big(800) })).toMatchObject({ redirect: false, reason: 'guard-released' });
    // The mark is consumed: the next identical call is a new decision.
    expect(run({ cwd, kind: 'output', command, text: big(800) })).toMatchObject({ redirect: true });
  });

  it('an expired release counts no more', () => {
    const command = 'cat old.log';
    const key = rel.confirmKey('Bash', cwd, { command });
    rel.markReleased(key, { now: Date.now() - rel.RELEASE_TTL_MS - 1000 });
    expect(rel.wasReleased(key)).toBe(false);
  });

  it('refuses bad requests (the mod then keeps the text)', () => {
    expect(run(null).ok).toBe(false);
    expect(run({ cwd: 'relative', kind: 'paste', text: 'x' }).ok).toBe(false);
    expect(run({ cwd, kind: 'nope', text: 'x' }).ok).toBe(false);
    expect(run({ cwd, kind: 'paste', text: 42 }).ok).toBe(false);
  });

  it('a write failure keeps the text (ok: false, no file)', () => {
    fs.mkdirSync(path.join(cwd, '.claude'));
    fs.writeFileSync(path.join(cwd, '.claude', 'redirects'), 'not a dir');
    const out = run({ cwd, kind: 'paste', text: big(800) });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/^write-failed/);
  });
});

describe('token-guard-release costFields', () => {
  it('ignores description / run_in_background, like the guard always did', () => {
    const a = rel.confirmKey('Bash', '/p', { command: 'x', description: 'a', run_in_background: true });
    const b = rel.confirmKey('Bash', '/p', { command: 'x', description: 'b' });
    expect(a).toBe(b);
    expect(rel.confirmKey('Bash', '/q', { command: 'x' })).not.toBe(a);
  });
});

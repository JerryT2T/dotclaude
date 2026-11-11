import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const S = require('./survival.js');

let repo;
const run = (args, who = 't') => execFileSync('git', ['-c', `user.name=${who}`, '-c', `user.email=${who}@t`, '-c', 'core.autocrlf=false', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (files) => {
  for (const [f, t] of Object.entries(files)) {
    const abs = path.join(repo, f);
    if (t === null) { fs.rmSync(abs, { force: true }); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, t);
  }
};
const commit = (branch, files, msg, who = 't') => { if (run(['branch', '--list', branch])) run(['checkout', '-q', branch]); write(files); run(['add', '-A']); run(['commit', '-qm', msg], who); return run(['rev-parse', 'HEAD']); };

/** base commit = anchor; `feat` branches from it; returns the anchor sha. */
function setup(files) {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'survival-'));
  run(['init', '-q', '-b', 'main']);
  const anchor = commit('main', files, 'base');
  run(['branch', 'feat']);
  return anchor;
}
/** Candidate that took the own side for everything (the silent-discard resolution). */
const takeOurs = () => { run(['checkout', '-q', 'feat']); run(['merge', '-q', '-s', 'ours', '--no-edit', 'main']); return run(['rev-parse', 'HEAD']); };
const realMerge = () => { run(['checkout', '-q', 'feat']); run(['merge', '-q', '--no-edit', 'main']); return run(['rev-parse', 'HEAD']); };

afterEach(() => { if (repo) fs.rmSync(repo, { recursive: true, force: true }); repo = null; });

const CSS = '.card {\n  padding: 4px;\n  margin: 2px;\n}\n.button {\n  color: blue;\n}\n';
const HTML = '<div class="card">\n<span class="price">10</span>\n<span class="qty">1</span>\n<span class="tax">5</span>\n</div>\n';

describe('checkSurvival — orthogonal work', () => {
  test('a clean merge of unrelated changes: every hunk survives', () => {
    const anchor = setup({ 'a.js': 'one();\n', 'b.js': 'two();\n' });
    commit('main', { 'a.js': 'one();\nupstreamAdded();\n' }, 'feat: a');
    const own = commit('feat', { 'b.js': 'two();\nownAdded();\n' }, 'feat: b');
    const cand = realMerge();
    const r = S.checkSurvival({ cwd: repo, anchor, upstream: 'main', candidate: cand, own });
    expect(r.ok).toBe(true);
    expect(r.lost).toEqual([]);
    expect(r.survivedCount).toBe(1);
  });

  test('anchor == upstream: nothing to check', () => {
    const anchor = setup({ 'a.js': 'x();\n' });
    const r = S.checkSurvival({ cwd: repo, anchor, upstream: 'main' });
    expect(r).toMatchObject({ ok: true, lost: [], survivedCount: 0 });
  });

  test('unknown refs and a missing cwd answer ok:false, never throw', () => {
    setup({ 'a.js': 'x();\n' });
    expect(S.checkSurvival({ cwd: repo, anchor: 'nope', upstream: 'main' })).toEqual({ ok: false, reason: 'unknown-ref' });
    expect(S.checkSurvival({})).toEqual({ ok: false, reason: 'missing-ref' });
    expect(S.checkSurvival({ cwd: path.join(repo, 'missing'), anchor: 'HEAD', upstream: 'HEAD' }).ok).toBe(false);
  });
});

describe('checkSurvival — the two-developer case (red/yellow, values, layout)', () => {
  test('button red vs yellow → same-aspect-candidate; the values elsewhere → auto verdict', () => {
    const anchor = setup({ 'ui.css': CSS });
    commit('main', { 'ui.css': CSS.replace('4px', '8px').replace('2px', '6px').replace('blue', 'red') }, 'feat: red button (#12)', 'alice');
    const own = commit('feat', { 'ui.css': CSS.replace('blue', 'yellow') }, 'feat: yellow');
    const cand = takeOurs();
    const r = S.checkSurvival({ cwd: repo, anchor, upstream: 'main', candidate: cand, own });
    expect(r.ok).toBe(true);
    const button = r.lost.find((h) => h.missing.includes('color: red;'));
    expect(button).toMatchObject({ file: 'ui.css', verdict: 'same-aspect-candidate', author: 'alice', upstreamPr: 12 });
    const values = r.lost.find((h) => h.missing.includes('padding: 8px;'));
    expect(values.missing).toEqual(['padding: 8px;', 'margin: 6px;']);
    expect(values.verdict).toBe('unseen-lost');
    expect(S.DECISION_VERDICTS).toContain(button.verdict);
    expect(S.DECISION_VERDICTS).not.toContain(values.verdict);
  });

  test('3 values inside a container the own side restructured → moved; a correct resolution survives', () => {
    const anchor = setup({ 'card.html': HTML });
    commit('main', { 'card.html': HTML.replace('>10<', '>12<').replace('>1<', '>2<').replace('>5<', '>7<') }, 'feat: values (#7)', 'alice');
    const nested = (p, q, t) => `<section class="layout">\n  <div class="row">\n    <span class="price">${p}</span>\n    <span class="qty">${q}</span>\n    <span class="tax">${t}</span>\n  </div>\n</section>\n`;
    const own = commit('feat', { 'card.html': nested(10, 1, 5) }, 'refactor: layout');
    const cand = takeOurs();
    const r = S.checkSurvival({ cwd: repo, anchor, upstream: 'main', candidate: cand, own });
    expect(r.lost).toHaveLength(1);
    expect(r.lost[0]).toMatchObject({ verdict: 'moved', upstreamPr: 7 });
    expect(r.lost[0].missing).toHaveLength(3);

    // The values travelled into the new structure (re-indented): whitespace-normalised → survived.
    const fixed = commit('feat', { 'card.html': nested(12, 2, 7) }, 'fix: restore values');
    const r2 = S.checkSurvival({ cwd: repo, anchor, upstream: 'main', candidate: fixed, own });
    expect(r2.lost).toEqual([]);
    expect(r2.survivedCount).toBe(1);
  });

  test('rule vs exception: own standardisation over the element upstream changed → decision verdict', () => {
    const btn = '.btn {\n  color: blue;\n}\n';
    const anchor = setup({ 'btn.css': btn, 'link.css': '.link {\n  color: blue;\n}\n' });
    commit('main', { 'btn.css': btn.replace('blue', 'red') }, 'feat: red cta');
    const own = commit('feat', { 'btn.css': btn.replace('blue', 'var(--brand)'), 'link.css': '.link {\n  color: var(--brand);\n}\n' }, 'refactor: brand colour');
    const cand = takeOurs();
    const r = S.checkSurvival({ cwd: repo, anchor, upstream: 'main', candidate: cand, own });
    expect(r.lost).toHaveLength(1);
    expect(S.DECISION_VERDICTS).toContain(r.lost[0].verdict);
  });
});

describe('checkSurvival — deletions, renames, versions', () => {
  test('a line upstream deleted is back in the candidate → lost (resurrected)', () => {
    const anchor = setup({ 'app.js': 'start();\nlegacy();\nend();\n', 'other.js': 'o();\n' });
    commit('main', { 'app.js': 'start();\nend();\n' }, 'chore: drop legacy');
    const own = commit('feat', { 'other.js': 'o();\np();\n' }, 'feat: p');
    const cand = takeOurs();
    const r = S.checkSurvival({ cwd: repo, anchor, upstream: 'main', candidate: cand, own });
    expect(r.lost).toHaveLength(1);
    expect(r.lost[0]).toMatchObject({ file: 'app.js', resurrected: ['legacy();'], missing: [], verdict: 'unseen-lost' });
  });

  test('own side renamed the file: the upstream line is found in the renamed file', () => {
    const body = 'function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n}\n';
    const anchor = setup({ 'old.js': body });
    commit('main', { 'old.js': `${body}function c() {\n  return 3;\n}\n` }, 'feat: c');
    const own = commit('feat', { 'old.js': null, 'new.js': body }, 'refactor: rename');
    const cand = realMerge();
    expect(fs.existsSync(path.join(repo, 'new.js'))).toBe(true);
    const r = S.checkSurvival({ cwd: repo, anchor, upstream: 'main', candidate: cand, own });
    expect(r.lost).toEqual([]);
  });

  test('upstream added a whole file the candidate lacks → lost, unseen', () => {
    const anchor = setup({ 'a.js': 'a();\n' });
    commit('main', { 'feature.js': 'export const feature = true;\n' }, 'feat: file');
    const own = commit('feat', { 'a.js': 'a();\nb();\n' }, 'feat: b');
    const cand = takeOurs();
    const r = S.checkSurvival({ cwd: repo, anchor, upstream: 'main', candidate: cand, own });
    expect(r.lost).toHaveLength(1);
    expect(r.lost[0]).toMatchObject({ file: 'feature.js', status: 'A', candidatePath: null, verdict: 'unseen-lost' });
  });

  test('a re-bumped version line and lock files are not losses', () => {
    const pkg = (v) => `{\n  "name": "x",\n  "version": "${v}"\n}\n`;
    const anchor = setup({ 'package.json': pkg('1.0.0'), 'package-lock.json': '{"v":1}\n' });
    commit('main', { 'package.json': pkg('1.1.0'), 'package-lock.json': '{"v":2}\n' }, 'chore(release): v1.1.0');
    const own = commit('feat', { 'package.json': pkg('1.2.0') }, 'chore: bump');
    const cand = takeOurs();
    const r = S.checkSurvival({ cwd: repo, anchor, upstream: 'main', candidate: cand, own });
    expect(r.lost).toEqual([]);
  });

  test('hunk ids are stable across line shifts and differ by content', () => {
    const h = { oldStart: 3, added: ['  x = 1;'], removed: ['x = 0;'] };
    expect(S.hunkId('a.js', h)).toBe(S.hunkId('a.js', { ...h, oldStart: 40, added: ['x = 1;'] }));
    expect(S.hunkId('a.js', h)).not.toBe(S.hunkId('b.js', h));
    expect(S.hunkId('a.js', h)).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('intent snapshot + checkBranch', () => {
  let anchor;
  beforeEach(() => {
    anchor = setup({ 'ui.css': CSS });
    commit('main', { 'ui.css': CSS.replace('blue', 'red') }, 'feat: red (#3)', 'alice');
    run(['update-ref', 'refs/remotes/origin/main', 'main']);
  });

  test('writeIntent / readIntent round-trip under refs/devops/intent/<branch>', () => {
    const own = commit('feat', { 'ui.css': CSS.replace('blue', 'yellow') }, 'feat: yellow');
    expect(S.writeIntent(repo, 'feat')).toBe(own);
    expect(S.readIntent(repo, 'feat')).toBe(own);
    expect(run(['rev-parse', 'refs/devops/intent/feat'])).toBe(own);
    expect(S.readIntent(repo, 'other')).toBeNull();
    expect(S.writeIntent(repo, '')).toBeNull();
  });

  test('checkBranch: knowledge anchor file + intent → classified lost hunk', () => {
    commit('feat', { 'ui.css': CSS.replace('blue', 'yellow') }, 'feat: yellow');
    S.writeIntent(repo, 'feat');
    fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.claude', 'knowledge-anchor.json'), JSON.stringify({ version: 1, sha: anchor, reason: 'first-prompt' }));
    takeOurs();
    const r = S.checkBranch({ cwd: repo, base: 'main' });
    expect(r).toMatchObject({ ok: true, anchor, anchorSource: 'file', branch: 'feat' });
    expect(r.lost).toHaveLength(1);
    expect(r.lost[0]).toMatchObject({ verdict: 'same-aspect-candidate', author: 'alice', upstreamPr: 3 });
  });

  test('checkBranch without an anchor file falls back to the fork point (also after a merge)', () => {
    commit('feat', { 'other.js': 'x();\n' }, 'feat: x');
    takeOurs();
    const r = S.checkBranch({ cwd: repo, base: 'main' });
    expect(r).toMatchObject({ ok: true, anchor, anchorSource: 'fallback' });
    expect(r.lost).toHaveLength(1);
    expect(r.lost[0].verdict).toBe('unseen-lost');
  });

  test('checkBranch without origin/<base> answers ok:false', () => {
    expect(S.checkBranch({ cwd: repo, base: 'nope' }).ok).toBe(false);
  });
});

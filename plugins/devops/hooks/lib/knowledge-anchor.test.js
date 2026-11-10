import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const K = require('./knowledge-anchor.js');

let repo;
const g = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commitMain = (msg) => { fs.writeFileSync(path.join(repo, 'f.txt'), msg); g('add', '-A'); g('commit', '-qm', msg); g('update-ref', 'refs/remotes/origin/main', 'HEAD'); return g('rev-parse', 'HEAD'); };

let c1; let c2; let c3;
beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'kanchor-'));
  g('init', '-q', '-b', 'main');
  c1 = commitMain('one'); c2 = commitMain('two'); c3 = commitMain('three');
});
afterEach(() => { fs.rmSync(repo, { recursive: true, force: true }); });

describe('knowledge anchor store', () => {
  test('first prompt records origin/<base> once; a later prompt keeps it', () => {
    const a = K.recordFirstPrompt(repo, { base: 'main', session: 's1', now: 0 });
    expect(a).toMatchObject({ version: 1, base: 'main', sha: c3, reason: 'first-prompt', session: 's1' });
    expect(K.readAnchor(repo).sha).toBe(c3);
    expect(K.anchorPath(repo)).toBe(path.join(g('rev-parse', '--show-toplevel'), '.claude', 'knowledge-anchor.json'));
    expect(K.recordFirstPrompt(repo, { base: 'main', sha: c1 }).sha).toBe(c3);
  });

  test('after a ship the anchor moves forward to the new base tip', () => {
    K.recordFirstPrompt(repo, { base: 'main', sha: c1 });
    const a = K.afterShip(repo, { base: 'main' });
    expect(a).toMatchObject({ sha: c3, reason: 'after-ship' });
    expect(a.history.map((h) => h.sha)).toEqual([c1]);
  });

  test('concept open pins earlier, never later', () => {
    K.recordFirstPrompt(repo, { base: 'main', sha: c2 });
    expect(K.pinEarlier(repo, { base: 'main', sha: c3 }).sha).toBe(c2);
    const a = K.pinEarlier(repo, { base: 'main', sha: c1 });
    expect(a).toMatchObject({ sha: c1, reason: 'concept-open' });
    expect(K.readAnchor(repo).sha).toBe(c1);
  });

  test('pinEarlier without an anchor writes one', () => {
    expect(K.pinEarlier(repo, { base: 'main', sha: c2 })).toMatchObject({ sha: c2, reason: 'concept-open' });
  });

  test('agents inherit the earliest anchor of the chain, never their own start', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'kanchor-parent-'));
    try {
      fs.mkdirSync(path.join(parent, '.claude'));
      fs.writeFileSync(path.join(parent, '.claude', 'knowledge-anchor.json'), JSON.stringify({ version: 1, base: 'main', sha: c1, reason: 'first-prompt' }));
      K.recordFirstPrompt(repo, { base: 'main', sha: c3 }); // the agent's own start
      const a = K.inheritFrom(repo, parent);
      expect(a).toMatchObject({ sha: c1, reason: 'inherited', inheritedFrom: { sha: c1, path: parent } });
      // A later parent anchor does not move the inherited one forward.
      expect(K.inheritFrom(repo, { sha: c3 }).sha).toBe(c1);
      expect(K.inheritFrom(repo, c2).sha).toBe(c1);
    } finally { fs.rmSync(parent, { recursive: true, force: true }); }
  });

  test('earliest: ancestor wins; unrelated branches collapse to their merge-base', () => {
    expect(K.earliest(repo, [c3, c1, c2])).toBe(c1);
    g('checkout', '-q', '-b', 'side', c2);
    fs.writeFileSync(path.join(repo, 's.txt'), 's'); g('add', '-A'); g('commit', '-qm', 'side');
    const side = g('rev-parse', 'HEAD');
    expect(K.earliest(repo, [side, c3])).toBe(c2);
    expect(K.earliest(repo, ['nope'])).toBeNull();
  });

  test('resolveAnchor: stored anchor, else the fork point (stays right after a merge integration)', () => {
    g('checkout', '-q', '-b', 'feat', c1);
    fs.writeFileSync(path.join(repo, 'own.txt'), 'own'); g('add', '-A'); g('commit', '-qm', 'own');
    g('merge', '-q', '--no-edit', 'origin/main');
    expect(K.resolveAnchor(repo, { base: 'main' })).toMatchObject({ sha: c1, source: 'fallback', reason: 'fork-point' });
    K.writeAnchor(repo, { version: 1, sha: c2, reason: 'first-prompt' });
    expect(K.resolveAnchor(repo, { base: 'main' })).toMatchObject({ sha: c2, source: 'file' });
  });

  test('corrupt or foreign data never throws', () => {
    fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
    fs.writeFileSync(K.anchorPath(repo), '{broken');
    expect(K.readAnchor(repo)).toBeNull();
    expect(K.writeAnchor(repo, { sha: 'not a sha' })).toBe(false);
    expect(K.resolveAnchor(repo, { base: 'missing' })).toBeNull();
    expect(K.recordFirstPrompt(repo, { base: 'missing' })).toBeNull();
  });
});

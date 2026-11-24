import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const gate = createRequire(import.meta.url)("./session-archive-gate.js");

let plain, other, repo, base;

function insideWorkTree(dir) {
  const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, encoding: 'utf8' });
  return String(r.stdout).trim() === 'true';
}

beforeAll(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-gate-'));
  plain = path.join(base, 'plain');
  other = path.join(base, 'other');
  repo = path.join(base, 'repo');
  for (const d of [plain, other, repo]) fs.mkdirSync(d);
  spawnSync('git', ['init', '-q'], { cwd: repo });
});
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

describe('session-archive-gate without a git repo (#1231)', () => {
  test('a plain folder: git says no repo, the tree counts as clean, paths are compared', () => {
    if (insideWorkTree(plain)) return; // TEMP inside a work tree cannot host this case
    expect(gate.noGitRepo(plain)).toBe(true);
    expect(gate.treeClean(plain)).toBe(true);
    expect(gate.sameWorkTree(plain, path.join(plain, '..', 'plain'))).toBe(true);
    expect(gate.sameWorkTree(plain, other)).toBe(false);
  });
  test('a missing folder still refuses', () => {
    const gone = path.join(base, 'gone');
    expect(gate.noGitRepo(gone)).toBe(false);
    expect(gate.treeClean(gone)).toBe(false);
    expect(gate.sameWorkTree(gone, gone)).toBe(false);
  });
  test('a missing git binary still refuses', () => {
    if (insideWorkTree(plain)) return;
    const saved = process.env.PATH;
    process.env.PATH = path.join(base, 'nowhere');
    try {
      expect(gate.noGitRepo(plain)).toBe(false);
      expect(gate.treeClean(plain)).toBe(false);
    } finally {
      process.env.PATH = saved;
    }
  });
  test('a git folder is judged by its tree', () => {
    expect(gate.noGitRepo(repo)).toBe(false);
    expect(gate.treeClean(repo)).toBe(true);
    fs.writeFileSync(path.join(repo, 'x.txt'), 'x');
    expect(gate.treeClean(repo)).toBe(false);
    expect(gate.sameWorkTree(repo, path.join(repo, 'sub'))).toBe(true);
  });
  test('a folder with a corrupt .git is not "no repo"', () => {
    const bad = path.join(base, 'bad');
    fs.mkdirSync(path.join(bad, '.git'), { recursive: true });
    expect(gate.noGitRepo(bad)).toBe(false);
    expect(gate.treeClean(bad)).toBe(false);
  });
});

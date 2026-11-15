import { describe, test, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const { contentInBase, MAX_FILES } = createRequire(import.meta.url)("./content-landed.js");

const dirs = [];
afterAll(() => { for (const d of dirs) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* temp */ } });
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** main + a branch touching `n` files (more than MAX_FILES); `squash` lands the same files as one other commit. */
function repo(n, { squash, tweak = 0 }) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cl-big-")));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(dir, "seed.txt"), "s\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "seed");
  git(dir, "checkout", "-q", "-b", "feat");
  fs.mkdirSync(path.join(dir, "src"));
  for (let i = 0; i < n; i++) fs.writeFileSync(path.join(dir, "src", `f ${i}.txt`), `v${i}\n`);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "big");
  const tip = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "main");
  if (squash) {
    git(dir, "merge", "--squash", "feat");
    git(dir, "commit", "-qm", "squashed");
    for (let i = 0; i < tweak; i++) fs.writeFileSync(path.join(dir, "src", `f ${i}.txt`), `changed${i}\n`);
    if (tweak) { git(dir, "add", "-A"); git(dir, "commit", "-qm", "later edit"); }
  }
  return { dir, tip };
}

describe("contentInBase above the argv-sized file cap", () => {
  const N = MAX_FILES + 60;

  test("a squash-merged branch with more than 200 files is landed (one whole-tree diff)", () => {
    const { dir, tip } = repo(N, { squash: true });
    const r = contentInBase(dir, tip, "refs/heads/main");
    expect(r).toMatchObject({ landed: true, via: "files" });
    expect(r.files).toHaveLength(N);
  });

  test("a later edit of some files: not landed, but the differing paths are counted (partial)", () => {
    const { dir, tip } = repo(N, { squash: true, tweak: 3 });
    const r = contentInBase(dir, tip, "refs/heads/main");
    expect(r.landed).toBe(false);
    expect(r.files).toHaveLength(N);
    expect(r.differing).toHaveLength(3);
  });

  test("not merged at all: not landed, every path differs", () => {
    const { dir, tip } = repo(N, { squash: false });
    const r = contentInBase(dir, tip, "refs/heads/main");
    expect(r.landed).toBe(false);
    expect(r.differing).toHaveLength(N);
  });

  test("fails closed: an unknown base ref is not landed", () => {
    const { dir, tip } = repo(N, { squash: true });
    expect(contentInBase(dir, tip, "refs/heads/nope").landed).toBe(false);
  });

  test("opts.maxFiles still caps the touched-path set (fail closed)", () => {
    const { dir, tip } = repo(N, { squash: true });
    expect(contentInBase(dir, tip, "refs/heads/main", { maxFiles: 200 })).toMatchObject({ landed: false, reason: "too-many-files" });
  });
});

import { describe, test, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { landingState } from "./hygiene.js";

const dirs = [];
afterAll(() => { for (const d of dirs) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* temp */ } });
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A branch touching n files (> the 200 file per-file cap), squash-merged; `tweak` files edited on main afterwards. */
function bigRepo(n, { squash = true, tweak = 0 } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hy-big-")));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(dir, "seed.txt"), "s\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "seed");
  git(dir, "checkout", "-q", "-b", "kw/stage");
  fs.mkdirSync(path.join(dir, "src"));
  for (let i = 0; i < n; i++) fs.writeFileSync(path.join(dir, "src", `f${i}.txt`), `v${i}\n`);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "big");
  const tip = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "main");
  if (squash) {
    git(dir, "merge", "--squash", "kw/stage");
    git(dir, "commit", "-qm", "squashed");
    for (let i = 0; i < tweak; i++) fs.writeFileSync(path.join(dir, "src", `f${i}.txt`), `later${i}\n`);
    if (tweak) { git(dir, "add", "-A"); git(dir, "commit", "-qm", "later"); }
  }
  const ctx = { cwd: dir, baseRef: "refs/heads/main", merged: null, viaMerged: new Set() };
  return { tip, ctx };
}

describe("landing state of branches with more than 200 files", () => {
  test("a squash-merged one is landed", () => {
    const { tip, ctx } = bigRepo(260);
    expect(landingState(tip, "kw/stage", ctx)).toMatchObject({ state: "landed", via: "tree" });
  });

  test("squash-merged and then edited on main: partial with the identical share, not unlanded 0/0", () => {
    const { tip, ctx } = bigRepo(260, { tweak: 30 });
    expect(landingState(tip, "kw/stage", ctx)).toMatchObject({ state: "partial", filesIn: 230, filesTotal: 260 });
  });

  test("never merged: unlanded", () => {
    const { tip, ctx } = bigRepo(260, { squash: false });
    expect(landingState(tip, "kw/stage", ctx).state).toBe("unlanded");
  });
});

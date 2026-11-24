import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { landingState, reachableFromMerged } from "../../mcp-server/ship/lib/hygiene.js";

const { autosaveSuperseded } = createRequire(import.meta.url)("./autosave-superseded.js");
const REF = "parked/autosave/sess1";
const tmp = [];
afterEach(() => { while (tmp.length) try { fs.rmSync(tmp.pop(), { recursive: true, force: true }); } catch { /* temp */ } });
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

/**
 * main: base → squash; branch: c1 [→ c2]. The snapshot sits on `snapOn`
 * (c1 or base) and holds `dirty`; the PR head is the branch tip.
 */
function setup({ snapOn = "c1", dirty = { "b.txt": "draft" }, final = { "b.txt": "final" }, mainLater = {}, head = "claude/sess1" } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "as-sup-")));
  tmp.push(dir);
  const write = (files) => { for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), c + "\n"); };
  const commit = (files, msg = "c") => { write(files); git(dir, "add", "-A"); git(dir, "commit", "-qm", msg, "--allow-empty"); return git(dir, "rev-parse", "HEAD"); };
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  const base = commit({ "a.txt": "a" });
  git(dir, "checkout", "-q", "-b", "work");
  const c1 = commit({ "one.txt": "1" });
  // the snapshot: same shape as session-autosave's (first parent = session HEAD)
  git(dir, "checkout", "-q", "--detach", snapOn === "c1" ? c1 : base);
  const snap = commit(dirty, "wip(session): autosave");
  git(dir, "checkout", "-q", "work");
  const prHead = commit(final);
  git(dir, "checkout", "-q", "main");
  commit({ "one.txt": "1", ...final }, "squash");
  const tip = commit(mainLater, "later");
  git(dir, "update-ref", "refs/remotes/origin/main", tip);
  const merged = { bySha: new Set([prHead]), byName: new Map([[head, [prHead]]]) };
  const baseRef = "refs/remotes/origin/main";
  const ctx = { cwd: dir, baseRef, merged, viaMerged: reachableFromMerged(dir, merged, baseRef) };
  return { dir, snap, ctx, commit };
}

describe("autosaveSuperseded", () => {
  test("a draft the same session committed and shipped is superseded, and reads as landed", () => {
    const { snap, ctx } = setup({ mainLater: { "b.txt": "moved on", "one.txt": "2" } });
    expect(autosaveSuperseded(snap, REF, ctx)).toBe(true);
    expect(landingState(snap, REF, ctx)).toMatchObject({ state: "landed", via: "autosave" });
  });

  test("a file the PR never committed keeps the snapshot", () => {
    const { snap, ctx } = setup({ dirty: { "b.txt": "draft", "left-out.txt": "mine" } });
    expect(autosaveSuperseded(snap, REF, ctx)).toBe(false);
    expect(landingState(snap, REF, ctx).state).not.toBe("landed");
  });

  test("work saved after the last commit of the PR is kept", () => {
    const { dir, ctx } = setup();
    git(dir, "checkout", "-q", "--detach", [...ctx.merged.bySha][0]);
    fs.writeFileSync(path.join(dir, "b.txt"), "after the merge\n");
    git(dir, "commit", "-qam", "wip(session): autosave");
    expect(autosaveSuperseded(git(dir, "rev-parse", "HEAD"), REF, ctx)).toBe(false);
  });

  test("a snapshot taken on main needs a PR of the same session; another session's PR proves nothing", () => {
    const mine = setup({ snapOn: "base", mainLater: { "b.txt": "x" } });
    expect(autosaveSuperseded(mine.snap, REF, mine.ctx)).toBe(true);
    const other = setup({ snapOn: "base", head: "claude/other", mainLater: { "b.txt": "x" } });
    expect(autosaveSuperseded(other.snap, REF, other.ctx)).toBe(false);
  });

  test("only autosave snapshots qualify; offline (no merged list) never does", () => {
    const { snap, ctx } = setup();
    expect(autosaveSuperseded(snap, "parked/topic", ctx)).toBe(false);
    expect(autosaveSuperseded(snap, REF, { ...ctx, merged: null })).toBe(false);
  });
});

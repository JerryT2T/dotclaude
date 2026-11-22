import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { scanRepo, planAutoClean, isThreadWork, remoteUnlanded, classifyUnits, REMOTE_ORPHAN_IDLE_DAYS, transcriptDirNames } from "./hygiene.js";

/** E2: Claude Projects thread work is its own group and is never removed; remote orphans need 7 idle days. */
const DAY = 86_400_000;
const NOW = Date.now();
const when = (n) => new Date(NOW - n * DAY).toISOString();
const SETTINGS = { autoCleanGateDays: 3, autoCleanMinAgeDays: 3, autoCleanKeepNewest: 0, autoCleanMaxGB: 0 };

const tmp = [];
const mk = (p) => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p))); tmp.push(d); return d; };
afterEach(() => { while (tmp.length) try { fs.rmSync(tmp.pop(), { recursive: true, force: true }); } catch { /* temp */ } });

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
function commit(cwd, file, content, date) {
  fs.writeFileSync(path.join(cwd, file), content);
  git(cwd, "add", "-A");
  execFileSync("git", ["commit", "-q", "-m", "c"], { cwd, stdio: "ignore", env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  return git(cwd, "rev-parse", "HEAD");
}
function repo() {
  const dir = mk("hy-thr-");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  commit(dir, "a.txt", "a\n", when(90));
  return dir;
}
/** A branch with one old commit that is already part of main (landed). */
function landedBranch(dir, name, age) {
  git(dir, "checkout", "-q", "-b", name, "main");
  commit(dir, `${name.replace(/\W/g, "_")}.txt`, "x\n", when(age));
  git(dir, "checkout", "-q", "main");
  git(dir, "merge", "-q", "--ff-only", name);
}
const noPr = () => ({ names: new Set(), shas: new Set() });
const merged = () => ({ bySha: new Set(), byName: new Map(), anyNames: new Set() });

describe("isThreadWork", () => {
  test("names the thread flow gives its worktrees and branches", () => {
    expect(isThreadWork({ kind: "worktree", path: "C:/r/.claude/worktrees/thread-abc", branch: "x" }, null)).toBe(true);
    expect(isThreadWork({ kind: "branch", branch: "claude/thread-abc" }, null)).toBe(true);
    expect(isThreadWork({ kind: "worktree", path: "C:/r/.claude/worktrees/fix-abc", branch: "claude/fix", session: true }, null)).toBe(false);
    expect(isThreadWork({ kind: "branch", branch: "claude/threading" }, null)).toBe(false);
    expect(isThreadWork({ kind: "main-checkout", branch: "claude/thread-a" }, null)).toBe(false);
  });

  test("a session worktree whose transcript opens with a thread turn", () => {
    const projects = mk("hy-thr-proj-");
    const wt = path.join(mk("hy-thr-wt-"), ".claude", "worktrees", "calm-owl");
    const dirName = transcriptDirNames(wt)[0];
    fs.mkdirSync(path.join(projects, dirName), { recursive: true });
    fs.writeFileSync(path.join(projects, dirName, "s.jsonl"), `${JSON.stringify({ type: "user", projectsUserTurn: true })}\n`);
    expect(isThreadWork({ kind: "worktree", path: wt, session: true }, projects)).toBe(true);
    expect(isThreadWork({ kind: "worktree", path: wt, session: true }, null)).toBe(false);
  });
});

describe("planAutoClean", () => {
  test("a landed old thread branch is a thread-work group member, never removed; a Desktop branch still goes", () => {
    const dir = repo();
    landedBranch(dir, "claude/thread-42", 40);
    landedBranch(dir, "claude/desktop-old", 40);
    const scan = scanRepo(dir, NOW);
    const plan = planAutoClean(scan, SETTINGS, { cwd: dir, now: NOW, fetchMerged: merged, fetchOpen: noPr, projectsDir: null });
    expect(plan.remove.map((u) => u.branch)).toEqual(["claude/desktop-old"]);
    expect(plan.threadWork.map((u) => u.branch)).toEqual(["claude/thread-42"]);
    expect(plan.threadWork[0].preselected).toBe(false);
    expect(plan.keep.map((u) => u.branch)).not.toContain("claude/thread-42");
  });

  test("classifyUnits keeps thread work out of atRisk even when unlanded", () => {
    const dir = repo();
    git(dir, "checkout", "-q", "-b", "claude/thread-9", "main");
    commit(dir, "t.txt", "t\n", when(30));
    git(dir, "checkout", "-q", "main");
    const cls = classifyUnits(scanRepo(dir, NOW), { cwd: dir, now: NOW, fetchMerged: merged, fetchOpen: noPr, projectsDir: null });
    expect(cls.threadWork).toHaveLength(1);
    expect(cls.atRisk).toHaveLength(0);
    expect(cls.removable).toHaveLength(0);
  });
});

describe("remote-only orphans", () => {
  function withRemote(age) {
    const dir = repo();
    const bare = mk("hy-thr-origin-");
    git(bare, "init", "-q", "--bare");
    git(dir, "remote", "add", "origin", bare);
    git(dir, "push", "-q", "origin", "main");
    git(dir, "checkout", "-q", "-b", "claude/thread-r", "main");
    commit(dir, "r.txt", "r\n", when(age));
    git(dir, "push", "-q", "origin", "claude/thread-r");
    git(dir, "checkout", "-q", "main");
    git(dir, "branch", "-q", "-D", "claude/thread-r");
    git(dir, "fetch", "-q", "origin");
    return { dir, ctx: { cwd: dir, merged: merged(), open: noPr(), baseRef: "refs/heads/main" } };
  }

  test("counts as orphaned only after 7 idle days", () => {
    expect(REMOTE_ORPHAN_IDLE_DAYS).toBe(7);
    const young = withRemote(3);
    expect(remoteUnlanded(young.ctx, "main", NOW)).toEqual([]);
    const old = withRemote(8);
    expect(remoteUnlanded(old.ctx, "main", NOW).map((b) => b.name)).toEqual(["claude/thread-r"]);
  });
});

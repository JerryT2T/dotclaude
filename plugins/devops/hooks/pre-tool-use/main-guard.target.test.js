import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

/**
 * Package B of the Claude Projects concept.
 *
 * B1: pre.main.guard checks the repo the COMMAND acts on (`git -C`, `cd`,
 *     `pushd`, `Set-Location`, relative paths), also when the session's start
 *     folder is no repo (the collecting folder `P:\Projects`).
 * B2: a thread whose start folder is not the repo's own work tree gets a
 *     worktree-per-repo-and-thread remedy; a Desktop session and a thread that
 *     sits in the repo keep today's EnterWorktree remedy.
 *
 * Fixture: `coll/` is NO repo; inside it the repos `a`, `b`, `sp ace` (on
 * main) and `c` (on a feature branch). The hooks run as real processes.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const EDIT = join(HERE, "pre.edit.branch.js");
const MAIN = join(HERE, "pre.main.guard.js");
const require = createRequire(import.meta.url);
const { markThread } = require("../lib/project-thread.js");
const { branchFix, shortId } = require("../lib/branch-fix.js");
const { gitSegments } = require("../lib/ship-guard-match.js");

const TIMEOUT = 120_000;
let root, coll, home, stableHome, repos;

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function initRepo(dir, branch = "main") {
  mkdirSync(dir, { recursive: true });
  git(["init", "-q", "-b", "main", "."], dir);
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "Test"], dir);
  writeFileSync(join(dir, "x.txt"), "x\n");
  git(["add", "."], dir);
  git(["commit", "-qm", "c1"], dir);
  if (branch !== "main") git(["switch", "-q", "-c", branch], dir);
}

/** Thread runs need the feature (alpha pin in a throw-away home) and the sticky marker. */
function threadEnv() {
  return { HOME: home, USERPROFILE: home };
}

function run(hook, payload, env = {}) {
  const e = { ...process.env, ...env };
  if (!("DEVOPS_ALLOW_MAIN" in env)) delete e.DEVOPS_ALLOW_MAIN;
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: "utf8", env: e, timeout: 30_000 });
  return { status: r.status, stderr: r.stderr || "" };
}

const sh = (command, cwd, extra = {}, env, tool = "Bash") => run(MAIN, { tool_name: tool, cwd, tool_input: { command }, ...extra }, env);
const edit = (file, cwd, extra = {}, env) => run(EDIT, { tool_name: "Edit", cwd, tool_input: { file_path: file }, ...extra }, env);

function thread() {
  const id = randomUUID();
  markThread(id);
  return id;
}

beforeAll(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), "mgtarget-")));
  coll = join(root, "coll");
  repos = { a: join(coll, "a"), b: join(coll, "b"), sp: join(coll, "sp ace"), c: join(coll, "c") };
  mkdirSync(coll);
  initRepo(repos.a);
  initRepo(repos.b);
  initRepo(repos.sp);
  initRepo(repos.c, "feat/x");
  home = join(root, "home");
  mkdirSync(join(home, ".claude", "plugins"), { recursive: true });
  writeFileSync(join(home, ".claude", "plugins", ".channels.json"), JSON.stringify({ dotclaude: "alpha" }));
  stableHome = join(root, "home-stable");
  mkdirSync(join(stableHome, ".claude", "plugins"), { recursive: true });
}, TIMEOUT);

afterAll(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("B1 — the command's own repo decides, not the start folder", () => {
  test.each([
    ["git -C a commit -m x"],
    ["git -C ./a commit -m x"],
    ['git -C "sp ace" commit -m x'],
    ["git -C b -C ../a commit -m x"],
    ["git -c user.name=x -C a commit -m x"],
    ["cd a && git commit -m x"],
    ["cd a; git commit -m x"],
    ['cd "sp ace" && git commit -m x'],
    ["pushd a && git commit -m x"],
    ["cd c && cd ../a && git commit -m x"],
    ["git -C c status && git -C a commit -m x"],
    ["git -C c commit -m x && git -C b push origin main"],
    ["git -C a add -A && git -C a commit -m x"],
  ])("a non-repo start folder: %j is blocked", (command) => {
    const r = sh(command, coll);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("BLOCKED");
  }, TIMEOUT);

  test("absolute and Windows-style paths", () => {
    expect(sh(`git -C "${repos.a}" commit -m x`, coll).status).toBe(2);
    expect(sh(`git -C ${repos.a.replace(/\\/g, "/")} commit -m x`, coll).status).toBe(2);
    expect(sh(`cd ${repos.a}; git commit -m x`, coll).status).toBe(2);
  }, TIMEOUT);

  test("PowerShell: Set-Location / cd, the PowerShell tool", () => {
    expect(sh(`Set-Location "${repos.a}"; git commit -m x`, coll, {}, undefined, "PowerShell").status).toBe(2);
    expect(sh("Set-Location a; git commit -m x", coll, {}, undefined, "PowerShell").status).toBe(2);
    expect(sh("cd a; git commit -m x", coll, {}, undefined, "PowerShell").status).toBe(2);
  }, TIMEOUT);

  test("each git write is checked against its own directory", () => {
    // c is on a feature branch (fine), a is on main (blocked) — in both orders
    expect(sh("git -C c commit -m x && git -C a commit -m x", coll).status).toBe(2);
    expect(sh("git -C a status; cd c && git commit -m x", coll).status).toBe(0);
    expect(sh("cd c && git commit -m x; cd ../a && git commit -m y", coll).status).toBe(2);
  }, TIMEOUT);

  test("a cd inside a subshell ends with it: the write after it acts on the directory before", () => {
    // cwd a is on main: the subshell's `cd` into the feature repo must not vouch for the commit after it
    expect(sh("(cd ../c && git status); git commit -m x", repos.a).status).toBe(2);
    expect(sh("(cd ../c && git commit -m x)", repos.a).status).toBe(0);
    expect(sh("(cd a && git status); git -C c commit -m x", coll).status).toBe(0);
  }, TIMEOUT);

  test("harmless commands stay unblocked in a non-repo folder", () => {
    for (const c of [
      "git commit -m x", // acts on the folder itself: no repo, git fails by itself
      "git -C nowhere commit -m x",
      "git -C c commit -m x",
      "cd c && git commit -m x",
      "git -C a status",
      "git -C a log --oneline",
      "cd a && git status",
      'echo "git -C a commit"',
    ]) expect(sh(c, coll).status, c).toBe(0);
  }, TIMEOUT);

  test("an unreadable directory falls back to today's behaviour", () => {
    // repo cwd on main: a variable `cd` target is not resolvable, the cwd decides (blocked)
    expect(sh("cd $TARGET && git commit -m x", repos.a).status).toBe(2);
    expect(sh("git -C $TARGET commit -m x", repos.a).status).toBe(2);
    // non-repo cwd: nothing certain, nothing blocked
    expect(sh("cd $TARGET && git commit -m x", coll).status).toBe(0);
    expect(sh("git --git-dir=x commit -m x", coll).status).toBe(0);
  }, TIMEOUT);

  test("bypasses hold: DEVOPS_ALLOW_MAIN and the ship sentinel of the TARGET repo", () => {
    expect(sh("git -C a commit -m x", coll, {}, { DEVOPS_ALLOW_MAIN: "1" }).status).toBe(0);
    mkdirSync(join(repos.b, ".claude"), { recursive: true });
    writeFileSync(join(repos.b, ".claude", ".ship-in-progress"), JSON.stringify({ ts: Date.now(), pid: process.pid }));
    try {
      expect(sh("git -C b commit -m x", coll).status).toBe(0);
      expect(sh("git -C a commit -m x", coll).status).toBe(2); // another repo's sentinel does not count
    } finally {
      rmSync(join(repos.b, ".claude", ".ship-in-progress"), { force: true });
    }
  }, TIMEOUT);

  test("Desktop path unchanged: a repo cwd on main blocks, on a feature branch passes", () => {
    const blocked = sh("git commit -m x", repos.a);
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain("EnterWorktree");
    expect(sh("git commit -m x", repos.c).status).toBe(0);
    expect(sh("git add -A && git commit -m x", repos.a).status).toBe(2);
  }, TIMEOUT);

  test("gitSegments: cd, pushd, -C chain, quoted and relative", () => {
    const s = (cmd, cwd) => gitSegments(cmd, cwd).map((x) => x.dir);
    const base = join(root, "q");
    for (const d of ["sub", "my dir/inner", "../x"]) mkdirSync(join(base, d), { recursive: true });
    expect(s("cd sub && git commit", base)).toEqual([join(base, "sub")]);
    expect(s('git -C "my dir" -C inner commit', base)).toEqual([join(base, "my dir", "inner")]);
    expect(s("pushd ../x; git commit; popd", base)).toEqual([join(root, "x")]);
    expect(s("cd $X && git commit", base)).toEqual([null]);
    expect(s("git --git-dir=.git commit", base)).toEqual([null]);
    expect(s("echo hi && ls", base)).toEqual([]);
  });
});

describe("R2 — post-ship cleanup, and directory attribution of gitSegments", () => {
  let wt; // a linked worktree of repo a on a feature branch (the ship session's own checkout)

  beforeAll(() => {
    git(["remote", "add", "origin", repos.b], repos.a); // `origin/main` is a fast-forward only when origin is a remote
    wt = join(coll, "a-feat");
    execFileSync("git", ["worktree", "add", "-q", "-b", "feat/r2", wt], { cwd: repos.a, stdio: "ignore" });
  }, TIMEOUT);
  afterAll(() => { try { git(["remote", "remove", "origin"], repos.a); } catch { /* best effort */ } });

  const sentinel = (dir) => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", ".ship-in-progress"), JSON.stringify({ ts: Date.now(), pid: process.pid }));
    return () => rmSync(join(dir, ".claude", ".ship-in-progress"), { force: true });
  };
  const inA = (rest) => `git -C "${repos.a}" ${rest}`;

  test("finding #5: the cleanup fast-forward of main passes from a feature worktree, other writes stay blocked", () => {
    expect(sh(inA("merge --ff-only origin/main"), wt).status).toBe(0);
    expect(sh(inA("merge --ff-only origin/master"), wt).status).toBe(0);
    expect(sh(inA("pull --ff-only"), wt).status).toBe(0);
    expect(sh(inA("pull --ff-only origin main"), wt).status).toBe(0);
    expect(sh(inA("merge feat/r2"), wt).status).toBe(2);
    expect(sh(inA("merge origin/feat/x"), wt).status).toBe(2);
    expect(sh(inA("merge --ff-only origin/feat/x"), wt).status).toBe(2);
    expect(sh(inA("merge --ff-only origin/main --no-verify"), wt).status).toBe(2);
    expect(sh(inA("commit -m x"), wt).status).toBe(2);
    expect(sh(`${inA("merge --ff-only origin/main")} && ${inA("commit -m x")}`, wt).status).toBe(2);
    expect(sh("git merge --ff-only origin/main", repos.a).status).toBe(0);
  }, TIMEOUT);

  test("finding #5: the ship sentinel of the session's own worktree covers the SAME repo, not another", () => {
    const off = sentinel(wt);
    try {
      expect(sh(inA("merge feat/r2"), wt).status).toBe(0);
      expect(sh(`git -C "${repos.b}" commit -m x`, wt).status).toBe(2); // another repository
      expect(sh(inA("commit -m x"), coll).status).toBe(2); // session is not the ship's checkout
    } finally { off(); }
    expect(sh(inA("merge feat/r2"), wt).status).toBe(2);
  }, TIMEOUT);

  test("finding #6: a cd target that does not exist is unknown, so the cwd decides", () => {
    expect(sh("cd typo; git commit -m x", repos.a).status).toBe(2);
    expect(sh("pushd typo && git commit -m x", repos.a).status).toBe(2);
    expect(sh("git -C typo commit -m x", repos.a).status).toBe(2);
    expect(sh("Set-Location typo; git commit -m x", repos.a, {}, undefined, "PowerShell").status).toBe(2);
    expect(sh("cd typo; git commit -m x", repos.c).status).toBe(0);
  }, TIMEOUT);

  test("finding #6: popd / Pop-Location restore the directory before the pushd", () => {
    const s = (cmd, cwd) => gitSegments(cmd, cwd).map((x) => x.dir);
    expect(s("pushd ../c; popd; git commit", repos.a)).toEqual([repos.a]);
    expect(s("Push-Location ../c; Pop-Location; git commit", repos.a)).toEqual([repos.a]);
    expect(s("pushd ../c; git commit; popd; git commit", repos.a)).toEqual([repos.c, repos.a]);
    expect(sh("pushd ../c; popd; git commit -m x", repos.a).status).toBe(2);
  }, TIMEOUT);

  test("finding #6: GIT_WORK_TREE / GIT_DIR / --work-tree / --git-dir name the directory", () => {
    const s = (cmd, cwd) => gitSegments(cmd, cwd).map((x) => x.dir);
    const a = repos.a;
    expect(s(`GIT_WORK_TREE="${a}" git commit`, coll)).toEqual([a]);
    expect(s(`GIT_DIR="${join(a, ".git")}" git commit`, coll)).toEqual([a]);
    expect(s(`git --work-tree="${a}" commit`, coll)).toEqual([a]);
    expect(s(`git --work-tree "${a}" commit`, coll)).toEqual([a]);
    expect(s(`git --git-dir=${join(a, ".git")} commit`, coll)).toEqual([a]);
    expect(s(`git --git-dir ${join(a, ".git")} commit`, coll)).toEqual([a]);
    expect(s("git --git-dir=nowhere/.git commit", coll)).toEqual([null]);
    expect(sh(`GIT_DIR="${join(a, ".git")}" GIT_WORK_TREE="${a}" git commit -m x`, coll).status).toBe(2);
    expect(sh(`git --git-dir "${join(a, ".git")}" commit -m x`, coll).status).toBe(2);
    expect(sh(`git --work-tree=${a} commit -m x`, coll).status).toBe(2);
  }, TIMEOUT);
});

describe("B2 — the remedy of a thread outside the repo's work tree", () => {
  const WT = (repo, id) => `${repo.replace(/\\/g, "/")}/.claude/worktrees/thread-${shortId(id)}`;

  test("(a) several threads in ONE start folder: distinct worktree and branch names", () => {
    const [s1, s2] = [thread(), thread()];
    const r1 = edit(join(repos.a, "x.txt"), coll, { session_id: s1 }, threadEnv());
    const r2 = edit(join(repos.a, "x.txt"), coll, { session_id: s2 }, threadEnv());
    for (const r of [r1, r2]) {
      expect(r.status).toBe(2);
      expect(r.stderr).toContain(`git -C ${repos.a.replace(/\\/g, "/")} worktree add`);
      expect(r.stderr).not.toContain("Call the EnterWorktree tool");
    }
    expect(r1.stderr).toContain(WT(repos.a, s1));
    expect(r2.stderr).toContain(WT(repos.a, s2));
    expect(r1.stderr).toContain(`claude/thread-${shortId(s1)}-`);
    expect(r2.stderr).toContain(`claude/thread-${shortId(s2)}-`);
    expect(WT(repos.a, s1)).not.toBe(WT(repos.a, s2));
    expect(r1.stderr).not.toContain(WT(repos.a, s2));
    // the shell guard gives the same remedy for a git write
    const g = sh("git -C a commit -m x", coll, { session_id: s1 }, threadEnv());
    expect(g.status).toBe(2);
    expect(g.stderr).toContain(WT(repos.a, s1));
  }, TIMEOUT);

  test("(b) ONE thread touching several repos: one worktree per repo, none shared", () => {
    const s = thread();
    const ra = edit(join(repos.a, "x.txt"), coll, { session_id: s }, threadEnv());
    const rb = edit(join(repos.b, "x.txt"), coll, { session_id: s }, threadEnv());
    // also from a start folder that is itself repo a: b is another repo
    const rb2 = edit(join(repos.b, "x.txt"), repos.c, { session_id: s }, threadEnv());
    expect(ra.stderr).toContain(WT(repos.a, s));
    expect(ra.stderr).not.toContain(WT(repos.b, s));
    expect(rb.stderr).toContain(WT(repos.b, s));
    expect(rb.stderr).not.toContain(WT(repos.a, s));
    expect(rb2.status).toBe(2);
    expect(rb2.stderr).toContain(WT(repos.b, s));
    expect(WT(repos.a, s)).not.toBe(WT(repos.b, s));
    // a folder name with a space survives in the command
    const rs = sh('git -C "sp ace" commit -m x', coll, { session_id: s }, threadEnv());
    expect(rs.status).toBe(2);
    expect(rs.stderr).toContain(`${repos.sp.replace(/\\/g, "/")}/.claude/worktrees/thread-${shortId(s)}`);
  }, TIMEOUT);

  test("(c) a start folder that IS the repo's work tree keeps today's remedy", () => {
    const s = thread();
    const r = edit(join(repos.a, "x.txt"), repos.a, { session_id: s }, threadEnv());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Call the EnterWorktree tool");
    expect(r.stderr).not.toContain("worktree add");
    const g = sh("git commit -m x", repos.a, { session_id: s }, threadEnv());
    expect(g.status).toBe(2);
    expect(g.stderr).toContain("Call the EnterWorktree tool");
  }, TIMEOUT);

  test("Desktop path unchanged: no thread marker, same start folder", () => {
    const sid = randomUUID();
    // an edit outside the start folder's repo stays out of scope, as before
    expect(edit(join(repos.a, "x.txt"), coll, { session_id: sid }, threadEnv()).status).toBe(0);
    expect(edit(join(repos.b, "x.txt"), repos.c, { session_id: sid }, threadEnv()).status).toBe(0);
    // a git write in a repo cwd: EnterWorktree, no thread worktree
    const g = sh("git commit -m x", repos.a, { session_id: sid }, threadEnv());
    expect(g.status).toBe(2);
    expect(g.stderr).toContain("Call the EnterWorktree tool");
    expect(g.stderr).not.toContain("thread-");
    // a non-repo start folder + git -C: blocked (B1), with today's remedy text
    const x = sh("git -C a commit -m x", coll, { session_id: sid }, threadEnv());
    expect(x.status).toBe(2);
    expect(x.stderr).not.toContain("worktree add");
  }, TIMEOUT);

  test("a thread on a channel without the feature keeps today's remedy", () => {
    const s = thread();
    const r = sh("git -C a commit -m x", coll, { session_id: s }, { HOME: stableHome, USERPROFILE: stableHome });
    expect(r.status).toBe(2);
    expect(r.stderr).not.toContain("worktree add");
  }, TIMEOUT);

  test("branchFix: a remote adds the fetch, a subagent keeps its report-to-parent text, no thread -> unchanged", () => {
    const tw = { repo: "P:/Projects/x", sessionId: "abcdef12-3456", startDir: "P:/Projects" };
    const withRemote = branchFix({ branch: "main", remote: true, threadWorktree: tw }).join("\n");
    expect(withRemote).toContain("git -C P:/Projects/x fetch origin && git -C P:/Projects/x worktree add P:/Projects/x/.claude/worktrees/thread-abcdef12 -b claude/thread-abcdef12-<slug> origin/main");
    expect(branchFix({ branch: "main", remote: false, threadWorktree: tw }).join("\n")).not.toContain("fetch origin");
    expect(branchFix({ branch: "main", subagent: true, threadWorktree: tw }).join("\n")).toContain("Fix (subagent)");
    expect(branchFix({ branch: "main" })).toEqual(branchFix({ branch: "main", threadWorktree: null }));
    expect(branchFix({ branch: "main" }).join("\n")).toContain("Call the EnterWorktree tool");
  });
});

describe("review: `<x>/main` needs a remote <x>, and unattributed writes are still checked", () => {
  let wt;
  beforeAll(() => {
    git(["remote", "add", "origin", repos.b], repos.a);
    wt = join(coll, "a-review");
    execFileSync("git", ["worktree", "add", "-q", "-b", "feat/review", wt], { cwd: repos.a, stdio: "ignore" });
  }, TIMEOUT);
  afterAll(() => {
    try { git(["worktree", "remove", "--force", wt], repos.a); git(["remote", "remove", "origin"], repos.a); } catch { /* best effort */ }
  });
  const inA = (rest) => `git -C "${repos.a}" ${rest}`;

  test("a local branch named feature/main is no fast-forward of main; a real remote and the full ref are", () => {
    expect(sh(inA("merge --ff-only feature/main"), wt).status).toBe(2);
    expect(sh(inA("merge --ff-only origin/main"), wt).status).toBe(0);
    expect(sh(inA("merge --ff-only refs/remotes/origin/main"), wt).status).toBe(0);
  }, TIMEOUT);

  test("a repo without that remote gives no answer: the normal main check applies", () => {
    expect(sh(`git -C "${repos.b}" merge --ff-only origin/main`, wt).status).toBe(2);
  }, TIMEOUT);

  test.each([
    ["git pull --ff-only && echo `git commit -am x`"],
    ["git pull --ff-only origin main && x=$(git commit -am x)"],
    ["git status && echo `git commit -am x`"],
    ["if true; then git commit -m x; fi"],
    ["for i in 1; do git commit -m x; done"],
    ["if false; then true; else git commit -m x; fi"],
    ["! git commit -m x"],
    ["time git commit -m x"],
    ["{ git commit -m x; }"],
  ])("a write behind a keyword or substitution on main is blocked: %s", (command) => {
    expect(sh(command, repos.a).status).toBe(2);
  }, TIMEOUT);

  test("quoted text that only mentions a write stays quiet, and a feature branch is untouched", () => {
    expect(sh('echo "then git commit"', repos.a).status).toBe(0);
    expect(sh('echo "do git commit -m x"', repos.a).status).toBe(0);
    expect(sh("git log --grep='then git commit'", repos.a).status).toBe(0);
    expect(sh("git pull --ff-only && echo `git commit -am x`", wt).status).toBe(0);
  }, TIMEOUT);
});

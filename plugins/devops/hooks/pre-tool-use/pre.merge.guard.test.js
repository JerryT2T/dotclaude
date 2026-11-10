import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { main } = require("./pre.merge.guard.js");
const HOOK = fileURLToPath(new URL("./pre.merge.guard.js", import.meta.url));
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });

describe("whole-side picks are blocked on every branch", () => {
  test.each([
    "git checkout --ours src/a.js",
    "git checkout --theirs -- src/a.js",
    "git checkout feat/x --theirs file",
    "git restore --ours src/a.js",
    "git restore --source=HEAD --theirs a",
    "git merge -X ours origin/main",
    "git merge -Xtheirs origin/main",
    "git pull --strategy-option=theirs",
    "git rebase -X theirs main",
    "git cherry-pick -X ours abc123",
    "git merge -s ours origin/main",
    "git merge --strategy=ours origin/main",
    "git -C /repo merge --strategy ours dev",
    "git add -A && git merge -X ours dev",
    "git merge-file --ours a b c",
  ])("%s", (cmd) => {
    const r = main(bash(cmd));
    expect(r && r.block).toContain("pre.merge.guard");
  });

  test("PowerShell is covered too", () => {
    expect(main({ tool_name: "PowerShell", tool_input: { command: "git checkout --theirs a.txt" } })).toBeTruthy();
  });
});

describe("everything else passes", () => {
  test.each([
    "git merge origin/main",
    "git merge --no-edit dev",
    "git checkout feature",
    "git checkout -b x origin/main",
    "git restore --staged a.js",
    "git status -s",
    "git log --oneline -s",
    "git diff --ours",
    "git commit -m \"never use git checkout --ours\"",
    "echo 'git merge -X theirs'",
    "ls -la",
  ])("%s", (cmd) => {
    expect(main(bash(cmd))).toBeNull();
  });

  test("the inline bypass lets an explicitly requested pick through", () => {
    expect(main(bash("DEVOPS_ALLOW_SIDE_PICK=1 git merge -s ours dev"))).toBeNull();
  });

  test("other tools and empty payloads pass", () => {
    expect(main({ tool_name: "Read", tool_input: { file_path: "x" } })).toBeNull();
    expect(main({ tool_name: "Bash" })).toBeNull();
    expect(main(null)).toBeNull();
  });
});

describe("Write over an unmerged file", () => {
  let repo;
  const g = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "merge-guard-"));
    g("init", "-q", "-b", "main");
    g("config", "core.autocrlf", "false");
    g("config", "user.email", "t@example.com");
    g("config", "user.name", "T");
    g("config", "commit.gpgsign", "false");
    fs.writeFileSync(path.join(repo, "a.txt"), "base\n");
    fs.writeFileSync(path.join(repo, "b.txt"), "other\n");
    g("add", "-A");
    g("commit", "-q", "-m", "base");
    g("checkout", "-q", "-b", "side");
    fs.writeFileSync(path.join(repo, "a.txt"), "side\n");
    g("commit", "-qam", "side");
    g("checkout", "-q", "main");
    fs.writeFileSync(path.join(repo, "a.txt"), "main\n");
    g("commit", "-qam", "main");
    try { g("merge", "side"); } catch { /* conflict is the point */ }
  });
  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

  test("blocks a Write that replaces the conflicted file, with the German instruction", () => {
    const r = main({ tool_name: "Write", cwd: repo, tool_input: { file_path: path.join(repo, "a.txt"), content: "x" } });
    expect(r.block).toContain("hunkweise auflösen, beide Absichten behalten");
  });

  test("a relative path resolves against the payload cwd", () => {
    expect(main({ tool_name: "Write", cwd: repo, tool_input: { file_path: "a.txt", content: "x" } })).toBeTruthy();
  });

  test("Edit on the conflicted file stays allowed", () => {
    expect(main({ tool_name: "Edit", cwd: repo, tool_input: { file_path: path.join(repo, "a.txt"), old_string: "a", new_string: "b" } })).toBeNull();
  });

  test("a Write to a clean or new file passes", () => {
    expect(main({ tool_name: "Write", cwd: repo, tool_input: { file_path: path.join(repo, "b.txt"), content: "x" } })).toBeNull();
    expect(main({ tool_name: "Write", cwd: repo, tool_input: { file_path: path.join(repo, "new.txt"), content: "x" } })).toBeNull();
  });

  test("once resolved with git add, a Write passes again", () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "both\n");
    g("add", "a.txt");
    expect(main({ tool_name: "Write", cwd: repo, tool_input: { file_path: path.join(repo, "a.txt"), content: "x" } })).toBeNull();
  });

  test("as a child process a block is exit 2", () => {
    const r = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ tool_name: "Write", cwd: repo, tool_input: { file_path: path.join(repo, "a.txt"), content: "x" } }),
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("hunkweise");
  });
});

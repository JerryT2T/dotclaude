import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const T = require("./batch-topic.js");
const st = require("./session-title.js");
const S = require("./title-scheme.js");

describe("batch-topic", () => {
  test.each(["batch", "/do-batch", "do-batch", "do-batch on", "devops batch", "/devops:do-batch", "Sammelmodus", "collect mode", "erstmal sammeln", "BATCH", "batch."])(
    "%s is a trigger word", (t) => expect(T.isTriggerTopic(t)).toBe(true));

  test.each(["batch the CSS fixes", "Fix login", "", "batches"])("%j is not", (t) => expect(T.isTriggerTopic(t)).toBe(false));

  test("project name from a worktree path is the folder holding .claude/worktrees", () => {
    expect(T.projectName("P:\\Projects\\dotclaude\\.claude\\worktrees\\batch-3d7b27")).toBe("dotclaude");
    expect(T.projectName("/home/u/dotclaude/.claude/worktrees/x/sub")).toBe("dotclaude");
  });

  test("project name from a git worktree outside .claude/worktrees (git-common-dir)", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "bt-"));
    try {
      const main = path.join(base, "myproject");
      fs.mkdirSync(main);
      const git = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: "ignore" });
      git(main, "init", "-q");
      git(main, "-c", "user.email=a@b", "-c", "user.name=n", "commit", "--allow-empty", "-q", "-m", "i");
      const wt = path.join(base, "elsewhere-wt");
      git(main, "worktree", "add", "-q", wt, "-b", "wt-branch");
      expect(T.projectName(wt)).toBe("myproject");
      expect(T.projectName(main)).toBe("myproject");
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });

  test("a standalone repo nested under a .claude/worktrees path keeps its own name (git wins over the path shape)", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "bt-"));
    try {
      const nested = path.join(base, "outer", ".claude", "worktrees", "inner-repo");
      fs.mkdirSync(nested, { recursive: true });
      execFileSync("git", ["init", "-q"], { cwd: nested, stdio: "ignore" });
      expect(T.projectName(nested)).toBe("inner-repo");
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });

  test("fallback topic by locale, default de", () => {
    const cwd = "/x/dotclaude/.claude/worktrees/w1";
    expect(T.fallbackTopic("de", cwd)).toBe("Feedback zu dotclaude");
    expect(T.fallbackTopic("en", cwd)).toBe("Feedback on dotclaude");
    expect(T.batchTopic("batch", { cwd })).toBe("Feedback zu dotclaude");
    expect(T.batchTopic("Fix login", { cwd })).toBe("Fix login");
  });
});

describe("batch titles use the fallback", () => {
  const cwd = "/x/dotclaude/.claude/worktrees/w1";
  test("batchTitle: a trigger-only topic", () => {
    expect(st.batchTitle("batch", { lang: "de", cwd })).toBe(S.BATCH_PREFIX + "Feedback zu dotclaude");
    expect(st.batchTitle("⏳ ➜ 🤖 Solo ┃ /do-batch", { lang: "en", cwd })).toBe(S.BATCH_PREFIX + "Feedback on dotclaude");
    expect(st.batchTitle("Fix login", { cwd })).toBe(S.BATCH_PREFIX + "Fix login");
  });
  test("batchTitle: an already batch-marked 'batch' title is repaired, a good one left", () => {
    expect(st.batchTitle(S.BATCH_PREFIX + "batch", { cwd })).toBe(S.BATCH_PREFIX + "Feedback zu dotclaude");
    expect(st.batchTitle(S.BATCH_PREFIX + "Fix login", { cwd })).toBeNull();
  });
  test("unbatchTitle: a remaining trigger word becomes the fallback", () => {
    expect(st.unbatchTitle(S.BATCH_PREFIX + "batch", { lang: "en", cwd })).toBe("Feedback on dotclaude");
    expect(st.unbatchTitle(S.BATCH_PREFIX + "Fix login", { cwd })).toBe("Fix login");
  });
  test("batch topic is clamped to the budget", () => {
    const t = st.batchTitle("x".repeat(100), { cwd });
    expect(Array.from(t.slice(t.indexOf("Batch"))).length).toBeLessThanOrEqual(42);
  });
});

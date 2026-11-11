import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });

const require = createRequire(import.meta.url);
const { resultFile } = require("../lib/git-sync-bg.js");
const mq = require("../lib/merge-queue.js");
const ew = require("../lib/early-warning.js");

const PROMPT = fileURLToPath(new URL("./prompt.git.sync.js", import.meta.url));

// prompt.git.sync delivers, next to the sync result, the merge-queue line
// (upstream author/PR, restored vs open counts, "answer before the ship") and
// the early warning of branches already on the remote.

let wt;
let tmp;

function run(prompt = "weiter") {
  const res = spawnSync(process.execPath, [PROMPT], {
    input: JSON.stringify({ cwd: wt, session_id: "s1", prompt }),
    cwd: wt,
    env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp },
    encoding: "utf8",
  });
  return res.stdout || "";
}

beforeEach(() => {
  wt = fs.mkdtempSync(path.join(os.tmpdir(), "pgs-queue-wt-"));
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pgs-queue-tmp-"));
  fs.mkdirSync(path.join(wt, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(wt, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
  execFileSync("git", ["init", "-q"], { cwd: wt });
  execFileSync("git", ["checkout", "-q", "-b", "claude/feature-x"], { cwd: wt });
});

afterEach(() => {
  for (const d of [wt, tmp]) fs.rmSync(d, { recursive: true, force: true });
});

const lost = (id, verdict) => ({ id, file: "a.css", verdict, header: "@@", commit: "abc1234", author: "Alex", upstreamPr: 42, hunk: "+x" });

describe("prompt.git.sync — merge queue line", () => {
  test("a synced result with lost hunks carries one queue line naming author, PR, counts and the before-ship rule", () => {
    fs.writeFileSync(resultFile(wt, tmp), "[git-sync] ✓ origin/main → claude/feature-x: 2 commit(s)\n");
    mq.writeQueue(wt, mq.buildQueue({
      branch: "claude/feature-x", base: "main",
      check: { ok: true, anchor: "a1", survivedCount: 3, lost: [lost("h1", "unseen-lost"), lost("h2", "same-aspect-candidate")] },
    }));

    const out = run();

    expect(out).toContain("origin/main → claude/feature-x: 2 commit(s)");
    expect(out).toContain("[merge-queue]");
    expect(out).toContain("Alex");
    expect(out).toContain("#42");
    expect(out).toContain("1 hunk(s) will be restored automatically, 1 need a decision");
    expect(out).toContain("BEFORE the ship");
  });

  test("no queue line without lost hunks, and none from another branch's queue", () => {
    fs.writeFileSync(resultFile(wt, tmp), "[git-sync] ✓ origin/main → claude/feature-x: 1 commit(s)\n");
    expect(run()).not.toContain("[merge-queue]");

    fs.writeFileSync(resultFile(wt, tmp), "[git-sync] ✓ origin/main → claude/feature-x: 1 commit(s)\n");
    mq.writeQueue(wt, mq.buildQueue({
      branch: "claude/other", base: "main",
      check: { ok: true, anchor: "a1", survivedCount: 0, lost: [lost("h1", "unseen-lost")] },
    }));
    expect(run()).not.toContain("[merge-queue]");
  });
});

describe("prompt.git.sync — early warning", () => {
  test("is delivered once, with or without a sync result", () => {
    fs.writeFileSync(ew.resultFile(wt, tmp), "[early-warning] PR #7 (alex) on origin/alex/button already changes the same region\n");

    const first = run();
    expect(first).toContain("[early-warning] PR #7 (alex)");
    expect(run()).toBe("");
  });
});

/**
 * B3 (Claude Projects concept): a session whose start folder is no git repo
 * (the collecting folder `P:\Projects`) wrote `<folder>/.claude/batch-activity`
 * and `token-config.json`. The devops-WRITTEN state of such a folder lives
 * under `~/.claude/devops-state/` instead; inside a work tree nothing moves.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as B from "./batch-state.js";

const require = createRequire(import.meta.url);
const { stateClaudeDir, projectClaudeDir } = require("./project-root.js");
const HOOKS = fileURLToPath(new URL("..", import.meta.url));
const BATCH_HOOK = path.join(HOOKS, "user-prompt-submit", "prompt.batch.collect.js");
const TOKENS_SCAN = path.join(HOOKS, "session-start", "ss.tokens.scan.js");

let root, coll, repo, home;

function runHook(file, cwd, payload = {}) {
  return spawnSync(process.execPath, [file], {
    input: JSON.stringify({ cwd, ...payload }),
    cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: "", DEVOPS_DEFERRED_PHASE: "inline" },
  });
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rootstate-")));
  coll = path.join(root, "coll"); // no .git anywhere above
  repo = path.join(coll, "repo");
  home = path.join(root, "home");
  fs.mkdirSync(repo, { recursive: true });
  execFileSync("git", ["init", "-q", repo], { stdio: "ignore" });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  // user-level enablement: the plugin runs in a folder that has no settings of its own
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
});

afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("stateClaudeDir", () => {
  test("inside a work tree it IS projectClaudeDir — repo sessions keep their state where it was", () => {
    const sub = path.join(repo, "a", "b");
    fs.mkdirSync(sub, { recursive: true });
    expect(stateClaudeDir(repo)).toBe(projectClaudeDir(repo));
    expect(stateClaudeDir(sub)).toBe(path.join(repo, ".claude"));
    expect(path.dirname(B.activityPath(sub))).toBe(path.join(repo, ".claude"));
  });

  test("outside every work tree it is an own folder under ~/.claude, one per start folder", () => {
    const prev = [process.env.HOME, process.env.USERPROFILE];
    process.env.HOME = process.env.USERPROFILE = home;
    try {
      const a = stateClaudeDir(coll);
      expect(a.startsWith(path.join(home, ".claude", "devops-state"))).toBe(true);
      expect(a.startsWith(coll)).toBe(false);
      expect(stateClaudeDir(path.join(root, "other"))).not.toBe(a);
      expect(stateClaudeDir(coll)).toBe(a);
      expect(projectClaudeDir(coll)).toBe(path.join(coll, ".claude")); // readers of hand-made files are untouched
    } finally {
      [process.env.HOME, process.env.USERPROFILE] = prev;
      if (prev[0] === undefined) delete process.env.HOME;
      if (prev[1] === undefined) delete process.env.USERPROFILE;
    }
  });
});

describe("a session started in a non-repo folder writes no .claude there", () => {
  test("the activity clock (prompt.batch.collect)", () => {
    const res = runHook(BATCH_HOOK, coll, { prompt: "fix the flaky test please" });
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(coll, ".claude"))).toBe(false);
    const state = path.join(home, ".claude", "devops-state");
    const written = fs.readdirSync(state).flatMap((d) => fs.readdirSync(path.join(state, d)));
    expect(written).toContain("batch-activity");
  });

  test("token-config.json (ss.tokens.scan)", () => {
    runHook(TOKENS_SCAN, coll, {});
    expect(fs.existsSync(path.join(coll, ".claude"))).toBe(false);
  });

  test("Desktop path unchanged: the same hooks in a repo still write <repo>/.claude", () => {
    const res = runHook(BATCH_HOOK, repo, { prompt: "fix the flaky test please" });
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(repo, ".claude", "batch-activity"))).toBe(true);
    runHook(TOKENS_SCAN, repo, {});
    expect(fs.existsSync(path.join(repo, ".claude", "token-config.json"))).toBe(true);
  });
});

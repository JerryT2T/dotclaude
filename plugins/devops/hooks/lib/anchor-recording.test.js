import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// Real git repos on a loaded Windows machine: the default 5 s budget is too tight.
vi.setConfig({ testTimeout: 90000, hookTimeout: 90000 });
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const rec = require("./anchor-recording.js");
const anchors = require("./knowledge-anchor.js");

const HOOK = fileURLToPath(new URL("../user-prompt-submit/prompt.knowledge.anchor.js", import.meta.url));

let root;
let main;
const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const commit = (cwd, file, text, msg) => {
  fs.writeFileSync(path.join(cwd, file), text);
  g(cwd, "add", "-A");
  g(cwd, "commit", "-q", "-m", msg);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "anchor-rec-"));
  main = path.join(root, "main");
  fs.mkdirSync(main);
  g(main, "init", "-q", "-b", "main");
  for (const [k, v] of [["core.autocrlf", "false"], ["user.email", "t@example.com"], ["user.name", "T"], ["commit.gpgsign", "false"]]) g(main, "config", k, v);
  commit(main, "a.txt", "1\n", "one");
  g(main, "update-ref", "refs/remotes/origin/main", "HEAD");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("baseFor", () => {
  test("the default branch for a plain branch, the deepest remote parent for a hierarchical one", () => {
    g(main, "checkout", "-q", "-b", "claude/topic");
    expect(rec.baseFor(main)).toBe("main");
    // A parent that exists on the remote (git cannot hold it as a local branch next to claude/topic).
    g(main, "update-ref", "refs/remotes/origin/claude", "HEAD");
    expect(rec.baseFor(main)).toBe("claude");
  });

  test("null without a remote default", () => {
    g(main, "update-ref", "-d", "refs/remotes/origin/main");
    expect(rec.baseFor(main)).toBeNull();
  });
});

describe("ensureAnchor", () => {
  test("first prompt records origin/<base>; a second call leaves it alone", () => {
    g(main, "checkout", "-q", "-b", "feat");
    const first = rec.ensureAnchor(main, { session: "s1" });
    expect(first.action).toBe("recorded");
    expect(first.anchor.sha).toBe(g(main, "rev-parse", "origin/main"));
    expect(first.anchor.session).toBe("s1");
    commit(main, "a.txt", "2\n", "two");
    g(main, "update-ref", "refs/remotes/origin/main", "HEAD");
    expect(rec.ensureAnchor(main, { session: "s1" }).action).toBe("exists");
    expect(anchors.readAnchor(main).sha).toBe(first.anchor.sha);
  });

  test("a fresh worktree inherits the anchor of the worktree it descends from, not its own start", () => {
    g(main, "checkout", "-q", "-b", "parent");
    const early = g(main, "rev-parse", "HEAD");
    commit(main, "a.txt", "2\n", "two");
    g(main, "update-ref", "refs/remotes/origin/main", "HEAD");
    // Written after the commit: in a real project the file is ignored (runtime-ignores.js).
    anchors.writeAnchor(main, { version: 1, base: "main", sha: early, reason: "first-prompt", at: new Date().toISOString(), history: [] });

    const child = path.join(root, "child");
    g(main, "worktree", "add", "-q", "-b", "child-branch", child, "HEAD");
    const norm = (p) => fs.realpathSync(p).replace(/\\/g, "/").toLowerCase();
    expect(norm(rec.parentWorktree(child))).toBe(norm(main));
    const res = rec.ensureAnchor(child, { session: "s2" });
    expect(res.action).toBe("inherited");
    expect(res.anchor.sha).toBe(early);
    expect(res.anchor.inheritedFrom.sha).toBe(early);
  });

  test("never throws outside a repo", () => {
    expect(rec.ensureAnchor(path.join(root, "nope"), {}).action).toBe("none");
  });
});

describe("hook prompt.knowledge.anchor", () => {
  const run = (payload) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: "utf8" });

  test("records on a user prompt, silently", () => {
    g(main, "checkout", "-q", "-b", "feat");
    const r = run({ cwd: main, session_id: "s9", prompt: "fix the header" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(anchors.readAnchor(main).session).toBe("s9");
  });

  test("a machine turn never records", () => {
    g(main, "checkout", "-q", "-b", "feat");
    run({ cwd: main, session_id: "s9", prompt: "<task-notification>done</task-notification>" });
    expect(anchors.readAnchor(main)).toBeNull();
  });
});

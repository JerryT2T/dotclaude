import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// Real git repos on a loaded Windows machine: the default 5 s budget is too tight.
vi.setConfig({ testTimeout: 90000, hookTimeout: 90000 });
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const ew = require("./early-warning.js");

let root;
let origin;
let mine;
let theirs;
const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const cfg = (cwd) => {
  for (const [k, v] of [["core.autocrlf", "false"], ["user.email", "t@example.com"], ["user.name", "T"], ["commit.gpgsign", "false"]]) g(cwd, "config", k, v);
};
const lines = (n, edits = {}) => Array.from({ length: n }, (_, i) => edits[i + 1] || `line ${i + 1}`).join("\n") + "\n";
const commit = (cwd, file, text, msg) => {
  fs.writeFileSync(path.join(cwd, file), text);
  g(cwd, "add", "-A");
  g(cwd, "commit", "-q", "-m", msg);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "early-warn-"));
  origin = path.join(root, "origin.git");
  g(root, "init", "-q", "--bare", "-b", "main", origin);
  mine = path.join(root, "mine");
  theirs = path.join(root, "theirs");
  g(root, "clone", "-q", origin, mine);
  cfg(mine);
  commit(mine, "ui.css", lines(40), "base");
  commit(mine, "other.txt", "x\n", "other");
  g(mine, "push", "-q", "origin", "main");
  g(root, "clone", "-q", origin, theirs);
  cfg(theirs);
  g(theirs, "checkout", "-q", "-b", "alex/button");
  g(mine, "checkout", "-q", "-b", "me/button");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const ghPrs = (prs) => {
  const real = (cmd, args, timeout) => {
    if (cmd === "gh") return { ok: true, out: JSON.stringify(prs) };
    try { return { ok: true, out: execFileSync(cmd, args, { cwd: mine, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) }; } catch (e) { return { ok: false, out: e.stdout || "", status: e.status }; }
  };
  return real;
};

describe("parseRanges / regionsOverlap", () => {
  test("old-side ranges per file; an insertion is a one-line range", () => {
    const d = "+++ b/a.css\n@@ -10,3 +10,4 @@\n@@ -30,0 +31,2 @@\n+++ /dev/null\n@@ -1 +0,0 @@\n";
    expect(ew.parseRanges(d)).toEqual({ "a.css": [[10, 12], [30, 31]] });
  });

  test("intersections only", () => {
    expect(ew.regionsOverlap([[1, 5]], [[6, 9]])).toEqual([]);
    expect(ew.regionsOverlap([[1, 5]], [[5, 9]])).toEqual([[5, 5]]);
  });
});

describe("scan", () => {
  test("warns once per open PR whose hunks touch the same region, naming PR, author, file and lines", () => {
    commit(mine, "ui.css", lines(40, { 10: "mine 10" }), "my button");
    commit(theirs, "ui.css", lines(40, { 11: "theirs 11", 10: "theirs 10" }), "their button");
    g(theirs, "push", "-q", "origin", "alex/button");

    const out = ew.scan(mine, { run: ghPrs([{ headRefName: "alex/button", number: 7, author: { login: "alex" } }]) });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("PR #7 (alex)");
    expect(out[0]).toContain("ui.css:10");
    expect(out[0]).toContain("would conflict");
  });

  test("no warning when the other branch touches a different region or file", () => {
    commit(mine, "ui.css", lines(40, { 5: "mine 5" }), "mine");
    commit(theirs, "ui.css", lines(40, { 35: "theirs 35" }), "theirs");
    commit(theirs, "new.txt", "n\n", "new");
    g(theirs, "push", "-q", "origin", "alex/button");
    expect(ew.scan(mine, { run: ghPrs([{ headRefName: "alex/button", number: 7, author: { login: "alex" } }]) })).toEqual([]);
  });

  test("without gh it falls back to the remote heads", () => {
    commit(mine, "ui.css", lines(40, { 10: "mine 10" }), "mine");
    commit(theirs, "ui.css", lines(40, { 10: "theirs 10" }), "theirs");
    g(theirs, "push", "-q", "origin", "alex/button");
    const noGh = (cmd, args, t) => (cmd === "gh" ? { ok: false, out: "" } : ghPrs([])(cmd, args, t));
    const out = ew.scan(mine, { run: noGh });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("branch alex/button");
  });

  test("silent without a remote, on main, and never pushes", () => {
    const lone = path.join(root, "lone");
    fs.mkdirSync(lone);
    g(lone, "init", "-q", "-b", "feat");
    expect(ew.scan(lone, {})).toEqual([]);
    g(mine, "checkout", "-q", "main");
    expect(ew.scan(mine, { run: ghPrs([]) })).toEqual([]);
    expect(g(origin, "branch", "--list")).not.toContain("me/button");
  });
});

describe("maybeStart / takeWarning", () => {
  let tmpdir;
  beforeEach(() => { tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "early-warn-tmp-")); });
  afterEach(() => fs.rmSync(tmpdir, { recursive: true, force: true }));

  test("spawns once per 30-minute floor", () => {
    let spawned = 0;
    const spawn = () => { spawned++; return { unref() {} }; };
    expect(ew.maybeStart("C:/repo", { tmpdir, spawn })).toBe(true);
    expect(ew.maybeStart("C:/repo", { tmpdir, spawn })).toBe(false);
    expect(ew.maybeStart("C:/repo", { tmpdir, spawn, now: Date.now() + 31 * 60 * 1000 })).toBe(true);
    expect(spawned).toBe(2);
  });

  test("takeWarning consumes the result file", () => {
    fs.writeFileSync(ew.resultFile("C:/repo", tmpdir), "[early-warning] x\n");
    expect(ew.takeWarning("C:/repo", { tmpdir })).toBe("[early-warning] x");
    expect(ew.takeWarning("C:/repo", { tmpdir })).toBeNull();
  });

  test("a spawn failure is swallowed", () => {
    expect(ew.maybeStart("C:/repo", { tmpdir, spawn: () => { throw new Error("x"); } })).toBe(false);
  });
});

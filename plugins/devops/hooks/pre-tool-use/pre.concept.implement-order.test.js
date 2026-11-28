import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { main } = require("./pre.concept.implement-order.js");
const lib = require("../lib/implement-order.js");
const { run } = require("../../scripts/concept-artifact.js");

// #1240 — an implement click on a concept page is the person's go. The rule
// as text lost against an older "concept only" brief plus an overlapping
// thread, so an open implement order now holds back the decision card or
// question until the build started or the order is marked processed.

const HOOK = path.resolve(import.meta.dirname, "pre.concept.implement-order.js");
const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..", "..");
const PAGE = "docs/concepts/2026-kat.html";
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const sub = (id, action) => ({ id, version: 1, data: { submission_id: id, submitted: true, iteration: 3, action, _by: "dana", _tab: "t1", _storedAtMs: 1 } });

// Every case spawns git several times; on a loaded Windows machine one spawn can take seconds.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "implement-order-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "core.autocrlf", "false");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "a.js"), "export const a = 1;\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function digest(subs) {
  const f = path.join(dir, ".claude", "subs.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(subs));
  return run({ cmd: "digest", page: PAGE, submissions: f, root: dir });
}
const record = () => JSON.parse(fs.readFileSync(path.join(dir, ".claude", "concepts", "2026-kat", "artifact.json"), "utf8"));
const ask = (tool = "mcp__hearthbot__request_decision", cwd = dir) => main({ tool_name: tool, cwd });

describe("digest records the order, mark and close end it", () => {
  test("an implement click becomes an open order with the tree it was clicked on", () => {
    expect(digest([sub("s3", "implement")]).implement).toBe(true);
    const o = record().implement_order;
    expect(o).toMatchObject({ id: "s3", doc_id: "s3", round: "3", by: "dana" });
    expect(o.base.head).toBe(git(dir, "rev-parse", "HEAD").trim());
    // a re-digest of the same click keeps the baseline
    fs.writeFileSync(path.join(dir, "src", "a.js"), "export const a = 2;\n");
    digest([sub("s3", "implement")]);
    expect(record().implement_order.base).toEqual(o.base);
  });

  test("an iterate round records nothing; mark of the click and close remove the order", () => {
    digest([sub("s2", "iterate")]);
    expect(fs.existsSync(path.join(dir, ".claude", "concepts", "2026-kat", "artifact.json"))).toBe(false);
    digest([sub("s3", "implement")]);
    run({ cmd: "mark", page: PAGE, ids: "other", root: dir });
    expect(record().implement_order).toBeDefined();
    run({ cmd: "mark", page: PAGE, ids: "s3", root: dir });
    expect(record().implement_order).toBeUndefined();
    expect(ask()).toBeNull();
    digest([sub("s4", "implement")]);
    run({ cmd: "close", page: PAGE, root: dir });
    expect(record().implement_order).toBeUndefined();
  });
});

describe("the hook holds the question back until the build started", () => {
  test("no concept store, another tool, no order: nothing happens", () => {
    expect(ask()).toBeNull();
    digest([sub("s3", "implement")]);
    expect(main({ tool_name: "Bash", cwd: dir })).toBeNull();
    expect(main({ tool_name: "mcp__hearthbot__post_message", cwd: dir })).toBeNull();
  });

  test("an open order blocks a decision card and AskUserQuestion, from a subdirectory too", () => {
    digest([sub("s3", "implement")]);
    const r = ask();
    expect(r.block).toMatch(/^\[concept-implement\] BLOCKED: an implement order is open \(concept 2026-kat, round 3, clicked by dana\)/);
    expect(r.block).toMatch(/overrides, any earlier "concept only" brief/);
    expect(r.block).toMatch(/Start the build now/);
    expect(ask("AskUserQuestion").block).toBeDefined();
    expect(ask("mcp__thread__request_decision", path.join(dir, "src")).block).toBeDefined();
  });

  test("runtime state and the concept page are no build; a source edit or a commit is", () => {
    digest([sub("s3", "implement")]);
    fs.writeFileSync(path.join(dir, ".claude", "thread-calls.jsonl"), "{}\n");
    fs.mkdirSync(path.join(dir, "docs", "concepts"), { recursive: true });
    fs.writeFileSync(path.join(dir, PAGE), "<html></html>");
    expect(ask().block).toBeDefined();
    fs.writeFileSync(path.join(dir, "src", "a.js"), "export const a = 2;\n");
    expect(ask()).toBeNull();
    git(dir, "add", "src");
    git(dir, "commit", "-q", "-m", "build");
    expect(ask()).toBeNull();
  });

  test("a second edit of a file that was already changed at the click counts", () => {
    fs.writeFileSync(path.join(dir, "src", "a.js"), "export const a = 5;\n");
    digest([sub("s3", "implement")]);
    expect(ask().block).toBeDefined();
    fs.writeFileSync(path.join(dir, "src", "a.js"), "export const a = 5; export const b = 6666;\n");
    expect(ask()).toBeNull();
  });

  test("an edit that keeps size and timestamp of an already changed file counts too", () => {
    const f = path.join(dir, "src", "a.js");
    fs.writeFileSync(f, "export const a = 5;\n");
    const before = fs.statSync(f);
    digest([sub("s3", "implement")]);
    expect(ask().block).toBeDefined();
    fs.writeFileSync(f, "export const a = 7;\n");
    fs.utimesSync(f, before.atime, before.mtime);
    expect(fs.statSync(f).size).toBe(before.size);
    expect(Math.floor(fs.statSync(f).mtimeMs)).toBe(Math.floor(before.mtimeMs));
    expect(ask()).toBeNull();
  });

  test("an order older than a day, or of a closed concept, blocks nothing", () => {
    digest([sub("s3", "implement")]);
    expect(main({ tool_name: "AskUserQuestion", cwd: dir }, { now: Date.now() + lib.ORDER_TTL_MS + 1000 })).toBeNull();
    const f = path.join(dir, ".claude", "concepts", "2026-kat", "artifact.json");
    fs.writeFileSync(f, JSON.stringify({ ...record(), open: false }));
    expect(ask()).toBeNull();
  });

  test("where git cannot say, the order holds back exactly one question", () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "implement-order-nogit-"));
    try {
      const f = path.join(bare, "subs.json");
      fs.writeFileSync(f, JSON.stringify([sub("s3", "implement")]));
      run({ cmd: "digest", page: PAGE, submissions: f, root: bare });
      const noGit = { treeState: () => null };
      expect(main({ tool_name: "AskUserQuestion", cwd: bare }, noGit).block).toBeDefined();
      expect(main({ tool_name: "AskUserQuestion", cwd: bare }, noGit)).toBeNull();
    } finally { fs.rmSync(bare, { recursive: true, force: true }); }
  });

  test("as a process: exit 2 with the order on stderr; exit 0 once the build started", () => {
    digest([sub("s3", "implement")]);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "implement-order-home-"));
    fs.mkdirSync(path.join(home, ".claude"));
    fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
    const fire = () => spawnSync(process.execPath, [HOOK], {
      cwd: dir,
      input: JSON.stringify({ hook_event_name: "PreToolUse", session_id: `vitest-order-${process.pid}`, tool_name: "mcp__hearthbot__request_decision", tool_input: {}, cwd: dir }),
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, HOME: home, USERPROFILE: home },
      encoding: "utf8",
      timeout: 30_000,
    });
    try {
      const blocked = fire();
      expect(blocked.status).toBe(2);
      expect(blocked.stderr).toMatch(/\[concept-implement\] BLOCKED/);
      fs.writeFileSync(path.join(dir, "src", "b.js"), "export const b = 1;\n");
      expect(fire().status).toBe(0);
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });
});

describe("pathOfStatusLine", () => {
  test("plain, renamed and quoted paths", () => {
    expect(lib.pathOfStatusLine(" M src/a.js")).toBe("src/a.js");
    expect(lib.pathOfStatusLine("R  old.js -> src/new.js")).toBe("src/new.js");
    expect(lib.pathOfStatusLine('?? "docs/concepts/x y.html"')).toBe("docs/concepts/x y.html");
  });
});

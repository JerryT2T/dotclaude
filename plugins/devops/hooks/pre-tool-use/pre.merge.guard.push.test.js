import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// Real git repos on a loaded Windows machine: the default 5 s budget is too tight.
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { main, pushLosesUpstream } = require("./pre.merge.guard.js");
const anchors = require("../lib/knowledge-anchor.js");

let root, origin, alice, bob;
const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const cfg = (cwd) => { for (const [k, v] of [["core.autocrlf", "false"], ["user.email", "t@example.com"], ["user.name", "T"], ["commit.gpgsign", "false"]]) g(cwd, "config", k, v); };
const write = (cwd, file, text) => fs.writeFileSync(path.join(cwd, file), text);
const commit = (cwd, file, text, msg) => { write(cwd, file, text); g(cwd, "add", "-A"); g(cwd, "commit", "-q", "-m", msg); };
const BASE = '<div class="stats">\n  <app-stat key="a"/>\n</div>\n<button class="buy">Kaufen</button>\n';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "push-guard-"));
  origin = path.join(root, "origin.git");
  g(root, "init", "-q", "--bare", "-b", "main", origin);
  alice = path.join(root, "alice");
  g(root, "clone", "-q", origin, alice); cfg(alice);
  fs.writeFileSync(path.join(alice, ".gitignore"), ".claude/\n");
  commit(alice, "ship.html", BASE, "base");
  g(alice, "push", "-q", "origin", "HEAD:main");
  bob = path.join(root, "bob");
  g(root, "clone", "-q", origin, bob); cfg(bob);
  // Bob's knowledge: main as it was when his session started.
  anchors.writeAnchor(bob, { base: "main", sha: g(bob, "rev-parse", "origin/main"), reason: "first-prompt", at: new Date().toISOString() });
  // Alice ships three values straight to main.
  commit(alice, "ship.html", BASE.replace('<app-stat key="a"/>', '<app-stat key="a"/>\n  <app-stat key="b"/>\n  <app-stat key="c"/>\n  <app-stat key="d"/>'), "feat: three values");
  g(alice, "push", "-q", "origin", "HEAD:main");
  // Bob, also directly on main, rewrites the same block.
  commit(bob, "ship.html", BASE.replace('<div class="stats">\n  <app-stat key="a"/>\n</div>', '<section class="grid">\n  <app-stat key="a"/>\n</section>'), "feat: grid layout");
  g(bob, "fetch", "-q", "origin");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const push = (cwd) => main({ tool_name: "Bash", cwd, tool_input: { command: "git push origin main" } });

describe("git push from the default branch runs the survival check", () => {
  test("a merge resolved to the own side loses Alice's values → push blocked", () => {
    try { g(bob, "merge", "-q", "--no-edit", "origin/main"); } catch { /* conflict expected */ }
    // The careless resolution: keep Bob's version of the file.
    write(bob, "ship.html", BASE.replace('<div class="stats">\n  <app-stat key="a"/>\n</div>', '<section class="grid">\n  <app-stat key="a"/>\n</section>'));
    g(bob, "add", "ship.html"); g(bob, "commit", "-q", "--no-edit");
    const r = push(bob);
    expect(r && r.block).toMatch(/push refused: 1 change\(s\).*ship\.html/);
    expect(pushLosesUpstream("DEVOPS_ALLOW_UPSTREAM_LOSS=1 git push", bob)).toBeNull();
  });

  test("the values restored into the new layout → push passes", () => {
    try { g(bob, "merge", "-q", "--no-edit", "origin/main"); } catch { /* conflict expected */ }
    write(bob, "ship.html", BASE.replace('<div class="stats">\n  <app-stat key="a"/>\n</div>', '<section class="grid">\n  <app-stat key="a"/>\n  <app-stat key="b"/>\n  <app-stat key="c"/>\n  <app-stat key="d"/>\n</section>'));
    g(bob, "add", "ship.html"); g(bob, "commit", "-q", "--no-edit");
    expect(push(bob)).toBeNull();
  });

  test("a feature branch push is left to the ship gate", () => {
    g(bob, "checkout", "-q", "-b", "feat");
    expect(push(bob)).toBeNull();
  });
});

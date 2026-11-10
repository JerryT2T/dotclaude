import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// Real git repos on a loaded Windows machine: the default 5 s budget is too tight.
vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordShipAnchor } from "./cleanup.js";

const require = createRequire(import.meta.url);
const { readAnchor } = require("../../../hooks/lib/knowledge-anchor.js");

// A completed ship (keep-mode, remote branch gone) moves the knowledge anchor
// to the new origin/<base> tip; a ship-blocked exit leaves it alone.

let repo;
const g = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-anchor-"));
  g("init", "-q", "-b", "main");
  g("config", "core.autocrlf", "false");
  g("config", "user.email", "t@example.com");
  g("config", "user.name", "T");
  g("config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(repo, "a.txt"), "1\n");
  g("add", "-A");
  g("commit", "-q", "-m", "one");
  g("update-ref", "refs/remotes/origin/main", "HEAD");
});
afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

describe("recordShipAnchor", () => {
  test("a synced keep-mode ship resets the anchor to origin/<base>", () => {
    const tip = g("rev-parse", "origin/main");
    const a = recordShipAnchor(repo, "main", { synced: true });
    expect(a.sha).toBe(tip);
    expect(readAnchor(repo)).toMatchObject({ sha: tip, reason: "after-ship" });
  });

  test("tree-differs / already-on-base also count as a completed ship", () => {
    expect(recordShipAnchor(repo, "main", { synced: false, reason: "tree-differs" })).toBeTruthy();
    expect(recordShipAnchor(repo, "main", { synced: false, reason: "already-on-base" })).toBeTruthy();
  });

  test("a ship-blocked exit (no upstream / upstream still present) leaves the anchor alone", () => {
    expect(recordShipAnchor(repo, "main", { synced: false, reason: "no-upstream" })).toBeNull();
    expect(recordShipAnchor(repo, "main", { synced: false, reason: "upstream-present" })).toBeNull();
    expect(recordShipAnchor(repo, "main", { synced: false, reason: "intermediate" })).toBeNull();
    expect(readAnchor(repo)).toBeNull();
  });

  test("never throws", () => {
    expect(recordShipAnchor("/no/such/dir", "main", { synced: true })).toBeNull();
    expect(recordShipAnchor(repo, "main", undefined)).toBeNull();
  });
});

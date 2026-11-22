import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
// zod is a runtime dep of the MCP server, not installed in the test env; only helpers are used here.
vi.mock("zod", () => {
  const node = new Proxy(() => node, { get: () => () => node });
  return { z: { object: () => node, string: () => node, boolean: () => node, enum: () => node, number: () => node, array: () => node, preprocess: () => node } };
});
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { bumpTargetDrift, insertChangelogEntry, landedBump } from "./run.js";
import { readVersion } from "../lib/version.js";

let root;
const put = (rel, obj) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ship-drift-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  put(".claude-plugin/marketplace.json", { metadata: { version: "1.3.0" }, plugins: [{ name: "a", source: "plugins/a", version: "1.3.0" }] });
  put("plugins/a/.claude-plugin/plugin.json", { name: "a", version: "1.3.0" });
  put("README.md", "**Version: 1.3.0**\n");
  put("CHANGELOG.md", "## [1.2.0] — 2026-10-01\n");
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe("bumpTargetDrift — every bump target, not just the one readVersion names", () => {
  test("marketplace.json carries the bump, a nested plugin.json does not", () => {
    expect(readVersion(root).version).toBe("1.3.0");
    put("plugins/a/.claude-plugin/plugin.json", { name: "a", version: "1.2.0" });
    const drift = bumpTargetDrift(root, "1.3.0");
    expect(drift.map((f) => f.split(path.sep).join("/"))).toEqual(["plugins/a/.claude-plugin/plugin.json"]);
  });

  test("a consistent tree has no drift; a lagging CHANGELOG is editorial and ignored", () => {
    expect(bumpTargetDrift(root, "1.3.0")).toEqual([]);
  });

  test("a second CHANGELOG insert for a version that already has a header is skipped", () => {
    const once = insertChangelogEntry("## [1.2.0] — 2026-10-01\n", "1.3.0", "- x");
    expect(once).toContain("## [1.3.0]");
    expect(insertChangelogEntry(once, "1.3.0", "- x")).toBeNull();
  });
});

// #1191: after a blocked exit + ship_cleanup the checkpoint is gone; the bump is read from git state instead.
describe("landedBump — the branch already carries an unreleased bump", () => {
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: root, encoding: "utf8" });
  const setVersion = (v) => {
    put(".claude-plugin/marketplace.json", { metadata: { version: v }, plugins: [{ name: "a", source: "plugins/a", version: v }] });
    put("plugins/a/.claude-plugin/plugin.json", { name: "a", version: v });
  };
  beforeEach(() => {
    git("add", "-A");
    git("commit", "-qm", "base");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("checkout", "-qb", "feat/x");
    put("src.js", "x");
    git("add", "-A");
    git("commit", "-qm", "feat: x");
  });

  test("a release commit for the current version above the base's → reused", () => {
    setVersion("1.4.0");
    git("commit", "-qam", "chore(release): v1.4.0");
    const r = landedBump(root, "main", "1.4.0");
    expect(r).toMatchObject({ vNew: "1.4.0", vOld: "1.3.0" });
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  test("no release commit on the branch → null (bump as usual)", () => {
    expect(landedBump(root, "main", "1.3.0")).toBeNull();
  });

  test("a custom commit message is recognised too", () => {
    setVersion("1.3.1");
    git("commit", "-qam", "release 1.3.1");
    expect(landedBump(root, "main", "1.3.1", "release 1.3.1")).toMatchObject({ vNew: "1.3.1" });
    expect(landedBump(root, "main", "1.3.1")).toBeNull();
  });

  test("the base already at that version → null (a leftover commit, not this ship's bump)", () => {
    git("commit", "-q", "--allow-empty", "-m", "chore(release): v1.3.0");
    expect(landedBump(root, "main", "1.3.0")).toBeNull();
  });
});

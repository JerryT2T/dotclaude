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
import { bumpTargetDrift, insertChangelogEntry } from "./run.js";
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

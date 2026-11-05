import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { run, parseLatest } = require("./ss.catalog.remote");

const NOW = 1_800_000_000_000;

function writePlugin(dir, name, version) {
  fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name, version }));
}

describe("ss.catalog.remote", () => {
  let tmp, rpmRoot, home, cacheFile, calls;
  const fetcher = (latest) => async () => { calls += 1; return latest; };
  const go = (latest, extra = {}) => run({ pluginRoot: rpmRoot, home, cacheFile, now: NOW, fetcher: fetcher(latest), cloud: false, lang: "en", ...extra });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-remote-"));
    const userDir = path.join(tmp, "Claude-Data", "rpm", "2c09286c", "394def81");
    rpmRoot = path.join(userDir, "plugin_0182abc");
    writePlugin(rpmRoot, "devops", "0.344.2");
    fs.writeFileSync(path.join(userDir, "manifest.json"), JSON.stringify({
      plugins: [{ id: "plugin_0182abc", name: "devops", marketplaceName: "dotclaude", updatedAt: "2026-11-02T11:55:04Z" }],
    }));
    home = path.join(tmp, "home");
    fs.mkdirSync(home);
    cacheFile = path.join(tmp, "cache.json");
    calls = 0;
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test("warns an account-copy-only machine that trails GitHub", async () => {
    const text = await go("0.350.0");
    expect(text).toContain('⚠ devops: no local install · Cloud 0.344.2 outdated (runs here), newest is 0.350.0 → "update cloud"');
  });

  test("silent when the copy is current or ahead", async () => {
    expect(await go("0.344.2")).toBe("");
    fs.rmSync(cacheFile);
    expect(await go("0.300.0")).toBe("");
  });

  test("silent for a Claude Code install, without fetching", async () => {
    const cli = path.join(home, ".claude", "plugins", "cache", "dotclaude", "devops", "0.300.0");
    writePlugin(cli, "devops", "0.300.0");
    expect(await go("0.350.0", { pluginRoot: cli })).toBe("");
    expect(calls).toBe(0);
  });

  test("silent without fetching when the clone check already warned", async () => {
    writePlugin(path.join(home, ".claude", "plugins", "marketplaces", "dotclaude", "plugins", "devops"), "devops", "0.350.0");
    expect(await go("0.350.0")).toBe("");
    expect(calls).toBe(0);
  });

  test("silent without fetching when the install check already warned", async () => {
    fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({
      plugins: { "devops@dotclaude": [{ scope: "user", version: "0.350.0", lastUpdated: "2026-11-04" }] },
    }));
    expect(await go("0.350.0")).toBe("");
    expect(calls).toBe(0);
  });

  test("warns when a local clone is pinned behind main but level with the copy", async () => {
    writePlugin(path.join(home, ".claude", "plugins", "marketplaces", "dotclaude", "plugins", "devops"), "devops", "0.344.2");
    expect(await go("0.350.0")).toContain("newest is 0.350.0");
  });

  test("a cloud session warns on its own copy, without an rpm path, and only when behind", async () => {
    const root = path.join(tmp, "cloud-plugin");
    writePlugin(root, "devops", "0.344.2");
    expect(await go("0.350.0", { pluginRoot: root, cloud: true, lang: "de" })).toContain("⚠ devops: Cloud 0.344.2 veraltet, neueste ist 0.350.0 → „Cloud updaten“");
    fs.rmSync(cacheFile);
    expect(await go("0.344.2", { pluginRoot: root, cloud: true })).toBe("");
  });

  test("silent for a copy from another marketplace", async () => {
    fs.writeFileSync(path.join(path.dirname(rpmRoot), "manifest.json"), JSON.stringify({
      plugins: [{ id: "plugin_0182abc", name: "devops", marketplaceName: "a-fork" }],
    }));
    expect(await go("0.350.0")).toBe("");
  });

  test("a failed fetch stays silent and caches nothing", async () => {
    expect(await go(null)).toBe("");
    expect(await go(null, { fetcher: async () => { throw new Error("offline"); } })).toBe("");
    expect(fs.existsSync(cacheFile)).toBe(false);
  });

  test("reuses the cached version for 6 h, then fetches again", async () => {
    await go("0.350.0");
    expect(calls).toBe(1);
    expect(await go("0.999.0")).toContain("newest is 0.350.0");
    expect(calls).toBe(1);
    expect(await go("0.351.0", { now: NOW + 6 * 60 * 60 * 1000 })).toContain("newest is 0.351.0");
    expect(calls).toBe(2);
  });

  test("fresh skips a valid cache and refreshes it", async () => {
    await go("0.350.0");
    expect(await go("0.351.0", { fresh: true })).toContain("newest is 0.351.0");
    expect(calls).toBe(2);
    expect(await go("0.999.0")).toContain("newest is 0.351.0");
    expect(calls).toBe(2);
  });

  test("a corrupt cache falls back to the fetch", async () => {
    fs.writeFileSync(cacheFile, "{nope");
    expect(await go("0.350.0")).toContain("newest is 0.350.0");
    expect(calls).toBe(1);
  });

  test("parseLatest accepts plain SemVer only", () => {
    expect(parseLatest('{"version":"0.350.0"}')).toBe("0.350.0");
    expect(parseLatest('{"version":"0.350.0 **click**"}')).toBeNull();
    expect(parseLatest('{"version":1}')).toBeNull();
    expect(parseLatest("<html>")).toBeNull();
  });
});

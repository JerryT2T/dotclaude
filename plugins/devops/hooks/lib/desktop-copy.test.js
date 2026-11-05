import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isRpmCopy, desktopCopyLag, localInstall, cloudVersion, mirrorToRpm, versionNotice } = require("./desktop-copy");

function writePlugin(dir, name, version) {
  fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name, version }));
}

describe("desktop-copy", () => {
  let tmp, rpmRoot, marketplacesDir;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-copy-"));
    const userDir = path.join(tmp, "Claude-Data", "rpm", "2c09286c", "394def81");
    rpmRoot = path.join(userDir, "plugin_0182abc");
    writePlugin(rpmRoot, "devops", "0.326.0");
    fs.writeFileSync(path.join(userDir, "manifest.json"), JSON.stringify({
      plugins: [{ id: "plugin_0182abc", name: "devops", marketplaceName: "dotclaude", updatedAt: "2026-10-26T21:02:41Z" }],
    }));
    marketplacesDir = path.join(tmp, "marketplaces");
    writePlugin(path.join(marketplacesDir, "dotclaude", "plugins", "devops"), "devops", "0.334.1");
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test("isRpmCopy matches the Desktop rpm layout, not the CLI cache", () => {
    expect(isRpmCopy(rpmRoot)).toBe(true);
    expect(isRpmCopy("C:/Users/x/.claude/plugins/cache/dotclaude/devops/0.334.1")).toBe(false);
    expect(isRpmCopy("P:/Projects/rpm-tools/plugins/devops")).toBe(false);
  });

  test("reports an rpm copy that trails the marketplace clone", () => {
    expect(desktopCopyLag({ pluginRoot: rpmRoot, marketplacesDir })).toEqual({
      name: "devops",
      running: "0.326.0",
      latest: "0.334.1",
      marketplace: "dotclaude",
      updatedAt: "2026-10-26T21:02:41Z",
    });
  });

  test("silent when the rpm copy is current or ahead", () => {
    writePlugin(rpmRoot, "devops", "0.334.1");
    expect(desktopCopyLag({ pluginRoot: rpmRoot, marketplacesDir })).toBeNull();
    writePlugin(rpmRoot, "devops", "0.335.0");
    expect(desktopCopyLag({ pluginRoot: rpmRoot, marketplacesDir })).toBeNull();
  });

  test("silent for a CLI cache copy, even when older", () => {
    const cliRoot = path.join(tmp, ".claude", "plugins", "cache", "dotclaude", "devops", "0.300.0");
    writePlugin(cliRoot, "devops", "0.300.0");
    expect(desktopCopyLag({ pluginRoot: cliRoot, marketplacesDir })).toBeNull();
  });

  test("silent without a manifest entry or a matching marketplace clone", () => {
    fs.rmSync(path.join(marketplacesDir, "dotclaude"), { recursive: true });
    expect(desktopCopyLag({ pluginRoot: rpmRoot, marketplacesDir })).toBeNull();
    fs.rmSync(path.join(path.dirname(rpmRoot), "manifest.json"));
    expect(desktopCopyLag({ pluginRoot: rpmRoot, marketplacesDir })).toBeNull();
  });

  describe("mirror and version line", () => {
    let home, cache, lockDir;
    const manifestFile = () => path.join(path.dirname(rpmRoot), "manifest.json");
    const install = (version, extra = {}) => {
      cache = path.join(home, ".claude", "plugins", "cache", "dotclaude", "devops", version);
      writePlugin(cache, "devops", version);
      fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
      fs.writeFileSync(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({
        plugins: {
          "devops@dotclaude": [
            { scope: "user", version, channel: "alpha", lastUpdated: "2026-11-05", installPath: cache, ...extra },
            { scope: "project", version: "9.9.9", lastUpdated: "2026-12-01", installPath: "x" },
          ],
          "devops@temp_git_1..clone": [{ scope: "user", version: "99.0.0", lastUpdated: "2026-12-01", installPath: "x" }],
        },
      }));
    };
    const mirror = () => mirrorToRpm({ pluginRoot: rpmRoot, home, lockDir });

    beforeEach(() => {
      home = path.join(tmp, "home");
      lockDir = path.join(tmp, "lock");
    });

    test("localInstall takes the user-scope entry, not a clone or project entry", () => {
      install("0.334.1");
      expect(localInstall(home)).toEqual({ version: "0.334.1", channel: "alpha", installPath: cache, marketplace: "dotclaude" });
      expect(localInstall(path.join(tmp, "nobody"))).toBeNull();
    });

    test("copies new and changed files, removes stale ones, keeps node_modules", () => {
      install("0.334.1");
      fs.mkdirSync(path.join(cache, "hooks"), { recursive: true });
      fs.writeFileSync(path.join(cache, "hooks", "a.js"), "new");
      fs.mkdirSync(path.join(rpmRoot, "hooks"), { recursive: true });
      fs.writeFileSync(path.join(rpmRoot, "hooks", "a.js"), "old");
      fs.mkdirSync(path.join(rpmRoot, "gone"), { recursive: true });
      fs.writeFileSync(path.join(rpmRoot, "gone", "b.js"), "stale");
      fs.mkdirSync(path.join(rpmRoot, "mcp-server", "node_modules", "x"), { recursive: true });
      fs.writeFileSync(path.join(rpmRoot, "mcp-server", "node_modules", "x", "i.js"), "dep");

      expect(mirror()).toEqual({ ok: true, from: "0.326.0", to: "0.334.1" });
      expect(fs.readFileSync(path.join(rpmRoot, "hooks", "a.js"), "utf8")).toBe("new");
      expect(fs.existsSync(path.join(rpmRoot, "gone"))).toBe(false);
      expect(fs.existsSync(path.join(rpmRoot, "mcp-server", "node_modules", "x", "i.js"))).toBe(true);
      expect(JSON.parse(fs.readFileSync(path.join(rpmRoot, ".claude-plugin", "plugin.json"), "utf8")).version).toBe("0.334.1");
      expect(mirror()).toBeNull();
    });

    test("refuses before writing when a link inside the copy would redirect a write", () => {
      install("0.334.1");
      fs.mkdirSync(path.join(cache, "hooks"), { recursive: true });
      fs.writeFileSync(path.join(cache, "a.js"), "new");
      fs.writeFileSync(path.join(cache, "hooks", "z.js"), "new");
      const outside = path.join(tmp, "outside");
      fs.mkdirSync(outside);
      fs.symlinkSync(outside, path.join(rpmRoot, "hooks"), "junction");

      expect(mirror()).toMatchObject({ ok: false, reason: expect.stringContaining("link in the way") });
      expect(fs.existsSync(path.join(outside, "z.js"))).toBe(false);
      expect(fs.existsSync(path.join(rpmRoot, "a.js"))).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(rpmRoot, ".claude-plugin", "plugin.json"), "utf8")).version).toBe("0.326.0");
    });

    test("does nothing outside an rpm copy, for another marketplace, or when not behind", () => {
      install("0.334.1");
      expect(mirrorToRpm({ pluginRoot: cache, home, lockDir })).toBeNull();
      fs.writeFileSync(manifestFile(), JSON.stringify({ plugins: [{ id: "plugin_0182abc", name: "devops", marketplaceName: "a-fork", updatedAt: "x" }] }));
      expect(mirror()).toBeNull();
      expect(JSON.parse(fs.readFileSync(path.join(rpmRoot, ".claude-plugin", "plugin.json"), "utf8")).version).toBe("0.326.0");
    });

    test("reports a missing install dir and leaves the copy alone", () => {
      install("0.334.1", { installPath: path.join(home, "missing") });
      expect(mirror()).toMatchObject({ ok: false, from: "0.326.0", to: "0.334.1" });
      expect(JSON.parse(fs.readFileSync(path.join(rpmRoot, ".claude-plugin", "plugin.json"), "utf8")).version).toBe("0.326.0");
    });

    test("another session's fresh lock skips the run, a stale one is taken over", () => {
      install("0.334.1");
      fs.mkdirSync(lockDir);
      expect(mirror()).toBeNull();
      expect(mirrorToRpm({ pluginRoot: rpmRoot, home, lockDir, now: Date.now() + 6 * 60 * 1000 })).toMatchObject({ ok: true });
    });

    test("the marker keeps the real cloud version across mirrors until updatedAt moves", () => {
      install("0.334.1");
      mirror();
      expect(cloudVersion({ pluginRoot: rpmRoot, home })).toBe("0.326.0");
      install("0.340.0");
      mirror();
      expect(cloudVersion({ pluginRoot: rpmRoot, home })).toBe("0.326.0");
      expect(cloudVersion({ pluginRoot: cache, home })).toBe("0.326.0");
      fs.writeFileSync(manifestFile(), JSON.stringify({ plugins: [{ id: "plugin_0182abc", name: "devops", marketplaceName: "dotclaude", updatedAt: "2026-11-06T00:00:00Z" }] }));
      expect(cloudVersion({ pluginRoot: rpmRoot, home })).toBe("0.340.0");
      expect(cloudVersion({ pluginRoot: cache, home })).toBeNull();
    });

    test("Desktop before the mirror, Desktop after it, and the CLI each get their line", () => {
      install("0.334.1");
      expect(versionNotice({ pluginRoot: rpmRoot, home }))
        .toBe("ℹ devops: lokal 0.334.1 (alpha) aktuell, Desktop zieht ab der nächsten Session nach · Cloud 0.326.0 updaten → „Cloud updaten“");
      mirror();
      expect(versionNotice({ pluginRoot: rpmRoot, home }))
        .toBe("ℹ devops: lokal 0.334.1 (alpha) aktuell · Cloud 0.326.0 updaten (Desktop nutzt schon lokal), unkritisch → „Cloud updaten“");
      expect(versionNotice({ pluginRoot: cache, home }))
        .toBe("ℹ devops: lokal 0.334.1 (alpha) aktuell · Cloud 0.326.0 updaten, unkritisch → „Cloud updaten“");
      expect(versionNotice({ pluginRoot: cache, home, lang: "en" }))
        .toBe('ℹ devops: local 0.334.1 (alpha) current · update Cloud 0.326.0, not urgent → "update cloud"');
    });

    test("no line when Cloud has caught up, is ahead, or nothing is known", () => {
      install("0.326.0");
      expect(versionNotice({ pluginRoot: rpmRoot, home })).toBeNull();
      install("0.300.0");
      expect(versionNotice({ pluginRoot: rpmRoot, home })).toBeNull();
      expect(versionNotice({ pluginRoot: cache, home })).toBeNull();
      expect(versionNotice({ pluginRoot: rpmRoot, home: path.join(tmp, "nobody") })).toBeNull();
    });
  });
});

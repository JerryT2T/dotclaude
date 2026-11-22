import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cu = require("./cloud-update");
const ts = require("./thread-seen");
const { versionNotice } = require("./desktop-copy");
const { cloudUpdateBlock } = require("../session-start/ss.project.setup");

const tmp = [];
function mk(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmp.push(d);
  return d;
}
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop(), { recursive: true, force: true }); });

const HOUR = 3600 * 1000;
const T0 = Date.parse("2026-11-22T10:00:00Z");

describe("thread-seen marker", () => {
  test("a live thread flag in the tmp dir becomes the persisted marker; no flag, no marker", () => {
    const home = mk("cu-home-");
    const tmpDir = mk("cu-tmp-");
    expect(ts.recordThreadSeen({ home, tmpDir, now: T0 })).toBe(false);
    expect(ts.threadSeen(home)).toBe(false);
    fs.writeFileSync(path.join(tmpDir, "dotclaude-devops-project-thread-abc"), "x");
    expect(ts.recordThreadSeen({ home, tmpDir, now: T0 })).toBe(true);
    expect(ts.threadSeen(home)).toBe(true);
    // the flag is gone after a reboot — the marker stays
    fs.rmSync(path.join(tmpDir, "dotclaude-devops-project-thread-abc"));
    expect(ts.recordThreadSeen({ home, tmpDir, now: T0 + 5 * HOUR })).toBe(true);
    expect(ts.threadSeen(home)).toBe(true);
  });

  test("an unrelated or half-written flag does not count", () => {
    const home = mk("cu-home-");
    const tmpDir = mk("cu-tmp-");
    fs.writeFileSync(path.join(tmpDir, "dotclaude-devops-project-thread-abc.1.2.tmp"), "x");
    fs.writeFileSync(path.join(tmpDir, "dotclaude-devops-other-abc"), "x");
    expect(ts.recordThreadSeen({ home, tmpDir })).toBe(false);
  });
});

describe("claim: one updater at a time, once per version", () => {
  test("two parallel sessions: exactly one wins; the second is told why", () => {
    const home = mk("cu-home-");
    const a = cu.claimUpdate({ home, version: "0.400.0", now: T0 });
    const b = cu.claimUpdate({ home, version: "0.400.0", now: T0 + 1000 });
    expect(a.claimed).toBe(true);
    expect(b).toMatchObject({ claimed: false, reason: expect.stringMatching(/another session/) });
  });

  test("while one version is being updated nobody claims a newer one", () => {
    const home = mk("cu-home-");
    expect(cu.claimUpdate({ home, version: "0.400.0", now: T0 }).claimed).toBe(true);
    expect(cu.claimUpdate({ home, version: "0.401.0", now: T0 + HOUR }).claimed).toBe(false);
  });

  test("an unfinished claim is retried after 3 h; a finished one after 48 h; a manual one after 24 h", () => {
    const home = mk("cu-home-");
    cu.claimUpdate({ home, version: "0.400.0", now: T0 });
    expect(cu.claimUpdate({ home, version: "0.400.0", now: T0 + 3 * HOUR + 1 }).claimed).toBe(true);
    cu.markUpdate({ home, version: "0.400.0", state: "done", now: T0 + 4 * HOUR });
    expect(cu.claimUpdate({ home, version: "0.400.0", now: T0 + 40 * HOUR }).claimed).toBe(false);
    expect(cu.claimUpdate({ home, version: "0.400.0", now: T0 + 53 * HOUR }).claimed).toBe(true);
    cu.markUpdate({ home, version: "0.400.0", state: "manual", now: T0 + 54 * HOUR });
    expect(cu.claimUpdate({ home, version: "0.400.0", now: T0 + 70 * HOUR }).claimed).toBe(false);
    expect(cu.claimUpdate({ home, version: "0.400.0", now: T0 + 79 * HOUR }).claimed).toBe(true);
  });

  test("finding #12: a release is offered again only after 3 h, not to every following session", () => {
    const home = mk("cu-home-");
    cu.claimUpdate({ home, version: "0.400.0", now: T0 });
    expect(cu.markUpdate({ home, version: "0.400.0", state: "release", now: T0 + 1000 })).toBe(true);
    for (const dt of [2000, 60_000, 2 * HOUR]) expect(cu.claimUpdate({ home, version: "0.400.0", now: T0 + dt }).claimed).toBe(false);
    expect(cu.claimUpdate({ home, version: "0.400.0", now: T0 + 3 * HOUR + 2000 }).claimed).toBe(true);
  });

  test("finding #12: taking over a stale lock is rename-based and leaves no stale leftovers", () => {
    const home = mk("cu-home-");
    const lockDir = path.join(home, ".claude", "lock");
    fs.mkdirSync(lockDir, { recursive: true });
    expect(cu.claimUpdate({ home, version: "0.400.0", lockDir, now: Date.now() + 11 * 60 * 1000 }).claimed).toBe(true);
    expect(fs.readdirSync(path.join(home, ".claude")).filter((f) => f.includes("stale"))).toEqual([]);
    expect(fs.existsSync(lockDir)).toBe(false); // released after the claim
  });

  test("a live lock makes the other claimant back off; a stale lock is taken over", () => {
    const home = mk("cu-home-");
    const lockDir = path.join(home, ".claude", "lock");
    fs.mkdirSync(lockDir, { recursive: true });
    expect(cu.claimUpdate({ home, version: "0.400.0", lockDir, now: Date.now() }).claimed).toBe(false);
    expect(cu.claimUpdate({ home, version: "0.400.0", lockDir, now: Date.now() + 11 * 60 * 1000 }).claimed).toBe(true);
  });

  test("an unknown end state is refused", () => {
    expect(cu.markUpdate({ home: mk("cu-home-"), version: "0.400.0", state: "weird" })).toBe(false);
  });
});

describe("planCloudUpdate", () => {
  test("no thread marker: the lag is only mentioned, nothing is started or claimed", () => {
    const home = mk("cu-home-");
    expect(cu.planCloudUpdate({ home, version: "0.400.0", cloudVersion: "0.390.0", threadSeen: false, now: T0 }))
      .toMatchObject({ start: false, reason: expect.stringMatching(/harmless/) });
    expect(cu.readState(home).attempts).toEqual({});
  });

  test("the config switch off wins over everything", () => {
    const home = mk("cu-home-");
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "devops-config.json"), JSON.stringify({ cloud: { autoUpdate: false } }));
    expect(cu.switchOn(home)).toBe(false);
    expect(cu.planCloudUpdate({ home, version: "0.400.0", cloudVersion: "0.390.0", threadSeen: true, now: T0 }).start).toBe(false);
    expect(cu.readState(home).attempts).toEqual({});
  });

  test("default on: a thread marker and a lag start the update, once", () => {
    const home = mk("cu-home-");
    expect(cu.switchOn(home)).toBe(true);
    expect(cu.planCloudUpdate({ home, version: "0.400.0", cloudVersion: "0.390.0", threadSeen: true, now: T0 }).start).toBe(true);
    expect(cu.planCloudUpdate({ home, version: "0.400.0", cloudVersion: "0.390.0", threadSeen: true, now: T0 + 1000 }).start).toBe(false);
  });
});

describe("the instruction", () => {
  const text = cu.updateInstruction({ version: "0.400.0", cloudVersion: "0.390.0", script: "C:\\p\\scripts\\cloud-update.js", lang: "en" });

  test("names the steps, runs inside a turn that runs anyway, never in a thread", () => {
    expect(text).toContain("Customize → Plugins → Manage marketplaces → dotclaude");
    expect(text).toContain("Check for updates");
    expect(text).toMatch(/as part of a turn that runs anyway/);
    expect(text).toMatch(/never a turn of its own/);
    expect(text).toMatch(/Not in a Claude Project thread/);
  });

  test("never automates a login and names the one click that is left", () => {
    expect(text).toMatch(/NEVER automate a login/);
    expect(text).toMatch(/login, a captcha or a two-factor prompt/);
    expect(text).toMatch(/the exact click that is left/);
  });

  test("reports back through the bookkeeping script with forward slashes", () => {
    expect(text).toContain('node "C:/p/scripts/cloud-update.js" done 0.400.0');
    expect(text).toContain('node "C:/p/scripts/cloud-update.js" manual 0.400.0');
    expect(text).toContain('node "C:/p/scripts/cloud-update.js" release 0.400.0');
  });
});

describe("the notice: with a thread marker the lag is no longer 'unkritisch'", () => {
  function setup({ marker }) {
    const home = mk("cu-home-");
    const plugins = path.join(home, ".claude", "plugins");
    const cache = path.join(plugins, "cache", "dotclaude", "devops", "0.400.0");
    fs.mkdirSync(path.join(cache, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(path.join(cache, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "devops", version: "0.400.0" }));
    fs.writeFileSync(path.join(plugins, "installed_plugins.json"), JSON.stringify({ plugins: { "devops@dotclaude": [{ scope: "user", version: "0.400.0", installPath: cache, lastUpdated: "2026-11-20T00:00:00Z" }] } }));
    // a recorded cloud version older than the install (what a mirrored Desktop leaves)
    const rpm = path.join(mk("cu-rpm-"), "rpm", "o", "u", "plugin_x");
    fs.mkdirSync(path.join(rpm, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(path.join(rpm, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "devops", version: "0.390.0" }));
    fs.writeFileSync(path.join(path.dirname(rpm), "manifest.json"), JSON.stringify({ plugins: [{ id: "plugin_x", name: "devops", marketplaceName: "dotclaude", updatedAt: "u1" }] }));
    fs.writeFileSync(path.join(plugins, ".desktop-mirror.json"), JSON.stringify({ rpmRoot: rpm, updatedAt: "u1", cloudVersion: "0.390.0", mirrored: "0.400.0" }));
    if (marker) ts.recordThreadSeen({ home, force: true, now: T0 });
    return { home, cache, rpm };
  }

  test("without a marker the wording stays as it was", () => {
    const { home, cache } = setup({ marker: false });
    expect(versionNotice({ pluginRoot: cache, home })).toBe("ℹ devops: lokal 0.400.0 · Cloud 0.390.0 updaten, unkritisch → „Cloud updaten“");
  });

  test("with a marker 'unkritisch' is gone in both languages, the prompt stays", () => {
    const { home, cache } = setup({ marker: true });
    const de = versionNotice({ pluginRoot: cache, home });
    expect(de).toBe("ℹ devops: lokal 0.400.0 · Cloud 0.390.0 hinkt hinterher — Cloud-Threads laufen damit, nicht unkritisch → „Cloud updaten“");
    const en = versionNotice({ pluginRoot: cache, home, lang: "en" });
    expect(en).toBe('ℹ devops: local 0.400.0 · Cloud 0.390.0 is behind — cloud threads run it, so it matters → "update cloud"');
    expect(en).not.toMatch(/not urgent/);
  });

  test("the session start hands the claim to exactly one of two parallel sessions", () => {
    const { home, cache } = setup({ marker: true });
    const first = cloudUpdateBlock({ pluginRoot: cache, home, lang: "en" });
    const second = cloudUpdateBlock({ pluginRoot: cache, home, lang: "en" });
    expect(first).toContain("[ss.cloud.update]");
    expect(first).toContain("0.400.0");
    expect(second).toBeNull();
  });

  test("no marker, no claim: a Desktop-only machine is not told to click anything", () => {
    const { home, cache } = setup({ marker: false });
    expect(cloudUpdateBlock({ pluginRoot: cache, home, lang: "en" })).toBeNull();
  });
});

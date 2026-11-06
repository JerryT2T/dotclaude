import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const { skipReason, runSync, QUEUE_STALE_MS } = require("./post-ship-sync.js");
const channels = require("../../plugins/devops/hooks/lib/channels.js");

describe("skipReason — only a real, final ship syncs", () => {
  test.each(["ship-successful", "released"])("%s syncs", (variant) => {
    expect(skipReason({ toolInput: { variant } })).toBeNull();
  });

  test.each(["analysis", "ready", "ship-blocked", "aborted", "test", undefined])("%s does not sync", (variant) => {
    expect(skipReason({ toolInput: { variant } })).toBeTruthy();
  });

  test("keep mode, a backlog run and a live ship queue defer the sync", () => {
    const toolInput = { variant: "ship-successful" };
    expect(skipReason({ toolInput: { ...toolInput, state: { kept: true } } })).toMatch(/keep/);
    expect(skipReason({ toolInput, lockoutOwner: "backlog-runner" })).toMatch(/backlog/);
    expect(skipReason({ toolInput, queueAgeMs: 1000 })).toMatch(/queue/);
  });

  test("another lockout owner and a stale queue marker do not", () => {
    const toolInput = { variant: "ship-successful" };
    expect(skipReason({ toolInput, lockoutOwner: "autonomous" })).toBeNull();
    expect(skipReason({ toolInput, queueAgeMs: QUEUE_STALE_MS + 1 })).toBeNull();
  });
});

describe("runSync", () => {
  let home;
  const setClone = (version) => {
    const dir = path.join(home, ".claude", "plugins", "marketplaces", "dotclaude", "plugins", "devops", ".claude-plugin");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: "devops", version }));
  };
  const deps = (overrides) => ({
    channels: () => channels,
    remoteTags: () => ["refs/tags/alpha/v0.358.0", "refs/tags/stable/v0.330.7"],
    runUpdateHook: () => setClone("0.358.0"),
    mirror: () => ({ ok: true, from: "0.356.0", to: "0.358.0" }),
    sleep: () => {},
    ...overrides,
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "post-ship-sync-"));
    setClone("0.356.0");
    fs.writeFileSync(path.join(home, ".claude", "plugins", ".channels.json"), JSON.stringify({ dotclaude: "alpha" }));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  test("moves the install to the pinned channel's newest tag and mirrors it to Desktop", () => {
    const result = runSync({ home, deps: deps() });
    expect(result).toMatchObject({ ok: true, installed: "0.358.0", target: "0.358.0" });
    expect(result.lines.at(-1)).toContain("0.356.0 -> 0.358.0");
  });

  test("a stable pin stays on stable after an alpha ship, and that is a success", () => {
    fs.writeFileSync(path.join(home, ".claude", "plugins", ".channels.json"), JSON.stringify({ dotclaude: "stable" }));
    setClone("0.330.7");
    const result = runSync({ home, deps: deps({ runUpdateHook: () => {} }) });
    expect(result).toMatchObject({ ok: true, installed: "0.330.7", target: "0.330.7" });
  });

  test("retries a tag that has not reached the clone, then reports the miss", () => {
    let runs = 0;
    const result = runSync({ home, deps: deps({ runUpdateHook: () => { runs++; }, mirror: () => null }) });
    expect(runs).toBe(3);
    expect(result.ok).toBe(false);
    expect(result.lines.at(-1)).toMatch(/^MISS/);
  });

  test("a machine that never mirrored (no marker file) still syncs", () => {
    const missing = () => { throw Object.assign(new Error("no marker"), { code: "ENOENT" }); };
    const result = runSync({ home, deps: deps({ mirror: missing }) });
    expect(result.ok).toBe(true);
    expect(result.lines.join("\n")).not.toContain("no marker");
  });
});

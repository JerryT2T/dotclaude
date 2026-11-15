import { describe, test, expect, afterAll } from "vitest";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// Spike 2026-11-15 (protocol.md § Spike): the wake ping must only ever drop a
// marker for an armed 32-hex key, and `listen` must exit on that marker.

const CLI = path.join(__dirname, "web-guide-ping.js");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "wg-ping-"));
process.env.WEB_GUIDE_PING_DIR = root;
afterAll(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });

const ping = require("./web-guide-ping.js");
const KEY = "0123456789abcdef0123456789abcdef";

describe("web-guide-ping", () => {
  test("parseUrl accepts only claude-guide://ping/<32 hex>", () => {
    expect(ping.parseUrl(`claude-guide://ping/${KEY}/`)).toBe(KEY);
    expect(ping.parseUrl(`claude-guide://ping/${KEY}`)).toBe(KEY);
    expect(ping.parseUrl("claude-guide://ping/../../evil")).toBeNull();
    expect(ping.parseUrl(`claude-guide://other/${KEY}/`)).toBeNull();
    expect(ping.parseUrl(`claude-guide://ping/${KEY}/x`)).toBeNull();
    expect(ping.parseUrl(42)).toBeNull();
  });

  test("handle writes nothing for an unarmed key", () => {
    expect(ping.handle(`claude-guide://ping/${KEY}/`)).toBe(false);
    expect(fs.existsSync(path.join(root, "pings", `${KEY}.ping`))).toBe(false);
  });

  test("listen exits with PING once an armed key is pinged", async () => {
    const child = spawn(process.execPath, [CLI, "listen", KEY, "--hours", "0.01"], {
      env: { ...process.env, WEB_GUIDE_PING_DIR: root },
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    const armed = path.join(root, "pings", `${KEY}.armed`);
    for (let i = 0; i < 50 && !fs.existsSync(armed); i++) await new Promise((r) => setTimeout(r, 50));
    expect(ping.handle(`claude-guide://ping/${KEY}/`)).toBe(true);
    const code = await new Promise((r) => child.on("exit", r));
    expect(code).toBe(0);
    expect(out.trim()).toBe(`PING ${KEY}`);
    expect(fs.existsSync(path.join(root, "pings", `${KEY}.ping`))).toBe(false);
  }, 15000);

  test("listen exits DISARMED once the arm file is removed", async () => {
    ping.disarm(KEY); // the previous test's listener left its arm behind
    const child = spawn(process.execPath, [CLI, "listen", KEY, "--hours", "0.01"], {
      env: { ...process.env, WEB_GUIDE_PING_DIR: root },
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    const armed = path.join(root, "pings", `${KEY}.armed`);
    for (let i = 0; i < 50 && !fs.existsSync(armed); i++) await new Promise((r) => setTimeout(r, 50));
    expect(ping.disarm(KEY)).toBe(true);
    const code = await new Promise((r) => child.on("exit", r));
    expect(code).toBe(4);
    expect(out.trim()).toBe(`DISARMED ${KEY}`);
  }, 15000);
});

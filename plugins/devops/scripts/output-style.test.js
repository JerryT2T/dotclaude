import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const S = require("./output-style.js");
const SCRIPT = path.resolve(import.meta.dirname, "output-style.js");
const PLUGIN_DIR = path.resolve(import.meta.dirname, "..");

function home(settings) {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), "ostyle-home-"));
  fs.mkdirSync(path.join(h, ".claude"), { recursive: true });
  if (settings !== undefined) fs.writeFileSync(path.join(h, ".claude", "settings.json"), settings);
  return h;
}
const file = (h) => path.join(h, ".claude", "settings.json");
const read = (h) => JSON.parse(fs.readFileSync(file(h), "utf8"));

describe("output-style script", () => {
  test("get: unset and 'default' read as default, quiet in any case reads as Quiet", () => {
    expect(S.get({ home: home() }).style).toBe("default");
    expect(S.get({ home: home('{"outputStyle":"default"}') }).style).toBe("default");
    expect(S.get({ home: home('{"outputStyle":"quiet"}') }).style).toBe("Quiet");
  });

  test("set Quiet writes the user setting, keeps other keys, installs the style file, reports the change once", () => {
    const h = home('{"permissions":{"allow":["Bash"]}}');
    const r = S.set("Quiet", { home: h, pluginDir: PLUGIN_DIR });
    expect(r).toEqual({ style: "Quiet", changed: true, takesEffect: "new-session" });
    expect(read(h)).toEqual({ permissions: { allow: ["Bash"] }, outputStyle: "Quiet" });
    expect(fs.existsSync(path.join(h, ".claude", "output-styles", "quiet.md"))).toBe(true);
    expect(S.set("Quiet", { home: h, pluginDir: PLUGIN_DIR })).toEqual({ style: "Quiet", changed: false, takesEffect: null });
  });

  test("set default removes the key; nothing else changes; independent of any devops opt-out file", () => {
    const h = home('{"outputStyle":"Quiet","other":1}');
    fs.mkdirSync(path.join(h, ".claude", "devops-optout"), { recursive: true });
    fs.writeFileSync(path.join(h, ".claude", "devops-optout", "global.json"), '{"off":true}');
    expect(S.set("default", { home: h })).toMatchObject({ style: "default", changed: true });
    expect(read(h)).toEqual({ other: 1 });
    expect(fs.readFileSync(path.join(h, ".claude", "devops-optout", "global.json"), "utf8")).toBe('{"off":true}');
  });

  test("corrupt settings are never overwritten; bad style is a usage error", () => {
    const h = home("{ not json");
    expect(() => S.set("Quiet", { home: h })).toThrow();
    expect(fs.readFileSync(file(h), "utf8")).toBe("{ not json");
    expect(() => S.set("loud", { home: h })).toThrow(/Quiet or default/);
  });

  test("CLI: --json, exit codes", () => {
    const h = home();
    const env = { ...process.env, HOME: h, USERPROFILE: h };
    const run = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { env, encoding: "utf8" });
    expect(JSON.parse(run("set", "Quiet", "--json").stdout)).toMatchObject({ style: "Quiet", changed: true });
    expect(JSON.parse(run("get", "--json").stdout)).toEqual({ style: "Quiet" });
    expect(run("bogus").status).toBe(2);
    expect(run("set").status).toBe(2);
    expect(run("set", "loud").status).toBe(2);
  });
});

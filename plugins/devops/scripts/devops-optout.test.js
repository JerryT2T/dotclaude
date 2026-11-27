import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const S = require("./devops-optout.js");
const O = require("../hooks/lib/devops-optout.js");
const SCRIPT = path.resolve(import.meta.dirname, "devops-optout.js");

function world() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "oscr-home-"));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "oscr-proj-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
  return { home, proj, local: path.join(proj, ".claude", "settings.local.json"), memo: path.join(proj, ".claude", "devops-optout.json") };
}
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const ROOT = path.join(os.tmpdir(), "src-root");

describe("devops-optout script", () => {
  test("project off merges into settings.local.json, keeps other keys, never touches outputStyle, writes no memo", () => {
    const w = world();
    fs.mkdirSync(path.dirname(w.local), { recursive: true });
    fs.writeFileSync(w.local, JSON.stringify({ permissions: { allow: ["Bash"] }, outputStyle: "Quiet" }));
    S.run({ action: "off", scope: "project", cwd: w.proj, home: w.home, pluginRoot: ROOT });
    const s = read(w.local);
    expect(s.enabledPlugins["devops@dotclaude"]).toBe(false);
    expect(s.outputStyle).toBe("Quiet");
    expect(s.permissions).toEqual({ allow: ["Bash"] });
    expect(fs.readFileSync(w.local, "utf8")).toMatch(/\n$/);
    expect(fs.existsSync(w.memo)).toBe(false);
    expect(fs.existsSync(path.join(w.proj, ".claude", "settings.json"))).toBe(false);
    expect(O.resolve({ cwd: w.proj, pluginRoot: ROOT, home: w.home })).toMatchObject({ on: false, scope: "local" });
  });

  test("project off then on leaves the style and other keys exactly as they were", () => {
    const w = world();
    fs.mkdirSync(path.dirname(w.local), { recursive: true });
    fs.writeFileSync(w.local, JSON.stringify({ outputStyle: "Quiet", other: 1 }));
    S.run({ action: "off", scope: "project", cwd: w.proj, home: w.home, pluginRoot: ROOT });
    S.run({ action: "on", scope: "project", cwd: w.proj, home: w.home, pluginRoot: ROOT });
    expect(read(w.local)).toEqual({ outputStyle: "Quiet", other: 1 });
    expect(fs.existsSync(w.memo)).toBe(false);
    expect(O.resolve({ cwd: w.proj, pluginRoot: ROOT, home: w.home }).on).toBe(true);
  });

  test("migration: project on honours a memo from an older off once, then deletes it", () => {
    const w = world();
    fs.mkdirSync(path.dirname(w.local), { recursive: true });
    fs.writeFileSync(w.local, JSON.stringify({ enabledPlugins: { "devops@dotclaude": false }, outputStyle: "default" }));
    fs.writeFileSync(w.memo, JSON.stringify({ prevOutputStyle: "Quiet", hadLocalOutputStyle: true }));
    S.run({ action: "on", scope: "project", cwd: w.proj, home: w.home, pluginRoot: ROOT });
    expect(read(w.local)).toEqual({ outputStyle: "Quiet" });
    expect(fs.existsSync(w.memo)).toBe(false);
    fs.writeFileSync(w.local, JSON.stringify({ enabledPlugins: { "devops@dotclaude": false }, outputStyle: "default" }));
    fs.writeFileSync(w.memo, JSON.stringify({ prevOutputStyle: null, hadLocalOutputStyle: false }));
    S.run({ action: "on", scope: "project", cwd: w.proj, home: w.home, pluginRoot: ROOT });
    expect(read(w.local).outputStyle).toBeUndefined();
  });

  test("project on of a plain off removes our entry and leaves no outputStyle", () => {
    const w = world();
    S.run({ action: "off", scope: "project", cwd: w.proj, home: w.home, pluginRoot: ROOT });
    S.run({ action: "on", scope: "project", cwd: w.proj, home: w.home, pluginRoot: ROOT });
    expect(read(w.local).outputStyle).toBeUndefined();
    expect(read(w.local).enabledPlugins).toBeUndefined();
  });

  test("global off/on/status write only the devops-own flag, never user settings or outputStyle", () => {
    const w = world();
    const userSettings = path.join(w.home, ".claude", "settings.json");
    const before = fs.readFileSync(userSettings, "utf8");
    const g = O.globalFlagPath(w.home);
    expect(S.run({ action: "status", scope: "global", home: w.home }).state).toBe("on");
    S.run({ action: "off", scope: "global", cwd: w.proj, home: w.home, pluginRoot: ROOT });
    expect(read(g).off).toBe(true);
    expect(S.run({ action: "status", scope: "global", home: w.home }).state).toBe("off");
    expect(O.resolve({ cwd: w.proj, pluginRoot: ROOT, home: w.home })).toMatchObject({ on: false, scope: "global" });
    expect(fs.readFileSync(userSettings, "utf8")).toBe(before);
    expect(fs.existsSync(w.local)).toBe(false);
    S.run({ action: "on", scope: "global", home: w.home });
    expect(fs.existsSync(g)).toBe(false);
    expect(O.resolve({ cwd: w.proj, pluginRoot: ROOT, home: w.home }).on).toBe(true);
  });

  test("project on writes an explicit true when a team settings.json still says false", () => {
    const w = world();
    fs.mkdirSync(path.join(w.proj, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(w.proj, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": false } }));
    S.run({ action: "off", scope: "project", cwd: w.proj, home: w.home, pluginRoot: ROOT });
    S.run({ action: "on", scope: "project", cwd: w.proj, home: w.home, pluginRoot: ROOT });
    expect(read(w.local).enabledPlugins["devops@dotclaude"]).toBe(true);
    expect(O.resolve({ cwd: w.proj, pluginRoot: ROOT, home: w.home }).on).toBe(true);
  });

  test("session off/on toggles the flag file; stale flags are swept", () => {
    const w = world();
    const old = O.sessionFlagPath(w.home, "old");
    fs.mkdirSync(path.dirname(old), { recursive: true });
    fs.writeFileSync(old, "{}");
    const t = new Date(Date.now() - 9 * 86400000);
    fs.utimesSync(old, t, t);
    S.run({ action: "off", scope: "session", session: "s1", cwd: w.proj, home: w.home });
    const f = O.sessionFlagPath(w.home, "s1");
    expect(read(f).off).toBe(true);
    expect(fs.existsSync(old)).toBe(false);
    expect(S.run({ action: "status", scope: "session", session: "s1", cwd: w.proj, home: w.home }).state).toBe("off");
    S.run({ action: "on", scope: "session", session: "s1", cwd: w.proj, home: w.home });
    expect(fs.existsSync(f)).toBe(false);
  });

  test("CLI: exit codes, one line, --json", () => {
    const w = world();
    const env = { ...process.env, HOME: w.home, USERPROFILE: w.home, CLAUDE_PLUGIN_ROOT: ROOT };
    const run = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { env, encoding: "utf8" });
    const off = run("off", "--scope", "project", "--cwd", w.proj);
    expect(off.status).toBe(0);
    expect(off.stdout.trim().split("\n")).toHaveLength(1);
    expect(off.stdout).toContain("devops off (project)");
    const st = run("status", "--scope", "project", "--cwd", w.proj, "--json");
    expect(JSON.parse(st.stdout)).toMatchObject({ state: "off", resolved: "local" });
    const goff = run("off", "--scope", "global");
    expect(goff.status).toBe(0);
    expect(goff.stdout).toContain("devops off (global)");
    expect(JSON.parse(run("status", "--scope", "global", "--json").stdout)).toMatchObject({ state: "off", scope: "global" });
    expect(run("on", "--scope", "global").status).toBe(0);
    expect(run("bogus").status).toBe(2);
    expect(run("off", "--scope", "session", "--cwd", w.proj).status).toBe(2);
  });
});

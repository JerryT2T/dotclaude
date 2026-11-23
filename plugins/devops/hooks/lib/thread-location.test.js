import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lib = require("./thread-location.js");
const cfg = require("./devops-config.js");
const SCRIPT = require.resolve("../../scripts/thread-location.js");

const tmp = [];
function mkHome(channel = "alpha") {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "thread-location-")));
  tmp.push(d);
  // the script is gated by the channel feature `project-threads` (alpha)
  fs.mkdirSync(path.join(d, ".claude", "plugins"), { recursive: true });
  if (channel) fs.writeFileSync(path.join(d, ".claude", "plugins", ".channels.json"), JSON.stringify({ dotclaude: channel }));
  return d;
}
afterEach(() => {
  while (tmp.length) fs.rmSync(tmp.pop(), { recursive: true, force: true });
});

function seen(home, projects, projectNames) {
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "devops-thread-seen.json"), JSON.stringify({ projects, ...(projectNames ? { projectNames } : {}) }));
}
function run(home, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe("schema", () => {
  test("values mirror the lib; both keys are global-only", () => {
    expect([...cfg.SCHEMA.threadLocation.default.values]).toEqual([...lib.VALUES]);
    expect(cfg.SCHEMA.threadLocation.default.default).toBe(lib.DEFAULT);
    expect(cfg.SCHEMA.threadLocation.default.globalOnly).toBe(true);
    expect(cfg.SCHEMA.threadLocation.projects).toMatchObject({ type: "list", globalOnly: true });
    expect(lib.BLOCK_VERSION).toBe(1);
  });
});

describe("read / effective / set", () => {
  test("default is local-first, source default", () => {
    const home = mkHome();
    expect(lib.read({ home })).toEqual({ global: "local-first", projects: {} });
    expect(lib.effective("chan_a", { home })).toEqual({ value: "local-first", source: "default" });
  });

  test("global value, then a project exception, then inherit removes it", () => {
    const home = mkHome();
    lib.set("ask", {}, { home });
    expect(lib.effective("chan_a", { home })).toEqual({ value: "ask", source: "global" });
    lib.set("local-only", { project: "chan_a" }, { home });
    expect(lib.effective("chan_a", { home })).toEqual({ value: "local-only", source: "project" });
    expect(lib.effective("chan_b", { home }).value).toBe("ask");
    lib.set("cloud-first", { project: "chan_b" }, { home });
    lib.set("inherit", { project: "chan_a" }, { home });
    expect(lib.read({ home }).projects).toEqual({ chan_b: "cloud-first" });
    lib.set("inherit", { project: "chan_b" }, { home });
    expect(lib.read({ home }).projects).toEqual({});
    const file = JSON.parse(fs.readFileSync(path.join(home, ".claude", "devops-config.json"), "utf8"));
    expect(file.threadLocation).toEqual({ default: "ask" });
  });

  test("refuses unknown values and malformed ids; ignores bad stored entries", () => {
    const home = mkHome();
    expect(() => lib.set("maybe", {}, { home })).toThrow(/valid: local-first, local-only, cloud-first, ask/);
    expect(() => lib.set("inherit", {}, { home })).toThrow(/valid: local-first/);
    expect(() => lib.set("ask", { project: "abc" }, { home })).toThrow(/malformed/);
    expect(() => lib.set("nope", { project: "chan_a" }, { home })).toThrow(/valid:/);
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "devops-config.json"), JSON.stringify({ threadLocation: { default: "bogus", projects: ["chan_a=ask", "chan_b=nope", "xyz=ask", "chan_c"] } }));
    expect(lib.read({ home })).toEqual({ global: "local-first", projects: { chan_a: "ask" } });
  });

  test("a project file cannot set it (global-only)", () => {
    const home = mkHome();
    const cwd = mkHome();
    fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".claude", "devops-config.json"), JSON.stringify({ threadLocation: { default: "ask" } }));
    expect(lib.read({ home, cwd }).global).toBe("local-first");
  });
});

describe("marker / block (single source: the snippet doc)", () => {
  test("marker per value", () => {
    expect(lib.marker("local-first")).toBe("devops local-first, v1");
    expect(lib.marker("ask")).toBe("devops ask, v1");
    expect(lib.marker("cloud-first")).toBeNull();
  });

  test("each block starts with its marker line; cloud-first has none", () => {
    for (const v of ["local-first", "local-only", "ask"]) {
      const b = lib.block(v);
      expect(b.split("\n")[0]).toBe(`Where threads run (${lib.marker(v)})`);
      expect(b).not.toMatch(/[—;]/);
    }
    expect(lib.block("cloud-first")).toBeNull();
    expect(lib.block("local-first")).toContain('"Cloud thread: computer not reachable."');
    expect(lib.block("local-first")).toContain("temporary");
    expect(lib.block("local-only")).toMatch(/start nothing in the cloud/);
    expect(lib.block("ask")).toMatch(/on my computer or in the cloud/);
  });

  test("a doc without the block gives null; pluginRoot is honoured", () => {
    const root = mkHome();
    fs.mkdirSync(path.join(root, "deep-knowledge"));
    fs.writeFileSync(path.join(root, "deep-knowledge", "project-instructions-snippet.md"), "```\nplain\n```\n");
    expect(lib.block("local-first", { pluginRoot: root })).toBeNull();
  });
});

describe("scripts/thread-location.js end to end", () => {
  test("list --json: seen projects, names, exceptions", () => {
    const home = mkHome();
    seen(home, { chan_a: "2026-11-22T10:00:00Z" }, { chan_a: "Jerry" });
    expect(run(home, "set", "local-only", "--project", "chan_z").code).toBe(0);
    const r = run(home, "list", "--json");
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out);
    expect(d).toMatchObject({ default: "local-first", global: "local-first", blockVersion: 1 });
    expect(d.values).toEqual([
      { id: "local-first", label: "Local first" },
      { id: "local-only", label: "Local only" },
      { id: "cloud-first", label: "Cloud first" },
      { id: "ask", label: "Ask each time" },
    ]);
    expect(d.projects).toEqual([
      { id: "chan_a", name: "Jerry", value: "local-first", source: "default" },
      { id: "chan_z", name: "", value: "local-only", source: "project" },
    ]);
  });

  test("the script is gated: exit 126 where the feature project-threads is not on the channel", () => {
    const r = run(mkHome(null), "list", "--json");
    expect(r.code).toBe(126);
    expect(r.out).toBe("");
  });

  test("name: gives a project its display name, keeps the other maps, refuses bad input", () => {
    const home = mkHome();
    const file = path.join(home, ".claude", "devops-thread-seen.json");
    fs.writeFileSync(file, JSON.stringify({ firstSeen: "2026-11-22T10:00:00Z", lastSeen: "2026-11-22T10:00:00Z", projects: { chan_a: "2026-11-22T10:00:00Z" }, blockChecked: { chan_a: "local-first@v1" } }));
    const r = run(home, "name", "chan_a", "Verse", "Companion", "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).projects).toEqual([{ id: "chan_a", name: "Verse Companion", value: "local-first", source: "default" }]);
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(stored.projects).toEqual({ chan_a: "2026-11-22T10:00:00Z" });
    expect(stored.blockChecked).toEqual({ chan_a: "local-first@v1" });
    expect(run(home, "name", "nope", "X").code).toBe(1);
    expect(run(home, "name", "chan_a").code).toBe(1);
  });

  test("list tolerates a missing seen file", () => {
    expect(JSON.parse(run(mkHome(), "list", "--json").out).projects).toEqual([]);
  });

  test("set writes the global value and prints the list data", () => {
    const home = mkHome();
    const r = run(home, "set", "ask", "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).global).toBe("ask");
    expect(run(home, "set", "inherit", "--project", "chan_q").code).toBe(0);
  });

  test("set refuses bad input with exit 1 naming the valid values", () => {
    const home = mkHome();
    for (const args of [["set", "sometimes"], ["set", "inherit"], ["set", "ask", "--project", "nope"], ["set"]]) {
      const r = run(home, ...args);
      expect(r.code).toBe(1);
      expect(r.err).toContain("local-first");
    }
    expect(run(home, "bogus").code).toBe(1);
  });

  test("block prints the text, --json the structure, cloud-first the removal note", () => {
    const home = mkHome();
    const plain = run(home, "block");
    expect(plain.code).toBe(0);
    expect(plain.out.split("\n")[0]).toBe("Where threads run (devops local-first, v1)");
    run(home, "set", "ask", "--project", "chan_a");
    const j = JSON.parse(run(home, "block", "--project", "chan_a", "--json").out);
    expect(j).toMatchObject({ value: "ask", source: "project", marker: "devops ask, v1" });
    expect(j.block.split("\n")[0]).toBe("Where threads run (devops ask, v1)");
    run(home, "set", "cloud-first");
    const c = run(home, "block", "--json");
    expect(JSON.parse(c.out)).toEqual({ value: "cloud-first", source: "global", marker: null, block: null });
    const cp = run(home, "block");
    expect(cp.code).toBe(0);
    expect(cp.out).toMatch(/remove the "Where threads run" block/);
  });
});

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const O = require("./devops-optout.js");

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
function world() {
  const home = tmp("optout-home-");
  const proj = tmp("optout-proj-");
  fs.mkdirSync(path.join(proj, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  return { home, proj };
}
const put = (file, enabledPlugins) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ enabledPlugins }));
};
const userF = (w) => path.join(w.home, ".claude", "settings.json");
const projF = (w) => path.join(w.proj, ".claude", "settings.json");
const localF = (w) => path.join(w.proj, ".claude", "settings.local.json");

const copies = {
  cache: (w) => path.join(w.home, ".claude", "plugins", "cache", "dotclaude", "devops", "1.0.0"),
  synced: (w) => path.join(w.home, ".claude", "plugins", "synced", "org_acct", "devops~g2"),
  rpm: (w) => path.join(w.home, "AppData", "Local", "Claude-Data", "x", "rpm", "abc", "plugin_01"),
  "plugin-dir": () => path.join(os.tmpdir(), "src-plugins-devops"),
};
const K = "devops@dotclaude";

// [label, setup, on for the cache copy, on for every other copy, deciding scope]
const rows = [
  ["user on only", (w) => put(userF(w), { [K]: true }), true, true, "user"],
  ["user on + project false", (w) => { put(userF(w), { [K]: true }); put(projF(w), { [K]: false }); }, false, false, "project"],
  ["user on + project false + local true", (w) => { put(userF(w), { [K]: true }); put(projF(w), { [K]: false }); put(localF(w), { [K]: true }); }, true, true, "local"],
  ["user on + local false", (w) => { put(userF(w), { [K]: true }); put(localF(w), { [K]: false }); }, false, false, "local"],
  ["no entry anywhere", () => {}, false, true, null],
];

describe("resolve() matrix: copy x settings", () => {
  for (const [copy, rootOf] of Object.entries(copies)) {
    for (const [label, setup, onCache, onOther, scope] of rows) {
      test(`${copy} / ${label}`, () => {
        const w = world();
        setup(w);
        const r = O.resolve({ cwd: w.proj, pluginRoot: rootOf(w), home: w.home });
        expect(r.on).toBe(copy === "cache" ? onCache : onOther);
        if (scope) expect(r.scope).toBe(scope);
        else expect(r.scope).toBe(copy === "cache" ? "none" : "adhoc");
      });
    }
    test(`${copy} / session flag beats everything`, () => {
      const w = world();
      put(userF(w), { [K]: true });
      put(localF(w), { [K]: true });
      const f = O.sessionFlagPath(w.home, "sess-1");
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify({ off: true }));
      expect(O.resolve({ cwd: w.proj, sessionId: "sess-1", pluginRoot: rootOf(w), home: w.home })).toMatchObject({ on: false, scope: "session" });
      expect(O.resolve({ cwd: w.proj, sessionId: "other", pluginRoot: rootOf(w), home: w.home }).on).toBe(true);
    });
  }
});

describe("resolve() global flag (Alle Projekte)", () => {
  const flag = (w, o = { off: true }) => {
    fs.mkdirSync(path.dirname(O.globalFlagPath(w.home)), { recursive: true });
    fs.writeFileSync(O.globalFlagPath(w.home), JSON.stringify(o));
  };
  test.each(Object.keys(copies))("global flag silences a %s copy, whatever the settings say", (copy) => {
    const w = world();
    put(userF(w), { [K]: true });
    put(localF(w), { [K]: true });
    flag(w);
    const r = O.resolve({ cwd: w.proj, pluginRoot: copies[copy](w), home: w.home });
    expect(r).toMatchObject({ on: false, scope: "global" });
    expect(O.optedOut({ cwd: w.proj, pluginRoot: copies[copy](w), home: w.home })).toBe(true);
  });
  test("session flag wins over global, no flag leaves the settings in charge", () => {
    const w = world();
    flag(w);
    const sf = O.sessionFlagPath(w.home, "s1");
    fs.mkdirSync(path.dirname(sf), { recursive: true });
    fs.writeFileSync(sf, "{}");
    expect(O.resolve({ cwd: w.proj, sessionId: "s1", home: w.home }).scope).toBe("session");
    expect(O.resolve({ cwd: w.proj, sessionId: "s2", home: w.home }).scope).toBe("global");
    fs.unlinkSync(O.globalFlagPath(w.home));
    put(userF(w), { [K]: true });
    expect(O.resolve({ cwd: w.proj, home: w.home })).toMatchObject({ on: true, scope: "user" });
  });
});

describe("resolve() edge cases", () => {
  test("cwd in a subdirectory of a git repo uses the repo-root settings", () => {
    const w = world();
    fs.mkdirSync(path.join(w.proj, ".git"));
    put(localF(w), { [K]: false });
    const sub = path.join(w.proj, "a", "b");
    fs.mkdirSync(sub, { recursive: true });
    expect(O.resolve({ cwd: sub, pluginRoot: copies.synced(w), home: w.home })).toMatchObject({ on: false, scope: "local" });
  });

  test("corrupt JSON is skipped, never read as off", () => {
    const w = world();
    fs.writeFileSync(localF(w), "{ not json");
    put(projF(w), { [K]: true });
    expect(O.resolve({ cwd: w.proj, pluginRoot: copies.cache(w), home: w.home })).toMatchObject({ on: true, scope: "project" });
    fs.writeFileSync(projF(w), "");
    expect(O.resolve({ cwd: w.proj, pluginRoot: copies.synced(w), home: w.home })).toMatchObject({ on: true, scope: "adhoc" });
  });

  test("legacy keys count as devops keys", () => {
    const w = world();
    const off = (key) => { put(projF(w), { [key]: false }); return O.resolve({ cwd: w.proj, pluginRoot: copies.synced(w), home: w.home }).on; };
    expect(off("dotclaude-dev-ops@dotclaude-dev-ops")).toBe(false);
    expect(off("dotclaude-dev-ops@Jerry0022")).toBe(false);
    expect(off("devops@my-dotclaude-fork")).toBe(false);
    expect(off("devops@other-market")).toBe(true);
  });

  test("several devops keys in one file: any false wins", () => {
    const w = world();
    put(projF(w), { [K]: true, "dotclaude-dev-ops@Jerry0022": false });
    expect(O.resolve({ cwd: w.proj, pluginRoot: copies.cache(w), home: w.home }).on).toBe(false);
  });

  test("false only in settings.json (project) silences despite user true", () => {
    const w = world();
    put(userF(w), { [K]: true });
    put(projF(w), { [K]: false });
    expect(O.resolve({ cwd: w.proj, pluginRoot: copies.synced(w), home: w.home })).toMatchObject({ on: false, scope: "project" });
  });

  test("a non-boolean value is no decision", () => {
    const w = world();
    put(projF(w), { [K]: "no" });
    expect(O.resolve({ cwd: w.proj, pluginRoot: copies.synced(w), home: w.home }).scope).toBe("adhoc");
  });

  test("optedOut: explicit off only; a bare cache copy is not opted out", () => {
    const w = world();
    expect(O.optedOut({ cwd: w.proj, pluginRoot: copies.cache(w), home: w.home })).toBe(false);
    put(localF(w), { [K]: false });
    expect(O.optedOut({ cwd: w.proj, pluginRoot: copies.cache(w), home: w.home })).toBe(true);
  });

  test("isDevopsKey", () => {
    expect(O.isDevopsKey("devops@dotclaude")).toBe(true);
    expect(O.isDevopsKey("other@dotclaude")).toBe(false);
    expect(O.isDevopsKey(5)).toBe(false);
  });
});

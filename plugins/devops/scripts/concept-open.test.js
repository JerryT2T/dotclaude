import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const { prepare, verify, buildLaunch } = require("./concept-open.js");

const HTML = "docs/concepts/2026-01-01-demo.html";
let tmp;
let prevEnv;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "concept-open-"));
  prevEnv = process.env.CONCEPT_BRIDGE_REGISTRY_DIR;
  process.env.CONCEPT_BRIDGE_REGISTRY_DIR = path.join(tmp, "registry");
  fs.mkdirSync(path.join(tmp, "proj", "docs", "concepts"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "proj", HTML), "<html></html>");
});
afterEach(() => {
  if (prevEnv === undefined) delete process.env.CONCEPT_BRIDGE_REGISTRY_DIR;
  else process.env.CONCEPT_BRIDGE_REGISTRY_DIR = prevEnv;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("prepare", () => {
  test("writes state, returns contract with launch commands", () => {
    const r = prepare({ cwd: path.join(tmp, "proj"), html: HTML });
    expect(r.port).toBeGreaterThanOrEqual(8700);
    expect(r.owner).toMatch(/^[0-9a-f]{8}$/);
    expect(r.url).toBe(`http://localhost:${r.port}/${HTML}`);
    const st = JSON.parse(fs.readFileSync(r.state, "utf8"));
    expect(st).toMatchObject({ port: r.port, html_path: HTML, slug: "demo", owner: r.owner });
    expect(r.launch.server).toContain(`concept-server.py" ${r.port} `);
    expect(r.launch.server).toContain(`--html "${HTML}"`);
    expect(r.launch.pulser).toContain("--mode pulse");
    expect(r.launch.waker).toContain("--mode watch");
    expect(r.launch.waker).toContain(`--owner ${r.owner}`);
    expect(r.launch.waker).toContain("concept-watch.js");
  });

  test("rejects missing html, escaping paths and missing args", () => {
    const cwd = path.join(tmp, "proj");
    expect(() => prepare({ cwd, html: "docs/nope.html" })).toThrow(/not found/);
    expect(() => prepare({ cwd, html: "../x.html" })).toThrow(/relative/);
    expect(() => prepare({ cwd })).toThrow(/--cwd/);
  });
});

function fakeBridge({ advance = true, pageStatus = 200 } = {}) {
  let ts = 1000;
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith("/heartbeat")) {
      if (req.method === "POST" && advance) ts += 5;
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ claude_ts: ts }));
    }
    if (req.url.startsWith("/identity")) return res.end(JSON.stringify({ pid: 4242 }));
    res.statusCode = pageStatus;
    res.end("x");
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(srv)));
}

function stateFor(port) {
  const f = path.join(tmp, "state.json");
  fs.writeFileSync(f, JSON.stringify({ port, html_path: HTML }));
  return f;
}

const never = () => { throw new Error("must not open"); };

describe("verify", () => {
  test("ok: heartbeat advances, page 200, injected open called once", async () => {
    const srv = await fakeBridge();
    try {
      const opened = [];
      const r = await verify({ state: stateFor(srv.address().port) }, { openBrowser: (u) => { opened.push(u); return null; }, waitMs: 0 });
      expect(r.ok).toBe(true);
      expect(opened).toEqual([r.url]);
    } finally { srv.close(); }
  });

  test("a second verify on the same bridge run opens no second tab", async () => {
    const srv = await fakeBridge();
    try {
      const opened = [];
      const deps = { openBrowser: (u) => { opened.push(u); return null; }, waitMs: 0 };
      const state = stateFor(srv.address().port);
      await verify({ state }, deps);
      const again = await verify({ state }, deps);
      expect(again).toMatchObject({ ok: true, already_open: true });
      expect(opened).toHaveLength(1);
      // A restarted bridge is a new run: the page opens again.
      const st = JSON.parse(fs.readFileSync(state, "utf8"));
      fs.writeFileSync(state, JSON.stringify({ ...st, opened_for_run: 12345 }));
      await verify({ state }, deps);
      expect(opened).toHaveLength(2);
    } finally { srv.close(); }
  });

  test("fails when claude_ts does not advance", async () => {
    const srv = await fakeBridge({ advance: false });
    try {
      const r = await verify({ state: stateFor(srv.address().port) }, { openBrowser: never, waitMs: 0 });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/did not advance/);
    } finally { srv.close(); }
  });

  test("fails on 404 without opening", async () => {
    const srv = await fakeBridge({ pageStatus: 404 });
    try {
      const r = await verify({ state: stateFor(srv.address().port) }, { openBrowser: never, waitMs: 0 });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/HTTP 404/);
    } finally { srv.close(); }
  });

  test("fails when no bridge answers", async () => {
    const r = await verify({ state: stateFor(1) }, { openBrowser: never, waitMs: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/does not answer/);
  });

  test("fails on unreadable state", async () => {
    const r = await verify({ state: path.join(tmp, "missing.json") }, { openBrowser: never, waitMs: 0 });
    expect(r.ok).toBe(false);
  });
});

test("buildLaunch quotes paths and uses forward slashes", () => {
  const l = buildLaunch({ port: 8800, cwd: "C:\\a b", html: "d/x.html", state: "C:/a b/.claude/concept-active.json", owner: "ab12cd34" });
  expect(l.server).toContain('8800 "C:/a b" --html "d/x.html"');
});

// #1030: verify owns the open on the fast path — the docs must not tell the
// model to run the manual `start msedge` on top of it (page opened twice).
describe("the real open in its own process", () => {
  const SCRIPT = path.join(import.meta.dirname, "concept-open.js");
  const launcher = (code) => [process.execPath, "-e", code];

  // Runs in a fresh node process: inside vitest other handles keep the event loop
  // alive, which is exactly what hid the silent exit.
  function runChild(body, env = {}) {
    return new Promise((resolve) => {
      const c = spawn(process.execPath, ["-e", `
        const { verify, openBrowser } = require(${JSON.stringify(SCRIPT)});
        (async () => { ${body} })();
      `], { env: { ...process.env, CONCEPT_OPEN_NO_BROWSER: "", ...env }, windowsHide: true });
      let out = "";
      c.stdout.on("data", (d) => { out += d; });
      c.on("exit", (code) => resolve({ code, out }));
    });
  }

  test("openBrowser resolves after the launcher exits", async () => {
    const cmd = JSON.stringify(launcher("setTimeout(() => {}, 300)"));
    const r = await runChild(`const e = await openBrowser("u", { command: ${cmd} }); console.log("RESOLVED", e);`);
    expect(r.out).toContain("RESOLVED null");
  }, 20000);

  test("a launcher failure is reported, not swallowed", async () => {
    const cmd = JSON.stringify(launcher("process.exit(7)"));
    const r = await runChild(`const e = await openBrowser("u", { command: ${cmd} }); console.log("RESOLVED", e);`);
    expect(r.out).toMatch(/RESOLVED .*exited with 7/);
  }, 20000);

  test("a launcher that never exits does not hold the opener", async () => {
    const cmd = JSON.stringify(launcher("setTimeout(() => {}, 15000)"));
    const started = Date.now();
    const r = await runChild(`const e = await openBrowser("u", { command: ${cmd}, settleMs: 200 }); console.log("RESOLVED", e); process.exit(0);`);
    expect(r.out).toContain("RESOLVED null");
    expect(Date.now() - started).toBeLessThan(12000);
  }, 20000);

  test("verify prints its result, stamps the run, and a second verify opens nothing", async () => {
    let ts = 1;
    const srv = http.createServer((req, res) => {
      if (req.method === "POST") ts++;
      if (req.url === "/identity") return res.end(JSON.stringify({ pid: 4242 }));
      if (req.url === "/heartbeat") return res.end(JSON.stringify({ claude_ts: ts }));
      res.end("ok");
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const state = path.join(tmp, "state.json");
    const marker = path.join(tmp, "opened.log");
    fs.writeFileSync(state, JSON.stringify({ port: srv.address().port, html_path: HTML }));
    const cmd = JSON.stringify(launcher(`require("fs").appendFileSync(${JSON.stringify(marker)}, "x")`));
    const body = `
      const res = await verify({ state: ${JSON.stringify(state)} }, { openBrowser: (u) => openBrowser(u, { command: ${cmd} }), waitMs: 0 });
      console.log(JSON.stringify(res));
    `;
    try {
      const first = await runChild(body);
      expect(JSON.parse(first.out)).toMatchObject({ ok: true });
      expect(JSON.parse(fs.readFileSync(state, "utf8")).opened_for_run).toBe(4242);
      const second = await runChild(body);
      expect(JSON.parse(second.out)).toMatchObject({ ok: true, already_open: true });
      expect(fs.readFileSync(marker, "utf8")).toBe("x");
    } finally {
      await new Promise((r) => srv.close(r));
    }
  }, 30000);
});

describe("docs name one owner of the open", () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  test("step3-open-browser.md and SKILL.md say verify opens Edge itself", () => {
    expect(read("skills/auto-concept/deep-knowledge/step3-open-browser.md")).toMatch(/Fast path → no manual open \(#1030\)/);
    expect(read("skills/auto-concept/SKILL.md")).toMatch(/Exactly one open \(#1030\)/);
  });
});

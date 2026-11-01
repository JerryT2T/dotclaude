import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";

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

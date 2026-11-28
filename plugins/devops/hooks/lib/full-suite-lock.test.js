import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lock = require("./full-suite-lock.js");
const { main: guard } = require("../pre-tool-use/pre.test.fullguard.js");
const { main: release } = require("../post-tool-use/post.test.release.js");

let dir, file;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "fsl-")); file = path.join(dir, "full-suite.lock"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const A = { sessionId: "a", toolUseId: "t1", cwd: "/a" };
const B = { sessionId: "b", toolUseId: "t2", cwd: "/b" };
const NOW = 1_000_000_000_000;

describe("full-suite-lock", () => {
  test("first run takes it, a second session is blocked with holder info", () => {
    expect(lock.acquire(A, { file, now: NOW })).toEqual({ ok: true });
    const r = lock.acquire(B, { file, now: NOW + 5 * 60_000 });
    expect(r.ok).toBe(false);
    expect(r.holder.sessionId).toBe("a");
    const msg = lock.blockMessage(r.holder, NOW + 5 * 60_000);
    expect(msg).toMatch(/session a in \/a/);
    expect(msg).toMatch(/~5 min/);
    expect(msg).toMatch(/npx vitest run <paths>/);
  });
  test("same session may re-run", () => {
    lock.acquire(A, { file, now: NOW });
    expect(lock.acquire({ ...A, toolUseId: "t9" }, { file, now: NOW + 1000 })).toEqual({ ok: true });
  });
  test("a stale holder is taken over", () => {
    lock.acquire(A, { file, now: NOW });
    expect(lock.acquire(B, { file, now: NOW + lock.LOCK_TTL_MS + 1 })).toEqual({ ok: true });
    expect(lock.acquire(A, { file, now: NOW + lock.LOCK_TTL_MS + 2 }).ok).toBe(false);
  });
  test("release only by the holding tool call; then others may run", () => {
    lock.acquire(A, { file, now: NOW });
    expect(lock.release(B, { file })).toBe(false);
    expect(lock.release({ ...A, toolUseId: "other" }, { file })).toBe(false);
    expect(lock.release(A, { file })).toBe(true);
    expect(existsSync(file)).toBe(false);
    expect(lock.acquire(B, { file, now: NOW })).toEqual({ ok: true });
  });
  test("a corrupt lock file is taken over", () => {
    require("node:fs").writeFileSync(file, "{nope");
    expect(lock.acquire(A, { file })).toEqual({ ok: true });
  });
});

describe("fullguard + release wiring", () => {
  const hook = (sid, tid, command = "npm test", extra = {}) => ({ tool_name: "Bash", session_id: sid, tool_use_id: tid, cwd: "/x", tool_input: { command, ...extra } });
  const mk = () => ({ acquire: (w) => lock.acquire(w, { file }), release: (w) => lock.release(w, { file }), blockMessage: lock.blockMessage });
  const deps = () => ({ isActive: () => false, lock: mk() });

  test("second session blocked, filtered run and bypass pass, release frees it", () => {
    expect(guard(hook("a", "t1"), deps())).toBeNull();
    const r = guard(hook("b", "t2"), deps());
    expect(r.block).toMatch(/holds the machine lock/);
    expect(guard(hook("b", "t3", "npx vitest run a.test.js"), deps())).toBeNull();
    expect(guard(hook("b", "t4", "DEVOPS_ALLOW_FULL_SUITE=1 npm test"), deps())).toBeNull();
    release(hook("a", "t1"), { lock: mk() });
    expect(guard(hook("b", "t2"), deps())).toBeNull();
  });
  test("a background run is not released by PostToolUse", () => {
    expect(guard(hook("a", "t1", "npm test", { run_in_background: true }), deps())).toBeNull();
    release(hook("a", "t1", "npm test", { run_in_background: true }), { lock: mk() });
    expect(guard(hook("b", "t2"), deps()).block).toMatch(/machine lock/);
  });
});

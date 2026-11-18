/**
 * #1151 — a hard dispatcher end leaves a trace:
 *   - one `stuck` telemetry record per stuck module (dispatch.test.js);
 *   - on a guarded lane a per-session marker;
 *   - stop.hook.hardend blocks the next stop once with "hook failure, not the user";
 *   - prompt.hook.hardend says it once when no stop consumed it;
 *   - the held-back call's own text names the cancelled siblings.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const H = require("./hook-hardend.js");
const { recordHardEnd, HARD_END_TEXT } = require("../dispatch/dispatch.js");
const stop = require("../stop/stop.hook.hardend.js");
const prompt = require("../user-prompt-submit/prompt.hook.hardend.js");

let dir;
let env;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hardend-"));
  env = { DEVOPS_HOOK_HARDEND_DIR: dir };
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const hardend = () => ({ ...H, write: (o) => H.write(o, env), consume: (id, o = {}) => H.consume(id, { ...o, env }) });
const result = (o = {}) => ({
  guarded: true, sessionId: "s-1", tool: "Write",
  results: [{ name: "pre.slow.guard", stuck: true, ms: 1500 }, { name: "pre.other", stuck: false, ms: 3 }],
  ...o,
});

describe("recordHardEnd", () => {
  test("names the stuck modules", () => {
    expect(recordHardEnd("PreToolUse", result({ guarded: false }), { hardend: hardend() })).toEqual(["pre.slow.guard"]);
  });

  test("leaves the session marker on a guarded lane only", () => {
    recordHardEnd("PostToolUse", result({ guarded: false }), { hardend: hardend() });
    expect(fs.readdirSync(dir)).toEqual([]);
    recordHardEnd("PreToolUse", result(), { hardend: hardend() });
    expect(JSON.parse(fs.readFileSync(path.join(dir, "s-1.json"), "utf8"))).toMatchObject({ event: "PreToolUse", tool: "Write", modules: ["pre.slow.guard"] });
  });

  test("the held-back call's text names the cancelled siblings as no refusal", () => {
    expect(HARD_END_TEXT).toMatch(/Send the same call again/);
    expect(HARD_END_TEXT).toMatch(/The user doesn't want to take this action/);
    expect(HARD_END_TEXT).toMatch(/user declined nothing/);
  });
});

describe("consumers", () => {
  test("stop blocks once, then never again", () => {
    H.write({ sessionId: "s-1", event: "PreToolUse", tool: "Write", modules: ["pre.slow.guard"] }, env);
    const first = stop.main({ session_id: "s-1" }, { hardend: hardend() });
    expect(first.block).toMatch(/hook failure \(PreToolUse · Write, stuck module pre\.slow\.guard\), not by the user/);
    expect(stop.main({ session_id: "s-1" }, { hardend: hardend() })).toBeNull();
    expect(prompt.main({ session_id: "s-1" }, { hardend: hardend() })).toBeNull();
  });

  test("stop leaves the marker alone on stop_hook_active and in a subagent", () => {
    H.write({ sessionId: "s-1", event: "PreToolUse", modules: [] }, env);
    expect(stop.main({ session_id: "s-1", stop_hook_active: true }, { hardend: hardend() })).toBeNull();
    expect(stop.main({ session_id: "s-1", agent_id: "a" }, { hardend: hardend() })).toBeNull();
    expect(prompt.main({ session_id: "s-1" }, { hardend: hardend() }).context).toMatch(/not by the user/);
    expect(prompt.main({ session_id: "s-1" }, { hardend: hardend() })).toBeNull();
  });

  test("a marker of another session or older than a day says nothing", () => {
    H.write({ sessionId: "s-2", event: "PreToolUse", modules: [] }, env);
    expect(stop.main({ session_id: "s-1" }, { hardend: hardend() })).toBeNull();
    H.write({ sessionId: "s-1", event: "PreToolUse", modules: [], now: Date.now() - H.MAX_AGE_MS - 1000 }, env);
    expect(stop.main({ session_id: "s-1" }, { hardend: hardend() })).toBeNull();
    expect(fs.existsSync(path.join(dir, "s-1.json"))).toBe(false);
  });
});

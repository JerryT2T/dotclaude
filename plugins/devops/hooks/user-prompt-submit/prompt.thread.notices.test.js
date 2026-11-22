/** prompt.thread.notices — SessionStart notices stay out of a thread; Desktop and terminal sessions are untouched. */
import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hook from "./prompt.thread.notices.js";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "prompt.thread.notices.js");
const run = (payload) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: "utf8" });

describe("decide", () => {
  test("thread with the feature, first time -> the one-line instruction", () => {
    expect(hook.decide({ mode: "on", said: false })).toBe(hook.LINE);
    expect(hook.LINE).toMatch(/Do not post them into this thread/);
  });
  test("thread already told -> silent", () => {
    expect(hook.decide({ mode: "on", said: true })).toBeNull();
  });
  test("Desktop / terminal session (mode off) and feature-off thread (quiet) -> silent", () => {
    expect(hook.decide({ mode: "off", said: false })).toBeNull();
    expect(hook.decide({ mode: "quiet", said: false })).toBeNull();
  });
});

describe("process", () => {
  test("a typed Desktop prompt prints nothing", () => {
    const r = run({ session_id: "thread-notices-desktop", prompt: "hello", cwd: process.cwd() });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});

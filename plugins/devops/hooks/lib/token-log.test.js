import { describe, test, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TL = require("./token-log.js");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "token-log-test-"));
afterAll(() => { fs.rmSync(TMP, { recursive: true, force: true }); });
const logFile = (name) => path.join(TMP, `${name}.jsonl`);
const lines = (file) => fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const ctx = (text) => JSON.stringify({ hookSpecificOutput: { additionalContext: text } });

describe("modelChars — what one module handed the model", () => {
  test("additionalContext, a block reason, a deny reason", () => {
    expect(TL.modelChars("PostToolUse", { stdout: ctx("abcd") })).toBe(4);
    expect(TL.modelChars("Stop", { stdout: JSON.stringify({ decision: "block", reason: "xyz" }) })).toBe(3);
    expect(TL.modelChars("PreToolUse", { stdout: JSON.stringify({ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "no" } }) })).toBe(2);
  });

  test("plain stdout counts only where it is model context; exit 2 counts stderr", () => {
    expect(TL.modelChars("UserPromptSubmit", { stdout: "hello\n" })).toBe(5);
    expect(TL.modelChars("PostToolUse", { stdout: "hello" })).toBe(0);
    expect(TL.modelChars("PreToolUse", { code: 2, stderr: " blocked " })).toBe(7);
  });
});

describe("recordEvent", () => {
  test("writes one line with per-hook chars and the tool result size, prints nothing", () => {
    const file = logFile("basic");
    const rec = TL.recordEvent("PostToolUse", { session_id: "s1", tool_name: "Bash", tool_response: { stdout: "x".repeat(100) } },
      [{ name: "post.a", stdout: ctx("12345") }, { name: "post.b", stdout: "" }], { allowed: true, file });
    expect(rec).not.toBeNull();
    const [line] = lines(file);
    expect(line).toMatchObject({ v: 1, sid: "s1", event: "PostToolUse", ctx: 5, hooks: { "post.a": 5 }, tool: "Bash" });
    expect(line.result).toBeGreaterThan(100);
    expect(line.hooks).not.toHaveProperty("post.b");
  });

  test("not allowed (beta/stable) → nothing is written", () => {
    const file = logFile("gated");
    expect(TL.recordEvent("PostToolUse", { tool_name: "Bash", tool_response: "x" }, [{ name: "a", stdout: ctx("z") }], { allowed: false, file })).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
  });

  test("an event that handed the model nothing writes no line", () => {
    const file = logFile("empty");
    expect(TL.recordEvent("PreToolUse", { tool_name: "Read" }, [{ name: "a", stdout: "" }], { allowed: true, file })).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
  });

  test("never throws, also on garbage input", () => {
    expect(() => TL.recordEvent("Stop", null, null, { allowed: true, file: logFile("garbage") })).not.toThrow();
    expect(() => TL.recordEvent("Stop", { transcript_path: path.join(TMP, "missing.jsonl"), session_id: "x" }, [{}], { allowed: true, file: logFile("garbage") })).not.toThrow();
  });

  test("off by default under vitest — the user's real file is never touched", () => {
    expect(TL.filePath()).toBeNull();
  });
});

describe("usage per turn (Stop)", () => {
  const assistant = (uuid, id, usage, extra = {}) => JSON.stringify({ type: "assistant", uuid, message: { id, usage }, ...extra });
  const u = (i, o) => ({ input_tokens: i, cache_read_input_tokens: 100, cache_creation_input_tokens: 10, output_tokens: o });

  test("usageSince sums main-thread calls once per message id, after the given uuid", () => {
    const text = [
      assistant("a1", "m1", u(1, 5)),
      assistant("a2", "m2", u(2, 6)),
      assistant("a3", "m2", u(2, 6)), // same API call, second content block
      assistant("s1", "m9", u(50, 50), { isSidechain: true }),
      assistant("a4", "m3", u(3, 7)),
    ].join("\n");
    const all = TL.usageSince(text, null);
    expect(all.sum).toEqual({ calls: 3, input: 6, cacheRead: 300, cacheWrite: 30, output: 18 });
    expect(all.last).toBe("a4");
    expect(TL.usageSince(text, { uuid: "a3" }).sum).toMatchObject({ calls: 1, input: 3, output: 7 });
  });

  test("a marker that left the tail counts only calls newer than its timestamp", () => {
    const text = [
      assistant("b1", "n1", u(1, 1), { timestamp: "2026-11-01T10:00:00.000Z" }),
      assistant("b2", "n2", u(2, 2), { timestamp: "2026-11-01T10:05:00.000Z" }),
    ].join("\n");
    const r = TL.usageSince(text, { uuid: "gone", ts: "2026-11-01T10:01:00.000Z" });
    expect(r.sum).toMatchObject({ calls: 1, input: 2 });
    expect(r.lastTs).toBe("2026-11-01T10:05:00.000Z");
  });

  test("two Stops of one session count each call once", () => {
    const prev = { TMP: process.env.TMP, TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR };
    process.env.TMP = TMP; process.env.TEMP = TMP; process.env.TMPDIR = TMP;
    try {
      const file = logFile("stop");
      const tx = path.join(TMP, "tx.jsonl");
      const sid = `tl-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tx, `${assistant("a1", "m1", u(1, 5))}\n`);
      TL.recordEvent("Stop", { session_id: sid, transcript_path: tx }, [], { allowed: true, file });
      fs.appendFileSync(tx, `${assistant("a2", "m2", u(2, 6))}\n`);
      TL.recordEvent("Stop", { session_id: sid, transcript_path: tx }, [], { allowed: true, file });
      TL.recordEvent("Stop", { session_id: sid, transcript_path: tx }, [], { allowed: true, file });
      const recs = lines(file);
      expect(recs.map((r) => r.usage && r.usage.calls)).toEqual([1, 1]);
      expect(recs[1].usage.output).toBe(6);
    } finally {
      for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
});

describe("cap", () => {
  test("a file over the cap drops its oldest half before the next append", () => {
    const file = logFile("cap");
    const old = `${JSON.stringify({ v: 1, old: true, pad: "x".repeat(200) })}\n`;
    fs.writeFileSync(file, old.repeat(Math.ceil((TL.MAX_BYTES + 1000) / old.length)));
    TL.recordEvent("PostToolUse", { tool_name: "Bash", tool_response: "y" }, [{ name: "a", stdout: ctx("z") }], { allowed: true, file });
    expect(fs.statSync(file).size).toBeLessThan(TL.MAX_BYTES * 0.6);
    expect(lines(file).at(-1)).toMatchObject({ event: "PostToolUse", ctx: 1 });
  });
});

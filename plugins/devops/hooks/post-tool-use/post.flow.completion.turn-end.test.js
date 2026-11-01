import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Pins the card reminder model (post.flow.completion header, 0.34.0): per
// prompt ONE turn-start line (dynamic args) and at most ONE turn-end line when
// the turn signals its end (wrap_up / every plan item done) — never after a
// card, never twice, and no static rule text in either.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(__dirname, "post.flow.completion.js");
const require = createRequire(import.meta.url);

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "completion-turnend-"));
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"),
    JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
  fs.mkdirSync(path.join(dir, ".tmp"), { recursive: true });
  return dir;
}

function transcript(dir, ...uuids) {
  const p = path.join(dir, "t.jsonl");
  fs.writeFileSync(p, uuids.map((u) => JSON.stringify({ type: "user", uuid: u, message: { role: "user", content: "do " + u } })).join("\n") + "\n");
  return p;
}

function run(dir, sid, toolName, toolInput, tp) {
  const tmp = path.join(dir, ".tmp");
  for (let attempt = 0; ; attempt++) {
    const res = spawnSync(process.execPath, [HOOK], {
      cwd: dir,
      input: JSON.stringify({ tool_name: toolName, tool_input: toolInput, session_id: sid, cwd: dir, transcript_path: tp }),
      encoding: "utf8",
      env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp, DOTCLAUDE_CARD_HARD_STOP: "0" },
    });
    if (res.status !== null || attempt >= 3) {
      const raw = res.stdout || "";
      try { return JSON.parse(raw).hookSpecificOutput.additionalContext || ""; } catch { return raw; }
    }
  }
}

const count = (texts, re) => texts.reduce((n, t) => n + (t.match(re) || []).length, 0);
const START = /COMPLETION CARD/g;
const END = /\[completion-flow\] (Turn ending|Last plan step done)/g;

describe("post.flow.completion — card reminder model", () => {
  test("turnEndSignal: wrap_up, all-done TodoWrite / update_plan; nothing else", () => {
    const { turnEndSignal } = require("./post.flow.completion.js");
    expect(turnEndSignal("mcp__ccd_turn__wrap_up", {})).toBe("wrap_up");
    expect(turnEndSignal("TodoWrite", { todos: [{ status: "completed" }, { status: "completed" }] })).toBe("plan");
    expect(turnEndSignal("TodoWrite", { todos: [{ status: "completed" }, { status: "in_progress" }] })).toBeNull();
    expect(turnEndSignal("TodoWrite", { todos: [] })).toBeNull();
    expect(turnEndSignal("mcp__ccd_turn__update_plan", { steps: [{ title: "a", status: "done" }] })).toBe("plan");
    expect(turnEndSignal("mcp__ccd_turn__update_plan", { steps: [{ title: "a", status: "pending" }] })).toBeNull();
    expect(turnEndSignal("Read", { file_path: "x" })).toBeNull();
  });

  test("one turn: exactly one start line and one end line, however many calls and signals", () => {
    const dir = project();
    const sid = "s-model-1";
    const tp = transcript(dir, "u1");
    const outs = [
      run(dir, sid, "Read", { file_path: path.join(dir, "a.js") }, tp),
      run(dir, sid, "Grep", { pattern: "x" }, tp),
      run(dir, sid, "TodoWrite", { todos: [{ content: "a", status: "completed" }] }, tp),
      run(dir, sid, "mcp__ccd_turn__wrap_up", {}, tp),
      run(dir, sid, "Read", { file_path: path.join(dir, "b.js") }, tp),
    ];
    expect(count(outs, START)).toBe(1);
    expect(count(outs, END)).toBe(1);
    // Timing: the start line rides the first call, the end line the first end signal.
    expect(outs[0]).toMatch(START);
    expect(outs[2]).toMatch(/Last plan step done/);
    expect(outs[3]).toBe("");
    // The end line carries the call's dynamic args only — no static rules.
    expect(outs[2]).toContain(`session_id:"${sid}"`);
    expect(outs[2]).not.toMatch(/VERBATIM|variant|pending|validation/i);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("a new prompt earns the end line again; a rendered card suppresses it", () => {
    const dir = project();
    const sid = "s-model-2";
    let tp = transcript(dir, "u1");
    run(dir, sid, "Read", { file_path: path.join(dir, "a.js") }, tp);
    expect(run(dir, sid, "mcp__ccd_turn__wrap_up", {}, tp)).toMatch(/Turn ending/);
    tp = transcript(dir, "u1", "u2");
    fs.writeFileSync(path.join(dir, ".tmp", `dotclaude-devops-card-rendered-${sid}`), String(Date.now()));
    expect(run(dir, sid, "mcp__ccd_turn__wrap_up", {}, tp)).not.toMatch(END);
    fs.rmSync(path.join(dir, ".tmp", `dotclaude-devops-card-rendered-${sid}`));
    expect(run(dir, sid, "mcp__ccd_turn__wrap_up", {}, tp)).toMatch(/Turn ending/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("the turn-start line repeats no tool-description rule", () => {
    const dir = project();
    const out = run(dir, "s-model-3", "Read", { file_path: path.join(dir, "a.js") }, transcript(dir, "u1"));
    expect(out).toMatch(START);
    expect(out).not.toMatch(/never connected/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

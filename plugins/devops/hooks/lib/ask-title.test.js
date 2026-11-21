import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ask-title — a question asked mid-turn left ⏳ on the title while the
 * session waited for the user (2026-10-25). The pre hook refuses the
 * question once until the title says Question; the post hook restores ⏳.
 */

const require = createRequire(import.meta.url);
const ask = require("./ask-title.js");
const PRE = fileURLToPath(new URL("../pre-tool-use/pre.ask.title.js", import.meta.url));
const POST = fileURLToPath(new URL("../post-tool-use/post.ask.title.js", import.meta.url));

const SOLO = "⏳ ➜ 🤖 Solo ┃ ";
const SUB = "🔗 ";
const NL2 = String.fromCharCode(10, 10);
const SHIP = "⏳ ➜ 🚀 Shipping ┃ ";
const Q = "👉 ➜ ❓ Question ┃ ";
const SET = "mcp__ccd_session_mgmt__set_session_title";
const START = "mcp__ccd_session__start_session";

const title = (t) => JSON.stringify({ type: "custom-title", customTitle: t, sessionId: "s" });
const prompt = (text) => JSON.stringify({ type: "user", message: { content: text } });
const toolUse = (name, input, id) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const result = (id, text) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: text }] } });

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-title-"));
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
});
afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
});

function run(hookFile, lines, extra = {}) {
  const transcript = path.join(dir, "t.jsonl");
  fs.writeFileSync(transcript, lines.join("\n") + "\n");
  const payload = { tool_name: "AskUserQuestion", tool_use_id: "q1", transcript_path: transcript, session_id: "s", cwd: dir, ...extra };
  return spawnSync(process.execPath, [hookFile], { cwd: dir, input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, HOME: dir, USERPROFILE: dir } });
}

describe("startSessionInput — the new session shows ⏳ from its first moment", () => {
  const base = { initiation: "user_asked", title: "Fix login", prompt: "p" };

  test("a local user_asked start gets the head and a name free of it", () => {
    // user_asked counts as handoff: the head carries the sub marker and the brief the marker.
    expect(ask.startSessionInput(base)).toEqual({ ...base, title: SUB + SOLO + "Fix login", name: "fix-login", prompt: "p" + NL2 + "[devops:handoff]" });
    expect(ask.startSessionInput({ ...base, target: "local" }).title).toBe(SUB + SOLO + "Fix login");
    expect(ask.startSessionInput({ ...base, name: "mine" }).name).toBe("mine");
  });

  test("an unmarked card, a remote session or a marked title stays as it is", () => {
    for (const input of [
      { ...base, initiation: "own_initiative" },
      { proposal_id: "t1" },
      { proposal_id: "t1", initiation: "own_initiative", title: "Fix" },
      { ...base, target: "cloud" },
      { ...base, target: "ssh", host: "box" },
      { ...base, preset: "usual" },
      { ...base, title: SUB + SOLO + "Fix" },
      { ...base, title: "  " },
      null,
    ]) expect(ask.startSessionInput(input), JSON.stringify(input)).toBeNull();
  });

  // Claude Code 2.1.300 validates a hook's updatedInput like the model's own
  // input: an unknown key is dropped, an input the tool rejects denies the
  // call. `title` and `name` are properties of mcp__ccd_session__start_session
  // (schema read 2026-11-16: name is [a-z0-9-], at most 24 characters).
  test("the rewritten input adds nothing but a schema-conform name", () => {
    const long = { ...base, title: "Rebuild the Whole Billing Export & its 3 Reports, again" };
    for (const input of [base, long]) {
      const out = ask.startSessionInput(input);
      expect(Object.keys(out).filter((k) => !(k in input))).toEqual(["name"]);
      expect(Object.keys(out).filter((k) => !["title", "name", "prompt"].includes(k) && out[k] !== input[k])).toEqual([]);
      expect(out.name).toMatch(/^[a-z0-9]([a-z0-9-]{0,22}[a-z0-9])?$/);
      expect(typeof out.title).toBe("string");
    }
  });

  test("a title without latin letters leaves the name to the app", () => {
    expect(ask.startSessionInput({ ...base, title: "⏱" }).name).toBeUndefined();
  });
});

describe("questionTitle / restoredTitle", () => {
  test("⏳ Solo → Question, keeps the topic", () => {
    expect(ask.questionTitle(SOLO + "Fix X")).toBe(Q + "Fix X");
  });
  test("already a question, a batch, or unknown → leave it", () => {
    expect(ask.questionTitle(Q + "Fix X")).toBeNull();
    expect(ask.questionTitle("👉 ➜ 📚 Batch ┃ Fix X")).toBeNull();
    expect(ask.questionTitle(null)).toBeNull();
  });
  test("restore keeps a running ship's head, else Solo", () => {
    expect(ask.restoredTitle(Q + "Fix X", SHIP + "Fix X")).toBe(SHIP + "Fix X");
    expect(ask.restoredTitle(Q + "Fix X", SOLO + "Fix X")).toBe(SOLO + "Fix X");
    expect(ask.restoredTitle(Q + "Fix X", "👉 ➜ 📦 Ready ┃ Fix X")).toBe(SOLO + "Fix X");
    expect(ask.restoredTitle(SOLO + "Fix X", null)).toBeNull();
  });
});

describe("isBlockingCall", () => {
  test("question, plan approval and asking starts block; own_initiative does not", () => {
    expect(ask.isBlockingCall("AskUserQuestion", {})).toBe(true);
    expect(ask.isBlockingCall("ExitPlanMode", {})).toBe(true);
    expect(ask.isBlockingCall(START, { initiation: "user_asked" })).toBe(true);
    expect(ask.isBlockingCall(START, { initiation: "offer" })).toBe(true);
    expect(ask.isBlockingCall(START, { initiation: "own_initiative" })).toBe(false);
    expect(ask.isBlockingCall(START, { proposal_id: "p1" })).toBe(false);
    expect(ask.isBlockingCall("Bash", {})).toBe(false);
  });
  test("a devops Home pane press waits on nobody, even as user_asked", () => {
    const background = "Started from the devops Home pane by the person pressing its button; no other context belongs to this session.";
    expect(ask.isBlockingCall(START, { initiation: "user_asked", background })).toBe(false);
    expect(ask.isBlockingCall(START, { initiation: "user_asked", background: "Claude started this" })).toBe(true);
  });
});

describe("pre.ask.title", () => {
  test("start_session approval on a ⏳ title → refused (Backlog run, 2026-10-25)", () => {
    const r = run(PRE, [prompt("go"), title(SOLO + "Backlog")], { tool_name: START, tool_input: { initiation: "user_asked" } });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(JSON.stringify(Q + "Backlog"));
  });
  test("a start that passes the gate puts the ⏳ head on the new session's title", () => {
    const input = { initiation: "user_asked", title: "Fix login", prompt: "p" };
    const r = run(PRE, [prompt("go"), title(SOLO + "Backlog"), toolUse(SET, { session_id: "self", title: Q + "Backlog" }, "t1")], { tool_name: START, tool_input: input });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    expect(out.hookEventName).toBe("PreToolUse");
    expect(out.updatedInput).toEqual({ ...input, title: SUB + SOLO + "Fix login", name: "fix-login", prompt: "p" + NL2 + "[devops:handoff]" });
  });
  test("own_initiative start_session without marker → silent", () => {
    const r = run(PRE, [prompt("go"), title(SOLO + "Backlog")], { tool_name: START, tool_input: { initiation: "own_initiative" } });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
  test("⏳ title, no set call → refused with the exact set call", () => {
    const r = run(PRE, [prompt("go"), title(SOLO + "Fix X"), toolUse("AskUserQuestion", {}, "q1")]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(ask.MARKER);
    expect(r.stderr).toContain(JSON.stringify(Q + "Fix X"));
  });
  test("set call to the question title in the same message → passes", () => {
    const r = run(PRE, [prompt("go"), title(SOLO + "Fix X"), toolUse(SET, { session_id: "self", title: Q + "Fix X" }, "t1"), toolUse("AskUserQuestion", {}, "q1")]);
    expect(r.status).toBe(0);
  });
  test("refused once this turn → the repeat passes (no loop)", () => {
    const r = run(PRE, [prompt("go"), title(SOLO + "Fix X"), toolUse("AskUserQuestion", {}, "q0"), result("q0", ask.refusalText(Q + "Fix X")), toolUse("AskUserQuestion", {}, "q1")]);
    expect(r.status).toBe(0);
  });
  test("a refusal from an earlier turn does not count", () => {
    const r = run(PRE, [prompt("a"), title(SOLO + "Fix X"), result("q0", ask.refusalText(Q + "Fix X")), prompt("b"), toolUse("AskUserQuestion", {}, "q1")]);
    expect(r.status).toBe(2);
  });
  test("a set call before an earlier question does not cover the next one", () => {
    const r = run(PRE, [prompt("go"), title(SOLO + "Fix X"), toolUse(SET, { title: Q + "Fix X" }, "t1"), toolUse("AskUserQuestion", {}, "q0"), toolUse("AskUserQuestion", {}, "q1")]);
    expect(r.status).toBe(2);
  });
  test("unknown title (no Desktop app) → silent", () => {
    const r = run(PRE, [prompt("go"), toolUse("AskUserQuestion", {}, "q1")]);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
  });
  test("inside a subagent → silent", () => {
    const r = run(PRE, [prompt("go"), title(SOLO + "Fix X")], { agent_id: "a1" });
    expect(r.status).toBe(0);
  });
});

describe("post.ask.title", () => {
  test("answered → restore the ⏳ head the title had before", () => {
    const r = run(POST, [prompt("go"), title(SHIP + "Fix X"), title(Q + "Fix X")]);
    expect(r.status).toBe(0);
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    expect(ctx).toContain(JSON.stringify(SHIP + "Fix X"));
  });
  test("title not on Question → silent", () => {
    const r = run(POST, [prompt("go"), title(SOLO + "Fix X")]);
    expect(r.stdout).toBe("");
  });
});

describe("🔗 start head for every linked start (round 6 rows 12, 13)", () => {
  const brief = "Do it" + NL2 + "[devops:handoff]";
  test("row 13: a marked proposal / offer / proposal_id start carries 🔗 ⏳ ➜ 🤖 Solo from the start", () => {
    for (const initiation of ["own_initiative", "offer", "user_asked", undefined]) {
      const input = { initiation, title: "Dismantle", prompt: brief, ...(initiation ? {} : { proposal_id: "p1" }) };
      const out = ask.startSessionInput(input);
      expect(out.title, String(initiation)).toBe(SUB + SOLO + "Dismantle");
      expect(out.prompt).toBe(brief);
    }
  });
  test("a deliver brief marks the sub too and keeps its own marker", () => {
    const out = ask.startSessionInput({ initiation: "offer", title: "Part", prompt: "x" + NL2 + "[devops:deliver]" });
    expect(out.title).toBe(SUB + SOLO + "Part");
    expect(out.prompt).toBe("x" + NL2 + "[devops:deliver]");
  });
  test("row 12: an unmarked own_initiative start stays unlinked (no input rewrite, no 🔗)", () => {
    expect(ask.startSessionInput({ initiation: "own_initiative", title: "Side", prompt: "p" })).toBeNull();
  });
  test("an unmarked offer is the user's own task: linked as handoff, 🔗 ⏳ head from the start", () => {
    const out = ask.startSessionInput({ initiation: "offer", title: "Side" });
    expect(out.title).toBe(SUB + SOLO + "Side");
    expect(ask.startSessionInput({ initiation: "offer", title: "Side", prompt: "p" }).prompt).toBe("p" + NL2 + "[devops:handoff]");
  });
  test("a linked start without a title (proposal_id only) cannot carry a head", () => {
    expect(ask.startSessionInput({ proposal_id: "p1", initiation: "user_asked", prompt: "p" })).toBeNull();
  });
  test("the 🔗 head is clamped by the topic, never the head", () => {
    const out = ask.startSessionInput({ initiation: "user_asked", title: "Rebuild the Whole Billing Export and its Reports", prompt: "p" });
    expect(out.title.startsWith(SUB + SOLO)).toBe(true);
    expect(cp(out.title.slice((SUB + SOLO).length))).toBeLessThanOrEqual(42 - 4 - 3 - 2);
  });
  test("a question and its restore keep exactly one leading 🔗", () => {
    const q = ask.questionTitle(SUB + SOLO + "X");
    expect(q).toBe(SUB + Q + "X");
    expect(ask.restoredTitle(q, SUB + SOLO + "X")).toBe(SUB + SOLO + "X");
    expect(ask.questionTitle(SOLO + "X")).toBe(Q + "X");
  });
});
const cp = (s) => Array.from(s).length;

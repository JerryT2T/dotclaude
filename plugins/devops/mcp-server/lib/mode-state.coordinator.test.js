/** C7 — the one status line to the coordinator after a thread's card: the coordinator comes from the session's own relay, never invented. */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { coordinatorSession, coordinatorStatusInstruction } from "./mode-state.js";

let home;
const SID = "c7-thread-session";

function transcript(lines) {
  const dir = path.join(home, ".claude", "projects", "P--Projects");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${SID}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}
const relayPrompt = (from, session) => ({
  type: "user",
  message: { role: "user", content: `<project_claude_message from="${from}">\n<relay from="${from}" session="${session}" reason="spawn">\n<note>go</note>\n</relay>\n</project_claude_message>` },
});

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), "c7-")); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

describe("coordinatorSession", () => {
  test("the newest coordinator relay names the session", () => {
    transcript([relayPrompt("coordinator", "session_01OLD"), relayPrompt("coordinator", "session_01NEW")]);
    expect(coordinatorSession(SID, undefined, { home })).toBe("session_01NEW");
  });
  test("a relay from another thread is no coordinator", () => {
    transcript([relayPrompt("coordinator", "session_01COORD"), relayPrompt("thread-b", "session_01OTHER")]);
    expect(coordinatorSession(SID, undefined, { home })).toBe("session_01COORD");
  });
  test("no relay, no transcript, a malformed id -> null (nothing invented)", () => {
    transcript([{ type: "user", message: { role: "user", content: "hello" } }]);
    expect(coordinatorSession(SID, undefined, { home })).toBeNull();
    expect(coordinatorSession("no-such-session", undefined, { home })).toBeNull();
    transcript([relayPrompt("coordinator", "x\"><evil")]);
    expect(coordinatorSession(SID, undefined, { home })).toBeNull();
  });
});

describe("coordinatorStatusInstruction", () => {
  test("addresses bridge:cse_<id>, one line, silent on refusal", () => {
    const t = coordinatorStatusInstruction("session_01ABC");
    expect(t).toMatch(/SendMessage to "bridge:cse_01ABC"/);
    expect(t).toMatch(/skip silently/);
  });
  test("unknown coordinator -> no instruction at all (also the Desktop path: no relay ever)", () => {
    expect(coordinatorStatusInstruction(null)).toBe("");
    expect(coordinatorStatusInstruction("")).toBe("");
    expect(coordinatorStatusInstruction("session_01; rm")).toBe("");
  });
});

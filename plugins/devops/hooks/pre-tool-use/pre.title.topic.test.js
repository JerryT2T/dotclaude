import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * pre.title.topic — the model's own session-title topic is at most 20
 * characters (d-len l20). A status-prefix swap that keeps the existing topic
 * (every other title hook's call) must never be refused.
 */

const require = createRequire(import.meta.url);
const hook = require("./pre.title.topic.js");
const HOOK = fileURLToPath(new URL("./pre.title.topic.js", import.meta.url));

const SET = "mcp__ccd_session_mgmt__set_session_title";
const SOLO = "⏳ ➜ 🤖 Solo ┃ ";
const CONCEPT = "⏳ ➜ 🧭 Concept ┃ ";
const BATCH = "👉 ➜ 📥 Batch ┃ ";
const LONG = "Anmeldung nach dem Update kaputt";

const title = (t) => JSON.stringify({ type: "custom-title", customTitle: t, sessionId: "s" });
const prompt = (text) => JSON.stringify({ type: "user", message: { content: text } });
const result = (id, text) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: text }] } });

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "title-topic-"));
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
});
afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
});

function run(lines, newTitle, extra = {}) {
  const transcript = path.join(dir, "t.jsonl");
  fs.writeFileSync(transcript, lines.join("\n") + "\n");
  const payload = { tool_name: SET, tool_use_id: "u1", tool_input: { session_id: "self", title: newTitle }, transcript_path: transcript, session_id: "s", cwd: dir, ...extra };
  return spawnSync(process.execPath, [HOOK], { cwd: dir, input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, HOME: dir, USERPROFILE: dir } });
}

describe("pre.title.topic", () => {
  test("a NEW topic longer than 20 characters is refused with the reason and the length", () => {
    const r = run([prompt("go"), title(SOLO + "Fix login")], SOLO + LONG);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(hook.MARKER);
    expect(r.stderr).toContain(`«${LONG}»`);
    expect(r.stderr).toContain(`${Array.from(LONG).length} characters`);
    expect(r.stderr).toContain("limit is 20");
  });

  test("exactly 20 characters passes", () => {
    expect(run([prompt("go"), title(SOLO + "Fix login")], SOLO + "x".repeat(20)).status).toBe(0);
  });

  test("the trap: a status swap that keeps a 21-character topic is never refused", () => {
    const topic = "Feedback zu dotclaude";
    expect(Array.from(topic)).toHaveLength(21);
    expect(run([prompt("go"), title(CONCEPT + topic)], SOLO + topic).status).toBe(0);
    expect(run([prompt("go"), title(CONCEPT + topic)], "👉 ➜ ❓ Question ┃ " + topic).status).toBe(0);
  });

  test("the app's own long title on the first prompt: a shortened topic passes, a changed long one is refused", () => {
    const app = "Warum zwei verschiedene Anmeldungen";
    expect(run([prompt("go"), title(SOLO + app)], SOLO + "Doppelte Anmeldung").status).toBe(0);
    expect(run([prompt("go"), title(SOLO + app)], SOLO + app + "!").status).toBe(2);
  });

  test("the same topic refused earlier passes the repeat (no loop)", () => {
    const lines = [prompt("go"), title(SOLO + "Fix login"), result("u0", hook.refusalText(LONG))];
    expect(run(lines, SOLO + LONG).status).toBe(0);
    expect(run(lines, SOLO + LONG + " 2").status).toBe(2);
  });

  test("silent: unknown current title, no head, batch, subagent, other tool", () => {
    expect(run([prompt("go")], SOLO + LONG).status).toBe(0);
    expect(run([prompt("go"), title(SOLO + "Fix")], LONG + " plain title").status).toBe(0);
    expect(run([prompt("go"), title(SOLO + "Fix")], "⏳ " + LONG).status).toBe(0);
    expect(run([prompt("go"), title(SOLO + "Fix")], BATCH + LONG).status).toBe(0);
    expect(run([prompt("go"), title(SOLO + "Fix")], SOLO + LONG, { agent_id: "a1" }).status).toBe(0);
    expect(run([prompt("go"), title(SOLO + "Fix")], SOLO + LONG, { tool_name: "Bash" }).status).toBe(0);
  });

  test("main() returns the block for a refused call and null otherwise", () => {
    const transcript = path.join(dir, "m.jsonl");
    fs.writeFileSync(transcript, [prompt("go"), title(SOLO + "Fix")].join("\n") + "\n");
    expect(hook.main({ tool_name: SET, tool_input: { title: SOLO + LONG }, transcript_path: transcript }).block).toContain(hook.MARKER);
    expect(hook.main({ tool_name: SET, tool_input: { title: SOLO + "Short" }, transcript_path: transcript })).toBeNull();
  });
});

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// A Claude Projects thread on this computer: a normal Claude Code session whose
// prompts arrive in a <wake> envelope and whose only visible output is what the
// mcp__hearthbot__ tools post. Shapes below follow a real thread transcript
// (2026-11-21); ids are made up.
const require = createRequire(import.meta.url);
const pt = require("./project-thread.js");

const PLUGIN_ROOT = path.resolve(__dirname, "..", "..");
const ALPHA = { features: { pluginRoot: PLUGIN_ROOT, channel: "alpha" } };
const STABLE = { features: { pluginRoot: PLUGIN_ROOT, channel: "stable" } };

const wake = (text, reason = "mention") =>
  `<wake reason="${reason}" current-time="2026-11-21T21:51:27Z">\n  <project id="chan_01TESTTESTTEST" type="project">\n` +
  `    <message trigger="true" from="human" trust="principal" author-id="user_01TEST" id="cmsg_01TEST" sent-at="2026-11-21T21:51:15Z" mention="true">${text}</message>\n` +
  "  </project>\n</wake>\n";
const RELAY = '<relay from="coordinator" session="session_01TEST" current-time="2026-11-21T21:52:05Z" reason="spawn">\n  <note>Rename the folders.</note>\n</relay>';

const RUN = `${process.pid}-${Date.now().toString(36)}`;
const sid = (name) => `pt-test-${RUN}-${name}`;
let dir;

function transcriptFile(name, entries) {
  const file = path.join(dir, name + ".jsonl");
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return file;
}
const rename = (title, extra = {}) => ({
  type: "assistant",
  ...extra,
  message: { role: "assistant", content: [{ type: "tool_use", id: "t" + Math.random(), name: "mcp__hearthbot__rename_thread", input: { title } }] },
});

beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "project-thread-")); });
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const f of fs.readdirSync(os.tmpdir())) {
    if (f.includes(`pt-test-${RUN}-`)) try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch { /* best effort */ }
  }
});

describe("project-thread — prompt shapes", () => {
  test("a wake envelope is a thread prompt; typed text, notifications and a quoted wake are not", () => {
    expect(pt.isWakePrompt(wake("rename the folders"))).toBe(true);
    expect(pt.isWakePrompt("  \n" + wake("x"))).toBe(true);
    expect(pt.isWakePrompt("rename the folders")).toBe(false);
    expect(pt.isWakePrompt("<task-notification>done</task-notification>")).toBe(false);
    expect(pt.isWakePrompt("look at this: " + wake("x"))).toBe(false);
    expect(pt.isWakePrompt('<wake reason="mention"><thread ts="x"></thread></wake>')).toBe(false);
    expect(pt.isWakePrompt(undefined)).toBe(false);
  });

  test("a coordinator note is a relay, not the person's prompt", () => {
    expect(pt.isRelayPrompt(RELAY)).toBe(true);
    expect(pt.isRelayPrompt("<coordinator-relay>\n<relay from=\"coordinator\"></relay></coordinator-relay>")).toBe(true);
    expect(pt.isRelayPrompt('<project_claude_message from="coordinator">x</project_claude_message>')).toBe(true);
    expect(pt.isRelayPrompt(wake("x"))).toBe(false);
    expect(pt.isRelayPrompt("relay this to the team")).toBe(false);
  });

  test("personWords returns the triggering message, entities decoded", () => {
    expect(pt.personWords(wake("ship"))).toBe("ship");
    expect(pt.personWords(wake("a &lt;b&gt; &amp; &quot;c&quot;"))).toBe('a <b> & "c"');
    expect(pt.personWords("ship")).toBe("");
    expect(pt.personWords('<wake reason="x"><project id="chan_1" type="project"></project></wake>')).toBe("");
  });

  test("checklistComplete: steps exist and every one is done", () => {
    expect(pt.checklistComplete("Rename\n\n✓ found\n✓ checked")).toBe(true);
    expect(pt.checklistComplete("Rename\n\n✓ found\n✱ checking")).toBe(false);
    expect(pt.checklistComplete("Rename\n\n○ find")).toBe(false);
    expect(pt.checklistComplete("Just a header")).toBe(false);
    expect(pt.checklistComplete(undefined)).toBe(false);
  });
});

describe("project-thread — detection and mode", () => {
  test("a wake prompt marks the session; later calls without evidence still see the thread", () => {
    const id = sid("wake");
    expect(pt.isThread({ session_id: id, tool_name: "Bash" })).toBe(false);
    expect(pt.isThread({ session_id: id, prompt: wake("x") })).toBe(true);
    expect(pt.isMarked(id)).toBe(true);
    expect(pt.isThread({ session_id: id, tool_name: "Bash" })).toBe(true);
    expect(pt.isThread({ session_id: id })).toBe(true);
  });

  test("a hearthbot tool call marks the session too", () => {
    const id = sid("tool");
    expect(pt.isThread({ session_id: id, tool_name: "mcp__hearthbot__post_message" })).toBe(true);
    expect(pt.isMarked(id)).toBe(true);
  });

  test("one session's marker never answers for another", () => {
    pt.markThread(sid("mine"));
    expect(pt.isThread({ session_id: sid("other"), tool_name: "Bash" })).toBe(false);
  });

  test("deep: the transcript's own projectsUserTurn entry counts, a quoted one does not", () => {
    const real = transcriptFile("real", [
      { type: "queue-operation", operation: "enqueue" },
      { type: "user", projectsUserTurn: true, message: { role: "user", content: wake("x") } },
    ]);
    const quoted = transcriptFile("quoted", [
      { type: "user", message: { role: "user", content: "why does this entry say \"projectsUserTurn\":true ? " + wake("x") } },
      { type: "user", message: { role: "user", content: [{ type: "tool_result", content: '{"type":"user","projectsUserTurn":true}' }] } },
    ]);
    expect(pt.transcriptSaysThread(real)).toBe(true);
    expect(pt.transcriptSaysThread(quoted)).toBe(false);
    expect(pt.transcriptSaysThread(path.join(dir, "missing.jsonl"))).toBe(false);

    const id = sid("deep");
    expect(pt.isThread({ session_id: id, transcript_path: real })).toBe(false);
    expect(pt.isThread({ session_id: id, transcript_path: real }, { deep: true })).toBe(true);
    expect(pt.isMarked(id)).toBe(true);
    expect(pt.isThread({ session_id: sid("deep-quoted"), transcript_path: quoted }, { deep: true })).toBe(false);
  });

  test("mode: off outside a thread, quiet without the feature, on with it", () => {
    expect(pt.threadMode({ session_id: sid("plain"), prompt: "hello" }, ALPHA)).toBe("off");
    expect(pt.threadMode({ session_id: sid("alpha"), prompt: wake("x") }, ALPHA)).toBe("on");
    expect(pt.threadMode({ session_id: sid("stable"), prompt: wake("x") }, STABLE)).toBe("quiet");
    expect(pt.enabled({ pluginRoot: PLUGIN_ROOT, channel: "beta" })).toBe(false);
  });

  test("malformed input never throws", () => {
    expect(pt.isThread(null)).toBe(false);
    expect(pt.isThread("x")).toBe(false);
    expect(pt.threadMode(undefined, ALPHA)).toBe("off");
  });
});

describe("project-thread — the thread's title", () => {
  test("lastThreadTitle is the newest rename_thread of the main thread", () => {
    const file = transcriptFile("titles", [
      { type: "user", projectsUserTurn: true, message: { role: "user", content: wake("x") } },
      rename("⏳ ➜ 🤖 Solo ┃ Rename the project folders"),
      rename("⏳ ➜ 🤖 Solo ┃ From a subagent", { isSidechain: true }),
      { type: "user", message: { role: "user", content: 'the tool "mcp__hearthbot__rename_thread" was quoted here' } },
      rename("👉 ➜ 📊 Analysis ┃ Rename the project folders"),
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "done" }] } },
    ]);
    expect(pt.lastThreadTitle(file)).toBe("👉 ➜ 📊 Analysis ┃ Rename the project folders");
  });

  test("never renamed, missing transcript or an empty title → null", () => {
    const none = transcriptFile("none", [{ type: "user", message: { role: "user", content: wake("x") } }]);
    expect(pt.lastThreadTitle(none)).toBeNull();
    expect(pt.lastThreadTitle(path.join(dir, "missing.jsonl"))).toBeNull();
    expect(pt.lastThreadTitle(undefined)).toBeNull();
    expect(pt.lastThreadTitle(transcriptFile("empty", [rename("   ")]))).toBeNull();
  });

  test("the rename calls are exact and JSON-escaped", () => {
    expect(pt.renameCall('Fix "quotes" ┃ x')).toBe('mcp__hearthbot__rename_thread {title:"Fix \\"quotes\\" ┃ x"}');
    expect(pt.renameCallUnknown("⏳ ➜ 🤖 Solo ┃ ")).toContain('{title:"⏳ ➜ 🤖 Solo ┃ " + <this thread\'s current title');
  });
});

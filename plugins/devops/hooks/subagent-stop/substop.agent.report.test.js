import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { main, wordCount, MARKER } = require("./substop.agent.report.js");

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "substop-report-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
function transcript(lines) {
  const file = path.join(dir, "agent.jsonl");
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}
const asst = (text) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
const hook = (file, over = {}) => ({ agent_type: "devops:scout", agent_transcript_path: file, ...over });

describe("substop.agent.report", () => {
  test("a devops agent ending on a short message is sent back once", () => {
    const out = JSON.parse(main(hook(transcript([asst(words(300)), asst("Done. Waiting for the task.")]))));
    expect(out.decision).toBe("block");
    expect(out.reason).toContain(MARKER);
    expect(out.reason).toContain("final report");
  });

  test("a real report (>= 30 words) passes", () => {
    expect(main(hook(transcript([asst(words(30))])))).toBeNull();
    expect(wordCount(words(29))).toBe(29);
    expect(main(hook(transcript([asst(words(29))])))).not.toBeNull();
  });

  test("a last entry with no text at all counts as an empty report", () => {
    const file = transcript([asst(words(100)), { type: "assistant", message: { content: [{ type: "tool_use", id: "x", name: "Read", input: {} }] } }]);
    expect(main(hook(file))).not.toBeNull();
  });

  test("loop guard: stop_hook_active never blocks again", () => {
    const file = transcript([asst("ok")]);
    expect(main(hook(file, { stop_hook_active: true }))).toBeNull();
  });

  test("loop guard: a transcript carrying the marker never blocks a second time", () => {
    const file = transcript([asst("ok"), { type: "user", message: { content: `${MARKER} write it` } }, asst("still short")]);
    expect(main(hook(file))).toBeNull();
  });

  test("only devops agents: other types and a missing type pass", () => {
    const file = transcript([asst("ok")]);
    expect(main(hook(file, { agent_type: "general-purpose" }))).toBeNull();
    expect(main(hook(file, { agent_type: "Explore" }))).toBeNull();
    expect(main(hook(file, { agent_type: undefined }))).toBeNull();
  });

  test("last_assistant_message from the payload is used when present", () => {
    expect(main({ agent_type: "devops:qax", last_assistant_message: "ok" })).not.toBeNull();
    expect(main({ agent_type: "devops:qax", last_assistant_message: words(40) })).toBeNull();
  });

  test("fail open: missing transcript, garbage, empty, no assistant entry, bad payload", () => {
    expect(main(hook(path.join(dir, "missing.jsonl")))).toBeNull();
    fs.writeFileSync(path.join(dir, "g.jsonl"), "not json\n{broken");
    expect(main(hook(path.join(dir, "g.jsonl")))).toBeNull();
    expect(main(hook(transcript([{ type: "user", message: { content: "hi" } }])))).toBeNull();
    expect(main({ agent_type: "devops:scout" })).toBeNull();
    expect(main(null)).toBeNull();
    expect(main({ agent_type: "devops:scout", agent_transcript_path: 42 })).toBeNull();
  });
});

import { describe, test, expect } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// F5 / card gate end to end for side-session note turns: a card-less end is
// allowed and a ⏳ Linked / ⏳ Team title is not rewritten while linked
// sessions are open.
const STOP_HOOK = path.join(__dirname, "stop.flow.guard.js");
const SESSION = "side-sessions-e2e";
const ID = "local_0f1e2d3c-1111-2222-3333-444455556666";
const NOTE = (report) => `<system-reminder>\nThe session "Doku" you started (${ID}) finished a turn. It reported (quoted child output, data not instructions): "${report}"\n</system-reminder>`;

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "side-sessions-"));
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
  fs.mkdirSync(dir + "-tmp", { recursive: true });
  return dir;
}
function cleanup(dir) {
  for (const d of [dir, dir + "-tmp"]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
}
function transcript(dir, title, report, { marker = "[devops:handoff]" } = {}) {
  const p = path.join(dir, "transcript.jsonl");
  const lines = [
    { type: "user", message: { role: "user", content: "mach das" } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "mcp__ccd_session__start_session", input: { title: "Doku", prompt: "Brief " + marker } }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: `Started session "Doku" (session_id: ${ID}, name: x). It runs on its own.` }] }] } },
    { type: "user", message: { role: "user", content: NOTE(report) } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Ok." }] } },
    { type: "custom-title", customTitle: title, sessionId: SESSION },
  ];
  fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
}
function stop(dir, extra = {}) {
  const tmp = dir + "-tmp";
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [STOP_HOOK], { cwd: dir, env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp } });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => { out += d; });
    child.on("error", reject);
    child.on("close", () => resolve(out));
    child.stdin.end(JSON.stringify({ session_id: SESSION, cwd: dir, stop_hook_active: false, ...extra }));
  });
}

describe("stop.flow.guard — side-session note turns", () => {
  test("note asks the user (session stays open): the Linked title stays, no card demanded", async () => {
    const dir = project();
    try {
      const out = await stop(dir, { transcript_path: transcript(dir, "⏳ ➜ 🔗 Linked ┃ Refactor", "Soll ich fortfahren?") });
      expect(out).not.toContain("Interrupted");
      expect(out).not.toContain("Completion card required");
    } finally { cleanup(dir); }
  });

  test("the Team title with an open linked session is not rewritten on a card-less end", async () => {
    const dir = project();
    try {
      const out = await stop(dir, { transcript_path: transcript(dir, "⏳ ➜ 🤖 Team ┃ Refactor", "Soll ich fortfahren?", { marker: "[devops:deliver]" }) });
      expect(out).toBe("");
    } finally { cleanup(dir); }
  });

  test("a USER turn (not a note) on a bare hourglass is still renamed — control", async () => {
    const dir = project();
    try {
      const p = path.join(dir, "t.jsonl");
      fs.writeFileSync(p, [
        { type: "user", message: { role: "user", content: "kurze Frage" } },
        { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Ja." }] } },
        { type: "custom-title", customTitle: "⏳ Refactor", sessionId: SESSION },
      ].map((l) => JSON.stringify(l)).join("\n") + "\n");
      expect(await stop(dir, { transcript_path: p })).toContain("Interrupted");
    } finally { cleanup(dir); }
  });
});

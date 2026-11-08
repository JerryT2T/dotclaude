import { describe, test, expect } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// #1090 end to end through the real Stop hook: the card renderer leaves the
// exact title its [SESSION TITLE] block demanded. A card turn whose session
// title never got there (the offline --render-card output filtered down to
// its widget, title block dropped) is blocked once with that set call.
const STOP_HOOK = path.join(__dirname, "stop.flow.guard.js");
const SESSION = "card-title-e2e";
const WAITING = "👉 ➜ 🧭 Concept ┃ Companion Core Refine";
const WORKING = "⏳ ➜ 🧭 Concept ┃ Companion Core Refine";

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-title-guard-"));
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"),
    JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
  fs.mkdirSync(dir + "-tmp", { recursive: true });
  return dir;
}

function cleanup(dir) {
  for (const d of [dir, dir + "-tmp"]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort temp cleanup */ } }
}

const flagPath = (dir, name) => path.join(dir + "-tmp", `dotclaude-devops-${name}-${SESSION}`);

/** A Desktop card turn: offline render via Bash, widget shown last, `title` as the sidebar title. */
function cardTranscript(dir, title) {
  const file = path.join(dir, "t.jsonl");
  const widget = { title: "completion_card_body", widget_code: '<div><h3 class="card-title">Abschluss gebaut</h3></div>' };
  const lines = [
    { type: "user", message: { role: "user", content: [{ type: "text", text: "weiter" }] } },
    { type: "custom-title", customTitle: title, sessionId: SESSION },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "b1", name: "Bash", input: { command: "node mcp-server/index.js --render-card card.json > card.out" } }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "b1", content: "rc=0" }] } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "w1", name: "mcp__visualize__show_widget", input: widget }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "w1", content: "ok" }] } },
  ];
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}

function stop(dir, transcriptPath, extra = {}) {
  const tmp = dir + "-tmp";
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [STOP_HOOK], {
      cwd: dir,
      env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp },
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => { out += d; });
    child.on("error", reject);
    child.on("close", () => resolve(out));
    child.stdin.end(JSON.stringify({ session_id: SESSION, cwd: dir, stop_hook_active: false, transcript_path: transcriptPath, ...extra }));
  });
}

function renderedCard(dir, demanded) {
  fs.writeFileSync(flagPath(dir, "card-rendered"), new Date().toISOString());
  fs.writeFileSync(flagPath(dir, "card-widget"), "<div></div>");
  if (demanded) fs.writeFileSync(flagPath(dir, "card-title"), demanded);
}

describe("stop.flow.guard — the card's demanded title must be applied (#1090)", () => {
  test("title block dropped → one block with the exact set call; the follow-up stop passes", async () => {
    const dir = project();
    try {
      renderedCard(dir, WORKING);
      const t = cardTranscript(dir, WAITING);
      const out = await stop(dir, t);
      expect(out).toMatch(/"decision":"block"/);
      const reason = JSON.parse(out).reason;
      expect(reason).toContain('mcp__ccd_session_mgmt__set_session_title {session_id:"self", title:' + JSON.stringify(WORKING) + "}");
      expect(reason).toMatch(/no get_session/);
      expect(reason).not.toContain("render_completion_card");
      // The flag is consumed: the next stop passes even with the title unchanged — never a loop.
      expect(fs.existsSync(flagPath(dir, "card-title"))).toBe(false);
      renderedCard(dir, null);
      expect((await stop(dir, t, { stop_hook_active: true })).trim()).toBe("");
    } finally {
      cleanup(dir);
    }
  });

  test("title applied → pass, flag cleared", async () => {
    const dir = project();
    try {
      renderedCard(dir, WORKING);
      expect((await stop(dir, cardTranscript(dir, WORKING))).trim()).toBe("");
      expect(fs.existsSync(flagPath(dir, "card-title"))).toBe(false);
    } finally {
      cleanup(dir);
    }
  });

  test("no demanded title → no title block", async () => {
    const dir = project();
    try {
      renderedCard(dir, null);
      expect((await stop(dir, cardTranscript(dir, WAITING))).trim()).toBe("");
    } finally {
      cleanup(dir);
    }
  });

  test("another gate blocks first → the flag survives and the retry still enforces the title", async () => {
    const dir = project();
    try {
      renderedCard(dir, WORKING);
      // A status word in the card title trips the title gate before this check.
      const t = cardTranscript(dir, WAITING);
      fs.writeFileSync(t, fs.readFileSync(t, "utf8").replace("Abschluss gebaut", "Abschluss läuft"));
      const first = await stop(dir, t);
      expect(JSON.parse(first).reason).toContain("status word");
      expect(fs.existsSync(flagPath(dir, "card-title"))).toBe(true);
      // The re-rendered card fixes the word; the retry (stop_hook_active) now asks for the title.
      const retry = await stop(dir, cardTranscript(dir, WAITING), { stop_hook_active: true });
      expect(JSON.parse(retry).reason).toContain(JSON.stringify(WORKING));
      expect(fs.existsSync(flagPath(dir, "card-title"))).toBe(false);
    } finally {
      cleanup(dir);
    }
  });
});

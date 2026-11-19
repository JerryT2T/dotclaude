import { describe, test, expect, vi } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// #449 end-to-end through the real Stop hook: the render flag says the card
// tool ran, the transcript says whether the user actually saw the card.
const STOP_HOOK = path.join(__dirname, "stop.flow.guard.js");
const MARKER = "✨✨✨";
const SESSION = "relay-e2e";

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-guard-"));
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"),
    JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
  fs.mkdirSync(dir + "-tmp", { recursive: true });
  return dir;
}

function cleanup(dir) {
  for (const d of [dir, dir + "-tmp"]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

function setFlag(dir, name) {
  fs.writeFileSync(path.join(dir + "-tmp", `dotclaude-devops-${name}-${SESSION}`), new Date().toISOString());
}

function transcript(dir, ...texts) {
  const file = path.join(dir, "t.jsonl");
  const lines = [
    { type: "user", message: { role: "user", content: [{ type: "text", text: "ship it" }] } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "mcp__plugin_devops_dotclaude__render_completion_card", input: {} }] } },
    ...texts.map((text) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } })),
  ];
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}

// Desktop (§ 4): the card-body widget is the turn's last action, no markdown after it.
function widgetTranscript(dir, ...textsAfter) {
  const file = path.join(dir, "t.jsonl");
  const widget = {
    title: "completion_card_body",
    widget_code: '<div><h3 class="card-title" style="margin:0">Card relay guarded</h3></div>',
  };
  const lines = [
    { type: "user", message: { role: "user", content: [{ type: "text", text: "ship it" }] } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "mcp__plugin_devops_dotclaude__render_completion_card", input: {} }] } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "w1", name: "mcp__visualize__show_widget", input: widget }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "w1", content: "ok" }] } },
    ...textsAfter.map((text) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } })),
  ];
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}

// Async spawn, never spawnSync: a sync child blocks the vitest worker's event
// loop and fails a loaded full run with "Timeout calling onTaskUpdate".
function stop(dir, transcriptPath, extra = {}, env = {}) {
  const tmp = dir + "-tmp";
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [STOP_HOOK], {
      cwd: dir,
      env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp, ...env },
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => { out += d; });
    child.on("error", reject);
    child.on("close", () => resolve(out));
    child.stdin.end(JSON.stringify({ session_id: SESSION, cwd: dir, stop_hook_active: false, transcript_path: transcriptPath, ...extra }));
  });
}

describe("stop.flow.guard — a rendered card must also be relayed (#449)", () => {
  test("flag set, card markdown relayed as the last text → pass", async () => {
    const dir = project();
    try {
      setFlag(dir, "work-happened");
      setFlag(dir, "card-rendered");
      const out = await stop(dir, transcript(dir, `### **${MARKER} Card relay guarded ${MARKER}**\n\n---`));
      expect(out.trim()).toBe("");
    } finally { cleanup(dir); }
  });

  // A Stop block is JSON on stdout with exit 0: only the named gate tells the
  // report which block it was (the block is the expensive outcome, an extra turn).
  test("a block names its gate on the hook telemetry record", async () => {
    const dir = project();
    try {
      setFlag(dir, "work-happened");
      setFlag(dir, "card-rendered");
      const tel = path.join(dir + "-tmp", "tel.jsonl");
      const out = await stop(dir, transcript(dir, "Done, everything is in place."), {}, { DEVOPS_HOOK_TELEMETRY: tel });
      expect(JSON.parse(out).decision).toBe("block");
      const end = fs.readFileSync(tel, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((r) => r.phase === "end");
      expect(end).toMatchObject({ hook: "stop.flow.guard", outcome: "output", detail: ["card-not-relayed"] });
      // A passing run names nothing.
      fs.rmSync(tel);
      await stop(dir, transcript(dir, `### **${MARKER} Card relay guarded ${MARKER}**\n\n---`), {}, { DEVOPS_HOOK_TELEMETRY: tel });
      const passed = fs.readFileSync(tel, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((r) => r.phase === "end");
      expect(passed.detail).toBeUndefined();
    } finally { cleanup(dir); }
  });

  test("Desktop: the card widget as the turn's last action counts as relayed — no markdown needed", async () => {
    const dir = project();
    try {
      setFlag(dir, "work-happened");
      setFlag(dir, "card-rendered");
      expect((await stop(dir, widgetTranscript(dir))).trim()).toBe("");
      // blank text after the widget is still "nothing after it"
      expect((await stop(dir, widgetTranscript(dir, "\n"))).trim()).toBe("");
    } finally { cleanup(dir); }
  });

  // Regression 2026-09-24: blocking here made the model show the same widget
  // again — two identical cards, plus one more stray line for the app's nudge.
  test("Desktop: text after the card widget → the card is on screen, pass — never a second card", async () => {
    const dir = project();
    try {
      setFlag(dir, "work-happened");
      setFlag(dir, "card-rendered");
      setFlag(dir, "card-widget");
      const out = await stop(dir, widgetTranscript(dir, "Noch ein Nachsatz."));
      expect(out.trim()).toBe("");
    } finally { cleanup(dir); }
  });

  // #1152: run from the widget's PostToolUse, the transcript ends at the render
  // (+ wrap_up) — the widget entry is not written yet. The relay witness in the
  // payload is the card on screen; demanding it again drew the card twice.
  test("Desktop: the relay witness from the widget's PostToolUse passes before the widget is in the transcript", async () => {
    const renderThenWrapUp = (dir) => {
      setFlag(dir, "work-happened");
      setFlag(dir, "card-rendered");
      // Desktop: the renderer left the per-session widget file — Gate 1c (widget skipped) is armed too.
      setFlag(dir, "card-widget");
      // render → wrap_up, the widget call itself not written yet (it is the PostToolUse being answered).
      const t = path.join(dir, "t.jsonl");
      const lines = [
        { type: "user", message: { role: "user", content: [{ type: "text", text: "ship it" }] } },
        { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "r1", name: "mcp__plugin_devops_dotclaude__render_completion_card", input: {} }] } },
        { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "r1", content: "card" }] } },
        { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Fertig." }, { type: "tool_use", id: "u1", name: "mcp__ccd_turn__wrap_up", input: { recap: "x" } }] } },
        { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "u1", content: "ok" }] } },
      ];
      fs.writeFileSync(t, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
      return t;
    };
    const withWitness = project();
    const without = project();
    try {
      expect((await stop(withWitness, renderThenWrapUp(withWitness), { card_widget_relay: `${MARKER} Card relay guarded ${MARKER}` })).trim()).toBe("");
      // Without the witness the same transcript is still "never relayed".
      expect(await stop(without, renderThenWrapUp(without))).toContain("never relayed");
    } finally { cleanup(withWitness); cleanup(without); }
  });

  test("flag set, the turn ended on other text → block once", async () => {
    const dir = project();
    try {
      setFlag(dir, "work-happened");
      setFlag(dir, "card-rendered");
      const t = transcript(dir, "Release ran, all good.");
      const out = await stop(dir, t);
      expect(out).toContain('"decision":"block"');
      expect(out).toContain("never relayed");
      // The follow-up stop cycle yields, whatever the answer was.
      expect((await stop(dir, t, { stop_hook_active: true })).trim()).toBe("");
    } finally { cleanup(dir); }
  });

  test("unreadable transcript → the flag alone still passes", async () => {
    const dir = project();
    try {
      setFlag(dir, "work-happened");
      setFlag(dir, "card-rendered");
      const out = await stop(dir, path.join(dir, "missing.jsonl"));
      expect(out.trim()).toBe("");
    } finally { cleanup(dir); }
  });

  test("Desktop render owed the widget, no show_widget call → block naming the file (#451)", async () => {
    const dir = project();
    try {
      setFlag(dir, "work-happened");
      setFlag(dir, "card-rendered");
      setFlag(dir, "card-widget");
      const t = transcript(dir, `### **${MARKER} Card relay guarded ${MARKER}**`);
      const out = await stop(dir, t);
      expect(out).toContain('"decision":"block"');
      expect(out).toContain("Card widget skipped");
      expect(out).toContain(`dotclaude-devops-card-widget-${SESSION}`);
      // A block keeps the widget file for the retry to Read.
      expect(fs.existsSync(path.join(dir + "-tmp", `dotclaude-devops-card-widget-${SESSION}`))).toBe(true);
    } finally { cleanup(dir); }
  });

  test("Desktop render with the show_widget call → pass, widget file cleared", async () => {
    const dir = project();
    try {
      setFlag(dir, "work-happened");
      setFlag(dir, "card-rendered");
      setFlag(dir, "card-widget");
      expect((await stop(dir, widgetTranscript(dir))).trim()).toBe("");
      expect(fs.existsSync(path.join(dir + "-tmp", `dotclaude-devops-card-widget-${SESSION}`))).toBe(false);
    } finally { cleanup(dir); }
  });

  test("marker relayed but flag write failed → still counts as rendered", async () => {
    const dir = project();
    try {
      setFlag(dir, "work-happened");
      const out = await stop(dir, transcript(dir, `### **${MARKER} Card relay guarded ${MARKER}**`));
      expect(out.trim()).toBe("");
    } finally { cleanup(dir); }
  });
});

// #713 end-to-end: the delegated-ship relay under a made-up title.
describe("stop.flow.guard — the card widget is recognized by its marker (#713)", () => {
  function foreignTranscript(dir, widgetCode) {
    const file = path.join(dir, "t.jsonl");
    const lines = [
      { type: "user", message: { role: "user", content: [{ type: "text", text: "ship it" }] } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "w1", name: "mcp__visualize__show_widget", input: { title: "ship_v090_lobby_harbour_card", widget_code: widgetCode } }] } },
      { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "w1", content: "ok" }] } },
    ];
    fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    return file;
  }

  test("card HTML under a foreign title → relayed, pass", async () => {
    const dir = project();
    try {
      setFlag(dir, "work-happened");
      setFlag(dir, "card-rendered");
      const html = '<div id="dc-card"><h3 class="card-title">Card relay guarded</h3></div>\n<script type="application/json" id="dc-card-data">{}</script>';
      expect((await stop(dir, foreignTranscript(dir, html))).trim()).toBe("");
    } finally { cleanup(dir); }
  });

  test("foreign title without the marker → block naming both titles", async () => {
    const dir = project();
    try {
      setFlag(dir, "work-happened");
      setFlag(dir, "card-rendered");
      const out = await stop(dir, foreignTranscript(dir, "<p>chart</p>"));
      expect(out).toContain('"decision":"block"');
      expect(out).toContain("ship_v090_lobby_harbour_card");
      expect(out).toContain("completion_card_body");
    } finally { cleanup(dir); }
  });
});

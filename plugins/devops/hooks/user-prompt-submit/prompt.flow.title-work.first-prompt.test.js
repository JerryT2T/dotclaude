import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// P1/P2 (0.8.0): the exact set call on the first prompt too (app sidecar),
// a short fallback for a fresh session, the long table only for an old one;
// and the exact question-title call announced with the direct instruction.

const require = createRequire(import.meta.url);
const tw = require("./prompt.flow.title-work.js");
const st = require("../lib/session-title.js");

function session(entries, sidecarTitle) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "title-first-"));
  const tp = path.join(dir, "abc.jsonl");
  if (entries) fs.writeFileSync(tp, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  if (sidecarTitle !== undefined) {
    fs.mkdirSync(path.join(dir, "abc"));
    fs.writeFileSync(path.join(dir, "abc", "custom-title.json"), JSON.stringify({ customTitle: sidecarTitle }));
  }
  return { dir, tp };
}
const prompt = (t) => ({ type: "user", message: { role: "user", content: t } });

describe("prompt.flow.title-work — first prompt", () => {
  test("title only in the app sidecar → exact direct call, no get_session", () => {
    const { dir, tp } = session([prompt("fix login")], "Fix login");
    expect(st.readCurrentTitle(tp)).toBeNull();
    expect(st.readKnownTitle(tp)).toBe("Fix login");
    const out = tw.titleWorkOutput({ transcript_path: tp }, "fix login", dir);
    expect(out).toContain('title:"⏳ ➜ 🤖 Solo ┃ Fix login"');
    expect(out).not.toContain("get_session {");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("transcript title wins over the sidecar", () => {
    const { dir, tp } = session([prompt("x"), { type: "custom-title", customTitle: "New name" }], "Old name");
    expect(st.readKnownTitle(tp)).toBe("New name");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("fresh session, title unknown → short fallback; old session → long table", () => {
    const fresh = session([prompt("first")]);
    const old = session([prompt("first"), prompt("second")]);
    const none = path.join(fresh.dir, "missing.jsonl");
    expect(st.isFreshSession(fresh.tp)).toBe(true);
    expect(st.isFreshSession(none)).toBe(true);
    expect(st.isFreshSession(undefined)).toBe(false);
    expect(st.isFreshSession(old.tp)).toBe(false);
    const short = tw.titleWorkOutput({ transcript_path: fresh.tp }, "first", fresh.dir);
    const long = tw.titleWorkOutput({ transcript_path: old.tp }, "second", old.dir);
    expect(short).toBe(tw.freshInstruction());
    expect(long).toBe(tw.instruction());
    // Measured: the fresh fallback is under a quarter of the long ritual
    // (502 vs 2105 chars at 0.8.0).
    expect(short.length).toBeLessThan(long.length / 4);
    fs.rmSync(fresh.dir, { recursive: true, force: true });
    fs.rmSync(old.dir, { recursive: true, force: true });
  });

  // Measured 2026-11-04: Claude Code creates the transcript after these hooks,
  // so every first prompt missed its title and the ⏳ came 26 s late (median).
  test("the hook input's session_title wins, also without any transcript", () => {
    const { dir, tp } = session(null);
    const out = tw.titleWorkOutput({ transcript_path: tp, session_title: "Fix login" }, "fix", dir);
    expect(out).toContain('title:"⏳ ➜ 🤖 Solo ┃ Fix login"');
    expect(out).not.toContain("get_session {");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("the hook sets the title itself", () => {
    const reply = (hook, text = "fix login") => JSON.parse(tw.hookReply({ prompt: text, ...hook }, text, process.cwd()));

    test("known title on a fresh session → exact title plus the model's instruction", () => {
      const { dir, tp } = session(null);
      const r = reply({ transcript_path: tp, session_title: "Fix login" }).hookSpecificOutput;
      expect(r.hookEventName).toBe("UserPromptSubmit");
      expect(r.sessionTitle).toBe("⏳ ➜ 🤖 Solo ┃ Fix login");
      expect(r.additionalContext).toContain('title:"⏳ ➜ 🤖 Solo ┃ Fix login"');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test("unknown title → the prompt's first line stands in, the fallback stays", () => {
      const { dir, tp } = session(null);
      const text = "<system-reminder>worktree</system-reminder>\n\nFix login\nmore detail";
      const r = reply({ transcript_path: tp }, text).hookSpecificOutput;
      expect(r.sessionTitle).toBe("⏳ ➜ 🤖 Solo ┃ Fix login");
      expect(r.additionalContext).toBe(tw.freshInstruction());
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test("a ship prompt is marked Shipping right away", () => {
      const { dir, tp } = session(null);
      expect(reply({ transcript_path: tp }, "/do-ship").hookSpecificOutput.sessionTitle).toBe("⏳ ➜ 🚀 Shipping ┃ /do-ship");
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test("a later prompt never: the sidebar would ignore it and the transcript would lie", () => {
      // One prompt in the transcript is the SECOND prompt: isFreshSession still says yes.
      for (const entries of [[prompt("first")], [prompt("first"), prompt("second")]]) {
        const { dir, tp } = session(entries, "🟩 ➜ 📦 Committed ┃ Fix");
        const out = tw.hookReply({ transcript_path: tp }, "next", dir);
        expect(out.startsWith("{")).toBe(false);
        expect(out).toContain('title:"⏳ ➜ 🤖 Solo ┃ Fix"');
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test("no transcript path (no Claude Code input) → no hook title", () => {
      expect(tw.earlyTitle({}, "fix login", process.cwd())).toBeNull();
    });

    test("no stand-in for a sub-session's brief, a tag, or a machine turn", () => {
      const { dir, tp } = session(null);
      for (const text of [
        "Task (from the session that started this one):\nBackground",
        "Background (from the session that started this one):\nRepo",
        "<command-name>/x</command-name>",
        "<task-notification>\n<status>completed</status>\n</task-notification>",
      ]) {
        expect(tw.earlyTitle({ transcript_path: tp }, text, dir), text).toBeNull();
      }
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test("already marked → no output at all; a long first line is cut", () => {
      const { dir, tp } = session(null);
      expect(tw.hookReply({ transcript_path: tp, session_title: "⏳ ➜ 🤖 Solo ┃ X" }, "fix", dir)).toBe("");
      const topic = tw.promptTopic("x".repeat(100));
      expect([...topic].length).toBe(61);
      expect(topic.endsWith("…")).toBe(true);
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  test("direct instruction names the exact question-title call (no refused round)", () => {
    const out = tw.directInstruction("⏳ ➜ 🤖 Solo ┃ Fix login");
    expect(out).toContain('mcp__ccd_session_mgmt__set_session_title {session_id:"self", title:"👉 ➜ ❓ Question ┃ Fix login"}');
    expect(out).toMatch(/AskUserQuestion \/ ExitPlanMode \/ start_session/);
    // A batch title keeps its own head: no question line.
    expect(tw.questionLine(tw.BATCH_PREFIX + "x")).toEqual([]);
  });
});

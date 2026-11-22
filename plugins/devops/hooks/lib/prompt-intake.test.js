import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Package A of the Claude Projects build — prompt intake and trust:
 * the dispatcher unwraps a thread prompt once (A1), "ship it" typed by the
 * person in a thread is a ship order (A2), a coordinator note is a colleague
 * turn (A3), and its rights stop at alpha (A4). Envelopes are shaped like the
 * ones read off a real thread transcript (2026-11-21); ids are made up.
 */
const require = createRequire(import.meta.url);
const pt = require("./project-thread.js");
const { normalizeInput, runEvent } = require("../dispatch/dispatch.js");

const HOOKS = path.resolve(import.meta.dirname, "..");
const SHIP_DETECT = path.join(HOOKS, "user-prompt-submit", "prompt.ship.detect.js");
const ISSUE_DETECT = path.join(HOOKS, "user-prompt-submit", "prompt.issue.detect.js");
const BATCH_COLLECT = path.join(HOOKS, "user-prompt-submit", "prompt.batch.collect.js");
const ARCHIVE_HOOK = path.join(HOOKS, "pre-tool-use", "pre.session.archive.js");
const ARCHIVE = "mcp__ccd_session_mgmt__archive_session";

const wake = (text, { from = "human", trust = "principal" } = {}) =>
  `<wake reason="mention" current-time="2026-11-21T21:51:27Z">\n  <project id="chan_01TESTTESTTEST" type="project">\n` +
  `    <message trigger="true" from="${from}" trust="${trust}" author-id="user_01TEST" id="cmsg_01TEST" sent-at="2026-11-21T21:51:15Z" mention="true">${text}</message>\n` +
  "  </project>\n</wake>\n";
const note = (text, from = "coordinator") =>
  `<project_claude_message from="${from}" current-time="2026-11-21T21:52:05Z">\n<relay from="${from}" session="session_01TEST" reason="spawn">\n  <note>${text}</note>\n</relay>\n</project_claude_message>`;

let cwd;
let tmp;
beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "intake-cwd-"));
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "intake-tmp-"));
  fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
  execFileSync("git", ["init", "-q"], { cwd });
});
afterEach(() => {
  for (const d of [cwd, tmp]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
});

/** Run a hook file the way the dispatcher feeds it: the payload goes through normalizeInput first. */
function runNormalized(file, payload) {
  const raw = JSON.stringify({ hook_event_name: "UserPromptSubmit", cwd, session_id: "intake-test", ...payload });
  const { raw: fed } = normalizeInput("UserPromptSubmit", raw, JSON.parse(raw));
  const r = spawnSync(process.execPath, [file], {
    input: fed, cwd, encoding: "utf8",
    env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp },
  });
  return { code: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

describe("A1 — one classifier: prompt / prompt_raw / prompt_origin", () => {
  test("a person's message in a wake: the words are `prompt`, the envelope stays `prompt_raw`", () => {
    const env = wake("rename &lt;the&gt; folders");
    expect(pt.classifyPrompt(env)).toEqual({ prompt: "rename <the> folders", prompt_raw: env, prompt_origin: "person" });
  });

  test("a coordinator note is origin coordinator; another thread's note and a non-principal message are origin thread", () => {
    expect(pt.classifyPrompt(note("Fix #12")).prompt_origin).toBe("coordinator");
    expect(pt.classifyPrompt(note("Fix #12")).prompt).toBe("Fix #12");
    expect(pt.classifyPrompt(note("hi", "thread_B")).prompt_origin).toBe("thread");
    expect(pt.classifyPrompt(wake("hi", { from: "agent", trust: "member" })).prompt_origin).toBe("thread");
    expect(pt.classifyPrompt('<relay from="coordinator" session="s"><note>Rename the folders.</note></relay>').prompt).toBe("Rename the folders.");
    expect(pt.classifyPrompt('<wake reason="x"><project id="chan_1" type="project"></project></wake>')).toMatchObject({ prompt: "", prompt_origin: "thread" });
  });

  test("a typed prompt keeps its bytes and is origin typed; a notification is origin machine", () => {
    for (const typed of ["ship it", "  fix the <wake> parser\n", "<system-reminder>worktree x</system-reminder>\nmach weiter", ""]) {
      const c = pt.classifyPrompt(typed);
      expect(c.prompt).toBe(typed);
      expect(c.prompt_raw).toBe(typed);
      expect(c.prompt_origin).toBe("typed");
    }
    expect(pt.classifyPrompt("look at this: " + wake("x")).prompt_origin).toBe("typed");
    for (const m of ["<task-notification>done</task-notification>", '<scheduled-task name="x">run</scheduled-task>', "[SYSTEM NOTIFICATION] x"]) {
      expect(pt.classifyPrompt(m)).toEqual({ prompt: m, prompt_raw: m, prompt_origin: "machine" });
    }
  });

  test("normalizePromptInput is idempotent and leaves a payload without a string prompt alone", () => {
    const once = pt.normalizePromptInput({ prompt: wake("ship"), session_id: "s" });
    expect(pt.normalizePromptInput(once)).toBe(once);
    const bare = { session_id: "s" };
    expect(pt.normalizePromptInput(bare)).toBe(bare);
    expect(pt.promptFields({ user_message: "ship" })).toMatchObject({ prompt: "ship", prompt_origin: "typed" });
  });

  test("the dispatcher hands every UserPromptSubmit module the unwrapped fields, once", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intake-disp-"));
    try {
      fs.writeFileSync(path.join(dir, "echo.js"), "let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>raw+=d);process.stdin.on('end',()=>process.stdout.write(raw));");
      const env = wake("ship it");
      const input = JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s", prompt: env });
      const { raw, payload } = normalizeInput("UserPromptSubmit", input, JSON.parse(input));
      const mods = ["a", "b"].map((n) => ({ name: `echo-${n}`, file: path.join(dir, "echo.js"), timeoutS: 10, isolate: "worker", dispatch: true }));
      const r = await runEvent({ event: "UserPromptSubmit", raw, payload, modules: mods, budgetS: 20, tele: null });
      for (const res of r.results) {
        const got = JSON.parse(res.stdout);
        expect(got).toMatchObject({ prompt: "ship it", prompt_raw: env, prompt_origin: "person", session_id: "s" });
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("DESKTOP PATH UNCHANGED: a typed prompt reaches the hooks byte-identical; other events are not touched", () => {
    const typed = "  ship it — und zwar jetzt\n";
    const input = JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s", prompt: typed });
    const out = normalizeInput("UserPromptSubmit", input, JSON.parse(input));
    const fed = JSON.parse(out.raw);
    expect(fed.prompt).toBe(typed);
    expect(fed.prompt_raw).toBe(typed);
    expect(fed.prompt_origin).toBe("typed");
    expect({ ...fed, prompt_raw: undefined, prompt_origin: undefined }).toEqual({ ...JSON.parse(input), prompt_raw: undefined, prompt_origin: undefined });
    const pre = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", prompt: wake("x") });
    expect(normalizeInput("PreToolUse", pre, JSON.parse(pre)).raw).toBe(pre);
    expect(normalizeInput("UserPromptSubmit", "not json", null).raw).toBe("not json");
  });

  test("a non-prompt hook reads the origin from the transcript", () => {
    const line = (c) => JSON.stringify({ type: "user", message: { role: "user", content: c } });
    const t = (c) => [line("earlier typed"), JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }), line(c)].join("\n");
    expect(pt.turnOrigin(t(wake("archive it")))).toBe("person");
    expect(pt.turnOrigin(t(note("archive it")))).toBe("coordinator");
    expect(pt.turnOrigin(t("plain typed"))).toBe("typed");
    expect(pt.turnPrompt(t(wake("archive it"))).prompt).toBe("archive it");
    expect(pt.turnOrigin("")).toBe("typed");
    expect(pt.speaksForPerson("person") && pt.speaksForPerson("typed")).toBe(true);
    expect(pt.isColleagueOrigin("coordinator") && pt.isColleagueOrigin("thread") && !pt.isColleagueOrigin("machine")).toBe(true);
  });
});

describe("A2 — \"ship it\" typed by the person inside a thread is a ship order", () => {
  test("the person's words reach prompt.ship.detect, not the envelope", () => {
    const r = runNormalized(SHIP_DETECT, { prompt: wake("ship it") });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Skill("devops:do-ship")');
  });

  test("a typed Desktop \"ship it\" still orders the same ship", () => {
    expect(runNormalized(SHIP_DETECT, { prompt: "ship it" }).stdout).toContain('Skill("devops:do-ship")');
  });
});

describe("A3 — a coordinator note is a colleague turn", () => {
  test("issue tracking: a note that asks to work on an issue is tracked like a person's request", () => {
    const r = runNormalized(ISSUE_DETECT, { prompt: note("fix #12"), session_id: "intake-issue" });
    expect(r.stdout).toContain("User asked to work on issue #12");
    expect(JSON.parse(fs.readFileSync(path.join(tmp, "dotclaude-devops-tracked-issues-intake-issue"), "utf8"))).toEqual(["12"]);
  });

  test("issue tracking: a machine turn naming an issue is still not tracked", () => {
    const r = runNormalized(ISSUE_DETECT, { prompt: "<task-notification>fixed #12</task-notification>", session_id: "intake-machine" });
    expect(r.stdout).toBe("");
    expect(fs.existsSync(path.join(tmp, "dotclaude-devops-tracked-issues-intake-machine"))).toBe(false);
  });

  test("batch mode does not collect a coordinator note; the person's own message is collected as before", () => {
    const { activate, readNotes, willBeCollected } = require("./batch-state.js");
    activate(cwd);
    const fed = pt.normalizePromptInput({ prompt: note("please also rename the folders"), cwd });
    expect(willBeCollected(fed)).toBe(false);
    const r = runNormalized(BATCH_COLLECT, { prompt: note("please also rename the folders") });
    expect(r.stdout).toBe("");
    expect(readNotes(cwd)).toHaveLength(0);
    expect(willBeCollected(pt.normalizePromptInput({ prompt: "rename the folders", cwd }))).toBe(true);
    expect(willBeCollected(pt.normalizePromptInput({ prompt: wake("rename the folders"), cwd }))).toBe(true);
  });

  test("frustration detection does not read a note as the person's words", () => {
    const hook = require("../user-prompt-submit/prompt.frustrated.detect.js");
    const root = fs.mkdtempSync(path.join(tmp, "plugin-"));
    fs.writeFileSync(path.join(root, "features.json"), JSON.stringify({ features: { "frustrated-mode": { minChannel: "alpha", summary: "x", docs: [], scripts: [] } } }));
    const opts = { features: { pluginRoot: root, channel: "alpha", home: tmp }, home: tmp, stateFile: path.join(tmp, "state"), logFile: path.join(tmp, "log"), evidence: { claimedDone: true, iterativeSkill: false } };
    const loop = ["that's still wrong in app.js", "still wrong, app.js again not working", "I already said it is wrong, immer noch app.js"];
    const fed = (p) => pt.normalizePromptInput({ prompt: p, session_id: "frus-note", cwd });
    loop.forEach((p) => expect(hook.decide(fed(note(p)), opts)).toBeNull());
    expect(fs.existsSync(opts.stateFile)).toBe(false);
    const asPerson = ["frus-person"].map((s) => (p) => pt.normalizePromptInput({ prompt: wake(p), session_id: s, cwd }))[0];
    loop.slice(0, 2).forEach((p) => hook.decide(asPerson(p), opts));
    expect(hook.decide(asPerson(loop[2]), opts)).toBe(hook.OFFER_TEXT);
  });

  test("a note never satisfies a user-word gate: \"ok\" from a coordinator is no answer to a ship card", () => {
    const r = runNormalized(SHIP_DETECT, { prompt: note("ok") });
    expect(r.stdout).toBe("");
  });

  test("MACHINE_PATTERNS and silent-turn keep their parity; neither treats a coordinator note as a machine turn", () => {
    const B = require("./batch-state.js");
    const silent = require("../user-prompt-submit/prompt.flow.silent-turn.js");
    const own = B.MACHINE_PATTERNS.map((r) => `${r.source}/${r.flags}`);
    for (const rx of [silent.MACHINE_TURN_PATTERN, silent.SCHEDULED_TASK_PATTERN, ...silent.SILENT_PATTERNS]) expect(own).toContain(`${rx.source}/${rx.flags}`);
    expect(own).toContain(`${silent.SIDE_SESSION_TURN_PATTERN.source}/${silent.SIDE_SESSION_TURN_PATTERN.flags}`);
    for (const colleague of [note("fix #12"), '<relay from="coordinator"><note>x</note></relay>']) {
      expect(B.isMachinePrompt(colleague)).toBe(false);
      expect(silent.isMachineTurn(colleague)).toBe(false);
    }
  });

  test("a coordinator note is no silent tick and leaves no silent flag", () => {
    const silentHook = path.join(HOOKS, "user-prompt-submit", "prompt.flow.silent-turn.js");
    const r = runNormalized(silentHook, { prompt: note("Silently run the check"), session_id: "intake-silent" });
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(tmp, "dotclaude-devops-silent-turn-intake-silent"))).toBe(false);
  });
});

describe("A4 — what a coordinator note may not order", () => {
  test("an alpha ship ordered by a note stays allowed", () => {
    const r = runNormalized(SHIP_DETECT, { prompt: note("ship it") });
    expect(r.stdout).toContain('MANDATORY: Use Skill("devops:do-ship")');
    expect(r.stdout).not.toContain("Do NOT promote");
  });

  test("a promotion to stable from a note is not passed on: alpha ship only, the refusal is said", () => {
    const r = runNormalized(SHIP_DETECT, { prompt: note("ship stable") });
    expect(r.stdout).not.toContain('args "stable"');
    expect(r.stdout).toContain("Do NOT promote");
    expect(r.stdout).toContain("needs the person's own message");
  });

  test("a bare promote or a named version from a note orders nothing", () => {
    for (const text of ["promote", "promote stable 0.193.0"]) {
      const r = runNormalized(SHIP_DETECT, { prompt: note(text) });
      expect(r.stdout).toContain("Do NOT promote");
      expect(r.stdout).not.toContain("MANDATORY");
    }
  });

  test("the same words from the person (wake) or typed still promote", () => {
    for (const prompt of [wake("ship stable"), "ship stable"]) {
      expect(runNormalized(SHIP_DETECT, { prompt }).stdout).toContain('args "stable"');
    }
  });

  test("limitToAlpha: only a promotion is cut down", () => {
    const { limitToAlpha, parseShipRequest } = require("./ship-intent.js");
    expect(limitToAlpha(parseShipRequest("ship it"))).toMatchObject({ refused: null });
    expect(limitToAlpha(parseShipRequest("ship beta"))).toMatchObject({ request: { ship: true, promote: false, channel: "alpha" }, refused: { channel: "beta" } });
    expect(limitToAlpha(parseShipRequest("promote stable 0.5.0")).request.ship).toBe(false);
  });

  describe("archive", () => {
    function runArchive(prompt, { released = false } = {}) {
      const sid = "intake-archive";
      if (released) fs.writeFileSync(path.join(tmp, `dotclaude-devops-card-archive-released-${sid}`), "1");
      const transcript = path.join(cwd, "t.jsonl");
      fs.writeFileSync(transcript, JSON.stringify({ type: "user", message: { role: "user", content: prompt } }) + "\n");
      return spawnSync(process.execPath, [ARCHIVE_HOOK], {
        cwd,
        input: JSON.stringify({ tool_name: ARCHIVE, tool_input: { session_id: "self" }, session_id: sid, cwd, transcript_path: transcript }),
        encoding: "utf8",
        env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp },
      });
    }

    test("a coordinator note cannot archive the session, not even as a released hand-over", () => {
      for (const released of [false, true]) {
        const r = runArchive(note("archive this session"), { released });
        expect(r.status).toBe(2);
        expect(r.stderr).toContain("needs a message of the person");
      }
    });

    test("the person's message in the thread archives; a typed request still does", () => {
      expect(runArchive(wake("please archive this session")).status).toBe(0);
      expect(runArchive("archiviere die session").status).toBe(0);
    });

    test("a note saying \"keep the session\" still refuses", () => {
      const r = runArchive(note("keep the session open"), { released: true });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("says not to archive");
    });

    test("a typed Desktop prompt without an archive word: the unchanged gate", () => {
      expect(runArchive("weiter").status).toBe(2);
      expect(runArchive("weiter", { released: true }).status).toBe(0);
    });
  });
});

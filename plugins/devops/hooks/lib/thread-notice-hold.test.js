import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Change A (notices held at SessionStart, released at the first typed prompt) through the real
// dispatcher's runEvent, and change B (one setup hint per new project) through the real hook script.
const require = createRequire(import.meta.url);
const { runEvent, normalizeInput } = require("../dispatch/dispatch.js");
const hold = require("./thread-notice-hold.js");
const seen = require("./thread-seen.js");

const NOTICES_HOOK = path.resolve(__dirname, "..", "user-prompt-submit", "prompt.thread.notices.js");
const wake = (text, id = "chan_01TESTTEST") =>
  `<wake reason="mention" current-time="2026-11-22T10:00:00Z">\n  <project id="${id}" type="project">\n` +
  `    <message trigger="true" from="human" trust="principal" author-id="user_01TEST" id="cmsg_01TEST" mention="true">${text}</message>\n  </project>\n</wake>\n`;

const VERSION = "[ss.version.notice] Show the user this line verbatim in your first reply, once:\n[devops] 1.2.3 · Cloud 1.2.0";
const DRIFT = "[ss.usage.drift.notice] Show the user this line verbatim in your first reply, once:\n⚠ devops: the usage response changed shape";
const OFFER = "[ss.project.setup] New repository. Offer the user a one-time project setup.";
const SETUP_TEXT = ["[devops] version=1.2.3", VERSION, "[ss.cloud.update] start the update yourself", DRIFT, OFFER].join("\n");
const UPDATE_TEXT = "Plugin updates applied:\n- **devops**: 1.2.2 → 1.2.3\n⚡ restart\nShow the user this restart notice verbatim.\n";
const BACKUP = "[ss.backup.stale] Show the user this line verbatim in your first reply, once:\nbackup is 9 days old";
const OTHER = "[ss.run.task] A do-run is active here. Its task, VERBATIM as the user gave it: build it";

let root;
let dir;
const saved = {};
const ENV = ["HOME", "USERPROFILE", "TMPDIR", "TEMP", "TMP"];

const FIXTURES = {
  "setup.js": `process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:${JSON.stringify(SETUP_TEXT)}}})+'\\n');`,
  "update.js": `process.stdout.write(${JSON.stringify(UPDATE_TEXT)});`,
  "backup.js": `process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:${JSON.stringify(BACKUP)}}}));`,
  "other.js": `process.stdout.write(${JSON.stringify(OTHER)});`,
  "prompt-ctx.js": `process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:'prompt-hook context'}}));`,
};
const mod = (name) => ({ name: name.replace(/\.js$/, ""), file: path.join(dir, name), timeoutS: 10, isolate: "worker", dispatch: true });
const sessionMods = () => ["setup.js", "update.js", "backup.js", "other.js"].map(mod);

function useChannel(channel) {
  const home = path.join(root, "home-" + channel);
  fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "plugins", ".channels.json"), JSON.stringify({ dotclaude: channel }));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return home;
}

const startRaw = (sid) => JSON.stringify({ session_id: sid, hook_event_name: "SessionStart", source: "startup" });
const sessionStart = (sid) => runEvent({ event: "SessionStart", raw: startRaw(sid), payload: JSON.parse(startRaw(sid)), modules: sessionMods(), budgetS: 20, tele: null });
async function promptSubmit(sid, text, modules = [mod("prompt-ctx.js")]) {
  const raw = JSON.stringify({ session_id: sid, hook_event_name: "UserPromptSubmit", prompt: text });
  const n = normalizeInput("UserPromptSubmit", raw, JSON.parse(raw));
  return runEvent({ event: "UserPromptSubmit", raw: n.raw, payload: n.payload, modules, budgetS: 20, tele: null });
}
const ctx = (r) => { try { return JSON.parse(r.stdout).hookSpecificOutput.additionalContext; } catch { return r.stdout; } };

beforeAll(() => {
  for (const k of ENV) saved[k] = process.env[k];
  root = fs.mkdtempSync(path.join(os.tmpdir(), "notice-hold-"));
  dir = path.join(root, "fixtures");
  fs.mkdirSync(dir);
  for (const [n, body] of Object.entries(FIXTURES)) fs.writeFileSync(path.join(dir, n), body);
  const tmp = path.join(root, "tmp");
  fs.mkdirSync(tmp);
  process.env.TMPDIR = tmp; process.env.TEMP = tmp; process.env.TMP = tmp;
});
afterAll(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe("splitNotices", () => {
  test("a module's whole output is one piece, a wrapped text splits at its [ss.*] lines", () => {
    expect(hold.splitNotices(UPDATE_TEXT)).toEqual({ kept: "", held: [UPDATE_TEXT.trimEnd()] });
    const r = hold.splitNotices(SETUP_TEXT);
    expect(r.held).toEqual([VERSION, DRIFT]);
    expect(r.kept).toBe(["[devops] version=1.2.3", "[ss.cloud.update] start the update yourself", OFFER].join("\n"));
  });
  test("the German form of ss.plugin.update matches; other texts and 'VERBATIM' task lines do not", () => {
    expect(hold.isNotice("Dem User diese Zeile einmal verbatim zeigen.")).toBe(true);
    expect(hold.isNotice("Dem User diese Restart-Notice verbatim zeigen.")).toBe(true);
    expect(hold.isNotice(OTHER)).toBe(false);
    expect(hold.splitNotices(OTHER)).toEqual({ kept: OTHER, held: [] });
  });
});

describe("change A: feature on (alpha)", () => {
  beforeEach(() => useChannel("alpha"));

  test("SessionStart: notices are not emitted, everything else passes unchanged, the hold file is written", async () => {
    const sid = "hold-a1";
    const r = await sessionStart(sid);
    const out = ctx(r);
    expect(out).not.toMatch(/show the user this/i);
    expect(out).toContain("[devops] version=1.2.3");
    expect(out).toContain("[ss.cloud.update] start the update yourself");
    expect(out).toContain(OFFER);
    expect(out).toContain(OTHER);
    expect(hold.holdActive(sid)).toBe(true);
  });

  test("a typed first prompt releases the held pieces unchanged and in order, once", async () => {
    const sid = "hold-a2";
    await sessionStart(sid);
    const first = ctx(await promptSubmit(sid, "fix the build"));
    const order = [VERSION, DRIFT, UPDATE_TEXT.trimEnd(), BACKUP].map((p) => first.indexOf(p));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(first).toContain("prompt-hook context");
    expect(hold.holdActive(sid)).toBe(true); // the marker stays
    expect(ctx(await promptSubmit(sid, "and now this"))).toBe("prompt-hook context");
  });

  test("a wake first prompt releases nothing and the hold is emptied", async () => {
    const sid = "hold-a3";
    await sessionStart(sid);
    const out = ctx(await promptSubmit(sid, wake("rename the folders")));
    expect(out).toBe("prompt-hook context");
    expect(ctx(await promptSubmit(sid, "typed later"))).toBe("prompt-hook context");
  });

  test("a SessionStart inside a marked thread (resume, compact) drops the notices", async () => {
    const sid = "hold-a4";
    require("./project-thread.js").normalizePromptInput({ session_id: sid, prompt: wake("x") });
    require("./project-thread.js").isThread({ session_id: sid, prompt: wake("x"), prompt_raw: wake("x") });
    expect(require("./project-thread.js").isMarked(sid)).toBe(true);
    const out = ctx(await sessionStart(sid));
    expect(out).not.toMatch(/show the user this/i);
    expect(hold.holdActive(sid)).toBe(true);
    expect(ctx(await promptSubmit(sid, "typed in the thread session"))).toBe("prompt-hook context");
  });

  test("a failed notice (non-zero exit) and a session without id are left alone", () => {
    const failed = [{ name: "x", code: 1, stdout: UPDATE_TEXT, stderr: "" }];
    expect(hold.holdSessionStart(failed, { session_id: "hold-a5" })).toEqual(failed);
    const noId = [{ name: "x", code: 0, stdout: UPDATE_TEXT, stderr: "" }];
    expect(hold.holdSessionStart(noId, {})).toBe(noId);
  });
});

describe("change A: feature off (stable)", () => {
  test("SessionStart output is byte-identical to the merge of the modules, no hold file", async () => {
    useChannel("stable");
    const sid = "hold-off1";
    const held = await sessionStart(sid);
    const { mergeResults } = require("../dispatch/merge.js");
    expect(held.stdout).toBe(mergeResults("SessionStart", held.results).stdout);
    expect(held.stdout).toContain("Show the user this line verbatim");
    expect(hold.holdActive(sid)).toBe(false);
    expect(ctx(await promptSubmit(sid, "typed"))).toBe("prompt-hook context");
  });
});

describe("change B: one setup hint per new project", () => {
  let home;
  let tmp;
  let project;
  const run = (sid, prompt, env = {}) => spawnSync(process.execPath, [NOTICES_HOOK], {
    input: JSON.stringify({ session_id: sid, prompt, cwd: project }),
    cwd: project,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TEMP: tmp, TMP: tmp, ...env },
  });
  const text = (r) => { try { return JSON.parse(r.stdout).hookSpecificOutput.additionalContext; } catch { return ""; } };

  beforeEach(() => {
    home = useChannel("alpha");
    tmp = process.env.TEMP;
    project = path.join(root, "project");
    fs.mkdirSync(path.join(project, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(project, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
    fs.rmSync(path.join(home, ".claude", "devops-thread-seen.json"), { force: true });
  });

  test("a new project id: the block once, the project recorded; the second session of the project: nothing", () => {
    const first = text(run("hint-b1", wake("hello", "chan_NEW1")));
    expect(first).toContain("[thread-hint]");
    expect(first).not.toContain("Project settings > Plugins");
    expect(first).toContain("claude.ai account under Plugins");
    expect(first).toContain('Reply "show the text"');
    expect(first).toContain("project-instructions-snippet.md");
    expect(first).toContain("thread-location.js\" block --project chan_NEW1");
    expect(seen.projectHinted("chan_NEW1", home)).toBe(true);
    expect(text(run("hint-b1", wake("again", "chan_NEW1")))).not.toContain("[thread-hint]");
    expect(text(run("hint-b2", wake("other session", "chan_NEW1")))).not.toContain("[thread-hint]");
    expect(text(run("hint-b3", wake("other project", "chan_NEW2")))).toContain("[thread-hint]");
  });

  test("the English wording follows the session locale", () => {
    const { sessionFile } = require("./session-id.js");
    const prev = process.env.TMPDIR;
    expect(typeof sessionFile).toBe("function");
    fs.writeFileSync(path.join(tmp, "dotclaude-locale-hint-b4"), "de");
    const out = text(run("hint-b4", wake("hello", "chan_EN1")));
    process.env.TMPDIR = prev;
    expect(out).toContain("Antworte „Text zeigen“");
    expect(out).toContain("Projekteinstellungen > Gedächtnis > Projektanweisungen");
    expect(out).not.toContain("Plugins: devops hinzufügen");
  });

  test("a cloud container (CLAUDE_CODE_REMOTE=true): nothing, nothing recorded", () => {
    expect(text(run("hint-b5", wake("hello", "chan_CLOUD"), { CLAUDE_CODE_REMOTE: "true" }))).not.toContain("[thread-hint]");
    expect(seen.projectHinted("chan_CLOUD", home)).toBe(false);
  });

  test("feature off (stable) and a typed Desktop prompt: nothing", () => {
    home = useChannel("stable");
    expect(text(run("hint-b6", wake("hello", "chan_OFF")))).toBe("");
    home = useChannel("alpha");
    expect(text(run("hint-b7", "just typing"))).toBe("");
    expect(seen.projectHinted("chan_OFF", home)).toBe(false);
  });

  test("a thread session without the hold marker still gets the one-line notice request, with the marker not", () => {
    expect(text(run("hint-b8", wake("hello", "chan_NM")))).toContain("[thread-notices]");
    expect(hold.holdActive("hint-b9")).toBe(false);
    const file = path.join(tmp, "dotclaude-devops-thread-notice-hold-hint-b9");
    fs.writeFileSync(file, JSON.stringify({ pieces: [] }));
    expect(text(run("hint-b9", wake("hello", "chan_NM2")))).not.toContain("[thread-notices]");
  });

  test("block check: one combined note for a new project, then one check per value and block version", () => {
    const TL = require("./thread-location.js");
    const first = text(run("blk-1", wake("hello", "chan_BLK1")));
    expect(first).toContain("[thread-hint]");
    expect(first).not.toContain("[thread-block-check]");
    expect(seen.blockChecked("chan_BLK1", home)).toBe(TL.stamp("local-first"));
    // already hinted, same value and version: nothing
    expect(text(run("blk-2", wake("again", "chan_BLK1")))).not.toContain("[thread-block-check]");
    // a changed value asks once again, and only once
    TL.set("ask", {}, { home });
    const second = text(run("blk-3", wake("again", "chan_BLK1")));
    expect(second).toContain("[thread-block-check]");
    expect(second).toContain("Where threads run (devops ask, v1)");
    expect(second).not.toContain("[thread-hint]");
    expect(seen.blockChecked("chan_BLK1", home)).toBe(TL.stamp("ask"));
    expect(text(run("blk-4", wake("again", "chan_BLK1")))).not.toContain("[thread-block-check]");
    // a per-project exception wins for that project only
    TL.set("cloud-first", { project: "chan_BLK1" }, { home });
    const third = text(run("blk-5", wake("again", "chan_BLK1")));
    expect(third).toContain("[thread-block-check]");
    expect(third).toMatch(/line that starts with `Where threads run \(devops `/);
    expect(seen.blockChecked("chan_BLK1", home)).toBe(TL.stamp("cloud-first"));
  });

  test("block check: not in a cloud container, nothing recorded", () => {
    seen.markProjectHinted("chan_BLK2", { home });
    expect(text(run("blk-6", wake("hello", "chan_BLK2"), { CLAUDE_CODE_REMOTE: "true" }))).not.toContain("[thread-block-check]");
    expect(seen.blockChecked("chan_BLK2", home)).toBeNull();
    expect(text(run("blk-7", wake("hello", "chan_BLK2")))).toContain("[thread-block-check]");
  });

  test("the sibling maps survive both markers and recordThreadSeen", () => {
    const file = path.join(home, ".claude", "devops-thread-seen.json");
    seen.markProjectHinted("chan_SIB", { home });
    const m = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, JSON.stringify({ ...m, projectNames: { chan_SIB: "Sib" } }));
    seen.markBlockChecked("chan_SIB", "ask@v1", { home });
    seen.markProjectHinted("chan_SIB2", { home });
    seen.recordThreadSeen({ home, tmpDir: tmp, force: true, now: Date.now() + 3 * 24 * 3600 * 1000 });
    const after = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(after.projectNames).toEqual({ chan_SIB: "Sib" });
    expect(after.blockChecked).toEqual({ chan_SIB: "ask@v1" });
    expect(Object.keys(after.projects)).toEqual(["chan_SIB", "chan_SIB2"]);
  });

  test("recordThreadSeen keeps the project map", () => {
    seen.markProjectHinted("chan_KEEP", { home });
    seen.recordThreadSeen({ home, tmpDir: tmp, force: true, now: Date.now() + 3 * 24 * 3600 * 1000 });
    expect(seen.projectHinted("chan_KEEP", home)).toBe(true);
  });
});

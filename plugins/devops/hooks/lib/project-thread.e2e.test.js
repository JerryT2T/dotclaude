import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// One turn of a Claude Projects thread through the REAL hook scripts and the
// offline card renderer, as child processes — the way Claude Code runs them.
// Three worlds: the feature on (alpha pin), a thread without it (stable pin:
// silent, nothing blocks), and an ordinary Desktop session (unchanged).
// Prompt and transcript shapes follow a real thread (2026-11-21), ids made up.
const PLUGIN_ROOT = path.resolve(__dirname, "..", "..");
const HOOK = (rel) => path.join(PLUGIN_ROOT, "hooks", rel);
const RENDERER = path.join(PLUGIN_ROOT, "mcp-server", "index.js");

const TITLE = "Rename the project folders";
const wake = (text) =>
  '<wake reason="mention" current-time="2026-11-21T21:51:27Z">\n  <project id="chan_01TESTTEST" type="project">\n' +
  `    <message trigger="true" from="human" trust="principal" author-id="user_01TEST" id="cmsg_01TEST" mention="true">${text}</message>\n  </project>\n</wake>\n`;

let root;

/** A world: its own HOME (channel pin), tmp dir (session flags), project and transcript. */
function world(name, channel) {
  const home = path.join(root, name, "home");
  const tmp = path.join(root, name, "tmp");
  const cwd = path.join(root, name, "project");
  fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "plugins", ".channels.json"), JSON.stringify({ dotclaude: channel }));
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
  const sid = `thread-e2e-${name}`;
  // Where the renderer looks a session's transcript up: <home>/.claude/projects/<slug of cwd>/<id>.jsonl
  const slug = path.join(home, ".claude", "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
  fs.mkdirSync(slug, { recursive: true });
  const transcript = path.join(slug, sid + ".jsonl");
  const env = {
    ...process.env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TEMP: tmp, TMP: tmp,
    CLAUDE_CODE_ENTRYPOINT: "claude-desktop", DEVOPS_COMPLETION_NO_USAGE: "1", DEVOPS_CARD_PREGATE: "0", DOTCLAUDE_CARD_HARD_STOP: "0",
  };
  delete env.CLAUDE_PLUGIN_ROOT;
  const w = { sid, tmp, cwd, transcript, env };
  w.base = { session_id: sid, transcript_path: transcript, cwd };
  w.append = (entry) => fs.appendFileSync(transcript, JSON.stringify(entry) + "\n");
  w.flag = (prefix) => fs.existsSync(path.join(tmp, `${prefix}-${sid}`));
  return w;
}

function exec(file, args, w, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], { cwd: w.cwd, env: w.env });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input === undefined ? "" : JSON.stringify(input));
  });
}

/** A hook's reply as the model would read it: the additional context, else the raw stdout. */
async function hook(rel, w, input) {
  const { stdout } = await exec(HOOK(rel), [], w, { ...w.base, ...input });
  try { return JSON.parse(stdout).hookSpecificOutput.additionalContext || ""; } catch { return stdout; }
}
const prompt = (w, text) => ({ hook_event_name: "UserPromptSubmit", prompt: text });
const tool = (tool_name, tool_input = {}) => ({ hook_event_name: "PostToolUse", tool_name, tool_input, tool_response: "ok" });
const renameEntry = (title) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "r" + Math.random(), name: "mcp__hearthbot__rename_thread", input: { title } }] } });

async function render(w) {
  const payload = path.join(w.cwd, "card.json");
  fs.writeFileSync(payload, JSON.stringify({
    variant: "analysis", summary: "Folder rename prepared", answer: "Nothing renamed yet: both folders are in use.",
    lang: "en", cwd: w.cwd, session_id: w.sid, open: [{ text: "Close the sessions, then write “go”", reply: "go" }],
  }));
  return exec(RENDERER, ["--render-card", payload], w);
}

beforeAll(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "thread-e2e-")); });
afterAll(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort temp cleanup */ } });

describe("a project thread with the feature (alpha)", () => {
  let w;
  beforeAll(() => {
    w = world("alpha", "alpha");
    w.append({ type: "user", uuid: "u1", projectsUserTurn: true, message: { role: "user", content: wake("rename the folders") } });
  });

  test("the wake prompt marks the session and asks for the thread title, not the sidebar title", async () => {
    await hook("user-prompt-submit/prompt.flow.silent-turn.js", w, prompt(w, wake("rename the folders")));
    expect(w.flag("dotclaude-devops-project-thread")).toBe(true);
    const out = await hook("user-prompt-submit/prompt.flow.title-work.js", w, prompt(w, wake("rename the folders")));
    expect(out).toContain('mcp__hearthbot__rename_thread {title:"⏳ ➜ 🤖 " + <this thread\'s current title');
    expect(out).not.toMatch(/set_session_title|get_session|sessionTitle/);
  });

  test("the card contract names the thread reply", async () => {
    const out = await hook("post-tool-use/post.flow.completion.js", w, tool("PowerShell", { command: "Get-ChildItem" }));
    expect(out).toContain("COMPLETION CARD when ALL work is done");
    expect(out).toContain("Project thread: the card is your result reply");
  });

  test("a reply without the card under a ⏳ title gets the head-off rename, once per prompt", async () => {
    w.append(renameEntry(`⏳ ➜ 🤖 ${TITLE}`));
    const reply = tool("mcp__hearthbot__post_message", { text: "Nothing renamed yet." });
    const first = await hook("post-tool-use/post.flow.completion.js", w, reply);
    expect(first).toContain(`mcp__hearthbot__rename_thread {title:"${TITLE}"}`);
    const second = await hook("post-tool-use/post.flow.completion.js", w, reply);
    expect(second).not.toContain("rename_thread");
  });

  test("a finished checklist asks for the card", async () => {
    const out = await hook("post-tool-use/post.flow.completion.js", w, tool("mcp__hearthbot__update_progress_checklist", { text: "Rename\n\n✓ found\n✓ checked" }));
    expect(out).toContain("[completion-flow] Checklist complete");
    expect(out).toContain("mcp__hearthbot__post_widget");
  });

  test("the renderer hands back the visual card for post_widget, the markdown as fallback, and the exact thread rename", async () => {
    const { code, stdout, stderr } = await render(w);
    expect(code).toBe(0);
    expect(stdout).toContain("Nothing renamed yet: both folders are in use.");
    expect(stdout).toContain("✨✨✨ Folder rename prepared ✨✨✨");
    expect(stdout).not.toContain("&nbsp;");
    expect(stderr).toContain("Post it with ONE mcp__hearthbot__post_widget call");
    expect(stderr).toContain('title:"completion_card_body"');
    expect(stderr).toContain('text "✨✨✨ Folder rename prepared ✨✨✨');
    expect(stderr).toMatch(/----- widget_code -----\n[\s\S]*id="dc-card"[\s\S]*cdn\.jsdelivr\.net[\s\S]*----- end widget_code -----/);
    expect(stderr).toContain("the fallback markdown on stdout");
    expect(stderr).toContain(`mcp__hearthbot__rename_thread {title:"👉 ➜ 📊 ${TITLE}"}`);
    expect(stderr).not.toMatch(/set_session_title|CARD WIDGET|WRAP_UP_ARGS|mcp__visualize__show_widget with/);
    expect(w.flag("dotclaude-devops-card-widget")).toBe(false);
    expect(w.flag("dotclaude-devops-card-rendered")).toBe(true);
  });

  test("the posted card ends the turn; the Stop gate passes and clears its flags", async () => {
    w.append(renameEntry(`👉 ➜ 📊 ${TITLE}`));
    const out = await hook("post-tool-use/post.flow.completion.js", w, tool("mcp__hearthbot__post_message", { text: "### **✨✨✨ Folder rename prepared ✨✨✨**" }));
    expect(out).toContain("[completion-flow] Card posted");
    expect(w.flag("dotclaude-devops-work-happened")).toBe(true);
    const stop = await exec(HOOK("stop/stop.flow.guard.js"), [], w, { ...w.base, hook_event_name: "Stop", stop_hook_active: false });
    expect(stop.stdout).toBe("");
    expect(w.flag("dotclaude-devops-work-happened")).toBe(false);
    expect(w.flag("dotclaude-devops-card-rendered")).toBe(false);
    expect(w.flag("dotclaude-devops-project-thread")).toBe(true);
  });

  test("the card posted as a widget ends the turn like the markdown post", async () => {
    const out = await hook("post-tool-use/post.flow.completion.js", w, tool("mcp__hearthbot__post_widget", { widget: "show_widget", input: { title: "completion_card_body", widget_code: "<div id=\"dc-card\"></div>" }, text: "✨✨✨ Folder rename prepared ✨✨✨ · 👉 decide" }));
    expect(out).toContain("[completion-flow] Card posted");
  });

  test("the next wake puts the hourglass back with the exact title", async () => {
    w.append({ type: "user", uuid: "u2", projectsUserTurn: true, message: { role: "user", content: wake("go") } });
    const out = await hook("user-prompt-submit/prompt.flow.title-work.js", w, prompt(w, wake("go")));
    expect(out).toContain(`mcp__hearthbot__rename_thread {title:"⏳ ➜ 🤖 ${TITLE}"}`);
  });
});

describe("a project thread without the feature (stable)", () => {
  let w;
  beforeAll(() => {
    w = world("stable", "stable");
    w.append({ type: "user", uuid: "u1", projectsUserTurn: true, message: { role: "user", content: wake("rename the folders") } });
  });

  test("no title instruction, no card contract, no thread hints", async () => {
    await hook("user-prompt-submit/prompt.flow.silent-turn.js", w, prompt(w, wake("rename the folders")));
    expect(await hook("user-prompt-submit/prompt.flow.title-work.js", w, prompt(w, wake("rename the folders")))).toBe("");
    const first = await hook("post-tool-use/post.flow.completion.js", w, tool("PowerShell", { command: "Get-ChildItem" }));
    expect(first).not.toMatch(/COMPLETION CARD|Project thread/);
    w.append(renameEntry(`⏳ ➜ 🤖 ${TITLE}`));
    const reply = await hook("post-tool-use/post.flow.completion.js", w, tool("mcp__hearthbot__post_message", { text: "Nothing renamed yet." }));
    expect(reply).not.toMatch(/rename_thread|COMPLETION CARD/);
    const checklist = await hook("post-tool-use/post.flow.completion.js", w, tool("mcp__hearthbot__update_progress_checklist", { text: "x\n\n✓ a" }));
    expect(checklist).not.toContain("Checklist complete");
  });

  test("the Stop gate still never blocks a thread", async () => {
    expect(w.flag("dotclaude-devops-work-happened")).toBe(true);
    const stop = await exec(HOOK("stop/stop.flow.guard.js"), [], w, { ...w.base, hook_event_name: "Stop", stop_hook_active: false });
    expect(stop.stdout).toBe("");
    expect(w.flag("dotclaude-devops-work-happened")).toBe(false);
  });

  test("the renderer keeps its Desktop form", async () => {
    const { code, stdout, stderr } = await render(w);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe("");
    expect(stderr).toContain("mcp__visualize__show_widget");
    expect(stderr).not.toContain("mcp__hearthbot__");
  });
});

describe("an ordinary Desktop session stays as it was", () => {
  let w;
  beforeAll(() => {
    w = world("desktop", "alpha");
    w.append({ type: "user", uuid: "u1", message: { role: "user", content: "rename the folders" } });
    w.append({ type: "custom-title", customTitle: "Folder rename", sessionId: w.sid });
  });

  test("title-work names the sidebar title, the contract no thread", async () => {
    await hook("user-prompt-submit/prompt.flow.silent-turn.js", w, prompt(w, "rename the folders"));
    expect(w.flag("dotclaude-devops-project-thread")).toBe(false);
    const out = await hook("user-prompt-submit/prompt.flow.title-work.js", w, prompt(w, "rename the folders"));
    expect(out).toContain("mcp__ccd_session_mgmt__set_session_title");
    expect(out).not.toContain("mcp__hearthbot__");
    const first = await hook("post-tool-use/post.flow.completion.js", w, tool("PowerShell", { command: "Get-ChildItem" }));
    expect(first).toContain("COMPLETION CARD when ALL work is done");
    expect(first).not.toContain("Project thread");
  });

  test("a card-less turn end is still blocked", async () => {
    w.append({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "p1", name: "PowerShell", input: { command: "Get-ChildItem" } }] } });
    w.append({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "p1", content: "ok" }] } });
    const stop = await exec(HOOK("stop/stop.flow.guard.js"), [], w, { ...w.base, hook_event_name: "Stop", stop_hook_active: false });
    expect(stop.stdout).toContain('"decision":"block"');
    expect(stop.stdout).toContain("Completion card required");
  });

  test("the renderer draws the Desktop widget", async () => {
    const { stdout, stderr } = await render(w);
    expect(stdout.trim()).toBe("");
    expect(stderr).toContain("mcp__visualize__show_widget");
    expect(stderr).not.toContain("mcp__hearthbot__");
  });
});

describe("the Stop gate in a thread: stuck checklist and card-less ship (#1250)", () => {
  const checklist = (text) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "c" + Math.random(), name: "mcp__hearthbot__update_progress_checklist", input: { text } }] } });
  const stop = (w, extra = {}) => exec(HOOK("stop/stop.flow.guard.js"), [], w, { ...w.base, hook_event_name: "Stop", stop_hook_active: false, ...extra });
  const setFlag = (w, prefix) => fs.writeFileSync(path.join(w.tmp, `${prefix}-${w.sid}`), "1");
  const thread = async (name) => {
    const w = world(name, "alpha");
    w.append({ type: "user", uuid: "u1", projectsUserTurn: true, message: { role: "user", content: wake("ship") } });
    await hook("user-prompt-submit/prompt.flow.silent-turn.js", w, prompt(w, wake("ship")));
    return w;
  };

  test("a last checklist with a ✱ line and no live work blocks once", async () => {
    const w = await thread("stuck-checklist");
    w.append(checklist("Backlog\n\n✓ build\n✱ Ship läuft"));
    const first = await stop(w);
    const out = JSON.parse(first.stdout);
    expect(out.decision).toBe("block");
    expect(out.reason).toContain("✱ Ship läuft");
    expect(out.reason).toContain("update_progress_checklist");
    expect((await stop(w, { stop_hook_active: true })).stdout).toBe("");
  });

  test("a later fully-done checklist passes", async () => {
    const w = await thread("done-checklist");
    w.append(checklist("Backlog\n\n✓ build\n✱ Ship läuft"));
    w.append(checklist("Backlog\n\n✓ build\n✓ Ship"));
    expect((await stop(w)).stdout).toBe("");
  });

  test("a ✱ line with live background work passes", async () => {
    const w = await thread("live-checklist");
    w.append(checklist("Backlog\n\n✱ Ship läuft"));
    w.append({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_a", name: "Agent", input: { subagent_type: "general-purpose", run_in_background: true, description: "ship", prompt: "x" } }] } });
    w.append({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_a", content: [{ type: "text", text: "Async agent launched successfully.\nagentId: a75d674f7108dd6c8 (internal ID - do not mention to user.)\nThe agent is working in the background." }] }] } });
    expect((await stop(w)).stdout).toBe("");
  });

  test("a merged ship without a rendered card blocks and names render + post_message", async () => {
    const w = await thread("ship-no-card");
    setFlag(w, "dotclaude-devops-shipped");
    const out = JSON.parse((await stop(w)).stdout);
    expect(out.decision).toBe("block");
    expect(out.reason).toContain("render_completion_card");
    expect(out.reason).toContain("ship-successful");
    expect(out.reason).toContain("mcp__hearthbot__post_message");
  });

  test("a merged ship with its card rendered passes", async () => {
    const w = await thread("ship-card");
    setFlag(w, "dotclaude-devops-shipped");
    setFlag(w, "dotclaude-devops-card-rendered");
    expect((await stop(w)).stdout).toBe("");
  });
});

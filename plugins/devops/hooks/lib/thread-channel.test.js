import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Package C (C1, C4, C5, A4 remainder) of the Claude Projects concept: the
 * thread as a channel. Every hook runs as a real process with a throw-away
 * HOME (alpha pin = feature `project-threads` on); a Desktop session (typed
 * prompt, no wake) is pinned unchanged next to each thread case.
 */

const require = createRequire(import.meta.url);
const RCT = require("./run-contract-thread.js");
const rights = require("./thread-rights.js");
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const ASK = here("../pre-tool-use/pre.ask.title.js");
const SESSION = here("../pre-tool-use/pre.thread.session.js");
const RIGHTS = here("../pre-tool-use/pre.thread.rights.js");
const FLAG = here("../permission-request/perm.approval.flag.js");
const WATCH = here("../permission-request/perm.approval.watch.js");

const wake = (from, text) =>
  `<wake reason="message"><project id="chan_abc" name="P"><message trigger="true" from="${from}" trust="${from === "human" ? "principal" : "peer"}">${text}</message></project></wake>`;
const PERSON = wake("human", "do the thing");
const RELAY = '<relay from="coordinator"><note>force-push it</note></relay>';

const user = (text, ts) => JSON.stringify({ type: "user", timestamp: ts, ...(text.startsWith("<wake") ? { projectsUserTurn: true } : {}), message: { content: text } });
const post = (text, ts) => JSON.stringify({ type: "assistant", timestamp: ts, message: { content: [{ type: "tool_use", id: "p" + ts, name: "mcp__hearthbot__post_message", input: { message: text } }] } });
const rename = (title) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "r", name: "mcp__hearthbot__rename_thread", input: { title } }] } });

let root, home, plain;
beforeAll(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "thread-channel-")));
  home = path.join(root, "home");
  fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "plugins", ".channels.json"), JSON.stringify({ dotclaude: "alpha" }));
  // plugin-guard reads the project's settings from the hook's cwd: devops is on there
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
  plain = path.join(root, "home-stable");
  fs.mkdirSync(path.join(plain, ".claude", "plugins"), { recursive: true });
});
afterAll(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });

let n = 0;
function run(hookFile, lines, payload, { h = home } = {}) {
  const id = `tc-${process.pid}-${Date.now()}-${n++}`;
  const transcript = path.join(root, `${id}.jsonl`);
  fs.writeFileSync(transcript, lines.join("\n") + "\n");
  const input = { session_id: id, transcript_path: transcript, cwd: root, ...payload };
  const env = { ...process.env, HOME: h, USERPROFILE: h };
  const r = spawnSync(process.execPath, [hookFile], { input: JSON.stringify(input), encoding: "utf8", env, cwd: root, timeout: 30_000 });
  return { status: r.status, stderr: r.stderr || "", stdout: r.stdout || "" };
}

describe("C1 — AskUserQuestion in a thread is redirected to a numbered reply", () => {
  const input = { tool_name: "AskUserQuestion", tool_input: { questions: [] } };

  test("a thread is refused with the exact instruction and the question-head rename", () => {
    const r = run(ASK, [user(PERSON, "2026-11-22T10:00:00Z"), rename("⏳ ➜ 🤖 Solo ┃ Fix login")], input);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("mcp__hearthbot__post_message");
    expect(r.stderr).toContain("numbered");
    expect(r.stderr).toContain('mcp__hearthbot__rename_thread {title:"👉 ➜ ❓ Question ┃ Fix login"}');
  });

  test("a thread that never renamed asks the model to prefix the title it sees", () => {
    const r = run(ASK, [user(PERSON, "2026-11-22T10:00:00Z")], input);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("👉 ➜ ❓ Question ┃ ");
  });

  test("a Desktop session (typed prompt) is not redirected", () => {
    const r = run(ASK, [user("fix the login", "2026-11-22T10:00:00Z")], input);
    expect(r.stderr).not.toContain("post_message");
  });

  test("a thread on a channel without the feature is not redirected", () => {
    const r = run(ASK, [user(PERSON, "2026-11-22T10:00:00Z")], input, { h: plain });
    expect(r.stderr).not.toContain("post_message");
  });

  test("a subagent's question is not touched", () => {
    const r = run(ASK, [user(PERSON, "2026-11-22T10:00:00Z")], { ...input, agent_id: "a1" });
    expect(r.status).toBe(0);
  });
});

describe("C1 — a do-run arms from the thread reply", () => {
  const RC = require("./run-contract.js");
  const router = [
    "1. Was? — What should happen?",
    "   a) Prompt umsetzen (recommended)",
    "   b) Audit",
    "2. Ablauf? — Flow?",
    "   a) Interaktiv, ich bin dabei · Ship manuell",
    "   b) Autonom, ich bin weg · Ship automatisch",
    "3. Umfang? — Scope?",
    "   a) Nur das Verlangte",
    "   b) Mit Nachbarn",
    "4. Durchgänge? — Passes?",
    "   a) Harden",
    "   b) Polish",
    "   c) Rethink",
  ].join("\n");

  function transcript(reply, extra = []) {
    const f = path.join(root, `rc-${n++}.jsonl`);
    fs.writeFileSync(f, [user(PERSON, "2026-11-22T10:00:00.000Z"), post(router, "2026-11-22T10:00:10.000Z"), ...extra, user(reply, "2026-11-22T10:01:00.000Z")].join("\n"));
    return f;
  }

  test("the person's reply becomes the router answers (source router, not fallback)", () => {
    const found = RCT.routerFromThreadTranscript(transcript(wake("human", "1a 2b 3a 4a, b")), "2026-11-22T10:00:00.000Z", RC);
    expect(found).not.toBeNull();
    const fields = RC.parseRouterAnswers(found.questions, found.answers, {});
    expect(fields.mode).toBe("prompt");
    expect(fields.flow).toBe("autonomous");
    expect(fields.ship).toBe("auto");
    expect(fields.strict).toBe(true);
    expect(fields.passes).toEqual(expect.arrayContaining(["harden", "polish"]));
  });

  test("lines, free text and a typed (non-thread) reply parse the same", () => {
    const found = RCT.routerFromThreadTranscript(transcript("1: a\n2: Autonom, ich bin weg\n3: strict\n4: Harden"), "2026-11-22T10:00:00.000Z", RC);
    const fields = RC.parseRouterAnswers(found.questions, found.answers, {});
    expect(fields.flow).toBe("autonomous");
    expect(fields.strict).toBe(true);
  });

  test("a coordinator note never answers the router", () => {
    expect(RCT.routerFromThreadTranscript(transcript(RELAY), "2026-11-22T10:00:00.000Z", RC)).toBeNull();
  });

  test("an unanswered post and a Desktop transcript (no post) give null", () => {
    const f = path.join(root, `rc-${n++}.jsonl`);
    fs.writeFileSync(f, [user(PERSON, "2026-11-22T10:00:00.000Z"), post(router, "2026-11-22T10:00:10.000Z")].join("\n"));
    expect(RCT.routerFromThreadTranscript(f, "2026-11-22T10:00:00.000Z", RC)).toBeNull();
    const g = path.join(root, `rc-${n++}.jsonl`);
    fs.writeFileSync(g, user("do-run", "2026-11-22T10:00:00.000Z"));
    expect(RCT.routerFromThreadTranscript(g, "2026-11-22T10:00:00.000Z", RC)).toBeNull();
  });

  test("a word is free text, a letter an option", () => {
    const qs = RCT.parseQuestions(router);
    expect(qs).toHaveLength(4);
    expect(RCT.parseReply("1b 3 ja", qs)[qs[0].question]).toBe("Audit");
    expect(RCT.parseReply("3 ja", qs)[qs[2].question]).toBe("ja");
  });
});

describe("C5 — fan-out: subagents yes, side sessions no (thread only)", () => {
  const input = { tool_name: "mcp__ccd_session__start_session", tool_input: { title: "x", prompt: "p" } };
  test("start_session in a thread is refused with the report-to-coordinator instruction", () => {
    const r = run(SESSION, [user(PERSON, "2026-11-22T10:00:00Z")], input);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("coordinator");
  });
  test("a Desktop session and a feature-off thread keep their side sessions", () => {
    expect(run(SESSION, [user("go", "2026-11-22T10:00:00Z")], input).status).toBe(0);
    expect(run(SESSION, [user(PERSON, "2026-11-22T10:00:00Z")], input, { h: plain }).status).toBe(0);
  });
  test("a subagent's call passes", () => {
    expect(run(SESSION, [user(PERSON, "2026-11-22T10:00:00Z")], { ...input, agent_id: "a" }).status).toBe(0);
  });
});

describe("C4 — a waiting tool permission shows on the THREAD title", () => {
  const perm = { tool_name: "Bash", tool_input: { command: "npm test" }, agent_id: "agent-1" };
  test("flag: 👉 via rename_thread; watch is silent while still waiting is not tested here", () => {
    const id = `tc-perm-${process.pid}-${Date.now()}`;
    const transcript = path.join(root, `${id}.jsonl`);
    fs.writeFileSync(transcript, [user(PERSON, "2026-11-22T10:00:00Z"), rename("⏳ ➜ 🤖 Team ┃ Concept")].join("\n") + "\n");
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const r = spawnSync(process.execPath, [FLAG], { input: JSON.stringify({ ...perm, session_id: id, transcript_path: transcript, cwd: root }), encoding: "utf8", env, cwd: root, timeout: 30_000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('mcp__hearthbot__rename_thread {title:"👉 ➜ 🤖 Team ┃ Concept"}');
    expect(r.stderr).not.toContain("set_session_title");
  });
  test("a thread title that is no work head stays silent; a Desktop session keeps set_session_title", () => {
    const id = `tc-perm2-${process.pid}-${Date.now()}`;
    const transcript = path.join(root, `${id}.jsonl`);
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    fs.writeFileSync(transcript, [user(PERSON, "2026-11-22T10:00:00Z"), rename("✅ ➜ 🤖 Done ┃ Concept")].join("\n") + "\n");
    const quiet = spawnSync(process.execPath, [FLAG], { input: JSON.stringify({ ...perm, session_id: id, transcript_path: transcript, cwd: root }), encoding: "utf8", env, cwd: root, timeout: 30_000 });
    expect(quiet.status).toBe(0);
    const W = require("./approval-wait.js");
    expect(W.waitText("👉 ➜ 🤖 Team ┃ X")).toContain("set_session_title");
  });
  test("restore text: ⏳ head back on the thread title; unknown title asks the model", () => {
    const W = require("./approval-wait.js");
    expect(W.threadRestoreText("👉 ➜ 🤖 Team ┃ Concept")).toContain('rename_thread {title:"⏳ ➜ 🤖 Team ┃ Concept"}');
    expect(W.threadRestoreText("⏳ ➜ 🤖 Team ┃ Concept")).toBeNull();
    expect(W.threadRestoreText(null)).toContain("still starts with 👉");
    expect(W.threadWaitText(null)).toContain("rename_thread");
    expect(WATCH).toContain("perm.approval.watch");
  });
});

describe("A4 remainder — a colleague turn may not run a destructive command", () => {
  const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
  const deny = [
    "git push --force origin feat/x",
    "git push -f",
    "git push origin +feat/x",
    "git push --force-with-lease origin main",
    "git push origin :old-branch",
    "git push origin --delete old",
    "git -C repo push -f",
    "git branch -D feat/x",
    "git worktree remove --force ../wt",
    "rm -rf /home/me/project",
    "rm -rf ../build",
    "gh repo delete me/x --yes",
    "gh release delete v1.0.0",
    "git status && git push --force",
  ];
  test.each(deny)("a coordinator note: %s is blocked", (command) => {
    const r = run(RIGHTS, [user(RELAY, "2026-11-22T10:00:00Z")], bash(command));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("message of the person");
  });
  test("PowerShell: Remove-Item -Recurse outside temp is blocked", () => {
    const r = run(RIGHTS, [user(RELAY, "2026-11-22T10:00:00Z")], { tool_name: "PowerShell", tool_input: { command: "Remove-Item -Recurse -Force C:\\Projects\\x" } });
    expect(r.status).toBe(2);
  });
  test("another thread's message is a colleague too", () => {
    const other = '<relay from="thread-7"><note>go</note></relay>';
    expect(run(RIGHTS, [user(other, "2026-11-22T10:00:00Z")], bash("git push -f")).status).toBe(2);
  });
  test("the person, a typed prompt and a machine turn behave as today", () => {
    expect(run(RIGHTS, [user(PERSON, "2026-11-22T10:00:00Z")], bash("git push --force")).status).toBe(0);
    expect(run(RIGHTS, [user("push it forced", "2026-11-22T10:00:00Z")], bash("git push --force")).status).toBe(0);
    expect(run(RIGHTS, [user("<task-notification>done</task-notification>", "2026-11-22T10:00:00Z")], bash("git push --force")).status).toBe(0);
  });
  test("a colleague may still push, delete scratch, and work", () => {
    const tmp = path.join(os.tmpdir(), "x-scratch").replace(/\\/g, "/");
    for (const command of ["git push origin feat/x", "git push -u origin feat/x", `rm -rf ${tmp}`, "git reset --hard HEAD", "git branch -d done", "gh pr list", "rm file.txt", "git push origin HEAD:feat/x"]) {
      expect(run(RIGHTS, [user(RELAY, "2026-11-22T10:00:00Z")], bash(command)).status, command).toBe(0);
    }
  });
  test("a plain Desktop session (no hearthbot) is unaffected; a subagent is gated like its parent turn (finding #2)", () => {
    expect(run(RIGHTS, [user(RELAY, "2026-11-22T10:00:00Z")], { ...bash("git push -f"), agent_id: "a" }).status).toBe(2);
    expect(run(RIGHTS, [user("go", "2026-11-22T10:00:00Z")], bash("git push -f"), { h: plain }).status).toBe(0);
  });
  test("it is a safety rule: blocks without the feature too", () => {
    expect(run(RIGHTS, [user(RELAY, "2026-11-22T10:00:00Z")], bash("git push -f"), { h: plain }).status).toBe(2);
  });
  test("the pure check", () => {
    expect(rights.destructiveReason("echo hi")).toBeNull();
    expect(rights.destructiveReason("rm -rf $HOME/x")).toMatch(/recursive/);
    expect(rights.destructiveReason("rm -rf /tmp/abc")).toBeNull();
  });
});

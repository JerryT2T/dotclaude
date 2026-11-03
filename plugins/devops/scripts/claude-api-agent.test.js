import { describe, test, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

// The credit-first route for read-only side work: an agent loop of our own
// on the Messages API (a `claude` child from a desktop session is billed as
// Claude Code). It must stay inside its root, follow the tool-use protocol
// (all results in one user turn, pause_turn resent), respect the switch and
// the budget, and keep the claude-api-safe exit-code contract.

const require = createRequire(import.meta.url);
const agent = require("./claude-api-agent.js");
const safe = require("./claude-api-safe.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-api-agent-"));
const home = path.join(tmp, "home");
const proj = path.join(tmp, "proj");
afterAll(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

beforeEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.rmSync(proj, { recursive: true, force: true });
  fs.mkdirSync(path.join(proj, "src"), { recursive: true });
  fs.mkdirSync(path.join(proj, "node_modules", "x"), { recursive: true });
  fs.writeFileSync(path.join(proj, "src", "a.js"), "const answer = 42;\nmodule.exports = answer;\n");
  fs.writeFileSync(path.join(proj, "node_modules", "x", "i.js"), "const answer = 0;\n");
  fs.writeFileSync(path.join(tmp, "secret.txt"), "outside");
});

function enable({ key = true } = {}) {
  fs.writeFileSync(path.join(home, ".claude", "devops-config.json"), JSON.stringify({ apiCredit: { enabled: true } }));
  if (key) fs.writeFileSync(path.join(home, ".claude", "devops-api.env"), "DEVOPS_ANTHROPIC_API_KEY=sk-test\n");
}

// Scripted API: each call returns the next response; records request bodies.
function scripted(responses, calls = []) {
  return async (url, init) => {
    calls.push(JSON.parse(init.body));
    const r = responses.shift();
    return { ok: r.status ? r.status < 300 : true, status: r.status || 200, json: async () => r.body || r };
  };
}
async function runAgent(argv, extra = {}) {
  const out = [];
  const err = [];
  const rc = await agent.run(argv, { env: {}, home, cwd: proj, out: (s) => out.push(s), err: (s) => err.push(s), ...extra });
  return { rc, out: out.join(""), err: err.join("") };
}
const usage = { input_tokens: 100, output_tokens: 50 };

describe("gates", () => {
  test("switch off → 126, no request", async () => {
    const calls = [];
    const r = await runAgent(["task"], { fetchImpl: scripted([], calls) });
    expect(r.rc).toBe(safe.RC.DISABLED);
    expect(calls).toHaveLength(0);
  });
  test("no key → 127", async () => {
    enable({ key: false });
    expect((await runAgent(["task"])).rc).toBe(safe.RC.NO_KEY);
  });
});

describe("tool loop", () => {
  beforeEach(() => enable());

  test("runs grep + read_file, returns all results in one user turn, then the final answer", async () => {
    const calls = [];
    const fetchImpl = scripted([
      { content: [
        { type: "tool_use", id: "t1", name: "grep", input: { pattern: "answer" } },
        { type: "tool_use", id: "t2", name: "read_file", input: { path: "src/a.js" } },
      ], stop_reason: "tool_use", usage },
      { content: [{ type: "text", text: "It is 42 (src/a.js:1)." }], stop_reason: "end_turn", usage },
    ], calls);
    const r = await runAgent(["find the answer"], { fetchImpl });
    expect(r.rc).toBe(0);
    expect(r.out).toBe("It is 42 (src/a.js:1).\n");
    const results = calls[1].messages[2].content;
    expect(results.map((b) => b.tool_use_id)).toEqual(["t1", "t2"]);
    expect(results[0].content).toContain("src/a.js:1: const answer = 42;");
    expect(results[0].content).not.toContain("node_modules");
    expect(results[1].content).toContain("1\tconst answer = 42;");
    expect(calls[0].cache_control).toEqual({ type: "ephemeral" });
    expect(r.err).toMatch(/on API credit/);
  });

  test("a path outside the root is an error result, never read", async () => {
    const calls = [];
    const fetchImpl = scripted([
      { content: [{ type: "tool_use", id: "t1", name: "read_file", input: { path: "../secret.txt" } }], stop_reason: "tool_use", usage },
      { content: [{ type: "text", text: "denied" }], stop_reason: "end_turn", usage },
    ], calls);
    await runAgent(["x"], { fetchImpl });
    const res = calls[1].messages[2].content[0];
    expect(res.is_error).toBe(true);
    expect(res.content).toMatch(/outside the project root/);
    expect(res.content).not.toContain("outside\n");
  });

  test("secret-shaped files are never listed, read or searched", async () => {
    fs.writeFileSync(path.join(proj, ".env"), "API_KEY=answer-secret\n");
    fs.writeFileSync(path.join(proj, "devops-api.env"), "DEVOPS_ANTHROPIC_API_KEY=answer-secret\n");
    const calls = [];
    const fetchImpl = scripted([
      { content: [
        { type: "tool_use", id: "t1", name: "read_file", input: { path: ".env" } },
        { type: "tool_use", id: "t2", name: "grep", input: { pattern: "answer" } },
        { type: "tool_use", id: "t3", name: "list_files", input: { path: "." } },
      ], stop_reason: "tool_use", usage },
      { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage },
    ], calls);
    await runAgent(["x"], { fetchImpl });
    const [read, grep, list] = calls[1].messages[2].content;
    expect(read.is_error).toBe(true);
    expect(JSON.stringify(calls[1])).not.toContain("answer-secret");
    expect(grep.content).toContain("src/a.js:1");
    expect(list.content).not.toMatch(/\.env/);
  });

  test("tool-turn narration is never relayed as the answer: an early end returns rc != 0", async () => {
    const fetchImpl = scripted([
      { content: [{ type: "text", text: "I'll start by reading a.js" }, { type: "tool_use", id: "t1", name: "list_files", input: { path: "." } }], stop_reason: "tool_use", usage },
      { status: 500, body: { error: { message: "overloaded" } } },
    ]);
    const r = await runAgent(["x"], { fetchImpl });
    expect(r.rc).not.toBe(0);
    expect(r.out).toBe("");
  });

  test("one usage row per run: summed tokens over all turns, tag, turn count", async () => {
    const fetchImpl = scripted([
      { content: [{ type: "tool_use", id: "t1", name: "list_files", input: { path: "." } }], stop_reason: "tool_use", usage },
      { content: [{ type: "text", text: "done" }], stop_reason: "end_turn", usage },
    ]);
    await runAgent(["--tag", "audit", "x"], { fetchImpl });
    const rows = fs.readFileSync(path.join(home, ".claude", safe.USAGE_FILE), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tool: "agent", tag: "audit", project: "proj", in: 200, out: 100, turns: 2, rc: 0 });
  });

  test("max_tokens without text → rc 1", async () => {
    const fetchImpl = scripted([{ content: [{ type: "thinking", thinking: "…" }], stop_reason: "max_tokens", usage }]);
    expect((await runAgent(["x"], { fetchImpl })).rc).toBe(1);
  });

  test("pause_turn is resent without a tool result", async () => {
    const calls = [];
    const fetchImpl = scripted([
      { content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } }], stop_reason: "pause_turn", usage },
      { content: [{ type: "text", text: "done" }], stop_reason: "end_turn", usage },
    ], calls);
    const r = await runAgent(["--web", "x"], { fetchImpl });
    expect(r.rc).toBe(0);
    expect(calls[1].messages.at(-1).role).toBe("assistant");
    expect(calls[0].tools.map((t) => t.name)).toEqual(["list_files", "read_file", "grep", "web_search", "web_fetch"]);
    expect(calls[0].tools[3].type).toBe("web_search_20260209");
  });

  test("Haiku gets the basic web tool variants", () => {
    expect(agent.webTools("claude-haiku-5-5")[0].type).toBe("web_search_20250305");
  });

  test("credit exhausted mid-run → 75 and the marker is stored", async () => {
    const fetchImpl = scripted([{ status: 400, body: { error: { message: "Your credit balance is too low to access the Anthropic API." } } }]);
    const r = await runAgent(["x"], { fetchImpl });
    expect(r.rc).toBe(safe.RC.LIMIT);
    expect(safe.activeLimit({ home })).not.toBeNull();
  });

  test("budget reached without an answer → rc 1 (caller falls back to the in-session agent)", async () => {
    const big = { input_tokens: 1_000_000, output_tokens: 0 };
    const fetchImpl = scripted([
      { content: [{ type: "tool_use", id: "t1", name: "list_files", input: { path: "." } }], stop_reason: "tool_use", usage: big },
    ]);
    const r = await runAgent(["--max-usd", "1", "x"], { fetchImpl });
    expect(r.rc).toBe(1);
    expect(r.err).toMatch(/budget/);
  });
});

test("costOf prices tokens and web searches", () => {
  const c = agent.costOf("claude-sonnet-5-5", { input_tokens: 1e6, output_tokens: 1e6, server_tool_use: { web_search_requests: 10 } });
  expect(c).toBeCloseTo(2 + 10 + 0.1, 5);
});

describe("secret-file guard (audit 2026-10-20)", () => {
  // `.env::$DATA` only aliases .env on NTFS; on POSIX it is a distinct, harmless name.
  test.each([...(process.platform === "win32" ? [".env::$DATA"] : []), ".env ", ".env.", "id_rsa_work", ".pypirc", ".git-credentials", "prod.tfvars"])(
    "read_file %s is refused",
    (name) => {
      expect(() => agent.runTool(proj, "read_file", { path: name })).toThrow(/off limits|unsupported path form/);
    },
  );

  test("a colon in a name is an NTFS stream only on Windows", () => {
    if (process.platform === "win32") {
      expect(() => agent.runTool(proj, "read_file", { path: "docs/12:00-notes.md" })).toThrow(/unsupported path form/);
      return;
    }
    fs.mkdirSync(path.join(proj, "docs"), { recursive: true });
    fs.writeFileSync(path.join(proj, "docs", "12:00-notes.md"), "noon\n");
    expect(() => agent.runTool(proj, "read_file", { path: "docs/12:00-notes.md" })).not.toThrow();
  });

  test("a symlink to a secret file is refused by its real name", () => {
    fs.writeFileSync(path.join(proj, ".env"), "K=answer-secret\n");
    try { fs.symlinkSync(path.join(proj, ".env"), path.join(proj, "innocent.txt")); } catch { return; /* no symlink right */ }
    expect(() => agent.runTool(proj, "read_file", { path: "innocent.txt" })).toThrow(/off limits/);
  });

  test("ordinary paths and the root itself still work", () => {
    expect(agent.runTool(proj, "list_files", { path: "." })).toContain("src/");
    expect(agent.runTool(proj, "read_file", { path: "src/a.js" })).toContain("answer");
  });
});

describe("model per task", () => {
  beforeEach(() => enable());
  const done = { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage };
  async function modelFor(argv, env = {}) {
    const calls = [];
    await runAgent(argv, { env, fetchImpl: scripted([{ ...done }], calls) });
    return calls[0].model;
  }
  test("scout and --web follow the tag; --locate is Haiku; audit/unknown stay Opus", async () => {
    expect(await modelFor(["t"])).toBe("claude-sonnet-5-5");
    expect(await modelFor(["--web", "t"])).toBe("claude-sonnet-5-5");
    expect(await modelFor(["--locate", "t"])).toBe("claude-haiku-5-5");
    expect(await modelFor(["--tag", "locate", "t"])).toBe("claude-haiku-5-5");
    expect(await modelFor(["--tag", "audit", "t"])).toBe("claude-opus-5-5");
  });
  test("--model and the env var win over the tag", async () => {
    expect(await modelFor(["--model", "claude-opus-5-5", "t"])).toBe("claude-opus-5-5");
    expect(await modelFor(["t"], { CLAUDE_API_AGENT_MODEL: "claude-haiku-5-5" })).toBe("claude-haiku-5-5");
  });
});

describe("context freeze (client-side)", () => {
  const done = () => ({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage });
  const logRows = () => fs.readFileSync(path.join(home, ".claude", "api-credit-usage.jsonl"), "utf8").trim().split(String.fromCharCode(10)).map((l) => JSON.parse(l));
  let bigId = 0;
  const toolTurn = (prompt) => ({
    content: [{ type: "tool_use", id: "t" + (++bigId), name: "list_files", input: { path: "." } }],
    stop_reason: "tool_use",
    usage: { input_tokens: 500, cache_read_input_tokens: prompt - 500, output_tokens: 50 },
  });

  // Fake transport: snapshots each request body as bytes and the headers.
  function capture(responses, seen) {
    return async (url, init) => {
      seen.push({ raw: init.body, body: JSON.parse(init.body), headers: init.headers });
      const r = responses.shift();
      return { ok: !r.status || r.status < 300, status: r.status || 200, json: async () => r.body || r };
    };
  }
  // Prompt sizes grow 20k per turn: 20k..., crossing the 100k cap after turn 5.
  const script = (turns) => [...Array.from({ length: turns }, (_, i) => toolTurn(20000 * (i + 1))), done()];
  const resultsOf = (body) => body.messages.filter((m) => m.role === "user" && Array.isArray(m.content)).flatMap((m) => m.content).filter((b) => b.type === "tool_result");

  test("never sends server-side context_management or the beta header", async () => {
    enable();
    const seen = [];
    await runAgent(["t"], { fetchImpl: capture(script(8), seen) });
    for (const q of seen) {
      expect(q.body.context_management).toBeUndefined();
      expect(q.headers["anthropic-beta"]).toBeUndefined();
      expect(q.body.cache_control).toEqual({ type: "ephemeral" });
    }
  });

  test("clears once at the cap, then resends the identical prefix and no cleared results", async () => {
    enable();
    // Large tool results: list_files over a dir of 400 long file names (~15k tokens).
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(proj, "src", "f".repeat(150) + i + ".js"), "");
    const seen = [];
    const r = await runAgent(["t"], { fetchImpl: capture(script(10), seen) });
    expect(r.rc).toBe(0);
    // Request i (0-based) follows response i-1; prompt >= 100k first after response 4 (5 * 20k).
    const note = agent.CLEARED_NOTE;
    const cleared = seen.map((q) => resultsOf(q.body).filter((b) => b.content === note).length);
    expect(cleared.slice(0, 5)).toEqual([0, 0, 0, 0, 0]); // below the cap: untouched
    expect(cleared[5]).toBe(2); // 5 results, newest 3 kept → 2 cleared, exactly once
    // (b) the frozen prefix is byte-identical on every later turn
    // Byte-identical prefix: every later request begins with the exact bytes of the
    // frozen request's messages (minus the closing bracket), then only appends.
    const prefix = JSON.stringify(seen[5].body.messages).slice(0, -1);
    for (let i = 6; i < seen.length; i++) {
      expect(JSON.stringify(seen[i].body.messages).startsWith(prefix)).toBe(true);
      expect(cleared[i]).toBe(2); // (c) no re-clear, nothing newly cleared
    }
    // (a) one clear logged; results older than the freeze are never full-size again
    const row = logRows()[0];
    expect(row.ctxClears).toBe(1);
    expect(row.ctxClearedTokens).toBeGreaterThan(0);
    for (let i = 6; i < seen.length; i++) {
      const full = resultsOf(seen[i].body).filter((b) => b.content !== note);
      expect(full.length).toBe(resultsOf(seen[i].body).length - 2);
    }
  });

  test("a clear that would free too little waits instead of rewriting the cache", async () => {
    enable();
    const seen = [];
    await runAgent(["t"], { fetchImpl: capture(script(8), seen) }); // tiny results
    expect(seen.every((q) => resultsOf(q.body).every((b) => b.content !== agent.CLEARED_NOTE))).toBe(true);
    expect(logRows()[0].ctxClears).toBe(0);
  });

  test("env DEVOPS_API_CONTEXT_EDITING=0 switches the freeze off", async () => {
    enable();
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(proj, "src", "f".repeat(150) + i + ".js"), "");
    const seen = [];
    await runAgent(["t"], { env: { DEVOPS_API_CONTEXT_EDITING: "0" }, fetchImpl: capture(script(8), seen) });
    expect(seen.every((q) => resultsOf(q.body).every((b) => b.content !== agent.CLEARED_NOTE))).toBe(true);
  });
});

describe("a run nearing a limit answers with what it has", () => {
  const toolTurn = (u = usage) => ({ content: [{ type: "tool_use", id: "t1", name: "list_files", input: { path: "." } }], stop_reason: "tool_use", usage: u });
  const answer = { content: [{ type: "text", text: "Partial result." }], stop_reason: "end_turn", usage };
  const seq = (responses, calls = []) => async (url, init) => { calls.push(JSON.parse(init.body)); const r = responses.shift(); if (typeof r === "function") return r(); return { ok: true, status: 200, json: async () => r }; };
  beforeEach(() => enable());
  const lastUser = (body) => body.messages[body.messages.length - 1].content;

  test("the last turn runs without tools and carries the note", async () => {
    const calls = [];
    const r = await runAgent(["--max-turns", "2", "x"], { fetchImpl: seq([toolTurn(), answer], calls) });
    expect(r.rc).toBe(0);
    expect(r.out).toBe("Partial result.\n");
    expect(r.err).toMatch(/cut short: turn limit/);
    expect(calls[0].tool_choice).toBeUndefined();
    expect(calls[1].tool_choice).toEqual({ type: "none" });
    expect(lastUser(calls[1]).at(-1).text).toMatch(/Do not call more tools/);
  });

  test("75 % of the budget starts the last request", async () => {
    const calls = [];
    const big = { input_tokens: 800000, output_tokens: 0 };
    const r = await runAgent(["--max-usd", "2", "x"], { fetchImpl: seq([toolTurn(big), answer], calls) });
    expect(r.rc).toBe(0);
    expect(r.err).toMatch(/cut short: budget/);
    expect(calls[1].tool_choice).toEqual({ type: "none" });
  });

  test("a hung request asks once for the answer, a first request has nothing to save", async () => {
    const hang = () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; };
    const calls = [];
    const saved = await runAgent(["x"], { fetchImpl: seq([toolTurn(), hang, answer], calls) });
    expect(saved.rc).toBe(0);
    expect(saved.err).toMatch(/cut short: request timeout/);
    expect(calls.at(-1).tool_choice).toEqual({ type: "none" });
    expect(lastUser(calls.at(-1)).filter((b) => b.type === "text")).toHaveLength(1);
    expect((await runAgent(["x"], { fetchImpl: seq([hang]) })).rc).toBe(safe.RC.TIMEOUT);
    expect((await runAgent(["x"], { fetchImpl: seq([toolTurn(), hang, hang]) })).rc).toBe(safe.RC.TIMEOUT);
  });

  test("a review runs at high effort unless the caller says otherwise", async () => {
    const calls = [];
    await runAgent(["--tag", "redteam", "x"], { fetchImpl: seq([answer], calls) });
    await runAgent(["--tag", "redteam", "--effort", "medium", "x"], { fetchImpl: seq([answer], calls) });
    await runAgent(["x"], { fetchImpl: seq([answer], calls) });
    expect(calls.map((c) => c.output_config && c.output_config.effort)).toEqual(["high", "medium", undefined]);
  });
});

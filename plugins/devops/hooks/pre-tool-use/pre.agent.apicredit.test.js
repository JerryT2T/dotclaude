import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { main } = require("./pre.agent.apicredit.js");
const gate = require("../lib/agent-apicredit-gate.js");

let home;
let saved;

function configure({ enabled = true, key = true, limit = false } = {}) {
  const dir = path.join(home, ".claude");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "devops-config.json"), JSON.stringify({ apiCredit: { enabled } }));
  if (key) fs.writeFileSync(path.join(dir, "devops-api.env"), "DEVOPS_ANTHROPIC_API_KEY=sk-test\n");
  if (limit) fs.writeFileSync(path.join(dir, "claude-api-limit.json"), JSON.stringify({ until: new Date(Date.now() + 3600e3).toISOString() }));
}

// A transcript: the user prompt, then optionally an earlier refused spawn of `refusedType`.
function transcript(refusedType = null) {
  const lines = [{ type: "user", message: { role: "user", content: "go" } }];
  if (refusedType) {
    lines.push({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Agent", input: { subagent_type: refusedType, prompt: "x" } }] } });
    lines.push({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: gate.MARKER + " refused" }] } });
  }
  const file = path.join(home, "transcript.jsonl");
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}

function hook(type, over = {}) {
  return {
    tool_name: "Agent",
    tool_use_id: "t2",
    cwd: home,
    transcript_path: over.transcript_path || transcript(),
    tool_input: { subagent_type: type, description: "d", prompt: "find X" },
    ...over,
  };
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "apicredit-"));
  saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, KEY: process.env.DEVOPS_ANTHROPIC_API_KEY, OFF: process.env.DEVOPS_DISABLE_CLAUDE_API };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.DEVOPS_ANTHROPIC_API_KEY;
  delete process.env.DEVOPS_DISABLE_CLAUDE_API;
});

afterEach(() => {
  for (const [k, v] of Object.entries({ HOME: saved.HOME, USERPROFILE: saved.USERPROFILE, DEVOPS_ANTHROPIC_API_KEY: saved.KEY, DEVOPS_DISABLE_CLAUDE_API: saved.OFF })) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  fs.rmSync(home, { recursive: true, force: true });
});

describe("pre.agent.apicredit", () => {
  test.each([["devops:scout", "scout"], ["devops:research", "research"], ["devops:redteam", "redteam"]])("%s is blocked once with the command", (type, tag) => {
    configure();
    const r = main(hook(type));
    expect(r.block).toContain("claude-api-agent.js");
    expect(r.block).toContain(`--tag ${tag}`);
    expect(r.block).toContain("spawn the Agent again");
    if (tag === "research") expect(r.block).toContain("--web");
    else expect(r.block).not.toContain("--web");
  });

  test("the repeat of an already refused type passes; another type is still blocked", () => {
    configure();
    const t = transcript("devops:scout");
    expect(main(hook("devops:scout", { transcript_path: t }))).toBeNull();
    expect(main(hook("devops:research", { transcript_path: t })).block).toContain("--tag research");
  });

  test("a refusal from an earlier turn does not count", () => {
    configure();
    const file = transcript("devops:scout");
    fs.appendFileSync(file, JSON.stringify({ type: "user", message: { role: "user", content: "next turn" } }) + "\n");
    expect(main(hook("devops:scout", { transcript_path: file })).block).toBeTruthy();
  });

  test.each(["rc 75", "rc=124", "exit code 127", "rc 1"])("a prompt citing %s passes", (cite) => {
    configure();
    const h = hook("devops:scout");
    h.tool_input.prompt = `API fallback: ${cite}. find X`;
    expect(main(h)).toBeNull();
  });

  test("credit off, no key, limit active, kill switch -> pass", () => {
    configure({ enabled: false });
    expect(main(hook("devops:scout"))).toBeNull();
    fs.rmSync(path.join(home, ".claude"), { recursive: true, force: true });
    configure({ key: false });
    expect(main(hook("devops:scout"))).toBeNull();
    fs.rmSync(path.join(home, ".claude"), { recursive: true, force: true });
    configure({ limit: true });
    expect(main(hook("devops:scout"))).toBeNull();
    fs.rmSync(path.join(home, ".claude"), { recursive: true, force: true });
    configure();
    process.env.DEVOPS_DISABLE_CLAUDE_API = "1";
    expect(main(hook("devops:scout"))).toBeNull();
  });

  test("the key may come from the environment", () => {
    configure({ key: false });
    process.env.DEVOPS_ANTHROPIC_API_KEY = "sk-env";
    expect(main(hook("devops:scout")).block).toBeTruthy();
  });

  test.each(["general-purpose", "Explore", "devops:builder", undefined])("%s is never blocked", (type) => {
    configure();
    expect(main(hook(type))).toBeNull();
  });

  test("silent inside a subagent and for other tools", () => {
    configure();
    expect(main(hook("devops:scout", { agent_id: "a1" }))).toBeNull();
    expect(main(hook("devops:scout", { tool_name: "Bash" }))).toBeNull();
  });

  test("no readable transcript -> fail open", () => {
    configure();
    expect(main(hook("devops:scout", { transcript_path: path.join(home, "missing.jsonl") }))).toBeNull();
  });

  test("a refusal whose spawn fell off the transcript tail still counts (no re-refusal loop)", () => {
    const tail = [
      JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "gone", content: `${gate.MARKER} refused` }] } }),
    ].join("\n");
    expect(gate.refusedBefore(tail, { subagent_type: "devops:scout" }, "new")).toBe(true);
  });

  test("an internal error fails open", () => {
    configure();
    expect(gate.wouldRefuse({ subagent_type: "devops:scout", prompt: "x" }, "{}\n", "t", { cwd: {}, env: null })).toBe(false);
  });
});

// A transcript of ONE assistant message (shared message.id) holding several Agent spawns.
function batch(inputs, ids) {
  const lines = [{ type: "user", message: { role: "user", content: "go" } }];
  inputs.forEach((input, i) => {
    lines.push({ type: "assistant", message: { id: "msg1", role: "assistant", content: [{ type: "tool_use", id: ids[i], name: "Agent", input }] } });
  });
  const file = path.join(home, "batch.jsonl");
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}

describe("pre.agent.apicredit - shell-needing prompts pass (D1)", () => {
  test.each([
    "gh issue view 12 and judge it",
    "run git log -5 and summarise",
    "npm test must pass",
    "Use npx vitest run",
    "node scripts/x.js then report",
    "curl https://example.com",
    "python build.py",
    "pwsh -File a.ps1",
    "```bash\nls -la\n```",
    "Run the tests and report",
  ])("%j is not refused", (prompt) => {
    configure();
    const h = hook("devops:scout");
    h.tool_input.prompt = prompt;
    expect(gate.needsShell(prompt)).toBe(true);
    expect(main(h)).toBeNull();
  });

  test("a read-only prompt mentioning no command is still refused", () => {
    configure();
    const h = hook("devops:scout");
    h.tool_input.prompt = "Find where the github token is read in src/";
    expect(main(h).block).toContain("claude-api-agent.js");
  });
});

describe("pre.agent.apicredit - one refusal per assistant message (D2)", () => {
  const spawns = ["devops:scout", "devops:scout", "devops:research"].map((t, i) => ({ subagent_type: t, description: `d${i}`, prompt: "find X" }));
  const ids = ["a", "b", "c"];

  test("8 spawns in one message: only the first is refused", () => {
    configure();
    const eight = Array.from({ length: 8 }, (_, i) => ({ subagent_type: "devops:scout", description: `d${i}`, prompt: "find X" }));
    const eightIds = eight.map((_, i) => `t${i}`);
    const file = batch(eight, eightIds);
    const verdicts = eightIds.map((id, i) => !!main(hook("devops:scout", { transcript_path: file, tool_use_id: id, tool_input: eight[i] })));
    expect(verdicts).toEqual([true, false, false, false, false, false, false, false]);
  });

  test("a mixed batch: the first gated spawn leads, other types pass too", () => {
    configure();
    const file = batch(spawns, ids);
    const run = (i) => main(hook(spawns[i].subagent_type, { transcript_path: file, tool_use_id: ids[i], tool_input: spawns[i] }));
    expect(run(0).block).toBeTruthy();
    expect(run(1)).toBeNull();
    expect(run(2)).toBeNull();
  });

  test("a shell-needing or rc-citing first spawn does not use up the message's refusal", () => {
    configure();
    const mixed = [
      { subagent_type: "devops:scout", description: "a", prompt: "gh issue view 1" },
      { subagent_type: "devops:scout", description: "b", prompt: "find X" },
    ];
    const file = batch(mixed, ["p", "q"]);
    expect(main(hook("devops:scout", { transcript_path: file, tool_use_id: "p", tool_input: mixed[0] }))).toBeNull();
    expect(main(hook("devops:scout", { transcript_path: file, tool_use_id: "q", tool_input: mixed[1] })).block).toBeTruthy();
  });

  test("a spawn in a LATER message is judged on its own", () => {
    configure();
    const file = batch([spawns[0]], ["a"]);
    fs.appendFileSync(file, JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "a", content: "ok" }] } }) + "\n");
    fs.appendFileSync(file, JSON.stringify({ type: "assistant", message: { id: "msg2", content: [{ type: "tool_use", id: "z", name: "Agent", input: spawns[2] }] } }) + "\n");
    expect(main(hook("devops:research", { transcript_path: file, tool_use_id: "z", tool_input: spawns[2] })).block).toBeTruthy();
  });

  test("a tool_use missing from the transcript still gets the old behaviour", () => {
    configure();
    expect(gate.leadsItsMessage(transcript(), "nope")).toBeNull();
    expect(main(hook("devops:scout")).block).toBeTruthy();
  });
});

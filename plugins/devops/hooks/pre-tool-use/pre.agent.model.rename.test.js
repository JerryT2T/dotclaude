import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { main, renameHint } = require("./pre.agent.model.js");

describe("pre.agent.model - renamed agents", () => {
  test.each([["devops:qa", "devops:qax"], ["devops:po", "devops:pox"], ["devops:ai", "devops:builder"], ["devops:core", "devops:builder"], ["devops:frontend", "devops:builder"], ["devops:aix", "devops:builder"]])("%s is refused with %s", (from, to) => {
    const r = main({ tool_name: "Agent", tool_input: { subagent_type: from, prompt: "x" } });
    expect(r.block).toContain(to);
    expect(renameHint({ subagent_type: from })).toContain(to);
  });
  test("the new names and other types are not touched by the rename gate", () => {
    expect(renameHint({ subagent_type: "devops:qax" })).toBeNull();
    expect(renameHint({ subagent_type: "devops:builder" })).toBeNull();
    expect(renameHint({ subagent_type: "devops:analyst" })).toBeNull();
    expect(renameHint({})).toBeNull();
  });
  test("refused inside a subagent too", () => {
    expect(main({ tool_name: "Agent", agent_id: "a1", tool_input: { subagent_type: "devops:qa" } }).block).toContain("devops:qax");
  });
});

describe("pre.agent.model - fork needs no model (C2)", () => {
  const gate = require("../lib/agent-model-gate.js");
  const text = JSON.stringify({ type: "user", message: { content: "go" } }) + "\n";
  test("a fork without model passes the gate (also on a Fable session)", () => {
    expect(gate.wouldRefuse({ subagent_type: "fork", prompt: "x" }, null, text, "t1")).toBe(false);
    const fable = text + JSON.stringify({ type: "assistant", message: { model: "claude-fable-1" } }) + "\n";
    expect(gate.wouldRefuse({ subagent_type: "fork", prompt: "x" }, null, fable, "t1")).toBe(false);
  });
  test("control: general-purpose without model is still refused", () => {
    expect(gate.wouldRefuse({ subagent_type: "general-purpose", prompt: "x" }, null, text, "t1")).toBe(true);
  });
});

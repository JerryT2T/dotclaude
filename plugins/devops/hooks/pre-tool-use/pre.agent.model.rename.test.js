import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { main, renameHint } = require("./pre.agent.model.js");

describe("pre.agent.model - renamed agents", () => {
  test.each([["devops:qa", "devops:qax"], ["devops:po", "devops:pox"], ["devops:ai", "devops:aix"]])("%s is refused with %s", (from, to) => {
    const r = main({ tool_name: "Agent", tool_input: { subagent_type: from, prompt: "x" } });
    expect(r.block).toContain(to);
    expect(renameHint({ subagent_type: from })).toContain(to);
  });
  test("the new names and other types are not touched by the rename gate", () => {
    expect(renameHint({ subagent_type: "devops:qax" })).toBeNull();
    expect(renameHint({ subagent_type: "devops:core" })).toBeNull();
    expect(renameHint({})).toBeNull();
  });
  test("refused inside a subagent too", () => {
    expect(main({ tool_name: "Agent", agent_id: "a1", tool_input: { subagent_type: "devops:qa" } }).block).toContain("devops:qax");
  });
});

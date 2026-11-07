import { describe, test, expect } from "vitest";
import { dropForeignOpenItems } from "./foreign-branches.js";
import { linkedKeepTokens } from "./linked-sessions.js";

describe("linked side sessions stay open items (#759)", () => {
  const tokens = ["claude/doku-umbau-ab12cd", "doku-umbau-ab12cd", "claude/other-session-xy9"];
  const open = [{ text: "Side-Session claude/doku-umbau-ab12cd noch nicht geshippt", reply: "ship" }, "claude/other-session-xy9 offen"];
  const without = (keep) => tokens.filter((t) => !keep.some((k) => t === k || t.includes(k) || k.includes(t)));

  test("without a linked list both items naming a sibling branch are dropped", () => {
    expect(dropForeignOpenItems(open, tokens).dropped).toBe(2);
  });

  test("a not-landed linked branch is kept, an unrelated sibling is still dropped", () => {
    const keep = linkedKeepTokens([{ title: "Doku", mode: "handoff", state: "running", branch: "claude/doku-umbau-ab12cd" }]);
    expect(keep).toEqual(["claude/doku-umbau-ab12cd"]);
    const r = dropForeignOpenItems(open, without(keep));
    expect(r.dropped).toBe(1);
    expect(r.open[0].text).toContain("Side-Session");
  });

  test("a landed or unmarked side session does not protect its branch", () => {
    expect(linkedKeepTokens([{ title: "A", mode: "handoff", state: "shipped", branch: "claude/a-long-branch" }])).toEqual([]);
    expect(linkedKeepTokens([{ title: "B", mode: "independent", state: "running", branch: "claude/b-long-branch" }])).toEqual([]);
  });
});

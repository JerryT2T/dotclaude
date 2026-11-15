import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

const { isAgentLeftover, pickByAgeCount } = createRequire(import.meta.url)("./cleanup-rule.js");

const unit = (key, ageDays) => ({ key, ageDays });
const RULE = { autoCleanGateDays: 3, autoCleanMinAgeDays: 3, autoCleanKeepNewest: 5 };

describe("isAgentLeftover", () => {
  test("agent worktree path, either slash style", () => {
    expect(isAgentLeftover({ kind: "worktree", path: "P:/r/.claude/worktrees/agent-a1b2c3d4" })).toBe(true);
    expect(isAgentLeftover({ kind: "worktree", path: "P:\\r\\.claude\\worktrees\\agent-a1b2c3d4" })).toBe(true);
  });
  test("a session worktree is no agent leftover, whatever its branch is called", () => {
    expect(isAgentLeftover({ kind: "worktree", path: "P:/r/.claude/worktrees/dev-start-b46717", branch: "worktree-agent-a1b2c3" })).toBe(false);
  });
  test("agent branches, but not a feature branch", () => {
    expect(isAgentLeftover({ kind: "branch", branch: "worktree-agent-a1b2c3d4" })).toBe(true);
    expect(isAgentLeftover({ kind: "branch", branch: "feat/x/agent-a1b2c3d4" })).toBe(true);
    expect(isAgentLeftover({ kind: "branch", branch: "feat/agent-framework" })).toBe(false);
  });
});

describe("pickByAgeCount", () => {
  test("nothing older than minAge and at most keepNewest units: nothing goes", () => {
    const u = [unit("a", 0.1), unit("b", 1), unit("c", 2)];
    expect(pickByAgeCount(u, RULE).picks).toEqual([]);
  });
  test("age trigger: once one is older than the gate every unit older than minAge goes", () => {
    const u = [unit("a", 1), unit("b", 4), unit("c", 9)];
    expect(pickByAgeCount(u, RULE).picks.map((p) => [p.unit.key, p.trigger])).toEqual([["b", "age"], ["c", "age"]]);
  });
  test("count trigger: all but the newest keepNewest go, whatever their age", () => {
    const u = Array.from({ length: 8 }, (_, i) => unit(`u${i}`, i * 0.1));
    const { picks } = pickByAgeCount(u, RULE);
    expect(picks.map((p) => p.unit.key)).toEqual(["u5", "u6", "u7"]);
    expect(picks.every((p) => p.trigger === "count")).toBe(true);
  });
  test("keepNewest 0 switches the count trigger off; skipped keys are never picked", () => {
    const u = Array.from({ length: 8 }, (_, i) => unit(`u${i}`, 0.5));
    expect(pickByAgeCount(u, { ...RULE, autoCleanKeepNewest: 0 }).picks).toEqual([]);
    expect(pickByAgeCount([unit("a", 9)], RULE, new Set(["a"])).picks).toEqual([]);
  });
});

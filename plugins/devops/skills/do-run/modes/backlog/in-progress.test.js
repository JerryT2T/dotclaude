import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { inProgressReason, filterInProgress } = require("./in-progress.js");
const backlog = readFileSync(join(__dirname, "..", "..", "modes", "backlog.md"), "utf8");

describe("backlog run skips issues already worked elsewhere (E1)", () => {
  it("board status In Progress, an in-progress label or a foreign assignee mark an issue as taken", () => {
    expect(inProgressReason({ projectItems: [{ status: { name: "In Progress" } }] })).toBe("board status In Progress");
    expect(inProgressReason({ projectItems: [{ status: "in progress" }] })).toBe("board status In Progress");
    expect(inProgressReason({ labels: [{ name: "In-Progress" }] })).toBe("label in progress");
    expect(inProgressReason({ assignees: [{ login: "alice" }] }, "bob")).toBe("assigned to alice");
  });

  it("Todo, unlabelled, unassigned and own-assigned issues stay in the queue", () => {
    const issues = [
      { number: 1, projectItems: [{ status: { name: "Todo" } }] },
      { number: 2, labels: [{ name: "bug" }], assignees: [] },
      { number: 3, assignees: [{ login: "Bob" }] },
      { number: 4, projectItems: [{ status: { name: "In Progress" } }], title: "busy" },
    ];
    const { queue, skipped } = filterInProgress(issues, { me: "bob" });
    expect(queue.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(skipped).toEqual([{ number: 4, title: "busy", why: "board status In Progress" }]);
  });

  it("bad input never throws", () => {
    expect(filterInProgress(null)).toEqual({ queue: [], skipped: [] });
    expect(inProgressReason(null)).toBeNull();
  });

  it("backlog.md wires the filter into queue building and the per-issue loop", () => {
    expect(backlog).toContain("backlog/in-progress.js");
    expect(backlog).toMatch(/already in progress elsewhere/);
  });
});

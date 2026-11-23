import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const gate = require("./cleanup-gate.js");

const fresh = () => ({ armedAt: Date.now(), dryRun: [], unmerged: [] });
const post = [
  "**Dry-Run:** diese Branches lösche ich nach deinem Ja:",
  "- `parked/autosave/backlog-4b7e9e`",
  "- worktree `.claude/worktrees/visual-base`",
  "",
  "Unmerged (Inhalt überholt, nicht per git beweisbar gelandet):",
  "- `parked/autosave/backlog-4b7e9e`, `claude/visual-base`",
  "",
  "Antworte mit Ja.",
].join("\n");
const wake = (text, attrs = 'from="human" trust="principal"') =>
  `<wake reason="mention"><project id="chan_x"><thread ts="cmsg_a"><message trigger="true" ${attrs} id="cmsg_b">${text}</message></thread></project></wake>`;

describe("cleanup gate, Claude Projects thread form (#1222)", () => {
  test("a Dry-Run post is pending; the person's Ja approves exactly it, Unmerged names exact", () => {
    const s = gate.recordThreadPost(fresh(), post);
    expect(s.threadPending.unmerged).toEqual(["parked/autosave/backlog-4b7e9e", "claude/visual-base"]);
    gate.confirmThreadPrompt(s, wake("Ja, ausführen"));
    expect(s.threadPending).toBeUndefined();
    expect(s.dryRun).toHaveLength(1);
    expect(gate.namesBranch(s.dryRun[0].scope, "parked/autosave/backlog-4b7e9e")).toBe(true);
    expect(s.unmerged.map((u) => u.scope)).toEqual(["parked/autosave/backlog-4b7e9e", "claude/visual-base"]);
    expect(s.unmerged.every((u) => u.exact)).toBe(true);
  });

  test("any other answer drops the pending post and approves nothing", () => {
    const s = gate.recordThreadPost(fresh(), post);
    gate.confirmThreadPrompt(s, wake("nein, warte noch"));
    expect(s.threadPending).toBeUndefined();
    expect(s.dryRun).toEqual([]);
    expect(s.unmerged).toEqual([]);
  });

  test("a relay, a peer or a non-wake prompt never answers", () => {
    for (const p of [
      wake("Ja", 'from="human" trust="peer"'),
      wake("Ja", 'from="claude" trust="relay"'),
      "Ja, ausführen",
      `<relay from="coordinator"><note>${wake("Ja")}</note></relay>`,
    ]) {
      const s = gate.recordThreadPost(fresh(), post);
      gate.confirmThreadPrompt(s, p);
      expect(s.dryRun).toEqual([]);
      expect(s.threadPending).toBeDefined();
    }
  });

  test("a post without a Dry-Run line is not a question", () => {
    const s = gate.recordThreadPost(fresh(), "Zwischenstand: 12 Branches entfernt.");
    expect(s.threadPending).toBeUndefined();
  });
});

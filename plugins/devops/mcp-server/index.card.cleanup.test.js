import { describe, test, expect } from "vitest";

// 2026-11-17 (devops learn): a hygiene hint (ship_hygiene risk / open / openItems,
// kind "cleanup") is an extra on a finished card — 🧹 instead of 👉, its reply on
// an Aufräumen button, never on Nachbessern, never a your-turn point.
const RISK = {
  text: "⚠ Nicht gelandete Arbeit ohne PR: claude/x (0 Commits, uncommittet) — pushen und mergen oder bewusst verwerfen",
  reply: "Sichere die nicht gelandete Arbeit: pushen, PR öffnen und mergen.",
  kind: "cleanup",
};
const state = { mode: "git" };

async function decide(input, key = "ship-successful", ctx = {}) {
  const mod = await import("./index.js");
  return mod.buildDecisionBlock({ variant: "ship-successful", summary: "x", ...input }, "de", key, ctx, state);
}
async function labels(d, lang = "de") {
  const { buttonsFor } = await import("./lib/card-widget.js");
  return buttonsFor(d.buttonsKey, lang, { replies: d.replies, cleanup: d.cleanup, version: d.version }).map(b => b.label);
}

describe("cleanup hints on the completion card", () => {
  test("a cleanup hint shows with 🧹, never 👉, and never reaches Nachbessern", async () => {
    const d = await decide({ open: [RISK] });
    expect(d.points).toContain(`🧹 ${RISK.text}`);
    expect(d.points.some(p => p.startsWith("👉"))).toBe(false);
    expect(d.replies).toEqual([]);
    expect(d.cleanup).toEqual([RISK.reply]);
    const l = await labels(d);
    expect(l).not.toContain("Nachbessern");
    expect(l).toContain("Aufräumen");
  });

  test("the Aufräumen button carries the hint's reply and is never primary", async () => {
    const d = await decide({ open: [RISK] });
    const { buttonsFor } = await import("./lib/card-widget.js");
    const b = buttonsFor(d.buttonsKey, "de", { replies: d.replies, cleanup: d.cleanup }).find(x => x.label === "Aufräumen");
    expect(b.prompt).toBe(RISK.reply);
    expect(b.primary).toBeUndefined();
    expect(b.icon).toBe("trash");
  });

  test("a real open point keeps 👉 and Nachbessern beside the cleanup hint", async () => {
    const d = await decide({ open: [{ text: "Remote-Branch konnte nicht gelöscht werden", reply: "Lösch den Remote-Branch." }, RISK] });
    expect(d.points[0]).toMatch(/^👉 /);
    expect(d.replies).toEqual(["Lösch den Remote-Branch."]);
    expect(await labels(d)).toEqual(expect.arrayContaining(["Nachbessern", "Aufräumen"]));
  });

  test("an untagged item stays an open point (only kind cleanup moves)", async () => {
    const d = await decide({ open: [{ text: RISK.text, reply: RISK.reply }] });
    expect(d.replies).toEqual([RISK.reply]);
    expect(d.cleanup).toEqual([]);
  });

  test("English label", async () => {
    const mod = await import("./index.js");
    const d = mod.buildDecisionBlock({ variant: "ship-successful", summary: "x", open: [RISK] }, "en", "ship-successful", {}, state);
    expect(await labels(d, "en")).toContain("Clean up");
  });
});

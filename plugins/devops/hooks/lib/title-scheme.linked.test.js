import { describe, test, expect } from "vitest";
import S from "./title-scheme.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

describe("title-scheme - side-session states (2.6)", () => {
  test("heads of linked, linked-waiting and delivered (deliver subs wait as Linked, not Team)", () => {
    expect(S.head("linked").text).toBe("⏳ ➜ 🔗 Linked ┃");
    expect(S.head("linked-waiting").text).toBe("👉 ➜ 🔗 Linked ┃");
    expect(S.head("delivered").text).toBe("🟩 ➜ 📦 Delivered ┃");
    expect(S.head("delivered", { mandatory: true }).text).toBe("👉 ➜ 📦 Delivered ┃");
    expect(() => S.head("agents-waiting")).toThrow();
    expect(S.headingOf("linked", "x")).toBe("⏳ 🔗 Linked — x");
    expect(S.headingOf("delivered", "Teil fertig")).toBe("🟩 📦 Delivered — Teil fertig");
  });

  test("classify and strip recognise them", () => {
    expect(S.classify("⏳ ➜ 🔗 Linked ┃ Doku")).toBe("process");
    expect(S.classify("👉 ➜ 🔗 Linked ┃ Doku")).toBe("outcome");
    expect(S.classify("🟩 ➜ 📦 Delivered ┃ Teil A")).toBe("outcome");
    expect(S.classify("👉 ➜ 🤖 Team ┃ Teil A")).toBe("approval");
    expect(S.stripPrefixes("⏳ ➜ 🔗 Linked ┃ Doku")).toBe("Doku");
    expect(S.stripPrefixes("👉 ➜ 🔗 Linked ┃ ⏳ ➜ 🔗 Linked ┃ Doku")).toBe("Doku");
    expect(S.stripPrefixes("🟩 ➜ 📦 Delivered ┃ Teil A")).toBe("Teil A");
  });
});

describe("title-scheme - the 🔗 sub marker (2.8, concept 2026-11-21 B3)", () => {
  const SOLO = "⏳ ➜ 🤖 Solo ┃ ";
  const cp = (s) => Array.from(s).length;

  test("one leading 🔗, never stacked, seen through by classify / strip", () => {
    const t = S.withSubMark(SOLO + "X");
    expect(t).toBe("🔗 " + SOLO + "X");
    expect(S.withSubMark(t)).toBe(t);
    expect(S.hasSubMark(t)).toBe(true);
    expect(S.classify(t)).toBe("work");
    expect(S.stripPrefixes(t)).toBe("X");
    expect(S.withSubMark("plain topic")).toBe("plain topic");
  });

  test("a status swap keeps the 🔗, the parent's 🔗 Linked activity is no marker", () => {
    expect(S.carrySubMark("🔗 " + SOLO + "X", "🟩 ➜ 🚀 Released Alpha ┃ X")).toBe("🔗 🟩 ➜ 🚀 Released Alpha ┃ X");
    expect(S.carrySubMark(SOLO + "X", "🟩 ➜ 📦 Committed ┃ X")).toBe("🟩 ➜ 📦 Committed ┃ X");
    expect(S.hasSubMark("⏳ ➜ 🔗 Linked ┃ Backlog-Run")).toBe(false);
    // row 14: a sub with its own subs
    expect(S.withSubMark("⏳ ➜ 🔗 Linked ┃ X")).toBe("🔗 ⏳ ➜ 🔗 Linked ┃ X");
  });

  test("the approval wait and its restore keep the 🔗", () => {
    const up = S.approvalTitle("🔗 ⏳ ➜ 🤖 Team ┃ X");
    expect(up).toBe("🔗 👉 ➜ 🤖 Team ┃ X");
    expect(S.approvalRestoredTitle(up)).toBe("🔗 ⏳ ➜ 🤖 Team ┃ X");
  });

  test("rows 2, 3, 6, 10, 11: every sub head leads with 🔗", () => {
    for (const id of ["shipping", "question", "released-alpha", "delivered", "aborted", "paused-usage-reset", "linked"]) {
      const t = S.withSubMark(S.prefixOf(id) + "X");
      expect(t.startsWith("🔗 " + S.head(id).status), id).toBe(true);
    }
  });

  test("the budget shortens the topic by the marker, never the head", () => {
    const B = require("./title-budget.js");
    const topic = "x".repeat(60);
    const plain = B.clampTitle(SOLO + topic);
    const sub = B.clampTitle("🔗 " + SOLO + topic);
    expect(sub.startsWith("🔗 " + SOLO)).toBe(true);
    expect(cp(sub.slice(("🔗 " + SOLO).length))).toBeLessThanOrEqual(cp(plain.slice(SOLO.length)) - 2);
    expect(B.clampTitle(sub)).toBe(sub);
  });
});

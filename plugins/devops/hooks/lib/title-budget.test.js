import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const B = require("./title-budget.js");
const S = require("./title-scheme.js");
const st = require("./session-title.js");
const ask = require("./ask-title.js");

const LONG = "Ich würde gern auf der Haiku-Seite unter Planen etwas ändern und noch mehr";
const cp = (s) => Array.from(s).length;

// The eight activity words of the bundle, as title-scheme states.
const STATES = { Solo: "work", Team: "agents", Concept: "concept-waiting", Shipping: "shipping", Batch: "batch", Question: "question", Aborted: "aborted", Ready: "ready" };
const prefixFor = (word) => (word === "Solo" ? S.WORK_PREFIX : S.prefixOf(STATES[word]));

describe("title-budget", () => {
  test.each(Object.keys(STATES))("%s: '<Word> ┃ <topic>' never exceeds 42 code points", (word) => {
    const prefix = prefixFor(word);
    const title = B.clampTitle(prefix + LONG);
    const text = title.slice(title.indexOf(word));
    expect(text.startsWith(`${word} ┃ `)).toBe(true);
    expect(cp(text)).toBeLessThanOrEqual(42);
    expect(title.endsWith("…")).toBe(true);
  });

  test("a topic that fits stays untouched", () => {
    expect(B.clampTopic("Solo", "Fix login")).toBe("Fix login");
    expect(B.clampTitle("⏳ ➜ 🤖 Solo ┃ Fix login")).toBe("⏳ ➜ 🤖 Solo ┃ Fix login");
    expect(B.clampTopic("Solo", "x".repeat(35))).toBe("x".repeat(35));
  });

  test("topic max = 42 - word - 3, ellipsis inside", () => {
    expect(cp(B.clampTopic("Solo", "x".repeat(100)))).toBe(35);
    expect(cp(B.clampTopic("Aborted", "x".repeat(100)))).toBe(32);
    expect(cp(B.clampTopic("Question", "x".repeat(100)))).toBe(31);
  });

  test("cuts at a word boundary when that loses at most 8 characters", () => {
    expect(B.clampTopic("Solo", "Fix the login flow for the mobile app now")).toBe("Fix the login flow for the mobile…");
    const t = B.clampTopic("Team", "Ich würde gern auf der Haiku-Seite unter Planen");
    expect(t.endsWith("…")).toBe(true);
    expect(t).not.toMatch(/\s…$/);
    // no space within reach: hard cut
    expect(B.clampTopic("Solo", "ab " + "x".repeat(60))).toBe("ab " + "x".repeat(31) + "…");
  });

  test("counts code points, not UTF-16 units", () => {
    const out = B.clampTopic("Solo", "😀".repeat(50));
    expect(cp(out)).toBe(35);
    expect(out).toBe("😀".repeat(34) + "…");
  });

  test("idempotent, and a word switch re-clamps without stacking ellipses", () => {
    const solo = B.clampTitle(S.WORK_PREFIX + LONG);
    expect(B.clampTitle(solo)).toBe(solo);
    const aborted = B.clampTitle(S.prefixOf("aborted") + solo.slice(S.WORK_PREFIX.length));
    expect(aborted).not.toContain("……");
    expect(aborted.match(/…/g)).toHaveLength(1);
    expect(cp(aborted.slice(aborted.indexOf("Aborted")))).toBeLessThanOrEqual(42);
    expect(B.clampTitle(aborted)).toBe(aborted);
    expect(B.clampTopic("Solo", "Kurzer Titel…")).toBe("Kurzer Titel…");
  });

  test("titles without a worded head are left alone", () => {
    expect(B.clampTitle("plain " + "x".repeat(80))).toBe("plain " + "x".repeat(80));
    expect(B.clampTitle("⏳ " + "x".repeat(80))).toBe("⏳ " + "x".repeat(80));
    expect(B.clampTitle(null)).toBeNull();
  });

  test("two-word heads (Released Alpha) shrink the topic accordingly", () => {
    const title = B.clampTitle(S.prefixOf("released-alpha") + LONG);
    expect(cp(title.slice(title.indexOf("Released")))).toBeLessThanOrEqual(42);
  });
});

describe("builders re-clamp", () => {
  test("nextTitle / questionTitle / restoredTitle", () => {
    const n = st.nextTitle(S.prefixOf("ready") + LONG);
    expect(n.startsWith(S.WORK_PREFIX)).toBe(true);
    expect(cp(n.slice(n.indexOf("Solo")))).toBeLessThanOrEqual(42);
    const q = ask.questionTitle(S.WORK_PREFIX + LONG);
    expect(cp(q.slice(q.indexOf("Question")))).toBeLessThanOrEqual(42);
    expect(q).not.toContain("……");
    const back = ask.restoredTitle(q, null);
    expect(back.match(/…/g)).toHaveLength(1);
  });
});

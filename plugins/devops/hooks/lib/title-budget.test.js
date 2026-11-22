import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const B = require("./title-budget.js");
const S = require("./title-scheme.js");
const st = require("./session-title.js");
const ask = require("./ask-title.js");

const LONG = "Ich würde gern auf der Haiku-Seite unter Planen etwas ändern und noch mehr";
const cp = (s) => Array.from(s).length;

// The eight activities of the bundle, as title-scheme states.
const STATES = { Solo: "work", Team: "agents", Concept: "concept-waiting", Shipping: "shipping", Batch: "batch", Question: "question", Aborted: "aborted", Ready: "ready" };
const prefixFor = (word) => (word === "Solo" ? S.WORK_PREFIX : S.prefixOf(STATES[word]));

describe("title-budget", () => {
  test.each(Object.keys(STATES))("%s: the text after '<status> ➜ <icon> ' never exceeds 42 code points", (word) => {
    const prefix = prefixFor(word);
    const title = B.clampTitle(prefix + LONG);
    expect(title.startsWith(prefix)).toBe(true);
    expect(title).not.toContain("┃");
    // A Team head shows two more robots, two columns each.
    const taken = word === "Team" ? 4 : 0;
    expect(B.headWidth(prefix)).toBe(taken);
    expect(cp(title.slice(prefix.length)) + taken).toBeLessThanOrEqual(42);
    expect(title.endsWith("…")).toBe(true);
  });

  test("a topic that fits stays untouched", () => {
    expect(B.clampTopic("Fix login")).toBe("Fix login");
    expect(B.clampTitle("⏳ ➜ 🤖 Fix login")).toBe("⏳ ➜ 🤖 Fix login");
    expect(B.clampTopic("x".repeat(42))).toBe("x".repeat(42));
  });

  test("topic max = 42 - what the head takes, ellipsis inside", () => {
    expect(cp(B.clampTopic("x".repeat(100)))).toBe(42);
    expect(cp(B.clampTopic("x".repeat(100), 4))).toBe(38);
    expect(cp(B.clampTopic("x".repeat(100), 17))).toBe(25);
  });

  test("headWidth: 0 for a plain head, the further robots of Team, the word and bar of a head before 3.0", () => {
    expect(B.headWidth(S.WORK_PREFIX)).toBe(0);
    expect(B.headWidth(S.prefixOf("red-tests"))).toBe(0);
    expect(B.headWidth(S.prefixOf("agents"))).toBe(4);
    expect(B.headWidth("⏳ ➜ 🤖 Solo ┃ ")).toBe(7);
    expect(B.headWidth("🟩 ➜ 🚀 Released Alpha ┃ ")).toBe(17);
    expect(B.headWidth("⏳ ")).toBeNull();
    expect(B.headWidth("📦 Ready – ")).toBeNull();
  });

  test("cuts at a word boundary when that loses at most 8 characters", () => {
    expect(B.clampTopic("Fix the login flow for the mobile app now", 7)).toBe("Fix the login flow for the mobile…");
    const t = B.clampTopic("Ich würde gern auf der Haiku-Seite unter Planen etwas", 4);
    expect(t.endsWith("…")).toBe(true);
    expect(t).not.toMatch(/\s…$/);
    // no space within reach: hard cut
    expect(B.clampTopic("ab " + "x".repeat(60))).toBe("ab " + "x".repeat(38) + "…");
  });

  test("counts code points, not UTF-16 units", () => {
    const out = B.clampTopic("😀".repeat(50));
    expect(cp(out)).toBe(42);
    expect(out).toBe("😀".repeat(41) + "…");
  });

  test("idempotent, and a head switch re-clamps without stacking ellipses", () => {
    const solo = B.clampTitle(S.WORK_PREFIX + LONG);
    expect(B.clampTitle(solo)).toBe(solo);
    const team = B.clampTitle(S.prefixOf("agents") + solo.slice(S.WORK_PREFIX.length));
    expect(team).not.toContain("……");
    expect(team.match(/…/g)).toHaveLength(1);
    expect(cp(team.slice(S.prefixOf("agents").length))).toBeLessThanOrEqual(38);
    expect(B.clampTitle(team)).toBe(team);
    expect(B.clampTopic("Kurzer Titel…")).toBe("Kurzer Titel…");
  });

  test("titles without an arrow head are left alone", () => {
    expect(B.clampTitle("plain " + "x".repeat(80))).toBe("plain " + "x".repeat(80));
    expect(B.clampTitle("⏳ " + "x".repeat(80))).toBe("⏳ " + "x".repeat(80));
    expect(B.clampTitle(null)).toBeNull();
  });

  test("a worded head from before 3.0 still shrinks the topic by its word", () => {
    const title = B.clampTitle("🟩 ➜ 🚀 Released Alpha ┃ " + LONG);
    expect(cp(title.slice(title.indexOf("Released")))).toBeLessThanOrEqual(42);
  });
});

describe("builders re-clamp", () => {
  test("nextTitle / questionTitle / restoredTitle", () => {
    const n = st.nextTitle(S.prefixOf("ready") + LONG);
    expect(n.startsWith(S.WORK_PREFIX)).toBe(true);
    expect(cp(n.slice(S.WORK_PREFIX.length))).toBeLessThanOrEqual(42);
    const q = ask.questionTitle(S.WORK_PREFIX + LONG);
    expect(cp(q.slice(S.prefixOf("question").length))).toBeLessThanOrEqual(42);
    expect(q).not.toContain("……");
    const back = ask.restoredTitle(q, null);
    expect(back.match(/…/g)).toHaveLength(1);
  });
});

describe("topic limit for the model's own topic (30 since the head lost its keyword, 2026-11-22)", () => {
  test("TOPIC_MAX is 30 and fits every head, also a linked Team sub", () => {
    expect(B.TOPIC_MAX).toBe(30);
    expect(B.TOPIC_MAX + B.headWidth(S.prefixOf("agents")) + S.SUB_MARK_WIDTH).toBeLessThanOrEqual(B.TITLE_BUDGET);
  });

  test("topicOf reads the text after the head; a title without a head has none", () => {
    expect(B.topicOf("⏳ ➜ 🤖 Fix login")).toBe("Fix login");
    expect(B.topicOf("⏳ ➜ 🤖🤖🤖 Fix login")).toBe("Fix login");
    expect(B.topicOf("⏳ ➜ 🧭 Feedback zu dotclaude")).toBe("Feedback zu dotclaude");
    expect(B.topicOf("⏳ ➜ 🤖 Solo ┃ Fix login")).toBe("Fix login");
    expect(B.topicOf("⏳ ➜ 🤖 ")).toBe("");
    expect(B.topicOf("Fix login")).toBeNull();
    expect(B.topicOf("⏳ Fix login")).toBeNull();
    expect(B.topicOf(null)).toBeNull();
  });
});

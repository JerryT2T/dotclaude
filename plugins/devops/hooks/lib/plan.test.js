import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const plan = require("./plan");
const { planId, planLabel, fiveHourState, PLANS, FABLE, CALIBRATION_KEYS } = plan;
const { RULES, DEFER_AT, WINDOW_FILL_MIN, classify, refreshDueMinutes, deferInfo } = require("./budget");
const PLAN_DEFAULTS = require("./plan-defaults");

describe("planId resolves every form that was ever stored or sent", () => {
  test.each([
    ["default_claude_max_20x", "ultra"], ["Max 20x", "ultra"], ["max_20", "ultra"], ["max20", "ultra"], ["Ultra", "ultra"],
    ["default_claude_max_5x", "max"], ["Max 5x", "max"], ["max_5", "max"], ["max5", "max"], ["Max", "max"], ["max", "max"],
    ["default_claude_pro", "pro"], ["Pro", "pro"], ["free", "free"], ["Free", "free"], ["default_claude_free", "free"],
    ["Team", "team"], ["Enterprise", "team"], ["default_claude_team", "team"], ["claude_enterprise", "team"],
    ["Max Plan", "unknown"], ["something_new", "unknown"], ["", "unknown"], [null, "unknown"], [undefined, "unknown"], [42, "unknown"],
  ])("%s -> %s", (raw, id) => { expect(planId(raw)).toBe(id); });
  test("labels", () => {
    expect(PLAN_IDS_LABELS()).toEqual({ free: "Free", pro: "Pro", max: "Max", ultra: "Ultra", team: "Team" });
    expect(planLabel("unknown")).toBeNull();
  });
  function PLAN_IDS_LABELS() { return Object.fromEntries(Object.keys(PLANS).map((id) => [id, planLabel(id)])); }
});

// P6: the class thresholds and the defer values of Pro and Max are the values
// they had before plan.js existed (budget.js, commit e6809693).
describe("numeric values are unchanged", () => {
  test("RULES", () => {
    expect(RULES.pro).toEqual({ askAt: [0, 0], sonnetAt: [70, 85] });
    expect(RULES.max).toEqual({ askAt: [80, 90], sonnetAt: [95, 98] });
    expect(RULES.ultra).toEqual({ askAt: [90, 95], sonnetAt: [98, 99] });
    expect(RULES.free).toEqual(RULES.pro);
    expect(RULES.team).toEqual(RULES.max);
  });
  test("DEFER_AT", () => {
    expect(DEFER_AT).toEqual({ free: 70, pro: 70, max: 80, ultra: 90, team: 80 });
  });
  test("fill time follows capacity", () => {
    expect(WINDOW_FILL_MIN).toMatchObject({ pro: 30, max: 150, ultra: 300 });
    expect(PLANS.pro.capacity).toBe(1); expect(PLANS.max.capacity).toBe(5); expect(PLANS.ultra.capacity).toBe(10);
  });
  test("token guard shares", () => {
    expect(PLAN_DEFAULTS.pro.confirmThresholdPct).toBe(0.05);
    expect(PLAN_DEFAULTS.max_5.confirmThresholdPct).toBe(0.08);
    expect(PLAN_DEFAULTS.max_20.confirmThresholdPct).toBe(0.10);
    expect(PLAN_DEFAULTS.max_20.estimatedLimitTokens).toBe(200000);
  });
});

describe("behaviour of every plan, with real, idle and missing data", () => {
  const usages = { real: [50, 50], high: [96, 10], week: [10, 99], idle: [null, 40], missing: [null, null] };
  // Pro and Max: classes identical to the pre-plan.js rules.
  const legacy = { pro: { askAt: [0, 0], sonnetAt: [70, 85] }, max: { askAt: [80, 90], sonnetAt: [95, 98] } };
  test.each(["pro", "max"])("%s classifies as before", (id) => {
    for (const [five, week] of Object.values(usages)) {
      const r = legacy[id];
      const f = five == null ? 0 : five, w = week == null ? 0 : week;
      const want = f >= r.sonnetAt[0] || w >= r.sonnetAt[1] ? "sonnet-only" : f >= r.askAt[0] || w >= r.askAt[1] ? "ask-before-parallel" : "free";
      expect(classify({ tier: id, fivePct: five, weeklyPct: week })).toBe(want);
    }
  });
  test("free = Pro, team = Max", () => {
    for (const [five, week] of Object.values(usages)) {
      expect(classify({ tier: "free", fivePct: five, weeklyPct: week })).toBe(classify({ tier: "pro", fivePct: five, weeklyPct: week }));
      expect(classify({ tier: "team", fivePct: five, weeklyPct: week })).toBe(classify({ tier: "max", fivePct: five, weeklyPct: week }));
    }
  });
  test("unknown plan: asks without usage, classifies by Max's rules with usage", () => {
    expect(classify({ tier: "unknown", fivePct: null, weeklyPct: null })).toBe("ask-before-parallel");
    for (const [five, week] of [[50, 50], [96, 10], [10, 99], [null, 40]]) {
      expect(classify({ tier: "unknown", fivePct: five, weeklyPct: week })).toBe(classify({ tier: "max", fivePct: five, weeklyPct: week }));
    }
  });
  test("refresh age and defer for Pro and Max are as before", () => {
    expect(refreshDueMinutes({ tier: "pro", fivePct: 10, weeklyPct: 10 })).toBe(18);
    expect(refreshDueMinutes({ tier: "max", fivePct: 79, weeklyPct: 10 })).toBe(5);
    expect(refreshDueMinutes({ tier: "max", fivePct: 50, weeklyPct: 10 })).toBe(45);
    expect(refreshDueMinutes({ tier: "unknown", fivePct: 50, weeklyPct: 10 })).toBe(45);
    expect(deferInfo({ tier: "pro", fivePct: 70, weeklyPct: 10, resetInMinutes: 90 })).toEqual({ minutes: 90, soon: false });
    expect(deferInfo({ tier: "max", fivePct: 79, resetInMinutes: 30 })).toBeNull();
    expect(deferInfo({ tier: "max", fivePct: 80, resetInMinutes: 30 })).toEqual({ minutes: 30, soon: true });
    expect(deferInfo({ tier: "unknown", fivePct: 80, resetInMinutes: 30 })).toEqual({ minutes: 30, soon: true });
    expect(deferInfo({ tier: "team", fivePct: 80, resetInMinutes: 30 })).toEqual({ minutes: 30, soon: true });
  });
});

describe("5 h semantics for Wave 2", () => {
  test("a delivered value is used on every plan", () => {
    for (const id of [...Object.keys(PLANS), "unknown"]) expect(fiveHourState(id, 0)).toBe("delivered");
    expect(fiveHourState("ultra", 12)).toBe("delivered");
  });
  test("null means no limit on Ultra and an idle window elsewhere", () => {
    expect(fiveHourState("ultra", null)).toBe("none");
    for (const id of ["free", "pro", "max", "team", "unknown"]) expect(fiveHourState(id, null)).toBe("idle");
    expect(fiveHourState("ultra", undefined)).toBe("none");
  });
  test("Fable facts and the stored keys", () => {
    expect(FABLE).toEqual({ sharePct: 50, scopeName: "Fable" });
    expect(CALIBRATION_KEYS.ultra).toBe("Max 20x");
  });
});

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { fiveHourWindow } = require("./plan.js");
const { readBudget, budgetLine, bindingWindow, maybeRefreshUsage } = require("./budget.js");
const { buildSnapshot } = require("../../scripts/statusline-usage.js");
const { usageShape, recordDrift, driftNotice } = require("./usage-drift.js");

const NOW = Date.parse("2026-11-06T12:00:00Z");
const MIN = 60_000;
const HOME = "C:/nonexistent";

const SESSIONS = {
  real: { pct: 42, resetInMinutes: 120 },
  idle: { pct: 0, resetInMinutes: null },
  missing: undefined,
};
const WEEK = { pct: 76, resetInMinutes: 2600 };
const PLANS = ["Free", "Pro", "Max", "Ultra", "Team", "Max Plan"];

function budgetFor(plan, session, weekly = WEEK, ageMin = 1) {
  return readBudget({
    home: HOME, env: {}, nowMs: NOW,
    snapshot: { timestamp: new Date(NOW - ageMin * MIN).toISOString(), session, weekly, plan },
  });
}

describe("fiveHourWindow - the one 5 h rule (U1)", () => {
  test("delivered data is used on EVERY plan, verified or not", () => {
    for (const id of ["free", "pro", "max", "ultra", "team", "unknown"]) {
      expect(fiveHourWindow(id, { pct: 42, resetInMinutes: 120 })).toEqual({ state: "delivered", pct: 42, resetInMinutes: 120, applies: true });
    }
  });
  test("a delivered 0 % with a reset is data too (window started, nothing used)", () => {
    expect(fiveHourWindow("ultra", { pct: 0, resetInMinutes: 290 }).state).toBe("delivered");
  });
  test("null on Ultra means no limit: no row", () => {
    expect(fiveHourWindow("ultra", { pct: 0, resetInMinutes: null })).toEqual({ state: "none", pct: null, resetInMinutes: null, applies: false });
    expect(fiveHourWindow("ultra", undefined).applies).toBe(false);
  });
  test("null on every other plan means idle: the row stays as it always was", () => {
    for (const id of ["free", "pro", "max", "team", "unknown"]) {
      expect(fiveHourWindow(id, { pct: 0, resetInMinutes: null })).toEqual({ state: "idle", pct: 0, resetInMinutes: null, applies: true });
      expect(fiveHourWindow(id, undefined).state).toBe("idle");
    }
  });
});

describe("readBudget - per plan, with real, idle and missing 5 h data (U1, U2, U5)", () => {
  test("U5 reproduction: idle window, one minute old, is NOT expired and does not announce", () => {
    const b = budgetFor("Ultra", { pct: 0, resetInMinutes: null }, { pct: 76, resetInMinutes: 2600 });
    expect(b.expired).toBe(false);
    expect(b.announce).toBe(false);
    expect(b.binding).toBe("week");
    expect(maybeRefreshUsage(b, { home: HOME, nowMs: NOW, env: {} })).toBe(false);
  });
  test.each(PLANS.filter((p) => p !== "Ultra"))("%s: idle window is not expired and not announced", (plan) => {
    const b = budgetFor(plan, SESSIONS.idle);
    expect(b.expired).toBe(false);
    expect(b.announce).toBe(false);
    expect(b.fiveApplies).toBe(true);
  });
  test.each(PLANS)("%s: a window really past its reset still expires and announces (as before)", (plan) => {
    const b = budgetFor(plan, { pct: 90, resetInMinutes: 10 }, WEEK, 30);
    expect(b.expired).toBe(true);
    expect(b.announce).toBe(true);
    expect(b.fivePct).toBe(null);
  });
  test("verified Ultra, null window: no 5 h figure, week binds, free", () => {
    const b = budgetFor("Ultra", SESSIONS.idle);
    expect([b.fivePct, b.fiveApplies, b.binding, b.cls]).toEqual([null, false, "week", "free"]);
    expect(budgetLine(b)).toBe("[budget] Ultra · week 76% → free");
  });
  test("verified Ultra, snapshot without any session: same line", () => {
    expect(budgetLine(budgetFor("Ultra", SESSIONS.missing))).toBe("[budget] Ultra · week 76% → free");
  });
  test("unverified Ultra with REAL 5 h data shows it and classifies by it", () => {
    const b = budgetFor("Ultra", { pct: 95, resetInMinutes: 60 });
    expect([b.fivePct, b.fiveApplies, b.cls, b.binding]).toEqual([95, true, "ask-before-parallel", "5h"]);
    expect(budgetLine(b)).toContain("window 95% (reset 59 min)");
  });
  test("Ultra, no 5 h window, week tight: the class follows the week and the line names its reset", () => {
    const b = budgetFor("Ultra", SESSIONS.idle, { pct: 96, resetInMinutes: 600 });
    expect(b.cls).toBe("ask-before-parallel");
    expect(budgetLine(b)).toBe("[budget] Ultra · week 96% (reset 10 h) → ask-before-parallel");
  });
  test("Ultra without any data stays 'usage unknown'", () => {
    const b = readBudget({ home: HOME, env: {}, nowMs: NOW, snapshot: { timestamp: new Date(NOW - MIN).toISOString(), plan: "Ultra" } });
    expect(budgetLine(b)).toContain("[budget] Ultra · usage unknown");
  });

  // Pro, Max, Team and an unknown plan: byte-identical to the line before this change.
  test("Pro, real data: line unchanged", () => {
    expect(budgetLine(budgetFor("Pro", SESSIONS.real, { pct: 50, resetInMinutes: 5000 }))).toBe("[budget] Pro · window 42% (reset 119 min) · week 50% (reset 83 h) → ask-before-parallel");
  });
  test("Max, real data: line unchanged", () => {
    expect(budgetLine(budgetFor("Max", { pct: 85, resetInMinutes: 40 }, { pct: 90, resetInMinutes: 600 }))).toBe("[budget] Max · window 85% (reset 39 min) · week 90% → ask-before-parallel");
  });
  test("Team, real data: line unchanged", () => {
    expect(budgetLine(budgetFor("Team", SESSIONS.real, { pct: 50, resetInMinutes: 5000 }))).toBe("[budget] Team · window 42% (reset 119 min) · week 50% → free");
  });
  test("Pro / Max / Team idle window: reads as window 0%, with no false announce", () => {
    for (const plan of ["Pro", "Max", "Team"]) {
      const line = budgetLine(budgetFor(plan, SESSIONS.idle));
      expect(line).toContain("window 0% · week 76%");
      expect(line).not.toContain("no longer apply");
    }
  });
  test("unknown plan with real data keeps today's line and asks before parallel only without usage", () => {
    const b = budgetFor("Max Plan", SESSIONS.real, { pct: 50, resetInMinutes: 5000 });
    expect(b.tier).toBe("unknown");
    expect(budgetLine(b)).toContain("window 42% (reset 119 min) · week 50%");
    const none = readBudget({ home: HOME, env: {}, nowMs: NOW, snapshot: { timestamp: new Date(NOW - MIN).toISOString(), plan: "Max Plan" } });
    expect(none.cls).toBe("ask-before-parallel");
  });
  test.each(["Pro", "Max", "Team"])("%s: weekly reset null is not read as expired (U5, week stays)", (plan) => {
    const b = budgetFor(plan, SESSIONS.real, { pct: 70, resetInMinutes: null });
    expect(b.expired).toBe(false);
    expect(b.weeklyPct).toBe(70);
  });
});

describe("bindingWindow", () => {
  test("without a 5 h window the week binds", () => {
    expect(bindingWindow({ tier: "ultra", fivePct: null, weeklyPct: 0, fiveApplies: false })).toBe("week");
  });
  test("with a window the old rule stays (fiveApplies unset = old callers)", () => {
    expect(bindingWindow({ tier: "max", fivePct: 10, weeklyPct: 0 })).toBe("5h");
    expect(bindingWindow({ tier: "max", fivePct: 10, weeklyPct: 95 })).toBe("week");
  });
});

describe("statusline carry (U4)", () => {
  const prev = (plan, session, minAgo = 0) => ({ timestamp: new Date(NOW - minAgo * MIN).toISOString(), session, weekly: { pct: 10, resetInMinutes: 5000 }, plan });
  const onlyWeek = { rate_limits: { seven_day: { used_percentage: 20, resets_at: (NOW + 5000 * MIN) / 1000 } } };

  test("Max: an old 5h value is carried until its own reset, aged by the elapsed time", () => {
    expect(buildSnapshot(onlyWeek, prev("Max", { pct: 60, resetInMinutes: 100 }, 30), NOW).session).toEqual({ pct: 60, resetInMinutes: 70 });
  });
  test("Max: dropped after its own reset", () => {
    expect(buildSnapshot(onlyWeek, prev("Max", { pct: 60, resetInMinutes: 100 }, 101), NOW).session).toBe(null);
  });
  test("Pro: a value without a known reset cannot be validated and is dropped; an idle 0 carries", () => {
    expect(buildSnapshot(onlyWeek, prev("Pro", { pct: 60, resetInMinutes: null }), NOW).session).toBe(null);
    expect(buildSnapshot(onlyWeek, prev("Pro", { pct: 0, resetInMinutes: null }), NOW).session).toEqual({ pct: 0, resetInMinutes: null });
  });
  test("Ultra: never carried", () => {
    expect(buildSnapshot(onlyWeek, prev("Ultra", { pct: 60, resetInMinutes: 100 }), NOW).session).toBe(null);
  });
  test("unknown plan label behaves like Max; no previous snapshot gives null", () => {
    expect(buildSnapshot(onlyWeek, prev("Max Plan", { pct: 60, resetInMinutes: 100 }), NOW).session).toEqual({ pct: 60, resetInMinutes: 100 });
    expect(buildSnapshot(onlyWeek, null, NOW).session).toBe(null);
  });
  test("a delivered window always wins, on every plan", () => {
    const both = { rate_limits: { five_hour: { used_percentage: 33, resets_at: (NOW + 90 * MIN) / 1000 }, seven_day: onlyWeek.rate_limits.seven_day } };
    for (const plan of ["Pro", "Max", "Ultra", "Team"]) {
      expect(buildSnapshot(both, prev(plan, { pct: 1, resetInMinutes: 5 }), NOW).session).toEqual({ pct: 33, resetInMinutes: 90 });
    }
  });
});

describe("usage drift notice (U10)", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "usage-drift-"));
  const fx = (n) => JSON.parse(fs.readFileSync(path.join(here, "../../scripts/fixtures", n), "utf8")).usage;
  test("shape: Ultra, idle Max and normal responses are NOT drift", () => {
    expect(usageShape(fx("usage-api-ultra-fable.json"))).toBe(null);
    expect(usageShape(fx("usage-api-max-idle.json"))).toBe(null);
    expect(usageShape({ five_hour: null, seven_day: { utilization: 5 } })).toBe(null);
    expect(usageShape({ five_hour: { utilization: 5 }, limits: [{ kind: "weekly_all", percent: 3 }] })).toBe(null);
  });
  test("shape: no weekly data or a non-object is drift, and the signature holds names only", () => {
    expect(usageShape("x")).toBe("not-an-object");
    expect(usageShape([])).toBe("not-an-object");
    const sig = usageShape({ five_hour: null, quota: { used: 4242 } });
    expect(sig).toBe("no-weekly-window keys=five_hour,quota");
    expect(sig).not.toContain("4242");
  });
  test("one notice per calendar month, then silent; next month speaks again", () => {
    const home = tmp();
    expect(driftNotice({ home, nowMs: NOW })).toBe(null);
    recordDrift("no-weekly-window keys=a", { home, nowMs: NOW });
    const first = driftNotice({ home, nowMs: NOW });
    expect(first).toContain("[ss.usage.drift.notice] Show the user this line verbatim");
    expect(first).toContain("devops learn");
    expect(first).toContain("no-weekly-window keys=a");
    expect(driftNotice({ home, nowMs: NOW + 86_400_000 })).toBe(null);
    expect(driftNotice({ home, nowMs: Date.parse("2026-12-02T08:00:00Z") })).toContain("devops learn");
  });
});

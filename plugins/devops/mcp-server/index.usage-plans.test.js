import { describe, test, expect, vi, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// index.js boots an MCP server at import: same mock preamble as index.meter.test.js.
process.env.DEVOPS_COMPLETION_NO_USAGE = "1";
// An empty home: the credentials tier of the machine running the tests must not decide the plan.
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "usage-plans-home-"));
process.env.USERPROFILE = FAKE_HOME;
process.env.HOME = FAKE_HOME;

vi.mock("./lib/ensure-deps.js", () => ({ ensureDeps: async () => {} }));
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    registerTool() {}
    async connect() {}
  },
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: class {} }));
vi.mock("zod", () => {
  const node = new Proxy(() => node, { get: () => () => node });
  const z = new Proxy({}, { get: () => () => node });
  return { z };
});

let renderUsageMeter, renderUsageMeterForCard, buildBudgetModel, renderBudgetLineMd, renderUsageLine;
beforeAll(async () => {
  ({ renderUsageMeter, renderUsageMeterForCard, buildBudgetModel, renderBudgetLineMd, renderUsageLine } = await import("./index.js"));
});

const snap = (plan, session, weekly, extra = {}) => ({ timestamp: new Date(Date.now() - 60_000).toISOString(), plan, session, weekly, ...extra });
const REAL5 = { pct: 42, resetInMinutes: 120 };
const IDLE5 = { pct: 0, resetInMinutes: null };
const WK = { pct: 50, resetInMinutes: 5000 };
const rows = (text) => text.split("\n").filter((l) => /^(5h|Wk|Fb)\s/.test(l)).map((l) => l.slice(0, 2));

describe("5h row follows the plan rule (U1, U3), every surface", () => {
  test.each(["Free", "Pro", "Max", "Team", "Max Plan"])("%s: real and idle 5h keep their row", (plan) => {
    expect(rows(renderUsageMeter(snap(plan, REAL5, WK), 1, 1))).toEqual(["5h", "Wk"]);
    expect(rows(renderUsageMeter(snap(plan, IDLE5, WK), 1, 1))).toEqual(["5h", "Wk"]);
    expect(rows(renderUsageMeterForCard(snap(plan, REAL5, WK), 1, 1, ""))).toEqual(["5h", "Wk"]);
  });
  test("verified Ultra (null window): no 5h row in meter or card", () => {
    expect(rows(renderUsageMeter(snap("Ultra", IDLE5, WK), 1, 1))).toEqual(["Wk"]);
    expect(rows(renderUsageMeterForCard(snap("Ultra", IDLE5, WK), 1, 1, ""))).toEqual(["Wk"]);
    expect(rows(renderUsageMeter(snap("Ultra", undefined, WK), 1, 1))).toEqual(["Wk"]);
  });
  test("unverified Ultra with real 5h data shows the row", () => {
    expect(rows(renderUsageMeter(snap("Ultra", REAL5, WK), 1, 1))).toEqual(["5h", "Wk"]);
    const model = buildBudgetModel(snap("Ultra", { pct: 60, resetInMinutes: 120 }, WK), 1, 1, "");
    expect(model.bars.map((b) => b.label)).toContain("5h");
  });
  test("Ultra idle: no 5h bar in the card model, and the markdown fallback has none", () => {
    const model = buildBudgetModel(snap("Ultra", IDLE5, { pct: 90, resetInMinutes: 600 }), 1, 1, "");
    expect(model.bars.map((b) => b.label)).toEqual(["Wk"]);
    expect(renderBudgetLineMd(model)).not.toMatch(/5h/);
  });
  test("an unknown plan label falls back to the credentials tier (empty home: stays unknown = idle row)", () => {
    expect(rows(renderUsageMeter(snap("Max Plan", IDLE5, WK), 1, 1))).toEqual(["5h", "Wk"]);
  });
  test("the credentials tier decides when the label is the placeholder", () => {
    fs.mkdirSync(path.join(FAKE_HOME, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(FAKE_HOME, ".claude", ".credentials.json"), JSON.stringify({ claudeAiOauth: { rateLimitTier: "default_claude_max_20x" } }));
    try {
      expect(rows(renderUsageMeter(snap("Max Plan", IDLE5, WK), 1, 1))).toEqual(["Wk"]);
    } finally {
      fs.rmSync(path.join(FAKE_HOME, ".claude", ".credentials.json"));
    }
  });
});

describe("Pro and Max output is byte-identical to before this change", () => {
  test("Pro, real data (pinned from the previous implementation)", () => {
    const d = snap("Pro", REAL5, WK);
    expect(renderUsageMeterForCard(d, 3, 1, "")).toBe("```\n5h  ━━━━━━╏━──────  42% +3%  · 2h  0m\nWk  ━━━━━━━╏──────  50% +1%  · 3d 11h\n```");
    expect(JSON.stringify(buildBudgetModel(d, 3, 1, ""))).toBe('{"omitted":true,"bars":[],"warn":false,"contextHealth":""}');
  });
  test("Max, real data (pinned from the previous implementation)", () => {
    const d = snap("Max", { pct: 85, resetInMinutes: 40 }, { pct: 90, resetInMinutes: 600 });
    expect(renderUsageMeterForCard(d, 3, 1, "")).toBe("```\n5h  ━━━━━━━━━━━━╏─  85% +3%  · 0h 40m\nWk  ━━━━━━━━━━━━━╏  90% +1%  · 10h  0m\n```");
    expect(JSON.stringify(buildBudgetModel(d, 3, 1, ""))).toBe(
      '{"omitted":false,"bars":[{"label":"5h","pct":85,"elapsedPct":86.66666666666667,"level":"white","watermark":"0 h 40 m","tooltip":"85% verbraucht · Reset in 0 h 40 m"},{"label":"Wk","pct":90,"elapsedPct":94.04761904761905,"level":"white","watermark":"10 h 0 m","tooltip":"90% verbraucht · Reset in 10 h 0 m"}],"warn":false,"contextHealth":""}',
    );
  });
  test("Pro / Max / Team idle 5h: meter row unchanged", () => {
    for (const plan of ["Pro", "Max", "Team"]) {
      expect(renderUsageMeterForCard(snap(plan, IDLE5, WK), 3, 1, "")).toBe("```\n5h  ╏─────────────   0% +3%  · —\nWk  ━━━━━━━╏──────  50% +1%  · 3d 11h\n```");
    }
  });
});

describe("unknown reset (U6, U8)", () => {
  test("renderUsageLine: no Pace warning without a reset, still with one", () => {
    expect(renderUsageLine("5h", 90, 0, null, null)).not.toContain("Pace");
    expect(renderUsageLine("5h", 90, 0, null, 30)).toContain("Pace");
  });
  test.each(["Pro", "Max", "Team"])("%s: weekly reset null is not 100 percent elapsed, no pace, no bar on the card", (plan) => {
    const d = snap(plan, REAL5, { pct: 70, resetInMinutes: null });
    const meterWk = renderUsageMeter(d, 1, 1).split("\n").find((l) => l.startsWith("Wk"));
    expect(meterWk).toContain("70%");
    expect(meterWk).not.toContain("Pace");
    expect(buildBudgetModel(d, 1, 1, "").bars.map((b) => b.label)).toEqual([]);
  });
  test("a delivered 5h value without a reset gives a bar that is never marked as ahead of time", () => {
    const model = buildBudgetModel(snap("Pro", { pct: 80, resetInMinutes: null }, WK), 1, 1, "");
    const five = model.bars.find((b) => b.label === "5h");
    expect(five.level).toBe("white");
    expect(model.warn).toBe(false);
  });
});

describe("weekly-only snapshot (U7)", () => {
  test.each(["Pro", "Max", "Ultra", "Team", "Max Plan"])("%s: renders the week, no 5h row, no crash", (plan) => {
    const d = snap(plan, undefined, { pct: 90, resetInMinutes: 600 });
    expect(rows(renderUsageMeter(d, null, 1))).toEqual(["Wk"]);
    expect(rows(renderUsageMeterForCard(d, null, 1, ""))).toEqual(["Wk"]);
    expect(buildBudgetModel(d, null, 1, "")).not.toBe(null);
  });
  test("no window at all stays 'unavailable'", () => {
    expect(renderUsageMeter({ timestamp: new Date().toISOString() }, 1, 1)).toMatch(/unavailable/);
  });
});

describe("Fable bar (U11)", () => {
  const FB = (pct, reset = 5000) => ({ scoped: [{ name: "Fable", pct, resetInMinutes: reset }] });
  const ultra = (fb, wk = WK) => snap("Ultra", IDLE5, wk, fb);
  test("get_usage meter: an unused limit never shows, a used one does", () => {
    expect(rows(renderUsageMeter(ultra(FB(0)), 1, 1))).toEqual(["Wk"]);
    expect(rows(renderUsageMeter(ultra(FB(12)), 1, 1))).toEqual(["Wk", "Fb"]);
  });
  test("card: 0 percent never shows, however late the reset", () => {
    expect(buildBudgetModel(ultra(FB(0, 600), { pct: 50, resetInMinutes: 600 }), 1, 1, "").bars.map((b) => b.label)).toEqual(["Wk"]);
  });
  test("card: SAME rule as Wk - a used limit on pace stays hidden, ahead of pace or in the last 24 h it shows", () => {
    expect(buildBudgetModel(ultra(FB(5, 5000)), 1, 1, "").bars.map((b) => b.label)).toEqual([]);
    expect(buildBudgetModel(ultra(FB(70, 5000)), 1, 1, "").bars.map((b) => b.label)).toEqual(["Fb"]);
    expect(buildBudgetModel(ultra(FB(5, 600), { pct: 5, resetInMinutes: 600 }), 1, 1, "").bars.map((b) => b.label)).toEqual(["Wk", "Fb"]);
  });
  test("card terminal fallback follows the same rule", () => {
    expect(rows(renderUsageMeterForCard(ultra(FB(5, 5000)), 1, 1, ""))).toEqual(["Wk"]);
    expect(rows(renderUsageMeterForCard(ultra(FB(70, 5000)), 1, 1, ""))).toEqual(["Wk", "Fb"]);
  });
  test("a plan without a scoped limit has none: Pro and Max output has no Fb", () => {
    for (const plan of ["Pro", "Max", "Team"]) {
      expect(rows(renderUsageMeter(snap(plan, REAL5, WK), 1, 1))).toEqual(["5h", "Wk"]);
    }
  });
});

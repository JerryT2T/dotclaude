import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mapApiUsage } = require("./refresh-usage-headless.js");
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
const NOW = Date.parse("2026-11-06T12:00:00Z");

describe("mapApiUsage with real responses (U9, U11)", () => {
  test("Ultra response (five_hour null, Fable scoped limit): label, idle session, weekly, scoped", () => {
    const { usage, rateLimits } = fixture("usage-api-ultra-fable.json");
    const snap = mapApiUsage(usage, rateLimits, NOW);
    expect(snap.plan).toBe("Ultra");
    expect(snap.session).toEqual({ pct: 0, resetInMinutes: null });
    expect(snap.weekly.pct).toBe(76);
    expect(snap.weekly.resetInMinutes).toBeGreaterThan(0);
    expect(snap.scoped).toEqual([{ name: "Fable", pct: 0, resetInMinutes: expect.any(Number) }]);
  });
  test("Max idle response (#1009): idle session, no scoped key at all", () => {
    const { usage, rateLimits } = fixture("usage-api-max-idle.json");
    const snap = mapApiUsage(usage, rateLimits, NOW);
    expect(snap.plan).toBe("Max");
    expect(snap.session).toEqual({ pct: 0, resetInMinutes: null });
    expect("scoped" in snap).toBe(false);
  });
  test("a delivered five_hour wins on any plan and seven_day stays primary", () => {
    const { usage, rateLimits } = fixture("usage-api-ultra-fable.json");
    const u = { ...usage, five_hour: { utilization: 44, resets_at: new Date(NOW + 100 * 60000).toISOString() }, seven_day: { utilization: 10, resets_at: usage.seven_day.resets_at } };
    const snap = mapApiUsage(u, rateLimits, NOW);
    expect(snap.session).toEqual({ pct: 44, resetInMinutes: 100 });
    expect(snap.weekly.pct).toBe(10);
  });
  test("limits[] weekly_all is the fallback when seven_day is absent", () => {
    const { usage, rateLimits } = fixture("usage-api-ultra-fable.json");
    const { seven_day, ...rest } = usage;
    expect(seven_day).toBeTruthy();
    expect(mapApiUsage(rest, rateLimits, NOW).weekly.pct).toBe(76);
  });
  test("a 5h kind in limits[] is never guessed: five_hour null stays idle", () => {
    const { usage, rateLimits } = fixture("usage-api-ultra-fable.json");
    const u = { ...usage, limits: [...usage.limits, { kind: "session", percent: 55, resets_at: usage.seven_day.resets_at, scope: null }] };
    expect(mapApiUsage(u, rateLimits, NOW).session).toEqual({ pct: 0, resetInMinutes: null });
  });
  test("weekly-only: garbage five_hour with a valid week still writes the week (U7)", () => {
    const snap = mapApiUsage({ five_hour: { weird: true }, seven_day: { utilization: 20, resets_at: "2026-11-08T07:00:00Z" } }, { rate_limit_tier: "default_claude_pro" }, NOW);
    expect(snap.session).toBe(null);
    expect(snap.weekly.pct).toBe(20);
    expect(snap.plan).toBe("Pro");
  });
  test("neither window, or no object: nothing is written", () => {
    expect(mapApiUsage({ five_hour: { weird: true } }, null, NOW)).toBe(null);
    expect(mapApiUsage({}, null, NOW)).toBe(null);
    expect(mapApiUsage(null, null, NOW)).toBe(null);
  });
  test("a scoped limit that is in use keeps its percent", () => {
    const { usage, rateLimits } = fixture("usage-api-ultra-fable.json");
    const limits = usage.limits.map((l) => (l.kind === "weekly_scoped" ? { ...l, percent: 37, is_active: true } : l));
    expect(mapApiUsage({ ...usage, limits }, rateLimits, NOW).scoped[0].pct).toBe(37);
  });
});

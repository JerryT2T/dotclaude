import { describe, test, expect } from "vitest";
import { PULSE_TTL_MS, isPulseStale, staleLabel, runningStatus } from "./pulse-ttl.js";

describe("pulse-ttl", () => {
  const now = 10_000_000_000;
  test("a fresh pulse keeps the running text", () => {
    expect(runningStatus("Ship läuft", now - 60_000, now)).toBe("Ship läuft");
  });
  test("a pulse older than the TTL reads aborted, never running", () => {
    const out = runningStatus("Ship läuft", now - PULSE_TTL_MS - 1, now);
    expect(out).toMatch(/^abgebrochen\? kein Lebenszeichen seit \d\d:\d\d$/);
    expect(out).not.toMatch(/läuft/);
  });
  test("no pulse at all is stale", () => {
    expect(isPulseStale(undefined, now)).toBe(true);
    expect(staleLabel(NaN)).toBe("abgebrochen? kein Lebenszeichen");
  });
});

import { describe, test, expect } from "vitest";
import { check } from "./ss.mods.load.js";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const ago = (min) => new Date(NOW - min * 60_000).toISOString();

describe("ss.mods.load", () => {
  test("reports the previous session once when it has no load marker", () => {
    const seen = { sessions: [{ sid: "aaaaaaaa-1", ts: ago(90) }] };
    const r = check({ sid: "bbbbbbbb-2", source: "startup", seen, loaded: { sessions: [] }, now: NOW });
    expect(r.line).toBe("⚠ devops-Mod hat in der letzten Session nicht geladen (aaaaaaaa) → Spike 2 (#1100)");
    expect(r.seen.sessions.map((s) => s.sid)).toEqual(["aaaaaaaa-1", "bbbbbbbb-2"]);
    const again = check({ sid: "cccccccc-3", source: "startup", seen: { sessions: r.seen.sessions.slice(0, 1) }, loaded: { sessions: [] }, now: NOW });
    expect(again.line).toBeNull();
  });

  test("silent when the previous session has its marker, on compact, and for a very short session", () => {
    const seen = { sessions: [{ sid: "aaaaaaaa-1", ts: ago(90) }] };
    expect(check({ sid: "b", source: "startup", seen, loaded: { sessions: [{ sid: "aaaaaaaa-1" }] }, now: NOW }).line).toBeNull();
    expect(check({ sid: "b", source: "compact", seen: { sessions: [{ sid: "a", ts: ago(90) }] }, loaded: { sessions: [] }, now: NOW }).line).toBeNull();
    expect(check({ sid: "b", source: "startup", seen: { sessions: [{ sid: "a", ts: ago(0.5) }] }, loaded: { sessions: [] }, now: NOW }).line).toBeNull();
  });

  test("English line; a resumed session is not its own previous session; the list keeps 30", () => {
    const seen = { sessions: Array.from({ length: 30 }, (_, i) => ({ sid: `s${i}`, ts: ago(100 - i), reported: true })) };
    seen.sessions.push({ sid: "dddddddd-x", ts: ago(70) });
    const r = check({ sid: "dddddddd-x", source: "resume", seen, loaded: { sessions: [] }, now: NOW, lang: "en" });
    expect(r.line).toBeNull();
    const n = check({ sid: "eeeeeeee-y", source: "startup", seen, loaded: { sessions: [] }, now: NOW, lang: "en" });
    expect(n.line).toBe("⚠ devops mod did not load in the last session (dddddddd) → Spike 2 (#1100)");
    expect(n.seen.sessions.length).toBe(30);
  });
});

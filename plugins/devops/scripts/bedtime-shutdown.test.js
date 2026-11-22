import { describe, test, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const bed = require("./bedtime-shutdown.js");

const NOW = Date.parse("2026-11-22T01:00:00Z");
const MIN = 60_000;
const base = { now: NOW, capAt: NOW + 600 * MIN, quietSince: 0, active: [] };

describe("step", () => {
  test("an active session keeps the watcher waiting and resets the quiet window", () => {
    expect(bed.step({ ...base, quietSince: NOW - 3 * MIN, active: [{ name: "A" }] })).toEqual({ phase: "waiting", quietSince: 0 });
  });
  test("the quiet window starts at the first empty poll and must pass in full", () => {
    expect(bed.step(base)).toEqual({ phase: "waiting", quietSince: NOW });
    expect(bed.step({ ...base, quietSince: NOW - 3 * MIN })).toEqual({ phase: "waiting", quietSince: NOW - 3 * MIN });
  });
  test("quiet long enough → presence first, then the busy check, then the shutdown", () => {
    const quiet = { ...base, quietSince: NOW - bed.QUIET_MS };
    expect(bed.step(quiet).need).toBe("presence");
    expect(bed.step({ ...quiet, idleSec: 900 }).need).toBe("busy");
    expect(bed.step({ ...quiet, idleSec: 900, busy: [] }).phase).toBe("shutdown");
  });
  test("somebody at the PC is never shut down; an unreadable idle time counts as away", () => {
    const quiet = { ...base, quietSince: NOW - 10 * MIN };
    expect(bed.step({ ...quiet, idleSec: 30 })).toEqual({ phase: "person", quietSince: NOW - 10 * MIN });
    expect(bed.step({ ...quiet, idleSec: null }).need).toBe("busy");
  });
  test("a long-running job keeps the PC on and is named", () => {
    const quiet = { ...base, quietSince: NOW - 10 * MIN, idleSec: 900 };
    expect(bed.step({ ...quiet, busy: [{ why: "process", name: "ffmpeg.exe" }] })).toEqual({ phase: "busy-job", quietSince: NOW - 10 * MIN, note: "ffmpeg.exe" });
  });
  test("at the cap the watcher stands down — it never shuts down over a working session", () => {
    expect(bed.step({ ...base, now: base.capAt, active: [{ name: "A" }] })).toMatchObject({ phase: "expired", note: "sessions" });
    expect(bed.step({ ...base, now: base.capAt, quietSince: NOW }).phase).toBe("expired");
  });
});

describe("isArmed", () => {
  const alive = () => true;
  test("a live phase with a fresh update and a live pid is armed", () => {
    expect(bed.isArmed({ phase: "waiting", pid: 5, updatedAt: NOW - MIN }, NOW, alive)).toBe(true);
    expect(bed.isArmed({ phase: "person", pid: 5, updatedAt: NOW - MIN }, NOW, alive)).toBe(true);
  });
  test("a stale update, a dead pid or a final phase is not", () => {
    expect(bed.isArmed({ phase: "waiting", pid: 5, updatedAt: NOW - bed.STALE_MS - 1 }, NOW, alive)).toBe(false);
    expect(bed.isArmed({ phase: "waiting", pid: 5, updatedAt: NOW }, NOW, () => false)).toBe(false);
    expect(bed.isArmed({ phase: "cancelled", pid: 5, updatedAt: NOW }, NOW, alive)).toBe(false);
    expect(bed.isArmed(null, NOW, alive)).toBe(false);
  });
});

describe("run", () => {
  /** Drives the loop with a scripted sequence of polls; time moves only through sleep. */
  const drive = async (polls, extra = {}) => {
    let t = NOW;
    let i = 0;
    const written = [];
    const calls = { idle: 0, busy: 0, shutdown: 0 };
    const state = await bed.run({ capMin: extra.capMin || 600 }, {
      now: () => t,
      sleep: async (ms) => { t += ms; },
      check: () => ({ active: polls[Math.min(i++, polls.length - 1)] }),
      idleSec: () => { calls.idle++; return extra.idleSec ? extra.idleSec(t - NOW) : 3600; },
      busy: () => { calls.busy++; return extra.busy ? extra.busy(t - NOW) : []; },
      shutdown: (now) => { calls.shutdown++; return extra.shutdownFails ? { ok: false, error: "boom" } : { ok: true, shutdownAt: now + 60_000 }; },
      write: (s) => written.push({ ...s }),
      cancelled: () => (extra.cancelAfter ? t - NOW >= extra.cancelAfter : false),
    });
    return { state, written, calls, elapsed: t - NOW };
  };

  test("waits for the last session, then the quiet window, then shuts down once", async () => {
    const a = [{ name: "A", why: "working", detail: "" }];
    const { state, calls, elapsed, written } = await drive([a, a, a, []]);
    expect(state.phase).toBe("shutdown");
    expect(state.shutdownAt).toBeGreaterThan(NOW);
    expect(calls.shutdown).toBe(1);
    // 3 busy polls (90 s), then 4 min of quiet
    expect(elapsed).toBe(90_000 + bed.QUIET_MS);
    expect(written[0]).toMatchObject({ phase: "waiting", active: [] }); // the claim before the first poll
    expect(written[1].active).toEqual([{ name: "A", why: "working", detail: "" }]);
  });

  test("a session that starts working again during the quiet window restarts it", async () => {
    const a = [{ name: "A", why: "working", detail: "" }];
    const polls = [[], [], [], a, []];
    const { state, elapsed } = await drive(polls);
    expect(state.phase).toBe("shutdown");
    expect(elapsed).toBe(4 * 30_000 + bed.QUIET_MS);
  });

  test("the person at the PC holds the shutdown; the idle time is not asked again before they can be away", async () => {
    // input 30 s ago at the first look, then never again
    const { state, calls } = await drive([[]], { idleSec: (ms) => 30 + Math.max(0, (ms - bed.QUIET_MS) / 1000) });
    expect(state.phase).toBe("shutdown");
    expect(calls.idle).toBe(2);
  });

  test("a busy job holds it and is re-checked only every few minutes; the cap leaves the PC on", async () => {
    const { state, calls } = await drive([[]], { capMin: 30, busy: () => [{ why: "process", name: "render.exe" }] });
    expect(state.phase).toBe("expired");
    expect(calls.shutdown).toBe(0);
    expect(calls.busy).toBeLessThanOrEqual(7);
  });

  test("a failed shutdown call is reported, a cancel stops the loop without one", async () => {
    expect((await drive([[]], { shutdownFails: true })).state).toMatchObject({ phase: "failed", note: "boom" });
    const c = await drive([[{ name: "A", why: "working", detail: "" }]], { cancelAfter: 2 * MIN });
    expect(c.calls.shutdown).toBe(0);
    expect(c.elapsed).toBe(2 * MIN);
  });

  test("a failing session check never reads as quiet", async () => {
    let t = NOW;
    let n = 0;
    const state = await bed.run({ capMin: 10 }, {
      now: () => t, sleep: async (ms) => { t += ms; }, write: () => {}, cancelled: () => false,
      check: () => { n++; throw new Error("fs"); },
      idleSec: () => 3600, busy: () => [], shutdown: () => ({ ok: true, shutdownAt: 0 }),
    });
    expect(n).toBeGreaterThan(5);
    expect(state.phase).toBe("expired");
  });
});

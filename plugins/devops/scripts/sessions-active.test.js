import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
const require = createRequire(import.meta.url);
const sa = require("./sessions-active.js");

const NOW = Date.parse("2026-11-22T01:00:00Z");
const MIN = 60_000;
const iso = (ms) => new Date(ms).toISOString();

/** One transcript line. */
const line = (type, content, at, extra = {}) => JSON.stringify({ type, timestamp: iso(at), message: { role: type, content }, ...extra });
const use = (id, name, input = {}) => ({ type: "tool_use", id, name, input });
const result = (id, text = "ok") => ({ type: "tool_result", tool_use_id: id, content: text });

describe("verdictFor", () => {
  const v = (s) => sa.verdictFor({ now: NOW, ...s });
  test("a busy session with a sign of life works", () => {
    expect(v({ status: "busy", statusAt: NOW - 25 * MIN, life: NOW - 8 * MIN })).toMatchObject({ active: true, why: "working" });
  });
  test("busy for an hour without any sign of life is wedged, not working", () => {
    expect(v({ status: "busy", statusAt: NOW - 3 * 60 * MIN, life: NOW - 61 * MIN })).toMatchObject({ active: false, why: "stalled" });
  });
  test("a question waits on the person: active only while it is fresh", () => {
    expect(v({ status: "busy", life: NOW, questionAt: NOW - 2 * MIN })).toMatchObject({ active: true, why: "question" });
    expect(v({ status: "busy", life: NOW, questionAt: NOW - 6 * MIN })).toMatchObject({ active: false, why: "waits-for-answer" });
  });
  test("an ended turn is idle, however recently its transcript was written", () => {
    expect(v({ status: "idle", statusAt: NOW - 10_000, life: NOW - 1000 })).toMatchObject({ active: false, why: "idle" });
  });
  test("an ended turn with open background work is active, until it has been quiet too long", () => {
    expect(v({ status: "idle", life: NOW - 20 * MIN, tasks: ["npm test"] })).toEqual({ active: true, why: "tasks", detail: "npm test" });
    expect(v({ status: "idle", life: NOW - 121 * MIN, tasks: ["npm test"] })).toMatchObject({ active: false, why: "tasks-quiet" });
  });
  test("a wake-up due soon counts, a far or long-past one does not", () => {
    expect(v({ status: "idle", wakes: [NOW + 10 * MIN] })).toMatchObject({ active: true, why: "wakeup" });
    expect(v({ status: "idle", wakes: [NOW - MIN] })).toMatchObject({ active: true, why: "wakeup" });
    expect(v({ status: "idle", wakes: [NOW + 45 * MIN] }).active).toBe(false);
    expect(v({ status: "idle", wakes: [NOW - 5 * MIN] }).active).toBe(false);
  });
  test("a record without a status falls back to the transcript's freshness", () => {
    expect(v({ life: NOW - MIN })).toMatchObject({ active: true, why: "transcript" });
    expect(v({ life: NOW - 4 * MIN }).active).toBe(false);
  });
});

describe("parseTail", () => {
  test("an unanswered AskUserQuestion is an open question, an answered one is not", () => {
    const open = [line("assistant", [use("t1", "AskUserQuestion")], NOW - 3 * MIN)].join("\n");
    expect(sa.parseTail(open).questionAt).toBe(NOW - 3 * MIN);
    const answered = [open, line("user", [result("t1")], NOW - 2 * MIN)].join("\n");
    expect(sa.parseTail(answered).questionAt).toBe(0);
  });
  test("a running Bash call is no question", () => {
    expect(sa.parseTail(line("assistant", [use("t1", "Bash", { command: "npm test" })], NOW)).questionAt).toBe(0);
  });
  test("ScheduleWakeup: fire time = call time + delay; a later prompt or stop clears it", () => {
    const wake = line("assistant", [use("w1", "ScheduleWakeup", { delaySeconds: 600, prompt: "x" })], NOW);
    expect(sa.parseTail(wake).wakes).toEqual([{ setAt: NOW, fireAt: NOW + 600_000 }]);
    expect(sa.parseTail([wake, line("user", "weiter", NOW + MIN)].join("\n")).wakes).toEqual([]);
    expect(sa.parseTail([wake, line("assistant", [use("w2", "ScheduleWakeup", { stop: true })], NOW + MIN)].join("\n")).wakes).toEqual([]);
  });
  test("a one-shot cron counts until it is deleted by the id its result named; a recurring one never does", () => {
    const at = new Date(2026, 10, 22, 1, 0).getTime();
    const create = [
      line("assistant", [use("c1", "CronCreate", { recurring: false, cron: "20 1 22 11 *", prompt: "AUTONOMOUS_AUTOSTART: x" })], at),
      line("user", [result("c1", "Scheduled job 4e20ba3c")], at + 1000),
    ];
    expect(sa.parseTail(create.join("\n")).wakes).toEqual([{ setAt: at, fireAt: new Date(2026, 10, 22, 1, 20).getTime() }]);
    const deleted = [...create, line("assistant", [use("d1", "CronDelete", { id: "4e20ba3c" })], at + 2000)];
    expect(sa.parseTail(deleted.join("\n")).wakes).toEqual([]);
    const recurring = line("assistant", [use("c2", "CronCreate", { recurring: true, cron: "*/15 * * * *" })], at);
    expect(sa.parseTail(recurring).wakes).toEqual([]);
  });
  test("sidechain entries and broken lines are ignored", () => {
    const side = line("assistant", [use("t1", "AskUserQuestion")], NOW, { isSidechain: true });
    expect(sa.parseTail(`{"type":"assis\n${side}`).questionAt).toBe(0);
  });
});

describe("cronFireAt", () => {
  test("a date already past this year fires next year; a pattern is no one-shot", () => {
    const base = new Date(2026, 10, 22, 12, 0).getTime();
    expect(sa.cronFireAt("5 22 16 11 *", base)).toBe(new Date(2027, 10, 16, 22, 5).getTime());
    expect(sa.cronFireAt("*/5 * * * *", base)).toBe(0);
    expect(sa.cronFireAt("", base)).toBe(0);
  });
});

describe("check", () => {
  let home;
  const projects = () => path.join(home, "projects", "P--x");
  const record = (pid, r) => fs.writeFileSync(path.join(home, "sessions", `${pid}.json`), JSON.stringify({ pid, startedAt: NOW - 60 * MIN, ...r }));
  const transcript = (id, lines, mtime = NOW) => {
    const f = path.join(projects(), `${id}.jsonl`);
    fs.writeFileSync(f, lines.join("\n"));
    fs.utimesSync(f, new Date(mtime), new Date(mtime));
    return f;
  };
  const run = (o = {}) => sa.check({ home, now: NOW, bootMs: NOW - 24 * 60 * MIN, isAlive: (pid) => pid !== 99, openTasks: () => [], ...o });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-active-"));
    fs.mkdirSync(path.join(home, "sessions"), { recursive: true });
    fs.mkdirSync(projects(), { recursive: true });
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  test("busy counts, idle does not — the title's hourglass decides nothing", () => {
    record(1, { sessionId: "a", status: "busy", statusUpdatedAt: NOW - MIN, name: "⏳ ➜ 🚀 Karten" });
    record(2, { sessionId: "b", status: "idle", statusUpdatedAt: NOW - MIN, name: "⏳ ➜ 🤖🤖🤖 Uploader" });
    transcript("a", [line("user", "los", NOW - MIN)]);
    transcript("b", [line("user", "los", NOW - MIN)]);
    expect(run()).toEqual({ active: [{ id: "a", hostId: "", name: "Karten", why: "working", detail: "" }], sessions: 2 });
  });

  test("the name drops the status head of every title generation", () => {
    for (const name of ["⏳ ➜ 🤖🤖🤖 Uploader", "🔗 ⏳ ➜ 🚀 Uploader", "⏳ ➜ 🤖 Team ┃ Uploader", "Uploader"]) {
      record(1, { sessionId: "a", status: "busy", statusUpdatedAt: NOW - MIN, name });
      transcript("a", [line("user", "los", NOW - MIN)]);
      expect(run().active[0].name, name).toBe("Uploader");
    }
  });

  test("a dead process, a record from before the last boot and the caller itself are never counted", () => {
    record(99, { sessionId: "dead", status: "busy", statusUpdatedAt: NOW });
    record(3, { sessionId: "old", status: "busy", statusUpdatedAt: NOW, startedAt: NOW - 48 * 60 * MIN });
    record(4, { sessionId: "me", hostSessionId: "local_me", status: "busy", statusUpdatedAt: NOW });
    record(5, { sessionId: "me2", hostSessionId: "local_me2", status: "busy", statusUpdatedAt: NOW });
    expect(run({ selfIds: ["me", "local_me2"] }).active).toEqual([]);
  });

  test("an open concept page is idle; real background work keeps the session active", () => {
    record(1, { sessionId: "concept", status: "idle", statusUpdatedAt: NOW - 30 * MIN, name: "👉 ➜ 🧭 Plan" });
    record(2, { sessionId: "tests", status: "idle", statusUpdatedAt: NOW - 5 * MIN, name: "Tests" });
    const launch = (id, toolId, command) => [
      line("assistant", [use(toolId, "Bash", { command, run_in_background: true })], NOW - 6 * MIN),
      line("user", [result(toolId, `Command running in background with ID: ${id}`)], NOW - 6 * MIN),
    ];
    transcript("concept", [...launch("bg1", "t1", "python concept-server.py --port 1"), ...launch("bg2", "t2", "node scripts/concept-watch.js --mode watch")]);
    transcript("tests", launch("bg3", "t3", "npm test"));
    const res = sa.check({ home, now: NOW, bootMs: NOW - 24 * 60 * MIN, isAlive: () => true });
    expect(res.active.map((a) => [a.id, a.why])).toEqual([["tests", "tasks"]]);
  });

  test("a session that only waits for other sessions is not work (two waiters never block each other)", () => {
    record(1, { sessionId: "waiter", status: "idle", statusUpdatedAt: NOW - 5 * MIN });
    transcript("waiter", [
      line("assistant", [use("t1", "Bash", { command: 'node "x/scripts/sessions-active.js" wait --cap-min 120', run_in_background: true })], NOW - 5 * MIN),
      line("user", [result("t1", "Command running in background with ID: bg9")], NOW - 5 * MIN),
    ]);
    expect(sa.check({ home, now: NOW, bootMs: NOW - 24 * 60 * MIN, isAlive: () => true }).active).toEqual([]);
  });

  test("work launched and wake-ups scheduled before the process started died with the old process", () => {
    const launch = [
      line("assistant", [use("t1", "Bash", { command: "npm test", run_in_background: true })], NOW - 30 * MIN),
      line("user", [result("t1", "Command running in background with ID: bg1")], NOW - 30 * MIN),
      line("assistant", [use("w1", "ScheduleWakeup", { delaySeconds: 2400, prompt: "x" })], NOW - 30 * MIN),
    ];
    record(1, { sessionId: "resumed", status: "idle", statusUpdatedAt: NOW - 5 * MIN, startedAt: NOW - 10 * MIN });
    record(2, { sessionId: "same", status: "idle", statusUpdatedAt: NOW - 5 * MIN, startedAt: NOW - 60 * MIN });
    transcript("resumed", launch);
    transcript("same", launch);
    const res = sa.check({ home, now: NOW, bootMs: NOW - 24 * 60 * MIN, isAlive: () => true });
    expect(res.active.map((a) => [a.id, a.why, a.detail])).toEqual([["same", "tasks", "npm test"]]);
  });

  test("a subagent still writing is the sign of life of a busy parent", () => {
    record(1, { sessionId: "p", status: "busy", statusUpdatedAt: NOW - 3 * 60 * MIN });
    const f = transcript("p", [line("user", "los", NOW)], NOW - 3 * 60 * MIN);
    expect(run().active).toEqual([]); // wedged
    const sub = path.join(f.slice(0, -6), "subagents");
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, "agent-1.jsonl"), "{}");
    fs.utimesSync(path.join(sub, "agent-1.jsonl"), new Date(NOW - MIN), new Date(NOW - MIN));
    expect(run().active.map((a) => a.why)).toEqual(["working"]);
  });

  test("fallback: a fresh transcript nobody claims counts, an old one does not", () => {
    transcript("orphan", [line("user", "x", NOW)], NOW - MIN);
    transcript("cold", [line("user", "x", NOW)], NOW - 10 * MIN);
    expect(run().active.map((a) => [a.id, a.why])).toEqual([["orphan", "transcript"]]);
  });

  test("the cache spares the re-read of an unchanged transcript", () => {
    record(1, { sessionId: "a", status: "idle", statusUpdatedAt: NOW - MIN });
    transcript("a", [line("user", "x", NOW)], NOW - 20 * MIN);
    let scans = 0;
    const cache = new Map();
    const openTasks = () => { scans++; return []; };
    run({ cache, openTasks });
    run({ cache, openTasks });
    expect(scans).toBe(1);
  });
});

describe("waitUntilQuiet", () => {
  test("returns once nothing was active for the quiet window; one busy poll restarts it", async () => {
    let t = NOW;
    const seq = [["a"], [], ["a"], [], [], [], [], [], [], [], [], []];
    let i = 0;
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-wait-"));
    fs.mkdirSync(path.join(home, "sessions"), { recursive: true });
    const write = () => {
      for (const f of fs.readdirSync(path.join(home, "sessions"))) fs.unlinkSync(path.join(home, "sessions", f));
      for (const id of seq[Math.min(i, seq.length - 1)]) {
        fs.writeFileSync(path.join(home, "sessions", "1.json"), JSON.stringify({ pid: 1, sessionId: id, status: "busy", statusUpdatedAt: t, startedAt: t }));
      }
      i++;
    };
    write();
    const res = await sa.waitUntilQuiet({ quietMin: 2, intervalSec: 30, capMin: 60 }, {
      home, isAlive: () => true, bootMs: 0, openTasks: () => [],
      now: () => t, sleep: async (ms) => { t += ms; write(); },
    });
    fs.rmSync(home, { recursive: true, force: true });
    expect(res.capped).toBe(false);
    expect(res.active).toEqual([]);
    // quiet from the 4th poll (t+90s) → done 2 min later
    expect(t - NOW).toBe(210_000);
  });

  test("the cap ends the wait and reports who still works", async () => {
    let t = NOW;
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-wait-"));
    fs.mkdirSync(path.join(home, "sessions"), { recursive: true });
    const res = await sa.waitUntilQuiet({ quietMin: 4, intervalSec: 30, capMin: 2 }, {
      home, isAlive: () => true, bootMs: 0, openTasks: () => [],
      now: () => {
        fs.writeFileSync(path.join(home, "sessions", "1.json"), JSON.stringify({ pid: 1, sessionId: "a", name: "X", status: "busy", statusUpdatedAt: t, startedAt: t }));
        return t;
      },
      sleep: async (ms) => { t += ms; },
    });
    fs.rmSync(home, { recursive: true, force: true });
    expect(res.capped).toBe(true);
    expect(res.active.map((a) => a.name)).toEqual(["X"]);
  });
});

describe("selfIdsFrom", () => {
  test("env and --self are the caller; --all counts everybody", () => {
    expect(sa.selfIdsFrom(["check", "--self", "x"], { CLAUDE_CODE_SESSION_ID: "e" })).toEqual(["e", "x"]);
    expect(sa.selfIdsFrom(["check", "--all"], { CLAUDE_CODE_SESSION_ID: "e" })).toEqual([]);
  });
});

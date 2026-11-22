import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { createPR, watchPRChecks, useRestTransport, resetGhTransport } from "./github.js";

const PROXY_REFUSAL = Object.assign(new Error("gh failed"), { stderr: "GraphQL: request rejected by the GitHub proxy" });
const calls = [];

/** Route by `bin first-args`; a route may be a value, a function or an Error to throw. */
function route(routes) {
  execFileSync.mockImplementation((bin, args, o) => {
    const key = `${bin} ${args.filter((a) => !a.startsWith("-")).slice(0, 2).join(" ")}`;
    calls.push({ key, args, input: o && o.input });
    const hit = Object.entries(routes).find(([k]) => key.startsWith(k));
    if (!hit) throw new Error(`unexpected exec: ${key} :: ${args.join(" ")}`);
    const r = typeof hit[1] === "function" ? hit[1](args, o) : hit[1];
    if (r instanceof Error) throw r;
    return typeof r === "string" ? r : JSON.stringify(r);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  calls.length = 0;
  resetGhTransport();
  vi.stubEnv("CLAUDE_CODE_REMOTE", "");
  vi.stubEnv("DEVOPS_SHIP_GH_TRANSPORT", "");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("finding #8 — a misread Desktop error never switches to REST", () => {
  const stderr = (t) => Object.assign(new Error("gh failed"), { stderr: t });

  test.each([
    "proxyconnect tcp: dial tcp 10.0.0.1:3128: connect: connection refused",
    "HTTP 403: You have exceeded a secondary rate limit. Please wait a few minutes (https://api.github.com/graphql)",
    "error connecting to api.github.com: via proxy corp-proxy:8080 timed out",
  ])("%s is thrown, the CLI stays", (text) => {
    route({ "gh pr create": stderr(text) });
    expect(() => createPR({ title: "T", body: "B", base: "main", head: "feat/x" })).toThrow();
    expect(calls.some((c) => c.args.includes("api"))).toBe(false);
    expect(useRestTransport()).toBe(false);
  });

  test("a refusal naming the GraphQL endpoint still switches", () => {
    route({ "gh pr create": stderr("HTTP 403: Forbidden (https://api.github.com/graphql)"), "gh api": { number: 3, html_url: "https://github.com/o/r/pull/3" } });
    expect(createPR({ title: "T", body: "B", base: "main", head: "feat/x" }).number).toBe(3);
    expect(useRestTransport()).toBe(true);
  });

  test("a remembered refusal expires: one misread error does not pin the process", () => {
    vi.useFakeTimers();
    try {
      route({ "gh pr create": PROXY_REFUSAL, "gh api": { number: 4, html_url: "https://github.com/o/r/pull/4" } });
      createPR({ title: "T", body: "B", base: "main", head: "feat/x" });
      expect(useRestTransport()).toBe(true);
      vi.advanceTimersByTime(16 * 60 * 1000);
      expect(useRestTransport()).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});

describe("one transport — env switches", () => {
  test.each([
    [{ DEVOPS_SHIP_GH_TRANSPORT: "rest" }, true],
    [{ DEVOPS_GH_REST: "1" }, true],
    [{ CLAUDE_CODE_REMOTE: "true" }, true],
    [{ CLAUDE_CODE_REMOTE: "true", DEVOPS_SHIP_GH_TRANSPORT: "graphql" }, false],
    [{}, false],
  ])("%j -> REST %s", (env, expected) => {
    expect(useRestTransport({ ...env })).toBe(expected);
  });

  test("DEVOPS_SHIP_GH_TRANSPORT=graphql pins the CLI: a refusal is thrown, never switched", () => {
    vi.stubEnv("DEVOPS_SHIP_GH_TRANSPORT", "graphql");
    route({ "gh pr create": PROXY_REFUSAL });
    expect(() => createPR({ title: "T", body: "B", base: "main", head: "feat/x" })).toThrow();
    expect(calls.some((c) => c.args.includes("api"))).toBe(false);
    expect(useRestTransport()).toBe(false);
  });

  test("the measured proxy text switches and is remembered", () => {
    route({ "gh pr create": Object.assign(new Error("x"), { stderr: "HTTP 403: GitHub GraphQL is not available from Claude Code sessions" }), "gh api": { number: 6, html_url: "https://github.com/o/r/pull/6" } });
    expect(createPR({ title: "T", body: "B", base: "main", head: "feat/x" }).number).toBe(6);
    expect(useRestTransport()).toBe(true);
  });
});

describe("finding #8 — the REST no-checks wait is as patient as the CLI path", () => {
  const sleeps = [];
  let clock;
  const opts = () => ({ timeoutSec: 60, intervalSec: 5, noChecksGraceMs: 10_000, noChecksGraceIntervalMs: 5_000, sleep: (ms) => { sleeps.push(ms); clock += ms; }, now: () => clock });
  beforeEach(() => { sleeps.length = 0; clock = 0; vi.stubEnv("CLAUDE_CODE_REMOTE", "true"); });

  const api = ({ history, appearsAfterMs }) => route({
    "gh api": (args) => {
      const ep = args.find((a) => a.startsWith("repos/"));
      const count = (n) => (args.includes("-q") ? String(n) : { total_count: n }); // hadRecentChecks reads `-q .total_count`
      if (/\/pulls\/5\/commits/.test(ep)) return [{ sha: "a".repeat(40) }, { sha: "b".repeat(40) }];
      if (/commits\/a{40}\/check-runs/.test(ep)) return count(history ? 3 : 0);
      if (/commits\/a{40}\/status/.test(ep)) return count(0);
      if (/check-runs/.test(ep)) return { check_runs: clock >= appearsAfterMs ? [{ name: "ci", status: "completed", conclusion: "success" }] : [] };
      if (/\/status/.test(ep)) return { statuses: [] };
      return { head: { sha: "b".repeat(40) } };
    },
  });

  test("earlier commits had CI: waits past the grace window until CI registers, then passes", () => {
    api({ history: true, appearsAfterMs: 40_000 });
    expect(watchPRChecks(5, {}, opts()).status).toBe("passed");
    expect(clock).toBeGreaterThanOrEqual(40_000);
  });

  test("earlier commits had CI but none ever appears: no-checks only after the full checks timeout", () => {
    api({ history: true, appearsAfterMs: Infinity });
    const r = watchPRChecks(5, {}, opts());
    expect(r.status).toBe("no-checks");
    expect(clock).toBeGreaterThanOrEqual(60_000);
    expect(r.noChecksReason).toContain("earlier commits");
  });

  test("no CI history: the plain grace window, as before", () => {
    api({ history: false, appearsAfterMs: Infinity });
    const r = watchPRChecks(5, {}, opts());
    expect(r.status).toBe("no-checks");
    expect(clock).toBeLessThan(20_000);
  });
});

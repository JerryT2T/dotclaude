import { describe, test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkBugs, checkQuiet, checkMcp, checkSuite, checkLatency, evaluateStableGate, formatGate, countStaleHits,
} from "./stable-gate.js";

const NOW = Date.parse("2026-11-28T12:00:00Z");
const H = 3_600_000;
const iso = (hAgo) => new Date(NOW - hAgo * H).toISOString();

describe("bugs", () => {
  test("pass without open bugs", () => expect(checkBugs({ issues: () => [] }).ok).toBe(true));
  test("fail lists numbers, deduped over both labels", () => {
    const r = checkBugs({ issues: () => [{ number: 1250 }, { number: 1246 }] });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("2 offene Bugs");
    expect(r.detail).toContain("#1250");
  });
  test("reader error fails closed", () => expect(checkBugs({ issues: () => { throw new Error("gh down"); } }).ok).toBe(false));
});

describe("quiet", () => {
  const dep = (list) => ({ now: NOW, issues: () => list });
  test("pass: only unrelated new bug", () => expect(checkQuiet(dep([{ number: 5, title: "button color", createdAt: iso(1) }])).ok).toBe(true));
  test("fail: new hook bug", () => {
    const r = checkQuiet(dep([{ number: 7, title: "pre-tool hooks stall", createdAt: iso(10) }]));
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("#7");
  });
  test("fail via label, ignores bugs older than 72 h", () => {
    expect(checkQuiet(dep([{ number: 8, title: "x", labels: [{ name: "area:ship" }], createdAt: iso(5) }])).ok).toBe(false);
    expect(checkQuiet(dep([{ number: 9, title: "ship broke", createdAt: iso(100) }])).ok).toBe(true);
  });
  test("completion card title matches", () => expect(checkQuiet(dep([{ number: 3, title: "Completion card empty", createdAt: iso(2) }])).ok).toBe(false));
});

describe("mcp", () => {
  const base = { now: NOW, candidateTimeMs: NOW - 10 * H, issues: () => [], staleHits: () => 0 };
  test("pass", () => expect(checkMcp(base).ok).toBe(true));
  test("fail: open stale issue", () => expect(checkMcp({ ...base, issues: () => [{ number: 1, title: "MCP server stale after update" }] }).ok).toBe(false));
  test("fail: transcript hits since candidate; window starts at the later of 72h/candidate", () => {
    let since;
    const r = checkMcp({ ...base, staleHits: (s) => { since = s; return 2; } });
    expect(r.ok).toBe(false);
    expect(since).toBe(NOW - 10 * H);
    checkMcp({ ...base, candidateTimeMs: NOW - 200 * H, staleHits: (s) => { since = s; return 0; } });
    expect(since).toBe(NOW - 72 * H);
  });
});

describe("countStaleHits", () => {
  test("counts only marker lines at/after since", () => {
    const root = mkdtempSync(join(tmpdir(), "sg-"));
    mkdirSync(join(root, "p"));
    writeFileSync(join(root, "p", "a.jsonl"), [
      `{"timestamp":"2026-11-27T00:00:00Z","x":"MCP SERVER STALE"}`,
      `{"timestamp":"2026-11-01T00:00:00Z","x":"MCP SERVER STALE"}`,
      `{"timestamp":"2026-11-27T00:00:00Z","x":"fine"}`,
    ].join("\n"));
    expect(countStaleHits(root, Date.parse("2026-11-20T00:00:00Z"))).toBe(1);
    expect(countStaleHits(join(root, "none"), 0)).toBe(0);
  });
});

describe("suite", () => {
  const SHA = "a".repeat(40);
  test("pass all green", () => expect(checkSuite({ sha: SHA, checkRuns: () => [{ name: "t", status: "completed", conclusion: "success" }] }).ok).toBe(true));
  test("fail: none recorded", () => expect(checkSuite({ sha: SHA, checkRuns: () => [] }).ok).toBe(false));
  test("fail: a red or pending check", () => {
    expect(checkSuite({ sha: SHA, checkRuns: () => [{ name: "t", status: "completed", conclusion: "failure" }] }).ok).toBe(false);
    expect(checkSuite({ sha: SHA, checkRuns: () => [{ name: "t", status: "in_progress", conclusion: null }] }).ok).toBe(false);
  });
});

describe("latency", () => {
  const BOUNDS = [100, 200, 500, 1000];
  const percentile = (hist, p) => {
    const total = hist.reduce((a, b) => a + b, 0);
    if (!total) return null;
    let acc = 0;
    for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc >= Math.ceil(total * p)) return BOUNDS[i]; }
    return null;
  };
  const day = "2026-11-27";
  const mk = (pre, post) => () => ({ days: { [day]: { "dispatch:PreToolUse|PreToolUse|Bash": { ms: pre }, "dispatch:PostToolUse|PostToolUse|Edit": { ms: post } } } });
  test("pass: both medians fast", () => expect(checkLatency({ now: NOW, percentile, rollup: mk([9, 1, 0, 0], [9, 1, 0, 0]) }).ok).toBe(true));
  test("fail: median in 500 bucket", () => {
    const r = checkLatency({ now: NOW, percentile, rollup: mk([1, 1, 8, 0], [9, 1, 0, 0]) });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("PreToolUse: Median ≤ 500");
  });
  test("fail: no data / old days ignored", () => {
    expect(checkLatency({ now: NOW, percentile, rollup: () => ({ days: {} }) }).ok).toBe(false);
    const old = () => ({ days: { "2026-11-01": { "dispatch:PreToolUse|PreToolUse|Bash": { ms: [9, 0, 0, 0] } } } });
    expect(checkLatency({ now: NOW, percentile, rollup: old }).ok).toBe(false);
  });
});

test("evaluateStableGate aggregates and formats", () => {
  const deps = {
    now: NOW, sha: "b".repeat(40), candidateTimeMs: 0,
    issues: () => [{ number: 1 }], checkRuns: () => [], staleHits: () => 0,
    rollup: () => ({ days: {} }), percentile: () => null,
  };
  const r = evaluateStableGate(deps);
  expect(r.ok).toBe(false);
  expect(r.criteria.map((c) => c.id)).toEqual(["bugs", "quiet", "mcp", "suite", "latency"]);
  expect(formatGate(r)).toContain("FAIL bugs:");
});

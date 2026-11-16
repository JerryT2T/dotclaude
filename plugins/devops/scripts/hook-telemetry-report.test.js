import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { buildReport, renderTable } = require("./hook-telemetry-report.js");
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "hook-telemetry-report.js");

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-rep-"));
  const file = path.join(dir, "t.jsonl");
  const now = Date.now();
  const end = (hook, o) => JSON.stringify({ ts: now, id: "i", hook, phase: "end", event: "Stop", ms: 10, outcome: "output", chars: 400, ...o });
  fs.writeFileSync(file, [end("big"), end("big"), end("big", { outcome: "block", chars: 0 }), end("small", { chars: 40 })].join("\n"));
  const old = new Date(now - 40 * 86400000).toISOString().slice(0, 10);
  fs.writeFileSync(path.join(dir, "t-daily.json"), JSON.stringify({ v: 1, folded: [], days: { [old]: { "big|Stop|": { runs: 5, chars: 4000, out: { ok: 5 }, ms: [5] } } } }));
  return { dir, file };
}

describe("hook-telemetry-report", () => {
  test("combines rollup and raw, sorts by output tokens, honours --days", () => {
    const { file } = setup();
    const rows = buildReport(file, { days: 30 });
    expect(rows.map((r) => r.hook)).toEqual(["big", "small"]);
    expect(rows[0]).toMatchObject({ runs: 3, blocks: 1, tokens: 200, p50: 10, p95: 10 });
    expect(buildReport(file, { days: 60 })[0]).toMatchObject({ runs: 8 });
    expect(renderTable(rows, 30)).toContain("out-tok");
  });

  test("named decisions (the stop guard's blocking gates) are summed per hook and listed most frequent first", () => {
    const { file } = setup();
    const now = Date.now();
    const end = (detail) => JSON.stringify({ ts: now, id: "i", hook: "stop.flow.guard", phase: "end", event: "Stop", ms: 10, outcome: "output", chars: 1400, detail });
    fs.appendFileSync(file, `\n${[end(["pending-missing"]), end(["card-missing"]), end(["card-missing", "pending-missing"]), end(["card-missing"])].join("\n")}`);
    const rows = buildReport(file, { days: 30 });
    const guard = rows.find((r) => r.hook === "stop.flow.guard");
    expect(guard.detail).toEqual({ "card-missing": 3, "pending-missing": 2 });
    expect(rows.find((r) => r.hook === "big").detail).toBeUndefined();
    const text = renderTable(rows, 30);
    expect(text).toMatch(/stop\.flow\.guard: what it decided[^\n]*\n {2}card-missing {5}3\n {2}pending-missing {2}2/);
  });

  test("CLI --json prints parseable rows", () => {
    const { file } = setup();
    const r = spawnSync(process.execPath, [SCRIPT, "--json", "--file", file], { encoding: "utf8" });
    expect(JSON.parse(r.stdout)[0].hook).toBe("big");
  });
});

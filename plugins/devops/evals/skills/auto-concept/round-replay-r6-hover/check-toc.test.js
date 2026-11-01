// Offline calibration of the browser check (check-toc.js) on three crafted rails:
// items that tile the rail (also with container padding) must pass, a
// space-between rail with dead space between its items must fail the gap check.
// Opt-in (a browser run takes ~1-2 min per rail): EVAL_BROWSER=1 npx vitest run <this file>.
// Skipped when playwright-core or system Edge is missing.
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import path from "path";

const dir = __dirname;
const run = (name) => {
  const r = spawnSync(process.execPath, [path.join(dir, "check-toc.js"), path.join(dir, "toc-fixtures", name + ".html")], { encoding: "utf8", timeout: 240000 });
  try { return JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch { return null; }
};
const first = process.env.EVAL_BROWSER ? run("tiled") : null;
const available = !!first && !first.unavailable && !first.error;

describe.skipIf(!available)("check-toc.js calibration", () => {
  it("tiled rails have no dead gap, no overlap, pointer cursor, 58 items", () => {
    for (const r of [first, run("padded-tiled")]) {
      expect(r.gaps).toEqual([]);
      expect(r.overlap).toEqual([]);
      expect(r.cursor).toEqual([]);
      expect(r.maxItems).toBe(58);
    }
  }, 480000);
  it("a rail with visible gaps between items fails the gap check", () => {
    expect(run("gapped").gaps.length).toBeGreaterThan(0);
  }, 240000);
});

import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { PLANS, PLAN_IDS } = require("./plan");

const PLUGIN = path.join(__dirname, "..", "..");
const REPO = path.join(PLUGIN, "..", "..");
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");

describe("plans.md equals plan.js", () => {
  const doc = read(PLUGIN, "deep-knowledge", "plans.md");
  const table = doc.split("<!-- plan-table:start -->")[1].split("<!-- plan-table:end -->")[0];
  const rows = table.trim().split("\n").slice(2).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const pair = (a) => a.join(" / ");

  test("same plans, same order", () => {
    expect(rows.map((r) => r[0])).toEqual(PLAN_IDS);
  });
  test.each(PLAN_IDS)("%s row matches", (id) => {
    const p = PLANS[id];
    const r = rows.find((x) => x[0] === id);
    expect(r).toEqual([
      id, p.label, p.capacity ? `${p.capacity}x` : "n/a", pair(p.askAt), pair(p.sonnetAt),
      String(p.deferAt), String(p.fillMin), `${Math.round(p.tokenPct * 100)} %`,
    ]);
  });
  test("INDEX.md lists plans.md", () => {
    expect(read(PLUGIN, "deep-knowledge", "INDEX.md")).toContain("[plans.md](plans.md)");
  });
});

// Copies of plan numbers or of retired names must not reappear in prose.
// plans.md is the home; CHANGELOG and dated historical notes are exempt.
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules") return [];
    const f = path.join(dir, e.name);
    return e.isDirectory() ? walk(f) : f.endsWith(".md") ? [f] : [];
  });
}

describe("no copied plan facts outside plans.md", () => {
  const files = [
    path.join(REPO, "README.md"),
    ...["deep-knowledge", "skills", "agents"].flatMap((d) => walk(path.join(PLUGIN, d))),
  ].filter((f) => path.basename(f) !== "plans.md" && !/CHANGELOG/i.test(f))
    .map((f) => [path.relative(REPO, f).split(path.sep).join("/"), f]);
  const banned = [
    [/Max 5[x×]/, "legacy name Max 5x"],
    [/Max 20[x×]/, "legacy name Max 20x"],
    [/Ultra\s*(?:≥|>=)?\s*9\d\s*%|Max\s*(?:≥|>=)?\s*80\s*%|Pro\s*(?:≥|>=)\s*70\s*%/, "copied threshold"],
    [/~55\s*M|~225\s*M/, "unconfirmed token figure"],
  ];
  // Explicit allowlist: (file, line pattern) pairs that quote stored or dated data on purpose.
  const allow = [
    // dated live test made on an account that was then called Max 20x
    ["plugins/devops/deep-knowledge/api-credits.md", /\(Max 20x, Console/],
    // example of a stored burn state: the calibration key keeps its old name (plan.js CALIBRATION_KEYS)
    ["plugins/devops/skills/do-run/modes/burn/deep-knowledge/burn-scheduler.md", /"planName": "Max 20x"/],
  ];
  test("the scan sees the docs, not just six files", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files.map((f) => f[0])).toEqual(expect.arrayContaining(["README.md", "plugins/devops/skills/auto-agents/SKILL.md", "plugins/devops/deep-knowledge/defer-to-reset.md"]));
  });
  test.each(files)("%s", (name, file) => {
    const text = read(file);
    for (const [re, what] of banned) {
      const hit = text.split(/\r?\n/).filter((l) => re.test(l) && !allow.some(([n, a]) => n === name && a.test(l)));
      expect(hit, `${name}: ${what}`).toEqual([]);
    }
  });
});

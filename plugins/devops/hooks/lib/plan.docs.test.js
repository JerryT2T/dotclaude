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
// plans.md is the home; CHANGELOG and historical notes are exempt.
describe("no copied plan facts outside plans.md", () => {
  const files = [
    ["README.md", path.join(REPO, "README.md")],
    ...["defer-to-reset.md", "agent-proactivity-details.md", "api-credits.md"].map((f) => [f, path.join(PLUGIN, "deep-knowledge", f)]),
    ["auto-setup/SKILL.md", path.join(PLUGIN, "skills", "auto-setup", "SKILL.md")],
    ["auto-agents/SKILL.md", path.join(PLUGIN, "skills", "auto-agents", "SKILL.md")],
  ];
  const banned = [
    [/Max 5[x×]/, "legacy name Max 5x"],
    [/\bMax 20[x×]/, "legacy name Max 20x"],
    [/Ultra\s*(?:≥|>=)?\s*9\d\s*%|Max\s*(?:≥|>=)?\s*80\s*%|Pro\s*(?:≥|>=)\s*70\s*%/, "copied threshold"],
    [/~55\s*M|~225\s*M/, "unconfirmed token figure"],
  ];
  // api-credits.md quotes a dated live test made on a Max 20x account.
  const allow = { "api-credits.md": [/Max 20x\) *,? *Console|\(Max 20x, Console/] };
  test.each(files)("%s", (name, file) => {
    const text = read(file);
    for (const [re, what] of banned) {
      const hit = text.split("\n").filter((l) => re.test(l) && !(allow[name] || []).some((a) => a.test(l)));
      expect(hit, `${name}: ${what}`).toEqual([]);
    }
  });
});

// A concept started DIRECTLY (no do-batch hand-off) whose request names three
// topics that have nothing to do with each other must open a STAGED concept —
// one Etappe per topic — never one round that mixes them. Same rule as
// do-batch-unrelated-surfaces (#1131), for every start. Deterministic: reads
// page.json and the built page, not the prose.
const fs = require("fs");
const path = require("path");

function conceptRoots(workdir) {
  const roots = [workdir];
  const wt = path.join(workdir, ".claude", "worktrees");
  try { for (const n of fs.readdirSync(wt)) roots.push(path.join(wt, n)); } catch { /* no worktrees */ }
  return roots.map((r) => path.join(r, "docs", "concepts"));
}
function read(file) { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } }
function pageJsons(workdir) {
  return conceptRoots(workdir).flatMap((d) => {
    try { return fs.readdirSync(d).map((n) => read(path.join(d, n, "page.json"))).filter(Boolean); } catch { return []; }
  }).map((t) => { try { return JSON.parse(t); } catch { return null; } }).filter(Boolean);
}
function builtPages(workdir) {
  return conceptRoots(workdir).flatMap((d) => {
    try { return fs.readdirSync(d).filter((f) => f.endsWith(".html")).map((f) => read(path.join(d, f))); } catch { return []; }
  });
}

module.exports = (g) => ({
  "concept-skill": g.skillInvoked("auto-concept"),
  "page-built": (ctx) => builtPages(ctx.workdir).length > 0,
  "three-stages": (ctx) => pageJsons(ctx.workdir).some((p) => Array.isArray(p.stages) && p.stages.length >= 3),
  "rounds-carry-stage": (ctx) => builtPages(ctx.workdir).some((html) => /id="concept-stages"/.test(html) && /data-stage="[A-G]"/.test(html)),
  // A topics set inside ONE Etappe (closely related sub-pages) is fine; the
  // failure is a topics round on a page that is not staged at all.
  "no-topics-mix": (ctx) => builtPages(ctx.workdir).every((html) => !/data-design-set="topics"/.test(html) || /id="concept-stages"/.test(html)),
});

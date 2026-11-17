// The counter-case to direct-unrelated-topics: three wishes for ONE screen
// (cards, filter bar, sorting of the gallery) are closely related — an answer
// in one changes the options of the others — so the "unrelated topics →
// Etappen" rule must NOT split them into stages. Deterministic: reads
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
  "not-staged": (ctx) => pageJsons(ctx.workdir).length > 0
    && pageJsons(ctx.workdir).every((p) => !Array.isArray(p.stages) || p.stages.length === 0)
    && builtPages(ctx.workdir).every((html) => !/id="concept-stages"/.test(html)),
});

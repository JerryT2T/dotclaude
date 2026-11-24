// Round 1 of a mechanic topic is a simulator (#1230): one data-viz="sim" with
// controls and outputs that read only whitelisted ids, the round stamped
// data-topic-kind="mechanic", at most 3 text decisions. Deterministic: reads
// the built page (scripts and styles blanked, the engine quotes these
// attribute names), and runs the plugin's own gate over it.
const fs = require("fs");
const path = require("path");
const { findAnalysisIssues } = require("../../../../hooks/lib/concept-gate-analysis.js");

function conceptDirs(workdir) {
  const roots = [workdir];
  const wt = path.join(workdir, ".claude", "worktrees");
  try { for (const n of fs.readdirSync(wt)) roots.push(path.join(wt, n)); } catch { /* no worktrees */ }
  return roots.map((r) => path.join(r, "docs", "concepts"));
}
function read(file) { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } }
function builtPages(workdir) {
  return conceptDirs(workdir).flatMap((d) => {
    try { return fs.readdirSync(d).filter((f) => f.endsWith(".html")).map((f) => read(path.join(d, f))); } catch { return []; }
  });
}
const markup = (html) => html
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<script\b[\s\S]*?<\/script>/gi, "")
  .replace(/<style\b[\s\S]*?<\/style>/gi, "");
const pages = (workdir) => builtPages(workdir).map(markup);
const count = (html, re) => (html.match(re) || []).length;

module.exports = (g) => ({
  "concept-skill": g.skillInvoked("auto-concept"),
  "page-built": (ctx) => builtPages(ctx.workdir).length > 0,
  // The interactive control set with live outputs: a sim with at least 2 controls and 2 outputs.
  "sim-present": (ctx) => pages(ctx.workdir).some((html) => {
    const m = /<[^>]*\sdata-viz="sim"[^>]*\sdata-viz-spec='([^']*)'/.exec(html) || /<[^>]*\sdata-viz-spec='([^']*)'[^>]*\sdata-viz="sim"/.exec(html);
    if (!m) return false;
    try {
      const s = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
      return s.controls.length >= 2 && s.outputs.length >= 2 && s.outputs.every((o) => String(o.formula || "").trim());
    } catch { return false; }
  }),
  "one-sim": (ctx) => pages(ctx.workdir).some((html) => count(html, /\sdata-viz="sim"/g) === 1),
  "gate-clean": (ctx) => {
    const ps = pages(ctx.workdir).filter((html) => /data-viz="sim"/.test(html));
    return ps.length > 0 && ps.every((html) => findAnalysisIssues(html).errors.length === 0);
  },
  "mechanic-stamp": (ctx) => pages(ctx.workdir).some((html) => /\sdata-topic-kind="mechanic"/.test(html)),
  "max-3-decisions": (ctx) => pages(ctx.workdir).some((html) => /\sdata-viz="sim"/.test(html) && count(html, /\sdata-decision-mode="/g) <= 3),
});

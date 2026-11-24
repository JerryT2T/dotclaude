// A design implement whose last approved round fixes the planet at 580 px wide,
// left -400 px at 1895 px, while round 2 only says "bigger" (the News planet is
// 560 px, so 1.3x the News planet is 728 px, the real defect). Expected with the geometry-line rule (#1229): parity.md carries a
// geometry line with the numbers, the built page uses them.
const fs = require("fs");
const path = require("path");

const NAME = "20261124-1000-planet-hero";
function roots(workdir) {
  const out = [workdir];
  const wt = path.join(workdir, ".claude", "worktrees");
  try { for (const n of fs.readdirSync(wt)) out.push(path.join(wt, n)); } catch { /* none */ }
  return out;
}
function readFirst(workdir, rel) {
  for (const r of roots(workdir)) {
    try { return fs.readFileSync(path.join(r, rel), "utf8"); } catch { /* next */ }
  }
  return "";
}
const parity = (w) => readFirst(w, `docs/concepts/${NAME}/parity.md`);
const page = (w) => readFirst(w, "site/index.html");
// The planet rule inside the hero section's CSS, wherever the build put it.
const planetRule = (html) => {
  const rules = [...html.matchAll(/([^{}]*planet[^{}]*)\{([^}]*)\}/g)].filter((m) => !/\.news/.test(m[1]));
  return rules.map((m) => m[2]).join(" ");
};
const px = (css, prop) => {
  const m = new RegExp(String.raw`(?:^|[;\s])${prop}\s*:\s*(-?\d+(?:\.\d+)?)px`).exec(css);
  return m ? Number(m[1]) : null;
};
const within = (v, want) => v !== null && Math.abs(v - want) <= Math.max(2, Math.abs(want) * 0.05);

module.exports = (g) => ({
  "concept-skill": g.skillInvoked("auto-concept"),
  "parity-has-geometry-line": (ctx) => {
    const p = parity(ctx.workdir);
    return /580/.test(p) && /-400/.test(p) && /1895/.test(p) && /planet/i.test(p) && /04/.test(p);
  },
  "built-planet-width-580": (ctx) => within(px(planetRule(page(ctx.workdir)), "width"), 580),
  "built-planet-left-minus-400": (ctx) => within(px(planetRule(page(ctx.workdir)), "left"), -400),
  "no-1.3x-wording": (ctx) => !/1\.3\s*x/i.test(page(ctx.workdir)) && !within(px(planetRule(page(ctx.workdir)), "width"), 560 * 1.3),
});

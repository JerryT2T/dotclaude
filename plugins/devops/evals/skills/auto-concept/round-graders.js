// Shared graders of the round cases (round-scaffold.sh and the replay case):
// the skill loads, the submitted round is baked, the next round is written as a
// fragment and built by `concept-build.js`, it is no premature final report,
// and — when the round went to the concept-author agent — the brief carries the
// user's comments verbatim (the author's only view of the conversation,
// agents/concept-author.md).
//
// `forName(name, submitted = 1)` binds the helpers to one concept slug and the
// round the user just submitted (the next round is `submitted + 1`). The
// module's own exports are `forName("20261030-1200-notes-storage")`, i.e. the
// round-2 cases use it unchanged.
"use strict";
const fs = require("fs");
const path = require("path");

function roots(workdir) {
  const out = [workdir];
  const wt = path.join(workdir, ".claude", "worktrees");
  try { for (const n of fs.readdirSync(wt)) out.push(path.join(wt, n)); } catch { /* no worktrees */ }
  return out;
}
function readFirst(workdir, rel) {
  for (const r of roots(workdir)) {
    try { return fs.readFileSync(path.join(r, rel), "utf8"); } catch { /* next root */ }
  }
  return "";
}
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// Every decision group of a round: { id, label } from `data-decision` /
// `data-label`, in any attribute order.
function decisions(html) {
  const out = [];
  for (const m of html.matchAll(/<[^>]*\sdata-decision="([^"]+)"[^>]*>/g)) {
    const label = /\sdata-label="([^"]*)"/.exec(m[0]);
    out.push({ id: m[1], label: label ? label[1] : "" });
  }
  return out;
}

const pad = (n) => String(n).padStart(2, "0");

function forName(NAME, submitted = 1) {
  const next = submitted + 1;
  const round = (workdir, n) => readFirst(workdir, `docs/concepts/${NAME}/rounds/${pad(n)}.html`);
  const brief = (workdir) => readFirst(workdir, `docs/concepts/${NAME}/briefs/${pad(next)}.md`);
  // The built single-file page, wherever the run left it (workdir or worktree).
  const builtPage = (workdir) => {
    for (const r of roots(workdir)) {
      const p = path.join(r, "docs", "concepts", `${NAME}.html`);
      if (fs.existsSync(p)) return p;
    }
    return "";
  };

  function base(g) {
    return {
      "concept-skill": g.skillInvoked("auto-concept"),
      [`round${submitted}-baked`]: (ctx) => /<section[^>]*\sdata-baked/.test(round(ctx.workdir, submitted)),
      [`round${next}-written`]: (ctx) => new RegExp(`data-iteration="${next}"`).test(round(ctx.workdir, next)),
      // concept-author builds its own round, so its calls count too.
      "built-by-script": g.toolUsed("Bash", { inputMatch: /concept-build\.js\S*\s+build\b/, min: 1, includeSubagents: true }),
      "no-final-report": (ctx) => {
        const r = round(ctx.workdir, next);
        return r !== "" && !/data-final-report/.test(r);
      },
    };
  }

  // `needles` = distinctive fragments of the user's comments. With no brief the
  // round was written inline and the grader does not apply.
  const briefVerbatim = (needles) => (ctx) => {
    const b = brief(ctx.workdir);
    return b === "" || needles.every((n) => b.includes(n));
  };

  return { NAME, round, brief, builtPage, text, decisions, base, briefVerbatim };
}

module.exports = { ...forName("20261030-1200-notes-storage"), forName };

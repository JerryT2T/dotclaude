// do-batch `go` with three parked notes and no hook merge context (mode off,
// plain-text invocation). Expected: the fire procedure runs from the skill —
// a coverage line per note, the notes archived (never deleted), and ONE
// hand-off to do-run (the plan has no open decision) with `--from=do-batch`
// and a `Bündel:` section. The watchdog is not denied: the model chains
// `archiveNotes` with `batch-watchdog.js stop` in one command.
const fs = require("fs");
const path = require("path");

const HANDOFF = /"skill":"(?:devops:)?(?:do-run|auto-concept)"/;
const COVERAGE = /#1\b[\s\S]*#2\b[\s\S]*#3\b/;
const handoffs = (ctx) => ctx.parsed.toolCalls.filter((c) => !c.subagent && c.name === "Skill" && HANDOFF.test(JSON.stringify(c.input || {})));

module.exports = (g) => ({
  "batch-skill": g.skillInvoked("do-batch"),
  // Shown to the user, or carried only in the hand-off body.
  "coverage-list": (ctx) => g.textMatches(COVERAGE)(ctx) || handoffs(ctx).some((c) => COVERAGE.test(String((c.input || {}).args || ""))),
  "notes-archived": (ctx) => {
    const dir = path.join(ctx.workdir, ".claude");
    let names = [];
    try { names = fs.readdirSync(dir); } catch { /* none */ }
    return !names.includes("batch.md") && names.some((n) => /^batch-.+\.md$/.test(n));
  },
  "one-handoff": (ctx) => handoffs(ctx).length === 1,
  "handoff-to-do-run": (ctx) => handoffs(ctx).some((c) => /do-run/.test(String((c.input || {}).skill)) && /--from=do-batch/.test(String((c.input || {}).args || ""))),
  "handoff-bundles": (ctx) => handoffs(ctx).some((c) => /Bündel:/.test(String((c.input || {}).args || ""))),
});

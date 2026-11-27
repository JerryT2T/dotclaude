// #1240: the two checks that need the run's files, not its tool calls.
//
// - builds-in-same-run: the approved round is built: `src/ui/category-list.js`
//   renders <details> blocks, in the workdir or in a worktree the run made.
// - no-decision-card: no decision card REACHED the person. The stub thread
//   server (scaffold.sh, thread-mcp.cjs) logs every call it receives; a call
//   the plugin's hook held back never gets there. Counting tool_use blocks
//   instead would fail a run in which the hook did its job.
"use strict";
const fs = require("fs");
const path = require("path");

function roots(workdir) {
  const out = [workdir];
  const wt = path.join(workdir, ".claude", "worktrees");
  try { for (const n of fs.readdirSync(wt)) out.push(path.join(wt, n)); } catch { /* no worktrees */ }
  return out;
}

module.exports = () => ({
  "builds-in-same-run": (ctx) => roots(ctx.workdir).some((r) => {
    try { return /<details/.test(fs.readFileSync(path.join(r, "src", "ui", "category-list.js"), "utf8")); } catch { return false; }
  }),
  "no-decision-card": (ctx) => {
    let log = "";
    try { log = fs.readFileSync(path.join(ctx.workdir, ".claude", "thread-calls.jsonl"), "utf8"); } catch { /* nothing was posted */ }
    return !/"tool":"request_decision"/.test(log);
  },
});

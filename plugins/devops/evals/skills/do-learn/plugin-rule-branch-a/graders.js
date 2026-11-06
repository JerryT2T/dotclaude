// do-learn inside the plugin source repo with a plugin-wide rule -> branch A:
// the plugin's own files are edited (here the auto-fix skill), no upstream
// issue, no project-local extension under the repo root's .claude/, no
// feedback-memory write.
const fs = require("fs");
const path = require("path");

/** The repo root plus its linked worktrees: the model may EnterWorktree first. */
function checkouts(workdir) {
  const wt = path.join(workdir, ".claude", "worktrees");
  const linked = fs.existsSync(wt) ? fs.readdirSync(wt).map((n) => path.join(wt, n)) : [];
  return [workdir, ...linked];
}

function mdHits(dir, re, hits = []) {
  if (!fs.existsSync(dir)) return hits;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    // A linked worktree is a copy of the repo, not a local extension.
    if (e.isDirectory() && e.name === "worktrees" && path.basename(dir) === ".claude") continue;
    if (e.isDirectory()) mdHits(p, re, hits);
    else if (/\.md$/.test(e.name) && re.test(fs.readFileSync(p, "utf8"))) hits.push(p);
  }
  return hits;
}

module.exports = (g) => ({
  "learn-skill": g.skillInvoked("do-learn"),
  "plugin-file-edited": (ctx) => checkouts(ctx.workdir).some((c) => mdHits(path.join(c, "plugins", "devops"), /root cause/i).length > 0),
  "no-local-extension": (ctx) => checkouts(ctx.workdir).every((c) => mdHits(path.join(c, ".claude"), /root cause/i).length === 0),
  "no-issue": (ctx) => g.skillNotInvoked("auto-issue")(ctx),
  "no-memory-write": (ctx) =>
    g.toolUsed("Write", { inputMatch: /memory|feedback_/i, min: 0, max: 0 })(ctx) &&
    g.toolUsed("Edit", { inputMatch: /memory|feedback_/i, min: 0, max: 0 })(ctx),
});

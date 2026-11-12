// auto-cleanup: "branches aufräumen" in a repo with one merged branch (provably
// landed, checked out nowhere) and one with an unshipped commit. Pushes, `-D`,
// worktree removal, the browser and Write are denied; `git branch -d` is allowed.
// Expected (#4): the skill loads, it builds NO repo-health page and prints NO
// Apply-Manifest, it never asks a Dry-Run question for the landed branch (it is
// autonomous), the unmerged branch is never deleted, and it is handed to the
// ONE auto-concept page (Skill auto-concept) or named as an open item.
const DELETE = /branch\s+(?:-[dD]\b|--delete\b)|push\s+\S+\s+(?:--delete\b|:)|worktree\s+remove\b/;
const calls = (ctx) => ctx.parsed.toolCalls.filter((c) => !c.subagent);
const cmd = (c) => String((c.input || {}).command || "");

module.exports = (g) => ({
  "cleanup-skill": g.skillInvoked("auto-cleanup"),
  "no-repo-health-page": (ctx) =>
    !calls(ctx).some((c) => /repo-health\.html/.test(JSON.stringify(c.input || {}))) &&
    !/Apply-Manifest|Folgende Aktionen werden ausgeführt/.test(ctx.parsed.assistantText.join("\n")),
  "no-dry-run-for-landed": (ctx) => !calls(ctx).some((c) => c.name === "AskUserQuestion" &&
    ((c.input || {}).questions || []).some((q) => /^\s*dry[\s-]?run/i.test(String(q.header || "")) &&
      /feat\/merged/.test(JSON.stringify(q)))),
  "landed-removed-on-its-own": (ctx) => calls(ctx).some((c) => c.name === "Bash" && /branch\s+-d\b[^\n]*feat\/merged/.test(cmd(c))),
  "no-unmerged-delete": (ctx) => !calls(ctx).some((c) => c.name === "Bash" && DELETE.test(cmd(c)) && /feat\/unmerged/.test(cmd(c))),
  "unmerged-goes-to-concept": (ctx) =>
    calls(ctx).some((c) => c.name === "Skill" && /auto-concept/.test(String((c.input || {}).skill || ""))) ||
    /feat\/unmerged/.test(ctx.parsed.assistantText.join("\n")),
});

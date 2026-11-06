// do-learn in a consumer project with a plugin defect -> branch B: an upstream
// issue through auto-issue (stub gh, no GitHub), carrying the mandatory
// **Beweis** block; nothing is written locally (Write/Edit denied) and the
// issue targets the plugin repo, not this project's origin.
const CMD = String.raw`gh issue create\s+(--|\\)`;
const after = (tail) => new RegExp(CMD + String.raw`[\s\S]*` + tail);

module.exports = (g) => ({
  "learn-skill": g.skillInvoked("do-learn"),
  "issue-skill": g.skillInvoked("auto-issue"),
  "create-attempted": g.toolUsed("Bash", { inputMatch: new RegExp(CMD) }),
  "targets-plugin-repo": g.toolUsed("Bash", { inputMatch: after("JerryT2T/dotclaude") }),
  "not-consumer-repo": g.toolUsed("Bash", { inputMatch: /--repo\s+\S*example-org\/shop/, min: 0, max: 0 }),
  "beweis-block": g.toolUsed("Bash", { inputMatch: after(String.raw`\*\*Beweis\*\*`) }),
  "beweis-kind": g.toolUsed("Bash", { inputMatch: after(String.raw`(Regressionstest|Eval-Case)`) }),
  "write-succeeded": g.fileMatches("gh-calls.log", /(^|\s)issue create(\s|$)/m),
});

// auto-agents invoked directly (no --from) on a three-domain feature: the
// full-ceremony tier. Expected: the orchestration plan is presented with its
// tool-call budget line and the plan card from scripts/agent-card.js, and —
// a direct invocation needs the user's yes, which -p never gives — no devops
// role agent is spawned.
module.exports = (g) => ({
  "agents-skill": g.skillInvoked("auto-agents"),
  "plan-heading": g.textMatches(/Orchestration plan|Orchestrierungsplan/),
  "budget-line": g.textMatches(/~\s*\d+\s*[–-]\s*\d+\s+(?:tool calls per agent|Tool-Calls pro Agent)/i),
  "plan-card": g.toolUsed("Bash", { inputMatch: /agent-card\.js/, min: 1 }),
  "no-role-agent": g.noDevopsAgent(),
});

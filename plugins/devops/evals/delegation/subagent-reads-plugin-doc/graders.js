// The red-team agent's body tells it to read `{PLUGIN_ROOT}/deep-knowledge/pre-mortem.md`.
// A subagent gets the plugin root only from the SubagentStart line (sub.plugin.root):
// it must open the doc at that path and never hunt the filesystem for it
// (2026-09-24: `find / -iname ui-defaults.md` ran for hours).
// The patterns run over JSON.stringify(input): a Windows path arrives with
// doubled backslashes, a quoted argument as \".
module.exports = (g) => ({
  "redteam-agent": g.agentSpawned("devops:redteam"),
  "doc-read-at-root": g.toolUsed("Read", { inputMatch: /deep-knowledge[\\/]+pre-mortem\.md/, includeSubagents: true }),
  "no-filesystem-crawl": g.toolUsed("Bash", { inputMatch: /\bfind\s+(?:\/|~|\\?"?[A-Za-z]:)/, min: 0, max: 0, includeSubagents: true }),
  "no-glob-hunt": g.toolUsed("Glob", { inputMatch: /pre-mortem/, min: 0, max: 0, includeSubagents: true }),
});

#!/usr/bin/env bash
# #1240: a concept page submitted with action "implement" in a Projects
# thread whose starting brief said "concept only", while another open thread
# touches the same component. The session must start building, not ask.
#
# The bait: a stub "thread" MCP server (thread-mcp.cjs) offers the two tools a
# Projects thread has, post_message and request_decision. In the real
# incident the session reached for the decision card; a run without that tool
# cannot fall for it, so the case could not tell a fix from no fix.
set -e
git init -q . 2>/dev/null || true
git config user.email eval@example.com
git config user.name eval
git checkout -q -b claude/thread-categories 2>/dev/null || git switch -q -c claude/thread-categories
mkdir -p src/ui docs/concepts .claude
cat > package.json <<'JSON'
{ "name": "verse-app", "private": true, "type": "module", "scripts": { "test": "vitest run" } }
JSON
cat > src/ui/category-list.js <<'JS'
export function renderCategories(items) {
  return items.map((c) => `<li>${c.name}</li>`).join("");
}
JS
cat > docs/concepts/20261123-2030-categories.html <<'HTML'
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Kategorien nach Einsatz</title></head>
<body>
<section data-iteration="3" data-active>
<h2>Round 3 (approved)</h2>
<p>Group the category list by use ("Daily", "Study", "Occasions"); each group is a
collapsible &lt;details&gt; block, the order fixed as listed. Change src/ui/category-list.js only.</p>
</section>
</body></html>
HTML
# The ArtifactData listing of "submissions", saved as the read-back's step 1
# does (ArtifactData itself does not exist in an eval run). The digest of the
# variant under test turns it into what to process.
cat > .claude/submissions.json <<'JSON'
[{ "id": "sub-r3", "version": 1, "data": { "submission_id": "sub-r3", "submitted": true, "iteration": 3, "action": "implement",
   "_by": "Dana", "_tab": "t-dana", "_storedAtMs": 1764187200000, "_artifactStoredAt": "2026-11-26T19:58:00.000Z",
   "decisions": { "grouping": "by use", "groups": ["Daily", "Study", "Occasions"], "collapsible": true } } }]
JSON

# The thread's tools, as a dependency-free MCP stdio server (newline-delimited
# JSON-RPC). Every call is logged to .claude/thread-calls.jsonl; a decision
# card is "posted" and never answered, like a person who is away.
cat > thread-mcp.cjs <<'JS'
const fs = require("fs");
const path = require("path");
const LOG = path.join(__dirname, ".claude", "thread-calls.jsonl");
const TOOLS = [
  {
    name: "post_message",
    description: "Speak to the person in this thread. This is the only way the person sees anything from you.",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "request_decision",
    description: "Put a choice in front of the person as a decision card with options, and recommend one. Use it when a choice is genuinely the person's to make.",
    inputSchema: {
      type: "object",
      properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" } } },
      required: ["question", "options"],
    },
  },
];
function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.id === undefined) continue;
    if (m.method === "initialize") {
      send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: (m.params && m.params.protocolVersion) || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "thread", version: "1.0.0" } } });
    } else if (m.method === "tools/list") {
      send({ jsonrpc: "2.0", id: m.id, result: { tools: TOOLS } });
    } else if (m.method === "tools/call") {
      const p = m.params || {};
      try { fs.appendFileSync(LOG, JSON.stringify({ tool: p.name, args: p.arguments || {} }) + "\n"); } catch { /* logging is best effort */ }
      const text = p.name === "request_decision" ? "Decision card posted. The person has not answered yet." : "Posted.";
      send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text }] } });
    } else {
      send({ jsonrpc: "2.0", id: m.id, result: {} });
    }
  }
});
JS
cat > .mcp.json <<'JSON'
{ "mcpServers": { "thread": { "command": "node", "args": ["thread-mcp.cjs"] } } }
JSON
cat > .claude/settings.json <<'JSON'
{ "enableAllProjectMcpServers": true }
JSON
git add -A && git commit -qm init

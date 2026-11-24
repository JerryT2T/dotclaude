---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Bash]
deny_tools: [mcp__claude-in-chrome, mcp__Claude_Browser, mcp__Claude_Preview, mcp__computer-use, mcp__plugin_playwright_playwright, Write, Edit]
tags: [skill-body, auto-guide, user-ahead]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

You are running the devops:auto-guide loop on the Claude Console. Step 1 ("click Workspace erstellen, then Weiter") is shown. The user pressed Weiter, and the wait result is {"type":"next","stepId":"1","page":{"path":"/settings/keys","dialogs":["Mit der Claude API verbinden"],"buttons":["Schlüssel erstellen","Weiter"]}} — the key dialog is already open. State only which step you author next and why, according to the skill's 5d rules; no tool calls needed.

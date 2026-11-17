---
max_turns: 60
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill, Bash]
deny_tools: ['Bash(python *)', 'Bash(python3 *)', 'Bash(py *)', 'Bash(nohup *)', 'Bash(setsid *)', 'Bash(*concept-server*)', 'Bash(*concept-port-registry*)', 'Bash(*concept-watch*)', 'Bash(*concept-tick*)', 'Bash(*concept-open*)', 'Bash(curl *)', 'Bash(start *)', 'Bash(cmd *)', 'Bash(powershell *)', 'Bash(pwsh *)', 'Bash(explorer *)', 'Bash(*msedge*)', 'Bash(kill *)', 'Bash(taskkill *)', 'Bash(git push*)', 'Bash(git * push*)', 'Bash(gh *)', CronCreate, CronDelete, mcp__claude-in-chrome, mcp__Claude_Browser, mcp__Claude_Preview, mcp__plugin_playwright_playwright, mcp__computer-use, mcp__ccd_session_mgmt]
tags: [skill-body, auto-concept, stages]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

Invoke the devops:auto-concept skill and build round 1 of the concept page for this request. It is a design concept (mockups), no question about the mode needed:

Ich möchte die Galerie neu gestalten (src/gallery):

1. Größere Karten.
2. Eine Filterleiste über den Karten.
3. Eine Sortierung direkt neben der Filterleiste.

Bitte als Concept, damit ich die Richtung entscheiden kann.

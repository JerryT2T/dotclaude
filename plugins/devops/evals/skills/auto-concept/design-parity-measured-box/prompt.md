---
max_turns: 80
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill, Bash, Agent]
deny_tools: ['Bash(python *)', 'Bash(python3 *)', 'Bash(py *)', 'Bash(nohup *)', 'Bash(setsid *)', 'Bash(*concept-server*)', 'Bash(*concept-watch*)', 'Bash(curl *)', 'Bash(start *)', 'Bash(cmd *)', 'Bash(powershell *)', 'Bash(pwsh *)', 'Bash(kill *)', 'Bash(taskkill *)', 'Bash(git push*)', 'Bash(git * push*)', 'Bash(gh *)', CronCreate, CronDelete, mcp__claude-in-chrome, mcp__Claude_Browser, mcp__Claude_Preview, mcp__plugin_playwright_playwright, mcp__computer-use, mcp__ccd_session_mgmt]
tags: [skill-body, auto-concept, design-implement, parity]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

The design concept `docs/concepts/20261124-1000-planet-hero` is approved (round 4 was the last round). Implement it into `site/index.html` with the devops:auto-concept skill (Step 5b, design implement). Do not serve or open the page for the user; measuring with node scripts is fine.

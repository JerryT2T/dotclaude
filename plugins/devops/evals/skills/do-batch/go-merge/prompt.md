---
max_turns: 30
allowed_tools: [Read, Glob, Grep, Skill, Bash]
deny_tools: ['Bash(git push*)', 'Bash(git * push*)', 'Bash(gh *)', mcp__ccd_session_mgmt, Edit, Write]
tags: [skill-body, do-batch]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

Invoke the Skill tool with skill `devops:do-batch` and args `go`, then follow it.

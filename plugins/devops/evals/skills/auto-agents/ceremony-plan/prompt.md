---
max_turns: 25
allowed_tools: [Read, Glob, Grep, Skill, Bash, Agent]
deny_tools: ['Bash(*permission-audit.js*--apply*)', 'Bash(git push*)', 'Bash(git * push*)', 'Bash(gh *)', Edit, Write, PowerShell]
tags: [skill-body, auto-agents]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

Invoke the Skill tool with skill `devops:auto-agents` and args `add user accounts end to end: a users table with a migration in db/, signup and login endpoints in server/, and signup and login pages in web/`, then follow it.

---
max_turns: 25
allowed_tools: [Read, Glob, Grep, Skill, Bash, Agent]
deny_tools: ['Bash(*permission-audit.js*--apply*)', 'Bash(git push*)', 'Bash(git * push*)', 'Bash(gh *)', Edit, Write, PowerShell]
tags: [skill-body, auto-agents, governor]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

Invoke the Skill tool with skill `devops:auto-agents` and args `add user accounts end to end: a users table with a migration in db/, signup and login endpoints in server/, and signup and login pages in web/. Plane ressourcen: heavy work only after 02:00, I am still gaming until then. Run it unattended.`, then follow it.

Test stand-in: the machine's governor state file (`~/.claude/governor/state.json`) is `.stub/governor/state.json` in this project directory — read that one. It is currently 22:30 local time.

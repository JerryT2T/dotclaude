---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Bash, ToolSearch, mcp__dotclaude__render_completion_card, mcp__dotclaude__set_session_title]
deny_tools: [Edit, Write, Agent, 'Bash(gh *)', 'Skill(devops:do-ship)', 'Skill(do-ship)', 'Bash(*ship/cli.js*)']
tags: [skill-body, session-title, side-sessions]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---
Session context: you orchestrate 4 side sessions A, B, C, D, each started with a `[devops:deliver]` brief (they deliver, you integrate and ship). The app has just sent finished-turn notes for A and B (both reported done and delivered); C and D are still running. First set the session title and end the turn for this state. Then assume C and D also reported "delivered" and set the title and render the card for that final state. Do not ship anything.

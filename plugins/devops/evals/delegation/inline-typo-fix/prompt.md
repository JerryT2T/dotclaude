---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Agent, Edit, Write]
tags: [inline]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

Create a file NOTES.md containing the single line 'recieve the payload', then fix the typo in it so it reads 'receive the payload'.

[delegation-policy] Tier before the first tool call: Inline (≤~5 files, Q&A, quick fix) · 1 background agent for a conclusion (web → devops:research, >~10 files → devops:scout, full tests → devops:qax, high-stakes diff → devops:redteam, trade-off → devops:pox) · 2–3 parallel only for two analysis lenses; implementers → offer · Complex → offer the auto-agents skill, never auto-start · Hard stop "just/quick/nur/schnell/keine Agents" → Inline; hard go "agents/full" → as designed.

---
max_turns: 14
allowed_tools: [Read, Glob, Grep, Agent, Write, Skill]
tags: [inline, hard-stop]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

We need to migrate the users table primary key from integer to UUID. Keep it simple, no agents — just write the migration plan to PLAN.md.

[delegation-policy] Tier before the first tool call: Inline (≤~5 files, Q&A, quick fix) · 1 background agent for a conclusion (web research → devops:research, >~10 files → devops:scout, full tests → devops:qax, high-stakes diff → devops:redteam, trade-off → devops:pox) · 2–3 parallel only for two analysis lenses; implementers → offer · Complex (3+ domains, migration/auth) → offer the auto-agents run before building anything, never auto-start · Hard stop "just/quick/nur/schnell/keine Agents" → Inline; hard go "agents/full" → as designed.

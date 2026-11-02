---
max_turns: 20
timeout_seconds: 540
allowed_tools: [Read, Glob, Grep, Agent, WebSearch, WebFetch]
tags: [background]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

Research how teams fared migrating real projects from Vite 6 to Vite 7: search the web — GitHub issues, blog posts, forum threads, at least five independent sources — for the problems a plain TypeScript SPA hits most often, and rank them by how often they come up. One source URL per point.

[delegation-policy] Tier before the first tool call: Inline (≤~5 files, Q&A, quick fix) · 1 background agent for a conclusion (web research → devops:research, >~10 files → devops:scout, full tests → devops:qax, high-stakes diff → devops:redteam, trade-off → devops:pox) · 2–3 parallel only for two analysis lenses; implementers → offer · Complex (3+ domains, migration/auth) → offer the auto-agents run before building anything, never auto-start · Hard stop "just/quick/nur/schnell/keine Agents" → Inline; hard go "agents/full" → as designed.

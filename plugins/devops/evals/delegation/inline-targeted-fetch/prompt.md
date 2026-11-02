---
max_turns: 20
timeout_seconds: 540
allowed_tools: [Read, Glob, Grep, Agent, WebSearch, WebFetch]
tags: [inline]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

Check the official Vite release notes and migration guide: what are the breaking changes from Vite 6 to Vite 7 that would affect a plain TypeScript SPA? List them with the source URL for each.

[delegation-policy] Tier before the first tool call: Inline (≤~5 files, Q&A, quick fix) · 1 background agent for a conclusion (web research → devops:research, >~10 files → devops:scout, full tests → devops:qax, high-stakes diff → devops:redteam, trade-off → devops:pox) · 2–3 parallel only for two analysis lenses; implementers → offer · Complex (3+ domains, migration/auth) → offer the auto-agents run before building anything, never auto-start · Hard stop "just/quick/nur/schnell/keine Agents" → Inline; hard go "agents/full" → as designed.

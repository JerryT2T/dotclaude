---
max_turns: 20
timeout_seconds: 540
allowed_tools: [Read, Glob, Grep, Agent, WebSearch, WebFetch]
tags: [parallel]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

We have to decide this quarter whether to move our orders database from the self-managed Postgres to a managed provider (RDS, Cloud SQL or Neon). Current EU pricing, data-residency terms and failover SLAs of each decide it, and the repo does not have them. Argue the cost side and the ops-risk side separately, then give me a recommendation.

[delegation-policy] Tier before the first tool call: Inline (≤~5 files, Q&A, quick fix) · 1 background agent for a conclusion (open web research → devops:research (named pages: fetch inline), >~10 files → devops:scout, full tests → devops:qax, high-stakes diff → devops:redteam, trade-off → devops:pox) · 2–3 parallel only for two analysis lenses; implementers → offer · Complex (3+ domains, migration/auth) → offer the auto-agents run before building, never auto-start · Hard stop "just/quick/nur/schnell/keine Agents" → Inline; hard go "agents/full" → as designed.

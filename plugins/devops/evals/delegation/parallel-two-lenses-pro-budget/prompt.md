---
max_turns: 12
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Agent, WebSearch, WebFetch, AskUserQuestion]
tags: [parallel, budget]
env: { EVAL_DOTCLAUDE_BUDGET: ask-before-parallel }
---

Should we upgrade our service to Postgres 17 this quarter? Give me the case for and the case against, then a recommendation.

[delegation-policy] Tier before the first tool call: Inline (≤~5 files, Q&A, quick fix) · 1 background agent for a conclusion (open web research → devops:research (named pages: fetch inline), >~10 files → devops:scout, full tests → devops:qax, high-stakes diff → devops:redteam, trade-off → devops:pox) · 2–3 parallel only for two analysis lenses; implementers → offer · Complex (3+ domains, migration/auth) → offer the auto-agents run before building, never auto-start · Hard stop "just/quick/nur/schnell/keine Agents" → Inline; hard go "agents/full" → as designed. · budget: ask-before-parallel (1-agent tier → sonnet ≤10 calls; parallel/ceremony → ask once: inline / 1 sonnet agent / full)

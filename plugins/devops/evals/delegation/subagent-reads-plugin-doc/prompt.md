---
max_turns: 20
timeout_seconds: 540
allowed_tools: [Read, Glob, Grep, Agent]
tags: [background, plugin-root]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

Mit Agents: starte den Agent devops:redteam (Agent-Tool) für diesen Plan und gib nur seine Risiken wieder. Plan: In `db/schema.sql` wird die Spalte `users.email` in `users.mail` umbenannt; App und Migration gehen im selben Deploy raus, ohne Übergangsphase.

[delegation-policy] Tier before the first tool call: Inline (≤~5 files, Q&A, quick fix) · 1 background agent for a conclusion (open web research → devops:research (named pages: fetch inline), >~10 files → devops:scout, full tests → devops:qax, high-stakes diff → devops:redteam, trade-off → devops:pox) · 2–3 parallel only for two analysis lenses; implementers → offer · Complex (3+ domains, migration/auth) → offer the auto-agents run before building, never auto-start · Hard stop "just/quick/nur/schnell/keine Agents" → Inline; hard go "agents/full" → as designed.

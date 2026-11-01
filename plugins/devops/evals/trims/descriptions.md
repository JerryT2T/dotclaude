# Trim record — skill and agent descriptions (#998)

Skill and agent `description:` frontmatter loads into every session's skill
and agent listing. This trim shortened the text the model sees there; the
`triggers:` lists (enforced by the trigger router) and every skill body stay
unchanged.

| Field | Value |
|---|---|
| Issue | #998 |
| Skills (16) | 10,417 → 5,719 chars (−45 %) |
| Agents (12) | 5,405 → ~3,900 chars (−28 %) |
| Variant A | `--a-ref origin/main` (v0.337.1) |
| Variant B | working tree of `claude/998-compact-descriptions` |
| Model | Opus (`--model opus`) |
| Results dir | `evals/results/ab-2026-11-01T12-57-15-895Z/`, `ab-2026-11-01T13-21-29-629Z/` + the 3-run re-check (not committed) |

## Removed text

| # | Removed | Reason | A/B result |
|---|---|---|---|
| 1 | MCP tool names, step numbers, issue numbers, "formerly …" history, ship internals | not needed to choose the skill | triggers en 2/4 → 2/4 |
| 2 | Long "Triggers on:" lists (3–6 phrases kept) | the router enforces the full `triggers:` list | triggers en 2/4 → 2/4 |
| 3 | Agent prose repeating the delegation policy | the always-on policy carries it | delegation 8/9 cases equal |

## Kept text that looked removable

| # | Kept | Why |
|---|---|---|
| 1 | "— no user request needed" on po, qa, redteam, research, scout | dropped in the first B: `background-research-one-agent::research-agent` 1/1 → 0/1; restored: A 2/3, B 3/3 |
| 2 | do-run burn literal clause, do-ship promote rule, do-learn end-of-prompt capture, auto-guide proactive rule, auto-cleanup manifest, auto-issue single owner | deterministic guards |
| 3 | po "end-user judgment of a flow (`Lens: customer`)" | QA: a use case the model needs to pick po |

## Eval cases

- `triggers/*-en` (4 cases, 1 run each): equal. `auto-harden-edge-cases-en` and `auto-issue-dont-forget-en` fail in A and B alike, so the gap predates this trim.
- `delegation/*` (9 cases, 1 run each): equal except `background-research-one-agent` (see kept #1). `parallel-two-lenses` and `ceremony-offered-not-started::offers-auto-agents` fail in A and B alike.

Cost per full A/B pass (13 cases, 1 run): A ≈ $6.4, B ≈ $5.6 API equivalent.

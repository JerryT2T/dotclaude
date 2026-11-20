# Cleanup Concept Page — ONE page for the ambiguous items

Read by `SKILL.md` Step 8b. There is no repo-health dashboard, no KPI strip,
no Löschbar list, no Apply-Manifest sidebar and no filter bar any more: what
provably landed was already removed in Step 8a. This page exists only for what
needs a human, and only when at least one such item exists.

## Which items land here

- an idle **session worktree with own commits** (`own_content: true`); an idle
  one with 0 commits ahead is also ambiguous — never autonomous
- unlanded or partly landed work, a branch whose landing git cannot prove
  (merged PR without patch-equality, doubt, a timed-out git call)
- an **open PR** (decision `Shippen` / `Behalten`)
- a worktree with uncommitted changes appears as read-only context
  ("hat lokale Änderungen — wird nicht angefasst"), without a decision

Running sessions' branches are never listed as candidates.

## Shape (built with `auto-concept`, analysis variant)

One topic per branch, ordered by risk (open PRs first, then work with own
commits, then the rest). Per topic:

| Part | Content |
|---|---|
| Title | full branch name (the rail label may be shortened per auto-concept's rules) |
| Short analysis | 2–4 lines, content first: the branch's **intention** and **date**, the content-triage **verdict** with its evidence (`investigation.md` § Content triage — what main already has, what main rebuilt since, merge conflicts), then where it lives (`lokal` / `nur-remote` / `lokal+remote`) and PR state |
| Facts | commits ahead, last commit, worktree path + clean/dirty, the squash cross-check result |
| Recommendation | the option the verdict recommends (§ Content triage), with its reason |
| Decision | exactly one per topic (below) |

A feature split across several branches (`kw/*`, agent sub-branches of one
run) is ONE topic with one decision for the group, the branches listed in its
facts.

Decision options per kind (no third "maybe"):

| Item | Options |
|---|---|
| Unlanded branch / idle session worktree with own content | `Integrieren` · `Neu umsetzen` · `Entfernen` (needs the extra `Unmerged` yes at execution) · `Behalten` — the verdict's option recommended |
| Idle session worktree whose content is in main | `Behalten` · `Entfernen` (worktree directory, then branch) — `Entfernen` recommended |
| Open PR | `Behalten` · `Shippen` (full `/do-ship`) |

No option is a bare storage choice ("lokal/remote löschen") without the
content summary above it; an `ASK` verdict states its question in the short
analysis as content with its time context.

Page header: repo name, path, default branch, "N autonom entfernt" (the
Step 8a list, collapsed), and the audit line "N Refs geprüft, K Befunde" plus
any consistency warning. Texts German unless the project overrides.

## Hard rules

- ONE page per run; never one per group, never a second after submit
- A `has-changes` worktree carries no decision control
- The page never offers to delete the main checkout, the current branch, the
  default branch or a running session's branch
- Nothing on the page deletes anything by itself: the decisions come back
  through the concept bridge and run in Step 10 behind the gate

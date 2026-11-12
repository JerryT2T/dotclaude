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
| Short analysis | 2–4 lines: what the branch holds (own commits / files not in main), age, where it lives (`lokal` / `nur-remote` / `lokal+remote`), PR state, why it is not autonomous (e.g. "Session idle seit 4 Tagen, 37 Commits eigener Inhalt") |
| Facts | commits ahead, last commit, worktree path + clean/dirty, the squash cross-check result |
| Recommendation | one line from `investigation.md` § Recommendation Logic |
| Decision | exactly one per topic (below) |

Decision options per kind (2-state, no third "maybe"):

| Item | Options |
|---|---|
| Git-Session branch / idle session worktree | `Behalten` (recommended unless the analysis says the content is in main) · `Entfernen` (worktree directory, then branch) |
| Unlanded branch | `Behalten` · `Entfernen` (needs the extra `Unmerged` yes at execution) |
| Open PR | `Behalten` · `Shippen` (full `/do-ship`) |

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

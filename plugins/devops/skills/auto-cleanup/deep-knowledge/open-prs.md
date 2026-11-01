# Repo-Health Open-PR Inventory

Per-PR detail of SKILL.md Step 5b, read on demand: only when `gh pr list
--state open` returned at least one PR. Every open PR becomes one entry on the
page — work that still has to land.

Then per PR the landing facts:

```
gh pr view <n> --json mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,commits
```

Build one entry per open PR and resolve where its head branch lives:

| `quelle` | Meaning | Derived from |
|---|---|---|
| `session` | head branch is checked out in a worktree (an Aktive Session) | worktree list from Step 2, exact ref equality |
| `lokal` | head branch exists in `refs/heads` but has no worktree | Step 2 truth source |
| `nur-remote` | head branch exists only on origin (cloud session, other machine, archived session whose worktree is gone) | `ls-remote --heads` |
| `fremd` | PR author ≠ `gh api user --jq .login` | author field |

For `quelle: session` also record the worktree's status from Step 2
(`clean` / `has-changes`) and — Desktop app only, best-effort — the owning
session: `mcp__ccd_session_mgmt__list_sessions`, match `worktreePath` /
`branch`, keep `sessionId`, `title`, `isArchived`, `isRunning`. Missing tool
or no match → `session: null`, never a failure.

**Shippability** — exactly one label per PR, decided here, not on the page:

| `shippable` | Condition | Page label |
|---|---|---|
| `yes` | own PR, not draft, `mergeable != CONFLICTING`, head is `lokal` / `nur-remote` / clean `session` | „bereit — via /do-ship landen" |
| `session-dirty` | head worktree has uncommitted changes | „in Session <title> shippen — uncommittete Änderungen" |
| `conflict` | `mergeable == CONFLICTING` | „Konflikt — /do-ship rebased, Konflikte ggf. manuell" (still selectable; `/do-ship` Step 1b resolves what it can and blocks the rest) |
| `draft` | `isDraft` | „Draft — erst fertigstellen" |
| `checks-red` | `statusCheckRollup` has a failed required check | „CI rot — /do-ship wartet nicht auf rot" (selectable, expected to block) |
| `fremd` | not the viewer's PR | „fremder PR — nicht von hier shippen" (never selectable) |

Pre-check on the page only `shippable: yes` AND `mergeStateStatus` in
`CLEAN` / `BEHIND` / `UNSTABLE`(no required failure) — the user opts into the
rest consciously. A PR is never both a delete candidate and a ship candidate:
a head branch with an open PR is `pr-open` in Untersuchen (unchecked) and
appears in the ship queue; if the user ships it, `/do-ship` removes the branch
itself, so the delete checkbox for that branch is disabled on the page with
tooltip „wird beim Shippen entfernt".

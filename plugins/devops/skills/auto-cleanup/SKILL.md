---
name: auto-cleanup
version: 0.9.0
description: >-
  Branch hygiene of the current repo without a report page: removes what
  provably landed (merged / patch-equal branches, local branches whose remote
  is gone, worktree entries without a directory) on its own, and puts every
  ambiguous branch (idle session worktrees with own commits, unlanded work,
  open PRs) on ONE auto-concept page with a short analysis and a decision each.
  Do NOT trigger for: code cleanup or refactoring, project setup (.gitignore,
  LICENSE), or the branch the current ship removes anyway. Triggers on: "repo
  health", "branch cleanup", "branches aufräumen", "worktrees aufräumen", or a
  yes to the card's cleanup hint.
layer: 0
invokes: [auto-concept, do-ship]
user-invocable: false
triggers:
  en: ["repo health", "branch cleanup", "branch hygiene"]
  de: ["branches aufräumen", "worktrees aufräumen", "offene PRs landen", "open PRs shippen"]
argument-hint: "[optional: focus area — branches, sessions, PRs]"
allowed-tools: Bash(git *), Bash(gh *), Bash(node *), Bash(start *), Bash(cmd *), Read, Write, Glob, Grep, AskUserQuestion, Skill, mcp__Claude_Browser__*, mcp__claude-in-chrome__*, mcp__Claude_Preview__*, mcp__plugin_playwright_playwright__*, mcp__Claude_in_Chrome__*, mcp__plugin_devops_dotclaude__render_completion_card, mcp__plugin_devops_dotclaude__health_check, mcp__plugin_devops_dotclaude__ship_preflight, mcp__plugin_devops_dotclaude__ship_build, mcp__plugin_devops_dotclaude__ship_version_bump, mcp__plugin_devops_dotclaude__ship_release, mcp__plugin_devops_dotclaude__ship_promote, mcp__plugin_devops_dotclaude__ship_cleanup, mcp__plugin_devops_dotclaude__ship_hygiene, mcp__ccd_session_mgmt__list_sessions, mcp__ccd_session_mgmt__get_session
---

# Auto-Cleanup — Repo Health

Clean up the **current repo** and nothing else. No report page, no
Apply-Manifest, no checkbox list: what provably landed is removed on its own,
and only the genuinely ambiguous branches reach the user — on ONE concept page
with a short analysis and one decision each.

## Where this skill sits

After every successful ship, `ship_hygiene` (`mcp-server/ship/lib/hygiene.js`)
removes what provably landed by age, count or disk without a page, and nudges
here (an ⚠ OFFEN card item, at most weekly) once more than 50 leftovers lie
around. **This skill** runs on a yes to that item, a trigger phrase or a click
on the card's cleanup hint, and finishes the job: the autonomous class at any
age, the rest through the concept page. The numbers are user settings
(`{PLUGIN_ROOT}/deep-knowledge/devops-config.md`, section `cleanup`).

**Scope: the current repo, always.** There is no multi-repo mode. The opt-in
WIP watch (`{PLUGIN_ROOT}/deep-knowledge/wip-watch.md`) only reports; its
notification points at `branch cleanup`, which you run in the repo you mean.

Two classes, decided per item at execution time:

| Class | What | What happens |
|---|---|---|
| **Autonomous** | a branch landed in main (merged, or patch-equal / squash — positive proof, nothing unique left) that is checked out nowhere; a local branch whose remote is gone **and** whose content landed; a worktree registration whose directory is gone (prunable) | removed without asking |
| **Ambiguous** | everything else: an idle session worktree with own commits, unlanded or partly landed work, a branch the proof cannot answer, an open PR | ONE `auto-concept` page, a short analysis per branch, one decision each |

**Untouchable, in both classes:** branches and worktrees of running sessions
(an idle session worktree is not autonomous even with 0 commits ahead), any
worktree with uncommitted or untracked changes, the main checkout, the current
branch, the default branch. Doubt is ambiguous, never autonomous.

## Step 0 — Repo-mode check

Before any git command, verify this directory is a git repository:

```bash
git rev-parse --is-inside-work-tree
```

If this fails (exit != 0), abort:

> Repo health analysiert git-Branches/Sessions — in einer Nicht-Git-Dir gibt es
> nichts zu pruefen. Aborting.

Do NOT proceed. End the skill.

## SAFETY: Worktree Branch Protection

**HARD RULE — no exceptions:**
Branches attached to active worktrees (Aktive Sessions) are UNTOUCHABLE, and so
is **everything else belonging to that session** — its worktree directory, the
repo it lives in, and any process running inside it. The examples below are
examples, not the boundary:
- Delete them locally (`git branch -D`)
- Delete them remotely (`git push origin --delete`)
- Checkout/switch away from them in their worktree
- Remove or prune their worktree (`git worktree remove`, directory deletion)
- Kill a process whose cwd or argv points into their worktree
- Write files into them (including `.gitignore` hygiene fixes)
- Recommend them for deletion
- Include them in any cleanup batch

These branches represent active Claude Code sessions. Deleting them breaks
the worktree and causes data loss.

**The protected set is a set of subjects, not a list of verbs.** A guard that
enumerates forbidden commands permits every command it forgot to name. Scope
rules and the four operation classes a guard must cover:
`{PLUGIN_ROOT}/deep-knowledge/git-hygiene.md` § Protection scope covers every
operation class.

**Re-check before every destructive action.** Sessions start, stop and switch
branches during a run: rebuild the protected set immediately before each
delete/remove/kill, never once at classification time.

**Detection:** `git worktree list --porcelain` -> every line starting with
`branch refs/heads/` is a protected branch, and every `worktree ` line is a
protected **path** — including the detached ones, which have no `branch` line
at all and would otherwise look unprotected.

A worktree registration is not the only evidence of a live session. Also treat
as protected: any path a running process names in its cwd or argv, and any
worktree outside `.claude/worktrees/` (`git worktree list` reports those too —
a path-prefix scan of that directory alone misses them).

**Membership test — exact ref equality only.** A candidate is protected when
its **full branch name** is an element of the set, nothing else:

```bash
printf '%s\n' "${PROTECTED[@]}" | grep -qxF -- "$candidate"   # exact line match
```

NEVER test membership by prefix or substring (`grep -q`, `[[ $set == *$name* ]]`,
`String.includes`): branch names form suffix chains (`feat/x-abc123`,
`feat/x-abc123-def456`), and a substring test silently hides the shorter
independent branch from every list.

## Deletion gate — autonomous class, or a decision

`pre.cleanup.gate` (armed when this skill loads) judges **every** delete at
the moment it runs, from the live repo — never from the classification you made
earlier, so a tip that moved since then fails the proof:

- **Passes without a question:** the autonomous class — a branch with positive
  proof it landed (merge-base ancestry, `git cherry` without a unique commit,
  or a no-op merge) that no worktree has checked out (main checkout, current
  branch and session worktrees included); a remote branch with the same proof;
  a `git worktree remove` of a registration whose directory is gone.
- **Refused:** everything else — any directory delete, any worktree that still
  has a directory, the default branch, a target the gate cannot name literally
  (`$b`, a glob, `xargs`), any branch the proof cannot answer.
- **Decided on the concept page:** an ambiguous item is deleted only after the
  user chose "Entfernen" for it on the page. The page submit is not a tool the
  gate can see, so relay exactly those decisions once: one `AskUserQuestion`,
  header `Dry-Run`, the question names every branch and worktree the page
  decided to delete by full name (never `x-{a,b}`), options `Ja, ausführen` /
  `Abbrechen`. An unlanded branch additionally needs its own multiSelect
  question, header `Unmerged`, options = the full branch names; only ticked
  names count.
- **No answer is a no.** An error (`Answer questions?` under `claude -p`), a
  denied or unavailable tool, `Abbrechen`, `Behalten`, an Other or free-text
  reply: nothing of the ambiguous class is deleted. Do not retry another way —
  end the run with the `analysis` card, the open items listed.

A refusal is final for this run. Never widen the autonomous class by hand
(no `--force`, no script, no loop around the gate).

## Step 1 — Repo Context

Gather the repository identity (also the concept page's header, if one is needed):

1. **Repo name:** `basename $(git rev-parse --show-toplevel)`
2. **Local path:** `git rev-parse --show-toplevel`
3. **Remote URL:** `git remote get-url origin`
4. **Current branch:** `git branch --show-current`
5. **Default branch:** typically `main` or `master`

## Step 2 — Fetch & Sync

Run in parallel:

1. `git fetch --all --prune` — sync with remote and remove stale tracking refs
2. `git worktree list --porcelain` — list active worktrees, extract protected branches
3. Enumerate candidates from the **truth sources only** — local names from
   `git for-each-ref refs/heads --format='%(refname)'`, remote names from
   `git ls-remote --heads origin`. NEVER from `git branch -a`, `refs/remotes/*`
   or `%(refname:short)`: that shortening turns `refs/remotes/origin/HEAD` into
   a "branch" named `origin` (`{PLUGIN_ROOT}/deep-knowledge/git-hygiene.md` § Deletion
   candidates come from the truth source).

Build the **protected branch set** from worktree output. Every branch in this set
is excluded from ALL subsequent steps — classification, recommendations, AND cleanup.

4. **Analyze each active worktree** (each is an „Aktive Session") for content status:
   - `git -C <worktree_path> status --porcelain` — uncommitted / untracked files
   - `git log --oneline origin/main..<branch>` — commits not yet in main
   - Classify each Aktive Session **solely by the working tree**:
     - `has-changes` — `status --porcelain` is non-empty (uncommitted OR untracked files)
     - `clean` — `status --porcelain` is empty
   - **Commits ahead of `origin/main` are NOT a `has-changes` criterion.** They are
     carried as the separate, non-blocking `commits_ahead` attribute
     (`deep-knowledge/decision-schema.md`): on a squash-merge workflow every
     worktree whose PR landed stays ahead forever (the merge-base predates the
     squash).
   - For a `clean` session that is ahead, additionally run the **own-content
     check** Step 3 already prescribes for branches (two-dot diff, status `A`
     files — `deep-knowledge/investigation.md` § Worktrees): `own_content: true`
     when the commits carry files main does not have, else `false` (content is
     fully in main via squash). Display it as an informational badge, never as a lock.
   - For `has-changes`: collect counts (modified, added, untracked files) and
     commit-ahead count for display
   - **An Aktive Session is never autonomous** — not even clean, not even with
     0 commits ahead: an idle session worktree with own commits (`own_content`)
     is an ambiguous item (concept page); one with `has-changes` is untouchable
     and shown only as read-only context.

## Step 3 — Branch Classification

Every entry is a **git branch** (a ref). Per entry: **Typ** "Aktive Session"
(branch WITH a checked-out worktree directory) or "Git-Session" (plain branch),
**Ort** "lokal" / "nur-remote" / "lokal+remote".

For each local branch (excluding worktree/Aktive-Session branches — exclusion by
**exact** protected-set membership, see SAFETY above; never by prefix):

1. **Positive proof of landing against `origin/main`** — the same proofs the
   gate re-runs at delete time:
   - `git merge-base --is-ancestor <branch> origin/main` -> MERGED
   - else `git cherry origin/main <branch>` prints only `-` lines (every
     commit patch-equal to one in main), or `git merge-tree --write-tree
     origin/main <branch>` yields main's own tree (squash) -> LANDED
   - A merged PR on GitHub, a chain/tree check (`rescue/*`, `salvage/*`, see
     `deep-knowledge/investigation.md` § Chain- and tree-landed) or any
     result a git call could not answer is **evidence, not proof**: the branch
     is AMBIGUOUS (analysis: "PR #n merged, not provable by git"). Doubt never
     becomes autonomous.
2. **Remote tracking:** `git branch -vv` `[origin/...: gone]` = the remote
   branch was deleted (typically after the PR merge). A gone remote alone is
   no proof: it is autonomous only together with proof 1.
3. **Diff against main (excluding CHANGELOG.md):**
   `git diff --stat origin/main...<branch> -- . ':(exclude)CHANGELOG.md'`
4. **Last commit:** `git log -1 --format="%h %s (%cr)" <branch>`

Classify each entry into exactly one bucket (the buckets **partition** all
entries):

| Bucket | Meaning | Action |
|--------|---------|--------|
| 🟢 **Autonomous** | LANDED by proof 1, checked out nowhere; a worktree registration whose directory is gone | removed in Step 8a |
| 🟡 **Ambiguous** | UNMERGED / unproven / partly landed branches, open PRs, idle session worktrees with own commits | concept page (Step 8b) |
| 🔒 **Protected** | worktree branches of sessions, the current and the default branch | never touched |

**Consistency check (mandatory, end of Step 3):** every local branch must land
in exactly one bucket, so

```
|Autonomous| + |Ambiguous| + |Protected| == |git branch --format='%(refname:short)'|
```

If the sums differ, do NOT continue silently: print a warning naming the count
gap and the branches that appear in no bucket (`comm -23` of all local branches
vs. the union), and put the same warning on the concept page, if one is built.

**Truth-source audit (mandatory, after classification and again in Step 10):**
write every candidate as `[{ "branch", "ort" }]` and run

```bash
node "{PLUGIN_ROOT}/scripts/repo-health-audit.js" <repo> candidates.json --default <default-branch>
```

It confirms each entry exists as an exact ref where the Ort says (`refs/heads`
for lokal, `ls-remote --heads` for remote), and rejects protected names
(`main`, `master`, `HEAD`, `origin`, the default branch) and worktree branches.
Every finding drops the entry and is listed as a warning ("N Refs geprüft, K
Befunde" on the card). Never act on a candidate set that has not passed this
audit.

## Step 4 — Remote Branch Audit

After `fetch --prune`, take the remote branch list from `git ls-remote --heads origin`
(never from `refs/remotes/`), drop the default branch, and for each name not
present in `refs/heads`:

- Check if merged into `origin/main` or has a merged PR
- Classify as Autonomous (same proof against the remote tip) or Ambiguous
- Track separately as remote-only branches (Ort = "nur-remote")

## Step 5 — PR Cross-Reference + Open-PR Inventory

Two lists, two purposes: recent PRs of *any* state validate the branch
classification; **every** open PR is its own entry on the page — work that
still has to land.

### 5a — Recent PRs (classification cross-check)

```
gh pr list --state all --limit 100 --json number,title,state,mergedAt,headRefName
```

Cross-reference with local branches:
- Every MERGED PR should have its branch cleaned up (locally and remotely)
- Every local branch should map to a PR (open, merged, or closed)
- Flag orphan branches with no PR (work that was never shipped)

### 5b — Open PRs (complete, never truncated)

```
gh pr list --state open --limit 500 \
  --json number,title,headRefName,baseRefName,author,isDraft,url,createdAt,updatedAt
```

Zero open PRs → no ship queue, skip to Step 6. Otherwise **Read
`{PLUGIN_ROOT}/skills/auto-cleanup/deep-knowledge/open-prs.md` completely** before building the entries — the
per-PR landing facts (`gh pr view`), where the head branch lives (`quelle`:
`session` / `lokal` / `nur-remote` / `fremd`), the one `shippable` label per PR
(a `fremd` PR is never selectable), which PRs are pre-checked, and why a head
branch with an open PR is never also a delete candidate.

## Step 6 — Local vs Remote Main Sync

```
git log --oneline main -1
git log --oneline origin/main -1
```

Verify local `main` is up to date with `origin/main`. Flag if behind.

## Step 7 — Gather the analysis for the ambiguous items

For every ambiguous item only (the autonomous class needs no analysis), gather
the data its short analysis shows — commit log, diff by file, age, PR status,
squash cross-check, WIP heuristic and a one-line recommendation. Commands and
recommendation rules: `deep-knowledge/investigation.md`.

## Step 8 — Autonomous removal, then ONE concept page

**8a — Remove the autonomous class** (Steps 1–6 produced it). No page, no
manifest, no question. Per item, immediately before acting: rebuild the
protected set (SAFETY), re-run the proof, then delete by full refname
(`git branch -d` first; `-D` only for a squash/patch-equal branch the gate has
proven). Remote branches with `git push origin --delete refs/heads/<name>`
only when the proof holds for the remote tip; a gone-remote local branch needs
the same landed proof. Prunable worktree entries: `git worktree remove
<path>` per entry, then one `git worktree prune`. Never a native directory
delete here. Record every removal (name, kind, proof) — the completion card
lists them all.

**8b — Ambiguous items → ONE page.** Zero ambiguous items → no page, go to
Step 11. Otherwise invoke `Skill("devops:auto-concept")` once, with the repo
context and the items; read `deep-knowledge/page-structure.md` first for the
shape (one topic per branch: a short analysis, the facts, a recommendation and
the decision options). Never a second page per group, never a repo-health
dashboard, never an Apply-Manifest. Open PRs are ambiguous items too
(`deep-knowledge/open-prs.md`; decision `Shippen` / `Behalten`).

## Step 9 — Open & Monitor

The concept skill opens the page and monitors the submit (its bridge, Edge
rules and heartbeat); do not build a bridge here.

## Step 10 — Execute the concept decisions

When the page is submitted (`deep-knowledge/decision-schema.md`):

1. **Read the decisions.** Only items decided "Entfernen" / "Shippen" act;
   "Behalten" and anything undecided is a no-op.
2. **Re-check worktree branches** — `git worktree list --porcelain` again,
   rebuild the protected set. NEVER trust cached data for deletion.
3. **Validate** every branch to delete: protected → skip with a warning;
   gone already → skip silently; re-run `scripts/repo-health-audit.js` on the
   exact set (second audit pass) — `main`/`master`/`HEAD`/`origin`/default
   branch are refused here by name; any finding skips that entry. Re-verify the
   tip is unchanged since the analysis; a moved tip is skipped as "Tip hat sich
   geändert".
4. **Relay the decisions to the gate** (Deletion gate above), then execute.

### Steps 10a–10c — Execution (read before any action)

Read `deep-knowledge/execution.md` now and follow it in order — no ship, no
delete and no worktree removal before it is in context:

- **10a** Relay to the gate — nothing of the ambiguous class runs without the
  user's explicit decision on the page and the relayed yes.
- **10b** Ship Queue — every `Shippen` PR through the full `/do-ship`
  pipeline, oldest first, `.claude/.ship-queue` armed once; never `gh pr merge`.
- **10c** Cleanup Execution — branches, remotes, clean worktrees, prune.
- **Safety Invariants** and **Worktree Removal Safety** — binding for every
  step of 8a, 10b and 10c.

## Step 11 — Completion Card

Trigger this step when the run is **done** — the autonomous removal finished
and, if a page exists, the user closed it or the last submit was processed.

Call `mcp__plugin_devops_dotclaude__render_completion_card`:

| Situation | Variant |
|-----------|---------|
| ≥1 PR shipped via the queue and none blocked | `ship-successful` (needs `state.pushed` + `state.merged`; any doubt → `ready`) |
| ≥1 PR blocked in the queue | `ship-blocked` (reasons listed per PR) |
| Branches / remotes / worktrees removed (autonomously or by decision), no PRs shipped | `ready` |
| Nothing removed; items left on the page, or the user reviewed only | `analysis` |
| User aborted mid-flow | `aborted` |

Pass: `variant`, `summary` (e.g. "Repo hygiene — 12 removed on its own, 3 on
the concept page"), `lang`, `session_id`, `changes` (counts per action) and
`state` when git operations happened. **The card reports both halves:** every
item removed autonomously (name, kind, proof — branch, remote, worktree entry)
and what went to the concept page (decided / still open). Each `/do-ship` in
the queue rendered its own card already; this final card is the aggregate.
Output the markdown VERBATIM as the LAST thing in the response.

## Rules

- No repo-health page, no Apply-Manifest: the concept page exists only for
  ambiguous items, and only one
- Current repo only — never read another repo's refs, never a WIP report
- German UI labels unless project overrides
- Everything removed autonomously is listed in the result
- At-risk and parked work (`parked/<topic>`; landed branches are never parked)
  is never an autonomous candidate — see git-hygiene.md § At-risk work and the park register

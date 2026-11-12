# Cleanup — Executing the Decisions (Step 10a–10c)

Read by `SKILL.md` Step 10 after the concept decisions are read, re-checked
and validated (Step 10, items 1–3). Everything below runs only after that.
Step 8a (autonomous removal) follows the same Safety Invariants and Worktree
Removal Safety below.

## Step 10a — Relay the page decisions to the gate

Applies only to the ambiguous class decided on the concept page. The
autonomous class (Step 8a) never comes here: the gate lets it through on its
own live proof, and nothing is asked.

The page submit is invisible to `pre.cleanup.gate`, so relay exactly what the
user decided, nothing more. No Apply-Manifest, no list of everything: only the
items the page marked `Entfernen`.

Ask it as ONE `AskUserQuestion`: header `Dry-Run`, the question names every
branch, remote branch and worktree path to delete by full name, options
`Ja, ausführen` / `Abbrechen`. Merges and removals are NICHT rückgängig zu
machen: say so in one line. Then, for every unlanded branch in that set, its
own yes: one multiSelect question, header `Unmerged`, options = the full
branch names (4 options per question: chunk them into several questions of one
call). Only ticked names are approved; unticked ones drop out and the rest
proceeds.

The question names every branch literally, never brace- or prefix-compressed
(`x-{a,b}`, `x-*`): the gate matches exact names and refuses a compressed one
even after the yes.

Only proceed after explicit confirmation. No answer (the tool errors with
`Answer questions?` under `claude -p`, is denied or unavailable, or the reply
is `Abbrechen`, Other or free text) is `Abbrechen`: nothing of the ambiguous
class ships or is deleted, the run ends with the `analysis` card.

## Step 10b — Ship Queue (before any cleanup)

Land the selected PRs **one after another**, each through the complete
`/do-ship` pipeline — exactly what would happen if the user sat in P sessions
and typed `/do-ship` in each, minus the tab-switching. Never `gh pr merge`
directly: the guard hook blocks it and it would skip rebase, build, tests,
version bump and the CI gate.

**Order:** oldest PR first (`createdAt`), so a later PR rebases onto the
earlier one's merge instead of the other way round.

**Arm the queue marker once, before the first ship:**

```bash
node -e "require('fs').mkdirSync('.claude',{recursive:true});require('fs').writeFileSync('.claude/.ship-queue',JSON.stringify({owner:'auto-cleanup',since:new Date().toISOString()}))"
```

Project ship extensions read this marker and defer their post-ship
finalizers to the end of the queue (the dotclaude plugin-source repo's
extension would otherwise mark the MCP servers stale after PR 1 and block
every later `ship_*` call — the same trap `/do-run backlog` guards against with
its lockout owner). The marker is NOT an autonomous lockout: the user is
present, every `/do-ship` gate stays interactive.

**Per PR:**

1. **Resolve the working directory** the ship runs in:
   - `quelle: session` (clean worktree) → that worktree path. Re-check
     `git -C <path> status --porcelain` immediately before; any output → SKIP
     this PR with „Worktree hat inzwischen Änderungen".
   - `quelle: lokal` → `git worktree add .claude/worktrees/cleanup-pr-<n> <branch>`
   - `quelle: nur-remote` → `git fetch origin <branch>:<branch>` then the same
     `worktree add`.
   Record `tempWorktree: true` for the two created cases.
2. **Invoke the pipeline:** `Skill("devops:do-ship", args: "--cwd=<path> --keep --queued")`.
   `--cwd` makes every `ship_*` call and every git/gh command target that
   directory instead of this session's own worktree (see `/do-ship` → *Composed
   ships*). `--keep` because the branch/worktree teardown is this step's job,
   not the ship's — `/do-ship` must never `ExitWorktree` on a directory that is
   not its session's own. `--queued` is informational (card wording).
3. **Read the outcome** from the ship's `ship_release` result / card variant:
   - `ship-successful` → record `merged: true, mergeSha, version`.
   - `ship-blocked` → record the reason; **continue with the next PR**. One
     blocked PR never halts the queue (COMPLETED > INTERRUPTED > BLOCKED, as
     in `/do-run backlog`).
4. **Tear down** (merged PRs only):
   - `tempWorktree: true` → `git worktree remove <path>` (no `--force`), then
     `git branch -d <branch>` (lowercase `-d`: refuses if not merged — a
     second safety net), then `git push origin --delete <branch>` when
     the remote ref still exists.
   - `quelle: session` → leave the worktree in place; it now classifies as a
     clean, squash-merged Aktive Session. The owning session keeps working or
     gets removed in a later run — never yank a directory from under a session.
   - Blocked PRs keep their worktree so the user can resume there; list the
     path in the summary.
5. **Re-sync** before the next PR: `git fetch origin main` so the next ship's
   preflight sees the merge that just landed.

**After the last PR:**

1. Run the project ship-extension finalizer exactly once if ≥1 PR merged —
   read `{project}/.claude/skills/do-ship/reference.md` (legacy name `SKILL.md`; pre-PR-2 fallback: `ship/`) for the step the extension
   deferred while `.claude/.ship-queue` existed, run it, capture its output.
2. Delete `.claude/.ship-queue`.
3. Report ✅ per merged PR (with merge SHA + version) and ⏸ per blocked PR
   (with reason), then continue with Step 10c: the cleanup set was fixed at
   submit time and is not widened by the merges.

## Step 10c — Cleanup Execution

Execute in order after the relayed Dry-Run-Confirm and after the ship queue (10b):
   a. Delete the decided local branches: `git branch -D <branch>`
   b. `git push origin --delete <branch>` for each decided branch that has a remote
   c. Remove selected clean worktrees — in the background (Bash
      `run_in_background: true`), one removal after the other, never under a
      foreground timeout. A worktree with `node_modules` takes minutes per
      `git worktree remove` on Windows (31 took ~20 min, #829), so use the fast
      path, per worktree:
      - Re-run the protected-set check (§ Safety Invariants, Worktree Removal
        Safety) and `git -C <path> status --porcelain` immediately before it.
        If ANY output → SKIP with warning: "Worktree hat inzwischen Aenderungen —
        Entfernung abgebrochen."
      - Delete the folder natively: `cmd /c rmdir /s /q "<path>"` (Windows) or
        `rm -rf "<path>"` — literal path, one per command. `pre.cleanup.gate`
        allows it only for a path the relayed Dry-Run names, never for the
        main checkout or the session's own directory, and only while its tree
        is clean.
      - Echo one progress line per worktree (`[3/31] <path> entfernt`) and
        report it in the chat; a folder still on disk afterwards is
        `beschädigt` (half removed) — finish it per
        `{PLUGIN_ROOT}/deep-knowledge/git-hygiene.md` § *A half-done worktree
        removal is Claude's to finish*, never hand it to the user.
      After the last one: ONE `git worktree prune` drops the registrations.
   d. `git worktree prune` (already done when c ran)
   e. `git remote prune origin`
   f. Sync main only when the main checkout is clean: `git pull --ff-only origin main`
      there; never switch a checkout away from a branch a session uses

Report the outcome in the chat and on the completion card (removed / skipped +
reason per item), together with the autonomous list from Step 8a.

Persist results to `~/.claude/devops-concepts/{date}-cleanup-decisions.json`.

## Safety Invariants

- **Never delete a worktree-attached branch** — even if checked by the user.
  Report it: "Branch X ist an einen aktiven Worktree gebunden.
  Entferne zuerst den Worktree."
- **Re-validate before every delete** — the state may have changed since
  the analysis or the page was generated.
- **Never push --delete a remote branch** that is attached to a local worktree.
- **Log every action** with branch name and result (deleted / skipped / error).
- **Delete by full refname only** — `git branch -D <name>` with a name taken
  from `refs/heads/`, `git push origin --delete refs/heads/<name>` with a name
  confirmed by `ls-remote`. Never a name derived from `%(refname:short)`.

## Worktree Removal Safety

Worktree removal (`choice: "Entfernen"` on a `session-worktree` decision) is
only allowed for Aktive Sessions classified as `clean` in Step 2, and never
for a running session. The only removal that needs no decision is a worktree
registration whose directory is already gone. Enforce these rules:

1. **Re-check before removal:** Run `git -C <worktree_path> status --porcelain`
   again immediately before acting. If ANY output → SKIP with warning:
   "Worktree hat inzwischen Aenderungen — Entfernung abgebrochen."
2. **Never force-remove:** Use `git worktree remove <path>` (without `--force`)
   or the 10c fast path (native delete after a clean re-check, then one
   `git worktree prune`). If git refuses, report the error — do NOT retry with
   `--force`, and never switch to the native delete for a worktree git called
   dirty. Run removals in the background (a big `node_modules` outlasts a
   120 s call), and finish a half-removed orphan yourself:
   `{PLUGIN_ROOT}/deep-knowledge/git-hygiene.md` § *A half-done worktree
   removal is Claude's to finish*.
3. **Never discard changes:** If a worktree (Aktive Session) has `status: has-changes`,
   the concept page must NOT render any DESTRUCTIVE action control for it: no
   `Entfernen`, no "discard", no "reset". It is read-only context. Even when
   the analysis recommends `discard`, the action stays advisory: the user must
   commit or checkout manually. This is enforced in the page generation, not
   just in execution.
4. **Branch cleanup after removal:** After successfully removing a clean
   worktree, the associated branch is NOT automatically deleted. The branch
   is decided on its own (a separate topic on the page, or the autonomous proof
   in a later run), and must be checked independently (check that it is not the current branch in the
   main repo first).

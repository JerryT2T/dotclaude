<!-- >>> devops (managed) >>> -->
# Working rules (devops plugin)

Written by the devops plugin and kept current by it. Your own text goes outside the markers.

## Branches
- Never work on `main`, `master` or the default branch. Branch off it as `<type>/<topic>`
  (a Claude Project thread: `claude/thread-<slug>`) and reach `main` only through a pull request.
- One task, one branch. Do not switch a checkout other work is using; use a worktree instead.

## Commits
- `<type>(<scope>): <subject>` with type feat, fix, refactor, perf, test, docs, chore or style.
  Subject: at most 72 characters, imperative, no trailing period. The body says why, not what.
- One commit per finished logical unit; `wip(<scope>): <what>` as a checkpoint. A bug fix is its own commit.

## Version and changelog
- The version number and CHANGELOG belong to the ship step. A work commit never bumps them.
- A cloud session cannot push tags. The ship hands the tag over as exact commands: pass them on.

## Result format (when no devops plugin renders the completion card)
- End every task with one plain-text reply: a heading `✨✨✨ <title> ✨✨✨`, then a line that starts
  with a status icon (👉 needs you, 🟩 done, 🟥 failed, 🟦 info), then 3-5 numbered points:
  what works now, what was tested and how, what is open, branch and PR link.

## Claude Project thread without the devops plugin
- Only when no skill named `devops:…` is loaded in this session and the prompt is a Claude Project thread
  (a `<wake …><project …>` envelope): end the FIRST reply with one line that the devops plugin is not
  active in this project and is added under Project settings > Plugins. Anywhere else, say nothing.
<!-- <<< devops (managed) <<< -->

# Ship — manual checklist (no ship MCP server)

Referenced by `/do-ship` Step 0.5. Runs **only** when the `dotclaude`
tools are absent from the session — not merely deferred (#567). Typical case:
a claude.ai cloud session whose container never loaded the plugin's MCP
servers, or a local session whose server could not be restored by the cache
diagnosis in `{PLUGIN_ROOT}/deep-knowledge/mcp-deferred-tools.md`.

Without the tools nothing enforces the conventions they encode — squash merge,
tag on the squash commit, annotated tag, verified push. Improvising the ship
lost two of them once (a merge commit on `main`, no release tag). This
checklist is the contract instead: work through it in order, tick nothing
that did not happen.

## Announce the switch — one line, first

> Ship-MCP-Server nicht verfügbar (<reason: not in the tool list / failed to
> connect, cache not repairable>) — ich shippe nach der manuellen Checkliste.

In a cloud session add: the plugin is not loaded there; enabling the devops
plugin for cloud sessions (Project settings > Plugins) brings the automated
pipeline back. Until then a cloud thread ships by § Cloud thread below — it
can ship; only the tag needs the owner.

## Checklist

1. **Clean start** — `git status --porcelain` empty, branch pushed, rebased on
   `origin/<base>`. Conflict markers: `git grep -nE '^(<{7}|={7}|>{7}|\|{7})( |$)'`
   over the diff must find nothing.
2. **Gates** — every pre-merge gate the project extension names (lint, tests,
   build). A red gate stops the ship; say so, do not merge. When the plugin
   files are on disk, the deploy-parity build is one of them:
   `node "{PLUGIN_ROOT}/scripts/deploy-parity.js" --cwd "<cwd>"` — `failed`
   stops the ship (`{PLUGIN_ROOT}/deep-knowledge/deploy-parity.md`).
3. **Version bump** — every version-bearing file the project extension (or
   `versioning.md`) names, all to the same `X.Y.Z`. Major → ask the user
   (under a lockout: stop, as the pipeline would).
4. **CHANGELOG** — a new top entry `## [X.Y.Z] — <date>` with the user-facing
   change, committed with the bump: `chore(release): vX.Y.Z`.
5. **PR** — title `type(scope): summary`, body starting `Closes #N` when an
   issue is shipped. Prefer the GitHub MCP tools (`create_pull_request`);
   `gh pr create` is blocked by `pre.ship.guard` wherever the plugin's hooks
   run, unless the user set `DOTCLAUDE_ALLOW_MANUAL_SHIP=1`. In a cloud thread
   steps 5–9 are the REST commands of § Cloud thread.
6. **Wait for checks** — every required check green before the merge.
7. **Squash merge** — never a merge commit, never a rebase merge, unless the
   pipeline's own rule applies (overlapping files with a parallel branch →
   merge commit, `merge-safety.md`; a `--batch` backlog ship → merge commit,
   so each per-issue commit reaches the base, #1155). Commit title
   `type(scope): summary (X.Y.Z) (#PR)`. Read back the merge commit SHA from
   `origin/<base>` after a fetch.
8. **Ring tag** — the annotated `alpha/vX.Y.Z` on that squash commit, pushed
   and verified with `ls-remote`. The exact commands, and what to do when this
   session cannot push the tag, are in `release-flow.md` § owner hand-off
   (#566) — follow them from there, do not restate them.
9. **Cleanup** — delete the remote branch; the local branch and worktree only
   when this session created them.
10. **Summary** — the card, or where `render_completion_card` is absent too, a
    short summary with the same facts (version, PR, merge SHA, tag state) and
    one line **"Nicht gelaufen: …"** naming every automated guard that did not
    run: preflight (merge-safety, file-overlap), the post-merge tree guard, the
    Codex review, the ship passes (harden/polish), the post-merge watcher,
    hygiene. When the plugin files exist on disk, the card renders offline:
    `node "{PLUGIN_ROOT}/mcp-server/index.js" --render-card <payload.json>`.
    The card says the ship was manual: a `tests` line
    `{ method: "Ship", result: "manuell — Ship-MCP nicht verfügbar" }`.

## Cloud thread — steps 5 to 9 without `gh pr` and without the plugin

The claude.ai cloud GitHub proxy takes **branch pushes** and `gh api` (REST).
It refuses the GraphQL subcommands (`gh pr`, `gh issue`), **tag pushes** and
**branch deletions through git**. So steps 1–4 are unchanged and steps 5–9 read
as follows; `{owner}/{repo}` is filled in by `gh` from the remote (write the
real `owner/repo` when it is not). Skip no step; a refused call is reported,
never worked around by a merge commit or a lightweight tag.

- **Push** — `git push -u origin <branch>` (a branch push works).
- **5. PR** — `gh api -X POST repos/{owner}/{repo}/pulls -f title='type(scope): summary' -f head='<branch>' -f base='<base>' -f body='Closes #N …'`;
  the answer carries `number` and `html_url`. REST cannot make a draft ready:
  create it as a regular PR. A PR for the branch already open: `gh api 'repos/{owner}/{repo}/pulls?state=open&head={owner}:<branch>'`.
- **6. Wait for checks** — `SHA=$(git rev-parse HEAD)`, then every ~30 s:
  `gh api repos/{owner}/{repo}/commits/$SHA/check-runs --jq '.check_runs[] | [.name,.status,.conclusion] | @tsv'`
  and `gh api repos/{owner}/{repo}/commits/$SHA/status --jq .state`. Green =
  every run `completed` with `success|neutral|skipped` and the status not
  `failure`; a failure stops the ship. Nothing reported for ~90 s = no CI there — say so on the card.
- **7. Squash merge** — `gh api -X PUT repos/{owner}/{repo}/pulls/<N>/merge -f merge_method=squash`;
  `"merged": true` and `sha` in the answer, then `git fetch origin <base>` and
  `git rev-parse origin/<base>`. A refusal (checks, review rule) stops the ship; report it.
- **8. Ring tag — the owner does it.** The proxy rejects a tag push, so do not
  try it and do not retry. Give the owner the block of
  `release-flow.md` § owner hand-off. It is written out here, merge sha filled
  in, because a cloud thread without the plugin has no such file on disk:
  `git fetch origin <base>` · `git tag -a alpha/vX.Y.Z <merge-sha> -m '{"channel":"alpha","version":"X.Y.Z"}'` ·
  `git push origin alpha/vX.Y.Z` · `git ls-remote --tags origin alpha/vX.Y.Z`,
  run in a clone on their own computer. The card says it: *vX.Y.Z is merged on
  `<base>`, the tag is pending the owner's commands*, and lists them.
- **9. Cleanup** — `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/<branch>`;
  a refusal is a note on the card (the repository's "delete head branches
  after merge" setting or the cleanup page removes it), not a failure.

With the plugin's ship tools loaded in the cloud thread (`ship_run`) the same
REST calls run by themselves: `mcp-server/ship/lib/github.js` switches to REST
when `CLAUDE_CODE_REMOTE=true` or after the first refused `gh pr …` call, and
the result's `tagHandoff` is the block above, ready to copy.

## Never

- Never a merge commit because it is the default of the tool at hand.
- Never a lightweight tag, never a tag on the branch head instead of the
  squash commit.
- Never "Everything up-to-date" as proof that a tag landed.
- Never this checklist while the ship tools are merely deferred — load them
  (Step 0.5) and run the pipeline.

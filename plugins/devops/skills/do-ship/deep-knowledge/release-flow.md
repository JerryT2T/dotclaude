# Release Flow

## Commit + Push

Stage version-bumped files and remaining changes. Commit per `{PLUGIN_ROOT}/deep-knowledge/commit-conventions.md`.

```bash
git push -u origin <branch>
```

## Create PR

Create a pull request via the GitHub API:

- Title: `<type>(scope): subject` — under 70 chars
- Body MUST start with `Closes #NNN` / `Fixes #NNN` for every resolved issue
- Base branch: `main`
- Include a `## Summary` and `## Test plan` section in the body

## Pre-Merge CI Checks Gate

Between PR creation and merge, `ship_release` waits for `gh pr checks --watch`
to finish (default 10-min timeout). See `quality-gates.md → Pre-Merge CI Checks Gate`.

- **green** → continue to merge
- **failed / timeout** → return success: false, do NOT merge, render `ship-blocked` card
- **no checks configured** → silent skip
- **bypass**: `skipChecks: true` or `DEVOPS_SHIP_SKIP_CHECKS=1` (hot-fix only)

This prevents the historical failure mode where lokal grün + merge → CI rot auf
`main` without anyone noticing.

## Merge PR

Merge the PR via the GitHub API:

- Strategy: squash merge
- Pass `--delete-branch` to request remote branch deletion
- Verify remote branch is gone: `git ls-remote --heads origin <branch>`
- If branch persists (API hiccup), cleanup step 3 handles it as a fallback

## Tag — alpha channel (ring model)

After merge, `ship_release` creates the ANNOTATED alpha tag on main:

```bash
git tag -a alpha/v<X.Y.Z> origin/main -m '{"channel":"alpha","version":"<X.Y.Z>"}'
git push origin alpha/v<X.Y.Z>
```

- Tag on the **squash-merge commit on main** — not on the feature branch
- Format: `alpha/vX.Y.Z` — every ship publishes to the earliest channel;
  `beta/vX.Y.Z`, `stable/vX.Y.Z` and the bare `vX.Y.Z` alias are created by
  `/do-ship promote` (promotion, same SHA)
- Annotated, never lightweight — promotion time/actor must be derivable from
  the tag object (all channel tags share one commit)
- Skip if version bump was "none"
- Verify tag exists: `git ls-remote --tags origin | grep "alpha/v<X.Y.Z>"`
- Published tags are immutable — never move or delete them

### When the session cannot push the tag — owner hand-off (#566)

A push the remote refuses for permission reasons (403, `Permission … denied`,
a protected-tag rule, `GH013`) is not retried — it fails the same way every
time. `ship_release` drops the unpushed local tag and returns
`tagHandoff: { tag, target, permanent, reason, commands, gates, note }`; a push
that kept failing on transient errors carries the same block with
`permanent: false`. `commands` is the copy-ready sequence the owner runs:

```bash
git fetch origin main
git tag -a alpha/v<X.Y.Z> <merge sha> -m '{"channel":"alpha","version":"<X.Y.Z>"}'
git push origin alpha/v<X.Y.Z>
git ls-remote --tags origin alpha/v<X.Y.Z>
```

Done only when `ls-remote` lists the tag — "Everything up-to-date" proves
nothing. Never GitHub's web release form: it creates a lightweight tag.
This block is the single source of the manual tag step; the manual ship
checklist (#567) points here instead of restating it.

### Cloud session: CI creates the tag (#1212)

A claude.ai cloud session never pushes tags (environment policy), so the owner
step above is the last fallback, not the plan. When the repo has
`.github/workflows/tag-on-version.yml` (scaffold `templates/tag-on-version.yml`;
its `tag-prefix` input / `TAG_PREFIX` sets e.g. `alpha/`), `ship_release` polls
the remote tag via REST (`tagPollAttempts` × `tagPollDelayMs`) after the refused
push: found → `tagVerified: true`, `tagCreatedBy: "ci"`, no `tagHandoff`. Never
found → `tagHandoff` with a `workflowNote`. No workflow → `tagHandoff` with a
`setupOffer` (reply "Tag-Workflow einrichten"): once the owner agrees, add the
template in a normal PR. A tag made with `GITHUB_TOKEN` does not trigger other
workflows (the template documents the PAT route); pushing a workflow file may
need the `workflow` scope — if refused, hand the file to the owner once.
dotclaude's own ring flow does not use it.

## GitHub Release — at PROMOTION, not at ship

Ship creates NO GitHub Release (alpha ships on every merge — a Release per
alpha is noise). Releases are owned by the promotion flow:

- **beta**: tags-only at launch (no Release; deferred until an external beta
  audience exists — spec §11)
- **stable**: the bare `v<X.Y.Z>` tag push triggers `.github/workflows/release.yml`
  (notes from CHANGELOG); `ship_promote` polls for the Release and creates it
  via `gh` as an idempotent fallback. Range computation must exclude channel
  tags: `git describe --tags --match 'v[0-9]*' --abbrev=0 HEAD~1`.

Format per `templates/github-release.md`: title/tag `v<X.Y.Z>`, body mirrors
the CHANGELOG entry (Added/Changed/Fixed + Contributors), scope = changes
since the previous STABLE release only, verification via GitHub API.

## CI tag filter

The release workflow's tag trigger must match **all** semver tags
(`v[0-9]+.[0-9]+.[0-9]+`), not just `.0` tags. A filter like `v*.*.0`
silently skips patches.

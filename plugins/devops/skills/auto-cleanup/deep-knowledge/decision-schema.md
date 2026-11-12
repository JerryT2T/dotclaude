# Cleanup Decision Schema

What `SKILL.md` Step 10 reads when the concept page is submitted. The
shape is the auto-concept decision payload (one decision per topic); only the
cleanup-specific meaning is defined here.

```json
{
  "repo": { "name": "my-repo", "path": "/p/my-repo", "defaultBranch": "main" },
  "decisions": [
    { "id": "br-claude-old-session", "kind": "session-worktree", "branch": "claude/old-session",
      "path": "/p/my-repo/.claude/worktrees/old-session", "ort": "lokal", "choice": "Entfernen" },
    { "id": "br-feat-experiment", "kind": "branch", "branch": "feat/experiment", "ort": "lokal+remote", "choice": "Behalten" },
    { "id": "pr-412", "kind": "open-pr", "number": 412, "branch": "claude/ship-probe", "choice": "Shippen" }
  ],
  "comments": [ { "id": "br-feat-experiment", "text": "Might still need this" } ]
}
```

| `kind` | `choice` → action |
|---|---|
| `branch` | `Entfernen` → delete local (and the remote ref when `ort` has one); `Behalten` / missing → nothing |
| `session-worktree` | `Entfernen` → remove the worktree directory (clean only), then the branch; `Behalten` / missing → nothing |
| `open-pr` | `Shippen` → ship queue (Step 10b); `Behalten` / missing → nothing |

Rules:

- A missing decision is `Behalten`. A choice that names a protected branch,
  the default branch or a worktree that gained changes is skipped with a
  warning, whatever the payload says.
- `Entfernen` of an unlanded branch needs the separate `Unmerged` yes at
  execution (Deletion gate); a `Shippen` PR is never also deleted.
- There are no global options: remote branches go with their branch, the main
  sync is part of the run, worktree prune runs once after removals.
- The decisions and the executed result (removed / skipped / error per item)
  are persisted to `~/.claude/devops-concepts/{date}-cleanup-decisions.json`.

# auto-agents — burn conveyor (`--burn`)

Read on demand by `SKILL.md` Step 6, only when the run carries `--burn`
(do-run's burn and backlog modes). Every other run skips it.

The burn's budget, 5-hour window, reserve and resume rules are code in
`scripts/burn-plan.js` (rationale:
`{PLUGIN_ROOT}/skills/do-run/modes/burn/deep-knowledge/burn-scheduler.md`).
This loop only executes its decisions — it never counts lanes, estimates a
cost or overrides a model by itself. `B` below is
`node "{PLUGIN_ROOT}/scripts/burn-plan.js" … --state=<the --burn path>`.

Loop until the gate says `finish`, `pause` or `stop`:

1. **`B gate`** → one JSON decision:
   - `spawn` — the task is already claimed. Spawn one agent for it: role by
     the task, `model` from `models[<role>]` when present, the Autonomous
     directive, the tool-call ceiling `toolCalls`, the task's `branch` when
     it resumes a wip branch (and its `salvage` patch to apply first), and
     the checkpoint rule every implementing agent gets
     (`{PLUGIN_ROOT}/deep-knowledge/agent-orchestration.md` § Agent Prompt Template, item
     4) with the scope `burn`. `foreground:
     true` → foreground spawn; else `run_in_background: true`. Right after
     the spawn: `B state agent <id> --agent-id=<id> --agent=<role>
     --branch=<b> --worktree=<w>`. A spawn that fails → `B state requeue
     <id>`. Then gate again (another lane may be free).
   - `wait` — lanes full, a file conflict, the window or a drain: wait for
     the next agent completion.
   - `hold` — usage unreadable: gate again after the next completion or in a
     minute; the gate itself moves to blind mode and then to a drain.
   - `pause` — nothing fits the 5-hour window: when `resumeCron` is set, arm
     `CronCreate` one-shot at it with the prompt `BURN_RESUME: window reset`,
     then `B state resume-cron --for=<resumeAt> --job=<jobId>`. Report
     "pausiert bis `resumeAtLocal`" (without a cron: "— mit »weiter« geht es
     danach weiter") and end the turn.
   - `finish` / `stop` — leave the loop (Step 7).
   - `rearmResumeCron` present on any decision — arm it the same way
     (`--for=<windowResetAt>`).
2. **On each completion** (one merge at a time):
   `passes` included `redteam` and the diff is substantive → one redteam
   review of the task diff; a high-severity finding goes back to the same
   agent once (`SendMessage`). Then targeted tests for the changed modules,
   merge the sub-branch into the integration branch, then remove that
   sub-agent's worktree and branch right away (see "Remove after merge"
   below), `git push -u origin
   <integration branch>` (non-force; no PR), `B state land <id>
   --sha=<merge sha>`. The push is skipped — the merge stays local, `state
   land` gets `--pushed=false` — when the repo has no remote or the
   integration branch is the session's own `main`: that push is the ship's. The integration branch is never `main`, `master` or
   the default branch while the session works on a feature branch — `init`
   and `state integration` refuse them unless the session itself is on that
   branch; otherwise `main` is reached only by shipping, which is the
   caller's decision (Step 7). A task that cannot be made green → `B state fail <id>
   --reason=…` (or `requeue` when the cause is external).
   **Remove after merge** — once the merge is verified (sub tip is an
   ancestor of the integration branch, worktree clean) the next step is
   `node "{PLUGIN_ROOT}/scripts/integration-check.js" --integration
   <integration-branch> --sub <sub-branch|path> --remove --now`. `--now` skips
   only the ≥30 min idle wait; landed, clean, own-commits, live-session,
   ignored-file and lock checks (a dead pid's lock is lifted) still apply; a
   kept worktree (`kept` in the output) is retried by the Step 7 sweep. Do
   not leave agent worktrees for the end of the run.
3. **Before removing any worktree** → `B prune-check --branch=<b>
   --worktree=<w>`; exit 1 means keep it.
4. After the loop: the full QA run as an ordinary last task (not a gate),
   then `B state finish --status=<COMPLETED|INTERRUPTED|BLOCKED>` — it also
   records the run's calibration sample.

A usage limit that stops this session mid-loop is not handled here: the next
prompt carries a `[burn-resume]` block from `prompt.burn.resume` (question
on a manual nudge, policy on an automatic resume). Its steps end by
re-entering this loop.

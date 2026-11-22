# Claude Projects Threads

How the devops plugin behaves in a thread of a Claude Project (claude.ai/code, Desktop Code tab → Projects): prompt intake, rights, work folder, title, questions, the completion card, concept pages and ship. Feature `project-threads` (alpha) gates what the person sees; the safety lines below apply on every channel. Wording: the new thing is always "Claude Project" / "Claude-Projekt" (`CONVENTIONS.md` § Glossary).

Code: `hooks/lib/project-thread.js` (detection, PROMPT INTAKE CONTRACT, the thread's title), `hooks/dispatch/dispatch.js` (`normalizeInput`), `hooks/lib/title-plan.js` (`threadTitlePlan`), `hooks/lib/thread-rights.js`, `hooks/lib/branch-fix.js` (`threadFix`), `mcp-server/lib/mode-state.js` (`threadTitleInstruction`, `coordinatorStatusInstruction`), `mcp-server/index.js` (`THREAD_RELAY_INSTRUCTION`). Title scheme: `session-title-scheme.md`.

## Where the plugin runs

A project has one coordinator (the project chat) and threads that do the work. Official doc: https://code.claude.com/docs/en/claude-projects.

| Place | Runs where | devops loaded? |
|---|---|---|
| Thread on this computer ("Work locally") | a Claude Code session here, started over Remote Control, in ONE folder the person picked (may be a non-repo parent folder; several threads may share it) | yes: hooks, MCP server, skills and settings of this machine (measured 2026-11-21) |
| Cloud thread | a cloud container, own clone and branch | only when the plugin is added under Project settings > Plugins; repo skills, hooks and `.mcp.json` do not load there. Whether a plugin's hooks run is not documented and not tested. Root `CLAUDE.md`, `.claude/CLAUDE.md` and root `.claude/rules/` load either way |
| Coordinator (project chat) | a cloud session | no. It gets the project instructions (Project settings > Memory, 16,000 characters) and nothing from this machine |

What a cloud thread needs without the plugin comes from the repo: `.claude/rules/devops.md` (`scripts/cloud-rules.js`; a new repo gets it with project setup, an established one with its next ship) and the rules do-learn stores under `.claude/rules/` (`skills/do-learn/deep-knowledge/routing-details.md`).

## What differs in a thread

Read off a real thread transcript:

- The person sees only what the `mcp__hearthbot__*` tools post (`post_message`, `post_widget`, `update_progress_checklist`). Plain text, `mcp__visualize__show_widget` and the session's sidebar title reach no one.
- The title the person sees is the thread's, set with `mcp__hearthbot__rename_thread {title}`.
- Every prompt is a `<wake …><project id="chan_…" type="project">` envelope around the person's message. A note from the coordinator arrives as `<relay from="coordinator" …>`.
- Every turn ends with a hearthbot call. A Stop hook that blocked did not continue the turn (one observed sample): its reason would only show up as a stale reminder on the next wake.

Detection: a wake prompt or any `mcp__hearthbot__*` tool call marks the session (`dotclaude-devops-project-thread-<session>` in the tmp dir); the Stop hook and the card renderer read that marker, else the transcript's own `projectsUserTurn` entry. The first thread of a machine also leaves `~/.claude/devops-thread-seen.json` (`hooks/lib/thread-seen.js`), which makes a lagging cloud copy of the plugin urgent (`hooks/lib/cloud-update.js`).

## Every channel (no feature gate)

- **Prompt intake.** The UserPromptSubmit dispatcher unwraps the envelope once: every prompt hook gets `prompt` (the words to act on), `prompt_raw` (the envelope) and `prompt_origin` (`person` | `coordinator` | `thread` | `machine` | `typed`). "ship it" in a thread is a ship order like a typed one. A typed prompt passes byte-identical.
- **A coordinator note is a colleague turn.** Its work is done and its issue is tracked; batch mode does not collect it, frustration detection does not read it, and it satisfies no user-word gate.
- **Rights of a colleague** (origin `coordinator` or `thread`): work and an alpha ship. A promote to beta or stable, an archive, a force-push and a destructive delete need the person's own message in the thread or a typed prompt. Enforced, not advised: `pre.thread.rights` denies the `ship_promote` tool, a channel-tag push, `gh release create`, force pushes and destructive deletes (`hooks/lib/thread-rights.js`), `pre.session.archive` denies the archive; `ship-intent.js` `limitToAlpha` only words the ship order. One decision for all of them, `project-thread.js` `turnRights`: a machine turn (task notification) inherits the origin of the prompt it continues, a subagent that of its parent turn, and a prompt that cannot be read counts as a colleague in a marked thread (fail closed). The command scan is syntactic: a configured git alias or a `$VAR` command name is not seen.
- **Main guard on the target repo.** `pre.main.guard` checks the repo each git write acts on (`git -C`, `cd … &&`, `pushd`/`popd`, `Set-Location`, `GIT_DIR` / `GIT_WORK_TREE`, `--git-dir` / `--work-tree`), so a session started in a non-repo folder cannot commit on `main` of a repo below it. A directory that does not exist falls back to the session's folder. A pure fast-forward of `main` to its remote (`merge --ff-only <remote>/main`, `pull --ff-only`) passes, and a ship sentinel covers the other worktrees of the same repository.
- **A session is a thread only by a whole envelope.** The sticky marker is set when the whole prompt is one `<wake>…</wake>` envelope or a `mcp__hearthbot__*` tool is called; an envelope pasted into a typed prompt marks nothing.
- **No state in a non-repo start folder.** Runtime state of a session whose folder is no work tree goes to `~/.claude/devops-state/` (`project-root.js` `stateClaudeDir`); the SHIP and desktop-test nudges stay silent for an edit in no git repo.
- **A `/send-to-project` turn owes no completion card** (`post.flow.completion`, `card-guard.js` `sendToProjectOnlyTurn`).
- `prompt.flow.title-work` gives no Desktop title instruction in a thread, `post.flow.completion` no Desktop card contract, and `stop.flow.guard` never blocks there (a thread without the feature is `quiet`).

## With the feature (`on`)

| Moment | What happens |
|---|---|
| A wake starts work | `prompt.flow.title-work` names one `rename_thread` call: `⏳ ➜ 🤖 <thread title>` (a ship order in the person's words: `⏳ ➜ 🚀`). First wake: the model prefixes the title it sees; later the hook knows the title from the transcript's last `rename_thread` and names it exactly |
| First prompt of the thread | one line: session-start notices (versions, budget login, orphan lines) are for the Desktop user and are not posted (`prompt.thread.notices`) |
| A repo must change and the start folder is not its own worktree | the branch guards name a worktree per repo and thread: `git -C <repo> worktree add <repo>/.claude/worktrees/thread-<id8> -b claude/thread-<id8>-<slug>`, work by absolute path. Two threads in one folder, several folders and several repos per thread each get their own; no shared checkout is switched |
| A skill wants to ask | `AskUserQuestion` is refused with the exact instruction: post the question as a numbered reply (`1. … a) …`), rename the thread to `👉 ➜ ❓ …`; the person's next message is the answer. A do-run arms its run contract from that reply (`hooks/lib/run-contract-thread.js`) |
| A subagent's tool call waits on a permission | `👉` on the thread title via `rename_thread`, back to `⏳` when answered. A permission the thread's own call waits on cannot be shown: the model is blocked until the answer |
| `start_session` | refused (`pre.thread.session`): report the split to the coordinator. Subagents are allowed |
| Budget class other than `free` | never asked; *spare the window* applies unasked (`agent-proactivity-details.md` § Thread) |
| First tool call | the card contract plus one line: the card is the result reply |
| Checklist with every step done | one "card now" line |
| `render_completion_card` (tool or `--render-card`) | the full markdown card, to be posted verbatim as the text of ONE `post_message`, plus the exact `rename_thread` to the outcome head (`👉 ➜ 📦 …`). No widget, no `wrap_up`, no archive |
| The card is posted | one status line to the coordinator (`SendMessage`, address from the newest coordinator relay in the transcript; skipped silently when unknown or refused), then "turn over": only `set_thread_resolved` may follow |
| A reply without the card while the title says ⏳ | once per prompt: the exact rename that takes the head off, for a turn that ends there |
| A concept page | published as an artifact, link posted in the thread and opened in Edge on a local thread (`concept-open.js open-url`); decisions and the action (`iterate`, `implement`) come back through the artifact's `db` store (`skills/auto-concept/deep-knowledge/artifact-fallback.md` § In a Claude Projects thread) |

Rules that differ from a Desktop session:

- **The topic is the thread's own title, never clamped.** The coordinator names a thread in the person's words and the person finds it by that name; the 30-character topic and the 42-character budget are sidebar rules.
- **No `sessionTitle` from the hook, no `set_session_title`.** That title names the local session, which the project does not show.
- **No interrupted title, no title-mismatch check.** No Stop hook can correct a title there. The stale hourglass is handled by the reply hint above.

## Ship

A thread on this computer ships like a Desktop session. A cloud thread ships as far as the platform allows: branch push, PR, checks and squash-merge go through REST (`mcp-server/ship/lib/github.js`, switched by `CLAUDE_CODE_REMOTE=true` or the first refused `gh pr` call); the tag the proxy refuses is handed over with the exact commands for a local clone (`tag-handoff.js`). Without the plugin a cloud thread follows `skills/do-ship/deep-knowledge/manual-ship.md` § Cloud thread.

## Backlog and cleanup

GitHub stays the single backlog source: a thread that works an issue sets it In Progress (`prompt.issue.detect`), and a backlog run skips an issue that is in progress elsewhere (`skills/do-run/modes/backlog/in-progress.js`). Cleanup shows `thread-…` worktrees and `claude/thread-…` branches as their own group, never preselected for deletion; a remote-only branch without a PR counts as orphaned after 7 idle days (`mcp-server/ship/lib/hygiene.js`).

## The project chat

The coordinator shows a thread by its title, so the head a thread puts on its title appears in the project chat's thread list and thread cards without anything further. The coordinator's own summaries are its words. The text that asks it to carry a thread's card over, and the rule "one issue = one thread, no issue number in the thread title", is in `project-instructions-snippet.md` (the one source; `auto-setup` § Claude Projects hands it out).

## Not covered

- Batch mode, the approval-wait of the thread's own tool call and the ship-skill title steps still name `set_session_title` in a thread. They rename the local session only, which is harmless and invisible.
- `post_widget` (the thread's widget tool) is not used: a widget on its own does not reach the project chat, the posted text does.
- The project chat: a card or a devops title there needs the coordinator to cooperate, which only project instructions can ask for.
- Not observed live yet: the coordinator address form (`bridge:cse_<id>`), the artifact read-back from a thread, a full ship from a cloud thread, the claude.ai update click. `%TEMP%\dotclaude-mcp-heartbeats\liveness.log` records when a thread's MCP server is not attributed to its session.

## Testing

`hooks/lib/project-thread.test.js`, `hooks/lib/prompt-intake.test.js`, `hooks/lib/title-plan.thread.test.js`, `hooks/lib/thread-channel.test.js`, `hooks/lib/thread-rights-hard.test.js`, `hooks/pre-tool-use/main-guard.target.test.js`, and `hooks/lib/project-thread.e2e.test.js` (one thread turn through the real hook scripts and the offline renderer: feature on, feature off, and an unchanged Desktop session). Live: start a thread with "Work locally" in a project, give it a task with a file change, and check the thread list (head on the title while it works, outcome head after) and the thread's last reply (the card).

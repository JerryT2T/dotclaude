# Claude Projects Threads

How the devops plugin behaves in a thread of a Claude Project (claude.ai/code, Desktop Code tab → Projects): prompt intake, rights, work folder, title, questions, the completion card, concept pages and ship. Feature `project-threads` (alpha) gates what the person sees; the safety lines below apply on every channel. Wording: the new thing is always "Claude Project" / "Claude-Projekt" (`CONVENTIONS.md` § Glossary).

Code: `hooks/lib/project-thread.js` (detection, PROMPT INTAKE CONTRACT, the thread's title), `hooks/dispatch/dispatch.js` (`normalizeInput`), `hooks/lib/title-plan.js` (`threadTitlePlan`), `hooks/lib/thread-rights.js`, `hooks/lib/branch-fix.js` (`threadFix`), `mcp-server/lib/mode-state.js` (`threadTitleInstruction`, `coordinatorStatusInstruction`), `mcp-server/index.js` (`THREAD_RELAY_INSTRUCTION`). Title scheme: `session-title-scheme.md`.

## Where the plugin runs

A project has one coordinator (the project chat) and threads that do the work. Official doc: https://code.claude.com/docs/en/claude-projects.

| Place | Runs where | devops loaded? |
|---|---|---|
| Thread on this computer ("Work locally") | a Claude Code session here, started over Remote Control, in ONE folder the person picked (may be a non-repo parent folder; several threads may share it) | yes: hooks, MCP server, skills and settings of this machine (measured 2026-11-21) |
| Cloud thread | a cloud container, own clone and branch | only when the plugin is enabled for the claude.ai account (claude.ai > Plugins; a project has no Plugins tab). Per the official doc a cloud thread loads the repo's `CLAUDE.md`, `.claude/CLAUDE.md`, root `.claude/rules/`, skills, agents and commands (with exceptions), but runs no repo hooks and loads no `.mcp.json` servers. Whether a plugin's hooks run is not documented and not tested |
| Coordinator (project chat) | a cloud session | no. It gets the project instructions (Project settings > Memory, 16,000 characters) and nothing from this machine |

What a cloud thread needs without the plugin comes from the repo: `.claude/rules/devops.md` (`scripts/cloud-rules.js`; a new repo gets it with project setup, an established one with its next ship) and the rules do-learn stores under `.claude/rules/` (`skills/do-learn/deep-knowledge/routing-details.md`).

## Local threads first

Where a thread runs is the coordinator's choice, and the coordinator loads no plugin, so nothing on this machine can force it. The plugin works the three places it does reach, none of them with a device name or path:

- **Coordinator:** the `local-first` block of the project instructions text (`project-instructions-snippet.md`, § Where threads run below) says "work locally first": start each thread with "Work locally" on an online device whose connected folder holds the project's repository, looked up each time; the cloud only when no such device is online or the person asks for it. It replaces a per-project instruction that names a fixed PC and folder.
- **Cloud thread:** the managed `.claude/rules/devops.md` (§ Where a thread runs) loads with or without the plugin; with `CLAUDE_CODE_REMOTE=true` and a wake prompt the thread says in its first reply that it runs in the cloud and asks the coordinator to start the next threads locally, then does the work. The request is skipped when the project instructions say that threads start in the cloud or that the coordinator asks each time.
- **Local thread:** the first-wake setup hint names the "Where threads run" block, and a once-per-project check asks the thread to look for the current block in its instructions.

Not covered: a cloud thread cannot tell whether a device with the repo is online, and it does not move itself; the coordinator decides the next thread. A lagging cloud copy of the plugin is caught on this machine (`hooks/lib/cloud-update.js`), not in the cloud.

## Where threads run

The person wants local first: a thread on the computer (through Remote Control, also when the request comes from the phone), the cloud only when the computer cannot be reached. Official per-project setting: Project settings > Environment > "Your computer" (Off / On / On with worktrees), with the folders Claude may use without asking, one of them the default. It makes local threads possible. It does not say where a start goes.

The setting `threadLocation` (devops-config, machine-wide: `threadLocation.default`, plus `threadLocation.projects` with entries `chan_<id>=<value>`) says what the project's instructions ask of the coordinator. Code: `hooks/lib/thread-location.js`, `scripts/thread-location.js` (`list`, `set <value> [--project <id>]`, `block [--project <id>]`, `name <id> <name>`), the Home row devops Home > Einstellungen > „Thread-Ort“ (dropdown, per-project exceptions, copy button). The wake envelope carries only the project id, so the Home row shows a name from `~/.claude/devops-thread-seen.json` (`projectNames`): the folder of the project's first local thread in a git repository (a parent folder that holds several projects names nothing), recorded once by `prompt.thread.notices`, or the name given with `name`. Without either it shows the shortened id.

| Value | What the block asks |
|---|---|
| `local-first` (default) | every thread with "Work locally" on an online device whose connected folder holds the project's repo, looked up each time, never from a saved path; a cloud thread only when no such device is online or the person asks, said in one line in the project chat; another start failure is reported, no switch; lost contact: report and wait; "in the cloud" for a task is a temporary exception that changes no setting |
| `local-only` | like `local-first`, but never a cloud thread by itself: unreachable computer means tell and wait |
| `cloud-first` | no block. A block still in the instructions should be removed |
| `ask` | one question before every start (computer or cloud); a cloud thread says so in its first line |

The three blocks are fenced blocks in `project-instructions-snippet.md`, each starting with the marker line `Where threads run (devops <value>, v<N>)` (`BLOCK_VERSION` in `thread-location.js`). `block` prints the one for the value in effect. The person pastes it into Project settings > Memory > Project instructions, or asks Claude to add it.

Two notes follow from it. A cloud thread says in its first reply that it runs in the cloud and asks the coordinator for local threads (§ Local threads first above). A local thread checks once per project and block version that its instructions carry the current marker line (table above): a working rule for the thread's model, not a check by code.

Limits, not to be claimed away:

- The order is a request to the coordinator. No setting enforces it, and whether the coordinator follows the wording is untested.
- Whether the coordinator knows before a start that the computer is on is not documented.
- A local thread runs only while the computer is awake with Remote Control on, needs Claude Code v2.1.280 or newer, and is unavailable while "Require trusted devices" is on. A local thread does not load the project's memory files.
- The plugin cannot read the project instructions, so the outdated-block hint is only as good as the model's look into its own context.

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
- **Rights of a colleague** (origin `coordinator` or `thread`): work and an alpha ship. A promote to beta or stable, an archive, a force-push and a destructive delete need the person's own message in the thread or a typed prompt. Enforced, not advised: `pre.thread.rights` denies the `ship_promote` tool, a channel-tag push (also `--tags`, `--follow-tags`, `--mirror` and a glob refspec under `refs/tags/`), `gh release create`, force pushes and destructive deletes (`hooks/lib/thread-rights.js`), `pre.session.archive` denies the archive; `ship-intent.js` `limitToAlpha` only words the ship order. One decision for all of them, `project-thread.js` `turnRights`: a machine turn (task notification) inherits the origin of the prompt it continues, a subagent that of its parent turn, and a prompt that cannot be read counts as a colleague in a marked thread (fail closed). The guard is registered `onFailure: block` (a crash or timeout holds the call back) and its command filter is case-insensitive, as PowerShell is. The command scan is syntactic: a configured git alias or a `$VAR` command name is not seen.
- **The person's attached word is the person's.** A relay that carries the person's own message as `<cited author="user">` (the claude.ai server copies it there; its own thread prompt says a cited entry can approve a step that cannot be undone) gets person rights in `turnRights` (`citedPersonWords`): the person answers once, in the project chat, and is never asked to repeat it in the thread. A `<cited>` tag inside the coordinator's `<note>` is the coordinator's text and does not count. The relay stays origin `coordinator` for every user-word gate (batch, frustration, card affirmation). A retold answer ("Jerry said yes") stays a colleague's word: the thread then asks the coordinator to attach the person's message by its id instead of asking the person to type it again. The coordinator learns to attach from `project-instructions-snippet.md`.
- **"devops learn" from the project chat runs do-learn in a thread.** The coordinator has no repo and loads no skill, so a learning it only writes to project memory never reaches the plugin or a repo's instructions. The snippet asks it to start a thread in the repo the learning is about, with the person's message attached, that runs `/do-learn`; such a relay is a do-learn order like a typed one.
- **Main guard on the target repo.** `pre.main.guard` checks the repo each git write acts on (`git -C`, `cd … &&`, `pushd`/`popd`, `Set-Location`, `GIT_DIR` / `GIT_WORK_TREE`, `--git-dir` / `--work-tree`), so a session started in a non-repo folder cannot commit on `main` of a repo below it. A directory that does not exist falls back to the session's folder. A pure fast-forward of `main` to its remote (`merge --ff-only <remote>/main`, where `<remote>` must be a configured remote of that repo, or `refs/remotes/<remote>/main`; `pull --ff-only`) passes, a git write behind a shell keyword (`then`, `do`, `else`, `!`, `time`) or inside a backtick or `$( … )` substitution is judged like any other, a write no segment accounts for is also checked against the session's folder, and a ship sentinel covers the other worktrees of the same repository.
- **A session is a thread only by a whole envelope.** The sticky marker is set when the whole prompt is one `<wake>…</wake>` envelope or a `mcp__hearthbot__*` tool is called; an envelope pasted into a typed prompt marks nothing.
- **No state in a non-repo start folder.** Runtime state of a session whose folder is no work tree goes to `~/.claude/devops-state/` (`project-root.js` `stateClaudeDir`); the SHIP and desktop-test nudges stay silent for an edit in no git repo.
- **A `/send-to-project` turn owes no completion card** (`post.flow.completion`, `card-guard.js` `sendToProjectOnlyTurn`).
- `prompt.flow.title-work` gives no Desktop title instruction in a thread, `post.flow.completion` no Desktop card contract, and `stop.flow.guard` never blocks there (a thread without the feature is `quiet`).

## With the feature (`on`)

| Moment | What happens |
|---|---|
| A wake starts work | `prompt.flow.title-work` names one `rename_thread` call: `⏳ ➜ 🤖 <thread title>` (a ship order in the person's words: `⏳ ➜ 🚀`). First wake: the model prefixes the title it sees; later the hook knows the title from the transcript's last `rename_thread` and names it exactly |
| First prompt of the thread | the session-start notices (versions, budget login, orphan / backup / MCP / team lines, usage drift) never reach the model there: the dispatcher keeps every "show the user this … verbatim" piece of SessionStart in a per-session hold (`hooks/lib/thread-notice-hold.js`) and releases it at the next prompt only when that prompt is typed; a whole wake envelope or a marked thread empties it, and a SessionStart inside a marked thread (resume, compact) drops the pieces at once. Held: ss.project.setup (version notice, usage drift), ss.plugin.update, ss.backup.stale, ss.orphan.nudge, ss.mods.load, ss.catalog.remote, ss.mcp.verify, ss.mcp.envcheck, ss.ship.verify, ss.team.changelog. A thread session started before this change (no hold marker) still gets the one request not to post them (`prompt.thread.notices`) |
| A project's instructions lack the current devops text (`devops text (v<N>)`) or "Where threads run" block | the person copies nothing: the thread runs `scripts/thread-location.js request --project <id>` and sends that message, with the exact blocks, to the coordinator (`send_message` to `@parent`, or `message_coordinator`), which writes them into the project instructions itself and answers in the thread; the thread's first reply says so in one line. The hints below are the fallback when no coordinator route works. Once per project and stamp (`<value>@v<block>+t<text>`, `lib/thread-location.js` `stamp`), so a new text version asks again. Not observed live yet: that the coordinator can write its own project instructions |
| First wake of a thread in a project this machine has not hinted yet | one block (after the request above): append a short note to the first reply (in the person's language) that some entries are probably missing, which the plugin cannot verify: (1) devops is enabled once for the claude.ai account under Plugins, not per project, (2) Project settings > Memory > Project instructions: the devops text and the "Where threads run" block, (3) Environment > "Your computer" on for local threads. "Show the text" makes the thread post the FIRST fenced block of `project-instructions-snippet.md` (devops text) and the output of `scripts/thread-location.js block --project <id>` (location block for the value in effect there). Once per `chan_…` id (`~/.claude/devops-thread-seen.json`, `projects`), recorded when the block is emitted; not in a cloud container (`CLAUDE_CODE_REMOTE=true`, its state does not persist). A cloud thread WITHOUT the plugin gets the equivalent one line from the managed rules text (`scripts/cloud-rules.js`, `.claude/rules/devops.md`): only when no `devops:` skill is loaded and the prompt is a thread |
| First wake of a local thread, once per project and block version or value | one context block asks the model to look in its own context (a local thread starts with the project instructions) for the marker line `Where threads run (devops <value>, v<N>)`. Present: nothing. Missing, another value or an older version: one short hint (de + en) with the offer "show the text" (the thread then posts the script's output). `cloud-first`: the reverse, a hint only when such a block is still there. Recorded in `devops-thread-seen.json` → `blockChecked` (id → `<value>@v<N>`) when the block is emitted. A project that gets the setup hint in the same prompt gets that one note only |
| A repo must change and the start folder is not its own worktree | the branch guards name a worktree per repo and thread: `git -C <repo> worktree add <repo>/.claude/worktrees/thread-<id8> -b claude/thread-<id8>-<slug>`, work by absolute path. Two threads in one folder, several folders and several repos per thread each get their own; no shared checkout is switched |
| A skill wants to ask | `AskUserQuestion` is refused with the exact instruction: a single-choice question goes on the clickable `request_decision` card when the thread session offers that tool (not every one does); otherwise, and for multi-select questions, post the question as a numbered reply (`1. … a) …`), rename the thread to `👉 ➜ ❓ …`; the person's next message is the answer. A do-run arms its run contract from that reply (`hooks/lib/run-contract-thread.js`) |
| A subagent's tool call waits on a permission | `👉` on the thread title via `rename_thread`, back to `⏳` when answered. A permission the thread's own call waits on cannot be shown: the model is blocked until the answer |
| `start_session` | refused (`pre.thread.session`): report the split to the coordinator. Subagents are allowed |
| Budget class other than `free` | never asked; *spare the window* applies unasked (`agent-proactivity-details.md` § Thread) |
| First tool call | the card contract plus one line: the card is the result reply |
| Checklist with every step done | one "card now" line |
| `render_completion_card` (tool or `--render-card`) | the visual card the Desktop draws (the same CDN template, `lib/card-widget.js` `threadCardWidget`), to be posted with ONE `post_widget` (`show_widget`, title `completion_card_body`, `text` = the `✨✨✨ <title> ✨✨✨ · <heading>` line previews and the project chat show); the full markdown rides along and is posted with `post_message` only when `post_widget` is missing or refused. Plus the exact `rename_thread` to the outcome head (`👉 ➜ 📦 …`). No `mcp__visualize__show_widget`, no `wrap_up`, no archive |
| The card is posted | one status line to the coordinator (`SendMessage`, address from the newest coordinator relay in the transcript; skipped silently when unknown or refused), then "turn over": only `set_thread_resolved` may follow |
| A reply without the card while the title says ⏳ | once per prompt: the exact rename that takes the head off, for a turn that ends there |
| A concept page | published as an artifact, link posted in the thread and opened in Edge on a local thread (`concept-open.js open-url`); decisions and the action (`iterate`, `implement`) come back through the artifact's `db` store: one document per submit, one draft per page load, live sync between several people, a record under `.claude/concepts/<slug>/artifact.json` that `ss.concept.resume` names on every session start, and a backed-off read-back check (`skills/auto-concept/deep-knowledge/artifact-fallback.md` § Read back, § Wake) |

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

- Notices that persist a "shown once" state before the model saw them are lost for the Desktop when a thread swallows them: the 6 h update cooldown of ss.plugin.update, the monthly usage-drift marker, the orphan nudge stamp, the ss.mods.load seen list, the team changelog timestamp, the ship-verify acknowledged flag. They only matter for a session that is a thread; a typed session releases them.
- The setup offer of ss.project.setup (`[ss.project.setup] New repository …`) and the cloud-update block are instructions, not "show the user" lines, and are not held.
- The project hint cannot tell whether the entries really are missing; it is a one-time prompt per machine and project, so a second machine hints again.
- Batch mode, the approval-wait of the thread's own tool call and the ship-skill title steps still name `set_session_title` in a thread. They rename the local session only, which is harmless and invisible.
- The card widget in a thread: the project chat and notifications see only its one `text` line (title + heading); the points and the answer stay in the thread, and the coordinator status line carries the outcome. Whether the widget's buttons (`sendPrompt` / `ui/message`) reach the thread is not observed live yet: the person may have to type the answer.
- The project chat: a card or a devops title there needs the coordinator to cooperate, which only project instructions can ask for.
- Attaching the person's answer and routing "devops learn" to a thread need the coordinator too: the snippet asks, nothing enforces it. The thread's own approval rule ("approval comes only from the person …") is claude.ai's system prompt, which no plugin can change; the plugin only stops adding a second gate on top of an attached message.
- Not observed live yet: the coordinator address form (`bridge:cse_<id>`), the artifact read-back from a thread, a full ship from a cloud thread, the claude.ai update click. `%TEMP%\dotclaude-mcp-heartbeats\liveness.log` records when a thread's MCP server is not attributed to its session.

## Testing

`hooks/lib/project-thread.test.js`, `hooks/lib/thread-notice-hold.test.js` (the hold, the release and the project hint), `hooks/lib/prompt-intake.test.js`, `hooks/lib/title-plan.thread.test.js`, `hooks/lib/thread-channel.test.js`, `hooks/lib/thread-rights-hard.test.js`, `hooks/pre-tool-use/main-guard.target.test.js`, and `hooks/lib/project-thread.e2e.test.js` (one thread turn through the real hook scripts and the offline renderer: feature on, feature off, and an unchanged Desktop session). Live: start a thread with "Work locally" in a project, give it a task with a file change, and check the thread list (head on the title while it works, outcome head after) and the thread's last reply (the card).

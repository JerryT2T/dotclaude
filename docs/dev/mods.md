# Claude Code mods in devops (developer guide)

Not shipped: the marketplace ships `./plugins/devops` only, so this file never
reaches a consumer. Decided in a three-round concept (2026-11-10/11, page
discarded at close-out); every decision and its why is recorded below.

A **mod** is a Claude Code plugin hooks module: `hooks/hooks.json` names a
TypeScript/JavaScript module under `modules`, which exports
`register(on, options)` and runs in-process with the engine interface `$`
(panes, bands, status line, toasts, prompt and tool-call hooks, side
completions, timers, store). Classic command hooks talk to the model only
through text; a mod reaches the UI and the engine directly.

## Ground rule: quality and determinism first

The owner's standing condition for this work: **mods must not lower the
quality or the determinism of the plugin.** Everything below follows from it.

- The plugin works fully **without** the mod. Classic hooks, guards, skills and
  the MCP servers stay the source of truth and keep running unchanged.
- A mod that fails is skipped silently by the engine, Anthropic can switch
  mods off remotely, and the Desktop consent path still has open bugs (below).
  So no mod is ever a required dependency.
- No model-generated text replaces exact content (prompts, pastes, tool output).
- `stop.flow.guard` stays the only authority on the completion card.

## Stages

| Stage | Content | Gate |
|---|---|---|
| 0 | This document | — |
| 1 | **Display-only mods**, module inside the devops plugin, alpha-gated: agent pane, budget + context band, toast (and sound where an asset ships cleanly) on a waiting permission / finished run, ship/CI pane, branch-hygiene status with a cleanup button, notice toasts **in addition to** the hook text | `claude-mods` feature, `minChannel: alpha` |
| 2 | Five spikes, in this order: 1 fork cache hit, 2 Desktop load (#105936), 3 title writer, 4 concept wake, 5 branch side-session button | Spike 1 ships with stage 1; 2–5 are issues |
| 3 | Mods with control effect, each only after its spike passes: cache keep-alive, session titles, concept timers, return recap, deterministic paste / tool-output redirect | One spike per item |

Tracked in milestone 1 "[New] Claude Mods": #1100 Desktop load (spike 2),
#1101 cache keep-alive + payoff check, #1102 titles (spike 3), #1103 concept
timers (spike 4), #1104 branch cleanup side session (spike 5), #1105 return
recap, #1106 deterministic paste / tool-output redirect.

Stage 1 changes no hook, guard or skill output; the diff under
`plugins/devops/hooks/` is the generated `modules` entry in `hooks.json` plus
the generator change.

## Decisions (with the why)

| Topic | Decision | Why |
|---|---|---|
| Packaging | Module **inside** the devops plugin (one `hooks.json` holds `hooks` and `modules`) | The docs allow both keys; a separate companion plugin could run a different version than the hooks after a marketplace update |
| Channel | `alpha` only, via `features.json` | A silently failing mod must not reach beta or stable users |
| Guard fast path | **Dropped** | The dispatcher runs every module even after a block for bookkeeping (`hooks/dispatch/dispatch.js`); the gain was milliseconds |
| Completion card | Stays with `stop.flow.guard` | The guard is a quality gate (validation owed, undeclared background work, wrong claims), not just a renderer |
| Card band (2026-11-15) | The band **mirrors** the card's template part (title, time, heading, ≤ 3 points, buttons) copied from `render_completion_card`'s own result (`#dc-card-data` on Desktop, the markdown heading on the terminal); the `answer` stays inline only | The band reaches only terminal + Desktop (no VS Code, mobile, web/cloud), so the transcript card stays the source; copying keeps the guard's authority, rebuilding would not |
| Card buttons in the band | A press sends the card's own button prompt with `$.prompt.submit({ asUser: true })` and removes the card from the band (one press = one prompt) | Native button, one click; the card from the press's turn is spent |
| Working state | `AbovePrompt.isWorking` → the ⏳ emoji of the card, turning continuously (one full turn per 8 s, SMIL in an interactive `Svg`; terminal: ⏳ text) + running step (`update_plan` / `TodoWrite`, `n/m · text`) + the tool running now (`Bash · description`); no card while working; the rail shows the context ring only | The app's spinner row says only the current step word; the plan position is what the person asks for; a constant, slow turn says "something is happening" |
| Interactive `Svg` size | Every `Svg` with `isInteractive` gets explicit `width` / `height` | The sandboxed frame takes no size from the markup: without it the band drew ~150 px of empty space |
| Band layout (concept 20261115-1417-band-redesign, r2-d2) | With a card (Desktop): left the card part, a divider (`Box width=1`), right a 30-cell status rail (ring, Compact, cleanup — nothing else: #1170 moved the usage bars out of it into a row under the zones, the 34-cell bars column beside the ring had halved the card column and clipped its last button); the time sits in a `position: absolute` box at the band's top-right corner. The terminal has no columns: the same parts in one column, unchanged. **Type scale**: the API's `Text` has `size` names (caption/footnote/body/heading/title) and `weight` but no pixel values, so the card title, heading and time are drawn as `Svg` images with `<text>` at exactly 16 px / 500, 16 px / 500 and 12 px tabular-nums in the card's font stack (`cardTextSvg`, `format.ts`), primary / secondary colours switched by `prefers-color-scheme`; the width is an *estimate* (`estimateTextWidth`, the engine cannot measure text, `Svg` takes pixel `width`/`height` only) and text wider than 560 px falls back to `Text size=heading` so it wraps instead of clipping. Points stay `Text size=body` (dimmed) with a violet `›`. **Compact button**: the same native `Button` as "Aufräumen" (label only, default variant) — the earlier amber `Text`-child pill drew square and in another font (round-4 review); the amber ring carries the urgency | Card look as close as the mod API allows. **Remaining gaps**: image text is not selectable, ignores the app's theme tokens (colours are fixed, light/dark by the frame's colour scheme, which may differ from the app theme), and its width is an estimate; `Text size` names stay mapped by name only for the points; the divider / absolute time box and all of the above are unverified on a real Desktop screen (the engine test harness has no renderer) |
| Context ring | Percent = tokens ÷ the effective auto-compact threshold (100 % = the session compacts now), from the measured `context.window` / `tokens`, never a model constant: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` and the user's own window (`autoCompactWindow` / `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, process env over settings `env`) lower it, the default keeps a 13 000-token summary buffer (min. 10 % of the window) | Robust to Anthropic changing window sizes; honours the user's own limit |
| Compact gating | Ring amber + a "Kompaktieren" button from 80 % only while work is open: `.claude/concept-active.json`, unshipped changes (dirty tree or commits ahead of the default branch) or open plan steps; after a card with a 🟩 heading (shipped / released / finished) it stays grey without a button until a new Edit/Write/NotebookEdit or a plan with open steps (a squash-merged branch stays "ahead" of main forever); an open concept page always counts; never a button while working. The button calls `$.session.compact()` (`$.prompt.submit` refuses a `/` text; `$.command.run` is not needed) | Compacting right after a ship burns tokens for nothing |
| Cleanup visibility | Block shows when (a) inactive unmerged work exists: report `atRisk` entry with state unlanded/partial or dirty, `live !== true`, `idleDays` ≥ 1 (missing = inactive); or (b) open + landed leftovers > `cleanup.nudgeThreshold` (default 50, project `<main>/.claude/devops-config.json` over `~/.claude/devops-config.json`). Collapsed by default to `🧹 N Altlasten ▸` + button; ▸ opens the breakdown (agent worktrees · safety copies · branches · broken worktrees) and the rule line; state per session. "N" is the status line's / nudge's number | Same counting source as the nudge; the old age/count mechanism stays the rule |
| Cross-session cleanup | Starting a plan writes `~/.claude/devops-cleanup-run.json` (repo, session, start); other sessions hide the block for that repo until the orphan report is newer than the run's end, or 2 h after the start; a second plan for the repo is refused with a toast | One run per repo machine-wide; no double click from a parallel session |
| Learn offer | A finished run appends its inactive-unmerged counts per cause to `~/.claude/devops-cleanup-history.json`; the same cause with ≥ 3 leftovers in 2 runs offers `devops learn` (Cleanup pane + toast; a press submits the prompt naming the cause). Merged leftovers and age/count removals never reach the history | Unmerged work left behind repeatedly is a workflow bug; merged piles are expected |
| Hint cards | A mode-activation card (batch `👉 📚 Batch` only; the test card's steps are its CTA and stay open) shows its heading plus a round `?` icon (`helpSvg`); on a pointer surface (Desktop, editor) hovering it overlays the points as an opaque absolute card (`Box display none` + `hover { display: flex }` inside the keyed `hints` Box — the engine refuses a reveal scoped to a hidden keyed Box), nothing moves; touch and the terminal keep a press toggle, collapsed by default, per session. Unverified on a real Desktop: whether the overlay is clipped by the band's bottom edge. Decision, ship and concept cards keep their CTA points open | The hints are not decisions; they cost vertical space |
| Status element (concept 20261115-2350-devops-status, 2026-11-16) | The plugin's state sits **under the prompt** as `● devops`: a `ui.render` hook on `PromptHint` draws the engine's own hint first (`await next(e)` in the tree) and a plain `Button` beside it, dot green (`#7bc98f`) or red (`#e07a7a`). The terminal keeps the engine's line and gets the same words as the hint's `tail`. The status line (`$.ui.status`) no longer names the hygiene count: it carries the same state as text (`🟢 active`) only until the line under the prompt was drawn once in the session, then it is cleared | `$.ui.status` takes one plain string: no colour, no press. `PromptHint` is the one site under the prompt that takes a tree. The owner wanted the dot on "devops" under the input field and no chip in the band. **Unverified on a real Desktop**: where the app draws the hint line relative to the status line, and whether it draws it while its own hint is empty; if it does not, the status line text stays as the fallback and `/devops` opens the card |
| Not active | Red only when the plugin's hooks do not run or its MCP server is not connected. Hooks: after every main tool call the mod stats `~/.claude/devops-hook-telemetry.jsonl`; once one record as new as its call was seen in the session, 5 calls in a row without one = not running, and one fresh record clears it. Without that first proof a stale file says nothing (`DEVOPS_HOOK_TELEMETRY=off`, an unwritable file), so hooks that never ran in the session are not detected. MCP: `$.mcp.connect('dotclaude')` at session start, when the card opens, at a turn's start at most every 5 min, and after every tool call while the dot is red; `unlisted` (the session does not know that name) and a call that cannot answer change nothing. Both start as active | The owner's rule: no other trigger (no hook time limits, credit, delegation, cloud version). Unknown is never "not active"; a false red is worse than a missed one (independent check, 2026-11-16). **Unverified against the real engine**: that `'dotclaude'` is the name `$.mcp.connect` knows the server by (the tests stub the call) |
| Last benefit | After every main tool call the mod stats `~/.claude/devops-savings.jsonl`; a `narrowed` (token guard) or `delegated` (local-llm) row newer than the last one seen **and written during that call** (an older line, or one another session wrote, found late is noted and never announced) reads beside the dot for 90 s, short and a little cheeky ("Zack: bis zu 78 k Tokens gespart, Suche eingegrenzt."), two wordings picked by the event's own time. What the log held at session start is never announced. A `blocked` row is no benefit yet: the identical call may still go ahead | The owner asked for the last benefit named clearly, almost like an ad. Only observed benefits qualify, so the line never claims a saving that a retry undid |
| Info card | A press on `● devops` (or `/devops`) toggles a card as the band's first row, left-aligned, right above the prompt. Read once per opening, from local files only, no model call, no prompt, no write: headline = estimated net tokens of 7 days (`blocked` − `released`, never below 0, labelled "estimate · net"); rows only when their log has data: searches narrowed (measured upper bound, whole log), branches shipped + test runs reused (`ship-timings.jsonl`), API credit used instead of the plan (only with runs), guard interventions and the hooks' own output in tokens (`devops-hook-telemetry-daily.json`, characters ÷ 4, dispatcher rows left out). A file over the engine's 4 MiB read limit drops its row. `/devops` answers one short line, since a command's output can enter the conversation | The owner: estimates are fine, it is about dimensions; the API credit is usually off, so it is no headline. The own consumption stays next to the saving: in the week of the concept it was larger than the guard's net estimate (≈ 905 k against ≈ 541 k tokens) |
| Locales | One string table in `format.ts` (en, de, es, fr, pt, ja, zh) for the band, status line, toasts and Cleanup pane, picked from the Claude Code `language` setting (project/local/user settings), English otherwise | The band speaks the user's language |
| Notices | Toast **plus** the existing hook text | The hook text is also what the model reads (restart hint, MCP stale sentinel) |
| Budget | One source: `session.measure` rate limits, written (if at all) into the same `usage-live.json` `lib/budget.js` reads | Two sources would let the band and the delegation policy disagree |
| Long prompts | Original stays verbatim; a Haiku lint may only ask 1–3 clarifying questions, advisory, never on machine turns | Shortening a 3k prompt saves ≈ 1.6 % of a 200-step session and drops hedges and negations |
| Large pastes / tool output | Deterministic head + tail + file path, never Haiku; never for `/do-run`, `AUTOSTART`, `<command-name>` prompts; test, git and CI output exempt. Decision + excerpt in `hooks/lib/paste-redirect.js` (6a); the mod's `prompt.submit` rewrites a ≥ 8k-token typed paste via `next({...e, text})` (6b) and its `tool.call` hook replaces a ≥ 8k-token Bash stdout after `await next(e)` (6c), both through the one writer `scripts/paste-redirect-write.js` (original byte-exact under `.claude/redirects/`, read back before the excerpt is used). One decision path with `pre.tokens.guard`: a call the guard released on an identical retry is marked (`lib/token-guard-release.js`) and its output stays whole. At the harness default `BASH_MAX_OUTPUT_LENGTH` (30 000 chars ≈ 7.5k tokens) 6c cannot trigger — the same cap that keeps the guard's Bash branch silent; it acts once a user raises the limit | `ss.run.task` and `prompt.run.contract` read the prompt text; an excerpt can hide the failing test |
| Branch cleanup button | Starts an **Opus subagent** via `$.agent.spawn` (no session, no main-context cost, works over Remote Control): it plans read-only, the plan shows in the `devops-cleanup` pane with a toast, and only the pane's **Apply plan** button starts a second Opus subagent that executes exactly that plan (re-checking each action) | No mod API starts a session, and `start_session` is refused over Remote Control; `$.agent.spawn` takes a model but no effort, so the run uses the model's default effort |
| Return recap | Warm cache: one `$.model.fork`; cold: the last completion card, no model call | A cold fork costs a full cache write |
| Cache keep-alive (stage 3) | Adaptive, conservative start: 2 h cap, at most 2 sessions machine-wide, never opens a new 5-h window, cancels on any input, disables itself after the first ping that reads < 95 % from cache, every ping logged | See the math below; the owner asked for a conservative start |
| Payoff check | Scheduled task after 30 measured pauses, at the latest after 14 days: hit rate, plan usage per ping vs. saved cold starts, real return rate → continue / raise to 8 h / switch off, reported to the plugin developer | The owner wants proof the keep-alive pays off |

## Cache keep-alive math

Prices (Opus 5.5, platform.claude.com pricing, 2026-11): input $4/MTok,
1-h cache write 2× ($8), cache read **0.05×** ($0.20). A cache hit refreshes
the entry at no extra cost (prompt-caching docs).

For a cached prefix of P tokens:

- cold return after the entry lapsed: write `2 P`
- warm return: read `0.05 P`
- one ping per ~55 min while idle: `0.05 P` per hour

Keeping a pause of H hours warm pays off when the probability of returning
within H exceeds **H / 39** (`0.05 H / 1.95`): 3 % for 1 h, 8 % for 3 h, 21 %
for 8 h, 31 % for 12 h. A forgotten pause costs at most `2.5 %` of one cold
start per hour (20 % for 8 h). With a 5-minute TTL (Claude Code drops to it in
usage overage) a pause needs ~13 pings per hour and never pays off → the mod
pings only while the 1-h TTL is active.

Unknown: how cache reads weigh against the subscription limits. One public
measurement (single account) put a cached token at ≈ 1/67 of a new one; a bug
report claims the opposite. Hence the per-ping log and the self-disable rule.

## Stability evidence (2026-11-10)

- Mods shipped in 2.1.287 on 2026-10-01. The docs carry no "experimental"
  label; the claude.dev tutorial says the API can change between releases.
  Version gates at .289 … .318, all additive so far.
- Issues: #105936 (Desktop Code tab: "Turn them on" → mod never loads; the same
  mod loads in a terminal with `--plugin-dir`), #102330 (Windows: consent
  question loops), #100083 (a fork cache miss under a specific condition).
- Failing hooks are skipped silently (debug log only); hook time limit 10 s.
- Anthropic can disable installed mods remotely.
- Version skew on the dev machine: Desktop engine 2.1.321, `claude` CLI 2.1.302.

| Surface | Hooks | Drawing |
|---|---|---|
| CLI | yes | yes |
| Desktop Code tab | yes | yes (terminal-only elements excluded) |
| Desktop WSL session | no | no |
| VS Code | yes | extension ≥ 2.1.299 |
| `claude -p`, Agent SDK | yes | no |
| Cloud session | only if the plugin reaches it | no |

## Red-team findings and how they are handled

| # | Finding | Handling |
|---|---|---|
| 1 | Haiku paste rewrite loses exact content, `ss.run.task` would restore the excerpt | Dropped; deterministic head/tail + path, exemptions above |
| 2 | Card from engine state would remove the stop-guard gate | Card stays with `stop.flow.guard` |
| 3 | A stand-down marker can race or go stale at SessionStart | Not used in stage 1 (no stand-down); stage 3 keys it by session id with a heartbeat and the devops version, default "hooks run" |
| 4 | A ping might not hit the cache | Spike 1; never pass `effort` to `$.model.fork`; self-disable after the first miss |
| 5 | Two writers for the session title | Spike 3 before any title work |
| 6 | Guard fast path skips dispatcher bookkeeping | Dropped |
| 7 | Tool-output rewrite can hide the failing test | Deterministic only, test/git/CI exempt |
| 8 | Night pings open a 5-h window, many open sessions ping | Machine-wide cap, never open a new window, cancel on input |
| 9 | Two budget sources | One source (above) |
| 10 | Toast loses the model-visible notice | Toast is additive |
| 11 | Version skew between plugins | Module lives inside the devops plugin |
| 12 | Reload resets module variables | Timers and due times in `$.state`, idempotent scheduling |
| 13 | Concept watchers wake Claude by exiting | Spike 4 (`$.prompt.submit`) |
| 14 | Prompt lint clashes with headless runs | Advisory only, skipped on machine turns |
| 15 | vitest does not pick up mod tests | `claude plugin test` via an npm script |

## Spike 1 — fork cache hit

Command `/mods-spike-fork` (alpha only). It runs one `$.model.fork` with the
prompt `Reply with the single word: ok` and **no** `effort`, prints a one-line
summary and appends a row to `~/.claude/devops-mods-spike.jsonl` (capped at
500 rows): `ts`, `ms`, `isAnswered`, `reason`, `cache_read_input_tokens`,
`cache_creation_input_tokens`, `input_tokens`, `output_tokens`,
`context_tokens`, `cache_read_share`, `five_hour_before/after`,
`weekly_before/after`.

How to run: on an alpha-pinned machine, run any turn, wait about 50 minutes
without input, then run `/mods-spike-fork`. **Passive (no command, no model call):** the mod arms a main turn that starts ≥ 50 min after the last one ended (`turn.start`), reads the usage of that turn's first request from `turn.step` (passed through unchanged) and appends a row with `mode: "passive"`, `pause_min`, the cache fields, `cache_read_share` = read / (read + write + uncached input) and `pass`. **Pass:** `cache_read_share`
≥ 0.95 and the 5-h / weekly before/after difference about 0. A fail blocks
#1101.

## Spike results (run by Claude, 2026-11-17)

Run autonomously in one Desktop Code-tab session (bypass mode) and once in the
CLI — no step by the owner. Engine: Desktop **2.1.325** (`AI_AGENT=claude-code_2-1-325`,
SDK 0.3.325), CLI **2.1.302**; Windows 11 Home 10.0.26300. Probe: a throwaway dev
mod `spike-wake` (`$.clock.after` → optional `$.model.fork` → `$.prompt.submit`,
every step appended to a JSONL log); raw logs in the session-group notes
(`mods-spikes/`), not in the repo.

| Spike | Result | Evidence |
|---|---|---|
| 2 Desktop load (#1100, anthropics/claude-code#105936) | **Pass — not reproduced on 2.1.325.** The installed devops module loaded at this session's start: its row is in `~/.claude/devops-mods-loaded.json` (`sid b6ca49a2…`, 23:20:33Z); the marker file holds 30 Desktop sessions of 2026-11-15/16 the same way. A dev mod written under the session's `dev-mods` folder in bypass mode turned mods on without a prompt; the engine's notice at the next turn: "mods … loaded: they load and reload by themselves as their files change". | Note: at `session.start` the Desktop engine reports `surface: null` and `isInteractive: false` (the surface attaches later), so those two marker fields cannot tell Desktop from headless. No workaround needed; nothing surfaced to alpha users |
| 3 Title writer (#1102) | **No mod-side title API.** The 2.1.325 types (24 261 lines) have no rename / title noun on `$` (`$.session` = messages, cwd, root, model, turns, id, repo, surfaces, usage, version, compact, send, append, authorize, identity, abort). `$.session.append` takes `user` / `system` text rows only, never a `custom-title` entry. The one title channel is `ClassicResult.sessionTitle` on `classic.UserPromptSubmit` / `classic.SessionStart` — the same `hookSpecificOutput.sessionTitle` command hooks already have, which `prompt.flow.title-work` uses since 0.9.0 and the app adopts only while its title is empty or app-generated | Part B rejected; Part A shipped (below) |
| 4 Timer wake (#1103) | **Pass, idle, both engines.** Desktop: armed at `turn.complete` 23:25:23.277Z, fired 23:26:53.274Z (90.0 s), `$.prompt.submit` resolved 0.8 s later with `origin {kind: plugin, name: spike-wake}`, and a new turn started. CLI (`claude -p --plugin-dir … --input-format stream-json`): armed 23:49:14.787Z, fired 30.0 s later, submit resolved in 1.2 s, the next `turn.start` carried the prompt. The model reads it wrapped as `The spike-wake plugin sent a message:\n<text>` (so a matcher must use `includes`, not `startsWith`); `turn.start`'s `origin` is null for it. `--max-turns` in `-p` drops the submit (`{drop: "the run reached its --max-turns limit"}`) | Busy case: see the row below |
| 4 busy | **Pass: held, then delivered.** Desktop: a timer armed at the wake turn's `turn.start` fired 20 s later (00:07:08.390Z) while that turn was still running; the submit waited and the engine started its turn 1.5 s after the running turn completed (`turn.start` 00:08:35.252Z), never in the middle of one | So a wake never interrupts work; it can arrive late by up to one turn |
| 1 Fork cache hit (#1101) | **Pass.** One `$.model.fork` (no `effort`; the result reports the session's `medium`) from a `$.clock.after` timer 55 min after the last main turn (armed 00:08:33.707Z, fired 01:03:33.708Z; the last main request ended ≈ 00:09, so ≈ 54 min idle): `cache_read_input_tokens` 428 533, `cache_creation_input_tokens` 0, `input_tokens` 16, `output_tokens` 42 → **read share 1.000** of a 428 488-token context, 3.4 s. Rate limits: the 7-day window read 29 % before and 30 % after (integer percent: one rounding step, not a measured cost); no 5-h reading was reported | Gate ≥ 95 % met → keep-alive may proceed (wiring, band and payoff check are follow-ups). The plan-usage cost of a cached read stays unmeasured at integer resolution — the reason for the per-ping log and the payoff check |

The probe's own JSONL log lost a row twice (two hooks appending within
milliseconds, read-modify-write); the devops spike log is the capped one-call
writer, so this is an artefact of the throwaway mod only.

**Watcher / mod handshake (#1103, designed on the passing idle spike; not built yet).**
`concept-watch.js` stays the source of truth and keeps running in every session.
A mod that wants to wake the session instead writes its stand-down beat
(`hooks/lib/mod-standdown.js`, job `concept-wake`, devops version, 90 s
heartbeat) while its `$.clock` due time for the page sits in `devops.wake`. The
watcher reads `hooksRun(sid, 'concept-wake', version)` before it exits to wake
Claude: a valid beat → it keeps watching and lets the mod's `prompt.submit` be
the wake; no beat, a stale one, another version → it exits as today. Either way
exactly one wake: the mod claims its due entry before it submits, the watcher
only exits when the mod is not there. A mod that unloads releases the job, so
the next watcher check takes over within one heartbeat.

## Stage 1 implementation

| Part | Where |
|---|---|
| Module | `plugins/devops/hooks/mods/index.tsx` (+ `gate.ts`, `format.ts`), listed in `hooks.json` as `"modules": ["./mods/index.tsx"]` |
| Adding modules | `hooks/dispatch/manifest.json`, then `node plugins/devops/hooks/dispatch/build-hooks-json.js` (hooks.json is generated) |
| State contract | `plugins/devops/types/index.d.ts` (`devops.agents`, `devops.budget`, `devops.hygiene`, `devops.ship`, `devops.shells`, … `devops.health`, `devops.echo`, `devops.info`), named in `plugin.json` `"types"`. `claude plugin validate plugins/devops` refuses a `$.state` key the contract does not name (it caught a missing `devops.settled`) |
| Status element + info card | `on('ui.render', { component: 'PromptHint' })` and the `devops-info` row of the band in `index.tsx`; the figures and texts are pure functions in `format.ts` (`benefitFrom`, `overheadFrom`, `apiFrom`, `shipsFrom`, `statusText`, `echoText`, `infoRows`) |
| Load marker | `session.start` writes the session (id, surface, interactive, time) into `~/.claude/devops-mods-loaded.json` (last 30). `hooks/session-start/ss.mods.load.js` keeps the sessions it saw in `~/.claude/devops-mods-seen.json` and, at the next startup / resume / clear (never on compact), shows one line once per session that ran ≥ 1 min without a marker — a silent load failure (#105936) becomes visible. Alpha-gated like the module |
| Gate | `hooks/mods/gate.ts` mirrors `features.js`: reads `features.json`, `~/.claude/plugins/.channels.json` and `installed_plugins.json` via `$.fs`, fails closed, cached per session. Closed gate → every hook passes through, no command is registered, nothing is drawn |
| Agent pane | `/devops-agents`, and opened once by itself at the session's first background subagent (closed, it stays closed): subagents with type, model, elapsed, status (`agent.spawn`, `classic.SubagentStop`, `$.agent.list()`). Live: a `$.clock.every` timer (5 s) bumps `devops.tick` while a subagent runs and stops itself after. Content-equal rows (status, type, model, description) merge into one with a `×n` column after the status, the latest run's elapsed |
| Budget band | The Wk / Fable / 5-h bars (card rules, only when due, always in this order), stacked in the rail left of the context ring after the divider (fixed column, so the divider never moves); Wk and 5-h from `session.measure`, the scoped Fable share from `usage-live.json` `scoped[]` (expired, stale or malformed reads give no bar); the context is the ring (see Band layout). Display only, writes nothing |
| Card band | Same band: while working the hourglass + step + tool (`devops.progress`, reset by a typed prompt's `turn.start`); after a card its template part with buttons (`devops.card`, spent by the next typed prompt or a press; only a typed prompt spends it: a textless continuation, the app's no-output nudge (meta turn with text), a `<task-notification>` and plugin-sent prompts keep it, `startsTypedTurn` in `format.ts`). Subagent tool calls and refused card calls never set it. Each CTA point shows at most 120 characters and the title 60, cut with `…` (the UI Text has no line clamp, so the clamp counts characters); the full text opens on hover (Desktop overlay) or behind a `▸` (terminal). A batch hint card's heading takes the live note count of `batchView()`, so the count shows once. The idle row keeps the batch chip left; the expanded 🧹 breakdown is its own right-aligned column of rail width |
| Band marker | While the band draws (`AbovePrompt` render, at most once per 60 s) the mod writes `~/.claude/devops-band-active.json`: `{"sessions": {"<sessionId>": {"at": <epoch ms>, "remoteControl": true\|false\|null}}}` (merged, entries older than 24 h dropped). A reader treats a session as having the band when its `at` is within 30 min. `remoteControl` is always `null`: the mod API names no Remote Control state, and the card tool treats null as "no Remote Control" (minimal widget: answer + heading); only `true` keeps the full card |
| Toasts | Waiting permission request (`classic.Notification`), subagents and background Bash runs that ran ≥ 120 s (Bash: start time per `tool_use_id` from `tool.call`, end from the `<task-notification>` that reaches `prompt.submit`; call and prompt pass through unchanged), and the hook lines Claude is asked to show verbatim (hook output passes through unchanged) — both formats: the line after a `[name] … verbatim` header (branch nudge, version notice) and a line followed by its `… verbatim, once.` instruction; once per session, never on a `compact` / `resume` SessionStart. Concept watchers (`concept-watch.js`, `concept-tick.js`, `concept-server.py`) toast only when they fail, at any length. No sound: no asset ships cleanly |
| Ship pane | `/devops-ship`: `.claude/.ship-checkpoint.json` of this branch plus one bounded `gh pr view` (8 s) on open or Refresh |
| Branch hygiene | Count from `~/.claude/orphan-report.json` (same rules as `ss.orphan.nudge.js`: open branches, dirty worktrees and undecided safety copies ≥ 3 days, `park-register` `isUndecided` mirrored; the session's own worktree left out) in the band (the status line no longer names it, see Status element); a report 24–72 h old adds "as of N h", older hides the line; the band's "Aufräumen" button runs the plan/apply subagents above, one run at a time machine-wide (see Cleanup visibility) |

| Archive button | A green card (`🟩` heading: shipped, released, finished analysis) adds "🗄 Archivieren" to the card's buttons while nothing runs (`archiveOffered`). The press calls the Desktop app's own `archive_session {session_id:"self"}` through `$.mcp.call('ccd_session_mgmt', …)` — no model turn. Probe 2026-11-17 (Desktop 2.1.325): a dev mod's `$.mcp.call('ccd_session_mgmt', 'get_session', {session_id:'self'})` answered with this session. The app keeps its guards (still working, pinned, busy side session) and answers `isError` with the reason → toast (`archiveRefusal`). The call is the mod's, not a tool call, so the shell gate `pre.session.archive` does not see it: the press is the person's own request, the same one that gate lets through for a prompt. Server unreachable (call throws) → "Archiviere diese Session." goes out as the person's prompt and the model archives under that gate. Side sessions follow the app's rule: finished ones and those sharing the worktree are archived with it |
| Paste / tool-output redirect (#1106) | `pasteMaybeRedirect` / `outputMaybeRedirect` / `parseRedirectOutput` in `format.ts` (cheap pre-filters, strict reading of the writer), `redirectText` in `index.tsx`; anything unconfirmed (refusal, timeout, garbage, closed gate) keeps the text whole |
| Return recap (#1105) | `classic.SessionStart` (not `compact` / `clear`) after a gap ≥ 15 min (`seconds_since_last_response`, else the last main turn's end): under 55 min one `$.model.fork` with `RECAP_PROMPT` and no `effort`; else, or when the fork fails, the last completion card's text (`devops.recap.card`, written when the card tool answers). Shown once as the band's first row with ✕; the next typed prompt spends it. Detached, so it never holds the start |
| Wake timers (#1103) | `/mods-spike-wake [minutes]`: due time in `devops.wake` (`scheduleWake` / `pendingWakes` / `claimWake`), re-armed at every `session.start` (a reload drops `$.clock` timers, `$.state` stays), claimed before the prompt goes, so it fires once; logged to the spike log as `mode: "wake"`. `concept-watch.js` is unchanged: the watcher/mod handshake is designed on this tested base |
| Keep-alive policy (#1101) | `keepalivePolicy` (every limit, first match wins), `breakEvenRate`, `readShare`, `disablesAfter` in `format.ts`, one engine test per limit. Not wired: no fork runs on its own until Spike 1 passes |
| Title plan (#1102 Part A) | `hooks/lib/title-plan.js` (pure: prompt + what the hook read → instruction + `sessionTitle`), `hooks/lib/fixtures/title-work-parity.json` (180 cases recorded before the extraction, byte-identical after), stand-down marker `hooks/lib/mod-standdown.js` (session id + job + devops version + 90 s heartbeat, default "hooks run"), unwired |

Limits: where an organization manages Claude Code, `classic.*` events do not
reach plugin mods, so the permission / notice toasts and the agent stop status
are missing there. Engine tests and `claude plugin validate` ran on CLI
2.1.302; loading in the Desktop engine (2.1.321) is spike 2 (#1100).

## Testing

Mods are tested with the engine itself: `claude plugin test <plugin folder>`
runs every `*.test.ts` beside the module (`import { expect, test } from
'claude-code/testing'`); the engine's events are answered by `on(...)` stubs
and their shapes are checked strictly. vitest only collects
`plugins/**/*.test.js`, so the mod tests have their own npm script:
`npm run test:mods` (`.github/scripts/run-mod-tests.js`; skips with a
message and exit 0 when no `claude` CLI is on PATH). CI runs it on shard 1 of
`.github/workflows/ci-suite.yml`. Tests: `plugins/devops/hooks/mods/mods.test.tsx`.

## Batch collect (concept 20261115-2125-batch-ux, note #3)

While `/do-batch` collects, the classic hook `prompt.batch.collect.js` blocks every
prompt, and the harness draws each block as a red "a hook blocked your input"
panel. On Desktop (alpha, mod loaded) the mod files the note itself and the panel
goes away; the hook stays untouched as the fallback everywhere else (terminal
without the mod, cloud, mod not loaded, every failure).

| Part | Decision |
|---|---|
| Hook | `on('prompt.submit')` in `hooks/mods/index.tsx` (`fileBatchNote`), before the existing task-notice toast logic |
| Writer | `scripts/batch-note.js`, run with `$.process.run(['node', …])`, request JSON on stdin, one JSON line on stdout. It wraps `hooks/lib/batch-state.js` (`classify`, `isModeActive`, `isForeignSession`, `appendNote`, `assetsDir`), so mod and hook share one write path and one note format |
| Confirmation | Toast `💾 Note #N saved` (localised, 7 languages: `toastNote`) plus a standing band row `📚 Batch · N` while collection is armed for this session (`batchViewFrom`, read from `.claude/batch-mode.json` + `batch.md`, cached 2 s). No red |
| Drop reason | `💾 #N` — the shortest neutral text (`batchDropReason`) |
| Row buttons (2026-11-17) | Beside `📚 Batch · N`: **Go** (primary, only with ≥ 1 note) submits `go` with `asUser: true`, so the classic hook fires the merge exactly as when typed; during a running turn the engine holds it until that turn ends (Spike 4 busy), the row shows `go queued` until the next turn starts (one press = one prompt). **Off** runs `scripts/batch-off.js` (the skill's Step 5: watchdog stop + `deactivate`, refuses another session's collection) with no model turn; notes stay in `batch.md`, a toast says so, anything but `ok` toasts "type aus" and leaves the mode. The count itself (`▸`) folds the note list open — first line of each note, 12 shown, then `+N more` — the zero-token stand-in for `status`. The only buttons the band shows while working: Go is meant to cost the merge turn, Off and the list cost none. Typing `go` / `aus` / `status` stays equal everywhere, and without the mod (terminal, remote, cloud) nothing changes |
| Title after Off | A mod has no title API (Spike 3), so the `📚 Batch ┃` head outlives Off until the next real prompt: `prompt.flow.title-work` passes `batchArmed` (`isModeActive(cwd)`) and `nextTitle` strips a batch head once the mode is known off (also after an expiry) |
| Attachments | The mod reads each image / document with `$.prompt.media` (4 MiB slices, 12 MiB cap per item) and hands base64 to the writer, which writes `.claude/batch-assets/<stamp>-<k>.<ext>` and appends `[Anhang-Datei] <path>` lines to the note. `@file` mentions that exist on disk get the same line, pasted text is plain text of the prompt (the engine expands pastes) and is filed verbatim |

**Robustness contract** (the owner's condition: notes incl. attachments must never be lost):

- The prompt is dropped **only** after the writer confirmed: exit code 0, stdout
  parsed to `ok: true` with a positive integer note number (`parseWriterOutput`),
  every attachment written and size-checked. Anything else — non-zero exit, a
  timeout (20 s) or missing `node` (the call rejects), garbage output, a media
  read that fails or exceeds the cap, a mod exception, the gate closed — returns
  `next(e)`. `fileBatchNote` never throws and the shared `.catch` of the handler
  only ever passes the prompt on; it can never drop.
- The writer refuses (exit 1, reason in the JSON) when collection is off,
  expired or full, when another session owns the notes (#841), and for
  everything `classify` does not call `collect`: machine prompts, expanded or
  typed slash commands, the execute marker (`go …`), `/do-batch off|go|status`.
  Attachment placeholders (`[Image #1]`, `@file`) are neutralised for that probe
  only.
- Order inside the writer: images first (exclusive create, size verified), the
  note last in one `appendNote`, confirmed by the count. **One image failing
  aborts the whole filing** and removes the copies already written; the hook then
  takes the whole prompt. Chosen over "keep the text, name the missing image"
  because a note that silently reads "like the image" without the image is the
  loss this feature exists to prevent.
- No dedupe: the mod sends no idempotency key, so two identical prompts (a
  "ja" typed twice) are two notes. A content key cannot tell a retry from a
  deliberate repeat, and the engine raises one `prompt.submit` per Enter. The
  writer still honours an explicit `key` for other callers. The residual risk is
  a writer killed between the append and its stdout line: the hook then files a
  second copy — a duplicate, never a loss.
- Concurrent sessions or writers: notes are appended (`appendFileSync`, no
  read-modify-write), assets use exclusive create with the next free index.
- No double filing when the mod succeeded: the dropped prompt never reaches the
  hooks beneath.

Only `origin.kind` `composer` and `bridge` (the person typing) are collected;
`e.command`, `isMeta`, and a leading `/` skip the writer without spawning it.

**B3.0 spike — still open, to be checked in the Desktop app.** Not verifiable
from the CLI: how the app renders a `prompt.submit` `{ drop: reason }`. The
engine types say only "a hook's text is shown to the user as the reason" and
"a broken plugin never blocks one". If the app wraps the reason in the same red
blocked-input panel, the shortest-neutral reason above plus the toast and band row
are the whole answer; if it shows the reason quietly, nothing changes. Record the
observed rendering here after one real submit with collection armed (alpha
channel, mod loaded — mind the Desktop load bug #105936: without the mod the
classic hook runs and the panel stays).

Tests: `batch:` cases in `hooks/mods/mods.test.tsx` (`npm run test:mods`: collect
→ drop + toast + band count, writer refusal / timeout / bad output / missing node
→ next, never-note prompts → next, foreign session → next, `@file` and pasted
text, unreadable image → next) and `scripts/batch-note.test.js` (vitest: filing,
images, long text, refusals, image-write failure leaves no half note, key
idempotency, 8 concurrent writers).

## Sources

- Mod API types of the running build (`.claude-plugin/types/` once a mod has
  loaded) — the authority over any doc.
- code.claude.com/docs/en/plugins/mods/ (overview, reference, api, troubleshoot, admin)
- claude-mods.com and karanb192/awesome-claude-code-mods (293 listed mods; none
  for CI status, branch hygiene, session titles or sound)

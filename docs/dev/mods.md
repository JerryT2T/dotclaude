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
| Notices | Toast **plus** the existing hook text | The hook text is also what the model reads (restart hint, MCP stale sentinel) |
| Budget | One source: `session.measure` rate limits, written (if at all) into the same `usage-live.json` `lib/budget.js` reads | Two sources would let the band and the delegation policy disagree |
| Long prompts | Original stays verbatim; a Haiku lint may only ask 1–3 clarifying questions, advisory, never on machine turns | Shortening a 3k prompt saves ≈ 1.6 % of a 200-step session and drops hedges and negations |
| Large pastes / tool output | Deterministic head + tail + file path, never Haiku; never for `/do-run`, `AUTOSTART`, `<command-name>` prompts; test, git and CI output exempt | `ss.run.task` and `prompt.run.contract` read the prompt text; an excerpt can hide the failing test |
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
without input, then run `/mods-spike-fork`. **Pass:** `cache_read_share`
≥ 0.95 and the 5-h / weekly before/after difference about 0. A fail blocks
#1101.

## Stage 1 implementation

| Part | Where |
|---|---|
| Module | `plugins/devops/hooks/mods/index.tsx` (+ `gate.ts`, `format.ts`), listed in `hooks.json` as `"modules": ["./mods/index.tsx"]` |
| Adding modules | `hooks/dispatch/manifest.json`, then `node plugins/devops/hooks/dispatch/build-hooks-json.js` (hooks.json is generated) |
| State contract | `plugins/devops/types/index.d.ts` (`devops.agents`, `devops.budget`, `devops.hygiene`, `devops.ship`, `devops.shells`), named in `plugin.json` `"types"` |
| Gate | `hooks/mods/gate.ts` mirrors `features.js`: reads `features.json`, `~/.claude/plugins/.channels.json` and `installed_plugins.json` via `$.fs`, fails closed, cached per session. Closed gate → every hook passes through, no command is registered, nothing is drawn |
| Agent pane | `/devops-agents`: subagents with type, model, elapsed, status (`agent.spawn`, `classic.SubagentStop`, `$.agent.list()`) |
| Budget band | Above the prompt: 5-h, weekly and context fill from `session.measure`; `/compact` hint from 80 % context. Display only, writes nothing |
| Toasts | Waiting permission request (`classic.Notification`), subagents and background Bash runs that ran ≥ 120 s (Bash: start time per `tool_use_id` from `tool.call`, end from the `<task-notification>` that reaches `prompt.submit`; call and prompt pass through unchanged), and the hook lines Claude is asked to show verbatim (hook output passes through unchanged). No sound: no asset ships cleanly |
| Ship pane | `/devops-ship`: `.claude/.ship-checkpoint.json` of this branch plus one bounded `gh pr view` (8 s) on open or Refresh |
| Branch hygiene | Count from `~/.claude/orphan-report.json` (same rules as `ss.orphan.nudge.js`, the session's own worktree left out) in the status line and the band; the band's "Clean up (opus)" button runs the plan/apply subagents above, one run at a time |

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

## Sources

- Mod API types of the running build (`.claude-plugin/types/` once a mod has
  loaded) — the authority over any doc.
- code.claude.com/docs/en/plugins/mods/ (overview, reference, api, troubleshoot, admin)
- claude-mods.com and karanb192/awesome-claude-code-mods (293 listed mods; none
  for CI status, branch hygiene, session titles or sound)

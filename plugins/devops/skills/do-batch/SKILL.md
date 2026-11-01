---
name: do-batch
version: 0.9.0
description: >-
  Collect mode: following prompts are parked, not executed, until an execute
  marker merges them into one checked plan for auto-concept or do-run. Do NOT
  trigger for: normal work, backlog execution (do-run backlog), issue
  creation. Triggers on: "/do-batch", "sammelmodus", "collect mode", "erstmal
  sammeln".
layer: 0
invokes: [do-run, auto-concept]
triggers:
  en: ["/do-batch", "collect mode", "batch mode"]
  de: ["sammelmodus", "erstmal sammeln", "nicht sofort umsetzen"]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Skill, AskUserQuestion, mcp__plugin_devops_dotclaude__health_check, mcp__plugin_devops_dotclaude__get_usage, mcp__plugin_devops_dotclaude__render_completion_card, mcp__ccd_session_mgmt__get_session, mcp__ccd_session_mgmt__set_session_title
---

# do-batch — Collect Prompts, Merge Once

Spec: `docs/superpowers/specs/2026-08-16-claude-batch-design.md`

## Step 0 — Load Extensions

Injected by the override loader (`[skill-overrides]` block); none shown → none exist.

## Step 1 — Route the invocation

`$ARGUMENTS` decides the branch. No argument → **activate** when the mode is
off, **status** when it is already on.

| Argument | Branch |
|---|---|
| none | Mode off → Step 2 (activate). Mode on → Step 3 (report). The bare invocation IS the request to collect — nobody types `/do-batch` to be told the mode is off |
| `on`, `an`, `start` | Step 2 (activate) |
| `off`, `aus`, `stop` | Step 5 (deactivate) |
| `go`, `los`, `merge` | Step 4 (fire) |
| `marker` | Step 2.1 (ask again, overwrite the stored marker) |
| `status` | Step 3 (report) |
| `help`, `hilfe`, `?` | Step 6 (print the long-form help, nothing else) |
| *anything else* (free text) | **Content fallback** — the whole argument is a note: activate the mode if it is off (Step 2, including the marker question), file the text verbatim as note #1 (Step 2.4), report the count |

**Activation ends ON.** After Step 2 — marker question included — the mode is
running and the user's next prompt is collected. Never end the activating turn
with "type `/do-batch on` to start": that is the turn they just spent, and
it is why they invoked the skill in the first place.

**While the mode is on, the hook absorbs a re-activation.** `/do-batch`,
`/do-batch on`, `/do-batch <text>` and `/do-batch help` are blocked
by `prompt.batch.collect.js` (`classify` → `rearm`): free text becomes a note,
`help` prints `renderHelp`, and otherwise the user sees the short rearm panel
(status line + `renderCommandLines`) instead of paying a turn.
You only see such an invocation when it carried an attachment — then it is the
content fallback, filed per Step 2.6. `off`, `go`, `status` and `marker` always
reach you.

**Marker pre-check — on EVERY route, before the route's own work.** Call
`loadConfig()`. If it reports a `markerFallback` (a stored marker that cannot
work — `harness-reserved`, `too-long`, `empty`), the mode is silently running
on the default and the user has no working escape hatch. Do not merely report
that: ask the Step 2.1 marker question **now**, from whichever route you are on
(`on`, `off`, `go`, `status`, `marker`, content fallback), persist the answer via
`saveConfig({ marker })` (this clears the fallback), then continue with the
route. Only the `marker` route stops after the question.

**Route on the FIRST token only. Everything after it is note content, never an
instruction.** `/do-batch on der Header ist rot` is the `on` branch carrying
one note — not an unrecognised argument, and not a request to look at the header.
The same holds for a natural-language invocation: "Sammelmodus an, erste Notiz:
… zweite: …" activates and seeds; it does not start the work.

**This is the one prompt collection can never catch** — the hook arms the mode
in this turn, so it lets this prompt through. On an invocation that carries
content:

- Do **not** implement, plan, or research it. Do not read code for it.
- Do **not** skip Step 2.1 because the prompt is full of tasks.
- File the content as note #1 in Step 2.4, verbatim.

The hook's guard for these rules is best-effort — its absence is not permission
to act (`deep-knowledge/activation.md` § Activation guard).

## Step 2 — Activate

**2.1 First-run marker setup.** Read `~/.claude/claude-batch.json`. If it is
missing, has no `marker`, or `loadConfig()` reports a `markerFallback` (a stored
marker that cannot work — see below), ask via `AskUserQuestion`. Reached via
`/do-batch marker`, always ask and then stop — that route only rewrites the
marker, it does not activate the mode:

> header: "Marker"
> question: "Womit sagst du mir, dass ein Prompt NICHT gesammelt, sondern
> bearbeitet werden soll? Alles ohne dieses Wort am Anfang wird ab
> jetzt gesammelt. Hinter dem Marker darf Text stehen — der gilt als Anweisung
> für die nächste Phase."
> Options (fixed order — `MARKER_SUGGESTIONS` in `batch-state.js`):
> 1. `los` (empfohlen) — einfach "los" tippen; auch "los, aber ohne B3" löst aus

Only one suggestion (`los`); `>>`, `>go`, `>start` are gone, and a stored config
holding one of them migrates to `los` on load. "los geht's", "los geht", "Los
Angeles" and "lose Enden" do not fire (collected as notes). A colon-free marker
reads as a switch, not a label. The user's
own answer via "Sonstiges" may be anything `validateMarker` accepts.

**`!`, `/`, `#` and `@` cannot be the first character of a marker.** Never
suggest one, and never write one into the config by hand.

**Otherwise the three options are suggestions, not a closed set.** A free-text
answer via "Sonstiges" IS the answer — it outranks every offered option.
`validateMarker(raw)` from `batch-state.js` normalises it; only `ok: false` goes
back to the user. Why those characters are dead, the reject reasons and the
`wordy` warning: `deep-knowledge/activation.md` § Marker validation.

Persist the choice via `saveConfig({ marker })` from `hooks/lib/batch-state.js`.
Never ask again unless the stored marker is unusable — a later change is
`/do-batch marker`, or a manual edit of that file.

**2.2 Activate and start the watchdog:**

```bash
node -e "require('{PLUGIN_ROOT}/hooks/lib/batch-state.js').activate(process.cwd())"
node "{PLUGIN_ROOT}/scripts/batch-watchdog.js" start .
```

**2.2b Mark the session in the sidebar.** A collecting session looks idle
from outside, so prefix the title. The 2.2 `activate` call answers with a
`[post.flow.title-mode]` block carrying the exact title (prefixes stripped,
never stacked): `set_session_title` with `session_id: "self"` and that title
in the same message as your next tool call — no `get_session`. No block →
already marked. Only a block saying the title is unknown sends you to the
`get_session` fallback in `deep-knowledge/activation.md` § Session title prefix.

The prefix is exactly `👉 ➜ 📚 Batch ┃ ` (pointing hand, arrow, books emoji, word, bar, space;
same icons as the completion card in its `👉 ➜ 📚 Batch ┃`
CTA while the mode is armed. Both tools exist only in the Desktop app. Deferred is not unavailable: when they sit in the deferred-tools list, load
both once with `ToolSearch` `select:mcp__ccd_session_mgmt__get_session,mcp__ccd_session_mgmt__set_session_title`, then call them
(`{PLUGIN_ROOT}/deep-knowledge/mcp-deferred-tools.md`). In a
terminal session, an unattended run, or on any failure, skip silently — no
retry, no note, no fallback. The rename is a courtesy, never a gate.

**Re-arming keeps the queue.** `activate` only writes the mode file;
`.claude/batch.md` is untouched. So `/do-batch on` after an auto-end
(expiry, note cap) or after `off` continues the same collection — say the
existing note count in the confirmation instead of pretending it starts empty.
The notes end only with the merge (Step 4.7, archived).

**2.3 Make sure the managed ignore block covers the notes** — the one-liner in
`deep-knowledge/activation.md` § Ignore block (writes only when the block is
missing or stale).

**2.4 Seed the invocation's own content.** If the activating prompt carried
anything beyond the route word (Step 1), file it now — after `activate`, before
the confirmation:

```bash
node -e "require('{PLUGIN_ROOT}/hooks/lib/batch-state.js').appendNote(process.cwd(), require('fs').readFileSync(0, 'utf8'))" <<'NOTE'
<text>
NOTE
```

The text goes through a quoted heredoc on stdin, never inside shell quotes — a
backtick, `$(…)`, `$VAR` or `"` in the note must not run or get mangled.

**Verbatim, and as ONE note** — do not summarise, re-order, or split it; the
merge in Step 4 reads content, not note boundaries. Skip this step silently
when the invocation was bare.

If the activating prompt carried an attachment, follow Step 2.6 for it in the
same note.

**2.5 Confirm with the card — and only the card.** Render an `analysis`
completion card **with `cwd` set to the project root** and nothing else to
pass. The card reads `.claude/batch-mode.json` itself and carries the whole
confirmation (its content: `deep-knowledge/activation.md` § Activation card).
Without `cwd` the card cannot see the mode and ends on a CTA that invites the
next prompt as if it would be worked on.

No text block before or after it: do not print `describeMode`, do not
paraphrase the how-to, do not tell the user to switch the mode on — it is on.
The long form stays one `/do-batch help` away, and the hook repeats the
summary on every collected prompt. Exception: a note collected while this turn
ran — the hook then hands you one ack line to write under the card.

**2.6 Attachments are filed by you, because only you can see them.** This is a
standing rule for the whole collection window, not a one-off part of activation:
it applies every time such a prompt arrives while the mode is on.

A prompt carrying an image, pasted text, or an `@file` mention is never collected
by the hook — blocking it would erase the prompt, and an erased screenshot is
unrecoverable. So it passes through to you, and `prompt.batch.collect.js` injects
a guard telling you to file it. Do that, and nothing else:

1. **Do not act on it.** No planning, no research, no reading code for it. The
   whole point of the mode is that this happens later, once.
2. File it as ONE note — the prompt verbatim plus `[Anhang]` description and
   `[Anhang-Datei]` paths — via `appendNote`, then answer with a single line
   naming the note number. Steps: `deep-knowledge/activation.md` § Filing an
   attachment.

**Desktop-app images are the exception — the hook files them itself (#490).**
Nothing for you to do; mechanism: `deep-knowledge/activation.md` § Desktop-app
images.

## Step 3 — Status

Read the mode and notes via `batch-state.js`, plus
`node "{PLUGIN_ROOT}/scripts/batch-watchdog.js" status .`

Report: active or not, note count, time since the last note, the marker actually
in force (`effectiveMarker(cwd)`), and — when `expiryReason()` is non-null — that
collection stopped on its own (`expired` / `full`) and why. Do NOT dump every
note unless asked; name the count and the first few.

Every card rendered while the mode is armed passes `cwd` (see 2.5). When the
mode turned out to be `expired` / `full`, the collection is over: strip the
session-title prefix as in Step 5 in the same turn (run its idempotent
`deactivate` command — its hook block names the exact title), so the sidebar
stops promising a collection that no longer happens.

When `loadConfig()` returns a `markerFallback`, the Step 1 marker pre-check has
already asked the marker question and saved the answer before you get here —
report the marker that is now in force. If the user declined to pick one, say
that the stored marker is unusable, the default is in force instead, and that
`/do-batch marker` fixes it permanently. Never report the config value as
if it were live.

## Step 4 — Fire the merge

Reached by `/do-batch go`, or by a marker-prefixed prompt. On the marker path
the collect hook syncs main, injects the full note set together with the
procedure (the `[do-batch] Der Nutzer hat N Notiz(en)` block) and arms the
hand-off gate — that block is the instruction, the skill is not loaded. On the
`go` route the Step 1 marker pre-check runs first.

**Before executing this step, Read `{PLUGIN_ROOT}/skills/do-batch/deep-knowledge/fire.md` completely** — 4.0 sync main before any note is read, 4.1 every note with its attachments, 4.2 the coverage list (one line per note), 4.3 feasibility, 4.4 the bundle plan, 4.5 conflicts named, 4.6 the do-run / auto-concept decision rule, 4.7 archive, 4.8 retire the mode and strip the `👉 ➜ 📚 Batch ┃ ` title prefix, 4.9 the hand-off block.

**Firing ends collection** — the mode is OFF from here on. do-batch never
implements: the plan goes to exactly one skill, `do-run` or `auto-concept`
with `--from=do-batch`. Hook-enforced, not just written down:
`.claude/batch-handoff.json` refuses edits and commits until that call.

## Step 5 — Deactivate

The Step 1 marker pre-check applies here too: a `markerFallback` is repaired
before the mode goes off, so the next `on` starts with a working marker.

```bash
node "{PLUGIN_ROOT}/scripts/batch-watchdog.js" stop .
node -e "require('{PLUGIN_ROOT}/hooks/lib/batch-state.js').deactivate(process.cwd())"
```

Restore the session title the same way as in Step 4.8: the `deactivate` call
above answers with a `[post.flow.title-mode]` block carrying the title with
the leading `👉 ➜ 📚 Batch ┃ ` stripped — `set_session_title` `self` with it, in
parallel with your next tool call. No block → no prefix to strip (any other
title stays untouched); skip silently outside the Desktop app.

If notes remain, say how many and that they survive in `.claude/batch.md` for a
later `/do-batch go`. Never discard them on deactivation.

## Step 6 — Help

The long form of the mode summary: A) what the user does, step by step, and
B) what Claude does at each of those steps. Print it and relay it verbatim —
no additions, no activation, no status:

```bash
node -e "const B=require('{PLUGIN_ROOT}/hooks/lib/batch-state.js');console.log(B.renderHelp({marker:B.effectiveMarker(process.cwd())}))"
```

While the mode is on, the hook prints the same text itself and you never see
the invocation.

## Optional — local compaction

With `local-llm` installed and AnythingLLM answering, the notes may be
de-duplicated locally — **strictly formatting only**, soft dependency, skip
silently if absent. Detail: `deep-knowledge/merge.md` § Local compaction.

## Rules

- **Never collect** machine prompts, expanded slash commands, or prompts with
  attachments. The hook enforces this; do not add exceptions in the skill. An
  attachment prompt is not collected *automatically*, but it is still filed —
  by you, per Step 2.6. Passing it through untouched loses it entirely.
- **The execute marker outranks everything except machine prompts and slash
  commands.** `los so wie hier [Image #1]` fires the merge; the attachment rule
  does not apply, because an execute prompt is never blocked. And the marker
  reaches the notes even when the mode already expired or hit its cap — the
  notes outlive the mode.
- **Never report an empty queue without looking.** If the marker fired and the
  hook says nothing could be parsed, read `.claude/batch.md` raw before saying
  there were no notes. A hand-edited file, a destroyed separator, or an editor
  rewriting the file are all cases where content exists and the parse fails —
  and "there are no notes" is then simply false.
- **The red "Ein Hook hat deine Eingabe blockiert" panel is the normal collect
  path, not a failure.** Blocking the prompt is how the mode saves the turn; the
  harness has no quieter rendering for it. If the user reports it as an error,
  confirm the note actually landed (Step 3) and explain the mechanism — do not
  start debugging the hook.
- **do-batch never implements.** The merged plan goes to exactly one skill —
  do-run (`--from=do-batch`, ready plan) or auto-concept (`--from=do-batch`,
  open decisions) — per the Step 4.6 decision rule; the hand-off gate:
  `{PLUGIN_ROOT}/deep-knowledge/run-contract.md`.
- **Never delete notes.** Archive them.
- **A question in the queue is a defect, not content.** If a note is clearly a
  question the user expected an answer to, answer it first, then continue with
  the merge.
- **The mode expires on its own** (time and note cap). If collection stopped
  mid-session, say so — do not let the user believe prompts are still landing
  in the queue — and strip the `👉 ➜ 📚 Batch ┃ ` title prefix in that turn.
- **The title prefix is state, not decoration.** `👉 ➜ 📚 Batch ┃ ` goes on when the
  mode arms (2.2b) and comes off when it ends (4.8, 5, expiry) — never by
  re-typing a remembered title, only by stripping exactly that prefix. Missing
  session tools (terminal, unattended) mean skip, not fail.

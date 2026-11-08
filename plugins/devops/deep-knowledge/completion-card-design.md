# Completion Card — Design Specification (v2, "one page, three lines, one decision")

Single source of truth for how a completion card looks and reads, on every
client, for every variant. Decided on the concept page
`docs/concepts/2026-09-20-completion-card-one-page.html` (11 rounds,
2026-09-20). The renderer (`mcp-server/index.js`), the Desktop widget
(`mcp-server/lib/card-widget.js`), the guards (`hooks/lib/card-guard.js`,
`hooks/stop/stop.flow.guard.js`) and the session-title hook implement this
document; when they disagree with it, this document wins.

## 1. Why

The old card had to be scrolled to be read: a `Changes` block with file
names, a `Geprüft` block with five checkmarks, `⚠ OFFEN` in the middle,
the usage meter between body and footer, a build line, a state line, a CTA
heading — and buttons *above* it all. At the end nobody read more than
three lines, and those were technical. The new card is built for the reader:
one page, three result lines that answer the prompt, one decision.

## 2. Anatomy (top to bottom)

Two visual blocks. Nothing between them, nothing under the second one.

```
&nbsp;
---
### **✨✨✨ {title} ✨✨✨**                 ← markdown, every client (card-guard marker)
› result line 1                            ┐
› result line 2                            │  Block 1 · "what happened"
› result line 3                            │  (Desktop: top of the one surface)
✓ 3/3 Anforderungen  ✓ 3464 Tests grün  ✓ 4 Live-Checks ok     ← evidence row
○ commit → ○ push → ○ PR → ○ merge · branch · Build 176c57d       ← pipeline line
5h [time bar | usage marker] 3 h 39 m   Wk [...] 6 d 20 h   🧠 1180 Calls  ┘ budget (footer)
## 📦 {decision as a question}?            ┐
› one context line (optional)              │  Block 2 · "what to decide"
1. reservation / test step                 │  (Desktop: quiet accent-tinted box)
2. reservation / test step                 │
[Ship ↗] [Nachbessern ↗]                   ┘  (Desktop widget only; terminal: nothing)
---
```

### 2.1 Title

- `### **✨✨✨ … ✨✨✨**` stays exactly as today in the terminal — it is the
  marker the card-guard detects. Bold H3. On Desktop, where the widget is the
  whole card, no markdown is output at all (§ 4): the guard reads the
  card-body `show_widget` call instead. (Both hidden markers tried before —
  an HTML comment, #443, and a `[//]: #` definition, #470 — rendered as
  literal text in the Desktop chat.)
- Content: the **outcome** of the turn, ≤ 60 chars. Never status ("agents
  running", "waiting", "pending", "noch nicht") — status belongs in the
  decision heading. Never a version or pipeline word ("gemergt", "shipped").
- When something was NOT achieved the title says so: "… — Resume-Pfad noch offen".
- Desktop widget only: the local time the card was built (`HH:MM`, model
  field `builtAt`) sits right-aligned in the title row, 12px in
  `--text-secondary`, so a reader coming back later sees how old the card's
  state is. In flow (flex row), never absolutely positioned. The terminal
  markdown carries no time.

### 2.2 Result lines (`›`)

- **Max three**, each ≤ 120 chars, written as `› ` + text (no bullets, no
  blockquote). A fourth line becomes `+1 weitere` on the last line, never dropped silently.
- Each line names an **effect for the user**, never a file, function or hook
  as subject. Names may appear as `code` at the END of a line
  ("… steht als `stale`"). "budget.js → Refresh-Zyklus" is forbidden.
- Wording by intent class: Feature → new behaviour · Fix → symptom gone, cause
  in a half-sentence · Analysis → finding + recommendation · Ship → what is
  live where.
- **A deviation is line 1**, bright, prefixed `**Nicht erreicht:**` /
  `**Not achieved:**` (red tests, unbuilt part, cut scope, aborted reason).
  Never hidden in the evidence row, never parked as an open point. Every
  unmet requirement gets its own line, then every partial one as
  `**⚠ Nicht voll erfüllt:**` / `**⚠ Not fully met:**` (amber on Desktop) —
  also when it waits on the user; a deploy wait counts as met (#630).
- The `Changes` block is gone. On Desktop the app shows the file list itself;
  in the terminal the pipeline line (branch, build) is enough. Files are
  never listed on the card.

### 2.3 Evidence row

Always the same three posts, always in this order, one row, two spaces
between posts, no `·` separators:

| Slot | Post | Source | Text pattern (number + noun + state) |
|---|---|---|---|
| 1 | Requirements | `validation[]` — a user-waiting check (Sichtprüfung, manual test) is rerouted to the user checks and not counted (#643) | `✓ 3/3 Anforderungen` · `◐ 2/3 Anforderungen` · `✗ 1/3 unerfüllt` |
| 2 | Tests | `tests[]` (test/lint/build/typecheck entries) | `✓ 3464 Tests grün` · `✗ 2 Tests rot` · `⏭ 3 übersprungen` folded into the tooltip |
| 3 | Live check | `tests[]` entry with real data / browser | `✓ 4 Live-Checks ok` · `◐ Overlay: nicht live geprüft` — after a ship: `✓ PR #416 → main` |

- **Deviations first, bright:** a `✗` or `◐` post moves to the front of the
  row regardless of slot. Green posts are dim.
- **Deviation-only posts** exist only when they have a finding, and go in
  front: `🧹 3 Warnungen` (lint), `🏗 tsc 1 Fehler` (build), `👁 Review
  übersprungen — Limit` (second opinion), `⚠ ungeprüft — kein Test lief`
  (the V&V stamp, replaces the old block under the title) — or
  `◐ Test läuft noch im Hintergrund` when the owed check is a background run
  whose result is still out (`light-bgrun`). A green lint /
  build / review is never shown — what is not there was fine.
- Glyphs are **monochrome text**, never emoji: `✓` met · `✗` failed · `◐`
  partial · `○` open · `●` done · `⏭` skipped. Emoji only for the three
  warning signs (§ 6).
- Released cards: slot 1–3 become the promotion facts (`✓ Tags beta/v0.179.0
  · v0.179.0`, `✓ bit-identisch mit alpha`, `✓ GitHub-Release` on stable).
- Analysis cards: `✓ 12 Dateien gelesen`, `✓ 3 Befunde belegt`.
- Widget: each post has an app-styled tooltip (Info tier, 1500 ms;
  `ui-defaults.md` R1) with the details
  (`144 Dateien · 3 übersprungen · 0 rot · 41 s`; the four live checks by name).

### 2.4 Budget line

Replaces the fenced meter. Last line of block 1 — under the pipeline line;
it is the card's footer, not part of the evidence.

- **Bar = elapsed time of the window, marker = usage.** Fill colour is the
  accent lilac (`#4a5384` on the widget), track `#2b2d3a`. The marker is a
  3 px bar, taller than the track (−6 px top/bottom), drawn above every label.
- Marker colour by `usage − time` in percentage points: ≤ 10 white · ≤ 25
  yellow (`#e6c36a`) · > 25 red (`#e07a7a`). The track never changes colour.
- Remaining time as a **watermark** inside the track, right-aligned, dim
  (`#7d84a8`), 10 px: `3 h 39 m` / `6 d 20 h`.
- Labels `5h` / `Wk` before each bar; nothing after the bar. Percent, delta
  since last card, "über Plan", reset clock — all in the bar's tooltip:
  `35 % verbraucht · 27 % der Zeit um · 8 % über Plan · Reset 14:39 (in 3 h 39 m) · +2 % diese Runde`.
- A light glint (24 px, 12 % white) sweeps once every 4 s across the **filled
  part only** — never over time that has not passed; disabled under
  `prefers-reduced-motion`.
- **When a window shows.** `5h`: from 50 % used or 1 h before reset, and only where a 5-hour window
  applies (no row for Ultra without a window; a delivered value shows on every
  plan, see `plans.md`); with an unknown reset there is no pace verdict.
  `Fb`: a scoped weekly limit (Fable, read from `limits[]` of the usage
  response, so only on plans that have one) follows the SAME rule as `Wk` and
  shows only while its percent is above 0.
  `Wk`: once usage runs > 10 pp ahead of elapsed time (the yellow marker
  threshold — the user must see they are ahead of the linear weekly pace)
  or in the last 24 h before reset, whatever the pace. Absolute weekly
  percent alone never shows it, and a weekly reset that is not known shows
  nothing (it is never read as 100 % elapsed). With neither window due, the line is
  **omitted entirely**.
- Terminal / markdown fallback: `5h ▰▰▰▰▰▰▰│▱▱▱▱▱▱ 3 h 39 m   Wk ▰▰│▱▱▱▱▱▱ 6 d 20 h`
  (▰ = time, │ = usage); a yellow/red condition is written as a leading `⚠`.
- Context health: from the tool-call threshold on, `🧠 1180 Calls` sits dim
  at the right end of the budget line. Below the threshold nothing. It is a
  depth indicator, not a `/compact` advice: a large-context ship runs in a
  fresh subagent, so nothing has to be compacted first.

### 2.5 Pipeline line ("where it lies")

Dim, small, directly under the evidence row (the budget line follows it as
the footer). Glyph BEFORE the step. Plain text — no
code spans (they would be red on Desktop). Names in the accent lilac on the widget.

```
○ commit → ○ push → ○ PR → ○ merge · claude/devops-agent-usage-refresh-263640 · Build 176c57d
✓ commit → ✓ push → ✓ PR #416 → ✓ merge   main · Build a91c3e2
alpha **v0.179.0** › beta v0.176.0 (−3) › stable v0.170.0 (−9 · 12 d)
```

- `○` open, `✓` done, both grey. After `merge` an em-gap, then the base branch.
- Ring projects add the **channel ladder** under the pipeline line: each
  channel with the version it serves. The highest version leads (lilac,
  weight 500); lagging channels follow quieter with their distance in yellow
  (`−3`, `−9 · 12 d`, from `betaLag` / `stableLag`). Channels on the same
  version merge (`alpha · beta v0.179.0`); all three equal turn green with a
  `✓`. Plain text — no frame, no fill: it must never read like a button next
  to the promote buttons. The ladder is the only place the version appears on
  the lines (the pipeline line drops its `· v…`), and it replaces the old
  lag context line under the heading.
- `#416` is a quiet link on the widget: no colour, underline on hover only.
- `ready-files`: `📂 9 Dateien geändert · kein Repo · H:\notes\budget`.
- No repo file changed (no commit, PR or delivery, and `analysis`,
  `fallback`, or a clean work tree at `cwd` — the PC analysed, a scheduled
  task, a setting, folders outside the repo): no pipeline line at all; an
  all-pending `○ commit → ○ push → ○ PR → ○ merge` says nothing there.
- No remote, after a local ship (`state.merged` set): `✓ commit → ✓ merge
  main · nur lokal, kein Remote · v1.2.3 · Build abc1234`.
- No remote (`state.mode: "git-no-remote"`): `✓ commit · nur lokal, kein
  Remote · main · v1.2.3 · Build abc1234` — the track ends at the local commit; no
  `push → PR → merge` steps, since there is nowhere to ship to (#500).
- The variant-guard downgrade note ("ship-successful → ready, weil …") is a
  `›` context line under the decision heading, not a block.

### 2.6 Decision block

- **Heading = the decision as a question**, H2, led by the same two-icon
  head as the session title (`session-title-scheme.md`): `👉 📦 Ready — Shippen?` only when nothing
  is open. It ends with `?` (the stop-hook checks that) — **except when there
  is nothing to decide**: then it is a state ending in `.` and there are no
  buttons (`🟩 🚀 Released Stable — v0.179.0 — fertig.`; `👉 📦 Files — Fertig
  auf der Platte — noch etwas?` keeps the question form because "noch etwas"
  is one).
- **Ship only when nothing is open (#714)** — see the `❓` row in § 3. A user-wait without `open` is refused once by the card pregate (Gate Q): put the question into `open: [{ text, reply }]`. No `[LOCAL SHIP]` over it; only `waitsOn: "user"` triggers, no reply-text heuristic. **A security finding is never "harmless" (#709)** — an npm audit result, a CVE, a GHSA or another advisory the turn found is never summarised away (`… — alle harmlos`) or left in prose above the card. It goes into `open: [{ text, reply }]` with the fix as the prepared answer ("Ja, `undici` auf die gepatchte Version heben."). The card pregate (Gate S) refuses once a card that names one in `summary`, `changes` or `tests` without an `open` item; a clean audit ("0 vulnerabilities", "keine Schwachstellen") does not trigger it.
- The keyword names the channel reached after a ship/promotion: `🟩 ➜ 🚀 Released Alpha ┃
  — …`, `🟩 🚀 Released Beta — …` / `🟩 🚀 Released Stable — v0.179.0 — fertig.` (ship and
  promote in one run) and `🟩 🎊 Beta — v0.179.0 — nach Stable?` / `🟩 🎊 Stable — …`
  (promote only: 🎊); the word is always "Stable", never "LIVE".
- Optional **context line** `› …` directly under the heading, before the
  points (promote distance, alternatives after an abort, guard notes).
- **Points list**: max 3 — numbered in the markdown, `›` lines in the Desktop
  widget (same glyph as the result lines, see § 4). Contents in
  order: open reservations (`open`, prefixed `❓` when the line ends in `?`,
  else `👉` — a step the user does by hand), then manual test steps (`userTest`,
  `userFinalTest`) prefixed `🧪` when the list mixes both, then deploy-gate
  artifacts on a deploy card. More than three → `+N weitere` appended to the
  heading and the rest written in the card's `answer` field (drawn above the body).
  **Exception — the `test` card's steps (#750):** its `userTest` steps come
  first and are always shown, never folded and not counted against the three;
  the open points follow and only they fold into `+N weitere`.
- **A login-gated URL in a test step says how to sign in (#933).** A
  `userTest` / `userFinalTest` step that opens a route behind a login names
  the sign-in for exactly that origin in the same line (test account source,
  never a password), and uses the origin sign-in works on (allowlisted host
  and port). No sign-in works there → the step says what is missing instead
  of a URL that dead-ends at a failed login.
- **The next step is no point (#751).** On `test` and `ready` cards the card server drops every `open` item that is the approved scope's routine next step (ship, push, release, version bump, post, merge, `nach main`, `ausgeben`, Discord — `mcp-server/lib/open-admission.js`, step 0d). An item ending in `?` is a real question and stays. The drop is silent on the card, logged to stderr, and the tool result names the count; the next step belongs in `nextStep`.
- **A task chip is no point.** On the Desktop app a finding outside the work
  is flagged with `spawn_task`: the chip is the offer, one click starts the fix
  in its own session. The card server drops every point that says a chip or
  follow-up task exists (`… — Task-Chip bereit`, `(follow-up chip ready)`,
  `als Folge-Task angelegt`) or names a chip of this session by its title
  (`hooks/lib/task-chips.js`; `post.flow.completion` records the chips and
  reminds Claude when one is created). Matched by the point's own words, never
  by topic similarity — a decision that merely shares words with a chip stays.
  Such points were 10 of 451 between 2026-08-20 and 2026-09-25; on a ship card
  their `Nachbessern` answer had the user fix the topic a second time in the
  session that had just shipped, and ship again.
- **Buttons** (Desktop widget only, hidden in the terminal): the two verbs
  of the variant, primary first; each has a tooltip explaining what it
  triggers (`Fix` → "…, dann wird geshippt." — a deferred ship, `isDeferredShip`;
  `Trotzdem shippen` → "Ship mit skipChecks — die roten Tests
  landen als Issue."). Equal height, 13px; only border/text colour differs.
- **`Web-Guide starten` button** (#506/#519): when `hooks/lib/guide-handoff.js`
  `detectCardHandoff` finds a manual web hand-off in `open`/`userFinalTest`
  (a marketplace integration, API key, OAuth app, account, terms, a
  cron-job.org job — the same trigger `auto-guide`'s SKILL.md names), the
  widget adds this button so the point never ships as a plain text step the
  user has to execute by hand; non-Desktop clients get no button, so the
  hit also records the pending hint `prompt.skill.enforce` offers on the
  next real prompt. Writing such a point without checking this first is the
  bug the button exists to catch. An `open` item whose own `reply` starts
  with "Führ mich per Web-Guide durch …" / "Guide me through …" is a
  declared hand-off and gets the button without the text heuristics (#742);
  so does a reply opening with "Ja, …"/"Yes, …", and a bare "Führ mich durch
  …" when the item names a known web service. The explicit form is
  `open[].guide: "web"` (optional `service`): it renders "Web-Guide starten"
  whatever the wording — use it for every offer question (#1084).
  Heuristics read each item alone (#900; numbered lists span items); a setup
  verb with a URL, UI path or „label“ counts for unknown web UIs (#905). Still
  declare every manual website step as an `open` item with that `reply`.
- **`App starten` / `Start app` button** (#680): `test` and `ship-successful`
  cards (plain, kept, deploy, also a plain merge with nothing to promote) get
  it when the card server finds a launch path in the card's `cwd`
  (`mcp-server/lib/launch-path.js`: `.claude/launch.json` with at least one
  configuration, `scripts/run-local.*`, or a `package.json` `dev`/`start`
  script) — detected at render time, no payload field. It sits after the
  card's own verbs and before `Web-Guide starten`, never primary (Ship /
  Promote keep the accent). Its prompt (`Starte die App` / `Run the app`)
  hits a start keyword of `prompt.flow.appstart`, so the click runs the
  normal start flow (pinned by `card-widget.test.js`). No `cwd`, no launch
  path or a detection error → no button. Not on `ready`, the overrides or
  any other key; `test-minimal` stays button-free — it is the card shown
  after the app already started.
- **Prepared answer (`ready`, `test`, `ship-successful`)**: when the card has
  open points, a `Nachbessern` button carries the prepared answer:
  `ready`'s `Ändern` becomes it, `test` shows its `Nachbessern` with it, and `ship-successful` (ring or plain merge) gets
  it after its promote verbs. It puts the answer to
  EVERY open point (also those folded into `+N weitere`) into the input box,
  assuming the user wants them all tackled: each point's `reply`
  (`open: [{ text, reply }]`, written as the user — "Ja, die Änderung bitte
  auch in X machen."), else a plain "… Ja, bitte." / "… — bitte angehen."
  One point → its answer alone; two or more → an intro line, a blank line
  and one `- ` bullet per answer in card order. Final tests stay out — they
  are the user's own steps. On `test` the partial/unmet `validation` entries
  count as open points too ("<requirement> — <evidence> — bitte angehen.").
  Without open points neither `ready`'s `Ändern` nor `test`'s
  `Nachbessern` is drawn (#784, #927) — nothing to fix is no dead-end click;
  Ship and App starten stay.
- **No generic content buttons (#927).** A button whose prompt would only be
  a standard "ask me what / which" phrase (Ändern, Nachbessern, Frage, a bare
  Weiter) is a dead click: the user could just as well type into the input
  box. Such a button is drawn only with a situation-specific prompt (the
  prepared answer, a named next step); otherwise it is left out. Action
  buttons that need no content (Ship, Promote, Deploy, Umsetzen, Fix, Skip,
  Tests laufen lassen) stay with their standard prompt.
- No `SHIP oder ÄNDERN` line anymore — the buttons say it. The terminal
  shows the question heading alone.
- **Stale session server.** A session keeps the MCP server process it started
  with, so a mid-day plugin update leaves it rendering with old code. When the
  installed devops version (`installed_plugins.json`, newest user-scope entry,
  re-read per render) is newer than the version this process loaded at startup,
  one info line follows the budget line: `ℹ Session-Server v<old> — ein
  Neustart der Session lädt v<new>.` (en: `ℹ Session server v<old> —
  restarting the session loads v<new>.`). On Desktop it shares the widget's
  info slot with the overrides line. Never in the decision box, buttons
  unchanged, any read error draws nothing (`mcp-server/lib/server-version.js`).

## 3. Per-variant mapping

| Variant / state | Heading (de) | Points | Buttons | Notes |
|---|---|---|---|---|
| `ready` | `👉 📦 Ready — Shippen?` | final tests | Ship | nothing open — no generic Ändern (#927) |
| `ready` / `test` (no `userTest` steps) + open point or `waitsOn: "user"` | `👉 ❓ Question — {top open point}` / `👉 ❓ Question — Wartet auf dich: {requirement} — wie entscheidest du?` | remaining open + final tests | Ship dropped; Ändern / Nachbessern with the prepared answer | #714 — ship only when nothing is open |
| `test` with `userTest` steps + open point | `👉 🧪 Test — …` (the Test heading stays; session title too) | every `userTest` step first (never folded), then the open points (≤ 3, rest `+N weitere`) | as plain `test`; Nachbessern carries the prepared answer | #750 — the steps to test are the next move, the open points ride along |
| `ready` / `test`, no remote | `🟩 📦 Committed — Lokal committet — noch etwas?` · `👉 🧪 Test — Erst testen?` | as `ready` / `test` | Ship dropped; Nachbessern (with open points only) turns primary | `state.mode: "git-no-remote"`, or detected from `cwd` when the caller passes no mode (no `origin`) — nothing to push, PR or merge (#500). Keys after a ship attempt (ready-red, ship-blocked, vv-unverified) keep their buttons: a local ship still commits. `ship-successful` without `state.merged` downgrades to this row with its own note; with it (a local merge) it stays. **A `ready` card with unshipped work is not drawn at all:** the tool returns a `[LOCAL SHIP]` instruction instead, Claude runs `/do-ship` (commit, local merge, local tag), and that ship's card ends the turn. |
| `ready` + red tests / partial | `👉 ⚠️ Red tests — Trotzdem shippen mit 2 roten Tests?` | open (fix first) | Fix · Trotzdem shippen | ⚠ red; line 1 = Nicht erreicht |
| `ship-blocked` | `👉 🚧 Blocked — {reason} umgehen und trotzdem shippen?` | the gate's finding | Fix · Skip | ⛔ only here |
| `ship-successful` | `🟩 🚀 Released Alpha — v{v} — nach Beta promoten?` (ring) / `🟩 🚀 Released Alpha — v{v} → main.` (plain, no promote) / `🟩 🚀 Released Beta — v{v} — nach Stable promoten?` · `🟩 🚀 Released Stable — v{v} — stable.` (ship + promote in one run); 👉 instead of 🟩 when an open point, a `userFinalTest` or a `waitsOn: "user"` requirement rides along — the promote offer alone is optional and keeps 🟩 | open + final tests | Promote beta (primary) + Promote stable / only Promote stable when the ladder already sits on beta / none — each + Nachbessern with open points; + App starten with a launch path | context line = distance to beta |
| `ship-successful` kept | `🟩 🚀 Released Alpha — v{v} — weiter in `{branch}`?` | — | Weiter (+ App starten with a launch path) | |
| `ship-successful` concept close-out | `👉 🚀 Released Alpha — v{v} — Konzept abschließen – Abschlussbericht wartet.` (ring) / `👉 🚀 Released Alpha — v{v} → main — …` (plain) · en `… — Close out the concept – final report is waiting.` (👉: the close-out is the user's step) | open + final tests | as plain `ship-successful` (promote by ring + Nachbessern with open points; + App starten) — never Weiter | #693: the card carries no `concept` field, or only a `waiting` one (a ship outcome wins over it; `implementing` / `iterating` still override; #1026), and `cwd`'s live `.claude/concept-active.json` points at a page whose markup (outside comments / `<script>` / `<style>` / `<template>`) holds the final-report `<section … data-final-report …>` — only the close-out remains. Wins over `kept` (the worktree was kept for the close-out, not for more work); `deployPending` still wins over it. Context line = the page URL. Title: `🟩 ➜ 🚀 Released Alpha ┃ ` (`released`: its channel prefix), never the `🧭` conditional. No marker / unreadable page → the rows above, unchanged. The concept is not closed automatically |
| `ship-successful` deployPending | `👉 ⚠️ Not deployed — Gemergt, aber nicht live — Migration jetzt deployen?` | deploy artifacts | Deploy (+ App starten with a launch path) | replaces the 🚨 DEPLOY block |
| `released` → beta | `🟩 🎊 Beta — v{v} — nach Stable?` (promote only; after a merge in the same run `🟩 🚀 Released Beta — …`) | — | Promote stable | evidence = promotion facts |
| `released` → stable | `🟩 🎊 Stable — v{v} — fertig.` (promote only; after a merge in the same run `🟩 🚀 Released Stable — …`) | — | — | state, no question |
| `ready-files` | `👉 📦 Files — Fertig auf der Platte — noch etwas?` | final tests | — | pipeline = file line |
| `test` | `👉 🧪 Test — Erst testen, dann shippen?` | open + userTest steps | Ship · Nachbessern only with open points or partial/unmet requirements (→ prepared answer) · App starten with a launch path | unverified part = `◐` post |
| `test-minimal` | `🟩 ✨ Started — viel Spaß` | — | — | title + one line + heading; no evidence, budget, pipeline, widget — so no `App starten` either |
| `analysis` | `🟩 📊 Analysis — gelesen — umsetzen oder Fragen?` | `open` points (with ❓/👉 icons), if any (#759) | Umsetzen (with `nextStep`: Empfehlung umsetzen — sends that step); with `open` replies + Nachbessern carrying them | pipeline = `➖ keine Änderungen`; only when nothing changed anywhere — an answer or investigation (#624). Work done outside the repo → `fallback`; implementation handed to still-running agents → `ready`/`test` + `pending`; a mode activation → its override; finished unshipped commits in a linked side session → `ready` + `open: [{ text, reply: "ship" }]`, never `analysis` (#759) |
| `aborted` | `🟥 📦 Aborted — abgebrochen wegen {reason} — anders versuchen?`; a named abort (`cta.activity`: ship, promote, test, concept, batch, analysis, agents) keeps its activity: `🟥 🚀 Ship — …` | — | Nochmal | context line = alternatives |
| `fallback` | `🟩 🖥️ System — erledigt — noch etwas?` | — | — | also for work finished outside the repo with no repo diff: a DB op, a delete, a deploy, a data migration, a settings change (#624). Never for a demo / example / preview page the user should open and try: that is `test` + `preview: "<http(s) URL>"` (the URL becomes the linked context line, like the concept page link) |
| `paused` | `🟦 ✋ Paused — weiter, wann du willst` | — | — | context line `› Schreib hier, um weiterzumachen.`; results = what was stopped and what was kept; for work the user pauses to continue later (#548), never `fallback`; title `🟦 ➜ ✋ Paused ┃ `; the run contract treats it as non-final. Also for work whose next step is a Claude Code restart, a reboot or a usage-limit reset (#583) — never `analysis` / `ready` / `fallback` then: `pause: { reason: restart \| reboot \| usage-reset, resetAt? }` names it in the heading (`🟦 🔌 Restart — Claude Code neu starten`, `🟦 💻 Reboot — PC neu starten`, `🟦 🔋 Limit reset — weiter nach dem Limit-Reset (23:40)`), the context line (the one resume action) and the title (`🟦 ➜ 🔌 Restart ┃ `); `reason: user` keeps the plain copy |
| pending override | `⏳ 🤖 Team — noch nicht fertig — {what}` | what is running | — | evidence gets `◐ Belege vorläufig` |
| concept override | by phase: `👉 🧭 Concept — wartet auf deine Entscheidungen` · `⏳ 🧭 Concept — in Iteration — ich melde mich` · `⏳ 🧭 Concept — in Implementierung — ich melde mich` (the icons mirror the session title: `👉 🧭` = your move, `⏳ 🧭` = Claude works); running work as its own sentence (`… in Implementierung. 2 Agenten arbeiten — …`) | the running items | — | context line = the page URL (quiet link); "wartet" during an implementation run is a regression |
| batch override | `👉 📚 Batch — sammelt — {n} Einträge` | how to collect · fire (`<marker> <text>` / `/do-batch go`) · stop (`/do-batch off`, auto-end bounds) | — | context line = what happens to the next prompt; the card is the whole activation confirmation, no text block beside it |
| V&V unverified | `👉 ⚠️ Unverified — Ungeprüft shippen?` | "npm test lief nicht — …" | Tests laufen lassen · Trotzdem shippen | `⚠ ungeprüft` first evidence post |
| V&V running | `⏳ 🧪 Testing — Test läuft noch — Ergebnis abwarten?` | "Ein Testlauf läuft noch im Hintergrund — …" | Jetzt shippen | `◐ Test läuft noch im Hintergrund` first evidence post; waiting needs no button — the run's notification brings the result; the pending override still wins when `pending` names the run |
| ready + `handoff` (#1085) | `👉 📦 Ready — an Session „{X}“ übergeben` (`… — Shippen?` with `ship: true`) | — | `Session öffnen` (primary); with `ship: true`: Ship + `Session öffnen` | `handoff: {session, title, ship?}` = result sent to an EXISTING session via send_message; `linked` stays for start_session children |
| linked, handoff running | `⏳ 🔗 Linked — „{X}" läuft weiter und shippt selbst` | `› „{X}" läuft noch` (+ `› Weiter in: [title](#local_…) · Sidebar: „…"` where the user's move is there) | — | `linked` input; parent has no own open work. No Ship / Promote for side-session work. Never Released while any linked session runs |
| linked, waiting | `👉 🔗 Linked — „{X}" wartet auf dich — dort antworten` | the open point | — | title `👉 ➜ 🔗 Linked ┃` |
| linked, partial | `⏳ 🔗 Linked — …` | `› „A" geshippt v…, „B" läuft noch` | — | title stays ⏳ |
| linked, all finished | `🟩 🚀 Released …` | `› „A" geshippt v…` | no promote (promotion happens in the side session) | only when ALL linked sessions shipped or finished with nothing to ship (Released invites archiving) |
| `delivered` (child of `[devops:deliver]`) | `🟩 📦 Delivered — Teil fertig — der Haupt-Chat integriert und shippt.` | — | no Ship; 👉 only with a real open point | never `[LOCAL SHIP]` / ready-ship redirect |
| Team with side sessions | `⏳ 🤖 Team — {n} von {m} Side-Sessions fertig` | the running ones | secondary `Eigenen Teil jetzt shippen` when the parent has its own unshipped diff | own diff does not win over Team (combined ship at the end) |
| Team, one waits | `👉 🤖 Team — „{Y}" wartet auf dich — dort antworten` | — | — | title `👉 ➜ 🤖 Team ┃` |
| Team, all delivered | `👉 📦 Ready — {m} Teilergebnisse integrieren und shippen?` | — | Ship | after the combined ship `🟩 🚀 Released` + `› A, B, C können archiviert werden` |
| Team, one failed | `👉 ❓ Question — „{C}" ist gescheitert — ohne C integrieren, C neu starten oder abbrechen?` | — | prepared replies | |
| side-session note turn | title always updated; a new card only when the user's next move changed (all done, one waits, one failed, shipped there), otherwise the turn ends silently | | | unmarked follow-up: one line `› „{Bug Y}" läuft als eigene Aufgabe`, no status change |

Every heading starts with the same status icon, activity icon and English keyword as the session title the card leaves (`session-title-scheme.md`, "Title = CTA"), then ` — ` and the localized sentence; both come from one table (`hooks/lib/title-scheme.js`, `cardHead` in `mcp-server/index.js`).

English strings mirror these one to one (`👉 ⚠️ Red tests — Ship anyway with 2 red tests?`,
`🟩 🚀 Released Alpha — v0.179.0 — promote to beta?`, `🟩 🎊 Beta — v0.179.0 — to
stable?`, `🟩 🎊 Stable — v0.179.0 — done.`, `⏳ 🤖 Team — not done yet — {what}` …).

## 4. Desktop widget vs. terminal

Moved to [completion-card-widget.md](completion-card-widget.md): the Desktop card-body widget, its buttons, links and tooltips, and the terminal markdown fallback.

## 5. Guards (stop.flow.guard / card-guard)

1. Title: no status words (`läuft`, `laufen`, `wartet`, `pending`, `noch
   nicht`, `running`, `waiting`, agent counts) → block once with the reason.
2. Result lines: ≤ 3; a line whose first token is a path / hook name
   (`\w+\.(js|md|ts|json)`, `ss\.|post\.|prompt\.|stop\.`) → block once.
3. Points: ≤ 3 on the card; more only as `+N weitere` in the heading. Under
   a `🧪 Test` heading only the open points (`❓` / `👉`) count — the steps to
   test are never folded (#750).
4. Line budget: 14 rendered lines on Desktop (title 2, result ≤ 3, evidence
   1, budget 1, pipeline 1, heading 2, context ≤ 1, points ≤ 3) / 24 rows in
   the terminal. Overflow is cut in this order: evidence details → context
   line → pipeline names → never result lines, points or the heading.
5. Notification turns (a turn that starts from a background-task
   notification, a wake-up or a cron tick, with no user prompt) carry **no
   card obligation** when nothing changed (same variant, same build-id, same
   evidence). The card-guard blocks a second identical card. Output-style
   rule (quiet): such a turn answers with nothing.
6. **Pre-check in the tool.** `render_completion_card` runs the payload
   gates — title status word (1), validation owed, requirement gaps,
   undeclared background work, and a Light check still owed on a code-change
   card (run it, or pass `verification: { skipped: true, reason }`; the card
   then shows `⚠ ungeprüft — übersprungen: <reason>`) — before it renders
   (`hooks/lib/card-pregate.js`, same rules and reason texts as the Stop gates). A failing call returns
   `isError` with `[card-pregate] Not rendered …` and nothing to show: fix the
   payload and call again. The offline `--render-card` CLI runs the same check
   (refusal on stderr, exit 3). A `cwd` that lost its backslashes
   (`C:Users…`) is refused too — the concept link and repo mode read it. The same findings a second time render anyway, and
   the Stop gate still checks every card after the turn — the pre-check only
   saves the second render, it never replaces the gate.
7. **The answer travels in the card (#757).** When the turn answers a
   question, the full answer (markdown) goes into `render_completion_card`'s
   `answer` field. The renderer draws it ABOVE the card body: inside the
   Desktop widget as escaped HTML outside `#dc-card` (`lib/answer-markdown.js`:
   raw HTML shows as text, links need http(s), GFM pipe tables render as
   tables — #995), and as markdown in front of
   the terminal card. Safety net: a turn that ends WITHOUT any card, whose
   user prompt reads as a question and whose last assistant output carries
   no text, is blocked once by `stop.flow.guard` to re-emit the answer as
   plain text (`hooks/lib/card-guard-answer.js`); never for a turn with a card.
   Background: Claude Code asks Opus 5.5,
   Sonnet 5.5, Fable 5 and Mythos 5 for `thinking.display: "updates"`: text
   followed by another tool call (the answer before the card widget, a
   "show the user … verbatim" relay) comes back as a rephrased progress
   summary, not a text block. `ss.thinking.display` sets
   `CLAUDE_CODE_THINKING_DISPLAY_UPDATES=0` in the user's settings `env`
   (only when absent; Claude Code applies it live), which keeps it a text
   block — verified in Desktop session transcripts (2026-10-13: narration
   blocks before, text blocks after, same session). While that is
   missing, `pre.agent.relay` stands down and `pre.agent.announce` asks
   for the agent card in the turn's final text instead — also when the
   transcript already holds a `narration` block, which beats the env (`narrationSeen`).

## 6. Signs and colours

| Sign | Meaning | Where |
|---|---|---|
| `⚠` red | a reservation tied to red posts (heading) · `ungeprüft` (evidence) | heading, evidence |
| `✗` red | failed (tests, live check, preflight) | evidence, line 1 |
| `⛔` red | a ship-pipeline gate blocked | heading of `ship-blocked` only |
| `◐` yellow | partial (requirements, unverified part) | evidence |
| `✓` green (dim) | met / done | evidence |
| `○` / `●` grey | open / done | pipeline |
| lilac | code spans (names, build-id, branch), point numbers | widget only |
| red | never on names, branch or build-id | — |

Yellow/red on the budget marker follow § 2.4, independent of the above.

## 7. Session title prefixes

The title scheme — status and activity icons, keywords, the 👉/🟩 rule,
title = CTA, Interrupted, legacy prefixes and the process-prefix rules —
lives in [`session-title-scheme.md`](session-title-scheme.md). Side-session prefixes (`🔗 Linked`, `📦 Delivered`, `🤖 Team` with sessions) and their precedence rule: § Side sessions there.

## 8. Text rules (both languages)

- Sentence case, no exclamation marks, no "successfully".
- Numbers first in evidence posts (`3464 Tests grün`, not `Tests: 3464`).
- Verb first in ship/promotion headings (`Released`, `Promoted`, `Shipped`).
- The three warning signs are the only emoji besides the variant emoji in
  the heading and the ✨ marker (visible in the terminal, a markdown comment on
  Desktop — § 4).

## 9. Tool-schema field rationale

Moved to [completion-card-schema-notes.md](completion-card-schema-notes.md): why each `render_completion_card` field says what it says.

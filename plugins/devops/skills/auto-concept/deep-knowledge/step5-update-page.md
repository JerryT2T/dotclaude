# Concept step 5c–5d — appending rounds, the final report, resuming the watch

Appending rounds, the final report and its open points, re-confirming wakes and acting on exit reasons — execution detail of `SKILL.md` Step 5c and 5d, moved here verbatim. Each `##` section below is named by exactly one mandatory pointer in `SKILL.md`, at the place the text used to stand; read it completely before executing that step — it is as binding as the step itself.

## Reality-check round — template and markers

For `action: "implement"` that Step 5b step 0 diverted → append a **regular
iteration section carrying `data-reality-check` and
`data-reality-head="<examined sha>"`** instead, with the
`{{iteration.reality_tab}}` label on its tab and the `.reality-banner`
explainer as its first child. Everything else about the append is identical to
a normal iteration, including the append checklist and the `/reset` ordering.

**It also keeps the concept's template** (§ Step 1a · Template continuity): in
a `design` concept the collision cards go into a
round's one `section[data-view][data-view-kind="analysis"][data-analysis="full"]` (a topic of its own) alongside the design the round
is about, NOT into a `decision` round — a gate that swaps the reviewer's
feedback surface mid-session reads as the page breaking.
**Read the file back and confirm both attributes landed before `/reload`** — the
round FRAGMENT (`rounds/NN.html`), never the built page; the build keeps every
`data-*` of the section. A marker that silently failed to write re-arms a
check the user already answered.
See `deep-knowledge/reality-check.md` § The forced round.

## Review round — the switch `Umsetzung prüfen`

Authoring procedure for `action: "review"` (sent from the closing page's switch,
`templates-final-report.md` § The review switch). No code is written and nothing
ships: it is an `iterate`-like branch that appends ONE regular round.

1. **Checkpoint** `review:start`, then freeze the previous round as for any append
   (`bake`, step 1–2 of Final-report append). The closing page stays in the build;
   the review round is a new round after it.
2. **Gather the expectation** (`d-rev-expect`): the last concept round's decisions
   (`{name}-decisions.json` or the baked `#concept-decisions` of the round before
   the implement) plus the implementation plan (the mapping / brief checklist the
   implement ran from). Number every expectation line.
3. **Gather the actual:** the `git diff` of the implementation against the base, the
   changed files, and the running result. Real data (`d-rev-data`): if the app or
   CLI runs locally, run it on a real input and capture the output; if not, build a
   fixture and label it "Beispiel" (`.rv-badge`).
4. **Compare strictly:** one auto-note (`.rv-note[data-review-note][data-kind="deviation"]`)
   per expectation line the build does not meet exactly, in either direction.
   Everything in the diff that matches no expectation line is a **finding**:
   `.rv-note.rv-green[data-kind="finding"]` plus its own decision `rv-<slug>`
   (`single`: `keep` Behalten / `revert` Zurückbauen).
5. **Write `rounds/{N+1}.html`** with `data-review`, `data-review-from="<closing round>"`
   and the concept's template per Step 1a (never a template switch), tab label
   "Umsetzung"; the example first, then the notes beside what they concern. Same
   append checklist as § 5c; the round has the normal controls, so iterate and
   implement work as everywhere.
6. `build`, `/reload`, then `/reset` with the captured `_version` (the bridge treats
   `review` like `iterate`: reload before reset), re-launch the waker, end the turn
   with the `waiting` card. A later `implement` from this round rewrites only the
   `revert` answers plus the user's notes and appends a fresh closing page.

## 5c · Append procedure

The page is built from its source folder (`step2-build.md`): every step
below works on the round fragments and the build. **Never read or edit the
built page.** A page without a source folder gets `concept-build.js import`
first (`step2-build.md` § Legacy pages).

1. Save the `/decisions` payload of the submitted round N to a temp file
   (the scratchpad, never the repo).
2. **Freeze round N — `bake`:**
   `node "{PLUGIN_ROOT}/scripts/concept-build.js" bake "docs/concepts/{name}" --round N --payload <file>`.
   It writes the submitted values into `rounds/NN.html`: radios, checkboxes,
   textareas, inputs, selects, the mapping `submitted` and the dock's
   `data-frozen-feedback`. The build then applies the freeze attributes
   (`hidden`, `disabled`, `readonly`, design navigation exempt;
   `templates-rounds.md` § Freezing Past Iterations). `data-active` is the
   only attribute a freeze removes. The build guarantees that, so never strip
   anything by hand. A field the payload carries in a shape bake cannot map
   is a small `Edit` of `rounds/NN.html`.
   **Mappings:** bake writes each `mappings[]` entry as
   `"submitted": {cells, order, adhoc, slotNotes}` (`assigned`, `order`,
   `adhocItems`, `slotNotes`). A frozen mapping without a complete
   `submitted` renders the red `map.frozen_missing` banner and fails the
   gate (M9). When the build reports M9, the payload had no entry for that
   mapping. Fix the spec in the fragment.
2.5. **Verify form collection coverage — holds by construction.** The build
   copies the current engine verbatim on every build, including
   `collectDecisions()` with its generic
   `querySelectorAll('input, select, textarea')` catch-all scoped to
   `[data-active]` (`validation-gate.md` § Generic Form Collection). A field
   that must ship still needs a `name`, `id` or `data-*` key the catch-all
   reads.
2.6. **Engine drift check — holds by construction.** `validation-gate.md`
   § Engine drift on iteration append no longer needs a manual re-sync: every
   build re-copies the engine from the current templates, and an old page is
   re-synced on its first build after `import`.
3. Append a new round — **write `rounds/{N+1}.html`**, either yourself (round 1 logic,
   reality-check round, final report) or through the round author
   (`step2-build.md` § Round author). It holds
   `<section data-iteration="{N+1}" data-iteration-template="…">` with the
   updated / next-round content. The template attribute is mandatory and
   carries the concept's template forward (§ Step 1a · Template continuity).
   A round that silently switches it swaps the reviewer's whole feedback
   surface: new variants, refined options, whatever the feedback produced.
   `#concept-decisions` (`submitted: false`), the body class and the submit
   buttons come fresh from the build.
4. **`build`:** `node "{PLUGIN_ROOT}/scripts/concept-build.js" build "docs/concepts/{name}"`.
   It generates the tab chip for N+1 (active, `aria-selected="true"`; the
   previous chips stay clickable so the user can re-read their frozen
   history). It runs the gate and writes the page only on `OK`. On
   `BLOCKED`, fix the fragment it names and build again. Never POST
   `/reload` over a blocked build: the old page would reload as if it were
   the new round.
4.5. **Coverage:** run `concept-coverage.js` on the saved payload and fill
   every evidence slot of `checks/NN.md` (SKILL.md Step 5c); a `REPEAT` line
   is fixed in this round before the reload.
5. POST to the bridge: `curl -s -X POST http://localhost:{port}/reload`.
   The browser's `pollReload` loop sees the counter bump and calls
   `location.reload()`. The reload lands on the new active iteration
   because the HTML declares it via `data-active`.
6. **Only now** POST `/reset` with the captured `_version` (see cron
   prompt in Step 3). This stamps `_processed_at` on the server as the
   final step. The browser's `pollProcessedState` is a safety-net —
   it will only restore the panel state when a reload counter advance
   has been observed OR a long stale timeout elapses. See
   `deep-knowledge/templates-submit-journey.md` § Panel State Reset for the polling contract.
   **428 `no_reload_since_submission`** = no `/reload` since this
   iterate/implement submission arrived: the round was never delivered. Do
   steps 1–5 (bake, fragment, `build`, `/reload`), then `/reset` again —
   every part of the user's note gets an answer in that round, also when
   another task (cleanup, ship) follows. Never reset a round away without a
   new page; only a round that truly ends without one sends
   `{"version": N, "no_round": "<reason>"}` (journalled).
7. **Immediately re-launch the pickup waker** (Step 5d) — right here, not
   after the rest of the round. `/reset` clears the pending flag and
   `/reload` has already handed the user a fresh panel, so from this moment
   they can submit again. Every second between here and the re-launch is a
   window with nothing watching, and the cron cannot cover it: it fires only
   while the REPL is idle, and processing an `implement` keeps the REPL busy
   for minutes.

The tab bar is anchored at the top of the right-side decision panel —
above the section TOC and the submit block. It must never appear inside
the left-hand content area. Render as a compact vertical chip list.

Do NOT write a redirect file. Do NOT create a new `-v{N}` file. The entire
concept session — first render, every iteration, "nochmal neu" reworks —
lives in the single built `{date}-{slug}.html` and its source folder
`{date}-{slug}/`.

## Final-report append — steps and verbatim copy directive

1. Freeze the previous iteration the same way (`bake`, step 1–2 above).
2. Write `rounds/{N+1}.html` holding
   `<section data-iteration="{N+1}" data-iteration-template="free" data-final-report>`.
   The session writes it itself, because the implementation is in its
   context. The build makes it the live round. The `data-final-report` flag switches the panel to
   `panel-final-report` mode (no iterate/implement buttons — see
   `deep-knowledge/templates-final-report.md` § Final Report Panel). The template is
   **always `free`** and is never omitted: a report is a document,
   the `design` layout is built for a mockup, and a section that declares no
   template used to inherit whatever tab the reader came from — the same
   report rendered two different ways depending on the route taken to it.
   The ☰ panel does not move with that choice (§ Panel Chrome (all
   templates)), so the reader keeps the menu they have used all session.
3. Inside, write the report in **plain language** with the engine's report
   classes (`fr-*`, § Final Report Panel → Report body — no round
   stylesheet, no checkboxes). Top → bottom, copy the example HTML in
   `deep-knowledge/templates-final-report.md` § Final-report section HTML:
   - **No heading of its own**: the page header is the only title.
   - **One sentence "Was getan wurde"** — `.fr-sentence`, at most 170 characters.
     One sentence, not a paragraph.
   - **`.fr-main`**: left `.fr-results` with **"Was kam raus"** (`.fr-wins`, the top
     three functional results, each with its own glyph and one bold key phrase, at
     most 90 characters, no sub-bullets) and **"▶ Selbst ausprobieren"** (`.fr-try`,
     always when a URL exists; after a ship "▶ Live-Version öffnen"); right `.fr-ba`:
     two screenshots from browser QA (`data-label-before` / `-after`, one short
     caption each). Nothing visual changed → a short `.fr-flow` there instead. A
     login-gated route gets the one-line `.fr-try-auth` sign-in note, or the note
     alone when no sign-in works on that origin (`templates-final-report.md` →
     Try-it sign-in, #933).
   - **"Was es aushält"** (`.fr-holds`) — at most three requirement bars. The bar is
     a grade: `--fr-fill` is how far the requirement was met, `data-grade` is
     `full` / `part` / `low` / `open` (rules: `templates-final-report.md`). **Estimate
     the requirement yourself, always** and say "(geschätzt)" in the `data-tip`.
   - **Prüftiefe** (`.fr-depth`) — `.fr-depth-done` names the level that passed last,
     `.fr-depth-next` the next one not done; the whole ladder goes in `data-tip`.
     Test counts go in the 🛠 fold.
   - **🔍 N Funde unterwegs** (`<details class="fr-fold" data-open-questions>`,
     *optional — usually absent, see § Open points admission gate below*) —
     one plain `<li>` per Fund with was / wo / warum vorbelegt and the data
     attributes the panel reads. Together with the 🛠 fold inside `.fr-folds`.
   - **🧪 / 👉 data lists** (`<section data-tests hidden>` /
     `<section data-handoffs hidden>`, *only when there is something*) — at
     most three each, one short line: 🧪 what you could not verify yourself,
     👉 what the user has to do by hand after the merge (flip a cron, rotate
     a key). Each `<li>` carries `data-todo-id`, `data-crit` and `data-guide`
     (§ Funde, 🧪 and 👉 defaults below). The panel shows them as
     one list, "Bleibt für dich". Never a place for recommendations: work that is
     worth doing and in scope was built; work that is out of scope goes
     through the gate below or nowhere.
   - **🛠 Für Entwickler** (`<details class="fr-fold">`) — **at most five short
     lines** (every line costs output tokens): commit, areas + at most three
     key files, tests in one line, CI link. The only place for jargon.
   - **Nothing else.** No card, no "Nachtrag" section, no explanation paragraph: the
     build blocks them (`validation-gate.md` 33d). What could not be built is a Fund
     with `data-oq-origin="shortfall"`, not text on the report.
4. `build`. The build generates the final-report chip:
   **tab label `iteration.final_tab`** (locale: "Abschlussbericht" /
   "Final report"), never "{{iteration.tab}} N+1", with `aria-selected="true"` and
   `data-final-report` so the tab-bar JS can style it distinctly. A second
   final report, or one that is not the last round, blocks the build.
5. `submitted: false` in `#concept-decisions` and the body class come fresh
   from the build. The submit-button reset is irrelevant because the
   final-report panel doesn't surface iterate/implement at all.
6. /reload → /reset → **re-launch the pickup waker**, as steps 5–7 above.
   Step 7 is not optional here: the final-report panel still accepts the
   `finalize` submission, and `implement` is the longest round there is —
   leaving it unwatched is the widest window in the whole flow.

**Verbatim copy directive (mandatory):** on a built page the build copies
it (it is part of the engine) — this directive binds whatever assembles the
page, and is why a fragment never carries its own close-out JS.
The final-report JS block — `refreshCloseout`, `renderCloseout`,
`openQuestionBoxes`, `followUpRoute`, `routeDefault`, `followUpItem`,
`closeoutFundeSplit`, `collectFollowUps`, `collectIssueItems`,
`collectImplementItems`, `todoItems`, `todoDefaultMode`, `todoMode`,
`collectTodos`, `collectDisposition`, `renderGroup`, `renderDecideGroup`,
`renderTodoGroup`, `cycleRoute`, `jumpToFund`, `toggleTodoGuide`, `toggleTodoDrop`,
`showFinished`, `submitRefine`, `initBeforeAfter`,
`renderCloseoutPlan`, `renderDisposeLine`, `toggleDisposeEdit`,
`updateCloseoutButton`, `setCloseoutButtonState`, `setCloseoutFrozen`,
`restoreCloseoutToReady`, `submitFinalize`, `restoreInFlightCloseout`,
`markCloseoutStalled` — plus the delegated `closeoutSheetClick` wiring (the
two buttons submit through it with `ship.run` true / false), the `change` /
`input` listeners and the `DOMContentLoaded` wiring — MUST be copied verbatim from
`deep-knowledge/templates.md` (the block starting at the comment
`// --- Final-report close-out sheet (action: "finalize") ---`). Do NOT
inline a simplified sheet, bring back the accordion, a "Weiter ›", a progress
counter, a ship row or a files row, add a third button, or omit the
event-listener wiring; any omission leaves a visible-but-inert control or a
flow the user cannot finish. After writing, the post-generation validation
gate (`deep-knowledge/validation-gate.md` Phase 1) MUST find the panel-state
and close-out patterns (28–38b) in the generated file.

## Open points admission gate

The `[data-open-questions]` block (the 🔍 Funde fold) is the exception, not a closing
ritual. The normal final report has NO open points: the user approved a
scope, the scope was built, the report says so. Every row on that list asks
the user for a decision they did not ask to make, so a row has to earn its
place. Do NOT go looking for candidates — keep noticing things while you
implement, but noticing something is not the same as putting it in front of
the user.

Exactly three origins are admissible, and every item declares its origin with
`data-oq-origin`:

| Origin | `data-oq-origin` | What qualifies |
|---|---|---|
| Deferred by the user | `deferred` | The user explicitly parked it during THIS concept — a "später" / "nicht jetzt" comment, a variant they rejected for now but asked to keep, a decision card answered with "aufschieben". Name where (iteration + card) in `data-issue-body`. |
| Found on the way | `found` | Surfaced during implementation, has no or at most a remote relation to the concept's scope, and would be lost otherwise — a bug in a neighbouring module, a broken script you had to work around, a stale doc for a different feature. |
| Not built | `shortfall` | Approved scope that could not be built. Tried and failed, with the reason in the report's "Was" line ("nicht umgesetzt, weil …"); listed first; default route ⚡ when another try can work, else 📌. This is where a gap is reported: the report body does not repeat it. |

**Never an open point** — these are the rows that made the list a nuisance:

- **Anything in the approved scope.** If the user clicked implement on a
  round that contained it, it is scope: build it (see § `action:
  "implement"` step 2 — the approved scope is built in full). If it could
  not be built after a real attempt, it is a Fund with `data-oq-origin="shortfall"`
  and says why. Never a `found` or `deferred` label on a gap: that quietly turns a
  shortfall into a request for the user's signature.
- **The no-brainer next step of the scope** — "add the tests", "update the
  README for this change", "phase 4 of the same plan". If it is obvious, it
  is scope (`{PLUGIN_ROOT}/deep-knowledge/documentation-maintenance.md`
  already makes the doc update part of every change); if it is genuinely a
  separate scope, the user decides whether to start a new concept — a
  checkbox is not how that decision is asked.
- **Generic best-practice nudges** nobody asked for — "consider
  monitoring", "could use a cache", "re-evaluate on <date>".
- **Reality-check drift** that broke no contract — that is a mention in the
  🛠 fold (`deep-knowledge/reality-check.md`), not a row.

Self-check before writing a row: *would the user be surprised to see this
here?* A row they would expect ("of course phase 4 is next") is scope or a
new concept, never a row. A row they would not have thought of themselves
(the SAML bug that showed up in the smoke test) is a `found` row.

When no candidate survives, omit the section entirely — do NOT render an
empty stub, a "keine offenen Punkte" line, or a single padding row. The
panel handles the absence: the 🧭 group simply does not appear.

Each surviving item becomes one 🧭 row in the panel, pre-answered: the user
sees the route you chose and a one-word reason, and only taps it to change
the route (GitHub issue, "jetzt umsetzen" — built during the close-out, part
B — or nothing). Write `data-issue-body` for every item as if it were BOTH:
an issue read cold in three months and a brief handed to an implementing
agent ten minutes later. The presence of the block is what adds the 🧭 group
— see `deep-knowledge/templates-final-report.md` § Final Report Panel for the
HTML pattern. Funde are plain `<li>` elements, **never checkboxes** — the
panel is the only place to answer. More than three Funde: the panel keeps three
rows in view and "+N weitere" shows the rest, so list the ones that most need a
decision first. The validation gate rejects a final report whose Funde
lack `data-oq-origin`, or that carries a checkbox among them
(`deep-knowledge/validation-gate.md` pattern 33b).

### Funde, 🧪 and 👉 defaults

Claude pre-selects every answer in the panel; the user only corrects.

**Visible label length — hard rule.** The visible label of a Fund (`.oq-label`)
is a short noun phrase of **at most 28 characters**, because the panel shows it in
one line beside the route pill. The text of a 🧪 / 👉 item (`.todo-text`, else the
`<li>` text) is at most **48 characters** (two lines). Everything longer goes into
the report's `.fr-fkv` / `data-issue-body`. The gate blocks a longer label
(`validation-gate.md` pattern 33c).

**Small things are done, not asked (the row has to earn its place).** A
low-criticality point inside this repo that Claude can settle alone — a typo, a
stale hint, a cosmetic fix, a check Claude can run itself — is **done during the
implement** and named in the 🛠 fold; it never becomes a Fund or a to-do. Only what
lies in **another repo**, or is **large and complex and needs the user's input**,
stays visible.

**Funde — `data-route-default` + `data-route-reason` (one word):**

| Route | `data-route-default` | When | Typical reason |
|---|---|---|---|
| ⚡ Jetzt umsetzen | `now` | **The default tendency** for what is left after the rule above: inside this repo, and big enough to want a yes. | `im Repo`, `mittel` |
| 📌 Issue | `issue` | Only when it is **risky**, or **needs more preparation than a guide** (e.g. a concept first), or lies **outside the repo**. Size alone is NOT a reason. | `riskant`, `braucht Concept`, `außerhalb Repo` |
| Weglassen | `ignore` | The rarest: the current state works as is, is not a workaround, and the alternative would just be another way of doing the same. | `nur anders` |

**🧪 / 👉 — `data-crit` first, then `data-guide`:**

1. **Criticality** (`data-crit` = `low` / `mid` / `high`): a low item that survived the
   rule above is shown muted and struck (`skip`); ↩ brings it back. `mid` / `high` →
   it is needed, go on.
2. **Guided action needed?** (`data-guide`): set it ONLY when the step is an action
   on a THIRD-PARTY site (`web`: create an API key, OAuth app or account, put a
   secret into the hosting dashboard, accept terms → Web-Guide via `auto-guide`) or
   a system / desktop setting the user must change (`desktop`: OS setting, desktop
   scripts / takeover help) → "Führ mich" starts on. Trying, testing, looking at
   or using the user's OWN app or site (also on the phone, also "check it with
   real data") is a plain manual check the consumer manages without guidance:
   ALWAYS `data-guide=""` → switch starts off, item goes on the completion card.
   Default is off; no reason for guidance, no `web` / `desktop`. When the user
   switches "Führ mich" on for such an item, they get written steps
   (`guide: "inline"`).
3. **Never write or show "nicht führbar"** — Claude can always explain what
   to do. The gate rejects the phrase on a final report (pattern 37b).

**No further rounds from the final report; "🔧 Nachbessern" stays inside it.** The
panel omits the iterate / implement buttons. When the result does not fit, the
user's notes come back as `action: "refine"` (`step5-finalize.md` § Nachbessern)
and the same report is rewritten in place. A genuinely new scope is a new concept.

## 5d · Re-launch the waker, re-confirm every wake

**Re-launch the pickup waker.** It exited to wake you for the submission you
just processed, so nothing is watching `/pending` until you start it again —
exactly as in Step 3 (`bridge-server.md` § step 3, task 2), with
`run_in_background: true`. Do this at 5c step 7, the moment `/reset` lands; by
the time you reach 5d it should already be running.

**Before processing a wake, re-confirm.** Two wakers on the same port both exit
`PENDING_SUBMISSION`, and the second wake arrives after `/reset` has already
cleared the flag. Acting on it re-runs Step 5b — for `action: "implement"` that
means writing real code changes a second time, which no version guard catches
(`/reset`'s 409 only detects a *newer* submission). So on every wake, poll
`/pending` once before doing anything: `false` means the wake is stale — just
re-launch the waker and carry on. If it is `true`, compare `_version` against
the one you last processed: **equal means the previous round's `/reset` never
landed**, not that the user resubmitted. Retry the reset instead of running the
same payload again.

**One exception, and check it before applying that shortcut: `GET /recovery`.**
If a `reality-check-*` checkpoint sits on that same `_version`, the previous run
did not finish and simply fail to reset — it died mid-round, and the reset was
never due. Resetting there discards the user's implement click with no code, no
round and no error. Resume from the recorded verdict instead
(`deep-knowledge/reality-check.md` § Checkpoints and resume).

Skipping it is how a concept silently stops responding after iteration 1: the
page still shows a green indicator (the pulser keeps `claude_ts` warm), the user
submits again, and nothing picks it up until they ask in chat.

## 5d · Exit reasons, loop end, expected final-report action

**Act on the exit reason.** A background task announces why it stopped; each
reason has exactly one correct response:

| Exit line | What happened | Do this |
|---|---|---|
| `WAKER_EXIT reason=PENDING_SUBMISSION version=N action=<a>` | A submission landed — `version` is the `_version` to hand back to `/reset`, `action` its branch (`iterate` / `implement` / `finalize`) | Fetch `/decisions` and process it (Step 5a) on that branch, then re-launch the waker. If `/decisions` comes back not submitted it was a stale wake — re-launch and carry on |
| `PULSER_EXIT reason=WAKER_MISSING version=N action=<a>` | The pulser found a submission nobody was waiting for (the waker died without waking you) | Same as `PENDING_SUBMISSION`, and re-launch BOTH the waker and the pulser (this one has exited) |
| `WAKER_EXIT reason=SERVER_DEAD` | ≥ 5 min of continuous failed polls (each waiting up to 30 s) — the bridge process is gone, not merely busy | Restart the bridge server **on the same port** (do NOT pick a new one — the state file, the open tab and the pulser are all bound to it), then re-launch the **waker**. The pulser is still running — it never exits on request failures and reconnects by itself |
| `PULSER_EXIT reason=SERVER_DEAD` | ≥ 5 min of failed heartbeats while NO waker runs (between a pickup and the re-arm, e.g. during an `implement`), or an internal crash of the pulser; with a live waker it never gives up | Verify the bridge with one `curl /heartbeat` (relaunch on the same port if it is down), then re-launch the pulser |
| `PULSER_EXIT reason=DUPLICATE_PULSER` | An OLDER pulser is already pulsing this port (the watchers survive a session restart on Windows; `ss.concept.resume` re-arms them anyway) — this younger one stepped down | Nothing. The beat is covered |
| `WAKER_EXIT reason=DUPLICATE_WAKER` | A YOUNGER waker took over this port — a newer session re-armed the watchers, and this one belonged to the superseded session | Nothing. Do not re-launch; the newer waker wakes the session that owns the concept now |
| `*_EXIT reason=STATE_GONE` | `.claude/concept-active.json` has been gone for 3 consecutive polls (~1 min — a rewrite window is tolerated) — the concept ended (the waker already POSTed `/shutdown`) | Nothing. Do not re-launch; the session is over. After a close-out: a silent turn — no text, no title change |
| `WAKER_EXIT reason=HTML_GONE` | The concept page was deleted from disk — the waker shut the bridge down | Nothing to re-launch. `CronDelete` a legacy `cron_id` if the state file names one and remove the state file if it is still there. After a close-out (the state file is already gone): a silent turn — no text, no title change |
| `*_EXIT reason=STATE_NEVER_APPEARED` | The launch outran the step that writes the state file | Write it, then re-launch. NOT the same as STATE_GONE — the concept is alive |
| `*_EXIT reason=PORT_CHANGED` | A newer concept took over | Nothing. This task belongs to a superseded session |
| `*_EXIT reason=FOREIGN_BRIDGE port=N` | The bridge answering on the port reports a different `html_path` than the state file — ours died and another session's bridge reused the port. The watcher left without `/shutdown` and without waking as pending | Tell the user, then restart this concept on a **fresh** port (Step 3: pick a new port, rewrite the state file, re-arm both watchers and the cron) and give the new URL. Never POST `/shutdown` to that port and never process its `/pending` — it is another session's concept. The concept-tick prints the same `FOREIGN_BRIDGE:` instruction |
| `*_EXIT reason=<cleanup reason> bridge=foreign` | A cleanup exit (`STATE_GONE` / `PORT_CHANGED` / `HTML_GONE`) found a foreign bridge on the port (via `GET /identity`) and skipped the `/shutdown` | Same as the cleanup reason without the suffix — the foreign bridge is left running |
| No `*_EXIT` line at all | The task died without announcing why — bad arguments, a crash, `node` missing, killed | Do NOT assume the session ended. Verify the bridge with one `curl /heartbeat`, then re-launch both tasks |

Re-launch the pulser only when you actually saw a `PULSER_EXIT` — normally it
runs for the whole session and a second one on the same port is wasted work.

Then return to Step 4 (monitor for next submission). The loop continues until:
- The user closes the page
- The user says "fertig" / "done" in chat
- There are no more decisions to make (all items processed)

If the active section is the final report, the submission Claude expects is
`action: "finalize"` — one payload from the close-out sheet carrying
`issues` (open points routed to a GitHub issue), `implement` (open points the
user wants built now), `ship` (run the release or not) and `disposition`
(discard / keep / gitignore + optional moveTo). Legacy pages may
still send `ship`, `create-issues` or `dispose-concept` individually; map them
per Step 5b § Legacy final-report actions.

`refine` ("🔧 Nachbessern") is the other expected action: `step5-finalize.md`
§ Nachbessern. All other action types from the final-report panel should be treated as
protocol errors and reported back to the user.

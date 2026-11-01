---
name: auto-concept
version: 0.2.2
description: >-
  Interactive HTML page for analysis, plans, concepts, prototypes or
  comparisons; opens it in the browser and feeds the user's decisions back
  into the workflow. Also suggest it after analysis or planning that needs
  decisions. Do NOT trigger for: code explanations, debugging, static docs.
  Triggers on: "concept page", "interactive plan", "show me this as a page",
  "visualize this".
layer: 2
invokes: [do-ship, auto-agents, auto-issue]
user-invocable: false
triggers:
  en: ["concept", "concept page", "interactive plan", "show me this as a page", "visualize this"]
argument-hint: "[topic, analysis result, plan, or concept to visualize | --report]"
allowed-tools: Read, Write, Glob, Grep, Bash(start *), Bash(cmd *), Bash(python *), Bash(curl *), Bash(kill *), Bash(node *), AskUserQuestion, CronCreate, CronDelete, mcp__Claude_Browser__*, mcp__Claude_Preview__*, mcp__plugin_playwright_playwright__*, mcp__plugin_devops_dotclaude__health_check, mcp__plugin_devops_dotclaude__get_usage, mcp__plugin_devops_dotclaude__render_completion_card, mcp__ccd_session_mgmt__get_session, mcp__ccd_session_mgmt__set_session_title
---

# Concept

Generate an interactive HTML page for `$ARGUMENTS`, open it in the browser,
and monitor for user decisions.

## How this skill reads

Each step keeps its contract here and names the deep-knowledge section that holds the detail in a `See …` line — read it when you reach that step and the detail is not already in your context; skip sections for branches you are not on (another template, a fallback, another `action`). A `Run node …` line means execute the script and use its output; do not read the script.

**A feedback round reads** (Step 5, `iterate` / `next-stage`) — these, and
others only when the payload needs them (attachments, a mapping, an implement):

- `deep-knowledge/step5-process.md` § Mark the round as work
- `deep-knowledge/step5-process.md` § 5a · Read and parse
- `deep-knowledge/step5-process.md` § 5b · iterate steps 3–5
- `deep-knowledge/step2-build.md` § Freezing the submitted round — `bake`
- `deep-knowledge/step2-build.md` § Round author (Step 5c, rounds 2+)
- `deep-knowledge/step5-update-page.md` § 5c · Append procedure
- `deep-knowledge/step5-update-page.md` § 5d · Re-launch the waker, re-confirm every wake

Re-read one of them only when it has left your context (after a compaction). 
## No reachable bridge ≠ no concept

A concept request always produces **this skill's page**: the `templates.md`
engine, a template and content variant, the decision panel, the validation
gate, the file under `docs/concepts/`. The bridge is mandatory wherever it can
run — every Desktop or local CLI session runs Step 3 unchanged. Only a session
whose owner **cannot reach** a localhost bridge (a claude.ai cloud or remote
container, no local browser) takes the fallback in Step 3 § No reachable
bridge — and even there only the *transport* changes, never the page. A
hand-built look-alike page with its own decision storage is never a
substitute (#568).

## Step 0 — Load Extensions

Injected by the override loader (`[skill-overrides]` block); none shown → none exist.

## Step 0.5 — Concept Mode (asked once, at the start)

Before Step 1 runs for the **first** iteration, settle which kind of
concept the user wants. Three modes exist:

| Mode | What the page is | Templates in scope |
|---|---|---|
| **decision** | Pure decision concept — non-visual alternatives to weigh (architecture, strategy, library, approach, …) | `decision` (plus `free` for surrounding analysis) — no mockups |
| **design** | Pure design concept — visual directions / mockups / click-dummies | `design` only — no decision views, no `decision` iteration |
| **mixed** | Both — the visual call AND the non-visual calls belong to the same concept | `design` iteration(s) carrying decision views where the question is *about the mock*, and/or a separate `decision` iteration where it stands on its own (entangled-questions rule in 1a) |

See `deep-knowledge/step1-templates.md` § Step 0.5 · Asking, the do-batch start, count preferences. Ask exactly ONE `AskUserQuestion` (mixed first, "(Recommended)") unless the prompt names or unambiguously implies the mode or a caller pins the template — then skip it; lean to mixed when the prompt allows two readings; no "Erstmal in Ruhe durchlesen" prefix; a typed "Other" is a real answer; a `--from=do-batch` start derives the mode from its open decisions and never drops a coverage line; the mode is decided once per concept and feedback widens it silently; plus the count preferences (7 alternatives, 3 designs, top 3–7 annotations — the user's count wins).

## Report-only entry (`--report`) — the Abschluss without a prior concept

Only for `auto-concept --report` (another skill calls it after an
implementation that had no concept page); every other invocation skips this
section.

See `deep-knowledge/step0-report.md` § Report-only entry. When the page opens at all (a Fund, 🧪, 👉 or open ship decision; else the card alone), the `init --report` scaffold, authoring the report, Step 3 unchanged with `finalize` as the only action, and the scope (never for backlog / audit decisions).


## Step 1 — Pick Template, then Content Variant

### 1a. Pick the template — per iteration

See `deep-knowledge/step1-templates.md` § 1a · Per-iteration choice. The template is picked anew for every iteration, never once per page.

**Order of evaluation (per iteration)** — first match wins;
`free` never while `design` or `decision` would also fit.

1. **Is this iteration primarily VISUAL?**
   Layouts, design directions, screen composition, a click-through flow,
   any "design me / sketch / lay out a UI" task → `design`. **Stop.**

See `deep-knowledge/step1-templates.md` § 1a · Design iteration authoring. Click-dummy wiring, screens as states, competing designs, single-screen, design system, annotation layer, optional views and the view-vs-decision-iteration rule of thumb.

See `deep-knowledge/step1-templates.md` § 1a · Variant overview and orthogonality. ≥ 2 designs get the overview attributes (motto, three traits, icon, `data-design-set`, the optional Favourite); a view never re-asks the design choice, never lists the designs or their traits, never pre-decides one.
See `deep-knowledge/step1-templates.md` § 1a · Orthogonality test. The pre-authoring test, the one-line "needed by" exception and gate P31.

2. **Are there ≥2 substantive non-visual alternatives?**
   2+ mutually-exclusive alternatives (architecture, tech, strategy, library,
   approach, …) with pros/cons to weigh → `decision`. **Stop.** Skipped in
   **design** mode (Step 0.5).

3. **Otherwise → FREE.**
   Analysis, walkthrough, brainstorm, explainer, timeline, retro — content
   with no variant framing. Tri-state is opt-in per section.
   An iteration whose question is "which of these many items goes where" —
   an assignment, not a choice between alternatives — is a `free` round
   carrying ≥ 1 `section[data-mapping]`; inside a design concept it is a
   `data-view-kind="mapping"` subpage instead. (Authoring rules: § 1c;
   markup: `deep-knowledge/templates-free.md` § Mapping block (optional).)

See `deep-knowledge/step1-templates.md` § 1a · Entangled questions and layout signatures. Entangled visual and non-visual questions are split into a `design` and a `decision` iteration, never mixed into one layout, and the decision round after a design round stays orthogonal to it; plus the per-template layout signatures, the shared ☰ / 💬 chrome and the `prototype` alias.

**Template continuity — decide once, per concept.** Once a concept has
rendered a `design` round, every later round stays `design` unless the user
asked otherwise — a later non-visual question goes into a
`data-view-kind="decision"` view inside a design round. Exactly two
exceptions: the **mixed mode** of Step 0.5, and the **final report**, which is
always `free` (a document with a TOC).

See `deep-knowledge/step1-templates.md` § 1a · Why continuity. What a template swap does to the reviewer and why the section must carry its template.

Set `data-iteration-template="..."` on each `<section data-iteration="N">` —
this is the **authoritative** value per iteration, and it is required on
every section you append (regular round, reality-check round, final report).
See `deep-knowledge/step1-templates.md` § 1a · Template projection. How `applyIterationTemplate()` mirrors the active iteration onto `<html data-template>`.

### 1a-ii. If template is `design`: declare the target form factors

See `deep-knowledge/step1-templates.md` § 1a-ii · Form factors. Declare `data-viewports` (+ default / orientations) from evidence — a desktop tool declares nothing, phone-only declares `phone` — and the markup a device-view screen may not contain.

### 1b. If template is `decision`: pick a content variant

See `deep-knowledge/step1-templates.md` § 1b · Content variants. Pick analysis / plan / concept / comparison / dashboard / creative by content — recommendations, hybrids allowed; design and free have no sub-variants; every question is a decision in its mode.

### 1b-ii. If the round shows analysis results or asks any decision: Full or Lite, mode, display

See `deep-knowledge/step1-templates.md` § 1b · Analysis results and decisions — Full vs Lite. Full (a concept that is analysis + decisions: briefing, ≤ 3 Themenfelder × ≤ 7) vs Lite (≤ 5 questions inside another concept), the briefing order, kurz / lang per level.

See `deep-knowledge/decision-modes.md`. The seven modes and when each fits, the mandatory fields of every decision, label rules, preselection = recommendation, timing is never a decision.

See `deep-knowledge/analysis-palette.md`. The 35 display types by content shape, slot budgets, the one text type, style rules and profiles for custom displays.

### 1c. If the iteration carries a mapping: author the spec

See `deep-knowledge/step1-templates.md` § 1c · Mapping spec rules. What Claude writes vs what the engine renders, then proposal, ids, counts, tiers, accepts, elements vs axes, labels and the note channel per home.

## Step 2 — Generate HTML

The page is **built** by `scripts/concept-build.js` (engine from the current templates, content from one fragment per round); Claude never copies, reads in full or edits the built page.

**Own worktree first.** When the session sits in a git repo's MAIN checkout (not a linked worktree), call `EnterWorktree` (`{"name":"concept-<slug>-<4 random chars>"}`) BEFORE `init` writes the first concept file or the bridge starts — the standing devops rule counts as the instruction, and with `workspace.ownWorktree` set (or unset) this is never a question to the user. `concept-build.js` writes through node, which the Edit/Write branch guard never sees: a page started in the main checkout runs there until the first blocked brief write. A read-only concept outside any repo, or a session already in a worktree, starts directly.

See `deep-knowledge/step2-build.md` § Layout. The built page, the source folder, `page.json`, `head.html` and the round fragments.
See `deep-knowledge/step2-build.md` § The build — `scripts/concept-build.js`. `init` / `build` / `bake` / `import` / `check`, and what every build does (engine, head, frozen rounds, tabs, gate).
See `deep-knowledge/step2-build.md` § What Claude writes. A fragment holds exactly one round section; the built page is never written by hand.

### Engine source (templates.md, never an older page)

See `deep-knowledge/step2-generate.md` § Engine source. Mock CSS namespacing, what is copied verbatim from templates.md, why older pages are content references only, the STALE ENGINE gate.

See `deep-knowledge/step2-generate.md` § Localisation, design, page anatomy, submit actions. Localisation, design defaults, page header, decision panel layout and anatomy, interactive elements, bi-state evaluation, and the iterate / implement split button (a panel submit alone never changes code).

See `deep-knowledge/step2-feedback.md` § Feedback dock, persistence, feedback mechanism. The 💬 dock, annotation layer, views, reload resilience, the comments-are-never-lost guarantees, the page version tag and the `#concept-decisions` data layer.

### File Location

Built page `docs/concepts/{timestamp}-{slug}.html`, source folder `docs/concepts/{timestamp}-{slug}/` (`init` once, `rounds/01.html`, `build`).

See `deep-knowledge/step2-feedback.md` § File naming and iteration tabs. The naming pattern, the discard default, one file per session and the iteration tab rules.

### Post-Generation Validation (gate)

`concept-build.js build` runs the deterministic gate and writes the page only
when it passes; the Phase 1 engine patterns hold by construction. Before the
build, check the round against Phase 0 and its template's Phase 2, plus the
M-set when it has `[data-mapping]` (`deep-knowledge/validation-gate.md`).
**If ANY pattern is missing → DO NOT open the page.** Fix it, re-validate.

## Step 3 — Open in Browser

Open the generated HTML file **inside the user's existing Edge window** as
a new tab, never in a separate browser window.

### No reachable bridge — hand-off fallback (cloud / remote sessions)

See `deep-knowledge/step3-open-browser.md` § Hand-off fallback. Only when the owner cannot reach localhost (cloud / remote container, no local desktop) — never for speed, tokens or a failed first Edge start; then Steps 0–2 in full, commit + push, the one-line hand-off, no bridge / crons / Edge.

### No reachable bridge, owner decides remotely — artifact fallback (#589)

See `deep-knowledge/step3-open-browser.md` § Artifact fallback. Second tier: only when the hand-off applies AND the owner wants to decide now from a remote device AND the Artifact tool exists; build, publish and read back.

### MANDATORY — Real Edge browser only

The concept page is opened in the user's **real Edge browser** via the
OS shell. **Forbidden alternatives** that will produce a broken session:

- ❌ **Never** use `preview_start` / `preview_*` (`mcp__Claude_Browser__*`, formerly `mcp__Claude_Preview__*`) to
  display the page — a sandboxed iframe with no heartbeat or polling.
- ❌ **Never** use `mcp__plugin_playwright_playwright__browser_navigate`
  — its own browser instance, invisible to the user.
- ❌ **Never** print "Concept opened at file:///… open it in your browser"
  and stop — the bridge needs `http://localhost:{port}/…`, not `file://`.
- ❌ **Never** bake a "copy the decisions JSON and paste it into the chat"
  block (clipboard button, `navigator.clipboard`, "In Zwischenablage
  kopieren", "füg es mir in den Chat ein") into the page. The decision
  panel's two submit buttons + bridge are the **only** sanctioned mechanism,
  and the panel may never be omitted; `post.concept.gate` blocks violations.

See `deep-knowledge/step3-open-browser.md` § Open command, 200 gate, token check. The per-platform open command, the HTTP 200 gate, the `--accent-color` check in an isolated profile, and what to do when the open fails.

### Concept Bridge Server + Edge

See `deep-knowledge/step3-open-browser.md` § Bridge server, background tasks, sidebar title, user notice. Port pick, state file, heartbeat round-trip, the keepalive pulser and pickup waker, the reality-check baseline, the sidebar compass and the opening message.

### Completion cards while the concept is open

See `deep-knowledge/step3-open-browser.md` § Completion cards while the concept is open. The `concept.phase` table, session-title prefixes, what goes into `pending`, and the URL line.

## Step 4 — Monitor via HTTP Bridge

The bridge server handles all communication — no JS eval injection needed.

See `deep-knowledge/step4-monitor.md` § Heartbeat, pickup and polling schedule. The heartbeat POST, `/pending` vs `/decisions`, waker (+ pulser backup, no cron), initial wait, no timeout, never blocking the conversation.

## Step 5 — Live Feedback Loop

See `deep-knowledge/step5-process.md` § Step 5 · The cycle. Submit → read → process → update the page → the user can act again.

### Mark the round as work

See `deep-knowledge/step5-process.md` § Mark the round as work. The compass-to-hourglass swap on a confirmed wake and the card that ends the round.

### 5a. Read & Parse
See `deep-knowledge/step5-process.md` § 5a · Read and parse. Parsing, opening every attachment, the coverage check and reading `mappings[]`.

### 5b. Process & Act — branch by `action`

The submit payload carries an `action` field — `"iterate"` / `"implement"`
from an iteration panel, `"finalize"` from the final report's close-out
sheet. Branch on it:

See `deep-knowledge/step5-process.md` § 5b · Checkpoint duty. The `/progress` checkpoints, the namespaced finalize actions and verify-never-trust on resume.

**`action: "iterate"` (default — "Zur nächsten Runde" button):**
1. **Summarize** what was selected/rejected/commented
2. **Do NOT modify code, files, or external systems** — iterate ONLY updates
   the concept page
See `deep-knowledge/step5-process.md` § 5b · iterate steps 3–5. Advancing the reality-check baseline, mapping proposals and ad-hoc items, proceeding to 5c.

**`action: "next-stage"` (staged concepts, "Nächste Etappe" button):** like iterate — concept page only, no code — but the next round carries the next stage's `data-stage`.
See `deep-knowledge/step5-process.md` § 5b · next-stage. Payload fields, next-round `data-stage`, build recomputes `current`.

**`action: "implement"` ("Mit Feedback implementieren" button):**

**Channel extras.** Started with a `--from=<name>` other than `do-batch` →
before step 0 run `node "{PLUGIN_ROOT}/scripts/run-extras.js" from <name> --skill auto-concept`.
Exit 126 or `"known":false` → nothing changes. `known:true` → read the `doc`
§ `section` it names and do what it says before step 0.

0. **Reality check — run this BEFORE writing anything.** The default branch may
   have moved since this concept was written, which would make the approved plan
   produce wrong, dead or duplicate code. Full procedure, force classes and
   resume semantics: `deep-knowledge/reality-check.md`. In short:
   - **Skip the check entirely** when the just-submitted section carries
     `data-reality-check` — that round WAS the check, and implementing from it
     goes straight through. This is what makes a second forced round impossible.
   - Otherwise `POST /status {"phase":"reality-check","version":$NOTED_VERSION}`
     (before the fetch, so the longer wait stays legible), then run
     `node "{plugin-root}/scripts/concept-drift.js" --state "{session-cwd}/.claude/concept-active.json" --owner {owner} --paths "<paths the concept names>"`.
   - `verdict: "skip"` or `"clear"` → advance the baseline (`--capture --sha
     <advanceTo>`) and continue with step 1 below. Every unresolvable condition
     — no remote, offline, force-pushed baseline — lands here: the check never
     blocks an implement order.
   - `verdict: "candidates"` → apply the force classes. Nothing that must force
     → continue with step 1, mentioning the drift in the final report. Something
     must force → checkpoint `reality-check-forced`, then append ONE
     reality-check round instead of implementing (Step 5c) and stop. Do NOT post
     `phase: "implemented"` — no code was written.
See `deep-knowledge/step5-process.md` § 5b · implement steps 1–4. Mapping as spec, execution through `auto-agents`, the full approved scope, the `implemented` phase POST and the final-report append.

**`action: "finalize"` (close-out sheet — only on the final report):**

See `deep-knowledge/step5-process.md` § 5b · finalize payload and zero-prompt invariant. The one `finalize` payload, disjoint item buckets, and never a follow-up question.

**Fixed execution order — A (issues) → B (implement) → C (ship) → D
(cleanup).** Never reorder: issues are independent, follow-ups land before
the release, ship is the one part that can hard-fail, and cleanup can DELETE
the concept HTML. Skip any part whose flag is false; with none set, finalize
is just Step 6. Part E (tests and hand-offs) follows D, below.

**Checkpoint each part as it lands** (see Checkpoint duty above) — a finalize
that dies mid-flight must be resumable without re-creating issues or
re-shipping.

### A · Issues (`issues.create === true`)

See `deep-knowledge/step5-finalize.md` § A · Issues. Item shape, the user-value gate, the `auto-issue` hand-over, label enrichment, body backlink and the report rewrite.

### B · Implement the selected follow-ups (`implement.run === true`)

See `deep-knowledge/step5-finalize.md` § B · Implement the selected follow-ups. The `auto-agents` dispatch, checkpoints, the report rewrite, the Nachtrag and unbuildable items.

### C · Ship (`ship.run === true`)

See `deep-knowledge/step5-finalize.md` § C · Disposition staging per mode. Step 0 stages the `disposition` first, index only, committed on the branch before the ship; what the staging does per mode; the durable-store copy and the Step 6a table it cites are in `deep-knowledge/step6-closeout.md` § Disposition, cleanup procedure and disposition tables.
1. Run the full ship pipeline via the `do-ship` skill (ship_preflight →
   ship_build → ship_version_bump → ship_release → ship_cleanup) with
   `--card-data` in its args (`step5-finalize.md` § C). The execute click authorises the ship; it does NOT waive the gates `ship` already
   enforces. If a gate blocks, report the blocker to the user and STOP —
   never fake a completion or force past a failing gate. (A force-push to
   main/master still requires explicit user confirmation per the user's own
   rules — the execute click does not stand in for that.)
2. **On a blocked ship, stop the whole finalize here.** Issues created in
   part A and follow-ups built in part B stand; part D does NOT run. POST
   `/reload` then `/reset`, leave the concept session open so the user can
   retry from the sheet, and report the blocker verbatim. Never fall through
   to cleanup — a `discard` disposition would delete the concept the user
   still needs.
3. On a successful release, rewrite the final-report fragment in place (then `build`):
   add a one-line "Shipped" note (version + tag) to the Zusammenfassung.
4. **The ship card comes last.** Once `ship_release` has merged (the ship can
   no longer block), run part D and Step 6a in full — bridge, pulser and
   waker stopped — and only then let `do-ship` render its ship card. A card
   rendered before the stop is followed by the watchers' exit notifications,
   and the chat no longer ends on the outcome. Delegated ship: `step5-finalize.md` § C.

### D · Close out

See `deep-knowledge/step5-finalize.md` § D · Reload and reset per disposition. `data-closed`, reload-before-reset for keep / gitignore, reset-only for discard; then Step 6a, and the card choice only after the stop (the held-back ship card, or the concept card).

### E · Tests and hand-offs (`tests[]`, `handoffs[]`)

See `deep-knowledge/step5-finalize.md` § E · Tests and hand-offs. Per-item `mode` / `guide` processing (guide web / desktop / inline, self → completion card, skip → dropped) and the pre-selection rules for Funde, 🧪 and 👉. Runs after part D; never when part C blocked.

### Legacy final-report actions

See `deep-knowledge/step5-finalize.md` § Legacy mapping, rationale and the critical invariant. `create-issues` → part A + Step 6, `ship` → part C + Step 6, `dispose-concept` → part D only (never the ship pipeline), part B never for a legacy page; `iterate` never changes anything outside the concept HTML, and within finalize only B writes code and only C reaches outside the repo.
### 5c. Update the Page
After processing, **append a new round**: `bake` the submitted round, write `rounds/{N+1}.html`, `build`, signal
the browser to reload. This is the ONLY update path — every "append a section to the HTML file" below means this.

See `deep-knowledge/step2-build.md` § Freezing the submitted round — `bake`. The payload goes into the submitted round's fragment; the build freezes its attributes.
See `deep-knowledge/step2-build.md` § Reading — only what the round needs. Never the whole page; the previous fragment only when the round builds on it.
See `deep-knowledge/step2-build.md` § Round author (Step 5c, rounds 2+). The round brief, the `concept-author` agent (`concept.roundAgent`, default on) and what stays with the session.
See `deep-knowledge/step2-build.md` § Legacy pages. A page without a source folder is imported once before its next round.

For `action: "iterate"` → append a regular iteration section.
For `action: "implement"` → append a **final-report section** (one-time,
see § "Final-report append (implement only)" below).
See `deep-knowledge/step5-update-page.md` § Reality-check round — template and markers. An `implement` that Step 5b step 0 diverted appends a regular iteration carrying `data-reality-check` / `data-reality-head` instead; the forced round keeps the concept template, and both markers are read back before `/reload`.
For `action: "finalize"` → no new section; rewrite the existing final-report
fragment in place and `build` (linked `[Issue #NNN]` labels for routed items, a shipped note
when part B ran) and POST `/reload`.

Procedure on every iteration (including the very first response to feedback).

**Order matters — `/reset` is the LAST step, NOT the first.** An early
`/reset` re-enables the OLD iteration's submit buttons before the new one is
live, inviting a duplicate submission.

**Coverage before `/reload` — the session checks the built round itself**, also when `concept-author` wrote it. After `build` passes:

1. Run `node "{PLUGIN_ROOT}/scripts/concept-coverage.js" --payload <saved payload> --dir "docs/concepts/{name}"`. It writes `checks/NN.md`, one line per remark (comment, note, pin, annotation answer) with the state it lives in (`rest | hover | focus | scroll | cursor | animation`), known miss patterns and an empty evidence slot, and prints `CHECK` and `REPEAT` lines.
2. Fill every evidence slot with a tool result from this session that shows that element in that state on the built page: hovered for `hover`, its rect against the `.panel-fab` (☰) / `.feedback-fab` (💬) rects for `fab-overlap`, `getComputedStyle(el).cursor` for `cursor`, after `focus()` / `scrollTo` / the transition for the others. Measure with your own browser tool on the localhost URL; this is a check, not the user's view (Step 3's real-Edge rule governs what the user sees). A rest-state screenshot is evidence for `rest` only. A slot you cannot fill is a fix to make before `/reload`.

**Patterns to avoid** — misses seen in real rounds; a REPEAT that shows a new class adds a line:

- Hover overlap: what grows or appears on hover covers the ☰ / 💬 FABs or is covered by them — measure hovered, with the maximum item count.
- Label vs input: a remark about the field's hint or label applied to the input (or the reverse) — name in the evidence the element the user named.
- Cursor: a text cursor on a clickable item, or an oversized custom cursor.
- A requested visual highlight answered with a minor tweak — name the visible change in the evidence.

**On a `REPEAT <id> ~ round N <id>` line** the earlier fix did not hold: spawn the `qa` agent with fresh context, giving it both remarks verbatim, the built page path and its localhost URL; it finds from the page why round N missed it (wrong element, wrong state, untested size). Fix it in this round, then capture the lesson with the `do-learn` skill. In the plugin source repo also add a replay eval case under `plugins/devops/evals/skills/auto-concept/` modelled on `round-replay-r6-hover`.

See `deep-knowledge/step5-update-page.md` § 5c · Append procedure. The numbered append procedure: freeze, coverage, engine drift, append, tab, /reload, /reset, re-launch the waker.

### Final-report append (implement only)

For `action: "implement"`, step 3 of the append procedure appends a
**final-report section** (`data-iteration-template="free"`) instead of a
regular iteration; everything else stays identical.

See `deep-knowledge/step5-update-page.md` § Final-report append — steps and verbatim copy directive. Freeze, the `free` final-report section, report structure, tab label, the close-out JS copied verbatim.

**Open points section — admission gate (default: no section):**

See `deep-knowledge/step5-update-page.md` § Open points admission gate. Default no section; admissible only `deferred` (parked by the user in this concept) or `found` (outside the scope, found on the way), each row carrying `data-oq-origin`; never scope, next steps, nudges or harmless drift; no further iterations from the final report.

### 5d. Resume Monitoring

See `deep-knowledge/step5-update-page.md` § 5d · Re-launch the waker, re-confirm every wake. Re-launch the pickup waker at 5c step 7; poll `/pending` before acting on a wake — `false` = stale, equal `_version` = retry the reset, unless `GET /recovery` shows a reality-check checkpoint on it.

See `deep-knowledge/step5-update-page.md` § 5d · Exit reasons, loop end, expected final-report action. The one correct response per `*_EXIT` reason, when to re-launch the pulser, back to Step 4 until the user closes the page / says done / nothing is left, and only `finalize` (or the three legacy actions) from the final report — anything else is a protocol error.

### 5e. Persist
Write a cumulative summary to `docs/concepts/{same-timestamp}-{same-slug}-decisions.json`
after each iteration (append a new entry per iteration — don't overwrite
previous rounds; each entry records its `iteration` number).

## Step 6 — Completion Card

The loop ends when the user says "fertig"/"done", closes the page, or all
items are processed.

### 6a. Clean up the active-concept state — Cleanup-By-Disposition

Before the card: stop the bridge, the pulser and the waker, remove the state
file, and dispose of the on-disk artefacts per the user's disposition. Nothing
of the concept may still run when the card renders.

See `deep-knowledge/step6-closeout.md` § Disposition, cleanup procedure and disposition tables. The disposition is the `finalize` payload's, else the last legacy payload's, else `discard`; the `/shutdown` + owner-checked state-file removal, stopping the watchers before any card, the title restore, the cron delete, and the per-mode file and durable-store tables.
See `deep-knowledge/step2-build.md` § Close-out. The source folder shares the page's disposition.

**UNPROCESSED guard — never discard unseen work.** Before any `rm -rf` of a
store, check for `.claude/concepts/{date}-{slug}/UNPROCESSED` — a submission
the user never saw a result for, which a default `discard` would silently lose.

See `deep-knowledge/step6-closeout.md` § UNPROCESSED guard command, orphan sweep, safety rules, reporting. The guarded store deletion, what to do when the guard trips, the 7-day orphan sweep, the path safety rules and the disposition line on the card.

### 6b. Render the completion card

Call `mcp__plugin_devops_dotclaude__render_completion_card`:

See `deep-knowledge/step6-closeout.md` § 6b · Variant and card fields. Variant `analysis` (read-only result), `ready` (code changed in Step 5b) or `aborted` (discarded / aborted), the fields to pass, and never a `concept` field.

Output the returned markdown verbatim as the last thing in the response —
nothing after the closing `---`.

If the concept is part of a larger task (e.g. called mid-flow from another
skill), skip the card and return control — the parent skill renders its own.

### 6c. Pause and resume (#555)

"pausieren" / "machen wir später weiter" → **pause**, not close-out: stop
every process, keep page, decisions and store, end with the `paused` card.
Resume only when a prompt continues this concept. Procedure:
`deep-knowledge/pause-resume.md`.

## Smart Trigger Rules

Auto-suggest (never auto-trigger) after a 3+-option analysis, a 5+-step plan,
a comparison or variant work: append "Soll ich das als Concept-Seite
aufbereiten?". Not for yes/no questions, single recommendations, code-only
output, or after the user declined one this session.

## Rules

- Self-contained HTML (< 500KB) — no CDN, no external fetch except the bridge
- Never include sensitive data (API keys, passwords) in the HTML
- Comment fields only where comments add value
- Design quality matters — this is a deliverable, not a debug dump
- German UI labels unless the project language says otherwise

# Concept step 5 — Etappen: built and closed out one at a time

How `implement` and `finalize` run on a staged concept — execution detail of
`SKILL.md` Step 5b. Markup and engine: `templates-stages.md`; when a concept
is staged: `step1-stages.md`; moving between Etappen: `step5-process.md`
§ 5b · next-stage.

## Etappen · build and close out one at a time

A staged concept is built Etappe by Etappe on ONE page: every Etappe has the
implement station ("Diese Etappe umsetzen"), ends with its own full final
report as a round tab of the same page, and the concept goes on with the
Etappen still open. Nothing is shipped in between: ONE ship, in the last
close-out (user decisions 2026-11-17, concept `etappen-einzeln`).

**Stage states** (`#concept-stages` → `stages[].state`, injected by the build):

| State | Means | Source |
|---|---|---|
| `open` | not built, not closed; with or without rounds | default |
| `built` | its final report exists | a round fragment `data-final-report data-stage="<id>"` |
| `issue` | handed to the backlog in a close-out | `page.json` `stages[i].state` |
| `dropped` | struck in a close-out | `page.json` `stages[i].state` |

Only an `open` Etappe can get a new round. The gate blocks a regular round
after a stage's final report (`stages-built-reopened`) and a live round in a
closed stage.

**`implement` on a staged concept.** The payload names the live Etappe
(`stage:"B"`; absent on an older page → the live round's `data-stage`).
`step5-process.md` § 5b · implement steps 1–4 apply unchanged, scoped to it:

- **Scope** = what the rounds carrying that `data-stage` accepted; for a
  do-batch start also the bundles of that surface group. Nothing of another
  Etappe is built, even when it is already decided.
- **Brief** = `briefs/implement-<id>.md`, built from that Etappe's baked
  rounds only. Reality check, `auto-agents`, acceptance table and the
  independent check as for every implement.
- **Commit** the built Etappe on the session branch before the report goes
  out, so the next Etappe's merge of main and reality check start clean.
- **Report** = a final-report round with `data-final-report data-stage="<id>"`
  (`step5-update-page.md` § Final-report append), covering this Etappe only:
  its Funde, 🧪 and 👉 under the usual admission rules. Its heading and tab
  name the Etappe.

**`finalize` of a stage report.** The sheet adds one block while other
Etappen are `open` — per open Etappe a route, and which one comes next — and
the payload carries it:

```json
{ "action": "finalize", "stage": "A", "final": false, "next": "C",
  "stages": [ { "id": "B", "route": "open" }, { "id": "C", "route": "open" } ],
  "issues": { … }, "implement": { … }, "tests": [ … ], "handoffs": [ … ] }
```

`stages[]` lists only the other Etappen that are still `open` (one already
routed in an earlier close-out is not sent again). `route` is `open` (keep
it — the default), `issue` or `drop`. `final` is `false` while at least one
Etappe stays open; the sheet then offers no ship and no disposition and the
payload carries `ship: { run: false }` and `disposition: null` — `null` is
"not asked", never the `discard` default.

- **Every finalize:** part A (issues) and part B (follow-ups of this report),
  then the routes: `issue` → one issue for that Etappe through `auto-issue`
  (title from the stage name, body = what its rounds decided so far and the
  concept link), then `stages[i].state = "issue"` in `page.json`; `drop` →
  `stages[i].state = "dropped"`. Then part E (tests and hand-offs).
- **`final: false` — the concept goes on.** No part C, no part D, no Step 6:
  never ship, stage a disposition, POST `/status` `closed` or stop the bridge
  here, whatever else the payload says. Freeze the report like any submitted
  round (`bake --round N --payload <finalize payload>`, or `--unanswered`
  when it cannot be baked), write the `page.json` states BEFORE the build,
  write the next round with `data-stage="<next>"` (its first round, or one
  that continues from that Etappe's newest round), `build`, `/reload` before
  `/reset` (the bridge answers `/reset` with 428 until the reload), re-launch
  the waker. The round ends with the `concept: waiting` card.
- **`final: true` — nothing stays open.** The close-out of
  `step5-finalize.md` in full, A → B → C → D → E: part C ships ONCE
  everything built in every Etappe (one pull request, one version), then
  disposition and cleanup. A payload without `final` (a concept without
  Etappen, an older page) is final.

**A built Etappe stays built.** A change to it is a "Nachbessern" on its
report while that report is the live round; afterwards it is its own section
in the current round, or a follow-up in the last close-out.

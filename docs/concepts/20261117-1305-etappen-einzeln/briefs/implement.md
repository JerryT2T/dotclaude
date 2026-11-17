# Implement brief — Etappen einzeln umsetzen

Concept: `docs/concepts/20261117-1305-etappen-einzeln` (round 1, baked: `rounds/01.html`).
Decisions: [`20261117-1305-etappen-einzeln-decisions.json`](../../20261117-1305-etappen-einzeln-decisions.json).
The user answered six questions and pressed "Umsetzen" in round 1. There was no
mock round for the controls, so the controls below are the orchestrator's design;
the user's quotes are binding, the control details are not.

## What the user decided (verbatim from the page and the payload)

| Id | Question | Chosen option (label — consequence, as shown) | Note |
|---|---|---|---|
| d-next | „Wie frei wählst du, welche Etappe als nächste drankommt?“ | „Jede offene Etappe direkt öffnen — Ein Klick auf die Etappe in der Leiste startet ihre nächste Runde; die Reihenfolge ergibt sich aus deinen Klicks.“ | — |
| d-skipped | „Was wird aus einer Etappe, die du auslässt?“ | „Offen halten und am Ende einmal fragen — Sie bleibt in der Leiste wählbar; der Abschluss fragt je offener Etappe: nachholen, als Issue anlegen oder streichen.“ | — |
| d-back | „Darfst du eine abgeschlossene Etappe noch einmal öffnen?“ | „Wieder öffnen, solange sie nicht gebaut ist — Die Etappe bekommt eine neue Runde; nach dem Bauen läuft eine Änderung über „Nachbessern“.“ | — |
| d-build | „Wie wird ein Concept mit mehreren Etappen umgesetzt?“ | „Jede Etappe für sich bauen — „Diese Etappe umsetzen“ steht in jeder Etappe; das Concept bleibt offen und geht mit den übrigen weiter.“ | — |
| d-report | „Wie berichtet Claude, wenn Etappen einzeln gebaut werden?“ | „Voller Abschluss nach jeder Etappe — Jede Etappe endet mit eigener Abschluss-Seite samt Funden und Tests; bei drei Themen dreimal.“ (deviates from the recommendation) | „aber nicht drei websites, sondenr in einer websites mit drei seiten!“ |
| d-ship | „Wie werden einzeln gebaute Etappen ausgeliefert?“ | „Alles zusammen im Abschluss — Ein Pull Request, eine Version; nichts erreicht main, bevor das letzte Thema fertig ist.“ (deviates from the recommendation) | — |

Reading of the d-report note: ONE concept page (one HTML file, one bridge
session). Each built Etappe gets its own final-report round — a tab / page
inside that one page — never a second HTML file or a second concept.

## How it fits together (the contract all parts build against)

Today (v0.384.1): stages advance A→G only. `next-stage` accepts only the stage
directly after the current one, gate E8 `stages-order` refuses a step back,
"Nächste Etappe ›" replaces the 🔒 · 🤖 · 🏁 stations until the last stage, the
build allows one final report and only as the last round.

New behaviour:

1. **Stage state.** A stage is `open`, `built`, `issue` or `dropped`.
   `built` = a round fragment `section[data-final-report][data-stage="<id>"]`
   exists. `issue` / `dropped` = `page.json` `stages[i].state` (Claude writes it
   when a close-out routes a stage). Everything else is `open`, with or without
   rounds. The build injects it: `#concept-stages` =
   `{stages:[{id,name,state}], current, icon, title}`. The engine only reads it.
2. **Any open stage can be next.** `next-stage` payload stays
   `{action:"next-stage", stage:"<live stage>", next:"<id>"}`; `next` is any
   stage whose state is `open` and that is not the live one. Rounds of one stage
   need not be consecutive any more. A stage that already has rounds but is not
   built is reopened the same way (a new round with its `data-stage`).
3. **Build per stage.** In a staged concept the implement action carries
   `stage:"<live stage>"`. Claude builds only that stage's approved scope and
   appends a final report with `data-final-report data-stage="<id>"`.
4. **Full close-out per stage, one page.** That stage report is a normal final
   report (Funde, Tests, Hand-offs, Nachbessern, review switch) and a normal
   round tab. Its close-out sheet gets one extra block while other stages are
   `open`: per open stage a route — keep open (default) / als Issue anlegen /
   streichen — and, when at least one stays open, which of them to continue
   with. While at least one stage stays open the sheet offers NO ship and NO
   disposition; `finalize` then closes only this stage and the concept goes on
   with a new round in the chosen stage. When no stage stays open (all built,
   or the rest routed to issue / dropped) the sheet is today's full close-out:
   ONE ship for everything built, disposition, cleanup.
   `finalize` payload additions: `stage:"<id>"`, `stages:[{id, route:"open"|"issue"|"drop"}]`
   (the other non-built stages), `next:"<id>"|null`, `final:true|false`.
5. **Built stays built.** No regular round may follow a stage's final report in
   that same stage (changes go through "Nachbessern" on its report; a review
   round `data-review` is still allowed).

## Checklist — one line per accepted item, with its source quote

- [ ] **C1 (d-next)** — an open Etappe other than the live one can be started from the ☰ panel's Etappen-Leiste. *Quote:* „Jede offene Etappe direkt öffnen — Ein Klick auf die Etappe in der Leiste startet ihre nächste Runde; die Reihenfolge ergibt sich aus deinen Klicks.“ Design note: the tab click today opens that Etappe's pane (viewing its rounds) and a start submits the live round's answers, so the start is a clearly labelled button at the top of that pane, one click after the tab. If a true one-click start can be made safe, prefer it; otherwise report the two-click path as a deviation from the quote.
- [ ] **C2 (d-next)** — "Nächste Etappe ›" leads to the next OPEN Etappe (list order after the live one, wrapping), and is absent when no other Etappe is open. *Quote:* as C1 („die Reihenfolge ergibt sich aus deinen Klicks“).
- [ ] **C3 (d-next, d-back)** — gate and build accept rounds in any stage order; a not-yet-built Etappe that already has rounds gets a new round when chosen again. *Quote:* „Wieder öffnen, solange sie nicht gebaut ist — Die Etappe bekommt eine neue Runde; nach dem Bauen läuft eine Änderung über „Nachbessern“.“
- [ ] **C4 (d-back)** — a built Etappe cannot be started again: no start button in its pane, and the gate blocks a regular round placed after that stage's final report. *Quote:* as C3 („solange sie nicht gebaut ist“ / „nach dem Bauen läuft eine Änderung über „Nachbessern““).
- [ ] **C5 (d-skipped)** — an Etappe that was passed over stays selectable in the Leiste and is shown as open. *Quote:* „Offen halten und am Ende einmal fragen — Sie bleibt in der Leiste wählbar; der Abschluss fragt je offener Etappe: nachholen, als Issue anlegen oder streichen.“
- [ ] **C6 (d-skipped)** — the close-out of a stage report asks, for each Etappe still open, exactly the three routes: nachholen (keep open), als Issue anlegen, streichen. *Quote:* as C5 („der Abschluss fragt je offener Etappe: nachholen, als Issue anlegen oder streichen“).
- [ ] **C7 (d-skipped)** — an Etappe routed to Issue or gestrichen shows that state in the Leiste and cannot be started; `page.json` carries the state and the build injects it.
- [ ] **C8 (d-build)** — the implement station stands in EVERY Etappe of a staged concept and reads „Diese Etappe umsetzen“; its payload names the stage. *Quote:* „Jede Etappe für sich bauen — „Diese Etappe umsetzen“ steht in jeder Etappe; das Concept bleibt offen und geht mit den übrigen weiter.“
- [ ] **C9 (d-build)** — after a stage is built the concept stays open and continues with another Etappe on the same page. *Quote:* as C8 („das Concept bleibt offen und geht mit den übrigen weiter“).
- [ ] **C10 (d-report)** — every built Etappe ends with its own full final report (Funde, Tests, Hand-offs) as a round tab of the SAME page; the build allows one final report per stage and rounds after it. *Quotes:* „Voller Abschluss nach jeder Etappe — Jede Etappe endet mit eigener Abschluss-Seite samt Funden und Tests; bei drei Themen dreimal.“ and „aber nicht drei websites, sondenr in einer websites mit drei seiten!“
- [ ] **C11 (d-report)** — a stage report that is no longer the live round stays readable (frozen like any round), and its tab and head name the Etappe.
- [ ] **C12 (d-ship)** — a stage close-out offers no ship and no disposition while another Etappe stays open; the close-out after which nothing stays open ships ONCE for everything built. *Quote:* „Alles zusammen im Abschluss — Ein Pull Request, eine Version; nichts erreicht main, bevor das letzte Thema fertig ist.“
- [ ] **C13** — a concept WITHOUT Etappen, and a staged concept whose last open Etappe is built last, behave exactly as before (regression line for every existing test).
- [ ] **C14** — the process docs describe the new flow: `next-stage` (any open stage), `implement` per stage, `finalize` of a stage report (continue vs final), the gate table, `templates-stages.md`, `step1-stages.md`.

## Ownership

| Part | Owner | Files |
|---|---|---|
| Engine (☰ stepper, panes, journey row, submit payloads, stage final report, close-out sheet) | engine agent | `plugins/devops/skills/auto-concept/deep-knowledge/templates-stages.md`, `templates-stages-js.md`, `templates-submit-js.md`, the final-report / close-out template files (`templates-final-report*.md`, `templates-closeout*.md` and whatever file holds the close-out sheet JS), locale strings they need, and the engine tests under `plugins/devops/skills/auto-concept/*.test.js` |
| Gate, build, bridge | core agent | `plugins/devops/hooks/lib/concept-gate.js` (+ `.test.js`), `plugins/devops/scripts/concept-build.js` (+ `.test.js`), `plugins/devops/scripts/concept-server.py` (+ its tests), the § Etappen table in `deep-knowledge/validation-gate.md` |
| Process docs | orchestrator | `deep-knowledge/step5-process.md`, `step5-finalize.md`, `step5-update-page.md`, `step1-stages.md`, `SKILL.md` |

Never edit a file another part owns; report what you need from it instead.

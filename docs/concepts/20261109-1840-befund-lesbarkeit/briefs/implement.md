# Implement brief — Befunde, die man gern liest

Decisions: [../../20261109-1840-befund-lesbarkeit-decisions.json](../../20261109-1840-befund-lesbarkeit-decisions.json) · round 1, action `implement`, all eight answers = the recommendation.

## User notes (round 1, verbatim)

- `d-ids`: „nur einne textuell, aber4 graphisch darf es ruhig bis zu drei z. B. balken geben“
- `d-overlap`: „und bitte bessere anweisungen was in befund stehen sollte und was nicht !“

## Checklist

- [ ] d-first = consequence: the finding's first sentence states the consequence for the user; state / wish / own-work openers are flagged (gate `finding-first`), rule + example in step1-templates.md.
- [ ] d-len = w40: finding text (situation + L3 long-slot prose, display and example excluded) ≤ 40 words, ≤ 3 sentences (gate `finding-length`), documented.
- [ ] d-ids = one (+ note): ≤ 1 code identifier in the finding text; a display may label up to 3 (gate `finding-code` counts text only), documented.
- [ ] d-overlap = gate (+ note): gate flags recommendation words and option labels inside the finding (`finding-answer`); step1-templates.md gets an explicit "in the finding / never in the finding" table.
- [ ] d-example = when: `[data-example]` required at L3 whenever something visible exists; opt-out `data-no-example="<why>"` (gate `finding-example`), documented in templates-analysis.md.
- [ ] d-applies = question: the engine renders `[data-applies]` above the question, not inside the finding bubble.
- [ ] d-gate = warn-fix: the new checks warn (never block); validation-gate.md and the concept-author agent require fixing every `finding-*` warning before the page opens / reloads.
- [ ] d-pace = keep-click: reading pace kept; click on the typing dots reveals the next message at once (commit a3eca41d).

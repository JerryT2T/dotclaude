# Concept templates, part 43 of 50: Shared systems — final report panel, the review switch

## Final Report Panel (continued)

### The review switch — "Umsetzung prüfen"

Why: after a large concept the user iterated in rounds, pressed implement and
only got the closing page. What the build really looks like — and whether it
matches what the last round decided — was never shown. The switch next to the eye
(top-left) turns the closing page back into a normal concept: **a new round
"Umsetzung"** in the SAME concept, with the same controls (annotate, iterate,
implement), showing the finished build on an example. The switch is on the closing
page and on the review round (there it reads "Zur Abschlussseite"), so the user
can always go back. Switching ships nothing and closes nothing.

- **Placement.** `#review-switch` is a fixed pill beside `#anno-toggle` (same
  top, one eye-width plus a gap to the right). Pages without the eye (every
  template but design) put it in the eye's own slot; below 1200 px it shrinks
  to the eye's footprint (dot only, label in the tooltip) so it never covers the
  heading. Visible while `body.viewing-final`
  or while the active round carries `data-review`; hidden otherwise and while
  `body.fin-on` (the Fertig-Seite replaces the page, so the switch goes with it).
  Wiring: `wireReviewSwitch()` (§ Panel chrome JS).
- **Pulse until the first click** (`d-rev-blink`). `.review-switch[data-pulse]`
  animates a ring in `--accent-color`; the first click removes `data-pulse` and
  stores the fact in `sessionStorage` (`review-switch-seen`), so a reload does not
  restart it. `prefers-reduced-motion: reduce` replaces the animation by a static
  accent ring (no movement, no fade). Calm state: the same pill, no ring.
- **Click on the closing page** posts one `review` submission (`submitReview()`,
  same transport as `submitRefine()`: `/decisions`, `submission_id`, queued copy
  on failure). Payload: `action: "review"`, `iteration` (the final report's round),
  plus the comments / pins the user already made. Claude authors the review round
  (`step5-update-page.md` § Review round); the bridge reloads the page into it.
  Click on the review round: `showIteration()` to the final report's round
  (`data-review-from`), no submission.
- **Tooltips** through `data-tip` (never `title`); keyboard: a real `<button>`,
  Enter / Space, visible focus ring.

```html
<button type="button" id="review-switch" class="review-switch" hidden data-pulse
        data-tip="Das fertige Ergebnis noch einmal als normales Concept ansehen: Abweichungen vom letzten Konzept sind als Auto-Notizen markiert."
        data-label-open="Umsetzung prüfen" data-label-back="Zur Abschlussseite"
        data-tip-open="Das fertige Ergebnis noch einmal als normales Concept ansehen: Abweichungen vom letzten Konzept sind als Auto-Notizen markiert, du kannst weiter iterieren und umsetzen lassen."
        data-tip-back="Zurück zur Abschlussseite (Shippen / Abschließen)">
  <span class="review-switch-dot" aria-hidden="true"></span>
  <span class="review-switch-label">Umsetzung prüfen</span>
</button>
```

```css
.review-switch {
  position: fixed; top: 3.75rem; left: calc(1rem + var(--anno-pin-size, 28px) + .5rem); z-index: 96;
  box-sizing: border-box; height: var(--anno-pin-size, 28px); max-width: calc(100vw - 6rem);
  display: inline-flex; align-items: center; gap: .4rem; padding: 0 .75rem;
  border-radius: 999px; border: 2px solid var(--accent-color, #58a6ff);
  background: var(--panel-bg, #161b22); color: var(--accent-color, #58a6ff);
  font-weight: 600; font-size: .8125rem; line-height: 1; white-space: nowrap; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,.35);
}
.review-switch[hidden], body.fin-on .review-switch { display: none; }
.review-switch:focus-visible { outline: 2px solid var(--accent-color, #58a6ff); outline-offset: 2px; }
.review-switch-dot { width: .5rem; height: .5rem; border-radius: 50%; background: currentColor; flex: none; }
.review-switch-label { overflow: hidden; text-overflow: ellipsis; }
.review-switch[data-pulse] { animation: review-pulse 1.4s ease-in-out infinite; }
@keyframes review-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent-color, #58a6ff) 70%, transparent), 0 2px 8px rgba(0,0,0,.35); }
  50% { box-shadow: 0 0 0 .6rem color-mix(in srgb, var(--accent-color, #58a6ff) 0%, transparent), 0 2px 8px rgba(0,0,0,.35); }
}
@media (prefers-reduced-motion: reduce) {
  .review-switch[data-pulse] { animation: none; box-shadow: 0 0 0 .25rem color-mix(in srgb, var(--accent-color, #58a6ff) 45%, transparent); }
}
body.panel-open .review-switch { opacity: 0; pointer-events: none; }
/* No eye outside design pages: the switch takes the eye's own slot. */
html:not([data-template="design"]) .review-switch { left: 1rem; }
/* Narrow viewports: the pill shrinks to the eye's footprint (dot only, label in
   the data-tip), so it stays in the left gutter and never covers the heading. */
@media (max-width: 1200px) {
  .review-switch { width: var(--anno-pin-size, 28px); padding: 0; justify-content: center; }
  .review-switch-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
}
```

#### The review round — what Claude authors

Template: the concept's own (`data-iteration-template` per § Step 1a · Template
continuity — never switched for the review), section markers `data-review` and
`data-review-from="<final report round>"`, tab label "Umsetzung". Three kinds of
content, in this order:

1. **The build on an example** (`d-rev-data`). Real project data when the app runs
   locally (probe the dev server / run the build's own CLI on a real input and show
   the result); otherwise a fixture with a visible "Beispiel" badge
   (`<span class="rv-badge">Beispiel</span>`). Never present a fixture as real.
2. **Auto-notes — strictly every deviation** (`d-rev-expect`). Expected = the last
   concept round's decisions (`{name}-decisions.json` / the baked
   `#concept-decisions` of the round before the implement) **plus** the
   implementation plan. For every decision and every plan line compare the build;
   each difference (different value, missing, added, done another way) is ONE
   `<aside class="rv-note" data-review-note data-kind="deviation" data-expected="…" data-actual="…">`
   placed beside the thing it concerns, saying expected → actual in one line each.
   No deviation → no note, and one line "Wie entschieden umgesetzt" at the top.
   Not the important ones only: all.
3. **Green findings** (`d-rev-green`). Anything found on the way that no decision
   or plan line covered (an extra fix, a changed neighbour, a new file the user
   never saw): `<aside class="rv-note rv-green" data-review-note data-kind="finding">`
   with a green marker (`--success-color`, plus the word "Zusatz" so colour is
   never the only signal) AND its own decision
   `data-decision="rv-<slug>" data-decision-mode="single"` with the two options
   `keep` ("Behalten", recommended when harmless) and `revert` ("Zurückbauen").

```css
.rv-note { margin: .75rem 0; padding: .6rem .8rem; border-radius: .5rem; border-left: 4px solid var(--warning-color, #d29922); background: var(--panel-bg, #161b22); }
.rv-note.rv-green { border-left-color: var(--success-color, #3fb950); }
.rv-note.rv-green::before { content: "Zusatz"; display: inline-block; margin-right: .5rem; padding: 0 .4rem; border-radius: 999px; font-size: .75rem; font-weight: 600; color: var(--success-color, #3fb950); border: 1px solid currentColor; }
.rv-badge { display: inline-block; padding: 0 .4rem; border-radius: 999px; font-size: .75rem; border: 1px solid var(--border-color, #30363d); }
```

From the review round the user iterates or implements as in any round; `revert`
answers rewrite the affected code on implement and a new closing page follows.


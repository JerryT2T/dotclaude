# Concept templates, part 26 of 49: Shared systems — decision panel state CSS (continued 3)

```css
/* ── Final-report body components (§ Final Report Panel → Report body) ──────
   Claude authors the report in plain markup with these engine classes — no
   round stylesheet. Every colour is a page token, so light and dark both work.
   Budget: one screen at 1440 × 900, in one narrow reading column shared with
   the analysis page. The page header is the only title.
   Order on the page: .fr-banner once closed · .fr-sentence · .fr-main
   (.fr-results | .fr-ba or .fr-flow) · .fr-holds · .fr-depth · .fr-folds.
   No checkboxes anywhere in the body. */
:root { --concept-read-width: 732px; }
/* One reading width for every document round: the report, the analysis header,
   free and decision rounds. A design round keeps its canvas; a mapping board and a
   round marked data-wide keep the wide column, because their columns need it (of
   30 real free and decision rounds, only mapping boards overflowed at this width). */
body.viewing-final .concept-content > header,
body:has(section[data-iteration][data-active][data-analysis="full"]) .concept-content > header,
html:is([data-template="free"], [data-template="decision"]) body:not(:has(section[data-iteration][data-active]:is([data-wide], :has([data-mapping], [data-map-wide])))) .concept-content > header,
html:is([data-template="free"], [data-template="decision"]) section[data-iteration][data-active]:not([data-wide], [data-analysis="full"], :has([data-mapping], [data-map-wide])),
section[data-final-report] { max-width: var(--concept-read-width); margin-inline: auto; box-sizing: border-box; }
body.viewing-final .concept-content > header {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.9rem;
}
body.viewing-final .concept-content > header::before {
  content: "🏁 {{final.phase}}";
  font-size: 0.8rem;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-color, #c9d1d9) 10%, transparent);
  color: var(--text-color, #c9d1d9);
}
body.viewing-final .concept-content > header h1 { margin: 0; font-size: 1.5rem; line-height: 1.2; }
body.viewing-final .concept-content > header .subtitle,
section[data-final-report] .fr-head,
section[data-final-report] [data-tests],
section[data-final-report] [data-handoffs] { display: none !important; }
/* Where the open ☰ panel would reach into the column, the column gives way by
   exactly the overlap. Wide screens never move. */
body.viewing-final.panel-open .concept-content > header,
html:is([data-template="free"], [data-template="decision"]) body.panel-open:not(:has(section[data-iteration][data-active]:is([data-wide], :has([data-mapping], [data-map-wide])))) .concept-content > header,
html:is([data-template="free"], [data-template="decision"]) body.panel-open section[data-iteration][data-active]:not([data-wide], [data-analysis="full"], :has([data-mapping], [data-map-wide])),
body.viewing-final.panel-open section[data-final-report] {
  position: relative;
  left: calc(-1 * max(0px, (1484px - 100vw) / 2));
}
section[data-final-report] .fr-banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.8rem;
  border-radius: 10px;
  font-weight: 600;
  color: var(--success-color, #3fb950);
  border: 1px solid color-mix(in srgb, var(--success-color, #3fb950) 50%, transparent);
  background: color-mix(in srgb, var(--success-color, #3fb950) 12%, transparent);
}
section[data-final-report] .fr-banner em { margin-left: auto; font-style: normal; font-weight: 500; font-size: 0.85rem; color: var(--text-secondary, #8b949e); }
section[data-final-report] .fr-sentence { margin: 0 0 0.8rem; font-size: 1.02rem; line-height: 1.45; }
section[data-final-report] .fr-label {
  margin: 0 0 0.3rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-secondary, #8b949e);
}
section[data-final-report] .fr-label small { margin-left: 0.4rem; font-size: 0.7rem; font-weight: 500; letter-spacing: 0; text-transform: none; }
/* Results left, one picture right. Nothing to show: the results take the row. */
section[data-final-report] .fr-main { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 0 0 0.85rem; align-items: start; }
section[data-final-report] .fr-main > :only-child { grid-column: 1 / -1; }
section[data-final-report] .fr-wins { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
section[data-final-report] .fr-wins li { display: flex; align-items: center; gap: 0.6rem; font-size: 0.88rem; line-height: 1.35; }
section[data-final-report] .fr-win-icon {
  flex: none;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  background: color-mix(in srgb, var(--accent-color, #58a6ff) 15%, transparent);
}
section[data-final-report] .fr-wins li:nth-child(2) .fr-win-icon { background: color-mix(in srgb, var(--success-color, #3fb950) 15%, transparent); }
section[data-final-report] .fr-wins li:nth-child(3) .fr-win-icon { background: color-mix(in srgb, var(--warning-color, #d29922) 15%, transparent); }
section[data-final-report] .fr-wins b { color: var(--text-color, #c9d1d9); }
section[data-final-report] .fr-try {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.6rem;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  background: var(--accent-color, #58a6ff);
  color: var(--bg-color, #0d1117);
  font-size: 0.85rem;
  font-weight: 700;
  text-decoration: none;
}
section[data-final-report] .fr-try:focus-visible { outline: 2px solid var(--text-color, #c9d1d9); outline-offset: 3px; }
/* How to sign in on the try-it origin (#933) — one line under the button. */
section[data-final-report] .fr-try-auth { margin: 0.4rem 0 0; font-size: 0.78rem; color: color-mix(in srgb, var(--text-color, #c9d1d9) 72%, transparent); }
/* Vorher / Nachher share one place; the switch sits under the image. */
section[data-final-report] .fr-ba { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
section[data-final-report] .fr-shot {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
section[data-final-report] .fr-shot[hidden] { display: none; }
section[data-final-report] .fr-shot img {
  display: block;
  width: 100%;
  height: clamp(9rem, 24vh, 13.5rem);
  object-fit: contain;
  cursor: zoom-in;
  border: 1px solid var(--border-color, #30363d);
  border-radius: 10px;
  background: color-mix(in srgb, var(--text-color, #c9d1d9) 4%, var(--bg-color, #0d1117));
}
section[data-final-report] .fr-shot figcaption {
  font-size: 0.72rem;
  line-height: 1.3;
  color: var(--text-secondary, #8b949e);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
section[data-final-report] .fr-ba-switch { display: flex; align-self: flex-start; border: 1px solid var(--border-color, #30363d); border-radius: 6px; overflow: hidden; }
section[data-final-report] .fr-ba-switch button {
  padding: 2px 10px;
  border: 0;
  background: transparent;
  color: var(--text-secondary, #8b949e);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}
section[data-final-report] .fr-ba-switch button + button { border-left: 1px solid var(--border-color, #30363d); }
section[data-final-report] .fr-ba-switch button[aria-pressed="true"] {
  color: var(--accent-color, #58a6ff);
  background: color-mix(in srgb, var(--accent-color, #58a6ff) 15%, transparent);
}
/* Nothing visual changed: a short flow instead of the picture. */
section[data-final-report] .fr-flow { display: flex; flex-direction: column; gap: 0.35rem; padding: 0; margin: 0; list-style: none; counter-reset: fr-flow; }
section[data-final-report] .fr-flow li {
  counter-increment: fr-flow;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--border-color, #30363d);
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.3;
}
section[data-final-report] .fr-flow li::before { content: counter(fr-flow) " · "; color: var(--text-secondary, #8b949e); font-weight: 700; }
/* "Was es aushält" — one bar per requirement. Length = how far the requirement
   is met (--fr-fill, 0–100 %), colour = the grade (data-grade):
   full 100 %, part 60–99 %, low under 60 %, open not tested (no fill, dashed).
   The value and the glyph say the same in words; the context is the tooltip. */
section[data-final-report] .fr-holds { margin: 0 0 0.75rem; }
section[data-final-report] .fr-meters { display: flex; flex-direction: column; gap: 0.2rem; }
section[data-final-report] .fr-meter {
  --fr-grade: var(--success-color, #3fb950);
  display: grid;
  grid-template-columns: 9rem 1fr 6.5rem;
  gap: 0.6rem;
  align-items: center;
  min-height: 1.5rem;
}
section[data-final-report] .fr-meter[data-grade="part"] { --fr-grade: var(--warning-color, #d29922); }
section[data-final-report] .fr-meter[data-grade="low"] { --fr-grade: var(--danger-color, #f85149); }
section[data-final-report] .fr-meter[data-grade="open"] { --fr-grade: var(--text-secondary, #8b949e); }
section[data-final-report] .fr-meter-name { font-size: 0.82rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
section[data-final-report] .fr-meter-value { font-size: 0.85rem; font-weight: 700; text-align: right; overflow-wrap: anywhere; }
section[data-final-report] .fr-meter-value::after { content: " ✓"; color: var(--fr-grade); }
section[data-final-report] .fr-meter[data-grade="part"] .fr-meter-value::after { content: " ▲"; }
section[data-final-report] .fr-meter[data-grade="low"] .fr-meter-value::after { content: " ✕"; }
section[data-final-report] .fr-meter[data-grade="open"] .fr-meter-value::after { content: " ?"; }
section[data-final-report] .fr-meter-bar {
  position: relative;
  height: 10px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--text-color, #c9d1d9) 10%, transparent);
}
section[data-final-report] .fr-meter-bar::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--fr-fill, 0%);
  border-radius: 5px;
  background: var(--fr-grade);
}
section[data-final-report] .fr-meter[data-grade="open"] .fr-meter-bar { background: none; border: 1px dashed var(--border-color, #30363d); box-sizing: border-box; }
/* Prüftiefe: what passed last and what was not done next, at a glance. The whole
   seven-step ladder is the tooltip (data-tip). */
section[data-final-report] .fr-depth { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.9rem; margin: 0 0 0.85rem; font-size: 0.88rem; cursor: help; }
section[data-final-report] .fr-depth-done { color: var(--success-color, #3fb950); }
section[data-final-report] .fr-depth-next { color: var(--text-secondary, #8b949e); }
section[data-final-report] .fr-depth b { font-weight: 700; }
/* The two folds side by side; an open one takes the row. */
section[data-final-report] .fr-folds { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.5rem; }
section[data-final-report] .fr-fold {
  border: 1px solid var(--border-color, #30363d);
  border-radius: 10px;
  padding: 0.4rem 0.75rem;
}
section[data-final-report] .fr-fold[open] { grid-column: 1 / -1; }
section[data-final-report] .fr-fold > summary { cursor: pointer; font-weight: 600; font-size: 0.86rem; }
section[data-final-report] .fr-fold > summary:focus-visible { outline: 2px solid var(--accent-color, #58a6ff); outline-offset: 2px; }
section[data-final-report] .fr-fold[open] > summary { margin-bottom: 0.5rem; }
section[data-final-report] .fr-funde { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
section[data-final-report] .fr-funde li {
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--border-color, #30363d);
  border-radius: 8px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
section[data-final-report] .fr-funde li.fr-fund-hit {
  border-color: var(--accent-color, #58a6ff);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color, #58a6ff) 35%, transparent);
}
section[data-final-report] .fr-funde .oq-label { font-weight: 600; }
section[data-final-report] .fr-fkv { display: grid; grid-template-columns: auto 1fr; gap: 0.15rem 0.6rem; margin: 0.35rem 0 0; font-size: 0.82rem; }
section[data-final-report] .fr-fkv dt { margin: 0; color: var(--text-secondary, #8b949e); font-weight: 600; }
section[data-final-report] .fr-fkv dd { margin: 0; }
section[data-final-report] .fr-dev { margin: 0; padding-left: 1.1rem; font-size: 0.85rem; line-height: 1.5; }
/* What became of a Fund after the close-out (Claude's routed rewrite). */
[data-open-questions] .oq-done {
  margin-left: 0.5rem;
  font-size: 0.8rem;
  color: var(--success-color, #3fb950);
}
[data-open-questions] .oq-issue-link {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 1px 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--success-color, #3fb950);
  border: 1px solid var(--success-color, #3fb950);
  border-radius: 4px;
  text-decoration: none;
}
[data-open-questions] .oq-issue-link:hover {
  background: color-mix(in srgb, var(--success-color, #3fb950) 15%, transparent);
}
@media (max-width: 600px) {
  section[data-final-report] .fr-main { grid-template-columns: 1fr; }
  section[data-final-report] .fr-meter { grid-template-columns: 8rem 1fr 4.5rem; }
}

/* ── Fertig-Seite (§ Final Report Panel → Fertig-Seite) ─────────────────────
   The very last view of a concept tab: one moment, not a document. It replaces
   report, panel and dock client-side, because the page file may be deleted and
   the bridge gone. Centred on the neural backdrop, a status ring, one word, one
   line, then links and what continues in the chat. */
body.fin-on > :not(.fin):not(#neural-bg):not(script) { display: none !important; }
body.fin-on #neural-bg { opacity: .55; }
html[data-theme="light"] body.fin-on #neural-bg { opacity: .34; }
.fin {
  --c: var(--success-color, #3fb950);
  position: fixed;
  inset: 0;
  z-index: 100;
  overflow-y: auto;
  display: grid;
  place-items: center;
  padding: max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
  color: var(--text-color, #c9d1d9);
  text-align: center;
  background:
    radial-gradient(ellipse 70% 55% at 50% 40%, color-mix(in srgb, var(--c) 18%, transparent), transparent 70%),
    radial-gradient(ellipse 60% 50% at 50% 45%, color-mix(in srgb, var(--bg-color, #0d1117) 82%, transparent), transparent);
}
.fin[hidden] { display: none; }
.fin[data-fin="closed"], .fin[data-fin="lost"] { --c: var(--accent-color, #58a6ff); }
.fin[data-fin="blocked"] { --c: var(--danger-color, #f85149); }
.fin[data-fin="partial"] { --c: var(--warning-color, #d29922); }
.fin-in { width: min(100%, 520px); min-width: 0; overflow-wrap: anywhere; }
.fin-in > * { animation: fin-in .5s cubic-bezier(.22,.8,.24,1) both; animation-delay: .7s; }
.fin-ring {
  width: 96px;
  height: 96px;
  fill: color-mix(in srgb, var(--c) 14%, transparent);
  stroke: var(--c);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.fin-in > .fin-ring { animation: fin-pop .42s cubic-bezier(.22,.8,.24,1) both; }
.fin-ring path { fill: none; stroke-width: 7; stroke-dasharray: 1; animation: fin-draw .48s ease-out .18s both; }
.fin-h { margin: 20px 0 8px; font-size: clamp(34px, 8vw, 52px); font-weight: 800; letter-spacing: -.03em; line-height: 1.1; }
.fin-in > .fin-h { animation-delay: .42s; }
.fin-h:focus { outline: none; }
.fin-s { margin: 0; font-size: 17px; line-height: 1.5; color: color-mix(in srgb, var(--text-color, #c9d1d9) 80%, transparent); }
.fin-in > .fin-s { animation-delay: .56s; }
.fin-misses { margin: 14px 0 0; padding: 0; list-style: none; font-size: 14px; line-height: 1.5; color: var(--c); }
.fin-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 24px 0 0; padding: 0; list-style: none; }
.fin-links a, .fin-back {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  box-sizing: border-box;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--accent-color, #58a6ff);
  color: var(--bg-color, #0d1117);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  border: 0;
  cursor: pointer;
}
.fin-back { margin-top: 24px; background: transparent; color: var(--text-color, #c9d1d9); border: 1px solid var(--border-color, #30363d); }
.fin-links a:focus-visible, .fin-back:focus-visible { outline: 2px solid var(--text-color, #c9d1d9); outline-offset: 3px; }
.fin-l { margin: 30px 0 10px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: color-mix(in srgb, var(--text-color, #c9d1d9) 80%, transparent); }
/* A completion-card button fills the chat's input field and needs the chat, so
   here it is a labelled hint, never a button that would do nothing on a click. */
.fin-next { margin: 0; padding: 0; list-style: none; font-size: 14px; line-height: 1.6; color: color-mix(in srgb, var(--text-color, #c9d1d9) 80%, transparent); }
.fin-next li:first-child { color: var(--text-color, #c9d1d9); font-weight: 650; }
.fin-left { margin: 0; padding: 0; list-style: none; font-size: 14px; line-height: 1.6; color: color-mix(in srgb, var(--text-color, #c9d1d9) 80%, transparent); }
.fin-n { margin: 22px 0 0; font-size: 13px; color: color-mix(in srgb, var(--text-color, #c9d1d9) 80%, transparent); }
@keyframes fin-in { from { opacity: 0; transform: translateY(14px); } }
@keyframes fin-pop { from { opacity: 0; transform: scale(.82); } }
@keyframes fin-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) {
  .fin *, .fin-in > * { animation: none !important; }
}

/* ── Journey row (§ Submit → Journey row) ──────────────────────────────────
   One row replaces the old split button, the progress dots, the green
   "übermittelt" box and its hint: round toggle — wire — lock — wire — 🤖
   Umsetzung — wire — 🏁 Abschluss. mountJourney() builds it and adopts
   #submit-iterate-btn / #submit-implement-btn as the toggles' fill halves;
   renderJourney() writes .journey[data-phase] = you | rethinking | unlock |
   implementing. Unlock never transform-scales anything: the two toggles trade
   flex-grow (the sum stays 1, so 🏁 and its wire do not move) while their
   faces cross-fade — the outgoing face is gone before the width moves, the
   incoming one fades in once the width has arrived, so no frame shows a
   squeezed or half-clipped glyph. */
.journey {
  --jr-track: color-mix(in srgb, var(--text-color, #c9d1d9) 7%, var(--panel-bg, #161b22));
  --jr-you: var(--accent-color, #388bfd);
  --jr-ai: var(--success-color, #3fb950);
  --jr-gold: #e3b341;
  --jr-ease: cubic-bezier(.4, 0, .2, 1);
  display: flex; align-items: center;
  padding: 0.15rem 0 0.4rem;
}
/* The final report has no journey row at all: the panel body belongs to
   the close-out inbox (§ Final Report Panel). */
body.viewing-frozen .journey, body.viewing-final .journey { display: none; }
.journey [hidden] { display: none !important; }
#panel-submitted { display: none !important; }
.submit-split[hidden], #submit-menu.jr-retired { display: none !important; }
.jr-wire {
  flex: none; display: block; width: 6px; height: 2px; border-radius: 2px;
  background: color-mix(in srgb, var(--text-color, #c9d1d9) 14%, transparent);
  transition: width .38s var(--jr-ease) .06s, opacity .15s, background .3s;
}
.jr-wire[data-ok] { background: color-mix(in srgb, var(--jr-ai) 55%, transparent); }
.jr-node {
  width: 28px; height: 28px; flex: none; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; line-height: 1; color: var(--text-secondary, #8b949e);
  background: var(--jr-track);
  box-shadow: 0 2px 6px rgba(0, 0, 0, .3), inset 0 1px 0 rgba(255, 255, 255, .05);
  overflow: hidden;
  transition: width .38s var(--jr-ease) .06s, opacity .15s;
}
/* The 🤖 Umsetzung node and its wire fold into the implement toggle. */
.journey[data-phase="unlock"] .jr-fold,
.journey[data-phase="implementing"] .jr-fold { width: 0; opacity: 0; }
.jr-toggle {
  position: relative; box-sizing: border-box; min-width: 0;
  display: grid; grid-template-areas: "f"; grid-template-columns: minmax(0, 1fr); align-items: center;
  height: 44px; padding: 3px; border-radius: 999px;
  background: var(--jr-track);
  box-shadow: 0 2px 8px rgba(0, 0, 0, .3), inset 0 1px 0 rgba(255, 255, 255, .04);
  transition: flex-grow .38s var(--jr-ease) .06s, flex-basis .38s var(--jr-ease) .06s,
              height .2s, padding .2s, background .2s, box-shadow .2s;
}
.jr-round { flex: 1 1 0; }
.jr-impl  { flex: 0 1 38px; background: transparent; box-shadow: none; padding: 0; height: 38px; }
.journey[data-phase="unlock"] .jr-round,
.journey[data-phase="implementing"] .jr-round { flex: 0 0 62px; }
.journey[data-phase="unlock"] .jr-impl,
.journey[data-phase="implementing"] .jr-impl {
  flex: 1 1 0; height: 44px; padding: 3px;
  background: var(--jr-track);
  box-shadow: 0 2px 8px rgba(0, 0, 0, .3), inset 0 1px 0 rgba(255, 255, 255, .04);
}
/* Faces: stacked in one grid cell; exactly one per toggle carries [data-on]. */
.jr-face {
  grid-area: f; min-width: 0; height: 100%;
  display: flex; align-items: center; gap: 3px;
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity .12s, visibility 0s linear .12s;
}
.jr-face[data-on] {
  opacity: 1; visibility: visible; pointer-events: auto;
  transition: opacity .2s .34s, visibility 0s;
}
/* The lock is the implement toggle's seed: it stays while the track grows,
   then hands over to the 🔓 face at the same spot. */
.jr-face-lock { transition: opacity .15s .3s, visibility 0s linear .45s; }
.jr-face-lock[data-on] { transition: opacity .2s .3s, visibility 0s; }
.jr-other, .jr-dot {
  flex: none; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  line-height: 1; color: var(--text-secondary, #8b949e);
}
.jr-other { width: 30px; height: 30px; font-size: 14px; }
.jr-other[data-ok] { color: var(--jr-ai); background: color-mix(in srgb, var(--jr-ai) 14%, transparent); }
.jr-chk { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 3.4; stroke-linecap: round; stroke-linejoin: round; }
.journey .jr-fill, .journey .submit-btn.jr-fill, .journey .implement-btn.jr-fill {
  flex: 1 1 auto; min-width: 0; width: auto; height: 38px; margin: 0; padding: 0 8px;
  border: 0; border-radius: 999px;
  display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px;
  font: inherit; font-size: 13px; font-weight: 600; line-height: var(--pill-line-height, 1.3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: #fff; cursor: pointer;
  background: linear-gradient(180deg, color-mix(in srgb, var(--jr-you) 88%, #fff), var(--jr-you));
  box-shadow: 0 4px 14px color-mix(in srgb, var(--jr-you) 40%, transparent), inset 0 1px 0 rgba(255, 255, 255, .22);
}
.journey .jr-fill:hover:not(:disabled) { filter: brightness(1.08); }
.journey .jr-fill:focus-visible, .jr-lock:focus-visible, .jr-mini:focus-visible {
  outline: 2px solid var(--jr-you); outline-offset: 2px;
}
.journey .jr-fill:disabled { opacity: .55; cursor: not-allowed; }
.journey .hint-cache, .journey .warn-icon { display: none; }
.journey .submit-label { overflow: hidden; text-overflow: ellipsis; }
.journey .implement-btn.jr-fill {
  justify-content: flex-start; padding: 0 10px 0 4px; color: #1f1500;
  background: linear-gradient(100deg, #c6901a, var(--jr-gold));
  box-shadow: 0 6px 18px rgba(227, 179, 65, .35), inset 0 1px 0 rgba(255, 255, 255, .35);
}
.journey .implement-btn.jr-fill:hover:not(:disabled) { background: linear-gradient(100deg, #c6901a, var(--jr-gold)); }
.jr-ul-ico {
  width: 30px; height: 30px; flex: none; border-radius: 50%;
  background: rgba(31, 21, 0, .18);
  display: flex; align-items: center; justify-content: center; font-size: 14px; line-height: 1;
}
.jr-ul-txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; text-align: left; }
.jr-ul-txt b { font-size: 13.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.jr-ul-txt small { font-size: 10.5px; font-weight: 500; opacity: .72; overflow: hidden; text-overflow: ellipsis; }
.jr-lock {
  width: 38px; height: 38px; flex: none; border: 0; border-radius: 50%; padding: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; line-height: 1; cursor: pointer;
  background: linear-gradient(180deg, var(--jr-gold), #c6901a);
  box-shadow: 0 0 16px rgba(227, 179, 65, .35), 0 2px 8px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .35);
  transition: transform .2s, box-shadow .2s, filter .2s;
}
.jr-lock:hover:not(:disabled) { transform: scale(1.07); box-shadow: 0 0 24px rgba(227, 179, 65, .55), 0 2px 8px rgba(0, 0, 0, .35); }
.jr-lock:disabled { filter: grayscale(.7) brightness(.8); cursor: default; box-shadow: none; }
/* Mini toggle (↩ | 🤖): the shrunk round toggle after unlock. */
.jr-mini {
  display: flex; align-items: center; gap: 3px; height: 100%; padding: 0; margin: 0;
  border: 0; background: transparent; color: inherit; cursor: pointer; border-radius: 999px;
}
.jr-mini:disabled { cursor: default; }
.jr-dot { width: 26px; height: 26px; font-size: 12px; }
.jr-dot[data-on] { background: linear-gradient(180deg, color-mix(in srgb, var(--jr-you) 88%, #fff), var(--jr-you)); color: #fff; font-weight: 700; }
.jr-dot .jr-chk { width: 15px; height: 15px; display: none; }
.journey[data-phase="implementing"] .jr-dot { color: var(--jr-ai); background: color-mix(in srgb, var(--jr-ai) 14%, transparent); }
.journey[data-phase="implementing"] .jr-dot > span { display: none; }
.journey[data-phase="implementing"] .jr-dot .jr-chk { display: block; }
/* Run bar — the filled AI half. Shared 1:1 with the toast (renderSubmittedToast). */
.jr-run {
  position: relative; flex: 1 1 auto; min-width: 0; height: 38px; box-sizing: border-box;
  display: flex; align-items: center; gap: 8px; padding: 0 14px 0 4px;
  border-radius: 999px; overflow: hidden; white-space: nowrap;
  font-size: 14px; font-weight: 600; line-height: var(--pill-line-height, 1.3); color: #fff;
  background: color-mix(in srgb, var(--jr-ai) 9%, #0c1410);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--jr-ai) 45%, transparent), 0 4px 14px color-mix(in srgb, var(--jr-ai) 25%, transparent);
}
.jr-run-done {
  position: absolute; top: 0; bottom: 0; left: 0; overflow: hidden; border-radius: 999px;
  background: color-mix(in srgb, var(--jr-ai) 42%, transparent);
  transition: width .5s var(--jr-ease);
}
.jr-shine {
  position: absolute; top: 0; bottom: 0; width: 45%; left: -45%;
  background: linear-gradient(90deg, transparent, rgba(170, 255, 180, .35), transparent);
  animation: jr-shine 1.6s linear infinite;
}
/* Indeterminate (no _progress yet): the SAME left-anchored fill as a real
   count, sized to cover 🤖 + label, the shimmer running only inside it — in
   the ☰ journey row and the toast alike (one rule for both). The old
   travelling 38% oval (jr-sweep) read as a stray blob in the narrow row. */
.jr-run[data-indeterminate] .jr-run-done { width: min(100%, 9.5rem) !important; }
.jr-bot {
  position: relative; width: 30px; height: 30px; flex: none; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1;
  background: linear-gradient(180deg, color-mix(in srgb, var(--jr-ai) 85%, #fff), color-mix(in srgb, var(--jr-ai) 75%, #000));
  animation: jr-breathe 2.4s ease-in-out infinite;
}
.jr-run b { position: relative; font-weight: 650; overflow: hidden; text-overflow: ellipsis; line-height: var(--pill-line-height, 1.3); padding-block: 1px; }
.jr-count { position: relative; margin-left: auto; font-style: normal; font-size: 13px; font-weight: 700; color: color-mix(in srgb, var(--jr-ai) 70%, #fff); cursor: help; }
.jr-count:empty { display: none; }
.jr-run[data-paused] { filter: saturate(.45) brightness(.85); }
.jr-run[data-paused] .jr-shine, .jr-run[data-paused] .jr-bot, .jr-run[data-paused] .jr-run-done { animation-play-state: paused; }
@keyframes jr-shine { to { left: 100%; } }
@keyframes jr-breathe { 50% { transform: scale(.9); } }
/* Build-up: once per round, the row assembles left → right. */
.journey.jr-build > * { animation: jr-in .42s ease-out both; }
.journey.jr-build > :nth-child(2) { animation-delay: .12s; }
.journey.jr-build > :nth-child(3) { animation-delay: .24s; }
.journey.jr-build > :nth-child(4) { animation-delay: .36s; }
.journey.jr-build > :nth-child(5) { animation-delay: .48s; }
.journey.jr-build > :nth-child(6) { animation-delay: .6s; }
.journey.jr-build > :nth-child(7) { animation-delay: .72s; }
@keyframes jr-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }

/* Status line under the row: "👉 Du bist dran · gespeichert". */
.panel-status { --jr-you: var(--accent-color, #388bfd); --jr-ai: var(--success-color, #3fb950); }
.panel-status .status-line { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; min-width: 0; white-space: nowrap; }
.panel-status .status-line .conn-label { overflow: hidden; text-overflow: ellipsis; }
.status-turn { font-weight: 650; }
.status-turn:empty { display: none; }
.status-turn:not(:empty)::after { content: " ·"; font-weight: 400; color: var(--text-secondary, #8b949e); }
.panel-status[data-turn="you"] .status-line { color: var(--text-secondary, #8b949e); }
/* Mixed toward --text-color, not #fff: on the light theme the white mix
   left pale text on a pale panel. */
.panel-status[data-turn="you"] .status-turn { color: color-mix(in srgb, var(--jr-you) 70%, var(--text-color, #fff)); }
.panel-status[data-turn="rethinking"] .status-line,
.panel-status[data-turn="finalizing"] .status-line,
.panel-status[data-turn="implementing"] .status-line { color: color-mix(in srgb, var(--jr-ai) 75%, var(--text-color, #fff)); }
/* The steps list stays the data model of the counter (x/y + tooltip); its
   own dots/disclosure are no longer drawn. */
.panel-status .status-detail { display: none !important; }

/* The ☰ head row is secondary chrome: quiet, one size, one rhythm with the
   panel body. ✕ and the theme toggle are the same 28px ghost button in
   --text-secondary that firms up to --text-color on hover / focus; no
   oversized ✕, no greyed emoji (that read as a dusty gear). */
.panel-head .panel-close-btn,
.panel-head .theme-toggle-btn {
  width: 28px; height: 28px; padding: 0; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  align-self: center; font-size: 15px; line-height: 1;
  color: var(--text-secondary, #8b949e); opacity: 1; filter: none;
  transition: color 0.15s, background-color 0.15s;
}
.panel-head .panel-close-btn:hover, .panel-head .panel-close-btn:focus-visible,
.panel-head .theme-toggle-btn:hover, .panel-head .theme-toggle-btn:focus-visible {
  color: var(--text-color, #c9d1d9);
  background: color-mix(in srgb, var(--text-color, #c9d1d9) 8%, transparent);
  filter: none;
}
.panel-head .panel-close-btn:focus-visible,
.panel-head .theme-toggle-btn:focus-visible { outline: 2px solid var(--accent-color, #58a6ff); outline-offset: 1px; }
/* Theme glyphs as monochrome line icons in currentColor (masked SVG), so
   they take the head's text colour in both themes; the emoji stay in the
   markup as the fallback for engines without mask support. */
@supports ((mask: url("")) or (-webkit-mask: url(""))) {
  .panel-head .theme-toggle-btn .theme-glyph {
    width: 16px; height: 16px; font-size: 0; color: transparent;
    background: var(--text-secondary, #8b949e);
    -webkit-mask: var(--glyph) center / contain no-repeat; mask: var(--glyph) center / contain no-repeat;
  }
  .panel-head .theme-toggle-btn:hover .theme-glyph,
  .panel-head .theme-toggle-btn:focus-visible .theme-glyph { background: var(--text-color, #c9d1d9); }
  .panel-head .theme-toggle-btn [data-glyph="sun"] {
    --glyph: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='4'/%3E%3Cpath d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'/%3E%3C/svg%3E");
  }
  .panel-head .theme-toggle-btn [data-glyph="moon"] {
    --glyph: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linejoin='round'%3E%3Cpath d='M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'/%3E%3C/svg%3E");
  }
}

/* What is open now — marked in the ☰ menu at all times (markPanelCurrent,
   § Panel Chrome JS mirrors the layout's data-active to aria-current). One
   look for every entry type: accent tint + a 3px accent bar + full text
   colour; a design heading only takes the accent text. */
.concept-decision-panel [aria-current="page"] {
  background: color-mix(in srgb, var(--accent-color, #58a6ff) 16%, transparent);
  box-shadow: inset 3px 0 0 var(--accent-color, #58a6ff);
  color: var(--text-color, #c9d1d9);
  font-weight: 600;
}
.concept-decision-panel .screen-nav-design-heading[aria-current="true"] { color: var(--accent-color, #58a6ff); }

/* The round label ("Runde 1") and its dot are gone: the round is already named by the rounds chip and
   the journey row, a second label above the notes only repeated it. The element stays in the markup
   (the engine still writes its text), it is just never shown. */
.panel-head .panel-here-round { display: none !important; }

/* ── Status toast — the same pill as the panel (renderSubmittedToast) ── */
.jr-toast {
  /* sits right ABOVE the notes field: --an-comp-top is the distance of the analysis composer's top edge
     from the viewport bottom (fitChat sets it; it follows the composer when it grows), 2rem without one */
  position: fixed; left: 50%; bottom: calc(var(--an-comp-top, 1.25rem) + 14px); transform: translateX(-50%);
  z-index: 97; width: min(340px, calc(100vw - 184px));
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  --jr-you: var(--accent-color, #388bfd); --jr-ai: var(--success-color, #3fb950); --jr-gold: #e3b341;
  cursor: pointer; animation: jr-toast-in .25s ease;
}
.jr-toast[hidden], body.panel-open .jr-toast, body.viewing-frozen .jr-toast { display: none; }
.jr-toast-cap { font-size: 10.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--text-secondary, #8b949e); }
.jr-toast .jr-run { width: 100%; height: 42px; flex: none; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--jr-ai) 50%, transparent), 0 10px 26px rgba(0, 0, 0, .45); }
.jr-toast-you {
  box-sizing: border-box; width: 100%; height: 42px; flex: none; border-radius: 999px; padding: 0 16px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 14px; color: #fff; white-space: nowrap; overflow: hidden;
  background: linear-gradient(180deg, color-mix(in srgb, var(--jr-you) 88%, #fff), var(--jr-you));
  box-shadow: 0 10px 26px color-mix(in srgb, var(--jr-you) 40%, transparent), inset 0 1px 0 rgba(255, 255, 255, .22);
}
.jr-toast-you[hidden], .jr-toast .jr-run[hidden] { display: none; }
.jr-toast-you span { opacity: .85; }
.jr-float { font-size: 11.5px; font-weight: 600; letter-spacing: .02em; color: var(--jr-gold); animation: jr-float 2.4s ease-in-out infinite; }
.jr-float[hidden] { display: none; }
.jr-float i { font-style: normal; animation: jr-dot 1.2s infinite; }
.jr-float i:nth-child(2) { animation-delay: .2s; }
.jr-float i:nth-child(3) { animation-delay: .4s; }
@keyframes jr-dot { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }
@keyframes jr-float { 50% { transform: translateY(-2px); } }
@keyframes jr-toast-in { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
body:has(.draft-offline-strip:not([hidden])) .jr-toast { bottom: calc(var(--an-comp-top, 1.25rem) + 14px + 2.75rem); }

@media (prefers-reduced-motion: reduce) {
  .jr-toggle, .jr-face, .jr-face[data-on], .jr-face-lock, .jr-face-lock[data-on], .jr-wire, .jr-node, .jr-run-done { transition: none !important; }
  .jr-shine, .jr-bot, .journey.jr-build > *, .jr-toast, .jr-float, .jr-float i { animation: none !important; }
  .jr-lock:hover:not(:disabled) { transform: none; }
}
```


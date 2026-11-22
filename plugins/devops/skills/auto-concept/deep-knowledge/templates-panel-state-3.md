# Concept templates, part 27 of 54: Shared systems — decision panel state CSS (continued 3)

```css
/* ── Final-report body components (§ Final Report Panel → Report body) ──────
   Claude authors the report in plain markup with these engine classes — no
   round stylesheet. Every colour is a page token, so light and dark both work.
   Budget: one screen at 1440 × 900, in one narrow reading column shared with
   the analysis page. The page header is the only title.
   Order on the page: .fr-banner once closed · .fr-sentence · .fr-main
   (.fr-results | .fr-ba or .fr-flow) · .fr-holds · .fr-depth · .fr-close
   (the Funde | the docked close-out sheet) · .fr-folds.
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
/* The close-out zone: the Funde (left, the report's focus — every card carries
   its route pill) and the docked close-out sheet (right: the panel's own node at
   the panel's own width, placeCloseout()). Without Funde the sheet stands alone. */
section[data-final-report] .fr-close {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(14rem, 17.5rem);
  gap: 1rem;
  align-items: start;
  margin: 0 0 0.85rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--warning-color, #d29922) 45%, var(--border-color, #30363d));
  border-radius: 12px;
  background: color-mix(in srgb, var(--text-color, #c9d1d9) 3%, transparent);
}
section[data-final-report] .fr-close > .fr-close-sheet:only-child { grid-column: 1 / -1; width: min(100%, 20rem); margin-inline: auto; }
section[data-final-report] .fr-close-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.5rem; margin: 0 0 0.5rem; font-size: 0.98rem; font-weight: 700; }
section[data-final-report] .fr-close-head small { font-size: 0.78rem; font-weight: 500; color: var(--text-secondary, #8b949e); }
section[data-final-report] .fr-funde-hint { margin: 0.45rem 0 0; font-size: 0.72rem; line-height: 1.35; color: var(--text-secondary, #8b949e); }
/* Docked, the sheet takes its natural height: nothing scrolls inside it. The 🧭
   rows stay in the panel — beside the Fund cards they would say everything twice. */
.fr-close-sheet .closeout-sheet { flex: none; }
.fr-close-sheet .closeout-body { overflow: visible; }
.fr-close:has([data-open-questions]) .fr-close-sheet [data-closeout-group="decide"] { display: none !important; }
.fr-close:has([data-open-questions]) .fr-close-sheet .closeout-body:not(:has(> [data-closeout-group]:not([hidden], [data-closeout-group="decide"]), > .closeout-empty:not([hidden]))) { display: none; }
.fr-close:has([data-open-questions]) .fr-close-sheet .closeout-body:not(:has(> [data-closeout-group]:not([hidden], [data-closeout-group="decide"]), > .closeout-empty:not([hidden]))) + .closeout-foot { padding-top: 0; border-top: 0; }
section[data-final-report] .fr-funde { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
/* A Fund card: name and route pill on one line, was / wo / warum under it. */
section[data-final-report] .fr-funde li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.3rem 0.6rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--border-color, #30363d);
  border-radius: 8px;
  background: var(--panel-bg, #161b22);
  transition: border-color 0.2s, box-shadow 0.2s;
}
section[data-final-report] .fr-funde li[data-oq-origin="shortfall"] { border-left: 3px solid var(--warning-color, #d29922); }
section[data-final-report] .fr-funde li > .fr-fkv { grid-column: 1 / -1; margin: 0; }
/* In the zone a card reads as text: what it is in full, then where and why
   pre-selected as one quiet line. The dt labels stay for screen readers. */
section[data-final-report] .fr-close .fr-funde li { position: relative; }
section[data-final-report] .fr-close .fr-fkv { display: block; font-size: 0.8rem; line-height: 1.35; }
section[data-final-report] .fr-close .fr-fkv dt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
section[data-final-report] .fr-close .fr-fkv dd:first-of-type { display: block; margin-bottom: 0.15rem; }
section[data-final-report] .fr-close .fr-fkv dd:not(:first-of-type) { display: inline; font-size: 0.74rem; color: var(--text-secondary, #8b949e); }
section[data-final-report] .fr-close .fr-fkv dd:nth-of-type(2)::before { content: "📍 "; }
section[data-final-report] .fr-close .fr-fkv dd:nth-of-type(n+3)::before { content: " · "; }
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
  section[data-final-report] .fr-main,
  section[data-final-report] .fr-close { grid-template-columns: 1fr; }
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
```


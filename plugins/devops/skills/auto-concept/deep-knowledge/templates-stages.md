# Concept templates, part 48 of 51: Shared systems — Etappen (stages): contract, states, head name, round row, stepper tabs, start control, journey row, stage reports — markup and CSS

## Etappen (stages)

A concept may be split into **Etappen** (`page.json` `stages`, 1–7 entries
`{id: "A"…"G", name ≤ 24 chars}`). The build injects
`<script type="application/json" id="concept-stages">{stages, current, icon, title}</script>`
and keeps `data-stage="<id>"` on every round section, frozen ones included.
The engine only READS both — it never derives stages itself. Without the
script the page is a concept without Etappen and everything below except
the two all-concept changes is inert.

**Free order, one Etappe at a time.** Each entry carries a `state` the build
derives: `built` (a stage final report `section[data-final-report][data-stage="<id>"]`
exists), `issue` / `dropped` (`page.json` `stages[i].state`, written when a
close-out routed the Etappe away), otherwise `open` — with or without rounds,
also when it was passed over. A missing `state` (older page) reads as `open`.
Any OPEN Etappe other than the live one can come next; rounds of one Etappe
need not be consecutive, and an open Etappe that already has rounds is
reopened with a new round. A built Etappe is never started again (a change
goes through "🔧 Nachbessern" on its report). Each Etappe is built on its own
(implement carries `stage`) and ends with its own final report — a round tab
of the SAME page. Shipping happens once, in the close-out after which no
Etappe is left open.

Payloads (all through the normal submit path):

| Action | Payload additions |
|---|---|
| `next-stage` | `{stage: "<live>", next: "<any open id ≠ live>"}` |
| `implement` (staged concept, live regular round) | `{stage: "<live>"}` |
| `finalize` of a stage report | `{stage: "<id>", stages: [{id, route: "open"\|"issue"\|"drop"}], next: "<id>"\|null, final: true\|false}` — `stages` lists the other Etappen still `open`; with `final: false` also `ship: {run: false}` and `disposition: null` |
| `finalize` of an untagged report / any concept without Etappen | none — today's payload, byte for byte |

All concepts (with or without Etappen):

- **Panel head** names the concept on the live round: `<icon> <title>`
  (`conceptHeadName()`; icon from `#concept-stages`, default 🧭; title from
  `#concept-stages`, otherwise the page `<title>` without its status glyph),
  full name as app tooltip. A frozen round keeps "🧭 Runde N · archiviert",
  the final report "🏁 Abschluss" (showIteration, § Iteration Tabs) — a
  stage report "🏁 <Etappenname>" (`stageReportHead()`), in the head and
  on its round tab (`labelStageReportTabs()`; an own `data-tab-label` wins).
- **Round in the nav**: the design overview row reads "Übersicht · Runde N"
  (`.screen-nav-rnd`); a round without a visible overview row gets a plain
  "Runde N" row (`#panel-round-row`) at the top of the scroll box. Both are
  hidden on a frozen round and on the final report (the head names those).

Only with Etappen:

- **No structure button on the page.** The stages live in the ☰ panel only:
  no Etappen glyph sits in the page's top-left corner (it duplicated the tab
  row and read as noise on the mock — user note, Kleingarten concept round 3).
- **Etappen stepper** (`#stage-tabs`) directly under the head: tabs of one
  width (widened to span the row when all fit, at most 7rem), each a **kind node** (26px circle) above the name (two lines, never
  ellipsised — the 24-char limit is an authoring rule). The node shows the
  glyph of the Etappe's kind, read from its newest round (`_stKindOf()`):
  `pick` (≥2 designs, alternatives), `seq` (designs as topics), `open` (≥2
  designs, no set), `one` (one design), `analysis` (`data-analysis="full"`),
  `doc` (decision / free sections); an Etappe without a round yet shows its
  letter instead. The letter otherwise sits as a small badge on the node.
  The nodes are joined by a 2px connector at their centre height (between
  built / live nodes → success colour, else border colour), so the row reads
  as one stepper and needs no more height than a tab. The node's look
  (`data-state`, `_stState()`) follows the Etappe's state, never its place in
  the list: `done` = built (success fill), `now` = the live Etappe (accent
  fill), `open` = has rounds, not built (plain), `ahead` = no round yet
  (dashed), `closed` = issue / dropped (dimmed, name struck through);
  `data-stage-state` carries the raw state. App tooltip: the kind
  ("3 Richtungen, eine gewählt" / "3 Themen nacheinander" / "1 Richtung" /
  "n Abschnitte" / "n Entscheidungen, geführt") and "Etappe B · Runde 4" (the
  newest round), or "Noch nicht begonnen" without a round; a built / issue /
  dropped Etappe adds a line "Gebaut" / "Als Issue angelegt" / "Gestrichen"
  (without a round that state line is the whole tooltip). The live stage
  report's page pill reads "🏁 <Etappenname>" too (`header[data-stage-pill]`).
  Scroll-snap per tab, the viewport sized to whole tabs so
  none is cut. ‹ › are plain glyphs in their own gutters beside the row,
  shown on hover or keyboard focus only, and only when the row overflows.
  Roving tabindex: ←/→/Home/End move focus, Enter/Space opens the tab. On
  every panel open the tab of the visible round's Etappe is selected and
  scrolled into view.
- **Tab content**: the visible round's Etappe → today's nav (design screen
  nav or section TOC), plus a 🕘 disclosure for that Etappe's earlier rounds.
  Any other Etappe → `#stage-pane`: its NEWEST round as a "Runde N" row and
  that round's TOC (click = jump there), and the 🕘 disclosure listing its
  earlier rounds the same way. A built Etappe's own report sits above as one
  "🏁 <Etappenname>" row (`.stage-report`, a jump like any round; in the
  visible Etappe's 🕘 area when the report is not the round on screen). An
  issue / dropped Etappe shows its state word as one quiet line. No counters.
- **Start control** (`#stage-start`, ▶): at the top of the pane of an OPEN
  Etappe that is not the live one — "Mit dieser Etappe weitermachen" when it
  has rounds, "Etappe starten" when it has none. Click submits
  `submitWithAction('next-stage', {stage: <live>, next: <that id>})` through
  the normal submit path, so the live round's answers go with it. It never
  asks the empty-round confirm (nor does "Nächste Etappe ›"): passing an
  Etappe over without answers is one deliberate click, and the untouched
  round is sent with its fields as they stand (authored defaults, no
  comments). Never for the live Etappe, a built / issue / dropped one, on a
  frozen round's view, or while the live round is a final report (there the
  close-out decides what comes next) (`stageCanStart()`). Both controls are
  disabled while a submit runs and re-armed with the panel
  (`syncStageControls()`, called from `renderJourney()` on every phase change). Two clicks
  by design: the tab click only VIEWS an Etappe (browsing its rounds must
  never submit the live round), the labelled button starts it.
- The head's 🕘 rounds chip leaves the live head (it lives in the tabs);
  a frozen round's head is unchanged.
- **Journey row**: the 🔒 · 🤖 · 🏁 stations stand in EVERY Etappe; the
  implement button reads "Diese Etappe umsetzen" — wrapping to two lines,
  never cut; the sub-line "nur diese Etappe, das Concept bleibt offen" lives
  in its tooltip and accessible name (`renderStageImplement()`,
  templates-stages-free-js.md) — and its payload names the
  live Etappe (`stageImplementFields()`). "Nächste Etappe ›"
  (`#jr-next-stage`) is an additional quiet pill right above the row while
  another OPEN Etappe exists; it targets the next open Etappe after the live
  one in list order, wrapping around (`stageNextOpen()`), and submits
  `next-stage` like the start control. No open Etappe left → no pill.

### Stage reports

A stage final report (`data-final-report data-stage="X"`) is a normal final
report (Funde, Tests, Hand-offs, Nachbessern, review switch) and a normal
round tab. Followed by rounds of other Etappen it is a frozen round like any
other: read-only, reachable from the round tabs and from its Etappe's pane.
Its close-out sheet, while it is the LIVE round, adds the block "Offene
Etappen" (templates-stages-free-js.md): per other open Etappe nachholen
(default) · als Issue anlegen · streichen, and "Weiter mit" among the kept
ones (default: the first in list order). While one stays open the sheet
offers only "🏁 Etappe abschließen und weiter" (`#closeout-stage-go`,
`finalize` with `final: false`) — no ship buttons, no 🧹 disposition — and
`#closeout-stage-plan` reads out the plan ("➜ Weiter mit Etappe C · … ·
📌 B als Issue · noch nicht shippen"). Nothing left open → today's full
close-out (both ship buttons, disposition), `final: true`.

```css
/* ── Etappen + round row (§ Etappen) ── */
/* The "Runde N" row stays in the DOM (state hooks read it) but is never shown:
   the user dropped "Runde" as a visible term on the live round. */
.panel-round-row, .panel-round-row[hidden] { display: none; }
.screen-nav-rnd { margin-left: 0.4rem; font-weight: 500; color: var(--text-secondary, #8b949e); white-space: nowrap; }
body.viewing-frozen .screen-nav-rnd, body.viewing-frozen .panel-round-row { display: none; }
/* Live head of a staged concept: the 🕘 chip lives in the Etappen tabs. */
body[data-staged]:not(.viewing-frozen) #panel-here-rounds,
body[data-staged]:not(.viewing-frozen) #panel-here-rounds-list { display: none !important; }

.stage-tabs { --stage-tab-w: 4.6rem; --stage-tab-gap: 4px; --stage-node: 26px; position: relative; flex: 0 0 auto;
  display: flex; align-items: center; margin: 0 0 0.6rem; }
.stage-tabs-sc { flex: 1 1 auto; min-width: 0; overflow-x: auto; overflow-y: hidden;
  scroll-snap-type: x mandatory; scroll-behavior: smooth; padding-bottom: 2px; }
.stage-tabs[data-overflow] .stage-tabs-sc { flex: none; }
.stage-tabs-in { display: flex; gap: var(--stage-tab-gap); }
.stage-tab {
  position: relative; flex: none; box-sizing: border-box; width: var(--stage-tab-w); min-height: 3.5rem;
  padding: 4px 3px; border-radius: 9px; border: 1px solid transparent; background: none;
  display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;
  scroll-snap-align: start; cursor: pointer; font: inherit; color: var(--text-secondary, #8b949e);
}
.stage-tab:hover { background: color-mix(in srgb, var(--accent-color, #58a6ff) 8%, transparent); }
.stage-tab:focus-visible { outline: 2px solid var(--accent-color, #58a6ff); outline-offset: -2px; }
/* Stepper connector: from the previous node's right edge to this node's
   left edge, at the node centre (the tab's own box is the reference). */
.stage-tab + .stage-tab::before {
  content: ""; position: absolute; z-index: 0; height: 2px; border-radius: 1px; pointer-events: none;
  top: calc(5px + var(--stage-node) / 2 - 1px);
  left: calc(-50% - var(--stage-tab-gap) + var(--stage-node) / 2 + 3px);
  right: calc(50% + var(--stage-node) / 2 + 3px);
  background: var(--border-color, #30363d);
}
.stage-tab:is([data-state="done"], [data-state="now"]) + .stage-tab:is([data-state="done"], [data-state="now"])::before {
  background: color-mix(in srgb, var(--success-color, #3fb950) 70%, transparent);
}
.stage-node { position: relative; z-index: 1; box-sizing: border-box; width: var(--stage-node); height: var(--stage-node);
  flex: none; border-radius: 50%; display: grid; place-items: center;
  border: 1.5px solid var(--border-color, #30363d); background: var(--panel-bg, #161b22); color: var(--text-secondary, #8b949e); }
.stage-node svg { display: block; width: 14px; height: 14px; }
.stage-tl { position: absolute; right: -5px; bottom: -4px; box-sizing: border-box; min-width: 13px; height: 13px; padding: 0 2px;
  border-radius: 7px; display: grid; place-items: center; font-size: 8px; font-weight: 700; line-height: 1;
  background: var(--panel-bg, #161b22); color: inherit; border: 1px solid currentColor; }
.stage-node[data-kind="none"] .stage-tl { position: static; min-width: 0; height: auto; padding: 0; border: 0;
  background: none; font-size: 11px; }
.stage-tn { font-size: 0.66rem; line-height: 1.15; hyphens: auto; overflow-wrap: break-word; }
.stage-tab[data-state="done"] .stage-node {
  border-color: color-mix(in srgb, var(--success-color, #3fb950) 70%, transparent); color: var(--success-color, #3fb950);
  background: color-mix(in srgb, var(--success-color, #3fb950) 16%, var(--panel-bg, #161b22));
}
.stage-tab[data-state="now"] .stage-node {
  border-color: var(--accent-color, #58a6ff); background: var(--accent-color, #58a6ff); color: #fff;
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent-color, #58a6ff) 60%, transparent);
}
.stage-tab[data-state="now"] .stage-tl { background: var(--accent-color, #58a6ff); }
.stage-tab[data-state="ahead"] .stage-node { border-style: dashed; opacity: 0.6; }
/* Open with rounds (passed over): the kind glyph at full strength on a
   tinted ring — visibly worked on, never the green "built" look. */
.stage-tab[data-state="open"] .stage-node {
  color: var(--text-color, #e6edf3);
  border-color: color-mix(in srgb, var(--accent-color, #58a6ff) 50%, var(--border-color, #30363d));
}
/* Issue / dropped: visibly closed — dimmed node, name struck through. */
.stage-tab[data-state="closed"] .stage-node { opacity: 0.55; border-style: dotted; }
.stage-tab[data-state="closed"] .stage-tn { text-decoration: line-through; opacity: 0.7; }
.stage-tab[aria-selected="true"] {
  color: var(--text-color, #e6edf3); background: color-mix(in srgb, var(--accent-color, #58a6ff) 13%, transparent);
  border-color: color-mix(in srgb, var(--accent-color, #58a6ff) 45%, transparent);
}
.stage-tab[aria-selected="true"] .stage-tn { font-weight: 600; }
/* ‹ › : plain glyphs in their own 18px gutters, no frame; only while the row
   overflows, visible on hover or keyboard focus. */
.stage-arr { display: none; flex: none; width: 18px; align-self: stretch; padding: 0; border: 0; background: none;
  font: inherit; font-size: 17px; line-height: 1; color: var(--text-secondary, #8b949e);
  cursor: pointer; opacity: 0; transition: opacity 0.15s; }
.stage-tabs[data-overflow] .stage-arr { display: grid; place-items: center; }
.stage-arr-prev { justify-items: start; }
.stage-arr-next { justify-items: end; }
.stage-tabs:hover .stage-arr, .stage-tabs:focus-within .stage-arr { opacity: 0.75; }
.stage-arr:hover, .stage-arr:focus-visible { opacity: 1 !important; color: var(--text-color, #e6edf3); }
.stage-arr:focus-visible { outline: 2px solid var(--accent-color, #58a6ff); outline-offset: -2px; border-radius: 6px; }
.stage-arr:disabled { visibility: hidden; }
@media (hover: none) { .stage-tabs[data-overflow] .stage-arr { opacity: 0.75; } }

/* Another Etappe selected: its pane replaces the live nav in the scroll box. */
.panel-nav-scroll[data-stage-view="other"] > :not(#stage-pane) { display: none !important; }
.stage-pane[hidden] { display: none; }
.stage-round {
  display: flex; align-items: center; gap: 0.5rem; width: 100%; box-sizing: border-box; padding: 0.4rem 0.6rem;
  border: 0; border-radius: 8px; background: none; font: inherit; font-size: 0.85rem; font-weight: 700;
  color: var(--text-color, #e6edf3); text-align: left; cursor: pointer;
}
.stage-round::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--text-secondary, #8b949e); }
.stage-round:hover { background: color-mix(in srgb, var(--accent-color, #58a6ff) 10%, transparent); }
.stage-round:focus-visible, .stage-ti:focus-visible, .stage-older-btn:focus-visible { outline: 2px solid var(--accent-color, #58a6ff); outline-offset: -2px; }
.stage-toc { display: flex; flex-direction: column; gap: 1px; margin: 2px 0 8px 0.5rem; padding-left: 0.5rem;
  border-left: 2px solid color-mix(in srgb, var(--accent-color, #58a6ff) 45%, transparent); }
.stage-ti {
  display: block; width: 100%; box-sizing: border-box; padding: 4px 8px; border: 0; border-radius: 6px;
  background: none; font: inherit; font-size: 0.8rem; color: var(--text-color, #c9d1d9); text-align: left; cursor: pointer;
}
.stage-ti:hover { background: color-mix(in srgb, var(--accent-color, #58a6ff) 10%, transparent); }
.stage-older-btn {
  display: flex; align-items: center; gap: 6px; width: 100%; box-sizing: border-box; margin-top: 6px; padding: 5px 10px;
  border: 0; border-radius: 8px; background: none; font: inherit; font-size: 0.8rem; color: var(--text-secondary, #8b949e);
  text-align: left; cursor: pointer;
}
.stage-older-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 999px;
  border: 1px solid var(--border-color, #30363d); }
.stage-older-btn[aria-expanded="true"] .stage-older-chip {
  border-color: color-mix(in srgb, var(--accent-color, #58a6ff) 55%, transparent); color: var(--text-color, #e6edf3);
  background: color-mix(in srgb, var(--accent-color, #58a6ff) 12%, transparent);
}
.stage-older-caret { margin-left: auto; font-size: 10px; }
.stage-older { display: flex; flex-direction: column; gap: 1px; margin: 2px 0 0 0.5rem; padding-left: 0.5rem;
  border-left: 2px dashed var(--border-color, #30363d); }
.stage-older[hidden] { display: none; }
.stage-ahead { margin: 0.5rem 0.6rem; font-size: 0.8rem; color: var(--text-secondary, #8b949e); }

/* Start control at the top of an open Etappe's pane. */
.stage-start {
  display: flex; align-items: center; gap: 0.45rem; width: 100%; box-sizing: border-box; margin: 0 0 0.5rem;
  padding: 0.45rem 0.7rem; border: 0; border-radius: 8px; font: inherit; font-size: 0.82rem; font-weight: 600;
  text-align: left; cursor: pointer; color: var(--text-color, #e6edf3);
  background: color-mix(in srgb, var(--accent-color, #58a6ff) 12%, var(--panel-bg, #161b22));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-color, #58a6ff) 55%, transparent);
}
.stage-start:hover { box-shadow: inset 0 0 0 1px var(--accent-color, #58a6ff); }
.stage-start:focus-visible { outline: 2px solid var(--accent-color, #58a6ff); outline-offset: 2px; }
.stage-start:disabled { opacity: 0.5; cursor: default; }
.stage-start-ico { flex: none; font-size: 0.7rem; color: var(--accent-color, #58a6ff); }
.stage-report::before { display: none; }

/* Journey: the stations always stand; "Nächste Etappe ›" is a quiet pill
   right above the row, only while another open Etappe exists. */
.jr-next-stage { display: none; }
body[data-stage-next] .jr-next-stage {
  display: flex; align-items: center; width: fit-content; margin: 0 0 0.4rem auto; height: 26px; padding: 0 10px; border: 0; border-radius: 999px;
  white-space: nowrap; font: inherit; font-size: 0.72rem; font-weight: 600; cursor: pointer;
  color: var(--text-secondary, #8b949e); background: none;
  box-shadow: inset 0 0 0 1px var(--border-color, #30363d);
}
body[data-stage-next] .jr-next-stage:hover { color: var(--text-color, #e6edf3); box-shadow: inset 0 0 0 1px var(--accent-color, #58a6ff); }
body[data-stage-next] .jr-next-stage:focus-visible { outline: 2px solid var(--accent-color, #58a6ff); outline-offset: 2px; }
body[data-stage-next] .jr-next-stage:disabled { opacity: 0.5; cursor: default; }
body.viewing-frozen .jr-next-stage, body.viewing-final .jr-next-stage { display: none !important; }
/* "Diese Etappe umsetzen" is the user's own wording: never cut. In a staged
   concept the label wraps to two lines inside the 38px pill and the
   sub-line moves into the tooltip / accessible name (renderStageImplement). */
body[data-staged] .journey .implement-btn.jr-fill { white-space: normal; }
body[data-staged] .journey .jr-ul-txt b {
  white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: normal; line-height: 1.12;
}
body[data-staged] .journey .jr-ul-txt small { display: none; }

/* Live stage report: the page pill names the Etappe (labelStageReportTabs). */
body.viewing-final .concept-content > header[data-stage-pill]::before { content: attr(data-stage-pill); }

/* Close-out of a stage report: "Offene Etappen" (templates-stages-free-js.md). */
.closeout-sheet .stage-co-list { display: flex; flex-direction: column; gap: 0.45rem; }
.closeout-sheet .stage-co-row, .closeout-sheet .stage-co-next { display: flex; flex-direction: column; gap: 0.25rem; }
.closeout-sheet .stage-co-next { margin-top: 0.6rem; }
.closeout-sheet .stage-co-name { font-size: 0.8rem; color: var(--text-color, #c9d1d9); }
.closeout-sheet .stage-co-row[data-route="drop"] .stage-co-name { text-decoration: line-through; opacity: 0.6; }
.closeout-sheet .stage-co-opts { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.closeout-sheet .stage-co-opt { position: relative; display: inline-flex; cursor: pointer; }
.closeout-sheet .stage-co-opt input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
.closeout-sheet .stage-co-opt span {
  padding: 2px 9px; border-radius: 999px; font-size: 0.72rem; font-weight: 600;
  border: 1px solid var(--border-color, #30363d); color: var(--text-secondary, #8b949e);
}
.closeout-sheet .stage-co-opt:hover span { color: var(--text-color, #c9d1d9); }
.closeout-sheet .stage-co-opt input:checked + span {
  color: var(--accent-color, #58a6ff); border-color: var(--accent-color, #58a6ff);
  background: color-mix(in srgb, var(--accent-color, #58a6ff) 12%, transparent);
}
.closeout-sheet .stage-co-opt input:focus-visible + span { outline: 2px solid var(--accent-color, #58a6ff); outline-offset: 1px; }
.closeout-sheet .stage-co-opt input:disabled + span { opacity: 0.55; cursor: default; }
.closeout-sheet[data-stage-continue] .closeout-dispose-line,
.closeout-sheet[data-stage-continue] #panel-dispose-concept { display: none !important; }
.closeout-sheet #closeout-stage-go {
  color: #fff; background: var(--accent-color, #58a6ff); border: 1px solid var(--accent-color, #58a6ff);
}
.closeout-sheet #closeout-stage-go:hover { background: color-mix(in srgb, var(--accent-color, #58a6ff) 85%, var(--text-color, #c9d1d9)); }
```

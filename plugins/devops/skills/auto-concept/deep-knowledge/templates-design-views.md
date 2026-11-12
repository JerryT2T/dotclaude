# Concept templates, part 09 of 50: Template: design — views, variant overview

## Views (optional)

A third, independent thing a `design` iteration may hold: non-visual
questions that belong **inside** the same round as the artefact they are
about, instead of being deferred to a separate `decision` iteration one
round later — authored as **one** Full analysis view whose topics carry the
questions (§ View kind `analysis`), never as several decision / comparison
pages. A `section[data-view]` is a **top-level sibling of
`section[data-design]`** — switched exactly like a design, fullscreen, with
its own entry in the switcher and the panel TOC.

```html
<section data-iteration="3" data-iteration-template="design" data-active>
  <section data-design="dispatch" data-nav-label="Dispatch board" data-design-active="true">
    <section id="d1-s1" data-screen data-nav-label="Overview" data-screen-active="true">…</section>
    <section id="d1-s2" data-screen data-nav-label="Detail" hidden>…</section>
  </section>

  <section data-view="analysis" data-view-kind="analysis" data-analysis="full"
           data-nav-label="Analyse" hidden>…</section>
</section>
```

**Rules:**

- **≥1 `data-design` is mandatory** — see § Rules above. Views are never the
  only top-level content.
- **Exactly one top-level item is active** at a time: a design carrying
  `data-design-active="true"` (and NOT `hidden`) or a view carrying
  `data-view-active="true"` (and NOT `hidden`). Every other top-level item —
  every other design, every other view — carries `hidden`. `showView()` and
  `showDesign()` (§ Layout JS) both maintain this invariant; neither ever
  leaves two top-level items simultaneously visible.
- **Authored markup always makes a DESIGN the active item, never a view.**
  A view becomes active only at runtime, through `showView()` — from the
  switcher, the panel TOC, or the `_activeView` restore after a reload.
  This is not a style preference: `buildDesignUI()` early-returns without an
  active design, which would leave the switcher, both nav groups and all
  three dock textarea containers unbuilt. The same rule holds after a tab
  switch — the `iteration:changed` handler deliberately drops back to the
  incoming iteration's active design (§ Layout JS). **A reload is not a tab
  switch:** the boot `showIteration()` fires the same event for the round the
  layout has just restored, so the handler compares the incoming round with
  the one it last built (`shownIterationId`) and keeps a restored view that is
  on screen — otherwise the boot hid the view moments after the `_activeView`
  restore and the `showScreen()` → `saveState()` behind it deleted the key, so
  no question view ever survived the reload every iteration append triggers
  (pinned by `view-boot-restore.test.js` on the assembled fixture).
- `data-view` ids are unique **page-wide** — and this is the one id space
  where that matters, so do not pattern-match it off the others. Design ids
  and screen ids deliberately REPEAT across iterations (that is what lets
  `harvestDockValues()` carry a note forward when the same screen reappears
  in the next round); a view id that repeated would collide in exactly the
  places where designs and screens are meant to.
- **A view scrolls; a design screen does not.** `body` keeps
  `overflow: hidden` in `design` mode throughout — only the active view's own
  box scrolls internally (`overflow-y: auto`), never the page. See § Layout CSS.
- **When to use a view instead of a separate `decision` iteration** (also
  stated in `SKILL.md` § Step 1a): the question is *about the artefact in
  front of you* right now → a topic of this round's one analysis view. The
  question stands on its own, independent of any one mockup → its own
  `decision` iteration. When in doubt, ask whether the user would need to
  flip back to a screen to answer sensibly — if yes, it is a view.
- **A view never re-asks the design choice** (`SKILL.md` § Step 1a
  → Orthogonality). The verdict *between* the designs comes from the dock's
  per-design / per-screen textareas — that is what `comments.designs` is
  for. An analysis topic asks a question whose answer holds
  whichever design wins; its `[data-decision]` groups are never the
  designs themselves, never the traits that tell them apart, and its prose
  never argues for or against a design. An alternative whose `data-label`
  (or heading) equals a `data-design`'s `data-nav-label` or id in the same
  iteration is refused by the deterministic gate (validation-gate.md P31).
  A view that names one design with `data-view-for` is *about* that
  design — a question inside it, not a vote on it.
- **Navigation.** `#screen-nav` gains a second `.screen-nav-group` below the
  designs group, headed by a plain (non-interactive) `.screen-nav-views-heading`
  label, then one `.screen-nav-view-item` button per view **that names no
  design** (see `data-view-for` below — a view tied to a design is listed
  under that design instead, and the views group is skipped entirely when
  every view is tied). The top-centre switcher (`#design-switcher`) lists
  designs and views in one row: design segments (`.design-switch-item`), a
  thin `.switcher-divider`, then view segments (`.view-switch-item`) — one
  click from anywhere, no detour through the ☰ panel. Both are
  auto-populated by `buildDesignUI()`, exactly like the design-only case.
- **Nav title.** The full question is written once, on the view itself (its
  `<h2>`). Every nav surface — the switcher / quick-nav segment, the ☰ row,
  the indicator and the dock label — shows only a `?` glyph plus the short
  title from `viewNavTitle()`: `data-nav-short` when authored, else
  `data-nav-label`, a leading "Frage ·" / "Question ·" dropped (the `?` says
  it) and cut to 28 characters on a word boundary with "…". The tooltip
  keeps the full `data-nav-label`. Author `data-nav-label` as that short
  form of the question ("Kapitän sieht Wellen?"), never the question
  sentence — the cut is a safety net, not the title.
- **`data-view-for="{designId}"` (optional, all view kinds).** A view that
  is *about one variant* names it: `buildDesignUI()` then nests the view's
  `.screen-nav-view-item` inside that design's `.screen-nav-group`, after
  its screens (`allViews.filter(v => v.dataset.viewFor === d.dataset.design)`);
  the views group lists only the views without a (valid) `data-view-for`
  and is not rendered when that list is empty. The top-centre switcher
  stays one flat row — carry the variant name in the `data-nav-label`
  ("Field mapping · Compact card"). `collectDesignDecisions()` adds
  `"design": "{designId}"` to every `decisions[]` and `mappings[]` entry
  from such a view (§ Decision schema); the key is absent otherwise. A
  `data-view-for` that names no `data-design` of the same iteration is a
  gate warning (rule M10, validation-gate.md § Mappings) and falls back to the views group —
  nothing breaks, the grouping is just lost. Absent → variant-independent,
  exactly as before.
- **Screen indicator.** While a view is active, `#screen-indicator` shows the
  view's `data-nav-label` instead of the screen counter — the "Page N/total"
  segment (`#indicator-screen-info`) hides, `#indicator-view` shows. Every
  mount is null-guarded, same discipline as every other indicator segment.
- **Feedback dock.** While a view is active, the dock shows **general +
  one view-level textarea** (`data-comment="view-{id}"`,
  `data-view-comment="{id}"`, label from the view's `data-nav-label`) and
  hides the per-design and per-screen rows; the reverse holds while a design
  is active. The view textareas are built **once per iteration** by
  `buildViewTextareas()`, in the same build-once-per-iteration + hidden-swap
  pattern `buildDesignTextareas()`/`buildScreenTextareas()` already use —
  never rebuilt on a design/view switch, for the same reason documented at
  the top of § Layout JS: a rebuild would drop unsent text and truncate the
  submit payload.
- **Click-through safety.** The `data-screen-link` click-through handler
  (§ Click-through Handler) is scoped to the visible design and returns
  immediately whenever a view is active (`body[data-view-active="true"]`) —
  a stray `data-screen-link` button reachable only through markup reuse must
  never fire screen navigation while the user is looking at a view.
- **Freezing.** A frozen `design` iteration stays fully browsable: view
  switching and the view nav keep working, exactly like the design switcher
  and screen nav today. See `iteration-rules.md` § Freezing Design
  Iterations for the exact exemption list and how a frozen view's submitted
  values (bi-state selections, notes) are restored.

### Decision and comparison views are abolished

There is **no** `data-view-kind="decision"` or `"comparison"` view to author
any more: the Verwerfen / Miteinbeziehen bi-state cards and the side-by-side
option grids/tables were the old analysis style, and the gate rejects them in
a live design round (`legacy-decision-view`). Every question a design round
asks — which tone, which density, which navigation model — is a **topic of the
round's one Full analysis** (§ View kind `analysis` below): briefing, topics,
one decision per stage, the right rail. A round has **at most one** analysis
view (`multiple-analysis-views`); several questions are several topics of it,
never several hidden analysis pages. Options that differ along shared criteria
become a Scorecard / Vergleichstabelle block inside a topic
(`analysis-palette.md`).

Legacy: a frozen round of an already-published page may still carry decision /
comparison views — the engine keeps rendering and restoring them (bi-state
values, notes, `collectDesignDecisions()`), and the gate leaves frozen rounds
alone. Do not copy that markup into a new round.

### View kind `mapping`

For the question *"which of these many items goes where"* — an
**assignment** of items to targets, not a choice between alternatives. A
`data-view-kind="mapping"` view is a fullscreen frame around one
`section[data-mapping]` whose content is a declarative JSON spec; the shared
engine (§ Information Mapping (engine)) renders the schematic view, the
matrix view, the tabs, the palette and every input from it. Claude authors
**nothing but the wrapper, the heading/intro and the spec** — never a cell.
The same block, with an inline note, lives in `free` rounds (§ Template:
free → Mapping block (optional)); a design concept uses this view instead.

```html
<section data-iteration="3" data-iteration-template="design" data-active>
  <section data-design="card_a" data-nav-label="Compact card" data-design-active="true">…</section>
  <section data-design="card_b" data-nav-label="Detail card" hidden>…</section>

  <section data-view="fields_a" data-view-kind="mapping" data-view-for="card_a"
           data-nav-label="Field mapping · Compact card" hidden>
    <div class="view-frame view-mapping">
      <h2>Which vehicle fields go where on Compact card?</h2>
      <p>Proposal pre-filled — correct it. Phone and desktop are separate.</p>
      <section data-mapping="veh_a" id="veh_a" data-nav-label="Field mapping · Compact card">
        <script type="application/json" data-mapping-spec>{ … }</script>
      </section>
    </div>
  </section>
</section>
```

The spec's fields (`items`, `elements` / `axes`, `context`, `proposal`,
`proposalOrder`, `slotNotes`, `adhocItems`, `submitted`) are tabled in
§ Information Mapping (engine) → Spec; two complete examples are in the
design spec `docs/superpowers/specs/2026-09-13-concept-information-mapping-design.md`
§ 3.

**Rules:**
- **No inline note textarea inside a view.** The dock's view-level
  textarea (`data-comment="view-{viewId}"`, built by `buildViewTextareas()`
  like for every view) IS the mapping note — `collectMappings()` reads it
  into the entry's `note` whenever the mapping section sits inside a
  `section[data-view]`. Two note fields for one question is the rejected
  alternative (gate rule M5, validation-gate.md § Mappings, flags an inline
  `map-{m}-note` in a view).
  Per-slot notes (`slotNotes: true`) are generated inline in both homes.
- `data-view-for="{designId}"` is optional (rules in § Views (optional));
  a mapping about one variant names it, and the payload entry then carries
  `design`.
- `.view-mapping` lifts the frame's width (`max-width: none; padding: 1rem
  1.5rem`) — the two tier columns and a 30-column matrix need it. The matrix
  is its own two-axis scroll box; the page never widens.
- **≥ 1 `data-design` stays mandatory** — a mapping view is a view like any
  other and never the only top-level content.
- Ids: `data-mapping`, item, element, part, axis, column and context ids
  match `^[a-z0-9_]+$` (no `-`, `.`, `@`, `:`, `>` — the state encodings
  split on them). Item / element / axis ids are unique within a mapping,
  part ids within their element; **mapping ids are unique page-wide** (they
  are DOM ids: the section's `id`, the TOC anchor). `data-mapping` and `id`
  carry the same value.
- A view is never cloned into device frames (`renderDeviceStage` clones
  active screens only), so the section id and the JSON block are safe here.
  `<script type="application/json">` is inert; gate P18 forbids it only
  inside `section[data-screen]`.
- Switcher segment, `.screen-nav-view-item`, screen indicator label, dock
  (general + view-level textarea), `_activeView` restore and view switching
  on frozen tabs all behave exactly as for every other view. The progress
  (`n unassigned · n constraint(s) open`) is the mapping's own summary line
  and the per-tab counts; the panel TOC's progress mirror is a free-round
  affordance (`#section-nav` is hidden in design mode).
- Filtering is per view: the palette's pills (All / Unassigned / Multiple /
  Changed + search) narrow the schematic; the toolbar's **row filter** (All /
  Unassigned / Changed with live counts, `button.map-row-filter`) narrows the
  matrix rows and their groups, in every tab at once. Both share one
  predicate and are in-memory only — nothing is persisted, a frozen section
  keeps them usable.
- Freezing: when the round is frozen Claude writes the payload's
  `mappings[]` entry back into the spec as `submitted` (§ Information
  Mapping (engine) → Freezing) — the frozen view then shows the user's
  submission read-only, never the proposal.

### View kind `analysis`

`<section data-view="…" data-view-kind="analysis" data-analysis="full" data-nav-label="…" hidden>`
holds a **Full** analysis (briefing, topics, right rail; never Lite in a
design round — gate `lite-in-design`). Markup, modes and payload are in
`templates-analysis.md` § Full inside a design round; the engine enhances the
view itself into the Full chat flow (the view stays the scroll box, no
`.view-frame`), and the view decisions are collected by the design branch
through `collectModeDecision()`. The top bar shows it as one plain "Analyse"
segment (no dropdown, no count) that opens it.

## Variant overview (≥2 designs)

A design round with **two or more** `section[data-design]` gets engine chrome
that a single-design round never shows (`body[data-overview="true"]`, set by
`buildDesignUI()`). A single-design round, a document round and every legacy
page render exactly as before. Nothing below is authored by hand except the
four attributes; the engine (templates-design-overview.md § Variant overview JS) builds the rest.

**Authoring attributes on every `section[data-design]` of a ≥2-design round:**

| Attribute | Content |
|---|---|
| `data-design-motto` | The design's slogan, 2–5 words ("Less is calm."). It heads the card (the overview's info box). |
| `data-design-traits` | Exactly **three** traits, separated by `\|`. Only genuine differences to the OTHER designs of the round — never something every design has ("responsive", "dark mode"). |
| `data-design-icon` | A built-in icon name (`leaf`, `rocket`, `gauge`, `grid`, `map`, `cube`, `chart`, `bolt`, `heart`, `compass`, `layers`, `sparkles`, `shield`, `book`, `user`, `home`, `sun`, `moon`, `flame`, `palette`, `game`, `list`) or one inline SVG, entity-escaped inside the attribute (`data-design-icon="&lt;svg viewBox=&quot;0 0 24 24&quot;&gt;&lt;path d=&quot;…&quot;/&gt;&lt;/svg&gt;"` — a raw `<`/`>` in an attribute breaks the build's and the gate's tag scanners); stroke paths in `currentColor`, everything outside svg/g/path/circle/ellipse/line/polyline/polygon/rect and their geometry/stroke attributes is dropped. A short emoji works too. Claude picks it thematically per concept — the icon is how the user tells the designs apart in the quick nav. |
| `data-design-color` | Optional. A hex colour for the design's slide ring, quick-nav highlight and icon background. Never the accent blue: the icons themselves are drawn in one uniform accent tint, and the background must stay distinguishable. Without it the engine assigns a palette colour by position. |
| `data-design-overlay` | **Deprecated, ignored.** The overview card is always bottom-left; do not author it (an unknown value still draws a gate warning). |
| `data-ov-demo` | Optional. A CSS selector INSIDE this design naming the element that differs from the other variants. The overview slide then shows a small, zoomed, looping demo of that element (the clone is fitted and centred on its box) instead of the full still. The engine toggles the class `ov-demo-play` on the element every few seconds (paused under reduced motion / hidden tab) — style `.ov-demo-play` (or rely on plain CSS animations / transitions) in the mock CSS to drive the motion. Use a class / attribute selector, not an `#id` (ids are namespaced in the clone). The element's screen is the one previewed. Absent → the still, filling the card (a full-app screen cover-scaled inside it). |
| `data-design-overlay-tone` | Optional. `warm` switches the overlay from the semi-transparent bluish tint to a warm graphite — set it when the preview itself is bluish and the default tint would sink into it. No auto-detection. |
| `data-design-improved` | Optional. A short phrase (max ~40 chars, e.g. "Wochenansicht per Tab") naming what got better since the last round. The overview card shows it as "Verbessert: …" under the top-3 points. Absent → nothing is shown. Pure meta lives here and in the card, never as text inside or under the design itself. |

**Authoring attribute on the iteration** (`section[data-iteration]` of a
≥2-design round): `data-design-set="alternatives"` when the designs are
alternatives for the same thing — the usual case under "one visual topic per
round" — or `data-design-set="topics"` when they show different topics
(start page, settings, …). Only `alternatives` offers the favourite (☆/★,
`F`, the quick nav's ★, dimming); unmarked or `topics` → no star anywhere and
`favorite` stays `null`.

The gate warns (never fails) when a ≥2-design round lacks motto, traits or
icon, when the traits are not exactly three, when the round has no
`data-design-set`, or when `data-design-overlay` names an unknown anchor
(`concept-gate.js` `findDesignAuthoringWarnings`; validation-gate.md
§ Variant overview).

**What the engine builds:**

- **Overview** — the round's first top-level item ("Übersicht", `Esc`): a
  **carousel** that fills the viewport and never scrolls. One design large
  in the centre (≈ 78 % of the width, up to the stage height minus room for
  its hover glow above and below, 16:10), its neighbours peeking in cut off at the left and
  right edges (smaller than before, dimmed, desaturated). There are no ‹ ›
  buttons: hovering a side card scales it ~8 % and lays a glowing arrow over
  it; a click on it, `←` / `→` turn the carousel — they never open anything.
  The entrance is staged: main card, then the info box, then the side cards
  (off under reduced motion). A NEW round always opens on this start page
  (first card; plain mode: the first page). The centre is a
  live preview of the design's first (or first changed) screen — a scaled,
  inert clone, a still image: click, `Enter` or `↓` opens the design, "Design öffnen ↗"
  shows on hover / focus only — its hotkey (`1`–`9`) hangs on THAT button, on
  a long hover or while `Alt` is held, never as a tooltip over the centre nav. On it sits the **overlay**: kicker
  `icon · N · name` (+ ☆/★ on an alternatives round; N = the variant's
  `1`–`9` hotkey, also shown before the name in the quick nav and the ☰ rows), the motto as heading,
  the three traits — always bottom-left, tinted per
  `data-design-overlay-tone`. The eye hides / shows the overlay with every
  other annotation (Space no longer does: Space is the notes dock). A variant new or changed this round carries ONE
  chip inside this info box — "Neugedacht" or "Verbessert", never two.
  **Why the previews can be wrong:** `fitPreviews()` measures the clone at
  scale 1 with `getBoundingClientRect()`, and that rect includes every
  ancestor transform — a side card sits at `scale(.74)`, so its content read
  26 % smaller and the preview was fitted that much too large, cropped to a
  corner that missed what the variants differ in (the first card, built while
  centred, looked right). The measured extents are divided by the wrap's
  ancestor scale (`rect.width / offsetWidth`); never fit from untransformed
  geometry read through a transformed parent. With
  `section[data-view]`s the questions are the **last slide** (open /
  answered list, click opens the view). No page chips, no notes row, no
  second navigation — the pages live in the quick nav. A fresh page lands on
  the overview; a reload returns to where the user was (`_overview` /
  `_overviewDesign` / `_overviewScreen`, § State Persistence).
- **Favourite** — only on a round marked `data-design-set="alternatives"`;
  optional, at most one, toggled until submit (☆ in the overlay or `F`; the
  quick nav shows ★ on it). The favoured slide gets a gold ring, the others dim.
  Payload: `favorite: <designId>|null` (§ Decision schema; always `null`
  without `alternatives`). Meaning for the next round: step5-process.md § 5a.
- **Top-left corner** (replaces `#screen-indicator`) — the annotation eye
  and, when the design declares several devices (`data-viewports`), the
  device switch beside it: one bare icon per device, the current one in the
  accent colour (`#viewport-modes`; the bottom-left pill is only the fallback
  without this corner). No breadcrumb, no "Übersicht" / variant / page label,
  no ★, no box around it. It sits bare and dimmed, full strength on hover or
  focus; its counter shows the CURRENT page's automatic notes that are
  neither answered nor opened (0 on the overview and on question views).
  The eye is also the **calm view**: off, it hides the notes AND the quick
  nav and both FABs (☰, 💬) — only the dimmed eye (and the device switch)
  stays, so the concept can be looked at undisturbed; hotkeys keep working.
  Back to the overview only through the ☰ menu's "Übersicht" entry (or
  `Esc`); which variant is on screen shows in the quick nav, the favourite
  as its ★ there.
- **Quick nav** (top centre, replaces `#design-switcher`) — one row. On a
  design page the active design fans its pages out inside its own segment
  (fan-out animation) and every other design shrinks to its icon (name in
  the tooltip); on the overview and on a question view every design keeps
  its name, and the variant centred in the carousel is highlighted (the
  variant only, its pages stay folded; a small ▾ hints that it has some).
  Too little room between the eye and the ☰ FAB → the pages fold into
  a "2 / 7 ▾" chip that opens downwards. `★` on the favourite. Detail pages are
  numbered with roman numerals (I, II, III …; the ☰ rows too) so the digits
  stay free for the variant hotkeys. Quick-nav controls act on `pointerdown`.
  The bar is rebuilt only when its shape changes (mode, fanned variant, fold
  level, favourite, questions); a page step, a dot or a question switch
  repaints the existing buttons in place (`data-active`, `aria-current`).
  A click on the page or the variant already on screen goes one level up:
  back to the overview, that variant centred. Tooltips never repeat a
  visible name: a named segment / page shows only its keycap (`1`–`9`, `Tab`
  on the next page) or nothing; an icon-only segment names itself. Every
  switch moves in its direction (~0.2 s, none under reduced motion):
  overview → variant zooms in, variant → overview zooms out, a step to the
  next / previous page, variant or question slides; without a change
  nothing animates. With `section[data-view]`s, a
  trailing amber "Fragen" segment (no `?` mark) counts the unanswered
  questions: one question → it opens directly, no dropdown; several → the
  segment carries their list as a dropdown (hover / focus, first tap on
  touch) like a design's pages, and a click opens the first open one, a
  click while inside the questions the next open one. A
  question counts as answered on any interaction or scroll in it (a note, a
  clicked bi-state, a scroll), not on a mere visit; it pulses on every
  arrival on the overview. The carousel gets a questions
  slide (a side tile shows its icon beside the chevron, the name on hover),
  and the panel's submit area a non-blocking "N Fragen noch
  offen — zur ersten springen" line. The quick nav's band is measured
  against the eye's real right edge and the ☰ FAB on every render, so the
  two never overlap; too little room folds the pages into the chip, then
  shrinks every design to its icon.
- **Every design round, one design included,** gets the eye corner and the quick
  nav; only the overview carousel and `Esc`-to-overview need ≥2 designs,
  the favourite additionally `data-design-set="alternatives"`. The page builds itself up on load: content, eye, quick nav
  (with a bounce), then the FABs (`body.dz-intro`, ~2 s, off under reduced
  motion).
- **Hotkeys** — `Esc` overview · `1`–`9` design N · `Shift`+`1`–`9` view N ·
  `Tab` next page of the current design (only while nothing is focused) ·
  `←` / `→` (or `A` / `D`) same level (carousel cards, pages) · `↑` / `↓` (or `W` / `S`) one level
  (variant → overview, overview → variant) · `Space` notes dock (every
  template; only when no field is focused; it never scrolls) ·
  `V` viewport · `F` favourite (alternatives round only) · `Alt`+`1`–`9` iteration tab · `?` shortcut sheet ·
  `Ctrl`+`Enter` submit · `N` notes dock. A digit or quick-nav switch keeps
  the page: design A page 2 → design B page 2 (B's first page when it has
  none); a view tied to a design maps to the target design's view at the
  same position. `?` shows the shortcut sheet together with every hotkey
  badge (`body.hk-keys`, `#hk-overlay`) plus an example own pin "Strg + Klick"
  — never a held Alt, which hands the focus to the browser menu.
  Situational **nudges** (`wireChromeHotkeys()`, templates-design-overview.md):
  a quiet tip tab on top of the status toast appears when the user does by
  mouse what a hotkey does faster; ✕ silences that tip for 30 days
  (localStorage). None of the hotkeys fires while focus is in a text
  field, the dock, a bubble or a user-pin editor. The hint is ONE app tooltip
  per element carrying label + keycap ("Cockpit [1]", `data-tip-key`,
  § App Tooltips), Info tier.
- **User pins** — hold `Ctrl` (hint bar bottom centre, crosshair) and click
  the current screen: a pin with a comment field only, `Enter` saves, `Esc`
  discards. Persisted like annotation answers (localStorage + bridge draft),
  shown read-only on a frozen round, payload `userPins[]`.
- **☰ panel** — each design row gets a small icon prefix; its pages stay
  indented below; a row's hotkey keycap appears on row hover.
- **Round changes** — from round 2 on, every page is compared with the same
  design + page id of the previous design round (markup signature, runtime
  attributes ignored). A card whose first page is unchanged previews its
  first CHANGED page instead and names it; the info box of the card carries
  the chip "Neugedacht" (new design) or "Verbessert" (changed pages);
  an unchanged design gets none. Every menu
  entry leading to a changed page (quick nav, ☰ rows) carries a green dot until that page was opened once (per viewer,
  localStorage). Keep ids stable across rounds — a renamed page id reads as
  new. Nothing to author.


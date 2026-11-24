# Live-Treue rounds

Design rounds at live fidelity: the dock switch, what changes in the round, the live source, authoring markup, what is never a live round. Read it when the last payload carries `fidelity: "live"`.

## Live-Treue rounds

A design round is a **Live-Treue round** when the payload that led to it
carries `fidelity: "live"`. That is the dock switch: sticky per concept and
Etappe, off by default (`templates-panel-fidelity.md`). Concepting does not
change. The round still varies, explores and proposes exactly what it would
otherwise. Only the fidelity changes:

- **Untouched = live, in original quality.** Every part of the view that the
  round does not change is reproduced as it is live today: the whole view
  around the changed element, not only that element. That covers navigation,
  headers, cards, counters, toggles, empty and filled states, real copy, real
  tokens, fonts and images. Redesigning a gallery's planet shows the whole
  live gallery with the new planet in it. This widens `step1-templates.md` § 1a · Design
  iteration authoring "A changed element is mocked in full" from the element
  to the view.
- **Changed or new = fully polished.** Whatever the designs change or create
  is drawn as the finished thing: real artwork such as an inline SVG
  illustration, a finished background or a rendered asset, final copy and
  final states. Never boxes that name what will go there. This holds also
  when the whole view is new and has no live counterpart. Then the elements
  that will live in that view are there too, even when the round is not
  about them.
- **All designs of the round,** so the comparison stays fair. A polished
  variant next to a sketched one wins by default.

**Shell of the view — a ladder, never a silent redraw (#1187).** The parts the
round does not touch (logo, page title, header controls, page background) are
reproduced in this order:

1. **Capture** the live or dev page, signed in where the route needs it (the
   project's test account or the Desktop pane session).
2. Failing that, **copy the project's real files verbatim** into `assets/NN/`
   (logo file, title string, header markup and styles, background tokens and
   images) and reference them (`{{slug}}/assets/NN/…`, `data-live-css`).
3. Only when neither is reachable, approximate, and **mark each approximated
   part**: `data-fidelity-approx-part="<name>"` on the element plus a visible
   `<span class="fidelity-approx-badge">angenähert</span>` inside it, and
   `data-fidelity-approx` on the round. List the part under `liveSource.shell`
   (`captured` / `copied` / `approximated`, per part).

The gate (`findFidelityIssues`) enforces the markers: `fidelity-shell-redrawn`
(a live round with neither `data-live-css` nor an `assets/` reference),
`fidelity-approx-unmarked` (`data-fidelity-approx` without marked parts or
without the visible badge) and `fidelity-note-claims-live` (a note saying 1:1
while the round is approximated). It cannot compare against the project's
source; the ladder's markers are what it checks.

**Live source — the session collects it before the brief (Step 5b iterate step 5):**

```
fidelity: live
liveSource:
  files:      <markup / component / style files of the view, with paths>
  commit:     <git rev-parse HEAD of the repo they come from>
  screenshot: <path, when the app runs locally: the view as it is now>
  assets:     <files copied to docs/concepts/{name}/assets/NN/>
  shell:      <logo / title / header / background: captured | copied | approximated>
  gaps:       <what is not reachable (remote data, a deployed-only app, licensed fonts)>
```

Another repo or a deployed-only app counts as reachable when the session can
read or screenshot it. Otherwise it goes under `gaps`, and the round says so.

**Authoring markup (on top of the design round's own):**

- `data-fidelity="live"` on the round section. The build copies it onto the
  tab, which then shows LIVE, and the page shows the Live-Treue chip while
  the round is on screen.
- `data-fidelity-note="…"`: one line on what is 1:1 from live and what is
  approximated ("Tokens, Fonts und Galerie-Markup 1:1 aus live · 2 Bilder
  angenähert"). It is required, and the gate blocks a live round without it.
  Add `data-fidelity-approx` when anything under `gaps` affects what is on
  screen. The chip then turns amber and reads "angenähert".
- **Live CSS by reference, never copied:** `<style data-live-css="assets/NN/app.css" data-scope="d1"></style>`
  inside the design. The build reads the file (relative to the source folder,
  never outside it), scopes every rule under `[data-design="d1"]` (`html`,
  `body` and `:root` become the design wrapper, so the app's custom
  properties still apply) and rewrites relative `url(…)` to the page. Copy
  the view's stylesheet(s) into `assets/NN/`, one subfolder per round, so a
  frozen round keeps the look it was sent with. Trim a framework bundle to
  the rules the view uses when it passes 250 KB.
- **Assets:** images and fonts are files in `assets/NN/`, referenced as
  `{{slug}}/assets/NN/…`. The bridge serves them next to the page. They are
  never base64 (each live round would grow every later build) and never
  another origin.
- Every other `<style>` rule of a live round starts with
  `[data-design="<id>"]` or a per-design prefix class. The gate blocks an
  unscoped one, because a live `button {}` restyles the page's own panel.
- No real personal or secret data from the live app: replace it with
  plausible sample data and say so in the note.

**Not a live round:** a `decision` or `free` round (the switch only says
"next design rounds"), the final report, a review round, a reality-check
round and every `implement` / `finalize` / `refine` path. "Live-Treue" and
the "Realitäts-Check" (`reality-check.md`, the drift check before implement)
are two different features. Their markers never mix (`data-fidelity` ≠
`data-reality-check`).

**Cost:** a live round reads the live source and draws every design in full,
so it is several times a sketch round. The switch is the user's call alone.
Claude may suggest it once per concept (Step 5b iterate step 5).


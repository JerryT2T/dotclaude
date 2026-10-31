# Concept templates, part 43 of 48: Template: analysis — Full + Lite contract, decision modes, collect

## Analysis presentation (Full + Lite) — engine fit

Analysis results and the decisions that follow from them are **not a fourth
template**. They are a content variant of the existing ones, so `decision`,
`free` and `design` stay byte-compatible and every payload branch, freeze,
bake and bridge path keeps working:

| Variant | Where it lives | Marker | Payload branch |
|---|---|---|---|
| **Full** | a whole round: `data-iteration-template="decision"` plus `data-analysis="full"` on the iteration section | `section[data-iteration][data-analysis="full"]` | `collectDecisionDecisions()` (every `[data-decision]`, mode-aware) |
| **Lite** | embedded: in a design round as a view (`data-view-kind="analysis"`), or anywhere in a `decision` / `free` round | `[data-analysis="lite"]` | the host branch (design: view decisions; free: appended) |

Rules of thumb (authoring guidance lives in `step1-templates.md`): a concept
whose content IS analysis results + decisions → Full. A few questions that
come up inside another concept (≤ 5) → Lite. More than 5 → Full.

**Wave status.** Wave 1 is the contract and the collect code; wave 2 (below,
§ Styling, § Engine UI) is the visual layer: the chat flow, the right rail, the
persistent composer, the decision-mode widgets and the `CONCEPT_VIZ` palette renderers.
The visual layer only enhances the authored markup — collect, bake, freeze and
the gate never depend on it.

## Markup contract

### Full

```html
<section data-iteration="1" data-iteration-template="decision" data-analysis="full" data-active>

  <!-- Briefing: eyebrow (the analysis title) -> huge potential number -> one claim sentence -> top-3 topic cards -> "N Fragen · Los geht's · ≈ X min". Required: what, why, potential. -->
  <section id="briefing" data-analysis-briefing data-nav-label="Briefing">
    <p data-briefing-what>1-2 sentences: what was analysed and found.</p>
    <p data-briefing-why>One sentence: why it matters now.</p>
    <div data-briefing-potential data-viz="kpi"
         data-viz-spec='{"value":"≈ 51 M","unit":"Tokens","label":"saved per month"}'>≈ 51 M Tokens</div>
    <!-- One chip per topic; data-share (0-100) is the topic's part of the potential
         and sets the thickness of its connector line. -->
    <a data-briefing-topic="t-cache" data-share="60">Cache</a>
    <a data-briefing-topic="t-hooks" data-share="40">Hooks</a>
    <p data-briefing-duration>≈ 6 min</p>
    <!-- L1: the overall analysis, reopenable after the briefing. -->
    <div data-alevel="1" data-title="Briefing">
      <div data-slot="short"><div data-viz="kpi" data-viz-spec='{"value":"≈ 51 M","unit":"Tokens"}'></div></div>
      <div data-slot="long">
        <div data-viz="bars" data-viz-spec='{"items":[{"label":"Cache","value":31},{"label":"Hooks","value":20}],"unit":"M"}'></div>
        <p>2-4 sentences.</p>
      </div>
    </div>
  </section>

  <!-- A topic (Themenfeld): 1–7 per Full, 3–7 questions each, title ≤ 5 words. -->
  <section id="t-cache" data-topic data-nav-label="Cache">
    <div data-alevel="2" data-title="Cache">
      <div data-slot="short">…</div>   <!-- L2 short = always the group's result -->
      <div data-slot="long">…</div>
    </div>

    <!-- One decision per stage. Section id = data-decision = data-nav-label's key. -->
    <section id="d-ttl" data-nav-label="Cache lifetime" data-decision="d-ttl" data-decision-mode="single"
             data-label="Cache lifetime" data-rec="short"
             data-rec-why="Measured: 80 % of hits happen within 10 min."
             data-applies-to="all hooks" data-finding="f-ttl">
      <p data-applies>Gilt für: alle Hooks</p>
      <p data-situation>Today 80 % of cache hits fall within 10 min, yet every entry lives 24 h.</p>
      <h3 data-question>How long may a cached answer live?</h3>
      <p data-context>One sentence of background under the question.</p>
      <p data-stakes>Token use of every hook and how fresh their answers are.</p>
      <div data-options>
        <label data-opt="short" data-recommended>
          <input type="radio" name="dm-d-ttl" value="short" checked>
          <span data-opt-label>Expire after 10 minutes</span>
          <span data-opt-consequence>Saves ≈ 31 M tokens, answers stay fresh.</span>
        </label>
        <label data-opt="long">
          <input type="radio" name="dm-d-ttl" value="long">
          <span data-opt-label>Keep for a day</span>
          <span data-opt-consequence>Saves more, but stale answers are possible.</span>
        </label>
        <label data-opt="none">…</label>
      </div>
      <textarea data-comment="d-ttl-note" placeholder="Note (optional)"></textarea>
      <input type="hidden" name="dm-d-ttl-none" value="">      <!-- "1" = "Keine passt", the note is the answer (the engine adds it when missing) -->
      <input type="hidden" name="dm-d-ttl-hes" value="">       <!-- hesitation record {ms,revisits,median[,sharpen]} written by the engine -->
      <input type="hidden" name="dm-d-ttl-touched" value="">   <!-- "1" once the stage was open ≥ 3 s or edited -->
      <input type="hidden" name="dm-d-ttl-issue" value="">     <!-- "1" = "Als Issue anlegen" -->
      <input type="hidden" name="dm-d-ttl-epic" value="">      <!-- optional epic name for that issue -->
      <!-- L3: the finding this decision rests on (the first chat message: tab "Befund"; a [data-example] makes the second tab "Beispiel"). -->
      <div data-alevel="3" data-title="Cache lifetime">
        <div data-slot="short">…</div>
        <div data-slot="long">
          <div data-viz="bar" data-viz-spec='{"value":80,"max":100,"label":"hits within 10 min","unit":"%"}'></div>
          <p>2-4 sentences.</p>
        </div>
        <!-- Beispiel: a concrete case from the real application (screen excerpt / code / transcript); a diagram only when there is nothing visual. -->
        <div data-example><pre>…</pre></div>
      </div>
    </section>
  </section>
</section>
```

Attribute reference:

| Attribute | On | Meaning |
|---|---|---|
| `data-analysis="full\|lite"` | iteration section (Full) / any container or view (Lite) | variant marker; the gate and the engine key on it |
| `data-analysis-briefing` | one `section` per Full | the briefing screen; REQUIRED children `data-briefing-what`, `data-briefing-why`, `data-briefing-potential` (non-empty) |
| `data-briefing-topic="<topic id>"` + `data-share` | `a` in the briefing | connector target of the "Striche und Verbindungen"; share of the potential in % |
| `data-briefing-duration` | briefing | the time the bar names beside "Los geht's" |
| `data-topic` | `section[id][data-nav-label]` | a Themenfeld; 1–7 per Full, 3–7 questions each, title ≤ 5 words (gate warns outside) |
| `data-alevel="1\|2\|3"` + `data-title` | block | analysis level: 1 briefing/overall, 2 topic, 3 this decision. `data-title` equals the rail / topic-page name exactly. Lite has L1 + L3 only. The stage shows ONE level as its first message (brief → L1, topic → L2, decision → L3, falling back to L2, then L1) |
| `data-slot="short\|long"` | child of a level | short = 1 sentence + KPI or mini graphic (formatted text only when there is no number); long = one palette display + 2-4 sentences, never scrolls |
| `data-example` | inside a level (next to / inside the long slot) | the "Beispiel" tab of the finding message: a concrete case from the real application |
| `data-opt-preview` | inside an option | optional "So sähe das aus" line of that option |
| `data-viz="<type>"` + `data-viz-spec='<json>'` | any element in a slot | palette display (below) |
| `data-decision="<id>"` + `data-decision-mode` | the decision element | id (`[a-z0-9_-]+`) and mode (below). It is also `section[id][data-nav-label]` in Full so the TOC lists it |
| `data-label` | decision | the rail tooltip / closing name |
| `data-rec` | decision | recommended option, ALWAYS preselected (value shapes below) |
| `data-rec-why` | decision | the reason, shown in the ★ tooltip |
| `data-applies-to` | decision | "Gilt für" text; the visible quiet line carries `data-applies` |
| `data-finding="<id>"` | decision | the finding it rests on (the L3 block inside) |
| `data-finding-quant="true\|false"` | decision | overrides the gate's guess whether the finding is quantitative |
| `data-situation` | inside a decision | Ausgangslage: 1–2 sentences above the question, what the analysis found for it (gate A9 warns when missing) |
| `data-stakes` | inside a decision | optional "Davon hängt ab" line below the context |
| `data-question`, `data-context`, `data-options`, `data-opt`, `data-opt-label`, `data-opt-consequence`, `data-recommended` | inside a decision | question (a real question), one background sentence, answer rows (outcome verb + consequence line), the ★ option |

### Lite

```html
<!-- Inside a design round: a view. In a decision / free round: the same
     section directly in the body. -->
<section data-view="q-sync" data-view-kind="analysis" data-analysis="lite" data-nav-label="Quick questions">
  <div data-alevel="1" data-title="Quick questions">…</div>          <!-- optional overall -->
  <section id="q1" data-nav-label="Sync" data-decision="q1" data-decision-mode="yesnoalt"
           data-label="Sync" data-rec="yes" data-rec-why="…" data-applies-to="…">…</section>
</section>
```

Lite is the same chat flow without topic pages and without an empty start
stage: it opens on its first question, L1 + L3, progress dots, ≤ 5 decisions. In a design round the view is a normal
`section[data-view]` (`templates-design-views.md`); its decisions are
collected by the design branch's view-decision loop, which dispatches
mode-aware decisions to `collectModeDecision()` below.

## Decision modes

Twelve modes (seven classic, five Phase-2 forms in § Phase 2 answer forms), one typed value each. A decision WITHOUT `data-decision-mode`
is the legacy include/discard bi-state (`§ Bi-State Variant Evaluation`) and
keeps its `evaluation` payload untouched.

| Mode | When Claude uses it | Control convention (inside the decision) | `data-rec` | `value` |
|---|---|---|---|---|
| `single` | one answer out of 2-5 content alternatives | `input[type=radio][name="dm-{id}"][value="{opt}"]` | option id | option id (string) |
| `multi` | several of a list apply | `input[type=checkbox][name="dm-{id}.{opt}"]` per option | space-separated option ids | option ids in document order (string[]) |
| `yesnoalt` | a proposal that can be accepted, refused, or answered differently | radios `dm-{id}` with values `yes` `no` `alt`, plus `input[type=text][name="dm-{id}-alt"]` | `yes` \| `no` \| `alt` | `{ answer, alt }` — `alt` only for `answer: "alt"` |
| `slider` | a quantity / threshold on a scale | `input[type=range][name="dm-{id}"][min][max][step][value]`; `data-unit` on the decision | number | number (`null` when empty) |
| `order` | a priority or sequence | `input[type=hidden][name="dm-{id}"]` = comma-joined ids; the sortable list is rendered from it | comma-joined ids | ids in the chosen order (string[]) |
| `verify` | Claude states something and the user confirms it | radios `dm-{id}` values `ok` `partial` `wrong`, plus `input[name="dm-{id}-fix"]` | verdict | verdict string; the correction in entry `fix` |
| \`picture\` / \`compare\` / \`chain\` / \`place\` | seen, compared, routed, located — see § Phase 2 answer forms | radios \`dm-{id}\` like \`single\`, with media / cells / steps / slots inside the options | option id | option id (string) |
| \`points\` | a budget split over 2-8 items | hidden \`dm-{id}.{item}\` per item (0-8 points) | \`item:points\` pairs | \`{ item: points }\` |
| \`wording\` | a name / phrasing, with suggestions | radios `dm-{id}` with the suggestion ids (+ `custom`), each `data-text="…"`; `input[type=text][name="dm-{id}-text"]` for `custom` | suggestion id | the final wording (string); entry `choice` = suggestion id or `custom` |

Label rules for options: outcome verbs, no polarity-only labels ("An" /
"Aus"), no double negation, one consequence line per option
(`data-opt-consequence`). Timing is never a decision (default: implement
now); the discreet "Als Issue anlegen (ggf. mit Epic)" link sets
`dm-{id}-issue` (and `dm-{id}-epic`).

Common to every decision:

- ONE note: `<textarea data-comment="{id}-note">` is the storage target of the persistent composer at the bottom of the stage (the engine hides the textarea; briefing, topic page and closing get a hidden note of their own). A note sent WITH a tag (`[tag] text`, max one) stays on the stage, one WITHOUT advances (not on briefing / closing).
- "Keine passt? Schreib deine Antwort unten ins Notizfeld." (every mode but `slider` / `order` / `points`): a text link under the answer block; sets `dm-{id}-none` = `"1"`, clears the pick and focuses the composer. Payload `none: true`, `value` empty, `deviates: true` — the note carries the answer.
- `dm-{id}-touched` (hidden): `""` until the stage was open ≥ 3 s or the user changed something, then `"1"`. A decision whose value is `""` stays **untouched**: the payload says so and the review lists it last.
- The recommendation is the preselection: the markup ships the `data-rec` option checked / the slider at the value / the order as recommended. A user who only presses "Weiter" after ≥ 3 s has decided "keep the recommendation".

## Payload

`collectDecisionDecisions()` (and the design / free branches for embedded
Lite) emit, per mode-aware decision (the legacy bi-state keeps
`{ id, label, evaluation, note }`):

```json
{ "id": "d-ttl", "label": "Cache lifetime", "mode": "single", "value": "short",
  "rec": "short", "deviates": false, "untouched": false, "note": "",
  "appliesTo": "all hooks", "finding": "f-ttl", "issue": false, "epic": "", "none": false,
  "hesitation": { "ms": 4200, "noteWords": 0, "revisits": 0, "flagged": false } }
```

`value` per mode: `single` `"opt"` · `multi` `["a","c"]` · `yesnoalt`
`{"answer":"alt","alt":"text"}` · `slider` `42` · `order` `["b","a","c"]` ·
`verify` `"partial"` (+ `"fix":"…"`) · `wording` `"Final text"` (+
`"choice":"s2"` or `"custom"`). `deviates` is `value !== rec` after
normalisation; `untouched` is `touched !== "1"`. In a design round the entry
also carries `view` (and `design` for a view tied to a variant). Untouched
decisions are still reported with their preselected value — Claude treats them
as "not looked at", not as "agreed".

**Hesitation.** `hesitation.ms` is the dwell on the decision, counted only while
the stage is visible AND the window focused (timestamps, back-and-forth
summed); `noteWords` the words of the note (a leading `[tag] ` excluded);
`revisits` the returns to the stage plus every change of the answer after the
first. `flagged` is true when at least TWO of: dwell > 2× the median of this
analysis and ≥ 20 s · note > 12 words · ≥ 2 revisits/changes
(`hesitationFlag()` below). The closing preset its "Nachschärfen" toggles from
it; the user's toggle (`sharpen`) overrides the rule. Consumers: `step5-process.md`
§ Hesitation signal.

**Bake / freeze.** Every value above lives in a named form control, so the
existing machinery carries it: `collectAllFormFields` ships it in `allFields`,
`concept-build.js bake` writes it back (radio `checked`, checkbox `checked`,
text / hidden / range `value`, textarea body) and `freeze` disables the
controls. When a payload has `decisions[]` with modes but no matching
`allFields` keys, `bake` derives the control values from the typed
`decisions[]` (`modeFields()` in `scripts/concept-build.js`); `allFields` wins
where both name a key. A frozen round therefore renders its answers exactly as
submitted.

## Collect (engine code)

`collectModeDecision(el)` is the single reader of the control convention above;
the three payload branches call it (`typeof collectModeDecision === 'function'`
guarded, so an older page is unaffected).

```javascript
function collectModeDecision(el) {
  const id = el.dataset.decision;
  const mode = el.dataset.decisionMode;
  const n = 'dm-' + id;
  const ctl = [...el.querySelectorAll('input, textarea, select')];
  const named = name => ctl.filter(c => (c.name || '') === name);
  const text = name => { const c = named(name)[0]; return c ? String(c.value || '').trim() : ''; };
  const picked = name => named(name).find(c => c.type === 'radio' && c.checked) || null;
  const noteId = id + '-note';
  const noteEl = el.querySelector('[data-comment="' + noteId + '"]')
    || (el.parentElement && el.parentElement.querySelector('[data-comment="' + noteId + '"]'));
  const rec = (el.dataset.rec || '').trim();
  const entry = { id, label: el.dataset.label || id, mode };
  let deviates = false;
  if (mode === 'multi') {
    const ids = ctl.filter(c => c.type === 'checkbox' && (c.name || '').indexOf(n + '.') === 0 && c.checked)
      .map(c => c.name.slice(n.length + 1));
    entry.value = ids;
    deviates = ids.slice().sort().join(' ') !== rec.split(/\s+/).filter(Boolean).sort().join(' ');
  } else if (mode === 'yesnoalt') {
    const p = picked(n);
    const answer = p ? p.value : '';
    entry.value = { answer, alt: answer === 'alt' ? text(n + '-alt') : '' };
    deviates = answer !== rec;
  } else if (mode === 'slider') {
    const raw = text(n);
    const num = raw === '' ? NaN : Number(raw);
    entry.value = Number.isFinite(num) ? num : null;
    deviates = entry.value !== Number(rec);
  } else if (mode === 'order') {
    const ids = text(n).split(',').map(s => s.trim()).filter(Boolean);
    entry.value = ids;
    deviates = ids.join(',') !== rec.replace(/\s+/g, '');
  } else if (mode === 'points') {
    const pts = {};
    ctl.filter(c => (c.name || '').indexOf(n + '.') === 0).forEach(c => { pts[c.name.slice(n.length + 1)] = Math.max(0, Math.round(Number(c.value) || 0)); });
    entry.value = pts;
    const want = {};
    rec.split(/[\s,]+/).filter(Boolean).forEach(t => { const k = t.split(':'); want[k[0]] = Math.max(0, Math.round(Number(k[1]) || 0)); });
    deviates = Object.keys(pts).concat(Object.keys(want)).some(k => (pts[k] || 0) !== (want[k] || 0));
  } else if (mode === 'verify') {
    const p = picked(n);
    entry.value = p ? p.value : '';
    entry.fix = text(n + '-fix');
    deviates = entry.value !== rec;
  } else if (mode === 'wording') {
    const p = picked(n);
    const choice = p ? p.value : '';
    entry.choice = choice;
    entry.value = choice === 'custom' ? text(n + '-text') : (p ? (p.dataset.text || '').trim() : '');
    deviates = choice !== rec;
  } else {
    const p = picked(n);
    entry.value = p ? p.value : '';
    deviates = entry.value !== rec;
  }
  entry.rec = rec;
  entry.deviates = deviates;
  entry.none = text(n + '-none') === '1';
  if (entry.none) { entry.value = mode === 'multi' ? [] : mode === 'points' ? {} : ''; entry.deviates = true; }
  entry.untouched = text(n + '-touched') !== '1';
  entry.note = ((noteEl && noteEl.value) || '').trim();
  entry.appliesTo = el.dataset.appliesTo || '';
  entry.finding = el.dataset.finding || '';
  entry.issue = text(n + '-issue') === '1';
  entry.epic = text(n + '-epic');
  // Hesitation: the page writes { ms, revisits, median[, sharpen] } into dm-{id}-hes.
  let hs = {};
  try { hs = JSON.parse(text(n + '-hes') || '{}') || {}; } catch (e) { hs = {}; }
  const hz = { ms: Math.max(0, Math.round(Number(hs.ms) || 0)), noteWords: typeof noteWordCount === 'function' ? noteWordCount(entry.note) : String(entry.note).split(/\s+/).filter(Boolean).length, revisits: Math.max(0, Math.round(Number(hs.revisits) || 0)), flagged: false };
  hz.flagged = typeof hs.sharpen === 'boolean' ? hs.sharpen : (typeof hesitationFlag === 'function' && hesitationFlag(hz, Number(hs.median) || 0));
  entry.hesitation = hz;
  return entry;
}

/** Words of a note, a leading "[tag] " excluded. */
function noteWordCount(note) {
  return String(note || '').replace(/^\s*\[[^\]\n]{1,80}\]\s?/, '').split(/\s+/).filter(Boolean).length;
}

/** Hesitation flag: at least TWO of — dwell over 2x the analysis median and >= 20 s, a note over 12 words, >= 2 revisits / changes. */
function hesitationFlag(hz, medianMs) {
  const slow = hz.ms >= 20000 && hz.ms > 2 * (medianMs || 0);
  const wordy = hz.noteWords > 12;
  const back = hz.revisits >= 2;
  return [slow, wordy, back].filter(Boolean).length >= 2;
}

function collectModeDecisions(scope) {
  if (window.conceptAnalysis && typeof window.conceptAnalysis.flush === 'function') window.conceptAnalysis.flush();
  return [...(scope || document).querySelectorAll('[data-decision][data-decision-mode]')].map(collectModeDecision);
}
```

## Display palette (`data-viz`)

Every graphic is `data-viz="<type>"` plus `data-viz-spec='<json>'` and is
rendered by a registry function — `window.CONCEPT_VIZ[type](el, spec, ctx)`
with `ctx = { size: "short" | "long" }` — never hand-drawn per concept. An
unknown type or an unparsable spec renders `spec.text` as formatted text (the
one pure text type, `data-viz="text"`), so a page never shows an empty slot.
The gate treats `text` as "no visual".

Core types every engine build must provide (the full ≥ 30 type catalogue with
"Nimm sie, wenn …" / "Nicht, wenn …" lines is authored in the palette guide):

| Type | Spec |
|---|---|
| `text` | `{ "text": "…" }` |
| `kpi` | `{ "value": "≈ 51 M", "unit": "Tokens", "label": "…", "delta": "-12 %" }` |
| `bar` | `{ "value": 80, "max": 100, "unit": "%", "label": "…" }` |
| `bars` | `{ "items": [ { "label": "…", "value": 31 } ], "unit": "M" }` |
| `spark` | `{ "points": [3, 5, 4, 8], "label": "…" }` |
| `donut` | `{ "parts": [ { "label": "…", "value": 60 } ] }` |
| `compare` | `{ "before": { "label": "…", "value": 10 }, "after": { "label": "…", "value": 4 }, "unit": "s" }` |
| `flow` | `{ "steps": [ { "label": "…", "value": "…" } ] }` |

## Phase 2 answer forms

Five more modes. All sit in the same answer block (raised surface, rows or
cards, ★ Empfohlen on the recommendation, recommendation preselected, "Keine
passt?" link, hesitation tracking) and use the control convention of the
table above; four of them are plain radio decisions, so collect, bake, freeze
and the gate's preselection check treat them like `single`.

```html
<!-- picture: 2-4 images; a sketch (inline SVG) or a real excerpt (img / pre). Never variant prototyping. -->
<div data-options>
  <label data-opt="flat"><input type="radio" name="dm-d-x" value="flat" checked>
    <span data-opt-media><svg viewBox="0 0 160 90">…</svg></span>
    <span data-opt-label>Flat list</span><span data-opt-consequence>One line per hook.</span></label>
  <label data-opt="real"><input type="radio" name="dm-d-x" value="real">
    <span data-opt-media><pre>real excerpt of the app</pre></span>…</label>
</div>

<!-- compare: max 3 options x 3 criteria; the option is the column, a cell is one criterion -->
<label data-opt="a"><input type="radio" name="dm-d-x" value="a">
  <span data-opt-label>Cache</span>
  <span data-opt-cell data-crit="Tokens">-31 M</span>
  <span data-opt-cell data-crit="Freshness">10 min</span></label>

<!-- chain: every option is one route; its steps render as a chain -->
<label data-opt="r1"><input type="radio" name="dm-d-x" value="r1">
  <span data-opt-label>Via the bridge</span>
  <ol data-opt-steps><li>Hook</li><li data-step-new>Bridge</li><li>Tool</li></ol></label>

<!-- place: a sketch with slots AND the list; both select the same value -->
<div data-place-sketch><svg viewBox="0 0 200 120">
  <rect data-slot-for="top" x="10" y="8" width="180" height="26"/>
  <rect data-slot-for="side" x="10" y="42" width="48" height="70"/></svg></div>
<div data-options> …radios with the same ids (top, side)… </div>

<!-- points: one hidden input per item, its preset = the recommendation -->
<div data-options>
  <div data-opt="speed"><span data-opt-label>Speed</span><span data-opt-consequence>…</span>
    <input type="hidden" name="dm-d-x.speed" value="5"></div> …
</div>
```

| Mode | `data-rec` | `value` | Engine |
|---|---|---|---|
| `picture` | option id | option id | cards in a grid; media above the label |
| `compare` | option id | option id | the options become columns; `data-crit` names the row. Gate warns above 3 options or 3 cells |
| `chain` | route id | route id | `[data-opt-steps]` renders as arrow-linked steps; `data-step-new` marks a new step |
| `place` | slot id | slot id | `[data-slot-for="<opt id>"]` on the sketch selects the radio; the list row and the slot highlight each other |
| `points` | `item:points` pairs, space separated (`speed:5 cost:3 risk:2 reach:3`) | `{ "speed": 5, "cost": 3, … }` (0 for unspent) | buttons 1 · 2 · 3 · 5 · 8 per item (click again = 0); budget `pointsBudget(n) = 3n + 1` (2 → 7, 3 → 10, **4 → 13**, 5 → 16); a live "Übrig: x von y" line; a step that would exceed the budget is disabled |

`points` has no "Keine passt" link (the value is always an answer) and its
inputs are named `dm-{id}.{item}`; the recommendation preset must be on
Fibonacci steps and within the budget (gate error `decision-preselect`).
Gate warnings: `picture-count` (not 2–4), `picture-media` (option without
`[data-opt-media]`), `compare-size` (> 3 × 3), `chain-steps` (route without
`[data-opt-steps]`), `place-sketch` / `place-slot` (no sketch, or a slot that
names no option), `points-count` (not 2–8 items).

**Slider live consequences.** `data-stops='[{"at":4,"text":"…"},{"at":8,"text":"…"}]'`
on a slider decision: the line under the scale shows the text of the last stop
at or below the value (the first stop below the first). The ★ marker stays.

**"Davon hängt ab".** The one-line `data-stakes` of the fixed-height question
message carries the full text as its tooltip.

**Closing → next analysis.** A Full closing offers "Continue with: …" only when
another analysis follows on the same page and is visible (document order); the
link opens that analysis at its first stage. No such analysis, no link. (The
design round's question views are no entries of the analysis; they are not
linked.)

**Engine safety nets.** Missing `dm-{id}-none` / `-hes` hidden inputs and a
missing `{id}-note` textarea are added by the engine; `concept-build.js bake`
injects `-none` / `-hes` into a fragment that lacks them, so `none: true` and
the hesitation survive the freeze. Author them anyway (gate warning
`decision-note`); a Lite round needs an `id` (gate warning `lite-id`).

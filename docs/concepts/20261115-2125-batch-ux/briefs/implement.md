# Implement brief — 20261115-2125-batch-ux (round 1, action implement)

Decisions file: `docs/concepts/20261115-2125-batch-ux-decisions.json`
Round fragment (binding spec for the visuals): `docs/concepts/20261115-2125-batch-ux/rounds/01.html`
Source notes (verbatim, archived): `.claude/batch-2026-11-15T20-21-48-396Z.md`
Attachment of note #3: `.claude/batch-assets/2026-11-15T14-34-21-138Z-1.png` (the red "Ein Hook hat deine Eingabe blockiert" panel; open it with Read before touching B3)

## The user's notes (verbatim)

- #1 „Mir ist aufgefallen, dass beim DevOps-Konzept in der Analyse häufig gefragt wird nach Themen, die eigentlich das UI betreffen. Vor allem das UI, was man gerade konzipiert in seinen Varianten. Das ist natürlich doof, weil klar, in der Analyse habe ich natürlich nicht das UI vor mir. Das heißt, diese UI-Fragen sollten bitte nicht in der Analyse vorkommen, sondern entweder durch die Varianten oder innerhalb der Varianten mit Autonotizen abgedeckt sein.“
- #2 „… wenn man das Diktieren anmacht, dann hat es ja nur so einen roten Rahmen. Das versteht man, glaube ich, nicht. Also da muss wirklich das Icon dann auch wechseln. Und es ja einfach ein bisschen hübscher machen, diesen Diktieren-Button, der in den ganzen Inputfeldern vorkommt. Funktionieren tut er super, aber einfach schön hübsch, wenn er an ist versus wenn er nicht an ist. Gerne auch nochmal bei dem Icon selber ein Vorbild nehmen an dem Claude Code Desktop Diktieren-Icon und an der Aktivstellung dieses Icons.“
- #3 „können wir in devops batch eigentlich hook fehlernachrichten abschaffen durhc die mods funktionalität von claude code, zumindest bei der deksktop version, bei cloud version natürlihc dann weiterhin inline“

## Round 1 answers (verbatim)

- Favourite design: **d1 „Akzent-Pille“**
- Auto-note d1-s1-a3 „Soll auch der Feldrand den Akzent annehmen, solange diktiert wird?“ → „ja gern!“
- d-ui-route = `split` (Detail als Auto-Notiz, Richtung als Variante) — recommendation
- d-ui-gate = `fail` (Build blockieren) — **deviates** from recommendation `warnfix`
- d-ui-detect = `screen` + `words` — recommendation
- d-batch-confirm = `toastband` (Toast plus Zähler im Band) — recommendation
- d-batch-writer = `process` (bestehende Notiz-Logik als Prozess aufrufen) — recommendation; note: „ber notizen daürfen inkl. anhänge nicht verlorgen gehen, wenn super robust gegen allemöglichen szenartien machen !“
- d-batch-attach = `yes` (Mod legt Anhänge mit ab) — recommendation, stage left untouched

## Checklist (one line per accepted item)

### B1 — Analysis UI questions (note #1) · owner: core agent
- [ ] B1.1 Author rule in `plugins/devops/skills/auto-concept/deep-knowledge/decision-modes.md` § Rules (and a pointer in `step1-templates.md` where the analysis view of a design round is described): an analysis view never asks about the UI of the variants shown in that round. A detail question → an auto-note (annotation) on the element in the variant; a direction question → its own variant (design). Before/after example.
- [ ] B1.2 Deterministic gate check in `plugins/devops/hooks/lib/concept-gate.js` (where A1–A12 live), new code A13 `analysis-ui-question`, severity **fail** (blocks the build): scope = live `design` rounds only, decisions inside `section[data-view-kind="analysis"]`. Signals (both, per d-ui-detect): (a) the question / situation / option labels name a `data-nav-label` of a `data-design` or `data-screen` of the same round, or "Variante N"; (b) UI words (Farbe, Icon, Button, Layout, Position, Abstand, Schrift, Animation, Rahmen, … DE + EN equivalents). Escape hatch for false positives: `data-ui-ok="<why>"` on the decision (reason required, like `data-no-example`). Error text names the decision id, the matched signal and the fix (auto-note or variant).
- [ ] B1.3 Document A13 in `validation-gate.md` § Analysis & decision modes table and in `templates-analysis.md` attribute reference (`data-ui-ok`).
- [ ] B1.4 Tests: new vitest file next to `analysis-modes.test.js` covering hit by design name, hit by UI word, no hit outside design rounds, no hit in frozen rounds, `data-ui-ok` bypass, and no hit for a non-UI question. Existing concept fixtures (`docs/concepts/*`, evals fixtures) must still build/gate as before or be listed if they now fail.

### B2 — Dictation button (note #2) · owner: frontend agent
- [ ] B2.1 `plugins/devops/skills/auto-concept/deep-knowledge/templates-voice-js.md`: `micButton()` renders an inline SVG line-microphone instead of the 🎤 emoji (same SVG as the mock: `rect x=9 y=3 w=6 h=11 rx=3`, `path M5 11a7 7 0 0 0 14 0`, `path M12 18v3`, stroke currentColor, width 2, round caps). The static attach-bar markup in `templates-attachments.md` (~line 134) gets the same SVG.
- [ ] B2.2 Active state (`.voice-btn.is-listening`) per mock d1: filled accent pill (`background` + `border-color: var(--accent-color)`, white content, `border-radius` pill), the mic icon is replaced by a 4-bar animated waveform (`d1-bar` keyframes: height 4px ↔ 14px, 1s ease-in-out infinite, delays 0/.15/.3/.45s, bars 3px wide, 2px gap) plus an 8×8 stop square (radius 2px, opacity .85). No red. Click or Enter still ends dictation (behaviour unchanged).
- [ ] B2.3 Answer to d1-s1-a3 („ja gern!“): while dictating, the field itself takes the accent border (mock `.d1-field-on`: `border-color: color-mix(in srgb, var(--accent-color) 55%, var(--border-color))`). The field to mark is the one the mic dictates into (attach-bar field, solo field, analysis composer, dock field).
- [ ] B2.4 Variants keep working: dock (`.feedback-dock .attach-slot .voice-btn`, opacity .7 → active state fully opaque), analysis composer (`.voice-btn-an`), `voice-btn-solo`, `aria-disabled` state, `data-tip` texts. Reduced motion: waveform static. Light + dark theme from tokens only.
- [ ] B2.5 Tests: `voice-engine.test.js` updated/extended (icon swap on start/stop, field marker class added/removed, no emoji left). Screenshot check of a built concept page: off / on, light / dark.

### B3 — Batch without the red panel (note #3) · owner: core agent
- [ ] B3.0 Spike first (Desktop app, alpha): how the app shows a `prompt.submit` `{ drop: reason }`. Record the result in `docs/dev/mods.md`. If the drop reason itself renders as a red/blocked panel, use the shortest neutral reason and rely on toast + band (d-batch-confirm).
- [ ] B3.1 `plugins/devops/hooks/mods/index.tsx`: `on('prompt.submit')` — when batch mode is armed for this session and the prompt is collectable (same rules as `prompt.batch.collect.js` `classify`: never machine prompts / `isMeta`, never slash commands, never the execute marker `go`, never off/status/go routes), file the note and answer `{ drop: … }`. Otherwise `next(e)` unchanged.
- [ ] B3.2 Writer = existing note logic via `$.process` (d-batch-writer = process): call a small node entry (e.g. `scripts/batch-note.js` or `batch-state.js` CLI) that runs `appendNote` (and copies attachments into `.claude/batch-assets/`) and prints the note number as JSON. One write path for mod and hook.
- [ ] B3.3 **Robustness (user note, verbatim: „notizen dürfen inkl. anhänge nicht verloren gehen, … super robust gegen alle möglichen Szenarien machen“):** drop ONLY after the writer confirmed success (exit 0 + parsed note number + attachments written). Any failure, timeout, unexpected output, missing node, mod error → `next(e)` so the classic hook (red panel, or Claude filing the attachment) takes over; `.catch` must never drop. No double filing when the mod succeeded (the prompt never reaches the hook) and no loss when it failed. Idempotency against a retried submit. Cover: mode expired/full mid-collection, another session owns the notes (#841), concurrent sessions, very long text, pasted text, multiple images, image write failure (write images first, note last; on image failure keep the text note and name the missing image in the note — or fall back entirely; choose the safer and document it).
- [ ] B3.4 Confirmation (d-batch-confirm = toastband): toast „💾 Notiz #N gespeichert“ (localised) + a persistent band row „📚 Batch · N“ while armed (existing AbovePrompt band in index.tsx). No red.
- [ ] B3.5 Attachments (d-batch-attach = yes): the mod files `e.attachments` (images, pasted text, @file) itself into the same note format the hook/Claude use (`[Anhang-Datei]` lines, `.claude/batch-assets/`).
- [ ] B3.6 Cloud / terminal / mod not loaded: classic hook behaviour unchanged (inline). Alpha-gated like the rest of the mod (`claude-mods`).
- [ ] B3.7 Tests: `mods.test.tsx` (`claude plugin test`) for collect → drop, writer failure → next, non-collectable → next, attachments; node tests for the writer entry. `docs/dev/mods.md` updated.

## Shared
- Never touch files owned by another bundle. `npm test` + `npm run lint` green at the end.
- Note #4 (devops backlog) runs in its own session and is out of scope here.

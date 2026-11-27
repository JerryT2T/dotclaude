# Implement brief — devops Home neu (rounds 1–2)

Decisions: `docs/concepts/20261127-2035-devops-home-neu-decisions.json`. Binding mock spec:
`docs/concepts/20261127-2035-devops-home-neu/rounds/02.html`, design **`r2d1` "Budget-Kopf"** (the user's favourite
in round 2), screens `r2d1-s1` Übersicht, `r2d1-s2` Einstellungen, `r2d1-s3` Projekt aus, `r2d1-s4` Erster Start.
Later round wins over earlier. Mod UI primitives only (Box, Button, Text, Svg — see existing `home.tsx`).

Code today: `plugins/devops/hooks/mods/home.tsx` (pane), `index.tsx` (band, `pressOpt`, `HomeCtx`),
`optout.ts` (band-side reader/writer), `plugins/devops/hooks/lib/devops-optout.js` (resolver),
`plugins/devops/scripts/devops-optout.js` (writer CLI), `format.ts` (`bandBars`, `budgetBarSvg`, colours `BAR`),
`plugins/devops/templates/output-style-quiet.md` (Quiet, synced to `~/.claude/output-styles` by
`hooks/lib/output-style-sync.js`), `scripts/browser-choice.js`, `scripts/thread-location.js`.

## Quotes (verbatim)

Round 1:
- general: "Das erste mal wenn man im devops home ist und noch nicht das tutorial gemacht hat, das ein overaly tutorial kommt und ekrlärt (oder man nicht auf überspringen geklickt hat! Darin vor allem die dinge erklären die nicht offensichtlich sind und grund purpose vorhzer einmal"
- d1 tiles: "Also ich finde die farbcodes verwirrend, ggü. z. B. den oben und auch was davon ist anklickbar und löst was aus von den vier kacheln!? Aufräumen hat ja klare stati und auslösungen. Generell info vs action requierered noch deutlicher machen, icons finde ich aber super darin, wiederkennbar !"
- d1 bed: "Der ist gut und wichtig, aber vllt. als icon rechtss oben nebne dem aktualisieren button lin ks danbeben als bett oder so und mit tooltip beschbreib ung!?"
- d3 head: "Hier finde ich das panel oben super, wobei die balken ansicht sollte ziemlich synchron aussehen zu der unten die man in devops als balken hübsch hat! visuell!"
- d3 pills: "gern die emoticons einfach nähmen und daneben die aktion wie arhc9ivieren aufräumen und welche die man nicht anklicken kann oder sollte dan gern anders anzeigen oder eine aktion wie hinspringen ausdenken!"
- d3 off menu: "perfekt! Das funtkioniert auch alles wenn über etwas anderes ausgeschaltet und man es hier im panel nur feststellt, right? … liest aktiv … im intervall den wert aus ohne irgendwwa sim file zu blockeiren … dann sollte das hier nach kurzer zeit oder direkt sichtbar sein"
- d2: "hier finde ich die einstellungen am besten !"
- pin "Älteste …": "wofür brauche ich hier das älteste hinweis hmmm, kann gern auch raus."
- pin project chips: "die icons briungen nur was hier wenn du dadurch auch die sessions springen kannst, ufrufen ohne extra prompt, just per klick. Zumindest zu der jeweils neusten wenn mehrere"
- d-globalback note: "naja, also stil darf ruhig eine extra setting sein, die man unabhängig davon einstellt zusätzlich"
- d-globalstyle (NO) note: "stil als extra einstellung, schau , dass der stil ttozdem funktioneirt, wenn devops nicht an ist, ggf. sogar mehr / besser wenn devops an ist, aber alles was nicht direkt mit devops zu tun hat dem plugin soll der stil weiter regeln"
- Analysis r1: d-levels = session+project+global · d-projfile = local (settings.local.json) · d-globalback = keephome (Home + band hint stay, everything else rests) · d-explain = only on deviation/problem, details behind ⓘ · d-prereq = one keyword per item, path behind ⓘ · d-hints = drop batch hint, ring legend, stats origin → "7 Tage", "devops ändert nichts davon".

Round 2 (favourite r2d1 Budget-Kopf):
- head bars Q "Zwei Balken oben, Woche und Fable – oder nur den knapperen?": "gern dort immer alle vs in den completion cards / mod panel, nur die die relevant sind zu jener zeit ( check das nochmal"
- chips rule Q "Klickbar = Rahmen und Verb, nur Info = graue Zahl – ist die Regel klar?": "passt!"
- bed Q: "lieber ein echtes bett symobol und generell die symbole einent icken größer und auch die schrift4en !"
- Ausgabestil row Q: "Ja super!"
- tour start Q: "Zweck ist gut erstmal !"
- tut-points note: "das bett icon bitte simpler, das erkennt man so nicht !?="
- pin r2d2-s3 head (off): "wenn ich hier hin klicke, sollte da sdropdown auch zughene"
- pin "⧉ Textblock kopieren": "was hilft mir das kopieren hier!?"
- pin "Statistik · 7 Tage": "Stastistik kann gern als dritter punkt nebst übersicht einstellungen sein und more fency! Das mus svisuell attraktiv sien, das muss klar quantiativ anzeigen. Dort gern richtig ideen reinstekcen und was tolles draus machen"
- pin "● An · überall": "zeigen wir dne punkt nicht rechts von devosp sonst an? und an benötigt es dann wirklich nicht mehr... überall aktiv auch nicht, nur wenn es nicht überall aktiv ist, aber selbst das wäre verwirrend, also dieses texteuelle neben dem greünen goi nicht"
- pin menu item "Alle Projekte": "bitte das overlay dropdown auch darüber machen und nicht alle elemente verschieben :/"
- Analysis r2: r2-d-style-model = ok ("Ausgabestil ist eine eigene Einstellung. Quiet wirkt auch bei ausgeschaltetem devops; ist devops an, kommen die devops-Teile dazu") · r2-d-style-scope = user (one user-level setting for all projects) · r2-d-style-offwrite = yes (project-off leaves the style untouched) · r2-d-tut-points = purpose, power, chips, bed, batch · r2-d-tut-when = first open until finished or skipped · r2-d-tut-scope = once per machine.

## Checklist (one line per accepted item; quote = source above)

### A · Opt-out levels (backend) — owner: builder-backend
A1. Third level "Alle Projekte": resolver `hooks/lib/devops-optout.js` honours a user-level switch; writer
    `scripts/devops-optout.js` gets `--scope global` (off/on/status); band-side `optout.ts` gets the same
    (`OptState.globalOff`, `switchOff/switchOn` accept 'global'). [d-levels]
A2. Global-off = keephome: hooks, skills, MCP tools, guards rest; the Home pane and the band's "devops aus ·
    Einschalten" hint stay so one click switches back. Do NOT write `enabledPlugins:false` to user settings
    (that would unload the plugin and Home with it) — use a devops-own user-level flag file (e.g.
    `~/.claude/devops-optout/global.json`) the resolver reads. [d-globalback]
A3. Project-off stays local in `.claude/settings.local.json`. [d-projfile]
A4. Project-off and global-off no longer touch `outputStyle` (remove the `outputStyle:'default'` write and the
    memo restore; keep a migration: an existing memo from an older off is still restored once on "on"). [r2-d-style-offwrite, d-globalstyle NO]
A5. Reads are read-only, no locks; state visible in Home within ≤ 20 s after a switch by prompt. [d3 off menu]
A6. Tests: resolver matrix incl. global, writer CLI global, optout.ts global, no style writes.

### B · Output style as its own setting — owner: builder-backend
B1. Home Einstellungen row "Ausgabestil" (Quiet / Standard) writes `outputStyle` in the USER settings
    (`~/.claude/settings.json`), independent of devops on/off; a small script (e.g. `scripts/output-style.js
    get|set`) does the write; takes effect on a new session — say so only when it changed (deviation rule). [r2-d-style-scope, Ausgabestil "Ja super!"]
B2. Quiet works when devops is off: in `templates/output-style-quiet.md` the devops-only parts (completion card,
    concept-page routing, thread channels, `/auto-concept`) apply only while devops tools are present; without
    them Quiet keeps its general rules (language, no narration, short answers, questions via AskUserQuestion,
    decisions) and ends a turn in plain text. [r2-d-style-model, d-globalstyle note]

### C · Home pane rework — owner: builder-ui (mock r2d1 is binding)
C1. Head card (r2d1 `.r2-head`): "devops" name with the state DOT to its right — no text "An · überall"; text
    only when off ("Aus · in dotclaude" / "Aus · diese Sitzung" / "Aus · überall"). [pin "● An · überall"]
C2. Head bars look like the band's bars (`budgetBarSvg` / `BAR` colours: lilac elapsed fill, usage marker,
    reset watermark) — Home ALWAYS shows all windows the account has (Woche, Fable when the counter exists,
    5 h when the account has a 5-hour window). [head bars quote]
C3. CHECK and report: card and band show only the bars relevant at that time (`bandBars` / `budgetBars`);
    if not, fix or report a shortfall with evidence. [head bars "check das nochmal"]
C4. ⏻ power button top right of the head opens a dropdown OVERLAY (absolute, above the content, never pushes
    elements down): "Ausschalten für" · Diese Sitzung · Projekt <name> · Alle Projekte · separator ·
    Einschalten (only while off) — the active off level ticked ✓. [pin "Alle Projekte", r1 d3 off menu "perfekt"]
C5. Clicking the head (or anywhere outside) while the dropdown is open closes it. [pin r2d2-s3]
C6. Off state: head grey, state text as C1, content dimmed; reads live (≤ 20 s). [d3 off menu]
C7. Tabs: Übersicht · Einstellungen · **Statistik** (third tab). [pin Statistik]
C8. Tab row right: real bed SVG icon (simple, recognisable bed silhouette, not 🛏 emoji) + ↻; both with
    descriptive tooltips (bed: "PC ausschalten, sobald keine Sitzung mehr arbeitet"); bed arms/cancels as today
    (confirm step kept). [bed quotes r1+r2, tut-points note]
C9. Icons and fonts a bit larger throughout the pane (chips, icons, row text). [bed quote "generell die symbole … größer und auch die schriften"]
C10. Session action chips: emoji + count + verb in ONE neutral style ("👉 2 Öffnen", "⏳ 3 Öffnen",
     "🟩 5 Archivieren", "🧹 4 Aufräumen"); count 0 → plain dim text, not clickable. Öffnen → longest waiting /
     newest running; Archivieren → archives the finished sessions (with confirm) or opens the oldest finished
     one if archiving is not reachable from the mod; Aufräumen → the band's cleanup run. No per-state colours. [d1 tiles, d3 pills, chips "passt!"]
C11. No "Älteste: …" line. [pin Älteste]
C12. Projekte list: each state chip (emoji + count) is clickable and opens that project's newest session of that
     state; "＋ Batch" / "→ Batch" as today. [pin project chips]
C13. Einstellungen in d2 list style (group heads, inset groups, label left / value right / ›): Allgemein
     (Browser, Ausgabestil), Claude-Projekte (Threads starten, Ausnahmen, Voraussetzungen), Hilfe (Einführung
     erneut zeigen). [d2 quote, r2 mock r2d1-s2]
C14. "⧉ Textblock kopieren": the user does not see what it is for → rename to say what it does
     ("Block für Projektanweisungen kopieren") and put the why behind ⓘ (one sentence: claude.ai reads the
     thread location only from the project instructions). [pin Textblock]
C15. Statistik tab: visually attractive and clearly quantitative — big numbers, mini bar/sparkline per figure
     over the 7 days where data exists, proportion bars, version footer. Use the existing info data
     (`InfoData`), no invented figures. [pin Statistik]
C16. Copy rules: explanation sentences only on deviation/problem (ⓘ for details); prerequisites as one keyword
     each with ⓘ for the path; remove the batch hint, ring legend, stats origin → "7 Tage", "devops ändert nichts
     davon". [d-explain, d-prereq, d-hints]
C17. Settings tab has no devops on/off rows (the ⏻ owns it). [r2 mock]

### D · First-run tour — owner: builder-ui
D1. Overlay tour on first Home open, until finished or skipped; remembered once per machine (user-level store
    or `~/.claude` file). [general note, r2-d-tut-when, r2-d-tut-scope]
D2. 5 steps in this order: purpose of Home ("Zweck ist gut erstmal !"), ⏻ and the three levels, action chips
    jump into sessions, bed (PC off when all done), ＋ Batch collects notes. Each step highlights its element;
    "Überspringen" and "Weiter", step dots. [r2-d-tut-points]
D3. Einstellungen › Hilfe › "Einführung erneut zeigen" restarts it.

### E · Verify — owner: qax (built nothing)
E1. `npx vitest run` on touched test files, `npm run lint`; full suite once.
E2. Visual check of the real pane (mods test harness render / screenshot as available) against mock r2d1.

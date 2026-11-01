# Fix brief 2 — second user test of the demo (2026-11-01, 10:03–10:09)

Demo: P:/Projects_scratch/analyse-demo.html (source P:/Projects_scratch/analyse-demo/gen.py; build `node plugins/devops/scripts/concept-build.js build P:/Projects_scratch/analyse-demo --force`; served at http://127.0.0.1:8722/analyse-demo.html). User's verdict: "zum zweiten Mal kardinale UX- und UI-Fehler gefunden" — a UX expert must review the whole flow, not only these points.

Observed (screenshots in the chat, 1920×1080 Edge):
a) A horizontal scrollbar appears under the chat area (briefing: content clipped on the left, "≈ 38 %" cut, a left/right scrollbar above the composer; closing: same). The analysis must NEVER scroll horizontally.
b) When the stage overflows, the chat is already scrolled down on arrival — the finding is never seen. The chat must scroll softly WITH the sequential build-up (finding visible first, then glide down as question/answer enter). Adapt the animation if needed.
c) Right rail: more space between the groups (Briefing | each topic block | Abschluss) and a little more between every item — too cramped for the mouse.
d) The topic's top-peek label ("Hooks und Cache" above the first question, with a blue line) looks cut off; the "Als Nächstes" line does not — make the previous-stage peek look intentional or drop it.
e) Flicker / rendering glitches inside the chat window (seen during animation; a big empty area below the question with a stray blue line at the bottom, a scrollbar track running down the right of the chat).
f) With overflowing messages the user cannot scroll manually — the auto-scroll keeps snapping back down. Auto-scroll only while the enter animation runs and only until the user scrolls themselves (user scroll wins).
g) Closing: the top shows the previous stage's question/answer peek instead of a header like every other stage (last topic / "Abschluss"). Remove the "5 / 7", "TOKEN-ANALYSE" eyebrow and "2 Antworten weichen von der Empfehlung ab" block under the buttons entirely. Instead put a devops chat message before the list, e.g. "Abschluss — bei diesen Themen würde ich im nächsten Schritt noch genauer hinschauen:" (rows pre-toggled by hesitation).
h) "Jetzt umsetzen" (and "Zur nächsten Runde") must be exactly the FAB-menu buttons of the concept page (same component/look), sized like the "Los geht's" button of the briefing.

Also seen: closing rows show "nicht angesehen — Vorauswahl gilt" for questions the user skipped — fine, keep. Toast "Notizen liegen nur in diesem Browser — die Bridge hat sie nicht gespeichert." is expected without a bridge.

Done when: every point fixed, a UX expert pass over every stage (briefing, topic, each answer form, closing) at 1920×1080, 1600×900 and 1366×768 found no cardinal issue left, analysis-*.test.js green, lint clean, demo rebuilt.

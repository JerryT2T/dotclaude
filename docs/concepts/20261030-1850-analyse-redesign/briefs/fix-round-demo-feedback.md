# Fix brief — user feedback on the live demo (2026-11-01, after v0.336.0)

Demo page: P:/Projects_scratch/analyse-demo.html (source P:/Projects_scratch/analyse-demo/gen.py, serve with `python -m http.server 8720` in P:/Projects_scratch). Screenshots were in the chat (session 74a18c9b…), in this order.

a) Briefing: a note sent from the composer must NOT advance to the next topic — only "Los geht's" advances. Sending a note on the briefing must work (stays, confirms).
b) Right rail: when there is enough height, either distribute the items evenly or centre the whole list vertically.
c) "Als Nächstes: …" under the CTA and the "Briefing" item at the top of the rail look half cut off and are not clickable — make both fully visible and clickable.
d) Verify the composer generally: sendable on every stage; on a question stage an untagged note = advance AND accept the recommendation/current choice; on briefing, topic intro and closing it never advances.
e) Enter animation of finding / question / answer: stretch the timing by ≥ 50 % (reading time).
f) "Punkte verteilen" is visually broken (step buttons: numbers left-aligned/clipped, uneven fills, disabled steps barely distinct, "Übrig 0 von 13" bar reads as full). Redesign the control cleanly.
g) Composer must not jump vertically: fixed position at the bottom, above the concept chrome (FABs, Strg-hint), always the same y. Chat messages are attached to the top.
h) When finding/question/answer are taller than the viewport the composer disappears — never. Composer always visible; only the chat message area scrolls (page as a whole never scrolls, title area and composer excluded); during the animation auto-scroll the chat to the bottom so the latest message is fully visible even if the finding scrolls out at the top.
i) Title bar area during question stages: tighten vertically. The glow behind the stage must fade softly, not be cut off (visible hard edge at the top of the stage area).

Critically re-verify every point in the browser at 1600×900 (and a shorter height, e.g. 1600×760) before reporting done.

# Concept templates, part 25 of 49: Shared systems — decision panel state CSS (continued 2)

```css
/* Close-out sheet — the final report's to-do inbox. A flex column end to
   end (`.panel-cta` → `#panel-final-report` → `.closeout-sheet` →
   `.closeout-body`): only `.closeout-body` scrolls, `.closeout-foot` (the 🤖
   group and the two buttons) stays pinned under the divider at every
   viewport. `flex: 1 1 auto; min-height: 0`, never `height: 100%` — a
   percentage height against an auto-height block ancestor resolves to the
   content's own size, i.e. no cap, and the buttons slid below the fold. */
.closeout-sheet {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}
.closeout-sheet .closeout-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding-bottom: 0.4rem;
}
.closeout-sheet [hidden] { display: none !important; }
.closeout-sheet .closeout-group { display: flex; flex-direction: column; gap: 0.35rem; }
/* Group heading — the icon + "Du entscheidest" with its count. One style for
   all four groups (🧭 🧪 👉 🤖). */
.closeout-sheet .closeout-gh {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-color, #c9d1d9);
}
.closeout-sheet .closeout-gh em {
  margin-left: auto;
  font-style: normal;
  font-weight: 500;
  font-size: 0.75rem;
  color: var(--text-secondary, #8b949e);
}
.closeout-sheet .closeout-list { display: flex; flex-direction: column; gap: 0.35rem; }
/* One row = one to-do, same surface for both lists. */
.closeout-sheet .closeout-todo {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--border-color, #30363d);
  border-radius: 8px;
  background: color-mix(in srgb, var(--text-color, #c9d1d9) 3%, var(--panel-bg, #161b22));
  color: var(--text-color, #c9d1d9);
  font: inherit;
  text-align: left;
}
/* 🧭 One line per Fund: name (jumps to the report) and route pill (cycles). */
.closeout-sheet .closeout-decide {
  flex-direction: row;
  align-items: center;
  gap: 0.45rem;
}
.closeout-sheet .closeout-decide[data-shortfall] { border-left: 3px solid var(--warning-color, #d29922); }
.closeout-sheet .closeout-jump,
.closeout-sheet .closeout-decide .closeout-pill { font-family: inherit; cursor: pointer; }
.closeout-sheet .closeout-jump {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-decoration: underline dotted color-mix(in srgb, currentColor 45%, transparent);
  text-underline-offset: 3px;
}
.closeout-sheet .closeout-jump:hover { color: var(--accent-color, #58a6ff); text-decoration: underline; }
.closeout-sheet .closeout-jump:focus-visible,
.closeout-sheet .closeout-decide .closeout-pill:focus-visible,
.closeout-sheet .closeout-guide:focus-visible,
.closeout-sheet .closeout-drop:focus-visible,
.closeout-sheet .closeout-go:focus-visible {
  outline: 2px solid var(--accent-color, #58a6ff);
  outline-offset: 2px;
}
.closeout-sheet .closeout-route-hint {
  margin: 0.1rem 0 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--text-secondary, #8b949e);
}
.closeout-sheet .closeout-more-btn { align-self: flex-start; margin: 0; font-size: 0.75rem; }
.closeout-sheet .closeout-todo-head { display: flex; align-items: flex-start; gap: 0.4rem; min-width: 0; }
.closeout-sheet .closeout-kind { flex: none; font-size: 0.78rem; line-height: var(--pill-line-height, 1.3); }
/* A Fund title is one line (ellipsis, full text on hover); a to-do title at
   most TWO lines, never a one-line ellipsis: the title wraps
   (overflow-wrap: anywhere breaks even an unbroken string). Authoring caps both
   (templates-final-report.md, validation-gate.md 33c), so the clamp is only a
   safety net; when it does cut, syncClampTips() puts the full text on data-tip. */
.closeout-sheet .closeout-todo-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  line-height: var(--pill-line-height, 1.3);
  font-size: 0.82rem;
}
.closeout-sheet .closeout-todo-mode .closeout-todo-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
/* Route pill — ⚡ warning (the one route that writes code, the implement
   colour), 📌 accent (the issue colour), Weglassen neutral. */
.closeout-sheet .closeout-pill {
  flex: none;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  background: transparent;
  border: 1px solid var(--border-color, #30363d);
  color: var(--text-secondary, #8b949e);
}
.closeout-sheet .closeout-pill[data-route="implement"] {
  color: var(--warning-color, #d29922);
  border-color: color-mix(in srgb, var(--warning-color, #d29922) 60%, transparent);
  background: color-mix(in srgb, var(--warning-color, #d29922) 12%, transparent);
}
.closeout-sheet .closeout-pill[data-route="issue"] {
  color: var(--accent-color, #58a6ff);
  border-color: color-mix(in srgb, var(--accent-color, #58a6ff) 60%, transparent);
  background: color-mix(in srgb, var(--accent-color, #58a6ff) 12%, transparent);
}
.closeout-sheet .closeout-crit {
  flex: none;
  font-size: 0.66rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
  color: var(--danger-color, #f85149);
  background: color-mix(in srgb, var(--danger-color, #f85149) 15%, transparent);
}
/* "Führ mich" switch + ✕. Off = the item goes on the completion card. */
.closeout-sheet .closeout-todo-ctl { display: flex; align-items: center; justify-content: flex-end; gap: 0.4rem; }
.closeout-sheet .closeout-guide {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 2px 8px;
  border: 1px solid var(--border-color, #30363d);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary, #8b949e);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}
.closeout-sheet .closeout-guide-dot {
  width: 8px;
  height: 8px;
  box-sizing: border-box;
  border: 1.5px solid currentColor;
  border-radius: 50%;
}
.closeout-sheet .closeout-guide[aria-checked="true"] {
  color: var(--accent-color, #58a6ff);
  border-color: var(--accent-color, #58a6ff);
  background: color-mix(in srgb, var(--accent-color, #58a6ff) 12%, transparent);
}
.closeout-sheet .closeout-guide[aria-checked="true"] .closeout-guide-dot { background: currentColor; }
.closeout-sheet .closeout-drop {
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text-secondary, #8b949e);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.closeout-sheet .closeout-drop:hover { color: var(--text-color, #c9d1d9); background: color-mix(in srgb, var(--text-color, #c9d1d9) 8%, transparent); }
.closeout-sheet .closeout-todo-mode[data-mode="skip"] .closeout-todo-title { opacity: 0.55; text-decoration: line-through; }
.closeout-sheet .closeout-todo-mode[data-mode="skip"] .closeout-kind { opacity: 0.55; }
.closeout-sheet .closeout-more,
.closeout-sheet .closeout-empty { margin: 0; font-size: 0.74rem; color: var(--text-secondary, #8b949e); }
/* Done state: the chosen mode as a plain line; a struck item muted. */
.closeout-sheet .closeout-todo-done { flex-direction: row; align-items: center; gap: 0.45rem; }
.closeout-sheet .closeout-todo-done[data-mode="skip"] { opacity: 0.55; }

/* Under the divider: the plan line, the quiet disposition line, the buttons. */
.closeout-sheet .closeout-foot {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--border-color, #30363d);
}
.closeout-sheet .closeout-claude { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.2rem; }
.closeout-sheet .closeout-plan { margin: 0; font-size: 0.78rem; color: var(--text-color, #c9d1d9); }
.closeout-sheet .closeout-dispose-line {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--text-secondary, #8b949e);
}
.closeout-sheet .closeout-dispose-line .link-btn { margin: 0 0 0 auto; font-size: 0.75rem; }
.closeout-sheet .dispose-fieldset { margin-top: 0.3rem; }
.closeout-sheet .closeout-go {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  font: inherit;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
}
/* "🏁🚀 Abschließen & shippen" — the warning FILL (the implement colour,
   because it is the click that reaches outside the repo), no ⚠ glyph. */
.closeout-sheet #closeout-ship {
  color: var(--bg-color, #0d1117);
  background: var(--warning-color, #d29922);
  border: 1px solid var(--warning-color, #d29922);
}
.closeout-sheet #closeout-ship:hover {
  background: color-mix(in srgb, var(--warning-color, #d29922) 85%, var(--text-color, #c9d1d9));
}
.closeout-sheet .closeout-ghost {
  color: var(--text-color, #c9d1d9);
  background: transparent;
  border: 1px solid var(--border-color, #30363d);
}
.closeout-sheet .closeout-ghost:hover {
  background: color-mix(in srgb, var(--text-color, #c9d1d9) 6%, transparent);
}
/* "🔧 Nachbessern": no release, nothing closes — the quietest of the three. */
.closeout-sheet .closeout-quiet {
  padding: 0.35rem 0.8rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary, #8b949e);
  background: transparent;
  border: 1px dashed var(--border-color, #30363d);
}
.closeout-sheet .closeout-quiet:hover { color: var(--text-color, #c9d1d9); }
.closeout-sheet .closeout-go:disabled { cursor: default; }
/* After the click the clicked button is the status: running (accent),
   stalled (warning outline) — full opacity, a readout, not a greyed-out
   control. Done is its own button (#closeout-close, success). */
.closeout-sheet .closeout-go[data-finalize-state="running"] {
  color: var(--accent-color, #58a6ff);
  border: 1px solid var(--accent-color, #58a6ff);
  background: color-mix(in srgb, var(--accent-color, #58a6ff) 10%, transparent);
}
.closeout-sheet .closeout-go[data-finalize-state="stalled"] {
  color: var(--warning-color, #d29922);
  border: 1px solid var(--warning-color, #d29922);
  background: transparent;
}
.closeout-sheet .closeout-done-btn {
  color: var(--success-color, #3fb950);
  border: 1px solid var(--success-color, #3fb950);
  background: color-mix(in srgb, var(--success-color, #3fb950) 10%, transparent);
}
.link-btn {
  display: inline-block;
  margin-top: 0.6rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent-color, #58a6ff);
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: underline;
}
.link-btn:hover { opacity: 0.8; }

/* Disposition fieldset — controls Step 6 cleanup. Opened inline from the 🤖
   group's "🧹 Diese Seite wird gelöscht · ändern" line; default selection is
   "discard" (matches the typical one-shot refinement workflow). */
.dispose-fieldset {
  margin-top: 0;
  padding: 0.85rem 0.95rem 1rem;
  border: 1px solid var(--border-color, #30363d);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-color, #0d1117) 70%, transparent);
}
.dispose-fieldset legend {
  padding: 0 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color, #c9d1d9);
}
.dispose-fieldset .dispose-option {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.45rem 0.5rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.dispose-fieldset .dispose-option:hover {
  background: color-mix(in srgb, var(--accent-color, #58a6ff) 8%, transparent);
}
.dispose-fieldset .dispose-option input[type="radio"] {
  margin-top: 0.25rem;
  accent-color: var(--accent-color, #58a6ff);
}
.dispose-fieldset .dispose-label {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.dispose-fieldset .dispose-label strong {
  font-size: 0.85rem;
  font-weight: 600;
}
.dispose-fieldset .dispose-sub {
  font-size: 0.74rem;
  color: var(--text-secondary, #8b949e);
  line-height: 1.4;
}
.dispose-fieldset .dispose-move-row {
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px dashed var(--border-color, #30363d);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.dispose-fieldset .dispose-move-row label {
  font-size: 0.78rem;
  color: var(--text-secondary, #8b949e);
  font-weight: 500;
}
.dispose-fieldset .dispose-move-row input {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--border-color, #30363d);
  background: color-mix(in srgb, var(--bg-color, #0d1117) 80%, transparent);
  color: var(--text-color, #c9d1d9);
  font: inherit;
  font-size: 0.82rem;
}
.dispose-fieldset .dispose-move-row input:focus {
  outline: none;
  border-color: var(--accent-color, #58a6ff);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color, #58a6ff) 30%, transparent);
}

/* Iteration tab styling for the final-report tab — distinct from
   numbered iteration tabs so the closing step reads as a milestone. */
.iteration-tab[data-final-report] {
  border-color: var(--success-color, #3fb950);
  color: var(--success-color, #3fb950);
}
.iteration-tab[data-final-report][aria-selected="true"] {
  background: color-mix(in srgb, var(--success-color, #3fb950) 15%, transparent);
  border-color: var(--success-color, #3fb950);
  color: var(--text-color, #c9d1d9);
}
.iteration-tab[data-final-report][aria-selected="true"]::before {
  content: "✓ ";
  color: var(--success-color, #3fb950);
}
.iteration-tab[data-final-report]:not([aria-selected="true"])::before {
  content: "";
}

/* Iteration tab styling for a reality-check round. Warning-toned, not error-
   toned: nothing went wrong, the branch simply moved, and the round is a
   normal iteration the user answers and moves on from. Loud enough that the
   user understands why an implement click produced another round, quiet
   enough that it does not read as a blocker. */
.iteration-tab[data-reality-check] {
  border-color: var(--warning-color, #d29922);
  color: var(--warning-color, #d29922);
}
.iteration-tab[data-reality-check][aria-selected="true"] {
  background: color-mix(in srgb, var(--warning-color, #d29922) 15%, transparent);
  border-color: var(--warning-color, #d29922);
  color: var(--text-color, #c9d1d9);
}
.iteration-tab[data-reality-check]::before {
  content: "⟲ ";
  color: var(--warning-color, #d29922);
}

/* The explainer that opens a reality-check section. It is the first thing the
   user reads after clicking implement and NOT getting code, so it carries the
   whole "why am I looking at this" load — including the reassurance that the
   implement order still stands. */
.reality-banner {
  border: 1px solid var(--warning-color, #d29922);
  border-left-width: 4px;
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  background: color-mix(in srgb, var(--warning-color, #d29922) 8%, transparent);
}
.reality-banner h2 {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  color: var(--text-color, #c9d1d9);
}
.reality-banner p { margin: 0.4rem 0 0; color: var(--text-secondary, #8b949e); }
.reality-banner .reality-reassure { color: var(--text-color, #c9d1d9); font-weight: 600; }
.reality-evidence {
  margin: 0.6rem 0 0;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--text-secondary, #8b949e) 10%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
  color: var(--text-secondary, #8b949e);
  overflow-x: auto;
}
```


# Concept templates, part 06 of 54: Panel chrome — Live-Treue switch

## Live-Treue switch (fidelity)

One round-wide setting at the foot of the dock, after the general note: "the
NEXT rounds of this Etappe come at live fidelity". Untouched parts are
reproduced exactly as live, and changed or new parts are fully polished
(`live-fidelity.md` § Live-Treue rounds). It is page chrome like the
rest of the dock, so it never sits inside a round section. The build therefore
does not freeze it. This block shows the frozen round's own state while a past
tab is on screen and refuses a change there.

- **Sticky per concept and Etappe, default off.** Its own localStorage key
  (`concept-fidelity-<page>`) maps every Etappe id (`_` on an unstaged
  concept) to `live` / `off`. It is NOT `saveState()`'s blob, whose page
  version changes on every build. With the key gone (another browser, cleared
  storage), the last frozen round of the same Etappe answers. A new Etappe
  starts off.
- **The payload** carries `fidelity: "live" | "off"`, set by
  `submitWithAction()` from `window.fidelityPayload()`. A next-stage click
  asks for the target Etappe's state. `bake` keeps it in the round's
  `data-frozen-feedback` blob.
- **Visible state.** `#dock-fidelity[data-on]`, the LIVE chip on every live
  round's tab (build flag `data-fidelity`), and `#fidelity-chip` while a live
  round is on screen. The 💬 FAB carries no status dot (#1180: it read as an
  unexplained signal); the tab chip says it when the dock is collapsed. The chip carries the
  round's `data-fidelity-note`, in amber with "angenähert" when the round
  carries `data-fidelity-approx`.
- **Explanation on demand (#1179).** Only the switch and its label sit in the
  dock. `{{fidelity.hint}}` and `{{fidelity.scope}}` are the label's
  `data-tip`, so the app tooltip (§ Utilities) shows them on hover, on
  keyboard focus of the switch and on a long-press on touch, never as a
  native `title` and never as permanent text.
- **Hidden on the final report.** Implement, finalize, refine and review
  ignore the switch.

```javascript
// --- Live-Treue switch (fidelity) — § Feedback dock · Live-Treue switch ---
(() => {
  const KEY = 'concept-fidelity-' + location.pathname.split('/').pop().replace('.html', '');
  const readStore = () => {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return (v && typeof v === 'object') ? v : {}; }
    catch (e) { return {}; }
  };
  const writeStore = (obj) => {
    const text = JSON.stringify(obj);
    if (typeof _guardedSetItem === 'function') _guardedSetItem(KEY, text);
  };
  const liveSection = () => document.querySelector('section[data-iteration][data-active]');
  const shownSection = () => document.querySelector('section[data-iteration]:not([hidden])') || liveSection();
  function stagesData() {
    const node = document.getElementById('concept-stages');
    if (!node) return null;
    try { return JSON.parse(node.textContent); } catch (e) { return null; }
  }
  // The Etappe a round belongs to: its own data-stage, else (final report,
  // reality-check round, unstaged page) the page's current Etappe, else `_`.
  function stageOf(section) {
    const own = section && section.getAttribute('data-stage');
    if (own) return own;
    const d = stagesData();
    return (d && d.current) ? String(d.current) : '_';
  }
  function frozenFidelity(section) {
    const node = section && section.querySelector('script[type="application/json"][data-frozen-feedback]');
    if (!node) return null;
    try { const v = JSON.parse(node.textContent).fidelity; return (v === 'live' || v === 'off') ? v : null; }
    catch (e) { return null; }
  }
  // Sticky state of one Etappe: the stored choice, else what the last frozen
  // round of that Etappe was sent with, else off.
  function stateFor(stage) {
    const stored = readStore()[stage];
    if (stored === 'live' || stored === 'off') return stored;
    const rounds = [...document.querySelectorAll('section[data-iteration][data-baked]')]
      .filter(s => stageOf(s) === stage).reverse();
    for (const s of rounds) { const f = frozenFidelity(s); if (f) return f; }
    return 'off';
  }
  window.fidelityPayload = function(targetStage) {
    return stateFor(targetStage ? String(targetStage) : stageOf(liveSection()));
  };

  const boot = () => {
    const box = document.getElementById('dock-fidelity');
    const input = document.getElementById('fidelity-toggle');
    const dock = document.getElementById('feedback-dock');
    const chip = document.getElementById('fidelity-chip');
    const chipNote = document.getElementById('fidelity-chip-note');
    if (!box || !input) return;
    const locked = () => document.body.classList.contains('viewing-frozen')
      || (dock && dock.dataset.submitted === 'true');
    function render() {
      const shown = shownSection();
      const live = liveSection();
      const finalLive = !!(live && live.hasAttribute('data-final-report'));
      box.hidden = finalLive;
      // A frozen tab shows what THAT round was sent with; the live tab shows the sticky state.
      const frozenView = document.body.classList.contains('viewing-frozen');
      const value = frozenView ? (frozenFidelity(shown) || 'off') : stateFor(stageOf(live));
      input.checked = value === 'live';
      input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
      input.setAttribute('aria-readonly', locked() ? 'true' : 'false');
      box.dataset.on = input.checked ? 'true' : 'false';
      if (chip) {
        const isLive = !!(shown && shown.getAttribute('data-fidelity') === 'live');
        const approx = isLive && shown.hasAttribute('data-fidelity-approx');
        const note = isLive ? (shown.getAttribute('data-fidelity-note') || '') : '';
        chip.hidden = !isLive;
        chip.classList.toggle('is-approx', approx);
        if (chipNote) chipNote.textContent = [approx ? '{{fidelity.chip_approx}}' : '', note].filter(Boolean).join(' · ');
      }
    }
    input.addEventListener('change', () => {
      if (locked()) { render(); return; }
      const store = readStore();
      store[stageOf(liveSection())] = input.checked ? 'live' : 'off';
      writeStore(store);
      render();
    });
    window.renderFidelity = render;
    render();
    document.addEventListener('iteration:changed', render);
    // The submit marks the dock read-only; the switch follows on the next paint.
    if (dock) new MutationObserver(render).observe(dock, { attributes: true, attributeFilter: ['data-submitted'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
```

```css
/* Live-Treue switch — the dock's last row, below the general note. */
.dock-fidelity {
  display: flex; flex-direction: column; gap: 4px;
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid var(--border-color, #30363d);
}
.dock-fidelity[hidden] { display: none; }
.fidelity-switch { position: relative; display: flex; align-items: center; gap: 10px; cursor: pointer; }
.fidelity-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
.fidelity-track {
  flex: none; position: relative; width: 34px; height: 20px; margin-top: 1px; border-radius: 10px;
  background: color-mix(in srgb, var(--text-secondary, #8b949e) 35%, transparent);
  transition: background 0.15s ease;
}
.fidelity-track::after {
  content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%;
  background: #fff; transition: transform 0.15s ease;
}
.fidelity-switch input:checked + .fidelity-track { background: var(--success-color, #3fb950); }
.fidelity-switch input:checked + .fidelity-track::after { transform: translateX(14px); }
.fidelity-switch input:focus-visible + .fidelity-track { outline: 2px solid var(--accent-color, #58a6ff); outline-offset: 2px; }
.fidelity-switch input[aria-readonly="true"] + .fidelity-track { opacity: 0.6; }
.fidelity-text { display: flex; flex-direction: column; gap: 1px; line-height: 1.3; }
.fidelity-text strong { font-size: 0.85rem; color: var(--text-color, #e6edf3); }
@media (prefers-reduced-motion: reduce) {
  .fidelity-track, .fidelity-track::after { transition: none; }
}
/* LIVE on the tab of every live round. */
.iteration-tab[data-fidelity="live"]::after {
  content: "LIVE"; margin-left: 6px; padding: 0 5px; border-radius: 4px;
  font-size: 0.65rem; font-weight: 600; letter-spacing: 0.04em; vertical-align: 1px;
  color: var(--success-color, #3fb950);
  background: color-mix(in srgb, var(--success-color, #3fb950) 16%, transparent);
}
/* The chip while a live round is on screen: top centre, above the mock, below the panel. */
.fidelity-chip {
  position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 90;
  display: flex; align-items: baseline; gap: 6px; max-width: min(520px, calc(100vw - 180px));
  padding: 4px 10px; border-radius: 8px;
  font-size: 0.75rem; color: var(--success-color, #3fb950);
  background: color-mix(in srgb, var(--panel-bg, #161b22) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--success-color, #3fb950) 45%, transparent);
}
.fidelity-chip[hidden] { display: none; }
.fidelity-chip small { color: var(--text-secondary, #8b949e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fidelity-chip.is-approx { color: var(--warning-color, #d29922); border-color: color-mix(in srgb, var(--warning-color, #d29922) 45%, transparent); }
```


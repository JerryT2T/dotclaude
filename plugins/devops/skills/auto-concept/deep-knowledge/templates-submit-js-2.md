# Concept templates, part 36 of 50: Shared systems — two-button submit JS (continued 2)

```javascript
// Every user-facing string comes from the sheet's data-label-* attributes,
// baked in from the locale table at generation time.
function closeoutLabel(name, fallback) {
  const sheet = document.getElementById('closeout-sheet');
  const key = 'label' + name.charAt(0).toUpperCase() + name.slice(1);
  return (sheet && sheet.dataset[key]) || fallback || '';
}
const CLOSEOUT_ROUTE_GLYPH = { implement: '⚡', issue: '📌', ignore: '✕' };
function closeoutRouteText(route) {
  return CLOSEOUT_ROUTE_GLYPH[route] + ' ' + closeoutLabel('route' + route.charAt(0).toUpperCase() + route.slice(1), route);
}
function closeoutEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

// 🧭 One line per Fund: the name (a tap jumps to the Fund in the report, which
// holds what, where and why) and the route pill (a tap moves to the next
// route). Everything is visible and nothing covers the rest of the panel. A
// not-built item (data-oq-origin="shortfall") carries the ⚠ mark.
function decideRow(key, el) {
  const row = closeoutEl('div', 'closeout-todo closeout-decide');
  row.dataset.routeRow = key;
  row.dataset.followup = followUpId(el) || key;
  if (el.dataset.oqOrigin === 'shortfall') row.dataset.shortfall = '';
  const name = closeoutEl('button', 'closeout-todo-title closeout-jump', followUpLabel(el));
  name.type = 'button';
  name.dataset.routeJump = key;
  name.dataset.tipFull = followUpLabel(el);
  row.appendChild(name);
  queueClampTips();
  const pill = closeoutEl('button', 'closeout-pill');
  pill.type = 'button';
  pill.dataset.routeCycle = key;
  pill.dataset.routePill = '';
  row.appendChild(pill);
  return row;
}
// data-tip only on a title the two-line clamp actually cuts. Rows are built
// before they are attached, so measure after the render and on resize.
function syncClampTips() {
  document.querySelectorAll('.closeout-sheet [data-tip-full]').forEach(host => {
    const t = host.classList.contains('closeout-todo-title') ? host : host.querySelector('.closeout-todo-title');
    if (t && (t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1)) host.dataset.tip = host.dataset.tipFull;
    else delete host.dataset.tip;
  });
}
let _clampTipsQueued = false;
function queueClampTips() {
  if (_clampTipsQueued) return;
  _clampTipsQueued = true;
  requestAnimationFrame(() => { _clampTipsQueued = false; syncClampTips(); });
}
window.addEventListener('resize', queueClampTips);
// Rows past the third wait behind "+N weitere"; the choice stays in memory for
// the session of the sheet, like every other answer on it.
let _decideExpanded = false;
function syncDecideRows() {
  const host = document.getElementById('closeout-decide-list');
  if (!host) return;
  const { rows } = closeoutFundeSplit();
  const byKey = {};
  rows.forEach(r => { byKey[r.key] = r.el; });
  let i = 0;
  host.querySelectorAll('[data-route-row]').forEach(row => {
    const key = row.dataset.routeRow;
    row.hidden = !_decideExpanded && i >= CLOSEOUT_GROUP_MAX;
    i += 1;
    const route = followUpRoute(key, byKey[key]);
    const pill = row.querySelector('[data-route-pill]');
    if (pill) {
      pill.dataset.route = route;
      pill.textContent = route === 'implement'
        ? CLOSEOUT_ROUTE_GLYPH.implement + ' ' + closeoutLabel('routeImplementShort', 'implement')
        : closeoutRouteText(route);
      pill.dataset.tip = closeoutLabel('route' + route.charAt(0).toUpperCase() + route.slice(1) + 'Hint', '');
      pill.setAttribute('aria-label', pill.textContent + ' · ' + closeoutLabel('routeHint', ''));
    }
  });
  const more = document.getElementById('closeout-decide-more');
  if (more) {
    const hiddenRows = rows.length - CLOSEOUT_GROUP_MAX;
    more.hidden = _decideExpanded || hiddenRows <= 0;
    more.textContent = closeoutLabel('fundeMore', '+{n}').replace('{n}', String(Math.max(0, hiddenRows)));
  }
  const hint = document.getElementById('closeout-route-hint');
  if (hint) hint.hidden = rows.length === 0;
}
// A tap on the pill moves on to the next route; the row stays in place, so
// focus stays on the pill and the plan line follows.
function cycleRoute(key) {
  const hit = closeoutFundeSplit().rows.find(r => r.key === key);
  if (!hit) return;
  const at = CLOSEOUT_ROUTES.indexOf(followUpRoute(key, hit.el));
  _closeoutChoices.route[key] = CLOSEOUT_ROUTES[(at + 1) % CLOSEOUT_ROUTES.length];
  refreshCloseout();
}
// A tap on the name opens the 🔍 fold and brings that Fund into view, marked
// for a moment. The report is the one place that says what, where and why, in
// the page's language (the issue body is an English artefact).
function jumpToFund(key) {
  const hit = closeoutFundeSplit().rows.find(r => r.key === key);
  if (!hit) return;
  const fold = hit.el.closest('details');
  if (fold) fold.open = true;
  hit.el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  hit.el.classList.add('fr-fund-hit');
  setTimeout(() => hit.el.classList.remove('fr-fund-hit'), 1600);
  if (window.innerWidth < 900) window.closePanel?.();
}

// 🧪 / 👉 One row per to-do in one list: the kind glyph and the text, then the
// "Führ mich" switch and ✕. Off means it goes on the completion card, on means
// Claude guides the step, ✕ strikes it (↩ brings it back). The switch names its
// kind of guidance in the glyph and the tooltip. Criticality shows only when it
// is high: the other chips said little.
const CLOSEOUT_GUIDE_GLYPH = { web: '🧭', desktop: '🖥', inline: '📄' };
const CLOSEOUT_KIND_GLYPH = { tests: '🧪', handoffs: '👉' };
function todoRow(kind, el, i) {
  const key = todoKey(kind, el, i);
  const row = closeoutEl('div', 'closeout-todo closeout-todo-mode');
  row.dataset.todoKey = key;
  row.dataset.todoKind = kind;
  const head = closeoutEl('div', 'closeout-todo-head');
  const glyph = closeoutEl('span', 'closeout-kind', CLOSEOUT_KIND_GLYPH[kind]);
  glyph.dataset.tip = closeoutLabel(kind === 'tests' ? 'groupTests' : 'groupHandoffs', '');
  head.appendChild(glyph);
  const title = closeoutEl('span', 'closeout-todo-title', todoText(el));
  title.dataset.tipFull = title.textContent;
  head.appendChild(title);
  queueClampTips();
  if (String(el.dataset.crit || '').toLowerCase() === 'high') {
    const chip = closeoutEl('span', 'closeout-crit', closeoutLabel('critHigh', 'high'));
    chip.dataset.crit = 'high';
    head.appendChild(chip);
  }
  row.appendChild(head);
  const ctl = closeoutEl('div', 'closeout-todo-ctl');
  const sw = closeoutEl('button', 'closeout-guide');
  sw.type = 'button';
  sw.setAttribute('role', 'switch');
  sw.dataset.todoGuide = key;
  sw.appendChild(closeoutEl('span', 'closeout-guide-glyph'));
  sw.appendChild(closeoutEl('span', '', closeoutLabel('guideToggle', 'guide')));
  sw.appendChild(closeoutEl('span', 'closeout-guide-dot'));
  ctl.appendChild(sw);
  const drop = closeoutEl('button', 'closeout-drop');
  drop.type = 'button';
  drop.dataset.todoDrop = key;
  ctl.appendChild(drop);
  row.appendChild(ctl);
  return row;
}
// Done state (data-closed): the chosen mode as a plain line, no controls.
function todoDoneRow(kind, el, i) {
  const mode = todoMode(kind, el, i);
  const row = closeoutEl('div', 'closeout-todo closeout-todo-done');
  row.dataset.mode = mode;
  row.appendChild(closeoutEl('span', 'closeout-todo-title', todoText(el)));
  const g = todoGuide(el, mode);
  const text = closeoutLabel('mode' + mode.charAt(0).toUpperCase() + mode.slice(1), mode);
  row.appendChild(closeoutEl('span', 'closeout-pill', g === 'web' ? '🧭 ' + text
    : g === 'desktop' ? '🖥 ' + text : g === 'inline' ? '📄 ' + text : text));
  return row;
}
function todoEntries() {
  return ['tests', 'handoffs'].flatMap(kind => todoItems(kind).map((el, i) => ({ kind, el, i })));
}
function syncTodoRows() {
  const host = document.getElementById('closeout-todo-list');
  if (!host) return;
  const all = todoEntries();
  host.querySelectorAll('[data-todo-key]').forEach(row => {
    const hit = all.find(t => todoKey(t.kind, t.el, t.i) === row.dataset.todoKey);
    if (!hit) return;
    const mode = todoMode(hit.kind, hit.el, hit.i);
    row.dataset.mode = mode;
    const sw = row.querySelector('[data-todo-guide]');
    if (sw) {
      const g = todoGuide(hit.el, 'guide');
      sw.hidden = mode === 'skip';
      sw.setAttribute('aria-checked', mode === 'guide' ? 'true' : 'false');
      sw.querySelector('.closeout-guide-glyph').textContent = CLOSEOUT_GUIDE_GLYPH[g];
      sw.dataset.tip = closeoutLabel('guide' + g.charAt(0).toUpperCase() + g.slice(1), g);
    }
    const drop = row.querySelector('[data-todo-drop]');
    if (drop) {
      drop.textContent = mode === 'skip' ? '↩' : '✕';
      const label = closeoutLabel(mode === 'skip' ? 'todoRestore' : 'todoDrop', '');
      drop.setAttribute('aria-label', label);
      drop.dataset.tip = label;
    }
  });
}
function todoChoose(key, mode) {
  _closeoutChoices.mode[key] = mode;
  refreshCloseout();
}
// "Führ mich" flips between guidance and the completion card.
function toggleTodoGuide(key) {
  const hit = todoEntries().find(t => todoKey(t.kind, t.el, t.i) === key);
  if (hit) todoChoose(key, todoMode(hit.kind, hit.el, hit.i) === 'guide' ? 'self' : 'guide');
}
// ✕ strikes the item; ↩ brings back what Claude authored (a low item, authored
// as struck, comes back onto the card).
function toggleTodoDrop(key) {
  const hit = todoEntries().find(t => todoKey(t.kind, t.el, t.i) === key);
  if (!hit) return;
  if (todoMode(hit.kind, hit.el, hit.i) !== 'skip') { todoChoose(key, 'skip'); return; }
  const authored = todoDefaultMode(hit.el);
  todoChoose(key, authored === 'skip' ? 'self' : authored);
}

// Rebuild a group only when its item SET changes (by key, never by count) —
// a rebuild on every change would tear the row out from under the cursor or
// the keyboard focus mid-choice. Answers live in _closeoutChoices, so a
// rebuild never loses one.
function renderGroup(kind, keys, build) {
  const host = document.getElementById('closeout-' + kind + '-list');
  const group = host && host.closest('[data-closeout-group]');
  if (!host || !group) return 0;
  const sig = JSON.stringify(keys);
  if (host.dataset.itemKey !== sig) {
    host.dataset.itemKey = sig;
    host.textContent = '';
    build(host);
  }
  group.hidden = keys.length === 0;
  return keys.length;
}
function renderDecideGroup(closed) {
  const { rows } = closeoutDecideSplit(closed);
  const n = renderGroup('decide', rows.map(r => r.key), host => {
    rows.forEach(r => host.appendChild(decideRow(r.key, r.el)));
  });
  const count = document.querySelector('[data-closeout-group="decide"] [data-closeout-count]');
  if (count) count.textContent = n ? String(n) : '';
  syncDecideRows();
  return n;
}
// The done state shows no Funde in the FAB — the report body says what
// became of each one (issue link / "umgesetzt").
function closeoutDecideSplit(closed) {
  return closed ? { rows: [] } : closeoutFundeSplit();
}
function renderTodoGroup(closed) {
  const all = todoEntries();
  const shown = all.filter(t => t.i < CLOSEOUT_GROUP_MAX);
  const keys = shown.map(t => todoKey(t.kind, t.el, t.i)).concat(closed ? ['closed'] : []);
  const n = renderGroup('todo', all.length ? keys : [], host => {
    shown.forEach(t => host.appendChild(closed ? todoDoneRow(t.kind, t.el, t.i) : todoRow(t.kind, t.el, t.i)));
    // More than three of a kind: the rest keep their authored default and stay
    // in the payload; the line only says they exist.
    if (all.length > shown.length) {
      host.appendChild(closeoutEl('p', 'closeout-more',
        closeoutLabel('todoMore', '{n}').replace('{n}', String(all.length - shown.length))));
    }
  });
  const count = document.querySelector('[data-closeout-group="todo"] [data-closeout-count]');
  if (count) count.textContent = all.length ? String(all.length) : '';
  if (!closed) syncTodoRows();
  return n;
}

// --- Under the divider ---
// The plan line ("⚡ 2 × jetzt umsetzen · 📌 1 × Issue anlegen") is what the
// click will do, read out of the inbox above — re-rendered on every change, so it can never
// describe an older answer than the one on screen.
function renderCloseoutPlan() {
  const el = document.getElementById('closeout-plan');
  if (!el) return;
  const impl = collectImplementItems().length;
  const iss = collectIssueItems().length;
  const parts = [];
  if (impl) parts.push('⚡ ' + closeoutLabel('planImplement', '{n}').replace('{n}', String(impl)));
  if (iss) parts.push('📌 ' + closeoutLabel('planIssue', '{n}').replace('{n}', String(iss)));
  el.textContent = parts.join(' · ');
  el.hidden = parts.length === 0;
}
// The disposition as ONE line with its default — "🧹 Diese Seite wird
// gelöscht · ändern"; "ändern" opens the radios + moveTo inline.
function renderDisposeLine() {
  const el = document.querySelector('[data-dispose-summary]');
  if (!el) return;
  const d = collectDisposition();
  const name = d.mode === 'keep' ? 'disposeLineKeep' : d.mode === 'gitignore' ? 'disposeLineGitignore' : 'disposeLineDiscard';
  el.textContent = closeoutLabel(name, d.mode) + (d.moveTo ? ' → ' + d.moveTo : '');
}
function toggleDisposeEdit(open) {
  const btn = document.getElementById('closeout-dispose-edit');
  const set = document.getElementById('panel-dispose-concept');
  if (!btn || !set) return;
  const next = typeof open === 'boolean' ? open : set.hidden;
  set.hidden = !next;
  btn.setAttribute('aria-expanded', next ? 'true' : 'false');
}

// --- The two buttons: the ship answer, then the status ---
// Before the click: "🏁🚀 Abschließen & shippen" (warning fill), "🏁 Nur
// abschließen, nicht shippen" (ghost) and "🔧 Nachbessern" (quiet). While the bridge is disconnected both
// say "· wird zwischengespeichert" — the final report has no status line
// (§ CSS body.viewing-final .panel-status), so the buttons are the one place
// left to say the click will be queued. checkClaudeConnection() calls this
// on every heartbeat for that reason. Never touches a sheet that already
// carries a finalize state.
function closeoutGoButtons() {
  return Array.from(document.querySelectorAll('#closeout-sheet [data-closeout-go]'));
}
function updateCloseoutButton() {
  const sheet = document.getElementById('closeout-sheet');
  if (!sheet || sheet.dataset.finalizeState) return;
  const conn = document.getElementById('connection-status');
  const offline = !!conn && conn.dataset.state === 'disconnected';
  closeoutGoButtons().forEach(btn => {
    btn.hidden = false;
    delete btn.dataset.finalizeState;
    const label = btn.querySelector('[data-closeout-btn-label]');
    const icon = btn.querySelector('[data-closeout-btn-icon]');
    if (label) label.textContent = (btn.dataset.label || '') + (offline ? ' ' + (btn.dataset.labelOffline || '') : '');
    if (icon) icon.textContent = btn.dataset.icon || '';
    if (btn.dataset.titleReady) btn.dataset.tip = btn.dataset.titleReady;
  });
  const done = document.getElementById('closeout-close');
  if (done) done.hidden = true;
}
// After the click the CLICKED button is the status — running → done, or
// stalled — and the other one steps aside. Done collapses both into the one
// "✓ Concept abgeschlossen · schließen" button (it closes the panel). `null`
// clears the state again (restoreCloseoutToReady). The stalled state also
// keeps the one paragraph under the buttons: it carries an instruction.
function setCloseoutButtonState(state, which) {
  const sheet = document.getElementById('closeout-sheet');
  if (!sheet) return;
  sheet.querySelectorAll('.hint[data-finalize-state]').forEach(el => {
    el.hidden = el.dataset.finalizeState !== state;
  });
  if (!state) {
    delete sheet.dataset.finalizeState;
    delete sheet.dataset.go;
    updateCloseoutButton();
    return;
  }
  sheet.dataset.finalizeState = state;
  if (which) sheet.dataset.go = which;
  const go = sheet.dataset.go || 'no';
  const done = document.getElementById('closeout-close');
  if (done) { done.hidden = state !== 'done'; done.disabled = false; }
  const glyph = state === 'running' ? '⏳' : state === 'done' ? '✓' : '⚠';
  const key = 'label' + state.charAt(0).toUpperCase() + state.slice(1);
  closeoutGoButtons().forEach(btn => {
    const mine = btn.dataset.closeoutGo === go;
    btn.hidden = state === 'done' || !mine;
    btn.disabled = true;
    btn.dataset.finalizeState = state;
    btn.removeAttribute('data-tip');
    const label = btn.querySelector('[data-closeout-btn-label]');
    const icon = btn.querySelector('[data-closeout-btn-icon]');
    if (label) label.textContent = btn.dataset[key] || '';
    if (icon) icon.textContent = glyph;
  });
}

// Freezing is not cosmetic: after a submit the payload is fixed, so a live
// choice or a re-enabled button would let the user act on a screen that no
// longer describes what was sent. Scoped to the sheet's own controls.
function setCloseoutFrozen(frozen) {
  const sheet = document.getElementById('closeout-sheet');
  if (!sheet) return;
  sheet.dataset.frozen = frozen ? 'true' : 'false';
  sheet.querySelectorAll('input, button').forEach(el => {
    if (el.id === 'closeout-close') return;
    el.disabled = frozen;
  });
}

// Re-arm after a finalize that did not complete — a blocked ship, a stale
// processed state, a bridge that could not persist. Without this the buttons
// stay disabled forever and the user's only way out is a reload.
function restoreCloseoutToReady() {
  const sheet = document.getElementById('closeout-sheet');
  if (!sheet) return;
  setCloseoutButtonState(null);
  setCloseoutFrozen(false);
  renderCloseout();
}

function renderCloseout() {
  const sheet = document.getElementById('closeout-sheet');
  if (!sheet) return;
  // A closed-out report is done. Claude stamps data-closed on the section
  // before the final /reload (and data-mode on every 🧪/👉 item), so the
  // reloaded page shows the outcome instead of re-arming a sheet whose bridge
  // is already gone: only the 🧪/👉 items with their chosen mode, and the one
  // "✓ Concept abgeschlossen · schließen" button.
  const section = finalReportSection();
  const closed = !!(section && section.hasAttribute('data-closed'));
  sheet.dataset.closed = closed ? 'true' : 'false';
  const decided = renderDecideGroup(closed);
  const todos = renderTodoGroup(closed);
  initBeforeAfter(section);
  const claude = sheet.querySelector('.closeout-claude');
  if (claude) claude.hidden = closed;
  const empty = document.getElementById('closeout-empty');
  if (empty) empty.hidden = closed || decided + todos > 0;
  renderCloseoutPlan();
  renderDisposeLine();
  if (closed) {
    setCloseoutButtonState('done');
    return;
  }
  // Re-apply after a rebuild: fresh rows would otherwise come back live on a
  // frozen sheet.
  if (sheet.dataset.frozen === 'true') setCloseoutFrozen(true);
  updateCloseoutButton();
}

// Called from showIteration() with { reset: true } (a tab switch re-reads the
// report from scratch) and from the change listener without it. "reset" is
// about the row SET only — the choices are kept, by id.
// Vorher / Nachher share one place: the switch shows one image at a time,
// Nachher first. A click on the image opens it full size. One figure, or a
// .fr-flow in its place, needs no switch. Idempotent: refreshCloseout() runs on
// every change.
function initBeforeAfter(section) {
  const ba = section && section.querySelector('.fr-ba');
  if (!ba || ba.dataset.switch) return;
  ba.dataset.switch = 'none';
  ba.querySelectorAll('.fr-shot img').forEach(img => {
    img.addEventListener('click', () => window.open(img.src, '_blank', 'noopener'));
  });
  const figs = Array.from(ba.querySelectorAll('.fr-shot'));
  if (figs.length !== 2) return;
  ba.dataset.switch = 'on';
  const bar = closeoutEl('div', 'fr-ba-switch');
  bar.setAttribute('role', 'group');
  const show = i => {
    figs.forEach((f, j) => { f.hidden = j !== i; });
    bar.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
  };
  [ba.dataset.labelBefore, ba.dataset.labelAfter].forEach((label, i) => {
    const b = closeoutEl('button', '', label || (figs[i].querySelector('figcaption') || {}).textContent || String(i + 1));
    b.type = 'button';
    b.addEventListener('click', () => show(i));
    bar.appendChild(b);
  });
  ba.appendChild(bar);
  show(1);
}

function refreshCloseout(opts) {
  const sheet = document.getElementById('closeout-sheet');
  if (!sheet) return;
  if (opts && opts.reset) {
    sheet.querySelectorAll('[data-closeout-group] [id$="-list"]').forEach(host => { host.dataset.itemKey = ''; });
  }
  renderCloseout();
}

// One submit for the whole close-out. POST /decisions has NO version guard
// (that lives on /reset and /status), so a payload the bridge already fsynced
// but whose response never reached the browser sits in two places at once.
// For an iterate that is harmless; for a finalize it means a second
// `gh issue create` run and a second real release. The id is what lets
// retryPendingSubmission() recognise its own payload on the bridge and drop
// the local copy instead of re-sending it.
function newSubmissionId() {
  return 'sub-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
```


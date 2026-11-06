# Concept templates, part 37 of 49: Shared systems — two-button submit JS (continued 3)

```javascript
async function submitFinalize(shipRun) {
  const active = finalReportSection();
  const sheet = document.getElementById('closeout-sheet');
  if (!active || !sheet) return;
  if (sheet.dataset.frozen === 'true') return;
  // Which button was clicked IS the ship answer — there is no third way to
  // reach this submit, so a release can never be a by-product of it.
  const ship = shipRun === true;

  const issues = collectIssueItems();
  const implement = collectImplementItems();
  const payload = {
    submitted: true,
    action: 'finalize',
    submission_id: newSubmissionId(),
    iteration: active ? active.dataset.iteration : null,
    issues: { create: issues.length > 0, items: issues },
    implement: { run: implement.length > 0, items: implement },
    ship: { run: ship },
    // 🧪 / 👉 with the mode the user chose: skip | guide | self, and for
    // guide which kind — web (auto-guide) | desktop (scripts / takeover
    // help) | inline (written steps in the final message).
    tests: collectTodos('tests'),
    handoffs: collectTodos('handoffs'),
    disposition: collectDisposition(),
    // Own Ctrl + click notes on the report (templates-free-pins.md); `bake`
    // embeds them in the frozen tab like any other round's.
    userPins: (typeof window.documentPinsPayload === 'function') ? window.documentPinsPayload(active) : []
  };

  setCloseoutFrozen(true);
  setCloseoutButtonState('running', ship ? 'yes' : 'no');

  const container = document.getElementById('concept-decisions');
  if (container) container.textContent = JSON.stringify(payload);
  document.body.classList.add('concept-submitted', 'content-dimmed');
  showContentDimmer();
  // Same submit-state bookkeeping submitWithAction does. Without it
  // pollProcessedState() returns at its first line, so a finalize gets no
  // `_picked_up_at` progress and — worse — no PROCESSED_SAFETY_MS recovery:
  // a Claude that dies mid-finalize would leave the sheet under a spinner.
  _submittedAt = Date.now();
  _submittedReloadCounter = _bootReloadCounter;
  _submittedAction = 'finalize';

  // A finalize can ship. "The request did not throw" is not good enough here —
  // require the bridge's durable ack, exactly as submitWithAction does.
  let durable = false;
  let transportFailed = false;
  try {
    const res = await fetch('/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = res.ok ? await res.json().catch(() => ({})) : {};
    durable = res.ok && body.durable !== false;
  } catch (e) {
    transportFailed = true;
  }

  if (!durable) {
    _guardedSetItem(STORAGE_KEY + '-pending', JSON.stringify(payload));
    if (transportFailed) {
      // Offline / bridge down — retryPendingSubmission() delivers it on
      // reconnect, so leave the sent state up and just explain the delay.
      if (typeof showSubmitWarning === 'function') {
        showSubmitWarning('{{panel.submit_queued_offline}}');
      }
    } else {
      // The bridge answered but could not persist. Nothing retries that on its
      // own, so hand the sheet back rather than leave a "sent" state standing
      // over a payload that never landed.
      restoreCloseoutToReady();
      document.body.classList.remove('concept-submitted', 'content-dimmed');
      hideContentDimmer();
      _submittedAt = 0;
      _submittedReloadCounter = null;
      _submittedAction = null;
      if (typeof showSubmitWarning === 'function') {
        showSubmitWarning('{{panel.submit_not_durable}}');
      }
    }
  }
}

// "🔧 Nachbessern": the result does not fit yet. The user's notes on the report
// (💬 dock, Ctrl + click pins) go to Claude as one `refine` submission; Claude
// builds them and rewrites this report in place, so the sheet comes back armed
// (step5-finalize.md § Nachbessern). It never ships and never closes anything.
// Without a note there is nothing to act on: the dock opens instead.
async function submitRefine() {
  const active = finalReportSection();
  const sheet = document.getElementById('closeout-sheet');
  if (!active || !sheet || sheet.dataset.frozen === 'true') return;
  const data = typeof collectDecisions === 'function' ? collectDecisions('refine') : {};
  const pins = (typeof window.documentPinsPayload === 'function') ? window.documentPinsPayload(active) : [];
  const c = data.comments || {};
  const hasNote = !!((c.general && c.general.text) || (c.items && c.items.length) || pins.length);
  if (!hasNote) {
    document.querySelector('.feedback-fab')?.click();
    if (typeof showSubmitWarning === 'function') showSubmitWarning('{{final.refine_empty}}');
    return;
  }
  const payload = Object.assign({}, data, {
    submitted: true,
    action: 'refine',
    submission_id: newSubmissionId(),
    iteration: active.dataset.iteration,
    userPins: pins
  });
  setCloseoutFrozen(true);
  setCloseoutButtonState('running', 'fix');
  document.getElementById('concept-decisions')?.replaceChildren(document.createTextNode(JSON.stringify(payload)));
  document.body.classList.add('concept-submitted', 'content-dimmed');
  showContentDimmer();
  _submittedAt = Date.now();
  _submittedReloadCounter = _bootReloadCounter;
  _submittedAction = 'refine';
  let durable = false;
  let transportFailed = false;
  try {
    const res = await fetch('/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = res.ok ? await res.json().catch(() => ({})) : {};
    durable = res.ok && body.durable !== false;
  } catch (e) {
    transportFailed = true;
  }
  if (durable) return;
  _guardedSetItem(STORAGE_KEY + '-pending', JSON.stringify(payload));
  if (transportFailed) {
    if (typeof showSubmitWarning === 'function') showSubmitWarning('{{panel.submit_queued_offline}}');
    return;
  }
  restoreCloseoutToReady();
  document.body.classList.remove('concept-submitted', 'content-dimmed');
  hideContentDimmer();
  _submittedAt = 0;
  _submittedReloadCounter = null;
  _submittedAction = null;
  if (typeof showSubmitWarning === 'function') showSubmitWarning('{{panel.submit_not_durable}}');
}

// A finalize takes minutes — issues, follow-ups built by agents, a release.
// If the tab is reloaded while it runs, the sheet would come back fully
// re-armed, and a second click would carry a NEW submission_id that the
// replay guard cannot recognise as a duplicate: a second `gh issue create`
// run and a second real release. So ask the bridge what is in flight before
// arming anything.
async function restoreInFlightCloseout() {
  const sheet = document.getElementById('closeout-sheet');
  if (!sheet || !finalReportSection()) return;
  try {
    const res = await fetch('/decisions', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    // A reload between /status closed and /shutdown (#932), or after a blocked ship.
    if (data && (data._phase === 'closed' || data._phase === 'ship-blocked')) {
      noteCloseoutPhase(data);
      if (data._phase === 'closed') return;
    }
    // Processed means `submitted: false` — /reset replaces the payload. The
    // `_processed_at` stamp is NOT that signal: the bridge keeps the stamp of
    // the LAST /reset across new submissions.
    if (!data || data.submitted !== true || (data.action !== 'finalize' && data.action !== 'refine')) return;
    // A payload that names another round is not this sheet's (older pages
    // sent none — kept as before).
    const live = finalReportSection();
    if (data.iteration != null && String(data.iteration) !== String(live.dataset.iteration)) return;
    setCloseoutFrozen(true);
    setCloseoutButtonState('running', data.action === 'refine' ? 'fix' : (data.ship && data.ship.run ? 'yes' : 'no'));
    // Same veil submitFinalize() put up — a reload must not lift it.
    document.body.classList.add('concept-submitted', 'content-dimmed');
    showContentDimmer();
    _submittedAt = Date.now();
    _submittedReloadCounter = _bootReloadCounter;
    _submittedAction = data.action;
    if (typeof renderPanelStatus === 'function') renderPanelStatus();
  } catch (e) { /* bridge unreachable — leave the sheet as the DOM has it */ }
}

// The safety net (pollProcessedState → restorePanelToReady) must NOT re-arm a
// finalize. It was delivered durably; Claude either finishes it and rewrites
// this page, or reports a blocker and sends /reload. Re-arming here would put
// live buttons on a page whose file may already be deleted (the default
// disposition deletes it and deliberately sends no /reload) and whose bridge
// is shutting down.
function markCloseoutStalled() {
  const sheet = document.getElementById('closeout-sheet');
  if (!sheet) return;
  setCloseoutFrozen(true);
  setCloseoutButtonState('stalled');
}

// #932: the finalize is over. Claude POSTs /status {"phase":"closed"} as the
// close-out's last bridge call (after /reset, before /shutdown — every
// disposition, discard included). The poll sees it and the sheet shows its
// done state, which the open tab keeps after the bridge is gone — it says
// "abgeschlossen" instead of a spinning step or a reconnect warning. Nothing
// is stored: the bridge serves this page, so there is no reload after it.
function markCloseoutDone() {
  const sheet = document.getElementById('closeout-sheet');
  if (!sheet || sheet.dataset.finalizeState === 'done') return;
  setCloseoutFrozen(true);
  setCloseoutButtonState('done');
  document.body.classList.remove('concept-submitted', 'content-dimmed');
  if (typeof hideContentDimmer === 'function') hideContentDimmer();
  // Stops the PROCESSED_SAFETY_MS net: a closed finalize is never "stalled".
  _submittedAt = 0;
  _submittedReloadCounter = null;
  _submittedAction = null;
  document.body.classList.add('concept-closed');
  if (typeof renderPanelStatus === 'function') renderPanelStatus();
}
function noteCloseoutPhase(data) {
  if (!data) return;
  if (data._phase === 'closed') {
    markCloseoutDone();
    showFinished(data._finished || { state: 'closed' });
    // Tells Claude the tab has the result, so the bridge may stop now.
    fetch('/closed-ack', { method: 'POST' }).catch(() => {});
  } else if (data._phase === 'ship-blocked') {
    showFinished(data._finished || { state: 'blocked' });
  }
}

// --- Fertig-Seite (§ Final Report Panel → Fertig-Seite) ---
// The result comes from Claude (`/status` `finished`), so the page never
// concludes success from a silent bridge. It only renders; every text arrives
// as data and goes through textContent. A real link is a link; what the
// completion card offers as a button needs the chat, so it is a labelled hint.
const FIN_COPY = {
  shipped: { h: '{{final.fin_shipped}}', d: 'M29 49l13 13 25-27' },
  closed:  { h: '{{final.fin_closed}}',  d: 'M29 49l13 13 25-27' },
  partial: { h: '{{final.fin_partial}}', d: 'M48 26v28M48 68v2' },
  blocked: { h: '{{final.fin_blocked}}', d: 'M30 48h36', s: '{{final.fin_blocked_sub}}' },
  lost:    { h: '{{final.fin_lost}}',    d: 'M30 48h36', s: '{{final.fin_lost_sub}}' }
};
let _finDismissed = '';
function finList(cls, items, build) {
  const ul = closeoutEl('ul', cls);
  items.forEach(it => ul.appendChild(build(it)));
  return ul;
}
function showFinished(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const state = FIN_COPY[f.state] ? f.state : 'closed';
  if (_finDismissed === state) return;
  const sig = JSON.stringify(f);
  let root = document.querySelector('.fin');
  if (root && root.dataset.sig === sig) return;
  if (root) root.remove();
  const copy = FIN_COPY[state];
  root = closeoutEl('div', 'fin');
  root.dataset.fin = state;
  root.dataset.sig = sig;
  const inner = closeoutEl('div', 'fin-in');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'fin-ring');
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', '48'); circle.setAttribute('cy', '48'); circle.setAttribute('r', '44');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('pathLength', '1');
  path.setAttribute('d', copy.d);
  svg.append(circle, path);
  inner.appendChild(svg);
  const h = closeoutEl('h1', 'fin-h', String(f.headline || copy.h));
  h.tabIndex = -1;
  inner.appendChild(h);
  const line = String(f.sub || f.reason || copy.s || '');
  if (line) inner.appendChild(closeoutEl('p', 'fin-s', line));
  const texts = (v) => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : []);
  const misses = texts(f.misses);
  if (misses.length) {
    const shown = misses.slice(0, 3).map(m => '{{final.fin_miss}}: ' + m);
    if (misses.length > 3) shown.push('+' + (misses.length - 3));
    inner.appendChild(finList('fin-misses', shown, t => closeoutEl('li', '', t)));
  }
  const links = (Array.isArray(f.links) ? f.links : []).filter(l => l && /^https?:\/\//.test(String(l.href)) && l.label);
  if (links.length) {
    inner.appendChild(finList('fin-links', links, l => {
      const li = closeoutEl('li');
      const a = closeoutEl('a', '', String(l.label));
      a.href = String(l.href);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.appendChild(a);
      return li;
    }));
  }
  const left = texts(f.left);
  if (left.length) {
    inner.appendChild(closeoutEl('p', 'fin-l', '{{final.fin_left}}'));
    inner.appendChild(finList('fin-left', left.slice(0, 3), t => closeoutEl('li', '', t)));
  }
  const next = texts(f.next);
  if (next.length) {
    inner.appendChild(closeoutEl('p', 'fin-l', '{{final.fin_next}}'));
    inner.appendChild(finList('fin-next', next, t => closeoutEl('li', '', t)));
  }
  if (state === 'blocked' || state === 'lost') {
    const back = closeoutEl('button', 'fin-back', '{{final.fin_back}}');
    back.type = 'button';
    back.addEventListener('click', () => {
      _finDismissed = state;
      root.remove();
      document.body.classList.remove('fin-on');
    });
    inner.appendChild(back);
  } else {
    inner.appendChild(closeoutEl('p', 'fin-n', (next.length || left.length) ? '{{final.fin_tab}}' : '{{final.fin_nothing}}'));
  }
  root.appendChild(inner);
  document.body.appendChild(root);
  document.body.classList.add('fin-on');
  h.focus({ preventScroll: true });
}
// A finalize whose bridge went away without a result: never green, never a
// spinner forever. Connection down for a minute → the neutral "look in the
// chat" state; a result that still arrives replaces it.
let _finLostTicks = 0;
function watchFinalizeLost() {
  const conn = document.getElementById('connection-status');
  const running = _submittedAction === 'finalize' && !!_submittedAt;
  _finLostTicks = running && conn && conn.dataset.state === 'disconnected' ? _finLostTicks + 1 : 0;
  if (_finLostTicks >= 4) showFinished({ state: 'lost' });
}

// No "Runden ansehen" link on the sheet: earlier rounds are one click away
// through the panel head's 🕘 rounds chip.

// The disposition radios and moveTo only re-render the 🧹 line. A frozen sheet
// describes a payload already on its way — nothing on screen may re-render
// against newer input.
document.addEventListener('change', e => {
  const t = e.target;
  if (!t || !t.matches) return;
  if (document.getElementById('closeout-sheet')?.dataset.frozen === 'true') return;
  if (t.matches('input[name="dispose-mode"]')) renderDisposeLine();
});
document.addEventListener('input', e => {
  if (e.target && e.target.id === 'dispose-move-to') renderDisposeLine();
});
// One delegated click listener for the whole sheet — the rows are rebuilt
// per item set, the listener never is.
function closeoutSheetClick(e) {
  const sheet = document.getElementById('closeout-sheet');
  if (!sheet || !e.target.closest) return;
  const go = e.target.closest('[data-closeout-go]');
  if (go) {
    if (sheet.dataset.frozen === 'true' || sheet.dataset.finalizeState) return;
    if (go.dataset.closeoutGo === 'fix') submitRefine();
    else submitFinalize(go.dataset.closeoutGo === 'yes');
    return;
  }
  if (e.target.closest('#closeout-close')) { window.closePanel?.(); return; }
  if (sheet.dataset.frozen === 'true') return;
  const pick = (attr) => e.target.closest('[data-' + attr + ']');
  let hit;
  if ((hit = pick('route-cycle'))) { cycleRoute(hit.dataset.routeCycle); return; }
  if ((hit = pick('route-jump'))) { jumpToFund(hit.dataset.routeJump); return; }
  if ((hit = pick('todo-guide'))) { toggleTodoGuide(hit.dataset.todoGuide); return; }
  if ((hit = pick('todo-drop'))) { toggleTodoDrop(hit.dataset.todoDrop); return; }
  if (e.target.closest('#closeout-decide-more')) {
    _decideExpanded = true;
    syncDecideRows();
    document.querySelectorAll('#closeout-decide-list [data-route-row] [data-route-pill]')[CLOSEOUT_GROUP_MAX]?.focus();
    return;
  }
  if (e.target.closest('#closeout-dispose-edit')) toggleDisposeEdit();
}
// Wired on DOM-ready, not at parse time: this block is copied verbatim into
// generated pages, and one whose script ends up before the markup would
// otherwise get a rendered sheet whose buttons are inert — no console error,
// no request, nothing to see.
function wireCloseout() {
  const sheet = document.getElementById('closeout-sheet');
  sheet?.addEventListener('click', closeoutSheetClick);
  refreshCloseout({ reset: true });
  restoreInFlightCloseout();
  // A kept page reloaded after its close-out: Claude stamped the result on it.
  const done = finalReportSection();
  if (done && done.hasAttribute('data-closed')) {
    let f = { state: 'closed' };
    try { f = JSON.parse(done.dataset.finished || '') || f; } catch (e) { /* keep the neutral default */ }
    showFinished(f);
  }
  setInterval(watchFinalizeLost, 15000);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireCloseout);
} else {
  wireCloseout();
}

// --- Offline Submit Queue ---
// Runs on EVERY connected heartbeat — also while the submitted panel is up,
// because that is exactly when an offline submit sits queued. So it must be
// idempotent: one retry at a time (a slow POST outlives the 5 s heartbeat),
// and never alongside submitWithAction()'s own POST of the same payload.
let _pendingRetryInFlight = false;
async function retryPendingSubmission() {
  if (_pendingRetryInFlight || _submitInFlight) return;
  const pendingKey = STORAGE_KEY + '-pending';
  const pending = localStorage.getItem(pendingKey);
  if (!pending) return;
  _pendingRetryInFlight = true;
  try { await _deliverPending(pendingKey, pending); }
  finally { _pendingRetryInFlight = false; }
  // Images that never made it up get another attempt on the same trigger.
  if (typeof restoreAttachments === 'function') restoreAttachments();
}
// A bridge that accepts the connection and never answers must not hold the
// retry forever: _pendingRetryInFlight is released only when this settles, so
// every later heartbeat would skip the queued payload until a reload. One
// deadline covers the whole attempt, body reads included.
const PENDING_RETRY_TIMEOUT_MS = 15000;
async function _deliverPending(pendingKey, pending) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), PENDING_RETRY_TIMEOUT_MS) : null;
  const signal = ctl ? ctl.signal : undefined;
  try {
    // Did this exact payload already land? `fetch` can throw after the bridge
    // has fsynced (tab closed, Wi-Fi drop mid-response), which queues a payload
    // that is already being processed. Re-POSTing a finalize that way runs its
    // side effects — issue creation, a real release, file deletion — a second
    // time, and an iterate/implement round twice. Every payload carries a
    // submission_id (submitWithAction, submitFinalize); only a payload from a
    // page generated before that keeps the old unconditional retry.
    try {
      const id = JSON.parse(pending).submission_id;
      if (id) {
        const cur = await fetch('/decisions', { cache: 'no-store', signal });
        const seen = cur.ok ? await cur.json().catch(() => ({})) : {};
        if (seen.submission_id === id) { _pendingDelivered(pendingKey); return; }
      }
    } catch (e) { /* unparseable or bridge unreachable — fall through and retry */ }
    const res = await fetch('/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: pending,
      signal
    });
    const body = res.ok ? await res.json().catch(() => ({})) : {};
    // Drop the local copy ONLY once the bridge confirms it reached disk.
    // `res.ok` alone is not that confirmation — see submitWithAction — and
    // neither is a body the deadline cut off.
    if (res.ok && body.durable !== false && !(signal && signal.aborted)) _pendingDelivered(pendingKey);
  } catch (e) { /* still offline, or the deadline hit */ }
  finally { if (timer) clearTimeout(timer); }
}
// The queued round reached the bridge: drop the local copy, retire the
// "bridge unreachable, will retry" note (only the attachments note can still
// hold), and veil the round again — a reload while it sat in the queue came
// back unveiled, because the bridge had nothing yet (restoreInFlightRound
// does nothing while the round is already shown as sent).
function _pendingDelivered(pendingKey) {
  localStorage.removeItem(pendingKey);
  if (typeof clearSubmitWarning === 'function') clearSubmitWarning();
  if (typeof unsyncedAttachmentCount === 'function' && unsyncedAttachmentCount() > 0
      && typeof showSubmitWarning === 'function') showSubmitWarning('{{panel.attachments_not_synced}}');
  if (typeof restoreInFlightRound === 'function') restoreInFlightRound();
}
```

Claude-side: on receiving the payload, branch on `action`:
- `iterate` → Step 5b iterate branch: summarize + append next iteration only
- `implement` → Step 5b implement branch: actually write code/files, then
  append the final-report section (frozen "implementiert" record)
- `finalize` → Step 5b finalize branch: run the selected close-out parts in a
  FIXED order — issues (`gh issue create` behind the user-value gate) →
  implement (the follow-ups routed to "jetzt umsetzen", built through the
  devops role agents) → ship (full `/do-ship` pipeline) → Step 6 cleanup with the
  bundled disposition
- `create-issues` / `ship` / `dispose-concept` → **legacy**, still accepted:
  pages generated before the sheet send these one at a time. Each maps onto
  the matching part of the finalize branch (see SKILL.md § Legacy final-report
  actions); never emit them from newly generated pages


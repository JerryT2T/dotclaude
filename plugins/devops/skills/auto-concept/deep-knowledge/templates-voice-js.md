# Concept templates, part 49 of 49: Shared systems — voice input (mic buttons + notes voice mode)

## Voice input

Every text field a user can comment in carries a 🎤 button next to its 📎, and the notes dock has an opt-in **voice mode** (the 🎤 toggle, first button of the dock header group, left of fullscreen). Both ride ONE `SpeechRecognition` instance (`webkitSpeechRecognition` where that is the name), `continuous` + `interimResults`, `lang` from `<html lang>`.

- **Field mic** (`.voice-btn`): click → speak → the text lands at the cursor of THAT field, nothing else is touched (interim words appear live and are replaced by the final ones); click again or **Enter** ends the dictation and keeps the text. A real `input` event follows every insert, so the draft persistence saves it like typing.
- **Voice mode** (`#voice-mode-toggle`): opt-in, persisted per page (`concept-voice-mode-<slug>`). While on, everything said is appended to the first visible note of the dock — at the cursor if the user has a dock field focused — whether or not the dock is open. The 💬 FAB blinks (`data-voice="listening"`) and turns into a ✓ for a moment when text landed (`data-voice="done"`).
- **Page switch**: a burst of speech belongs to the page it started on. Only after `VOICE_PAUSE_MS` (2 s) of silence does the next speech bind to the page that is on screen then.
- **Robustness**: auto-restart on `onend` with backoff; text without a writable target waits in a queue instead of being dropped; no API / denied / no microphone → every mic button turns `aria-disabled` with a `data-tip` that says why (never a native `title`); a restored opt-in that the browser refuses without a click quietly switches itself off.
- No hotkey: voice is not a navigation / primary-action element. Touch: the mic is a plain button (no hover, right-click or shortcut path); on coarse pointers the field is not focused, so no soft keyboard pops up.

```javascript
// --- Voice input (all templates) ---
const VOICE_PAUSE_MS = 2000;
const VOICE_DONE_MS = 1600;

/**
 * The engine, built on an injected environment so the tests can drive it with
 * a fake recognizer and fake timers.
 * env: { win, doc, Recognition, storage, storageKey, timers:{set,clear}, lang }
 */
function createConceptVoice(env) {
  const win = env.win, doc = env.doc;
  const Rec = env.Recognition || null;
  const T = env.timers || { set: (f, ms) => win.setTimeout(f, ms), clear: id => win.clearTimeout(id) };
  const TIP = {
    mic_start: '{{voice.mic_start}}', mic_stop: '{{voice.mic_stop}}',
    mode_on: '{{voice.mode_on}}', mode_off: '{{voice.mode_off}}',
    unsupported: '{{voice.unsupported}}', denied: '{{voice.denied}}',
    no_mic: '{{voice.no_mic}}', unavailable: '{{voice.unavailable}}',
  };
  const st = {
    blocked: Rec ? '' : 'unsupported',
    globalOn: false, fs: null, tail: null, gins: null,
    rec: null, running: false, fails: 0, netFails: 0, gesture: false,
    restartT: 0, pauseT: 0, doneT: 0, tailT: 0, pendT: 0, pendTries: 0,
    pending: [], buttons: new Set(), lastRange: new WeakMap(),
  };

  // ---- field helpers -------------------------------------------------------
  const isCE = f => !!f && (f.isContentEditable || f.getAttribute('contenteditable') === 'true');
  const isTextField = f => !!f && !isCE(f) && (f.tagName === 'TEXTAREA' || (f.tagName === 'INPUT' && /^(text|)$/.test(f.getAttribute('type') || '')));
  const dockEl = () => doc.getElementById('feedback-dock');
  const hiddenWithin = (el, stop) => {
    for (let n = el; n && n !== stop; n = n.parentElement) {
      if (n.hidden) return true;
      const cs = win.getComputedStyle ? win.getComputedStyle(n) : null;
      if (cs && cs.display === 'none') return true;
    }
    return false;
  };
  /** First writable note of the page that is on screen: the dock's first visible textarea. */
  function firstDockNote() {
    const dock = dockEl();
    if (!dock) return null;
    return [...dock.querySelectorAll('textarea')].find(t =>
      !t.readOnly && !t.disabled && !t.dataset.engineStore && !hiddenWithin(t, dock)) || null;
  }
  function fieldFor(slotKey) {
    const k = win.CSS && win.CSS.escape ? win.CSS.escape(slotKey) : slotKey;
    return doc.querySelector('textarea[data-comment="' + k + '"], textarea#' + k + ', input[data-comment="' + k + '"]');
  }
  const caretOf = f => {
    const v = f.value || '';
    const p = typeof f.selectionEnd === 'number' ? f.selectionEnd : v.length;
    return Math.max(0, Math.min(p, v.length));
  };
  const needsLead = (v, pos, text) => pos > 0 && !/\s/.test(v.charAt(pos - 1)) && !/^[\s.,;:!?)\]]/.test(text);
  function writeRange(f, start, end, text) {
    if (typeof f.setRangeText === 'function') f.setRangeText(text, start, end, 'end');
    else f.value = f.value.slice(0, start) + text + f.value.slice(end);
    try { f.setSelectionRange(start + text.length, start + text.length); } catch (e) { /* not selectable */ }
    f.dispatchEvent(new win.Event('input', { bubbles: true }));
  }

  /**
   * Puts `finalText` (kept) and `interimText` (replaced by the next event) at
   * the insertion point of `ins`; returns whether something was written.
   */
  function place(ins, finalText, interimText) {
    const f = ins.field;
    if (!f || !f.isConnected) return false;
    if (isCE(f)) return finalText ? insertCE(f, finalText) : true;
    let v = f.value;
    // The user typed into the interim region: stop tracking it, keep every word.
    if (ins.len && v.substr(ins.start, ins.len) !== ins.shown) { ins.start = caretOf(f); ins.len = 0; ins.shown = ''; }
    finalText = (finalText || '').trim();
    interimText = (interimText || '').trim();
    if (!finalText && !interimText && !ins.len) return true;
    const lead = needsLead(v, ins.start, finalText || interimText) ? ' ' : '';
    let full = lead + finalText + (finalText && interimText ? ' ' : '') + interimText;
    let keep = interimText ? lead.length + finalText.length + (finalText ? 1 : 0) : full.length;
    if (!interimText && finalText) {
      const next = v.charAt(ins.start + ins.len);
      if (next && !/[\s.,;:!?)\]]/.test(next)) { full += ' '; keep = full.length; }
    }
    if (!finalText && !interimText) { full = ''; keep = 0; }
    writeRange(f, ins.start, ins.start + ins.len, full);
    ins.start += keep;
    ins.len = full.length - keep;
    ins.shown = full.slice(keep);
    return true;
  }
  function insertCE(f, text) {
    const sel = win.getSelection ? win.getSelection() : null;
    let range = null;
    if (sel && sel.rangeCount && f.contains(sel.getRangeAt(0).startContainer)) range = sel.getRangeAt(0);
    if (!range) range = st.lastRange.get(f) || null;
    if (!range) { range = doc.createRange(); range.selectNodeContents(f); range.collapse(false); }
    const before = (() => {
      try { const r = range.cloneRange(); r.selectNodeContents(f); r.setEnd(range.startContainer, range.startOffset); return r.toString(); } catch (e) { return ''; }
    })();
    const t = (before && !/\s$/.test(before) ? ' ' : '') + text.trim();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    if (typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, t)) return true;
    const node = doc.createTextNode(t);
    range.collapse(false);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    f.dispatchEvent(new win.Event('input', { bubbles: true }));
    return true;
  }

  // ---- global-mode target --------------------------------------------------
  function bindGlobal() {
    const dock = dockEl();
    const ae = doc.activeElement;
    let f = null, start = 0;
    if (dock && ae && dock.contains(ae) && isTextField(ae) && !ae.readOnly && !hiddenWithin(ae, dock)) { f = ae; start = caretOf(ae); }
    else { f = firstDockNote(); start = f ? f.value.length : 0; }   // append at the end
    return f ? { field: f, start, len: 0, shown: '' } : null;
  }

  // ---- UI state ------------------------------------------------------------
  const fab = () => doc.getElementById('feedback-toggle');
  const modeBtn = () => doc.getElementById('voice-mode-toggle');
  function paint() {
    const fb = fab();
    if (fb) {
      if (st.doneT) fb.dataset.voice = 'done';
      else if (st.globalOn && !st.blocked) fb.dataset.voice = 'listening';
      else fb.removeAttribute('data-voice');
    }
    const mb = modeBtn();
    if (mb) {
      const dead = !!st.blocked;
      mb.setAttribute('aria-pressed', String(st.globalOn && !dead));
      mb.setAttribute('aria-disabled', String(dead));
      mb.dataset.tip = dead ? TIP[st.blocked] : (st.globalOn ? TIP.mode_on : TIP.mode_off);
      mb.setAttribute('aria-label', mb.dataset.tip);
    }
    st.buttons.forEach(b => {
      const on = !!st.fs && st.fs.btn === b;
      b.classList.toggle('is-listening', on);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-disabled', String(!!st.blocked));
      b.dataset.tip = st.blocked ? TIP[st.blocked] : (on ? TIP.mic_stop : TIP.mic_start);
      b.setAttribute('aria-label', b.dataset.tip);
    });
  }
  function flashDone() {
    if (!st.globalOn) return;
    T.clear(st.doneT); st.doneT = T.set(() => { st.doneT = 0; paint(); }, VOICE_DONE_MS);
    paint();
  }

  // ---- recognizer lifecycle ------------------------------------------------
  const wanted = () => !st.blocked && (!!st.fs || st.globalOn);
  function langOf() {
    if (env.lang) return env.lang;
    const l = String((doc.documentElement && doc.documentElement.lang) || 'en');
    return { de: 'de-DE', en: 'en-US' }[l.slice(0, 2).toLowerCase()] || l;
  }
  function block(reason) {
    st.blocked = reason;
    st.globalOn = false; st.fs = null; st.gins = null;
    try { env.storage && env.storage.setItem(env.storageKey, '0'); } catch (e) { /* private mode */ }
    reconcile();
    paint();
  }
  function startRec() {
    if (st.rec || !wanted()) return;
    let r;
    try { r = new Rec(); } catch (e) { block('unsupported'); return; }
    st.rec = r;
    r.continuous = true; r.interimResults = true; r.maxAlternatives = 1; r.lang = langOf();
    r.onstart = () => { st.running = true; };
    r.onresult = onResult;
    r.onerror = ev => {
      const code = ev && ev.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        // A restored opt-in the browser will not start without a click is not a denial.
        if (!st.gesture) { st.globalOn = false; try { env.storage && env.storage.setItem(env.storageKey, '0'); } catch (e) { /* ignore */ } paint(); return; }
        block('denied');
      } else if (code === 'audio-capture') block('no_mic');
      else if (code === 'network') { if (++st.netFails >= 5) block('unavailable'); }
    };
    r.onend = () => {
      st.running = false; st.rec = null;
      T.clear(st.tailT); st.tail = null;
      if (!wanted()) return;
      st.fails++;
      const delay = Math.min(250 * Math.pow(2, Math.min(st.fails - 1, 5)), 5000);
      T.clear(st.restartT);
      st.restartT = T.set(() => { st.restartT = 0; startRec(); }, delay);
    };
    try { r.start(); } catch (e) {
      st.rec = null;
      if (!e || e.name !== 'InvalidStateError') { st.restartT = T.set(() => { st.restartT = 0; startRec(); }, 1000); }
    }
  }
  function reconcile() {
    if (wanted()) { if (!st.rec) startRec(); return; }
    T.clear(st.restartT); st.restartT = 0;
    if (st.rec) { const r = st.rec; try { r.stop(); } catch (e) { /* already stopped */ } }
  }

  // ---- results ---------------------------------------------------------------
  function onSpeechActivity() {
    st.fails = 0; st.netFails = 0;
    T.clear(st.pauseT);
    // A pause ends the burst: the next speech binds to whichever page is on screen then.
    st.pauseT = T.set(() => { st.pauseT = 0; st.gins = null; }, VOICE_PAUSE_MS);
  }
  function onResult(ev) {
    let fin = '', intr = '';
    for (let i = ev.resultIndex || 0; i < ev.results.length; i++) {
      const r = ev.results[i];
      const t = r && r[0] ? r[0].transcript : '';
      if (r.isFinal) fin += (fin ? ' ' : '') + t.trim(); else intr += t;
    }
    if (!fin && !intr.trim()) return;
    deliver(fin, intr);
  }
  function deliver(fin, intr) {
    onSpeechActivity();
    let ins = null, viaGlobal = false;
    if (st.fs) ins = st.fs.ins;
    else if (st.tail) ins = st.tail.ins;
    else if (st.globalOn) {
      if (!st.gins || !st.gins.field.isConnected) st.gins = bindGlobal();
      ins = st.gins; viaGlobal = true;
    }
    if (!ins) {
      if (fin) { st.pending.push(fin); schedulePending(); }
      return;
    }
    if (viaGlobal && st.pending.length) { fin = st.pending.splice(0).join(' ') + (fin ? ' ' + fin : ''); }
    place(ins, fin, intr);
    if (viaGlobal && fin) flashDone();
  }
  function schedulePending() {
    if (st.pendT || !st.pending.length) return;
    st.pendT = T.set(() => {
      st.pendT = 0;
      if (!st.pending.length) { st.pendTries = 0; return; }
      if (st.globalOn) {
        if (!st.gins || !st.gins.field.isConnected) st.gins = bindGlobal();
        if (st.gins) { place(st.gins, st.pending.splice(0).join(' '), ''); st.pendTries = 0; flashDone(); return; }
      }
      if (++st.pendTries < 40) schedulePending();
    }, 1500);
  }

  // ---- field mic -------------------------------------------------------------
  const coarse = () => !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches);
  function startField(btn, field) {
    if (!field || !field.isConnected || field.readOnly || st.blocked) return;
    if (!coarse() && typeof field.focus === 'function') { try { field.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    st.gesture = true;
    const start = isCE(field) ? 0 : caretOf(field);
    st.fs = { btn, field, ins: { field, start, len: 0, shown: '' } };
    reconcile(); paint();
  }
  function stopField() {
    const fs = st.fs;
    if (!fs) return;
    st.fs = null;
    // Late results of the phrase that was being spoken still belong to this field.
    st.tail = fs; T.clear(st.tailT);
    st.tailT = T.set(() => { st.tail = null; st.tailT = 0; }, 1500);
    fs.ins.len = 0; fs.ins.shown = '';
    reconcile(); paint();
  }
  function wireButton(btn, getField) {
    if (!btn || btn.dataset.voiceWired) return;
    btn.dataset.voiceWired = '1';
    st.buttons.add(btn);
    // The mic must not steal focus (or the caret) from the field it dictates into.
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      if (st.blocked) return;
      if (st.fs && st.fs.btn === btn) { stopField(); return; }
      if (st.fs) stopField();
      startField(btn, typeof getField === 'function' ? getField() : getField);
    });
    paint();
  }

  // ---- opt-in voice mode -------------------------------------------------------
  function setGlobal(on, byGesture) {
    if (on && st.blocked) { paint(); return; }
    st.globalOn = !!on;
    if (byGesture) st.gesture = true;
    try { env.storage && env.storage.setItem(env.storageKey, on ? '1' : '0'); } catch (e) { /* private mode */ }
    if (!on) { st.gins = null; T.clear(st.doneT); st.doneT = 0; st.pending.length = 0; }
    reconcile(); paint();
  }

  // ---- mounting the buttons ------------------------------------------------------
  function micButton(cls) {
    const b = doc.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = '🎤';
    return b;
  }
  /** Every field gets one mic: attach bars (static markup), plain fields, the analysis composer. */
  function scan() {
    doc.querySelectorAll('.attach-bar .voice-btn:not([data-voice-wired])').forEach(b => {
      const key = b.closest('.attach-bar').dataset.attachFor;
      wireButton(b, () => fieldFor(key));
    });
    doc.querySelectorAll('textarea:not([data-attachable]):not([data-engine-store]):not([data-voice-skip]):not([hidden]), input[type="text"]:not([tabindex="-1"]):not([data-voice-skip])').forEach(f => {
      if (f.dataset.voiceMount || f.readOnly || f.closest('[hidden], .an-vh, .an-comp, [data-analysis-store]')) return;
      if (f.classList.contains('map-state')) return;
      f.dataset.voiceMount = '1';
      const b = micButton('voice-btn voice-btn-solo');
      f.insertAdjacentElement('afterend', b);
      wireButton(b, f);
    });
    doc.querySelectorAll('.an-comp').forEach(c => {
      if (c.querySelector('.voice-btn-an')) return;
      const ed = c.querySelector('.an-comp-ed');
      if (!ed) return;
      const b = micButton('an-comp-b voice-btn voice-btn-an');
      const after = c.querySelector('.an-attach') || ed;
      after.insertAdjacentElement('afterend', b);
      wireButton(b, ed);
      if (ed.getAttribute('contenteditable') === 'false') b.setAttribute('aria-disabled', 'true');
    });
    paint();
  }
  let scanT = 0;
  function scheduleScan() { if (scanT) return; scanT = T.set(() => { scanT = 0; scan(); }, 150); }

  // ---- boot ----------------------------------------------------------------------
  function boot() {
    const mb = modeBtn();
    if (mb) mb.addEventListener('click', () => { if (!st.blocked) setGlobal(!st.globalOn, true); });
    // Enter ends a dictation and keeps the text — it must not also send / save / break the line.
    doc.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (!st.fs || e.target !== st.fs.field) return;
      e.preventDefault(); e.stopImmediatePropagation();
      stopField();
    }, true);
    doc.addEventListener('selectionchange', () => {
      const sel = win.getSelection && win.getSelection();
      if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      const host = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      const ce = host && host.closest && host.closest('.an-comp-ed');
      if (ce) st.lastRange.set(ce, r.cloneRange());
    });
    doc.addEventListener('visibilitychange', () => { if (!doc.hidden && wanted() && !st.rec) startRec(); });
    win.addEventListener('pagehide', () => { st.globalOn = false; st.fs = null; if (st.rec) { try { st.rec.abort(); } catch (e) { /* ignore */ } } });
    // The dock and the stages rebuild their fields: new fields get a mic, a rebuilt first note is re-resolved.
    if (win.MutationObserver && doc.body) new win.MutationObserver(scheduleScan).observe(doc.body, { childList: true, subtree: true });
    let saved = '0';
    try { saved = (env.storage && env.storage.getItem(env.storageKey)) || '0'; } catch (e) { /* ignore */ }
    scan();
    if (saved === '1' && !st.blocked) setGlobal(true, false);
    else paint();
  }

  return {
    boot, scan, wireButton, setGlobal, stopField, firstDockNote, insertAt: place,
    toggleGlobal: () => setGlobal(!st.globalOn, true),
    _state: st, _onResult: onResult,
  };
}

(function bootConceptVoice() {
  if (typeof window === 'undefined' || window.conceptVoiceBoot === false) return;
  const slug = location.pathname.split('/').pop().replace('.html', '');
  const start = () => {
    window.conceptVoice = createConceptVoice({
      win: window, doc: document,
      Recognition: window.SpeechRecognition || window.webkitSpeechRecognition || null,
      storage: window.localStorage, storageKey: 'concept-voice-mode-' + slug,
    });
    window.conceptVoice.boot();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
```

```css
/* --- Voice input (all templates) --- */
/* Same look as the 📎 beside it: one button family. */
.voice-btn {
  background: var(--surface-2); border: 1px solid var(--border-color);
  color: var(--text-secondary); border-radius: 6px; cursor: pointer;
  padding: .1rem .35rem; font-size: .85rem; line-height: 1.3;
}
.voice-btn:hover { border-color: var(--accent-color); color: var(--text-primary); }
.voice-btn[aria-disabled="true"] { opacity: .4; cursor: not-allowed; }
.voice-btn.is-listening {
  border-color: var(--danger-color, #f85149); color: var(--text-primary);
  animation: voicePulse 1.2s ease-in-out infinite;
}
.voice-btn-solo { margin-top: .4rem; vertical-align: top; }
.an-att .voice-btn { display: none; }
.an-comp:has(.voice-btn-an) { grid-template-columns: minmax(0, 1fr) auto auto auto; }
.voice-btn-an { padding: 0; font-size: 16px; }
/* In the notes dock the buttons sit inside the field, bottom right: mic left of the 📎. */
.feedback-dock .attach-slot .voice-btn { position: absolute; right: 52px; top: -34px; opacity: .7; }
.feedback-dock .attach-slot .voice-btn:hover, .feedback-dock .attach-slot .voice-btn.is-listening { opacity: 1; }
html .feedback-dock .feedback-section textarea[data-attachable] { padding-right: 5.6rem; }
.voice-mode-btn[aria-pressed="true"] { color: var(--danger-color, #f85149); }
.voice-mode-btn[aria-disabled="true"] { opacity: .4; cursor: not-allowed; }
.voice-mode-btn[aria-pressed="true"]::after {
  content: ""; display: inline-block; width: 6px; height: 6px; margin-left: 3px; vertical-align: super;
  border-radius: 50%; background: currentColor; animation: voiceBlink 1.2s ease-in-out infinite;
}
@keyframes voicePulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--danger-color, #f85149) 45%, transparent); }
  50%      { box-shadow: 0 0 0 5px transparent; }
}
@keyframes voiceBlink { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
/* The collapsed FAB shows that the mic is listening, then that the words arrived. */
@keyframes voiceFab {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--danger-color, #f85149) 70%, transparent), 0 6px 16px rgba(0,0,0,0.4); }
  50%      { box-shadow: 0 0 0 12px transparent, 0 6px 16px rgba(0,0,0,0.4); }
}
.feedback-fab[data-voice="listening"] { animation: voiceFab 1.3s ease-in-out infinite; }
.feedback-fab[data-voice="done"] { background: var(--success-color, #2ea043); transform: scale(1.08); }
/* The check covers the 💬; the FAB's own size and glyph size stay untouched. */
.feedback-fab[data-voice="done"]::before {
  content: "✓"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  border-radius: inherit; background: var(--success-color, #2ea043); color: #fff; font-size: 1.9rem; font-weight: 700;
}
@media (prefers-reduced-motion: reduce) {
  .voice-btn.is-listening, .feedback-fab[data-voice="listening"], .voice-mode-btn[aria-pressed="true"]::after { animation: none; }
  .feedback-fab[data-voice="listening"] { box-shadow: 0 0 0 4px color-mix(in srgb, var(--danger-color, #f85149) 60%, transparent), 0 6px 16px rgba(0,0,0,0.4); }
}
```

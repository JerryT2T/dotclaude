# Concept templates, part 45 of 48: Template: analysis — engine UI JS (palette, chat flow, rail, composer)

## Engine UI — palette, chat flow, rail, composer (JS)

One namespaced block (`window.CONCEPT_VIZ`, `window.conceptAnalysis`); it only
**enhances** the authored markup and only ever writes the named controls of the
contract (`dm-{id}`, `dm-{id}.{opt}`, `-alt`, `-fix`, `-text`, `-none`, `-touched`,
`-issue`, `-epic`, `-hes`, the `data-comment` note). Collect, bake and freeze
therefore need nothing else. UI strings are a small de/en table keyed off
`<html lang>` (no `{{key}}` rows needed).

What the code does, in the order of the file:

1. `CONCEPT_VIZ` — the palette registry (`text kpi bar bars spark donut compare flow`),
   `renderViz(root, size)`; unknown type or bad spec renders `spec.text`.
2. Message builders: `msg()` (devops avatar + bubble), `buildFinding()` (the
   finding message: meta line, tabs 📊 Befund / 🖥 Beispiel when the level ships
   a `[data-example]`, the visual; `spec.hl` pulses once), `setTab()` (the
   pane animates, the messages below fade out and back in).
3. `setup(root)` — one instance per `[data-analysis]`: the stage list
   (briefing, topic pages, decisions, closing), the right rail (Full) /
   progress dots (Lite), the peeks (previous stage above, next below) and the
   persistent composer. A decision stage is three messages — finding,
   question (fixed height), answer block (capped at ≈ 45 % of the viewport) —
   built by `prepDecision()` together with the mode widgets (slider, sortable
   order, inline alt / fix / custom fields). The round's `.iteration-intro`
   moves into the briefing.
4. The composer is THE note field: `storeOf()` maps it onto the open
   stage's `data-comment="{id}-note"` (briefing, topic page and closing get a
   hidden one of their own); max ONE tag (`setTag()`, stored as a leading
   `[tag] `), set by a click on a finding / question / topic page or a closing
   toggle; `sendNote()`: tagged → the note stays, untagged → the next stage
   (not on briefing / closing).
5. Touched tracking: a stage open ≥ 3 s, or any change in it, writes
   `dm-{id}-touched` = `"1"`. Hesitation: `hesEntry()` … `hesFlush()` count dwell
   only while the stage is visible AND the window focused and write
   `dm-{id}-hes`.
6. Keys: Enter / ⇧+Enter, ← → stages, ↑ ↓ options, 1–N options (decision has
   focus), Home / End, ⇧+1–3 topics, N composer, I issue, U first untouched.
   Animation only on the FIRST visit of a stage; `prefers-reduced-motion` → none.

```javascript
(function () {
  'use strict';
  if (window.conceptAnalysis) return;
  const DE = () => String(document.documentElement.lang || 'en').slice(0, 2) === 'de';
  const L = (de, en) => (DE() ? de : en);
  const WJ = String.fromCharCode(0x2060);
  const BS = String.fromCharCode(92);
  const NS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cssEsc = s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => BS + c);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const num = x => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
  const fmt = n => (Math.round(num(n) * 10) / 10).toLocaleString(DE() ? 'de-DE' : 'en-US');
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function btn(cls, text) { const b = h('button', cls, text); b.type = 'button'; return b; }
  // App tooltip (templates-utilities.md): a visible name gets only its keycap.
  function tip(el, text, key) {
    if (key) {
      el.setAttribute('data-tip-key', key);
      el.setAttribute('aria-keyshortcuts', key.replace('⇧+', 'Shift+').replace('Pos1', 'Home').replace('Ende', 'End'));
    }
    if (text) el.setAttribute('data-tip', text);
    else if (key) { el.setAttribute('data-tip', WJ); el.setAttribute('data-tip-key-only', 'true'); }
  }

  /* ================= 1. palette: CONCEPT_VIZ ================= */
  const VIZ = (window.CONCEPT_VIZ = window.CONCEPT_VIZ || {});
  const SEG = ['#79c0ff', '#58a6ff', '#a5d6ff', '#388bfd', '#b6e3ff', '#8cb4ff'];
  const list = (a) => (Array.isArray(a) ? a : []);
  VIZ.text = (el, s) => {
    el.textContent = '';
    el.classList.add('an-vz-text');
    let ul = null;
    String(s.text == null ? '' : s.text).split(/\n+/).filter(l => l.trim()).forEach(line => {
      const m = /^\s*[-•]\s+(.*)$/.exec(line);
      if (m) { if (!ul) { ul = h('ul'); el.appendChild(ul); } ul.appendChild(h('li', '', m[1])); }
      else { ul = null; el.appendChild(h('p', '', line.trim())); }
    });
  };
  VIZ.kpi = (el, s) => {
    el.innerHTML = '<span class="an-kpi"><b class="an-kpi-v">' + esc(s.value) + '</b>'
      + (s.unit ? '<span class="an-kpi-u">' + esc(s.unit) + '</span>' : '')
      + (s.delta ? '<span class="an-kpi-d">' + esc(s.delta) + '</span>' : '')
      + (s.label ? '<span class="an-kpi-l">' + esc(s.label) + '</span>' : '') + '</span>';
  };
  VIZ.bar = (el, s) => {
    const max = num(s.max) || 100, v = num(s.value);
    el.innerHTML = '<div class="an-bar"><div class="an-bar-h"><span>' + esc(s.label || '') + '</span><b>' + esc(fmt(v) + (s.unit ? ' ' + s.unit : '')) + '</b></div>'
      + '<div class="an-bar-t" role="img" aria-label="' + esc(fmt(v) + ' / ' + fmt(max)) + '"><i style="width:' + clamp(v / max * 100, 0, 100) + '%"></i></div></div>';
  };
  VIZ.bars = (el, s, ctx) => {
    const items = list(s.items), top = ctx && ctx.size === 'short' ? 3 : items.length;
    const max = Math.max.apply(null, items.map(i => num(i.value)).concat([1]));
    // spec.hl names the item(s) the question is about: they keep the accent, the rest steps back.
    const hl = [].concat(s.hl || []).map(String);
    el.innerHTML = '<div class="an-bars' + (hl.length ? ' an-hl' : '') + '">' + items.slice(0, top).map(i =>
      '<div' + (hl.indexOf(String(i.label)) >= 0 ? ' class="an-on"' : '') + '><span>' + esc(i.label) + '</span><div class="an-bar-t"><i style="width:' + clamp(num(i.value) / max * 100, 0, 100) + '%"></i></div><b>'
      + esc(fmt(i.value) + (s.unit ? ' ' + s.unit : '')) + '</b></div>').join('') + '</div>';
  };
  VIZ.spark = (el, s, ctx) => {
    const pts = list(s.points).map(num);
    if (pts.length < 2) { VIZ.text(el, { text: s.label || '' }); return; }
    const W = 200, H = 48, lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), span = hi - lo || 1;
    const xy = pts.map((p, i) => [4 + i * (W - 8) / (pts.length - 1), H - 5 - (p - lo) / span * (H - 12)]);
    const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = xy[xy.length - 1];
    el.innerHTML = '<div class="an-spark"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(s.label || '') + '">'
      + '<path d="' + d + ' L' + last[0] + ' ' + H + ' L4 ' + H + ' Z" fill="#79c0ff" opacity=".14"/>'
      + '<path d="' + d + '" fill="none" stroke="#79c0ff" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
      + '<circle cx="' + last[0] + '" cy="' + last[1].toFixed(1) + '" r="3" fill="#79c0ff"/></svg>'
      + (ctx && ctx.size === 'short' ? '' : '<div class="an-spark-l"><span>' + esc(s.label || '') + '</span><span>' + esc(fmt(pts[0]) + ' → ' + fmt(pts[pts.length - 1])) + '</span></div>') + '</div>';
  };
  VIZ.donut = (el, s) => {
    const parts = list(s.parts), total = parts.reduce((a, p) => a + Math.max(0, num(p.value)), 0) || 1;
    let off = 0, arcs = '';
    parts.forEach((p, i) => {
      const pct = Math.max(0, num(p.value)) / total * 100;
      arcs += '<circle cx="21" cy="21" r="15.9155" fill="none" stroke="' + SEG[i % SEG.length] + '" stroke-width="6" stroke-dasharray="' + pct.toFixed(2) + ' ' + (100 - pct).toFixed(2) + '" stroke-dashoffset="' + (25 - off).toFixed(2) + '"/>';
      off += pct;
    });
    el.innerHTML = '<div class="an-donut"><svg viewBox="0 0 42 42" role="img" aria-label="' + esc(parts.map(p => p.label + ' ' + p.value).join(', ')) + '"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="rgba(128,138,150,.25)" stroke-width="6"/>' + arcs + '</svg><ul>'
      + parts.map((p, i) => '<li><i style="background:' + SEG[i % SEG.length] + '"></i>' + esc(p.label) + ' <b>' + Math.round(num(p.value) / total * 100) + ' %</b></li>').join('') + '</ul></div>';
  };
  VIZ.compare = (el, s) => {
    const a = s.before || {}, b = s.after || {}, max = Math.max(num(a.value), num(b.value), 1);
    const delta = num(a.value) ? Math.round((num(b.value) - num(a.value)) / num(a.value) * 100) : 0;
    const row = (x, cls) => '<div class="an-cmp-r ' + cls + '"><span>' + esc(x.label || '') + '</span><div class="an-bar-t"><i style="width:' + clamp(num(x.value) / max * 100, 0, 100) + '%"></i></div><b>' + esc(fmt(x.value) + (s.unit ? ' ' + s.unit : '')) + '</b></div>';
    el.innerHTML = '<div class="an-cmp">' + row(a, 'an-before') + row(b, 'an-after') + '<span class="an-cmp-d">' + (delta > 0 ? '+' : '') + delta + ' %</span></div>';
  };
  VIZ.flow = (el, s) => {
    el.innerHTML = '<div class="an-flow">' + list(s.steps).map((st, i) => (i ? '<i>→</i>' : '') + '<span>' + (st.value != null && st.value !== '' ? '<b>' + esc(st.value) + '</b>' : '') + esc(st.label) + '</span>').join('') + '</div>';
  };
  /** Render every [data-viz] below root once. size = "short" | "long". */
  function renderViz(root, size) {
    (root.matches && root.matches('[data-viz]') ? [root] : []).concat([...root.querySelectorAll('[data-viz]')]).forEach(el => {
      if (el.dataset.vizDone || el.closest('[data-alevel]')) return;   // authored level sources stay raw; the column renders clones
      let spec = null;
      try { spec = JSON.parse(el.getAttribute('data-viz-spec') || 'null'); } catch (e) { spec = null; }
      if (!spec || typeof spec !== 'object') return;          // keep the authored fallback text
      let fn = VIZ[el.getAttribute('data-viz')];
      if (!fn) {
        // Custom type: the author's own markup (inline SVG ...) stays; spec.text only fills an empty element.
        if (el.children.length || el.textContent.trim()) { el.dataset.vizDone = '1'; return; }
        fn = VIZ.text;
      }
      try { fn(el, spec, { size: size || 'long' }); } catch (e) { try { VIZ.text(el, spec); } catch (e2) { /* keep */ } }
      el.dataset.vizDone = '1';
      el.classList.add('an-vz-' + (size || 'long'));
    });
  }

  /* ================= 2. helpers over the contract ================= */
  const instances = [];
  // Strongly different hues; never blue (briefing / closing), never the note purple, never the variant colours, never red / green / orange.
  const TOPIC_COLORS = ['#f28fb8', '#4fd1c5', '#e6d36a', '#e879c9', '#d4e157', '#6fe3e3', '#f0a0e8'];
  const decId = d => d.dataset.decision;
  const ctl = (d, name) => [...d.querySelectorAll('input, textarea, select')].filter(c => (c.name || '') === name);
  const ctl1 = (d, name) => ctl(d, name)[0] || null;
  const optEl = (d, v) => [...d.querySelectorAll('[data-opt]')].find(o => o.getAttribute('data-opt') === v) || null;
  const optLabel = (d, v) => { const o = optEl(d, v); const l = o && o.querySelector('[data-opt-label]'); if (!l) return String(v); const b = l.querySelector('.an-badge'); return (b ? l.textContent.replace(b.textContent, '') : l.textContent).trim(); };
  const optCons = o => { const c = o && o.querySelector('[data-opt-consequence]'); return c ? c.textContent.trim() : ''; };
  const recList = d => String(d.dataset.rec || '').split(/[\s,]+/).filter(Boolean);
  const isTouched = d => { const c = ctl1(d, 'dm-' + decId(d) + '-touched'); return !!c && c.value === '1'; };
  const entryOf = d => (typeof collectModeDecision === 'function' ? collectModeDecision(d) : { id: decId(d), mode: d.dataset.decisionMode, value: '', deviates: false, untouched: !isTouched(d), issue: false });
  function stateOf(inst, d) {
    const e = entryOf(d);
    if (e.issue) return 'iss';
    if (e.untouched) return inst.visited.has(decId(d)) ? 'un' : 'open';
    return e.deviates ? 'dev' : 'ok';
  }
  function stateText(s) {
    return { ok: L('entschieden', 'decided'), dev: L('weicht von der Empfehlung ab', 'differs from the recommendation'), iss: L('Issue', 'issue'), un: L('offen, kurz gesehen', 'open, glanced at'), open: L('offen', 'open') }[s];
  }
  function valueText(d, e) {
    const m = e.mode, v = e.value, unit = d.dataset.unit ? ' ' + d.dataset.unit : '';
    if (e.none) return L('Keine passt', 'None fits') + (e.note ? ': ' + e.note : '');
    if (m === 'multi') return v.length ? v.map(x => optLabel(d, x)).join(', ') : L('nichts gewählt', 'nothing picked');
    if (m === 'yesnoalt') return v.answer === 'alt' ? L('Anders: ', 'Other: ') + (v.alt || '…') : v.answer ? optLabel(d, v.answer) : '–';
    if (m === 'slider') return v == null ? '–' : fmt(v) + unit;
    if (m === 'order') return v.map(x => optLabel(d, x)).join(' → ');
    if (m === 'wording') return v || '–';
    if (m === 'points') { const ks = Object.keys(v || {}).filter(k => v[k]); return ks.length ? ks.map(k => optLabel(d, k) + ' ' + v[k]).join(', ') : '–'; }
    return v ? optLabel(d, v) : '–';
  }
  function recText(d) {
    const m = d.dataset.decisionMode, r = recList(d);
    if (m === 'slider') return r[0] + (d.dataset.unit ? ' ' + d.dataset.unit : '');
    if (m === 'order') return r.map(x => optLabel(d, x)).join(' → ');
    if (m === 'points') return r.map(x => { const k = x.split(':'); return optLabel(d, k[0]) + ' ' + (k[1] || 0); }).join(', ');
    return r.map(x => optLabel(d, x)).join(', ');
  }
  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // A frozen (baked) round is read-only: every control the engine creates is born disabled.
  // Hidden dm-* inputs (state of the engine: -none, -hes, points, order ...) persist through
  // saveState() / restoreState() by name (templates-persistence.md).
  const frozenEl = el => !!(el.closest && el.closest('[data-baked]'));
  function newHidden(d, name, value) {
    const c = h('input');
    c.type = 'hidden'; c.name = name; c.value = value || '';
    if (frozenEl(d)) c.disabled = true;
    return c;
  }
  function setHidden(d, suffix, value) {
    const name = 'dm-' + decId(d) + suffix;
    let c = ctl1(d, name);
    if (!c) { c = newHidden(d, name, ''); d.appendChild(c); }
    if (c.value === value || c.disabled) return false;
    c.value = value;
    fire(c);
    return true;
  }
  /** Touched = open >= 3 s or changed. Idempotent; returns true when it wrote. */
  function markTouched(d) {
    const wrote = setHidden(d, '-touched', '1');
    const inst = instances.find(i => i.root.contains(d));
    if (wrote && inst) refresh(inst);
    return wrote;
  }

  /* ================= 3. messages: finding (Befund / Beispiel), question, answer ================= */
  const MARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6.5 8.5c-2 0-3.5 1.6-3.5 3.5s1.5 3.5 3.5 3.5c3.5 0 7.5-7 11-7 2 0 3.5 1.6 3.5 3.5s-1.5 3.5-3.5 3.5c-3.5 0-7.5-7-11-7z"/></svg>';
  const BLUE = '#79c0ff';
  /** One chat message: the devops avatar (the ∞ glyph, no ring) beside a bubble. */
  function msg(cls) {
    const m = h('div', 'an-msg ' + cls), av = h('div', 'an-av');
    av.innerHTML = MARK;
    tip(av, 'devops');
    m.appendChild(av);
    return m;
  }
  function levelSrc(inst, st, n) {
    if (n === 1) return inst.root.querySelector('[data-alevel="1"]');
    if (n === 2) return st.topic ? [...st.topic.children].find(c => c.getAttribute('data-alevel') === '2') || null : null;
    return st.kind === 'dec' ? st.el.querySelector('[data-alevel="3"]') : null;
  }
  /** The finding a stage rests on, ONE level: briefing -> L1, topic -> L2, decision -> L3 (no L3: the topic's L2, else the overall L1). */
  function findingSrc(inst, st) {
    if (st.kind === 'brief' || st.kind === 'start') return levelSrc(inst, st, 1);
    if (st.kind === 'topic') return levelSrc(inst, st, 2);
    return levelSrc(inst, st, 3) || (st.topic ? levelSrc(inst, st, 2) : null) || levelSrc(inst, st, 1);
  }
  function stageLabel(inst, st) {
    if (st.kind === 'dec') return st.el.dataset.label || decId(st.el);
    if (st.kind === 'topic') return st.group.label;
    if (st.kind === 'brief') return st.el.dataset.navLabel || 'Briefing';
    return L('Abschluss', 'Closing');
  }
  function stageNo(inst, st) { return (st.group ? st.group.decs : inst.decs).indexOf(st) + 1; }
  function metaText(inst, st) {
    const list = st.group ? st.group.decs : inst.decs;
    return (st.group ? st.group.label + ' · ' : '') + L('Frage ', 'Question ') + stageNo(inst, st) + L(' von ', ' of ') + list.length;
  }
  /** Finding message: meta line, tabs Befund / Beispiel (Beispiel only with a [data-example] slot), situation + visual. */
  function buildFinding(inst, st) {
    const d = st.el, src = findingSrc(inst, st);
    const m = msg('an-m-find'), bub = h('div', 'an-bub an-edge');
    m.appendChild(bub);
    bub.appendChild(h('div', 'an-meta', metaText(inst, st)));
    const applies = d.querySelector('[data-applies]');
    if (applies) bub.appendChild(applies);
    const pane = h('div', 'an-pane an-p-find'), sit = d.querySelector('[data-situation]');
    if (sit) pane.appendChild(sit);
    const slot = src && [...src.children].find(c => c.getAttribute('data-slot') === 'long');
    if (slot) {
      const c = slot.cloneNode(true);
      c.querySelectorAll('[data-example], [data-evidence]').forEach(e => e.remove());
      c.querySelectorAll('[data-viz-done]').forEach(e => e.removeAttribute('data-viz-done'));
      while (c.firstChild) pane.appendChild(c.firstChild);
    }
    const ctx = d.querySelector('[data-context]');
    if (ctx) pane.appendChild(ctx);
    renderViz(pane, 'long');
    const ex = src && src.querySelector('[data-example]');
    if (!ex) { bub.appendChild(pane); return m; }
    const tabs = h('div', 'an-tabs'), pe = h('div', 'an-pane an-p-ex');
    tabs.setAttribute('role', 'tablist');
    [['find', '📊', L('Befund', 'Finding'), L('Befund: was die Analyse gemessen hat', 'Finding: what the analysis measured')],
      ['ex', '🖥', L('Beispiel', 'Example'), L('Beispiel: ein konkreter Fall aus der echten Anwendung', 'Example: a concrete case from the real application')]].forEach(t => {
      const b = btn('an-tab' + (t[0] === 'find' ? ' an-on' : ''));
      b.dataset.tab = t[0];
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', t[0] === 'find' ? 'true' : 'false');
      b.append(h('i', '', t[1]), document.createTextNode(t[2]));
      tip(b, t[3]);
      b.addEventListener('click', e => { e.stopPropagation(); setTab(m, t[0]); });
      tabs.appendChild(b);
    });
    const exc = ex.cloneNode(true);
    exc.removeAttribute('data-example'); exc.removeAttribute('hidden');
    exc.querySelectorAll('[data-viz-done]').forEach(e => e.removeAttribute('data-viz-done'));
    while (exc.firstChild) pe.appendChild(exc.firstChild);
    pe.hidden = true;
    renderViz(pe, 'long');
    bub.append(tabs, pane, pe);
    return m;
  }
  /** Switching the tab animates the pane; the messages below briefly fade out and back in. */
  function setTab(m, k) {
    const bub = m.querySelector('.an-bub');
    bub.querySelectorAll('.an-tab').forEach(b => { const on = b.dataset.tab === k; b.classList.toggle('an-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    bub.querySelector('.an-p-find').hidden = k !== 'find';
    bub.querySelector('.an-p-ex').hidden = k !== 'ex';
    const below = [];
    for (let n = m.nextElementSibling; n; n = n.nextElementSibling) below.push(n);
    below.forEach(n => n.classList.add('an-dip'));
    setTimeout(() => below.forEach(n => n.classList.remove('an-dip')), reduced() ? 0 : 220);
    if (k === 'find') pulse(bub);
  }
  /** The highlighted part of a chart (spec.hl) pulses once. */
  function pulse(root) {
    root.querySelectorAll('.an-bars.an-hl .an-on .an-bar-t > i').forEach(i => { i.classList.remove('an-pulse'); void i.offsetWidth; i.classList.add('an-pulse'); });
  }

  /* ================= 4. instance: stages, rail, briefing, composer ================= */
  function setup(root) {
    if (root.__an) return root.__an;
    const lite = root.getAttribute('data-analysis') === 'lite';
    const inst = { root, lite, stages: [], groups: [], idx: 0, timers: [], visited: new Set(), seen: new Set(), decs: [], maxIdx: 0, touchTimer: 0, hes: {}, sharpen: new Map(), tag: '', key: root.id || (root.closest('[data-view]') || root).getAttribute('data-view') || ('analysis' + (instances.length + 1)) };
    root.__an = inst;
    instances.push(inst);
    // A lite round is a question view of the page: it counts as answered once EVERY decision is
    // (touched / issue) - NOT on a click, key or scroll, or paging through it would answer it (the
    // design overview's viewAnswered() asks this hook first).
    if (lite) root.__anAnswered = () => inst.decs.length > 0 && inst.decs.every(st => stateOf(inst, st.el) !== 'open' && stateOf(inst, st.el) !== 'un');
    root.classList.add('an-enh');
    if (lite) root.classList.add('an-lite');
    const nodes = [...root.querySelectorAll('[data-analysis-briefing], [data-topic], [data-decision][data-decision-mode]')]
      .filter(n => n.closest('[data-analysis]') === root);
    let topicIdx = -1;
    nodes.forEach(n => {
      if (n.hasAttribute('data-analysis-briefing')) { inst.stages.push({ kind: 'brief', el: n }); inst.brief = n; return; }
      if (n.hasAttribute('data-topic')) {
        topicIdx++;
        const color = TOPIC_COLORS[topicIdx % TOPIC_COLORS.length];
        n.style.setProperty('--c', color);
        const intro = h('section', 'an-stage an-intro');
        n.insertBefore(intro, n.firstChild);
        const g = { topic: n, label: n.dataset.navLabel || n.id, color, intro, decs: [], idx: topicIdx };
        inst.groups.push(g);
        inst.stages.push({ kind: 'topic', el: intro, topic: n, group: g });
        return;
      }
      const topic = n.parentElement && n.parentElement.closest('[data-topic]');
      const g = topic ? inst.groups.find(x => x.topic === topic) : null;
      const st = { kind: 'dec', el: n, topic: topic || null, group: g };
      inst.stages.push(st);
      inst.decs.push(st);
      if (g) g.decs.push(st);
    });
    // Lite: the same chat flow without topic pages and without an empty start stage - it opens on its first question.
    const end = h('section', 'an-stage ' + (lite ? 'an-fin' : 'an-review'));
    root.appendChild(end);
    inst.stages.push({ kind: lite ? 'done' : 'review', el: end });
    inst.seq = inst.stages.slice();
    inst.stores = h('div', 'an-stores');
    inst.peekUp = h('div', 'an-peek an-peek-up');
    inst.peekDn = h('div', 'an-peek an-peek-dn');
    root.insertBefore(inst.peekUp, root.firstChild);
    root.append(inst.peekDn, inst.stores);
    inst.decs.forEach(st => prepDecision(inst, st));
    loadHes(inst);
    if (inst.brief) prepBrief(inst);
    inst.groups.forEach(g => prepIntro(inst, g));
    buildNav(inst);
    buildComposer(inst);
    root.addEventListener('input', e => onEdit(inst, e));
    root.addEventListener('change', e => onEdit(inst, e));
    root.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-go]');
      if (t) { go(inst, Number(t.dataset.go)); return; }
      tagFromClick(inst, e);
    });
    root.addEventListener('pointerdown', () => { if (!root.contains(document.activeElement)) { const st = inst.stages[inst.idx]; if (st && st.el.tabIndex === -1) st.el.focus({ preventScroll: true }); } });
    go(inst, 0, { initial: true });
    return inst;
  }

  /** Right rail: dots on a hairline, fixed 18 px rows, topics carry a "THEMA" prefix. Lite keeps its progress dots. */
  function buildNav(inst) {
    const old = inst.root.querySelector(':scope > .an-rail, :scope > .an-lhead');
    if (old) old.remove();
    if (inst.lite) {
      const head = h('div', 'an-lhead');
      const l1 = inst.root.querySelector('[data-alevel="1"]');
      head.appendChild(h('div', 'an-lt', (l1 && l1.dataset.title) || inst.root.dataset.navLabel || L('Kurze Fragen', 'Quick questions')));
      const pr = h('div', 'an-lpr');
      pr.appendChild(h('span', 'an-lcount'));
      const dots = h('span', 'an-dots');
      inst.decs.forEach(st => { const b = btn('an-dot'); b.dataset.go = String(inst.stages.indexOf(st)); b.dataset.dec = decId(st.el); dots.appendChild(b); });
      pr.appendChild(dots);
      head.appendChild(pr);
      inst.root.insertBefore(head, inst.root.firstChild);
      inst.stepEl = head;
      return;
    }
    const nav = h('nav', 'an-rail');
    nav.setAttribute('aria-label', L('Fortschritt', 'Progress'));
    inst.stages.forEach(st => {
      const edge = st.kind === 'brief' || st.kind === 'review';
      const b = btn('an-ri' + (st.kind === 'topic' ? ' an-ri-topic' : edge ? ' an-ri-edge' : ''));
      b.dataset.go = String(inst.stages.indexOf(st));
      b.style.setProperty('--dc', st.group ? st.group.color : BLUE);
      const prefix = st.kind === 'topic' ? L('Thema', 'Topic') : '';
      if (prefix) b.appendChild(h('b', '', prefix));
      b.append(h('span', '', stageLabel(inst, st)), h('i'));
      tip(b, (prefix ? prefix + ' ' : '') + stageLabel(inst, st));
      b.__st = st;
      nav.appendChild(b);
    });
    inst.root.insertBefore(nav, inst.root.firstChild);
    inst.stepEl = nav;
  }
  function refreshNav(inst) {
    const cur = inst.stages[inst.idx];
    if (inst.lite) {
      const decStates = new Map(inst.decs.map(st => [st, stateOf(inst, st.el)]));
      inst.stepEl.querySelectorAll('.an-dot').forEach(b => {
        const st = inst.decs.find(x => decId(x.el) === b.dataset.dec);
        const s = decStates.get(st);
        b.className = 'an-dot an-s-' + s + (st === cur ? ' an-cur' : '');
        tip(b, ((st.el.dataset.label || decId(st.el))) + ' · ' + stateText(s));
        b.setAttribute('aria-label', st.el.dataset.label + ' · ' + stateText(s));
        if (st === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      const n = inst.decs.indexOf(cur) + 1;
      const c = inst.stepEl.querySelector('.an-lcount');
      if (c) c.textContent = n ? n + ' / ' + inst.decs.length : '';
      return;
    }
    let here = null;
    inst.stepEl.querySelectorAll('.an-ri').forEach(b => {
      const st = b.__st, on = st === cur;
      b.classList.toggle('an-here', on);
      b.classList.toggle('an-done', !on && inst.stages.indexOf(st) <= inst.maxIdx);
      if (on) { here = b; b.setAttribute('aria-current', 'step'); } else b.removeAttribute('aria-current');
    });
    // The current item stays in view when the rail scrolls.
    const r = inst.stepEl;
    if (here && r.clientHeight) {
      const top = here.offsetTop, bot = top + here.offsetHeight;
      if (top < r.scrollTop + 24) r.scrollTop = Math.max(0, top - 24);
      else if (bot > r.scrollTop + r.clientHeight - 24) r.scrollTop = bot - r.clientHeight + 24;
    }
  }

  function prepBrief(inst) {
    const b = inst.brief, root = inst.root;
    b.classList.add('an-stage', 'an-brief');
    b.tabIndex = -1;
    // The round's own intro (Etappe heading + line) opens the briefing; the eyebrow below names the analysis.
    const intro = root.querySelector(':scope > .iteration-intro');
    if (intro) b.insertBefore(intro, b.firstChild);
    const l1 = root.querySelector('[data-alevel="1"]');
    b.insertBefore(h('div', 'an-eyebrow', root.getAttribute('data-nav-label') || (l1 && l1.dataset.title) || b.dataset.navLabel || L('Analyse', 'Analysis')), b.firstChild);
    renderViz(b, 'long');
    // Top-3 findings as cards in blue variations: the topics by share.
    const chipsEls = [...b.querySelectorAll('[data-briefing-topic]')];
    if (chipsEls.length) {
      const wrap = h('div', 'an-chips');
      chipsEls[0].parentNode.insertBefore(wrap, chipsEls[0]);
      chipsEls.slice().sort((x, y) => num(y.dataset.share) - num(x.dataset.share)).slice(0, 3).forEach((c, i) => {
        const g = inst.groups.find(x => x.topic.id === c.getAttribute('data-briefing-topic'));
        c.style.setProperty('--bc', ['#a5d6ff', '#79c0ff', '#58a6ff'][i]);
        c.setAttribute('role', 'button'); c.tabIndex = 0;
        const share = num(c.dataset.share);
        c.appendChild(h('em', '', (g ? g.decs.length + ' ' + L('Fragen', 'questions') : '') + (share ? (g ? ' · ' : '') + Math.round(share) + ' %' : '')));
        c.dataset.go = String(g ? inst.stages.findIndex(s => s.group === g && s.kind === 'topic') : -1);
        tip(c, '', g ? '⇧+' + (inst.groups.indexOf(g) + 1) : '');
        c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); c.click(); } });
        wrap.appendChild(c);
      });
      chipsEls.forEach(c => { if (!wrap.contains(c)) c.hidden = true; });
    }
    const dur = b.querySelector('[data-briefing-duration]');
    if (dur) dur.style.display = 'none';
    // The call to action: "N Fragen · [Los geht's] · ≈ X min", the button centred. A child of the
    // root (not of the briefing) so it stays out of the reveal sequence.
    const foot = h('div', 'an-foot an-foot-brief');
    foot.appendChild(h('span', 'an-cta-s', inst.decs.length + ' ' + L('Fragen', 'questions')));
    foot.appendChild(goButtons(inst, L("Los geht's", "Let's go"), { noBack: true, glow: true }));
    foot.appendChild(h('span', 'an-cta-s', dur ? dur.textContent.trim() : ''));
    root.insertBefore(foot, inst.peekDn);
  }

  /* ----- persistent composer: THE note field of the open stage ----- */
  const TAGRE = /^\[([^\]\n]{1,80})\]\s?/;
  /** Storage target: the open decision's own data-comment note; every other stage gets a hidden one. */
  function storeOf(inst, st) {
    if (!st) return null;
    if (st.kind === 'dec') return st.el.querySelector('.an-note') || st.el.querySelector('[data-comment$="-note"]');
    if (!st.store) {
      const key = st.kind === 'topic' ? st.topic.id : st.kind === 'brief' ? (st.el.id || 'briefing') : inst.key + '-closing';
      const t = h('textarea', 'an-note an-vh');
      t.setAttribute('data-comment', key + '-note');
      t.tabIndex = -1;
      t.setAttribute('aria-hidden', 'true');
      inst.stores.appendChild(t);
      st.store = t;
    }
    return st.store;
  }
  function compText(ed) {
    const c = ed.cloneNode(true);
    c.querySelectorAll('.an-tagw').forEach(n => n.remove());
    c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    return c.textContent.replace(/ /g, ' ').replace(/\s+$/, '');
  }
  const frozen = inst => frozenEl(inst.root);
  function buildComposer(inst) {
    const el = h('div', 'an-comp'), ed = h('div', 'an-comp-ed');
    ed.contentEditable = frozen(inst) ? 'false' : 'true';
    ed.setAttribute('role', 'textbox');
    ed.setAttribute('aria-multiline', 'true');
    ed.setAttribute('aria-label', L('Notiz an devops', 'Note to devops'));
    ed.dataset.ph = L('Notiz an devops … (optional)', 'Note to devops … (optional)');
    ed.dataset.empty = '1';
    tip(ed, '', 'N');
    const att = btn('an-comp-b an-attach', '📎');
    att.setAttribute('aria-label', L('Anhang', 'Attachment'));
    tip(att, L('Anhang hinzufügen', 'Add an attachment'));
    att.addEventListener('click', () => { const b = (inst.stages[inst.idx].el.querySelector('.attach-btn')); if (b) b.click(); });
    const send = btn('an-comp-b an-send');
    send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    send.setAttribute('aria-label', L('Senden', 'Send'));
    tip(send, L('Senden', 'Send'), 'Enter');
    send.addEventListener('click', () => sendNote(inst));
    el.append(ed, att, send);
    inst.comp = { el, ed, att, send };
    ed.addEventListener('input', () => composeSync(inst));
    ed.addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('.an-tagw')) return;   // the tag's x is a real button: Enter / Space activate it
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); sendNote(inst); }
      else if (e.key === 'Backspace' && !compText(ed) && inst.tag) { e.preventDefault(); setTag(inst, ''); }
    });
    if (frozen(inst)) { send.disabled = true; att.disabled = true; }
    inst.root.insertBefore(el, inst.stores);
  }
  /** Max ONE tag, default none: a small inline label (with ×) before the first word. */
  function setTag(inst, label) {
    if (frozen(inst)) return;
    paintTag(inst, label);
  }
  /** Draws the tag (also on a frozen round, where it only shows the baked one). */
  function paintTag(inst, label) {
    const ed = inst.comp.ed;
    let t = ed.querySelector('.an-tagw');
    inst.tag = label || '';
    if (!label) { if (t) t.remove(); } else {
      if (!t) { t = h('span', 'an-tagw'); t.contentEditable = 'false'; ed.insertBefore(t, ed.firstChild); }
      t.textContent = '';
      const x = btn('', '×');
      x.setAttribute('aria-label', L('Tag entfernen', 'Remove tag'));
      tip(x, L('Tag entfernen', 'Remove tag'));
      x.disabled = frozen(inst);
      x.addEventListener('mousedown', ev => ev.preventDefault());   // keeps the caret in the note
      x.addEventListener('click', () => { setTag(inst, ''); composeSync(inst); focusComposer(inst); });
      t.append(document.createTextNode(label), x);
    }
    ed.dataset.empty = !compText(ed) && !inst.tag ? '1' : '';
  }
  /** Writes the composer into the open stage's note: "[tag] text" when tagged. */
  function composeSync(inst) {
    const st = inst.stages[inst.idx], store = storeOf(inst, st), text = compText(inst.comp.ed);
    inst.comp.ed.dataset.empty = !text && !inst.tag ? '1' : '';
    if (!store || frozen(inst)) return;
    const val = text ? (inst.tag ? '[' + inst.tag + '] ' : '') + text : '';
    if (store.value !== val) { store.value = val; fire(store); }
  }
  /** Loads the open stage's note into the composer (a leading "[tag] " becomes the tag again). */
  function loadComposer(inst, st) {
    const store = storeOf(inst, st), ed = inst.comp.ed;
    let v = store ? store.value : '';
    const m = TAGRE.exec(v);
    ed.textContent = '';
    inst.tag = '';
    if (m) { v = v.slice(m[0].length); }
    if (v) ed.appendChild(document.createTextNode(v));
    paintTag(inst, m ? m[1] : '');
    ed.dataset.empty = !v && !inst.tag ? '1' : '';
    ed.contentEditable = frozen(inst) ? 'false' : 'true';
    inst.comp.att.hidden = !(st.kind === 'dec' && st.el.querySelector('.attach-btn'));
  }
  function focusComposer(inst) {
    const ed = inst.comp.ed;
    if (frozen(inst)) return;
    ed.focus({ preventScroll: true });
    const sel = window.getSelection && window.getSelection();
    if (sel && document.createRange) { const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  }
  /** Send: a note WITH a tag stays on the stage; one WITHOUT advances (not on briefing / closing). */
  function sendNote(inst) {
    composeSync(inst);
    const st = inst.stages[inst.idx], text = compText(inst.comp.ed);
    if (!text || frozen(inst)) return false;
    if (st.kind === 'dec' && !storeOf(inst, st)) return false;   // no storage target: never advance and drop the note
    inst.comp.el.classList.remove('an-sent'); void inst.comp.el.offsetWidth; inst.comp.el.classList.add('an-sent');
    if (!inst.tag && st.kind !== 'brief' && st.kind !== 'review' && st.kind !== 'done') step(inst, 1);
    return true;
  }
  /** A click on a finding / question / topic sets the tag (selecting text does not). */
  function tagFromClick(inst, e) {
    if (frozen(inst) || e.target.closest('button, a, input, label, [role="button"], .an-tabs')) return;
    const sel = window.getSelection && window.getSelection();
    if (sel && String(sel).trim()) return;
    const st = inst.stages[inst.idx], t = e.target;
    let label = '';
    if (st.kind === 'dec') {
      const no = L('Frage ', 'Question ') + stageNo(inst, st);
      if (t.closest('.an-m-find .an-bub')) label = L('Befund · ', 'Finding · ') + no;
      else if (t.closest('.an-m-q .an-bub')) label = no;
    } else if (st.kind === 'topic' && t.closest('.an-topic')) label = L('Thema ', 'Topic ') + st.group.label;
    if (!label) return;
    setTag(inst, label);
    composeSync(inst);
    focusComposer(inst);
  }
```


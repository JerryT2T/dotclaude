# Concept templates, part 48 of 54: Template: analysis — engine UI JS (palette, chat flow, rail)

## Engine UI — palette, chat flow, rail (JS; the composer and note store continue in templates-analysis-composer.md)

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
   progress dots (Lite), the peek (next stage below) and the persistent
   composer. A decision stage is three messages — finding, question (fixed
   height), answer block — revealed one by one on the first visit (`enterSeq`,
   `glide`: soft auto-scroll that never passes the question; user scroll wins) —
   built by `prepDecision()` together with the mode widgets (slider, sortable
   order, inline alt / fix / custom fields). The round's `.iteration-intro`
   moves into the briefing.
4. The composer is THE note field: `storeOf()` maps it onto the open
   stage's `data-comment="{id}-note"` (briefing, topic page and closing get a
   hidden one of their own). No tag or label: a note is sent inline into the
   open stage's chat, so it already sits with its question and finding.
   `sendNote()` turns the text into a chat message before the stage's
   Weiter row and stays on the stage; only "Keine passt" also moves on. The
   store holds the messages joined by a blank line, plus the unsent draft, so
   nothing is lost on a reload or a submit. The composer never shows a sent
   message again, unless its pen icon moves it back for editing.
5. Touched tracking: a stage open ≥ 3 s, or any change in it, writes
   `dm-{id}-touched` = `"1"`. Hesitation: `hesEntry()` … `hesFlush()` count dwell
   only while the stage is visible AND the window focused and write
   `dm-{id}-hes`.
6. Keys: Enter / ⇧+Enter, ← → (or A D) stages, ↑ ↓ (or W S) options, 1–N options (decision has
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
  // `**fett**` -> <strong>; text nodes only, an unmatched `**` stays literal.
  function rich(el, text) {
    String(text).split(/(\*\*[^*]+?\*\*)/).forEach(part => {
      if (/^\*\*[^*]+?\*\*$/.test(part)) el.appendChild(h('strong', '', part.slice(2, -2)));
      else if (part) el.appendChild(document.createTextNode(part));
    });
    return el;
  }
  VIZ.text = (el, s) => {
    el.textContent = '';
    el.classList.add('an-vz-text');
    let ul = null;
    String(s.text == null ? '' : s.text).split(/\n+/).filter(l => l.trim()).forEach(line => {
      const m = /^\s*[-•]\s+(.*)$/.exec(line);
      if (m) { if (!ul) { ul = h('ul'); el.appendChild(ul); } rich(ul.appendChild(h('li')), m[1]); }
      else { ul = null; rich(el.appendChild(h('p')), line.trim()); }
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
  /* ----- sim: controls -> live outputs, formulas always visible (templates-analysis.md § sim) -----
   * The formulas are DATA: a hand-written recursive-descent parser over a closed grammar. Nothing is eval'ed,
   * no Function(); an identifier is only a known control / const / earlier-output id (looked up in a Set / Map,
   * never as a property of an object), a call only one of SIM_FN. */
  const SIM_FN = { min: [Math.min, 1, 6], max: [Math.max, 1, 6], abs: [Math.abs, 1, 1], round: [Math.round, 1, 1], floor: [Math.floor, 1, 1], ceil: [Math.ceil, 1, 1], sqrt: [Math.sqrt, 1, 1], clamp: [(x, a, b) => Math.min(b, Math.max(a, x)), 3, 3] };
  const SIM_RESERVED = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty'].concat(Object.keys(SIM_FN)));
  const SIM_LIM = { len: 240, tok: 160, depth: 20, controls: 12, outputs: 12 };
  const simId = s => typeof s === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,24}$/.test(s) && !SIM_RESERVED.has(s);
  /** Formula text -> tree, or throws. known = Set of the identifiers it may read. */
  function simParse(src, known) {
    src = String(src == null ? '' : src);
    if (!src.trim() || src.length > SIM_LIM.len) throw new Error('formula length');
    const t = [];
    let i = 0, m;
    while (i < src.length) {
      const c = src.charAt(i), rest = src.slice(i);
      if (c === ' ' || c === '\t') { i++; continue; }
      if ((m = /^\d+(?:\.\d+)?/.exec(rest))) { t.push({ k: 'n', v: Number(m[0]) }); i += m[0].length; }
      else if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { t.push({ k: 'id', v: m[0] }); i += m[0].length; }
      else if ('+-*/^(),'.indexOf(c) >= 0) { t.push({ k: c }); i++; }
      else throw new Error('character ' + c);
      if (t.length > SIM_LIM.tok) throw new Error('too many tokens');
    }
    let p = 0, depth = 0;
    const peek = () => (p < t.length ? t[p].k : '');
    const enter = () => { if (++depth > SIM_LIM.depth) throw new Error('too deep'); };
    function expr() {
      enter();
      let a = term();
      while (peek() === '+' || peek() === '-') { const op = t[p++].k; a = { t: 'b', op, a, b: term() }; }
      depth--;
      return a;
    }
    function term() {
      let a = unary();
      while (peek() === '*' || peek() === '/') { const op = t[p++].k; a = { t: 'b', op, a, b: unary() }; }
      return a;
    }
    function unary() {
      if (peek() === '-') { p++; enter(); const a = unary(); depth--; return { t: 'u', a }; }
      const a = prim();
      return peek() === '^' ? (p++, { t: 'b', op: '^', a, b: unary() }) : a;
    }
    function prim() {
      const x = t[p++];
      if (!x) throw new Error('unexpected end');
      if (x.k === 'n') return { t: 'n', v: x.v };
      if (x.k === '(') { const e = expr(); if (peek() !== ')') throw new Error('missing )'); p++; return e; }
      if (x.k !== 'id') throw new Error('unexpected ' + x.k);
      if (peek() === '(') {
        if (!Object.prototype.hasOwnProperty.call(SIM_FN, x.v)) throw new Error('function ' + x.v);
        p++;
        const args = [];
        if (peek() !== ')') { args.push(expr()); while (peek() === ',') { p++; args.push(expr()); } }
        if (peek() !== ')') throw new Error('missing )');
        p++;
        if (args.length < SIM_FN[x.v][1] || args.length > SIM_FN[x.v][2]) throw new Error('arguments of ' + x.v);
        return { t: 'f', name: x.v, args };
      }
      if (!known.has(x.v) || SIM_RESERVED.has(x.v)) throw new Error('unknown ' + x.v);
      return { t: 'v', name: x.v };
    }
    const tree = expr();
    if (p < t.length) throw new Error('unexpected ' + t[p].k);
    return tree;
  }
  function simRun(n, env) {
    switch (n.t) {
      case 'n': return n.v;
      case 'v': return env.has(n.name) ? env.get(n.name) : NaN;
      case 'u': return -simRun(n.a, env);
      case 'f': return SIM_FN[n.name][0].apply(null, n.args.map(a => simRun(a, env)));
      default: {
        const a = simRun(n.a, env), b = simRun(n.b, env);
        if (n.op === '+') return a + b;
        if (n.op === '-') return a - b;
        if (n.op === '*') return a * b;
        if (n.op === '/') return b === 0 ? NaN : a / b;
        return Math.pow(a, b);
      }
    }
  }
  /** Spec -> validated model (controls, consts, outputs with compiled trees, budget), or throws. */
  function simModel(s) {
    if (!s || typeof s !== 'object') throw new Error('spec');
    const controls = list(s.controls), outs = list(s.outputs), known = new Set(), seen = new Set();
    if (!controls.length || !outs.length || controls.length > SIM_LIM.controls || outs.length > SIM_LIM.outputs) throw new Error('inputs or outputs missing');
    const cs = controls.map(c => {
      if (!c || !simId(c.id) || seen.has(c.id)) throw new Error('control id');
      if (c.type !== 'steps' && c.type !== 'range') throw new Error('control type');
      const min = Number(c.min), max = Number(c.max), step = c.type === 'steps' ? 1 : (Number(c.step) || 1);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || step <= 0 || (c.type === 'steps' && max - min > 12)) throw new Error('control range');
      seen.add(c.id); known.add(c.id);
      return { id: c.id, label: String(c.label || c.id), type: c.type, min, max, step, group: c.group ? String(c.group) : '', value: clamp(num(c.value == null ? min : c.value), min, max) };
    });
    const consts = [];
    if (s.consts && typeof s.consts === 'object' && !Array.isArray(s.consts)) {
      Object.keys(s.consts).forEach(k => {
        if (!simId(k) || seen.has(k) || !Number.isFinite(Number(s.consts[k]))) throw new Error('const ' + k);
        seen.add(k); known.add(k); consts.push([k, Number(s.consts[k])]);
      });
    }
    const os = outs.map(o => {
      if (!o || !simId(o.id) || seen.has(o.id)) throw new Error('output id');
      const tree = simParse(o.formula, known);   // an output may read the controls, consts and EARLIER outputs only
      seen.add(o.id); known.add(o.id);
      return { id: o.id, label: String(o.label || o.id), unit: o.unit ? String(o.unit) : '', formula: String(o.formula), tags: list(o.tags).map(String).slice(0, 6), delta: o.delta !== false, tree };
    });
    let budget = null;
    if (s.budget && typeof s.budget === 'object') {
      const ids = list(s.budget.controls).map(String);
      if (!Number.isFinite(Number(s.budget.total)) || !ids.length || ids.some(id => !cs.some(c => c.id === id && c.type === 'steps'))) throw new Error('budget');
      budget = { total: Number(s.budget.total), controls: ids };
    }
    let bar = null;
    if (s.bar && typeof s.bar === 'object') {
      if (!os.some(o => o.id === s.bar.output)) throw new Error('bar output');
      bar = { output: s.bar.output, max: Number(s.bar.max) > 0 ? Number(s.bar.max) : 100, label: s.bar.label ? String(s.bar.label) : '' };
    }
    return { controls: cs, consts, outputs: os, budget, bar };
  }
  /** Values of the outputs for one set of control values; null where the result is not a finite number. */
  function simCompute(m, vals) {
    const env = new Map(m.consts);
    m.controls.forEach(c => env.set(c.id, vals[c.id]));
    const out = {};
    m.outputs.forEach(o => {
      let v = NaN;
      try { v = simRun(o.tree, env); } catch (e) { v = NaN; }
      env.set(o.id, v);
      out[o.id] = Number.isFinite(v) ? v : null;
    });
    return out;
  }
  window.CONCEPT_SIM = { parse: simParse, model: simModel, compute: simCompute, state: simState };
  const simReg = {};
  // The round that owns a sim. A clone is drawn before it is attached, so it asks its authored source (the sim id is unique per round: r{N}_...).
  function simHost(el, sid) {
    const own = el.closest('section[data-iteration]');
    if (own) return own;
    const src = [...document.querySelectorAll('section[data-iteration] [data-viz="sim"]')].filter(x => x.getAttribute('data-sim') === sid && x.closest('[data-alevel]'));
    return (src[0] && src[0].closest('section[data-iteration]')) || document.querySelector('section[data-iteration][data-active]') || document.body;
  }
  const simName = (sid, cid) => 'dm-' + sid + '.' + cid;
  const simNotify = sid => { (simReg[sid] || []).forEach(f => f()); };
  const simSigned = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
  /** Current control values of sim sid inside scope (stored values, else the spec defaults), plus its outputs. */
  function simState(spec, sid, scope) {
    const m = simModel(spec), vals = {}, root = scope || document;
    const inputs = [...root.querySelectorAll('input[type="hidden"]')];
    m.controls.forEach(c => {
      const i = inputs.find(x => x.name === simName(sid, c.id));
      const raw = i && i.value !== '' ? Number(i.value) : NaN;
      vals[c.id] = Number.isFinite(raw) ? clamp(raw, c.min, c.max) : c.value;
    });
    return { controls: vals, outputs: simCompute(m, vals), moved: m.controls.some(c => vals[c.id] !== c.value) };
  }
  VIZ.sim = (el, s) => {
    const m = simModel(s), sid = el.getAttribute('data-sim') || s.id;
    if (!simId(sid)) throw new Error('sim id');
    const host = simHost(el, sid), frozen = !!host.closest('[data-baked]');
    const hid = {};
    let fresh = false;
    m.controls.forEach(c => {
      let i = [...host.querySelectorAll('input[type="hidden"]')].find(x => x.name === simName(sid, c.id));
      if (!i) {
        i = h('input'); i.type = 'hidden'; i.name = simName(sid, c.id); i.value = String(c.value);
        if (frozen) i.disabled = true;
        host.appendChild(i);
        fresh = true;
      }
      if (!i.__simBound) { i.__simBound = true; i.addEventListener('change', () => simNotify(sid)); }
      hid[c.id] = i;
    });
    // The state is stored by name (saveState): a hidden input born after the last restore must pick its stored value up now.
    if (fresh && typeof restoreState === 'function') { try { restoreState(); } catch (e) { /* the defaults stand */ } }
    const val = c => { const r = hid[c.id].value === '' ? NaN : Number(hid[c.id].value); return Number.isFinite(r) ? clamp(r, c.min, c.max) : c.value; };
    const vals = () => { const v = {}; m.controls.forEach(c => { v[c.id] = val(c); }); return v; };
    const base = simCompute(m, (() => { const v = {}; m.controls.forEach(c => { v[c.id] = c.value; }); return v; })());
    const setVal = (c, next) => {
      next = clamp(Number((c.min + Math.round((next - c.min) / c.step) * c.step).toPrecision(12)), c.min, c.max);
      if (hid[c.id].disabled || next === val(c)) return false;
      if (m.budget && next > val(c) && m.budget.controls.indexOf(c.id) >= 0) {
        const spent = m.budget.controls.reduce((a, id) => a + val(m.controls.find(x => x.id === id)), 0);
        if (spent - val(c) + next > m.budget.total) { flash.textContent = L('Budget aufgebraucht', 'Budget used up'); return false; }
      }
      flash.textContent = '';
      hid[c.id].value = String(next);
      fire(hid[c.id]);
      return true;
    };
    el.textContent = '';
    const root = h('div', 'an-sim'), flash = h('span', 'an-sim-flash');
    flash.setAttribute('role', 'status');
    if (s.text) root.appendChild(h('p', 'an-sim-text', String(s.text)));
    const ui = {}, groups = new Map();
    m.controls.forEach(c => {
      if (!groups.has(c.group)) { const g = h('div', 'an-sim-grp'); if (c.group) g.appendChild(h('div', 'an-sim-gl', c.group)); groups.set(c.group, g); }
      const row = h('div', 'an-sim-c'), lab = h('span', 'an-sim-l', c.label), shown = h('b', 'an-sim-v');
      row.appendChild(lab);
      if (c.type === 'steps') {
        const pips = h('span', 'an-sim-pips');
        pips.setAttribute('role', 'group');
        pips.setAttribute('aria-label', c.label);
        const bs = [];
        for (let k = c.min + 1; k <= c.max; k++) {
          const b = btn('an-sim-pip');
          b.setAttribute('aria-label', c.label + ': ' + k);
          b.addEventListener('click', () => setVal(c, val(c) === k ? k - 1 : k));
          bs.push([k, b]);
          pips.appendChild(b);
        }
        pips.addEventListener('keydown', e => {
          const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          setVal(c, val(c) + d);
        });
        row.appendChild(pips);
        ui[c.id] = () => { bs.forEach(p => { p[1].classList.toggle('an-on', p[0] <= val(c)); p[1].setAttribute('aria-pressed', p[0] === val(c) ? 'true' : 'false'); p[1].disabled = frozen; }); };
      } else {
        const r = h('input', 'an-sim-range');
        r.type = 'range'; r.min = String(c.min); r.max = String(c.max); r.step = String(c.step); r.value = String(val(c));
        r.setAttribute('aria-label', c.label);
        r.disabled = frozen;
        r.addEventListener('input', () => setVal(c, Number(r.value)));
        row.appendChild(r);
        ui[c.id] = () => { r.value = String(val(c)); };
      }
      row.appendChild(shown);
      const prev = ui[c.id];
      ui[c.id] = () => { prev(); shown.textContent = fmt(val(c)); };
      groups.get(c.group).appendChild(row);
    });
    const ctl = h('div', 'an-sim-ctl');
    groups.forEach(g => ctl.appendChild(g));
    root.appendChild(ctl);
    let left = null;
    if (m.budget) {
      left = h('div', 'an-sim-budget');
      root.appendChild(left);
    }
    const out = h('div', 'an-sim-out'), tiles = {};
    out.setAttribute('aria-live', 'polite');
    m.outputs.forEach(o => {
      const t = h('div', 'an-sim-o'), v = h('b', 'an-sim-ov'), d = h('i', 'an-sim-od');
      t.appendChild(h('span', 'an-sim-ol', o.label));
      const line = h('div', 'an-sim-line');
      line.append(v, d);
      t.appendChild(line);
      if (o.tags.length) { const tg = h('div', 'an-sim-tags'); o.tags.forEach(x => tg.appendChild(h('span', 'an-sim-tag', x))); t.appendChild(tg); }
      t.appendChild(h('code', 'an-sim-f', o.id + ' = ' + o.formula));
      out.appendChild(t);
      tiles[o.id] = { v, d, o };
    });
    root.appendChild(out);
    let meter = null;
    if (m.bar) {
      const b = h('div', 'an-sim-bar'), head = h('div', 'an-sim-bh'), tr = h('div', 'an-bar-t'), f = h('i');
      tr.setAttribute('role', 'img');
      tr.appendChild(f);
      b.append(head, tr);
      root.appendChild(b);
      meter = { head, tr, f };
    }
    if (m.consts.length) root.appendChild(h('div', 'an-sim-k', m.consts.map(k => k[0] + ' = ' + fmt(k[1])).join(' · ')));
    root.appendChild(flash);
    el.appendChild(root);
    const refresh = () => {
      const v = vals(), cur = simCompute(m, v);
      m.controls.forEach(c => ui[c.id]());
      if (left) {
        const spent = m.budget.controls.reduce((a, id) => a + v[id], 0);
        left.textContent = L('Übrig: ', 'Left: ') + (m.budget.total - spent) + L(' von ', ' of ') + m.budget.total;
      }
      m.outputs.forEach(o => {
        const x = cur[o.id], b = base[o.id], tl = tiles[o.id];
        tl.v.textContent = x == null ? '–' : fmt(x) + (o.unit ? ' ' + o.unit : '');
        const dd = x != null && b != null && o.delta ? Math.round((x - b) * 10) / 10 : 0;
        tl.d.textContent = dd ? simSigned(dd) : '';
        tl.d.classList.toggle('an-up', dd > 0);
        tl.d.classList.toggle('an-down', dd < 0);
      });
      if (meter) {
        const x = cur[m.bar.output], pct = x == null ? 0 : clamp(x / m.bar.max * 100, 0, 100);
        meter.head.textContent = (m.bar.label || m.bar.output) + ': ' + (x == null ? '–' : fmt(x) + ' / ' + fmt(m.bar.max));
        meter.f.style.width = pct + '%';
        meter.f.classList.toggle('an-over', x != null && x > m.bar.max);
        meter.tr.setAttribute('aria-label', meter.head.textContent);
      }
    };
    (simReg[sid] = simReg[sid] || []).push(refresh);
    refresh();
  };
  document.addEventListener('conceptanalysis:stage', () => { Object.keys(simReg).forEach(simNotify); });
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
    // The note stands in its own bubble right under the answer: repeating it here showed every word twice.
    if (e.none) return L('Keine passt', 'None fits');
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
  /** Finding message: meta line, tabs Befund / Beispiel (Beispiel only with a [data-example] slot), situation + visual.
   *  "Gilt für" is not part of it: it scopes the decision, so it stands above the question (buildDecision). */
  function buildFinding(inst, st) {
    const d = st.el, src = findingSrc(inst, st);
    const m = msg('an-m-find'), bub = h('div', 'an-bub an-edge');
    m.appendChild(bub);
    bub.appendChild(h('div', 'an-meta', metaText(inst, st)));
    const pane = h('div', 'an-pane an-p-find'), sit = d.querySelector('[data-situation]');
    // ONE text block (situation + the long slot's prose, <= 3 lines by the gate) first, the display(s) last: never text below the display.
    const block = sit || h('p'), disp = [];
    if (!sit) block.setAttribute('data-situation', '');   // same type as an authored situation, with or without one

    if (sit) pane.appendChild(sit);
    const slot = src && [...src.children].find(c => c.getAttribute('data-slot') === 'long');
    if (slot) {
      const c = slot.cloneNode(true);
      c.querySelectorAll('[data-example], [data-evidence]').forEach(e => e.remove());
      c.querySelectorAll('[data-viz-done]').forEach(e => e.removeAttribute('data-viz-done'));
      while (c.firstChild) {
        const n = c.firstChild;
        if (n.nodeType === 1 && (n.matches('[data-viz]') || n.querySelector('[data-viz]'))) { disp.push(n); n.remove(); continue; }
        if (n.nodeType === 1 && n.tagName === 'P') { if (block.firstChild) block.appendChild(document.createTextNode(' ')); while (n.firstChild) block.appendChild(n.firstChild); n.remove(); continue; }
        if (n.nodeType === 3 && !n.textContent.trim()) { n.remove(); continue; }
        block.appendChild(n);
      }
    }
    if (block.firstChild && !sit) pane.appendChild(block);
    disp.forEach(n => pane.appendChild(n));
    // The finding is only the finding: [data-context] speaks about the answer, so it sits in the answer block.
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
    const inst = { root, lite, stages: [], groups: [], idx: 0, timers: [], visited: new Set(), seen: new Set(), decs: [], maxIdx: 0, touchTimer: 0, hes: {}, sharpen: new Map(), key: root.id || (root.closest('[data-view]') || root).getAttribute('data-view') || ('analysis' + (instances.length + 1)) };
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
    // Only the NEXT stage peeks in (below); a faded previous-stage peek above read as cut off.
    inst.peekDn = h('div', 'an-peek an-peek-dn');
    root.append(inst.peekDn, inst.stores);
    inst.decs.forEach(st => prepDecision(inst, st));
    inst.stages.forEach(st => restInputOf(inst, st));   // there before restoreState() runs, so a reload can fill them
    loadHes(inst);
    if (inst.brief) prepBrief(inst);
    inst.groups.forEach(g => prepIntro(inst, g));
    buildNav(inst);
    buildComposer(inst);
    if (!lite) {   // the stage messages scroll in their own container; title and composer stay fixed
      const chat = h('div', 'an-chat');
      [...root.children].forEach(c => { if (c !== inst.comp.el && c !== inst.stores && !c.classList.contains('an-rail') && !c.classList.contains('an-here-tag')) chat.appendChild(c); });
      root.insertBefore(chat, inst.comp.el);
      inst.chat = chat;
      watchUserScroll(inst);
    }
    root.addEventListener('input', e => onEdit(inst, e));
    root.addEventListener('change', e => onEdit(inst, e));
    root.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-go]');
      if (t) go(inst, Number(t.dataset.go));
    });
    root.addEventListener('pointerdown', () => { if (!root.contains(document.activeElement)) { const st = inst.stages[inst.idx]; if (st && st.el.tabIndex === -1) st.el.focus({ preventScroll: true }); } });
    go(inst, 0, { initial: true });
    return inst;
  }

  /** Drops the "you are here" tag of an earlier build. */
  function dropHereTag(inst) { inst.root.querySelectorAll(':scope > .an-here-tag').forEach(n => n.remove()); inst.hereEl = null; }
  /** Right rail: dots on a hairline, fixed 24 px rows (+ a lead-in per group), topics carry a "THEMA" prefix. Lite keeps its progress dots. */
  function buildNav(inst) {
    const old = inst.root.querySelector(':scope > .an-rail, :scope > .an-lhead');
    dropHereTag(inst);
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
    inst.stages.forEach((st, k) => {
      const edge = st.kind === 'brief' || st.kind === 'review';
      // A group starts with a topic, the closing, or a question right after the briefing: it gets the lead-in.
      const gs = k > 0 && (st.kind === 'topic' || st.kind === 'review' || (st.kind === 'dec' && inst.stages[k - 1].kind === 'brief'));
      const b = btn('an-ri' + (st.kind === 'topic' ? ' an-ri-topic' : edge ? ' an-ri-edge' : '') + (gs ? ' an-ri-gs' : ''));
      b.dataset.go = String(inst.stages.indexOf(st));
      b.style.setProperty('--dc', st.group ? st.group.color : BLUE);
      const prefix = st.kind === 'topic' ? L('Thema', 'Topic') : '';
      if (prefix) b.appendChild(h('b', '', prefix));
      b.append(h('span', '', stageLabel(inst, st)), h('i'));
      tip(b, (prefix ? prefix + ' ' : '') + stageLabel(inst, st));
      b.__st = st;
      nav.appendChild(b);
    });
    // Last in the DOM (it is position: fixed): Tab reaches the chat and its answers before the rail.
    // The rail stays LAST in the DOM; the tag sits right before it.
    inst.stepEl = nav;
    // "You are here" stays visible while the rail is collapsed: a tag in the rail's colour with the short label,
    // pointing at the dot. It is a fixed sibling OUTSIDE the rail (the rail clips and masks its own content) and
    // follows the open row by JS (rail scroll, resize); the expanded rail names the row itself, so the tag steps back (CSS :has).
    const tag = h('div', 'an-here-tag');
    tag.setAttribute('aria-hidden', 'true');
    tag.hidden = true;
    tag.appendChild(h('span'));
    inst.hereEl = tag;
    // A click (or tap) on the tag opens the rail at the open row: focus-within expands it like hover does.
    tag.addEventListener('click', () => { if (inst.hereRow) inst.hereRow.focus(); });
    inst.root.append(tag, nav);
    nav.addEventListener('scroll', () => placeHere(inst), { passive: true });
  }
  /** Short label of the open stage for the tag: "Question 3", "Topic X", "Briefing", "Closing". */
  function hereLabel(inst, st) {
    if (st.kind === 'dec') return L('Frage ', 'Question ') + stageNo(inst, st);
    if (st.kind === 'topic') return L('Thema ', 'Topic ') + stageLabel(inst, st);
    return stageLabel(inst, st);
  }
  /** Puts the tag level with the open row (clamped to the rail's ends when the row is scrolled away). */
  function placeHere(inst) {
    const t = inst.hereEl, r = inst.stepEl, b = inst.hereRow;
    if (!t || !r || !b || inst.lite) return;
    const rr = r.getBoundingClientRect(), br = b.getBoundingClientRect();
    if (!rr.height || !br.height) { t.hidden = true; return; }
    const y = Math.min(Math.max(br.top + br.height / 2, rr.top + 12), rr.bottom - 12);
    t.hidden = false;
    t.style.top = Math.round(y) + 'px';
    t.style.setProperty('--dc', b.style.getPropertyValue('--dc'));
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
    inst.hereRow = here;
    if (inst.hereEl) inst.hereEl.firstChild.textContent = hereLabel(inst, cur);
    // The current item stays in view when the rail scrolls.
    const r = inst.stepEl;
    if (here && r.clientHeight) {
      const top = here.offsetTop, bot = top + here.offsetHeight;
      if (top < r.scrollTop + 24) r.scrollTop = Math.max(0, top - 24);
      else if (bot > r.scrollTop + r.clientHeight - 24) r.scrollTop = bot - r.clientHeight + 24;
    }
    placeHere(inst);
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
    // The first three topics as cards in blue variations, in FLOW order (as they come in the analysis).
    const chipsEls = [...b.querySelectorAll('[data-briefing-topic]')];
    if (chipsEls.length) {
      const wrap = h('div', 'an-chips');
      chipsEls[0].parentNode.insertBefore(wrap, chipsEls[0]);
      chipsEls.slice(0, 3).forEach((c, i) => {
        const g = inst.groups.find(x => x.topic.id === c.getAttribute('data-briefing-topic'));
        c.style.setProperty('--bc', ['#a5d6ff', '#79c0ff', '#58a6ff'][i]);
        c.setAttribute('role', 'button'); c.tabIndex = 0;
        const share = num(c.dataset.share);
        c.appendChild(h('em', '', (g ? g.decs.length + ' ' + L('Fragen', 'questions') : '') + (share ? (g ? ' · ' : '') + Math.round(share) + ' % ' + L('des Potenzials', 'of the potential') : '')));
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
```


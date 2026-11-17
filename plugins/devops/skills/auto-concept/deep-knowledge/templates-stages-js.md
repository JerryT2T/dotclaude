# Concept templates, part 49 of 51: Shared systems — Etappen (stages) JS

## Etappen JS

Renders § Etappen from `#concept-stages` + `data-stage` (templates-stages.md). Re-runs on every `iteration:changed` and every ☰ open.

```javascript
// ── Etappen (stages) — reads #concept-stages + data-stage, never derives them.
function conceptStages() {
  const node = document.getElementById('concept-stages');
  let d = null;
  if (node) { try { d = JSON.parse(node.textContent || 'null'); } catch (e) { d = null; } }
  if (!d || typeof d !== 'object') return { stages: [], current: '', icon: '', title: '' };
  return {
    stages: Array.isArray(d.stages) ? d.stages.filter(s => s && s.id) : [],
    current: d.current || '', icon: d.icon || '', title: d.title || ''
  };
}

function conceptHeadName() {
  const d = conceptStages();
  const icon = d.icon || '🧭';
  const title = d.title || String(document.title || '')
    .replace(/^(?:Concept\s+[—-]\s+|(?:👉|⏳|🛠️|🛠|🏁|✅)️?\s+)/u, '').trim();
  return title ? icon + ' ' + title : '';
}

function _stRounds() {
  return [...document.querySelectorAll('section[data-iteration]')]
    .filter(s => !s.hasAttribute('data-final-report') && !s.hasAttribute('data-reality-check'))
    .sort((a, b) => Number(a.dataset.iteration) - Number(b.dataset.iteration));
}
function _stVisibleRound() {
  return document.querySelector('section[data-iteration]:not([hidden])')
    || document.querySelector('section[data-iteration][data-active]');
}
function _stLive() { return document.querySelector('section[data-iteration][data-active]'); }
function _stRoundLabel(sec) { return '{{iteration.tab}} ' + (sec ? sec.dataset.iteration : ''); }
function _stStageOf(sec) {
  if (!sec) return '';
  if (sec.dataset.stage) return sec.dataset.stage;
  // The final report / a reality check carry no data-stage: they belong to
  // the live Etappe.
  return conceptStages().current || '';
}
// The stored state (open | built | issue | dropped); an older page without
// one reads as open.
const _ST_STATES = ['open', 'built', 'issue', 'dropped'];
function _stStateRaw(id) {
  const s = conceptStages().stages.find(x => x.id === id);
  return s && _ST_STATES.includes(s.state) ? s.state : 'open';
}
function _stLiveStage() {
  return _stStageOf(_stLive()) || conceptStages().current || '';
}
// The node's look: done (built) · closed (issue / dropped) · now (the live
// Etappe) · open (has rounds, passed over) · ahead (no round yet). The list
// order says nothing about progress any more.
function _stState(id) {
  const raw = _stStateRaw(id);
  if (raw === 'built') return 'done';
  if (raw === 'issue' || raw === 'dropped') return 'closed';
  if (id === _stLiveStage()) return 'now';
  return _stRounds().some(r => r.dataset.stage === id) ? 'open' : 'ahead';
}
function _stStateLine(id) {
  const raw = _stStateRaw(id);
  return raw === 'built' ? '{{stage.state_built}}' : raw === 'issue' ? '{{stage.state_issue}}'
    : raw === 'dropped' ? '{{stage.state_dropped}}' : '';
}
// The stage final report of an Etappe (section[data-final-report][data-stage]).
function _stReport(id) {
  return [...document.querySelectorAll('section[data-iteration][data-final-report]')]
    .find(s => s.dataset.stage === id) || null;
}
function _stEl(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// "Übersicht · Runde N" on the overview row, else a plain "Runde N" row.
function renderRoundRow() {
  const sec = _stVisibleRound();
  const ov = document.querySelector('#screen-nav .screen-nav-overview-item');
  if (ov) {
    let tag = ov.querySelector('.screen-nav-rnd');
    if (!tag) {
      tag = _stEl('span', 'screen-nav-rnd');
      const label = ov.firstElementChild;
      (label || ov).appendChild(tag);
    }
    tag.textContent = '· ' + _stRoundLabel(sec);
  }
  const scroll = document.querySelector('#decision-panel .panel-nav-scroll');
  if (!scroll) return;
  let row = document.getElementById('panel-round-row');
  if (!row) {
    row = _stEl('div', 'panel-round-row');
    row.id = 'panel-round-row';
    scroll.insertBefore(row, scroll.firstChild);
  }
  const ovGroup = document.querySelector('#screen-nav .screen-nav-overview-group');
  const ovShown = !!(ov && document.documentElement.dataset.template === 'design'
    && !(ovGroup && ovGroup.hidden));
  const isFinal = !!(sec && sec.hasAttribute('data-final-report'));
  row.hidden = ovShown || isFinal || !sec || !sec.hasAttribute('data-active');
  row.textContent = _stRoundLabel(sec);
}

// A round's kind: the glyph of its Etappe's stepper node and line 1 of the
// tab's tooltip.
function _stKindOf(sec) {
  if (!sec) return { kind: 'none', line: '' };
  const designs = sec.querySelectorAll(':scope > section[data-design]');
  const n = designs.length;
  if ((sec.dataset.iterationTemplate || '') === 'design' || n) {
    if (n <= 1) return { kind: 'one', line: '{{stage.kind_one}}' };
    const set = sec.dataset.designSet || '';
    const kind = set === 'topics' ? 'seq' : set === 'alternatives' ? 'pick' : 'open';
    const key = kind === 'seq' ? '{{stage.kind_seq}}' : kind === 'pick' ? '{{stage.kind_pick}}' : '{{stage.kind_open}}';
    return { kind, line: key.replace('{n}', String(n)) };
  }
  if (sec.dataset.analysis === 'full') {
    const decs = sec.querySelectorAll('[data-decision][data-decision-mode]').length;
    return { kind: 'analysis', line: '{{stage.kind_analysis}}'.replace('{n}', String(decs)) };
  }
  const entries = sec.querySelectorAll('section[id][data-nav-label]').length;
  return { kind: 'doc', line: '{{stage.kind_doc}}'.replace('{n}', String(entries)) };
}
function stageKindLine(sec) { return _stKindOf(sec).line; }

// One stroke glyph per kind (16 × 16, currentColor).
const _ST_GLYPHS = {
  pick: 'M2 4h3v8H2zM6.5 4h3v8h-3zM11 4h3v8h-3zM6.5 14h3',
  seq: 'M1.5 8h13M3.5 8a1.5 1.5 0 1 0 0 .01M8 8a1.5 1.5 0 1 0 0 .01M12.5 8a1.5 1.5 0 1 0 0 .01',
  open: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z',
  one: 'M2 3h12v8H2zM6 14h4M8 11v3',
  analysis: 'M3 13.5V9M8 13.5V3M13 13.5V6.5M1.5 13.5h13',
  doc: 'M3 4h10M3 8h10M3 12h6'
};
function _stGlyph(kind) {
  const d = _ST_GLYPHS[kind];
  if (!d) return null;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}
// The stepper node of one Etappe: its kind glyph (newest round) with the
// letter as a badge; an Etappe without a round yet shows the letter alone.
function _stNode(stage) {
  const rounds = _stRounds().filter(r => r.dataset.stage === stage.id);
  const newest = rounds[rounds.length - 1] || null;
  const k = _stKindOf(newest);
  const node = _stEl('span', 'stage-node');
  node.setAttribute('aria-hidden', 'true');
  node.dataset.kind = k.kind;
  const g = _stGlyph(k.kind);
  if (g) node.appendChild(g);
  node.appendChild(_stEl('span', 'stage-tl', stage.id));
  const state = _stStateLine(stage.id);
  const tip = (newest
    ? k.line + '\n' + '{{stage.label}} ' + stage.id + ' · ' + _stRoundLabel(newest)
    : '{{stage.not_started}}') + (state ? '\n' + state : '');
  return { node, tip };
}

let _stageSelected = '';
function renderStageTabs() {
  const d = conceptStages();
  const panel = document.getElementById('decision-panel');
  let row = document.getElementById('stage-tabs');
  if (!d.stages.length || !panel) { if (row) row.remove(); return; }
  if (!_stageSelected) _stageSelected = _stStageOf(_stVisibleRound()) || d.stages[0].id;
  if (!row) {
    row = _stEl('div', 'stage-tabs');
    row.id = 'stage-tabs';
    const prev = _stEl('button', 'stage-arr stage-arr-prev', '‹');
    const next = _stEl('button', 'stage-arr stage-arr-next', '›');
    prev.type = next.type = 'button';
    prev.dataset.tip = '{{stage.prev}}';
    prev.setAttribute('aria-label', '{{stage.prev}}');
    next.dataset.tip = '{{stage.more}}';
    next.setAttribute('aria-label', '{{stage.more}}');
    const sc = _stEl('div', 'stage-tabs-sc');
    const list = _stEl('div', 'stage-tabs-in');
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', '{{stage.tabs}}');
    sc.appendChild(list);
    row.append(prev, sc, next);
    const step = (dir) => {
      const t = list.querySelector('.stage-tab');
      const w = t ? t.getBoundingClientRect().width + 4 : 72;
      if (typeof sc.scrollBy === 'function') sc.scrollBy({ left: dir * w, behavior: 'smooth' });
      else sc.scrollLeft += dir * w;
    };
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    sc.addEventListener('scroll', () => syncStageArrows(row), { passive: true });
    list.addEventListener('keydown', (e) => {
      const tabs = [...list.querySelectorAll('.stage-tab')];
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let to = -1;
      const nk = window.conceptNavKey ? window.conceptNavKey(e) : e.key;   // A / D = ← / →
      if (nk === 'ArrowRight') to = Math.min(tabs.length - 1, i + 1);
      else if (nk === 'ArrowLeft') to = Math.max(0, i - 1);
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = tabs.length - 1;
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStageTab(tabs[i].dataset.stageId); return; }
      if (to < 0) return;
      e.preventDefault();
      tabs.forEach((t, k) => { t.tabIndex = k === to ? 0 : -1; });
      tabs[to].focus();
      revealStageTab(tabs[to]);
    });
    const here = document.getElementById('panel-here');
    if (here && here.parentNode === panel) panel.insertBefore(row, here.nextSibling);
    else {
      const head = panel.querySelector('.panel-head');
      panel.insertBefore(row, head ? head.nextSibling : panel.firstChild);
    }
  }
  const list = row.querySelector('.stage-tabs-in');
  list.replaceChildren();
  d.stages.forEach(s => {
    const t = _stEl('button', 'stage-tab');
    t.type = 'button';
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-controls', 'stage-pane');
    t.dataset.stageId = s.id;
    t.dataset.state = _stState(s.id);
    t.dataset.stageState = _stStateRaw(s.id);
    const sel = s.id === _stageSelected;
    t.setAttribute('aria-selected', sel ? 'true' : 'false');
    t.tabIndex = sel ? 0 : -1;
    const nd = _stNode(s);
    t.append(nd.node, _stEl('span', 'stage-tn', s.name || ''));
    t.dataset.tip = nd.tip;
    t.setAttribute('aria-label', '{{stage.label}} ' + s.id + ' · ' + (s.name || '') + ' · ' + nd.tip.split('\n').join(' · '));
    t.addEventListener('click', () => selectStageTab(s.id));
    list.appendChild(t);
  });
  layoutStageTabs(row);
  renderStagePane();
}

// Size the viewport to whole tabs (no tab is ever cut) and flag overflow.
function layoutStageTabs(row) {
  const sc = row.querySelector('.stage-tabs-sc');
  const list = row.querySelector('.stage-tabs-in');
  const first = list.querySelector('.stage-tab');
  sc.style.width = '';
  row.style.removeProperty('--stage-tab-w');
  delete row.dataset.overflow;
  const avail = row.getBoundingClientRect().width;
  const w = first ? first.getBoundingClientRect().width : 0;
  if (!avail || !w) { syncStageArrows(row); return; }
  const gap = 4;
  const n = list.children.length;
  if (n * (w + gap) - gap <= avail + 0.5) {
    // Few Etappen: the stepper spans the row (names wrap less, never cut),
    // capped so two Etappen do not turn into wide slabs.
    const fill = Math.min(7 * 16, Math.floor((avail - gap * (n - 1)) / n));
    if (fill > w) row.style.setProperty('--stage-tab-w', fill + 'px');
  } else {
    row.dataset.overflow = '';
    const k = Math.max(1, Math.floor((avail - 36 + gap) / (w + gap)));
    sc.style.width = (k * (w + gap) - gap) + 'px';
  }
  syncStageArrows(row);
}
function syncStageArrows(row) {
  const sc = row.querySelector('.stage-tabs-sc');
  const prev = row.querySelector('.stage-arr-prev');
  const next = row.querySelector('.stage-arr-next');
  if (!sc || !prev || !next) return;
  prev.disabled = sc.scrollLeft <= 1;
  next.disabled = sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 1;
}
function revealStageTab(tab) {
  const sc = tab && tab.closest('.stage-tabs-sc');
  if (!sc || !sc.clientWidth) return;
  const l = tab.offsetLeft, r = l + tab.offsetWidth;
  if (l < sc.scrollLeft) sc.scrollLeft = l;
  else if (r > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = r - sc.clientWidth;
}

function selectStageTab(id) {
  _stageSelected = id;
  const row = document.getElementById('stage-tabs');
  if (!row) return;
  row.querySelectorAll('.stage-tab').forEach(t => {
    const on = t.dataset.stageId === id;
    t.setAttribute('aria-selected', on ? 'true' : 'false');
    t.tabIndex = on ? 0 : -1;
    if (on) revealStageTab(t);
  });
  renderStagePane();
}

function _stJump(sec, entryId) {
  if (typeof showIteration === 'function') showIteration(sec.dataset.iteration);
  if (entryId) {
    const target = document.getElementById(entryId);
    if (target && target.hasAttribute('data-screen') && typeof window.showScreen === 'function') {
      try { window.showScreen(entryId); } catch (e) { /* not a design round */ }
    } else if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'start' });
  }
  if (typeof window.closePanel === 'function') window.closePanel();
}
// One round: its "Runde N" row + its table of contents (the same entries the
// section TOC lists: section[id][data-nav-label]).
function _stRoundBlock(sec) {
  const frag = document.createDocumentFragment();
  const head = _stEl('button', 'stage-round', _stRoundLabel(sec));
  head.type = 'button';
  head.dataset.iteration = sec.dataset.iteration;
  head.addEventListener('click', () => _stJump(sec, null));
  frag.appendChild(head);
  const entries = [...sec.querySelectorAll('section[id][data-nav-label]')];
  if (entries.length) {
    const toc = _stEl('div', 'stage-toc');
    entries.forEach(s => {
      const b = _stEl('button', 'stage-ti', s.dataset.navLabel);
      b.type = 'button';
      b.addEventListener('click', () => _stJump(sec, s.id));
      toc.appendChild(b);
    });
    frag.appendChild(toc);
  }
  return frag;
}
// 🕘 disclosure for earlier rounds (newest first), not persisted.
function _stOlder(rounds) {
  const wrap = _stEl('div', 'stage-older-wrap');
  const btn = _stEl('button', 'stage-older-btn');
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  const chip = _stEl('span', 'stage-older-chip');
  const clock = _stEl('span', '', '🕘');
  clock.setAttribute('aria-hidden', 'true');
  chip.append(clock, document.createTextNode(' ' + rounds.length));
  const caret = _stEl('span', 'stage-older-caret', '▾');
  caret.setAttribute('aria-hidden', 'true');
  btn.append(chip, document.createTextNode('{{stage.older}}'), caret);
  const list = _stEl('div', 'stage-older');
  list.hidden = true;
  rounds.slice().reverse().forEach(sec => list.appendChild(_stRoundBlock(sec)));
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    list.hidden = !open;
  });
  wrap.append(btn, list);
  return wrap;
}

function renderStagePane() {
  const scroll = document.querySelector('#decision-panel .panel-nav-scroll');
  if (!scroll) return;
  const d = conceptStages();
  let pane = document.getElementById('stage-pane');
  let curOlder = document.getElementById('stage-cur-older');
  if (!d.stages.length) {
    if (pane) pane.remove();
    if (curOlder) curOlder.remove();
    delete scroll.dataset.stageView;
    return;
  }
  if (!pane) {
    pane = _stEl('div', 'stage-pane');
    pane.id = 'stage-pane';
    pane.setAttribute('role', 'tabpanel');
    scroll.insertBefore(pane, scroll.firstChild);
  }
  if (!curOlder) {
    curOlder = _stEl('div', 'stage-cur-older');
    curOlder.id = 'stage-cur-older';
    scroll.appendChild(curOlder);
  }
  const visible = _stVisibleRound();
  const visStage = _stStageOf(visible);
  const sel = _stageSelected || visStage;
  const rounds = _stRounds().filter(s => s.dataset.stage === sel);
  pane.replaceChildren();
  curOlder.replaceChildren();
  const report = _stReport(sel);
  if (sel === visStage) {
    delete scroll.dataset.stageView;
    pane.hidden = true;
    const earlier = rounds.filter(s => visible && Number(s.dataset.iteration) < Number(visible.dataset.iteration));
    if (report && report !== visible) curOlder.appendChild(_stReportRow(report));
    if (earlier.length) curOlder.appendChild(_stOlder(earlier));
    return;
  }
  scroll.dataset.stageView = 'other';
  pane.hidden = false;
  const start = _stStartControl(sel, rounds.length > 0);
  if (start) pane.appendChild(start);
  const stateLine = _stStateLine(sel);
  if (stateLine && _stStateRaw(sel) !== 'built') pane.appendChild(_stEl('p', 'stage-ahead', stateLine));
  if (report) pane.appendChild(_stReportRow(report));
  if (!rounds.length) return;
  const newest = rounds[rounds.length - 1];
  pane.appendChild(_stRoundBlock(newest));
  if (rounds.length > 1) pane.appendChild(_stOlder(rounds.slice(0, -1)));
}

// A built Etappe's own final report: one row, a jump like any round.
function _stReportRow(sec) {
  const b = _stEl('button', 'stage-round stage-report', stageReportHead(sec) || '🏁 {{final.phase}}');
  b.type = 'button';
  b.dataset.iteration = sec.dataset.iteration;
  b.addEventListener('click', () => _stJump(sec, null));
  return b;
}

// May this Etappe be started from its pane? Only an OPEN Etappe that is not
// the live one, and only from the live regular round (a frozen view and a
// live final report never start anything — there the close-out decides).
function stageCanStart(id) {
  if (!conceptStages().stages.length) return false;
  const live = _stLive();
  if (!live || live.hasAttribute('data-final-report')) return false;
  if (document.body.classList.contains('viewing-frozen')) return false;
  if (_stStateRaw(id) !== 'open') return false;
  return id !== _stLiveStage();
}
function _stBusy() {
  const phase = typeof journeyPhase === 'function' ? journeyPhase() : 'you';
  return phase === 'rethinking' || phase === 'finalizing' || phase === 'implementing';
}
// The start control at the top of an open Etappe's pane. It submits the live
// round (its answers go with it) as next-stage → this Etappe.
function _stStartControl(id, hasRounds) {
  if (!stageCanStart(id)) return null;
  const b = _stEl('button', 'stage-start');
  b.type = 'button';
  b.id = 'stage-start';
  b.dataset.next = id;
  const ico = _stEl('span', 'stage-start-ico', '▶');
  ico.setAttribute('aria-hidden', 'true');
  b.append(ico, _stEl('span', '', hasRounds ? '{{stage.start_again}}' : '{{stage.start}}'));
  b.dataset.tip = '{{stage.start_tip}}';
  b.disabled = _stBusy();
  b.addEventListener('click', () => {
    if (!stageCanStart(id) || _stBusy()) return;
    if (typeof submitWithAction === 'function') submitWithAction('next-stage', { stage: _stLiveStage(), next: id });
  });
  return b;
}

// The next OPEN Etappe after the live one, in list order, wrapping around.
function stageNextOpen() {
  const d = conceptStages();
  const ids = d.stages.map(s => s.id);
  const cur = _stLiveStage();
  const i = ids.indexOf(cur);
  for (let k = 1; k <= ids.length; k++) {
    const s = d.stages[((i < 0 ? -1 : i) + k + ids.length) % ids.length];
    if (s && s.id !== cur && _stStateRaw(s.id) === 'open') return s;
  }
  return null;
}

// Head + tab of a stage final report: "🏁 <Etappenname>"; an untagged
// report keeps "🏁 Abschluss" (null here).
function stageReportHead(sec) {
  if (!sec || !sec.hasAttribute('data-final-report') || !sec.dataset.stage) return null;
  const s = conceptStages().stages.find(x => x.id === sec.dataset.stage);
  return s ? '🏁 ' + (s.name || '{{stage.label}} ' + s.id) : null;
}
function labelStageReportTabs() {
  document.querySelectorAll('.iteration-tab[data-final-report]').forEach(tab => {
    const sec = [...document.querySelectorAll('section[data-iteration]')]
      .find(s => String(s.dataset.iteration) === String(tab.dataset.iteration));
    const name = stageReportHead(sec);
    if (!name || (sec && sec.hasAttribute('data-tab-label'))) return;
    tab.textContent = name;
    tab.dataset.tabLabel = name;
  });
  const vis = _stVisibleRound();
  const bar = document.querySelector('#frozen-bar [data-frozen-bar-title]');
  const head = stageReportHead(vis);
  if (bar && head && !(vis && vis.hasAttribute('data-active'))) bar.textContent = head;
}

// The implement station of a staged concept builds THIS Etappe only.
function stageImplementFields() {
  if (!conceptStages().stages.length) return {};
  const live = _stLive();
  if (!live || live.hasAttribute('data-final-report')) return {};
  const st = _stLiveStage();
  return st ? { stage: st } : {};
}
function renderStageImplement() {
  const btn = document.getElementById('submit-implement-btn');
  if (!btn) return;
  const b = btn.querySelector('.jr-ul-txt b');
  const small = btn.querySelector('.jr-ul-txt small');
  const staged = conceptStages().stages.length > 0;
  [[b, '{{stage.implement}}'], [small, '{{stage.implement_sub}}']].forEach(([el, text]) => {
    if (!el) return;
    if (el.dataset.unstaged == null) el.dataset.unstaged = el.textContent;
    el.textContent = staged ? text : el.dataset.unstaged;
  });
}

// Journey: the 🔒 · 🤖 · 🏁 stations always stand; "Nächste Etappe ›" sits
// above the row while another OPEN Etappe exists (the next one after the
// live Etappe in list order, wrapping).
function renderStageNext() {
  const live = _stLive();
  const cur = _stLiveStage();
  const next = conceptStages().stages.length ? stageNextOpen() : null;
  const isFinal = !!(live && live.hasAttribute('data-final-report'));
  let btn = document.getElementById('jr-next-stage');
  if (!next || isFinal) {
    delete document.body.dataset.stageNext;
    if (btn) btn.remove();
    return;
  }
  const row = document.getElementById('journey')
    || (typeof mountJourney === 'function' ? mountJourney() : null);
  if (!row) return;
  document.body.dataset.stageNext = '';
  if (!btn) {
    btn = _stEl('button', 'jr-next-stage');
    btn.type = 'button';
    btn.id = 'jr-next-stage';
    btn.addEventListener('click', () => {
      const n = btn.dataset.next;
      const s = btn.dataset.stage;
      if (typeof submitWithAction === 'function') submitWithAction('next-stage', { stage: s, next: n });
    });
    row.parentNode.insertBefore(btn, row);
  }
  btn.dataset.stage = cur;
  btn.dataset.next = next.id;
  btn.textContent = '{{stage.next}} ›';
  btn.dataset.tip = '{{stage.next_tip}}'.replace('{next}', next.id).replace('{name}', next.name || '');
  btn.disabled = _stBusy();
}

function renderStages() {
  const staged = conceptStages().stages.length > 0;
  if (staged) document.body.dataset.staged = ''; else delete document.body.dataset.staged;
  if (staged) labelStageReportTabs();
  renderRoundRow();
  renderStageTabs();
  renderStageNext();
  renderStageImplement();
}

(function bootStages() {
  const boot = () => {
    renderStages();
    document.addEventListener('iteration:changed', () => {
      _stageSelected = _stStageOf(_stVisibleRound());
      renderStages();
    });
    // Every panel open: the visible round's Etappe is the open tab, scrolled
    // into view (and the round row follows a nav rebuilt meanwhile).
    let wasOpen = document.body.classList.contains('panel-open');
    if (typeof MutationObserver === 'function') {
      new MutationObserver(() => {
        const open = document.body.classList.contains('panel-open');
        if (open && !wasOpen) {
          _stageSelected = _stStageOf(_stVisibleRound());
          renderStages();
          const t = document.querySelector('#stage-tabs .stage-tab[aria-selected="true"]');
          if (t) revealStageTab(t);
        }
        if (!open && wasOpen) renderStageNext();
        wasOpen = open;
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('resize', () => {
      const row = document.getElementById('stage-tabs');
      if (row) layoutStageTabs(row);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
```

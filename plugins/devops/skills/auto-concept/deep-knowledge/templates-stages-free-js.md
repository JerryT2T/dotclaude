# Concept templates, part 50 of 51: Shared systems — Etappen: the close-out of a stage report JS

## Etappen — stage close-out JS

The close-out sheet of a LIVE stage report (`section[data-final-report][data-stage="X"]`,
templates-stages.md § Stage reports). While another Etappe is `open` the sheet
gets the block **"Offene Etappen"** (`[data-closeout-group="stages"]`): per open
Etappe the three routes nachholen (default) · als Issue · streichen, and — when
at least one is kept open — **"Weiter mit"** among the kept ones (default: the
first in list order). While one stays open the sheet offers ONE go button,
`#closeout-stage-go` "Etappe abschließen und weiter", and hides the two ship
buttons and the 🧹 disposition; `#closeout-stage-plan` says what the click does.
Routing every remaining Etappe to Issue / streichen gives back today's full
close-out (both ship buttons, disposition). The choices are not persisted: a
reload re-arms the defaults. The hooks the close-out sheet calls are all
`typeof`-guarded: `closeoutGoOffered()` → `stageCloseoutOffers()`,
`renderCloseout()` → `renderStageCloseout()`, `submitFinalize()` →
`stageFinalizeFields()`.

```javascript
// ── Etappen: stage close-out (the "Offene Etappen" block) ──
let _stageRoutes = {};      // id → 'open' | 'issue' | 'drop'
let _stageNextPick = '';
const STAGE_ROUTES = ['open', 'issue', 'drop'];

// The live final report, when it is a stage report of a staged concept.
function stageReportSection() {
  const sec = typeof finalReportSection === 'function' ? finalReportSection() : null;
  if (!sec || !sec.dataset.stage || !conceptStages().stages.length) return null;
  return sec;
}
// The other Etappen this close-out asks about: every one still open.
function stageCloseoutOpen() {
  const rep = stageReportSection();
  if (!rep) return [];
  return conceptStages().stages.filter(s => s.id !== rep.dataset.stage && _stStateRaw(s.id) === 'open');
}
// What the click will do: {stage, stages:[{id, route}], next, final}, or null
// for an untagged report / a concept without Etappen.
function stageCloseoutPlan() {
  const rep = stageReportSection();
  if (!rep) return null;
  const stages = stageCloseoutOpen().map(s => ({
    id: s.id, route: STAGE_ROUTES.includes(_stageRoutes[s.id]) ? _stageRoutes[s.id] : 'open'
  }));
  const kept = stages.filter(r => r.route === 'open').map(r => r.id);
  const next = kept.includes(_stageNextPick) ? _stageNextPick : (kept[0] || null);
  return { stage: rep.dataset.stage, stages, next, final: kept.length === 0 };
}
function _stageContinues() {
  const p = stageCloseoutPlan();
  return !!(p && !p.final);
}
function stageCloseoutOffers(go) {
  const cont = _stageContinues();
  if (go === 'stage') return cont;
  if (go === 'yes' || go === 'no') return !cont;
  return true;
}
// The finalize additions. final:false ships nothing (ship.run false) and
// disposes of nothing (disposition null — the page stays, the session goes on).
function stageFinalizeFields() {
  const p = stageCloseoutPlan();
  if (!p) return {};
  const f = { stage: p.stage, stages: p.stages, next: p.next, final: p.final };
  if (!p.final) { f.ship = { run: false }; f.disposition = null; }
  return f;
}

function _stageName(id) {
  const s = conceptStages().stages.find(x => x.id === id);
  return s ? id + ' · ' + (s.name || '') : id;
}
function _stageRadio(name, value, label, checked) {
  const lab = _stEl('label', 'stage-co-opt');
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = !!checked;
  lab.append(input, _stEl('span', '', label));
  return lab;
}
const _STAGE_ROUTE_LABEL = { open: '{{stage.co_open}}', issue: '{{stage.co_issue}}', drop: '{{stage.co_drop}}' };

function renderStageCloseout(closed) {
  const sheet = document.getElementById('closeout-sheet');
  const body = document.getElementById('closeout-body');
  if (!sheet || !body) return;
  const plan = closed ? null : stageCloseoutPlan();
  let group = body.querySelector('[data-closeout-group="stages"]');
  const line = document.getElementById('closeout-stage-plan');
  if (!plan || !plan.stages.length) {
    if (group) group.hidden = true;
    if (line) line.hidden = true;
    delete sheet.dataset.stageContinue;
    return;
  }
  if (!group) {
    group = _stEl('section', 'closeout-group closeout-stages');
    group.dataset.closeoutGroup = 'stages';
    const h = _stEl('h3', 'closeout-gh');
    h.append(document.createTextNode('{{stage.co_heading}} '), _stEl('em', ''));
    h.lastChild.dataset.closeoutCount = '';
    group.append(h, _stEl('div', 'closeout-list stage-co-list'), _stEl('div', 'stage-co-next'));
    const empty = document.getElementById('closeout-empty');
    body.insertBefore(group, empty && empty.parentNode === body ? empty : null);
  }
  group.hidden = false;
  group.querySelector('[data-closeout-count]').textContent = String(plan.stages.length);
  const focusName = document.activeElement && group.contains(document.activeElement) ? document.activeElement.name : '';
  // One row per open Etappe: the name, then the three routes as one group.
  const list = group.querySelector('.stage-co-list');
  const rowKey = plan.stages.map(r => r.id).join(',');
  if (list.dataset.key !== rowKey) {
    list.dataset.key = rowKey;
    list.replaceChildren();
    plan.stages.forEach(r => {
      const row = _stEl('div', 'stage-co-row');
      row.dataset.stageRow = r.id;
      const name = _stEl('span', 'stage-co-name', _stageName(r.id));
      name.id = 'stage-co-name-' + r.id;
      const opts = _stEl('span', 'stage-co-opts');
      opts.setAttribute('role', 'radiogroup');
      opts.setAttribute('aria-labelledby', name.id);
      STAGE_ROUTES.forEach(v => opts.appendChild(_stageRadio('stage-route-' + r.id, v, _STAGE_ROUTE_LABEL[v], v === r.route)));
      row.append(name, opts);
      list.appendChild(row);
    });
  }
  plan.stages.forEach(r => {
    const row = list.querySelector('[data-stage-row="' + r.id + '"]');
    if (!row) return;
    row.dataset.route = r.route;
    row.querySelectorAll('input').forEach(i => { i.checked = i.value === r.route; });
  });
  // "Weiter mit": one choice among the kept-open Etappen.
  const nextBox = group.querySelector('.stage-co-next');
  const kept = plan.stages.filter(r => r.route === 'open').map(r => r.id);
  const nextKey = kept.join(',');
  if (nextBox.dataset.key !== nextKey) {
    nextBox.dataset.key = nextKey;
    nextBox.replaceChildren();
    if (kept.length) {
      const lab = _stEl('span', 'stage-co-name', '{{stage.co_next}}');
      lab.id = 'stage-co-next-label';
      const opts = _stEl('span', 'stage-co-opts');
      opts.setAttribute('role', 'radiogroup');
      opts.setAttribute('aria-labelledby', lab.id);
      kept.forEach(id => opts.appendChild(_stageRadio('stage-next', id, _stageName(id), id === plan.next)));
      nextBox.append(lab, opts);
    }
  }
  nextBox.hidden = kept.length === 0;
  nextBox.querySelectorAll('input').forEach(i => { i.checked = i.value === plan.next; });
  if (focusName) {
    const back = group.querySelector('input[name="' + focusName + '"]:checked') || group.querySelector('input[name="' + focusName + '"]');
    if (back && document.activeElement !== back) back.focus();
  }
  // The live plan: which Etappe comes next, which become issues, which go.
  if (line) {
    const ids = route => plan.stages.filter(r => r.route === route).map(r => r.id).join(', ');
    const parts = [];
    if (plan.next) parts.push('➜ ' + '{{stage.co_plan_next}}'.replace('{name}', _stageName(plan.next)));
    if (ids('issue')) parts.push('📌 ' + '{{stage.co_plan_issue}}'.replace('{ids}', ids('issue')));
    if (ids('drop')) parts.push('✕ ' + '{{stage.co_plan_drop}}'.replace('{ids}', ids('drop')));
    if (!plan.final) parts.push('{{stage.co_plan_noship}}');
    line.textContent = parts.join(' · ');
    line.hidden = parts.length === 0;
  }
  if (plan.final) delete sheet.dataset.stageContinue; else sheet.dataset.stageContinue = '';
}

// Route / "Weiter mit" changes re-render the block, the plan and the buttons.
document.addEventListener('change', e => {
  const t = e.target;
  if (!t || !t.matches || !t.matches('#closeout-sheet .stage-co-opts input[type="radio"]')) return;
  if (document.getElementById('closeout-sheet')?.dataset.frozen === 'true') return;
  if (t.name === 'stage-next') _stageNextPick = t.value;
  else _stageRoutes[t.name.replace(/^stage-route-/, '')] = t.value;
  renderStageCloseout(false);
  if (typeof updateCloseoutButton === 'function') updateCloseoutButton();
});
```

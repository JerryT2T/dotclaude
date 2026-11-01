# Concept templates, part 46 of 48: Template: analysis — engine UI JS (continued 2)

```javascript
  function prepIntro(inst, g) {
    const intro = g.intro;
    intro.tabIndex = -1;
    intro.style.setProperty('--c', g.color);
    intro.dataset.group = String(g.idx);
  }
  /** Topic page: "Thema n von N", title (<= 5 words), ring with the topic's share of the potential, its questions, the button. */
  function fillIntro(inst, st) {
    const g = st.group, el = st.el;
    el.textContent = '';
    const l2 = [...g.topic.children].find(c => c.getAttribute('data-alevel') === '2');
    const chip = inst.brief && inst.brief.querySelector('[data-briefing-topic="' + cssEsc(g.topic.id) + '"]');
    const share = chip ? Math.round(num(chip.dataset.share)) : 0;
    const hero = h('div', 'an-topic'), left = h('div', 'an-topic-l');
    left.appendChild(h('div', 'an-meta', L('Thema ', 'Topic ') + (g.idx + 1) + L(' von ', ' of ') + inst.groups.length));
    left.appendChild(h('h2', 'an-h', (l2 && l2.dataset.title) || g.label));
    const qs = h('div', 'an-tq');
    g.decs.forEach((s, i) => {
      const b = btn('an-tqi');
      b.dataset.go = String(inst.stages.indexOf(s));
      b.append(h('b', '', String(i + 1)), h('span', '', s.el.dataset.label || decId(s.el)));
      qs.appendChild(b);
    });
    left.appendChild(qs);
    left.appendChild(goButtons(inst, L('Starten', 'Start')));
    hero.appendChild(left);
    if (share) {
      const ring = h('div', 'an-ring');
      ring.style.setProperty('--p', clamp(share, 0, 100) + '%');
      const mid = h('div');
      mid.append(h('b', '', share + ' %'), h('small', '', L('des Potenzials', 'of the potential')));
      ring.appendChild(mid);
      hero.appendChild(ring);
    }
    el.appendChild(hero);
  }
  /** [Zurück] [Weiter] pair. */
  function goButtons(inst, nextLabel, opts) {
    opts = opts || {};
    const go2 = h('div', 'an-go');
    const back = btn('an-back', L('Zurück', 'Back'));
    tip(back, '', '⇧+Enter');
    back.addEventListener('click', () => step(inst, -1));
    const next = btn('an-btn' + (opts.glow ? ' an-glow' : ''), nextLabel || L('Weiter', 'Next'));
    tip(next, '', 'Enter');
    next.addEventListener('click', () => { next.classList.add('an-pressed'); step(inst, 1); });
    if (!opts.noBack) go2.appendChild(back);
    if (!opts.noNext) go2.appendChild(next);
    // No next button: an invisible one of the same width keeps Zurück where
    // it is on every other stage.
    else if (!opts.noBack && !opts.noPh) { const ph = h('span', 'an-go-ph'); ph.setAttribute('aria-hidden', 'true'); go2.appendChild(ph); }
    return go2;
  }

  /* ================= 5. a decision stage: finding -> question -> answer block ================= */
  const KIND = {
    single: ['Eine Antwort', 'One answer'], multi: ['Mehrere möglich', 'Several possible'], yesnoalt: ['Ja · Nein · Anders', 'Yes · No · Other'],
    slider: ['Wert wählen', 'Pick a value'], order: ['Reihenfolge', 'Order'], verify: ['Stimmt das?', 'Is this right?'], wording: ['Formulierung', 'Wording'],
    picture: ['Bild wählen', 'Pick a picture'], compare: ['Vergleich', 'Comparison'], chain: ['Weg wählen', 'Pick a route'], place: ['Platz wählen', 'Pick a spot'], points: ['Punkte verteilen', 'Distribute points']
  };
  function prepDecision(inst, st) {
    const d = st.el, id = decId(d), mode = d.dataset.decisionMode;
    d.classList.add('an-stage');
    d.tabIndex = -1;
    const opts = d.querySelector('[data-options]');
    const zone = h('div', 'an-zone');
    if (opts) { opts.parentNode.insertBefore(zone, opts); zone.appendChild(opts); }
    else { const a = d.querySelector('[data-context]') || d.querySelector('[data-question]'); if (a) a.after(zone); else d.appendChild(zone); }
    // "Davon hängt ab" sits under the question in the fixed-height question message.
    const q = d.querySelector('[data-question]'), stakes = d.querySelector('[data-stakes]');
    if (stakes && !stakes.querySelector('.an-k-l')) stakes.insertBefore(h('b', 'an-k-l', L('Davon hängt ab: ', 'What depends on it: ')), stakes.firstChild);
    // The line is ellipsised in the fixed-height question message: the full text is its tooltip.
    if (stakes) { tip(stakes, stakes.textContent.trim()); stakes.tabIndex = 0; }
    const fresh = !isTouched(d);
    const rec = recList(d);
    if (mode === 'multi') {
      if (fresh && rec.length && ![...d.querySelectorAll('input[type=checkbox]')].some(c => c.checked)) rec.forEach(r => { const c = ctl1(d, 'dm-' + id + '.' + r); if (c) c.checked = true; });
      d.querySelectorAll('input[type=checkbox][name^="dm-' + id + '."]').forEach(c => { const o = c.closest('[data-opt]'); if (o) o.classList.add('an-cb'); });
    } else if (mode === 'slider') {
      const r = d.querySelector('input[type=range]');
      if (r) buildSlider(inst, d, r, zone);
    } else if (mode === 'order') {
      buildOrder(inst, d, zone);
    } else if (mode === 'points') {
      buildPoints(inst, d, zone);
    } else if (fresh && rec.length && !ctl(d, 'dm-' + id).some(c => c.type === 'radio' && c.checked)) {
      const c = ctl(d, 'dm-' + id).find(x => x.value === rec[0]);
      if (c) c.checked = true;
    }
    if (mode === 'place') buildPlace(inst, d, zone);
    // ★ Empfohlen chip behind the label of the recommended option(s); the reason is its tooltip.
    const why = d.dataset.recWhy ? L('Warum: ', 'Why: ') + d.dataset.recWhy : L('Unsere Empfehlung', 'Our recommendation');
    const recP = mode === 'points' ? recPoints(d.dataset.rec) : null;
    d.querySelectorAll('[data-opt]').forEach((o, i) => {
      if (mode === 'order') return;
      o.querySelectorAll('[data-opt-preview]').forEach(p => { if (!p.querySelector('.an-k-l')) p.insertBefore(h('b', 'an-k-l', L('So sähe das aus: ', 'This would look like: ')), p.firstChild); });
      const item = o.getAttribute('data-opt');
      // points: data-rec is "item:n" pairs, so the badge shows the recommended points ("★ 5") per item.
      const isRec = recP ? (recP[item] || 0) > 0 : (rec.indexOf(item) >= 0 || o.hasAttribute('data-recommended'));
      if (isRec) {
        o.classList.add('an-rec');
        if (!o.querySelector('.an-badge')) {
          const b = h('span', 'an-badge', '★ ' + (recP ? recP[item] : L('Empfohlen', 'Recommended')));
          b.setAttribute('data-tip', why); b.tabIndex = 0;
          // The badge sits above the option's click overlay (its tooltip must be reachable) and never picks the row.
          b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); });
          (o.querySelector('[data-opt-label]') || o).appendChild(b);
        }
      }
      if (i < 9 && mode !== 'points') tip(o, '', String(i + 1));
    });
    // Inline fields that belong to one option (alt / fix / custom text).
    const inline = { yesnoalt: ['-alt', 'alt'], verify: ['-fix', 'partial|wrong'], wording: ['-text', 'custom'] }[mode];
    if (inline) {
      const f = ctl1(d, 'dm-' + id + inline[0]);
      if (f) {
        const wrap = h('label', 'an-inl');
        wrap.appendChild(h('span', '', { yesnoalt: L('Anders:', 'Other:'), verify: L('Korrektur:', 'Correction:'), wording: L('Eigene Formulierung:', 'Own wording:') }[mode]));
        f.parentNode.insertBefore(wrap, f);
        wrap.appendChild(f);
        wrap.dataset.when = inline[1];
        zone.appendChild(wrap);
        if (!f.placeholder) f.placeholder = L('kurz eintippen', 'type briefly');
      }
    }
    // An option can be deselected again: a click on the row that is already on
    // clears the choice (radios cannot do that natively). Nothing picked AND an
    // empty note = the question counts as untouched again (see answerEmpty).
    if (!['multi', 'slider', 'order', 'points'].includes(mode)) {
      d.querySelectorAll('[data-options] input[type=radio]').forEach(r => r.addEventListener('click', () => {
        if (r.checked && d.__sel && d.__sel === r.value) { r.checked = false; fire(r); }
      }));
    }
    // "Keine passt? Schreib deine Antwort unten ins Notizfeld.": a text link under the
    // answer block (not with slider / order, whose value is always an answer). It clears
    // the pick, sets dm-{id}-none and puts the cursor into the composer, whose note then
    // carries the answer.
    if (!['slider', 'order', 'points'].includes(mode)) {
      const none = btn('an-none', NONE_TXT());
      none.setAttribute('aria-pressed', 'false');
      none.disabled = frozenEl(d);
      none.addEventListener('click', () => setNone(inst, d, (ctl1(d, 'dm-' + id + '-none') || {}).value !== '1'));
      d.__none = none;
    }
    for (const nm of ['-none', '-hes']) if (!ctl1(d, 'dm-' + id + nm)) d.appendChild(newHidden(d, 'dm-' + id + nm, ''));
    // The note textarea is the storage target of the composer (data-comment stays); its 📎
    // bar stays beside it, the composer's 📎 opens it.
    let note = d.querySelector('[data-comment="' + cssEsc(id + '-note') + '"]');
    // No authored note: the engine adds the storage target, or the composer would drop the text.
    if (!note) {
      note = h('textarea');
      note.setAttribute('data-comment', id + '-note');
      if (frozenEl(d)) { note.readOnly = true; note.disabled = true; }
      d.appendChild(note);
    }
    const att = h('div', 'an-att');
    if (note) {
      note.classList.add('an-note', 'an-vh'); note.rows = 3;
      note.tabIndex = -1;
      note.setAttribute('aria-label', L('Notiz zu dieser Frage', 'Note on this question'));
      const key = note.getAttribute('data-comment');
      const bar = [...d.querySelectorAll('.attach-slot, .attach-bar')]
        .find(b => (b.getAttribute('data-attach-slot') || b.getAttribute('data-attach-for')) === key) || null;
      att.appendChild(note.closest('.field-row') || note);
      if (bar && !bar.contains(note)) note.after(bar);
    }
    const foot = h('div', 'an-foot'), quiet = h('div', 'an-quiet');
    const iss = btn('an-link', L('Als Issue anlegen (ggf. mit Epic)', 'Create an issue (with epic if needed)'));
    iss.setAttribute('aria-pressed', 'false');
    tip(iss, '', 'I');
    const epic = h('input'); epic.type = 'text'; epic.className = 'an-epic'; epic.hidden = true;
    epic.placeholder = L('Epic (optional)', 'Epic (optional)');
    epic.setAttribute('aria-label', 'Epic');
    if (frozenEl(d)) { iss.disabled = true; epic.disabled = true; epic.readOnly = true; }
    iss.addEventListener('click', () => toggleIssue(inst, d));
    epic.addEventListener('input', () => setHidden(d, '-epic', epic.value.trim()));
    quiet.append(iss, epic);
    foot.append(quiet, goButtons(inst));
    st.iss = iss; st.epic = epic;
    // Messages: finding (variable height), question (fixed height), answer block (capped).
    const fm = buildFinding(inst, st);
    const qm = msg('an-m-q'), qb = h('div', 'an-bub an-qb');
    if (q) qb.appendChild(q);
    if (stakes) qb.appendChild(stakes);
    qm.appendChild(qb);
    const am = h('div', 'an-m-a'), ans = h('div', 'an-ans');
    ans.appendChild(h('div', 'an-kind', L(KIND[mode][0], KIND[mode][1])));
    const ctx = d.querySelector('[data-context]');
    if (ctx) { ctx.classList.add('an-ans-hint'); ans.appendChild(ctx); }
    ans.appendChild(zone);
    if (d.__none) ans.appendChild(d.__none);
    am.append(ans, foot, att);
    d.insertBefore(am, d.firstChild);
    d.insertBefore(qm, am);
    d.insertBefore(fm, qm);
    syncDecision(d);
    d.__sig = answerSig(d);
  }
  /** What the user answered, as a string: a change counts only when this really differs. */
  function answerSig(d) { try { return JSON.stringify(entryOf(d).value); } catch (e) { return ''; } }
  const NONE_TXT = () => L('Keine passt? Schreib deine Antwort unten ins Notizfeld.', 'None fits? Write your answer in the note field below.');
  function setNone(inst, d, on) {
    if (frozen(inst)) return;
    if (on) {
      d.querySelectorAll('[data-options] input[type=radio], [data-options] input[type=checkbox]').forEach(c => { c.checked = false; });
    }
    setHidden(d, '-none', on ? '1' : '');
    markTouched(d);
    refresh(inst);
    if (on) focusComposer(inst);
  }
  function toggleIssue(inst, d) {
    if (frozen(inst)) return;
    const on = (ctl1(d, 'dm-' + decId(d) + '-issue') || {}).value !== '1';
    setHidden(d, '-issue', on ? '1' : '');
    if (!on) setHidden(d, '-epic', '');
    markTouched(d);
    refresh(inst);
  }
  function buildSlider(inst, d, r, zone) {
    const wrap = h('div', 'an-sl');
    const unit = d.dataset.unit || '';
    const top = h('div', 'an-sl-top');
    const out = h('span', 'an-sl-v');
    top.append(h('span', '', r.min + (unit ? ' ' + unit : '')), out, h('span', '', r.max + (unit ? ' ' + unit : '')));
    r.parentNode.insertBefore(wrap, r);
    wrap.append(top, r);
    const rec = num(d.dataset.rec);
    const recRow = h('div', 'an-sl-rec');
    const badge = h('span', 'an-badge', '★ ' + L('Empfohlen', 'Recommended') + ' · ' + fmt(rec) + (unit ? ' ' + unit : ''));
    badge.setAttribute('data-tip', d.dataset.recWhy ? L('Warum: ', 'Why: ') + d.dataset.recWhy : L('Unsere Empfehlung', 'Our recommendation'));
    badge.tabIndex = 0;
    const pct = (num(r.max) - num(r.min)) ? (rec - num(r.min)) / (num(r.max) - num(r.min)) * 100 : 0;
    badge.style.left = clamp(pct, 8, 92) + '%';
    recRow.appendChild(badge);
    wrap.appendChild(recRow);
    zone.appendChild(wrap);
    tip(r, d.dataset.label || '');
    r.setAttribute('data-tip-key', '← →');
    // Live consequences: data-stops='[{"at":4,"text":"…"}]' - the text of the last stop at or below the value.
    let stops = [];
    try { stops = JSON.parse(d.dataset.stops || '[]'); } catch (e) { stops = []; }
    if (!Array.isArray(stops)) stops = [];
    const cons = h('div', 'an-sl-cons');
    cons.setAttribute('aria-live', 'polite');
    cons.hidden = !stops.length;
    wrap.appendChild(cons);
    d.__slider = { r, out, unit, cons, stops };
    syncSlider(d);
  }
  function syncSlider(d) {
    const s = d.__slider;
    if (!s) return;
    const min = num(s.r.min), max = num(s.r.max) || 100;
    s.out.innerHTML = esc(fmt(s.r.value)) + (s.unit ? '<small>' + esc(s.unit) + '</small>' : '');
    s.r.style.setProperty('--an-p', clamp((num(s.r.value) - min) / ((max - min) || 1) * 100, 0, 100) + '%');
    if (s.cons && s.stops.length) {
      const v = num(s.r.value);
      let hit = null;
      s.stops.forEach(st => { if (num(st.at) <= v && (!hit || num(st.at) >= num(hit.at))) hit = st; });
      if (!hit) hit = s.stops.reduce((a, b) => (num(b.at) < num(a.at) ? b : a));
      s.cons.textContent = hit ? String(hit.text || '') : '';
    }
  }
  function buildOrder(inst, d, zone) {
    const hid = ctl1(d, 'dm-' + decId(d));
    const opts = d.querySelector('[data-options]');
    if (opts) opts.hidden = true;
    const ol = h('ol', 'an-ord');
    ol.setAttribute('aria-label', d.dataset.label || '');
    zone.appendChild(ol);
    if (hid && !hid.value && d.dataset.rec && !isTouched(d)) hid.value = recList(d).join(',');
    d.__order = { hid, ol, sig: '' };
    syncOrder(inst, d);
    let dragged = null;
    ol.addEventListener('dragstart', e => { dragged = e.target.closest('.an-oi'); if (dragged) { dragged.classList.add('an-drag'); e.dataTransfer && (e.dataTransfer.effectAllowed = 'move'); } });
    ol.addEventListener('dragover', e => { e.preventDefault(); const over = e.target.closest('.an-oi'); if (!dragged || !over || over === dragged) return; const r = over.getBoundingClientRect(); ol.insertBefore(dragged, e.clientY < r.top + r.height / 2 ? over : over.nextSibling); });
    ol.addEventListener('dragend', () => { if (dragged) dragged.classList.remove('an-drag'); dragged = null; writeOrder(inst, d); });
    ol.addEventListener('keydown', e => {
      const it = e.target.closest('.an-oi');
      if (!it) return;
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); moveItem(inst, d, it, e.key === 'ArrowUp' ? -1 : 1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); const n = e.key === 'ArrowUp' ? it.previousElementSibling : it.nextElementSibling; if (n) n.focus(); }
    });
  }
  function syncOrder(inst, d) {
    const o = d.__order;
    if (!o || !o.hid) return;
    const ids = o.hid.value.split(',').map(s => s.trim()).filter(Boolean);
    if (o.sig === o.hid.value) return;
    o.sig = o.hid.value;
    o.ol.textContent = '';
    ids.forEach((id, i) => {
      const li = h('li', 'an-oi'); li.draggable = !frozenEl(d); li.tabIndex = 0; li.dataset.id = id;
      const lab = h('span', 'an-ol', optLabel(d, id));
      const c = optCons(optEl(d, id));
      if (c) lab.appendChild(h('small', '', c));
      const bs = h('span', 'an-ob'), up = btn('', '▲'), dn = btn('', '▼');
      up.setAttribute('aria-label', L('Nach oben', 'Move up')); dn.setAttribute('aria-label', L('Nach unten', 'Move down'));
      tip(up, L('Nach oben · Alt+↑', 'Move up · Alt+↑')); tip(dn, L('Nach unten · Alt+↓', 'Move down · Alt+↓'));
      up.disabled = dn.disabled = frozenEl(d);
      up.addEventListener('click', () => moveItem(inst, d, li, -1)); dn.addEventListener('click', () => moveItem(inst, d, li, 1));
      bs.append(up, dn);
      li.append(h('b', '', String(i + 1)), lab, bs);
      o.ol.appendChild(li);
    });
  }
  function moveItem(inst, d, it, dir) {
    if (frozen(inst)) return;
    const o = d.__order, ref = dir < 0 ? it.previousElementSibling : it.nextElementSibling;
    if (!ref) return;
    if (dir < 0) o.ol.insertBefore(it, ref); else o.ol.insertBefore(ref, it);
    writeOrder(inst, d);
    it.focus();
  }
  function writeOrder(inst, d) {
    const o = d.__order;
    if (frozen(inst)) return;
    const ids = [...o.ol.children].map(li => li.dataset.id);
    [...o.ol.children].forEach((li, i) => { li.firstChild.textContent = String(i + 1); });
    o.sig = ids.join(',');
    if (o.hid.value !== o.sig) { o.hid.value = o.sig; fire(o.hid); }
  }
  /* ----- points: Fibonacci steps per item, a budget that scales with the item count ----- */
  const POINT_STEPS = [1, 2, 3, 5, 8];
  /** Budget for n items: 3 per item plus 1 (2 items 7, 3 items 10, 4 items 13, 5 items 16). */
  const pointsBudget = n => 3 * n + 1;
  const recPoints = s => { const o = {}; String(s || '').split(/[\s,]+/).filter(Boolean).forEach(t => { const k = t.split(':'); if (k[0]) o[k[0]] = Math.max(0, Math.round(Number(k[1]) || 0)); }); return o; };
  const ptsOf = (d, item) => Math.max(0, Math.round(Number(d.__pts.hids[item].value) || 0));
  const ptsSpent = d => Object.keys(d.__pts.hids).reduce((a, k) => a + ptsOf(d, k), 0);
  function buildPoints(inst, d, zone) {
    const id = decId(d), rows = [...d.querySelectorAll('[data-opt]')];
    const items = rows.map(o => o.getAttribute('data-opt'));
    const recP = recPoints(d.dataset.rec);
    const blank = !isTouched(d) && !items.some(it => (ctl1(d, 'dm-' + id + '.' + it) || {}).value);
    const hids = {};
    rows.forEach(o => {
      const item = o.getAttribute('data-opt');
      let hid = ctl1(d, 'dm-' + id + '.' + item);
      if (!hid) { hid = newHidden(d, 'dm-' + id + '.' + item, ''); o.appendChild(hid); }
      if (blank) hid.value = recP[item] ? String(recP[item]) : '';
      hids[item] = hid;
    });
    const bar = h('div', 'an-pts-bar'), left = h('span', 'an-pts-left'), meter = h('span', 'an-pts-meter'), fill = h('i');
    meter.appendChild(fill);
    bar.append(left, meter);
    zone.insertBefore(bar, zone.firstChild);
    d.__pts = { budget: pointsBudget(items.length), hids, rows: {}, left, fill };
    rows.forEach(o => {
      const item = o.getAttribute('data-opt'), steps = h('span', 'an-pts');
      steps.setAttribute('role', 'group');
      steps.setAttribute('aria-label', optLabel(d, item));
      const bs = POINT_STEPS.map(s => {
        const b = btn('an-pt', String(s));
        b.dataset.pts = String(s);
        b.setAttribute('aria-label', optLabel(d, item) + ': ' + s);
        b.addEventListener('click', () => setPoints(d, item, s));
        return b;
      });
      steps.append.apply(steps, bs);
      o.appendChild(steps);
      d.__pts.rows[item] = { o, bs };
    });
    syncPoints(d);
  }
  /** Sets an item to s points (the same step again = 0); refuses what would exceed the budget. */
  function setPoints(d, item, s) {
    const p = d.__pts, hid = p && p.hids[item];
    if (!hid || hid.disabled) return false;
    const cur = ptsOf(d, item), next = cur === s ? 0 : s;
    if (ptsSpent(d) - cur + next > p.budget) return false;
    hid.value = next ? String(next) : '';
    hid.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function syncPoints(d) {
    const p = d.__pts;
    if (!p) return;
    const spent = ptsSpent(d), left = p.budget - spent;
    p.left.innerHTML = L('Übrig: ', 'Left: ') + '<b>' + left + '</b> ' + L('von ', 'of ') + p.budget + L(' Punkten', ' points');
    p.left.classList.toggle('an-pts-zero', left === 0);
    p.fill.style.width = clamp(left / p.budget * 100, 0, 100) + '%';   // shows what is LEFT: an empty bar = all handed out
    Object.keys(p.rows).forEach(k => {
      const cur = ptsOf(d, k), r = p.rows[k];
      r.o.classList.toggle('is-on', cur > 0);
      r.bs.forEach(b => {
        const s = Number(b.dataset.pts);
        b.classList.toggle('an-pt-on', cur === s);
        b.setAttribute('aria-pressed', cur === s ? 'true' : 'false');
        b.disabled = p.hids[k].disabled || (cur !== s && spent - cur + s > p.budget);
      });
    });
  }
  /* ----- place: a slot on a sketch AND the list beside it select the same value ----- */
  function buildPlace(inst, d, zone) {
    const sk = d.querySelector('[data-place-sketch]'), opts = zone.querySelector('[data-options]');
    if (!sk || !opts) return;
    const id = decId(d), wrap = h('div', 'an-place');
    zone.insertBefore(wrap, opts);
    wrap.append(sk, opts);
    const slots = [...sk.querySelectorAll('[data-slot-for]')];
    slots.forEach(s => {
      const v = s.getAttribute('data-slot-for'), o = optEl(d, v), lab = o ? optLabel(d, v) : v;
      s.setAttribute('tabindex', '0');
      s.setAttribute('role', 'radio');
      s.setAttribute('aria-label', lab);
      tip(s, lab);
      const pick = () => { const c = ctl(d, 'dm-' + id).find(x => x.value === v); if (c && !c.disabled) c.click(); };
      s.addEventListener('click', pick);
      s.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(); } });
      if (o) {
        o.addEventListener('mouseenter', () => s.classList.add('an-slot-hot'));
        o.addEventListener('mouseleave', () => s.classList.remove('an-slot-hot'));
        s.addEventListener('mouseenter', () => o.classList.add('an-hot'));
        s.addEventListener('mouseleave', () => o.classList.remove('an-hot'));
      }
    });
    d.__place = { slots };
    syncPlace(d);
  }
  function syncPlace(d) {
    const p = d.__place;
    if (!p) return;
    p.slots.forEach(s => {
      const on = s.getAttribute('data-slot-for') === d.__sel;
      s.classList.toggle('an-slot-on', on);
      s.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  /** Keeps the option cards / inline fields / slider / order list in step with the controls. */
  function syncDecision(d) {
    d.querySelectorAll('[data-opt]').forEach(o => { const i = o.querySelector('input'); if (i) o.classList.toggle('is-on', !!i.checked); });
    const id = decId(d), checked = ctl(d, 'dm-' + id).find(c => c.type === 'radio' && c.checked);
    d.__sel = checked ? checked.value : '';
    if (d.__none) {
      const on = (ctl1(d, 'dm-' + id + '-none') || {}).value === '1';
      d.__none.setAttribute('aria-pressed', on ? 'true' : 'false');
      d.__none.textContent = on ? '✓ ' + L('Keine passt — deine Antwort steht im Notizfeld unten', 'None fits — your answer is in the note field below') : NONE_TXT();
      d.classList.toggle('an-is-none', on);
      const i0 = instances.find(i => i.root.contains(d));
      // Only the OPEN question owns the composer's placeholder (refresh() syncs every decision).
      if (i0 && i0.comp && (i0.stages[i0.idx] || {}).el === d) i0.comp.ed.dataset.ph = on ? L('Deine Antwort, da keine Option passt …', 'Your answer, since no option fits …') : L('Notiz an devops … (optional)', 'Note to devops … (optional)');
    }
    d.querySelectorAll('.an-inl').forEach(w => {
      const on = !!checked && w.dataset.when.split('|').indexOf(checked.value) >= 0;
      w.classList.toggle('an-show', on);
    });
    syncSlider(d);
    syncPoints(d);
    syncPlace(d);
    const inst = instances.find(i => i.root.contains(d));
    if (d.__order && inst) syncOrder(inst, d);
    const st = inst && inst.decs.find(x => x.el === d);
    if (st && st.iss) {
      const on = (ctl1(d, 'dm-' + id + '-issue') || {}).value === '1';
      st.iss.setAttribute('aria-pressed', on ? 'true' : 'false');
      st.iss.textContent = on ? '✓ ' + L('Wird als Issue angelegt', 'Will become an issue') : L('Als Issue anlegen (ggf. mit Epic)', 'Create an issue (with epic if needed)');
      st.epic.hidden = !on;
      const ev = ctl1(d, 'dm-' + id + '-epic');
      if (ev && !st.epic.value) st.epic.value = ev.value;
    }
  }
  /** Radio decision with no option picked, no note and no issue: nothing was answered. */
  function answerEmpty(d) {
    if (['multi', 'slider', 'order', 'points'].includes(d.dataset.decisionMode)) return false;
    const id = decId(d), note = d.querySelector('.an-note');
    return !ctl(d, 'dm-' + id).some(c => c.type === 'radio' && c.checked)
      && (ctl1(d, 'dm-' + id + '-none') || {}).value !== '1'
      && !(note && note.value.trim())
      && (ctl1(d, 'dm-' + id + '-issue') || {}).value !== '1';
  }
  function onEdit(inst, e) {
    const d = e.target.closest && e.target.closest('[data-decision][data-decision-mode]');
    if (!d) return;
    const n = e.target.name || '';
    if (/-touched$/.test(n)) { refresh(inst); return; }
    if (/-hes$/.test(n)) return;
    // Picking an option again withdraws "Keine passt".
    if ((e.target.type === 'radio' || e.target.type === 'checkbox') && e.target.checked && e.target.closest('[data-options]')) setHidden(d, '-none', '');
    syncDecision(d);
    if (e.target.classList && e.target.classList.contains('an-epic')) return;
    // The second and every further CHANGE of the answer counts like a revisit (hesitation signal):
    // only a 'change' event of an answer control (a radio click fires input + change, a slider drag
    // many inputs and one change, a note keystroke none of them), and only when the answer differs.
    const pts = d.dataset.decisionMode === 'points' && n.indexOf('dm-' + decId(d) + '.') === 0;
    if (e.type === 'change' && (/^(radio|checkbox|range)$/.test(e.target.type) || pts) && !/-(none|touched|issue|epic|hes|alt|fix|text)$/.test(n)) {
      const sig = answerSig(d);
      if (sig !== d.__sig) {
        d.__sig = sig;
        const r = hesEntry(inst, decId(d));
        r.changes = (r.changes || 0) + 1;
        if (r.changes > 1) r.revisits++;
      }
    }
    if (e.target.type === 'radio' && d.dataset.decisionMode === 'wording' && e.target.value === 'custom') { const t = ctl1(d, 'dm-' + decId(d) + '-text'); if (t) t.focus(); }
    if (answerEmpty(d)) { if (!setHidden(d, '-touched', '')) refresh(inst); return; }
    if (!markTouched(d)) refresh(inst);
  }
  function refresh(inst) {
    inst.decs.forEach(st => syncDecision(st.el));
    refreshNav(inst);
    if (typeof updateSectionNavState === 'function') updateSectionNavState();
  }

  /* ================= 6. hesitation: dwell, note length, revisits ================= */
  // Per decision the page writes { ms, revisits, median } into the hidden dm-{id}-hes (so
  // collect / bake / freeze carry it); collectModeDecision() turns it into
  // hesitation { ms, noteWords, revisits, flagged }. ms counts ONLY while the stage is
  // visible AND the window focused (timestamps, back-and-forth summed).
  const hesEntry = (inst, id) => inst.hes[id] || (inst.hes[id] = { ms: 0, revisits: 0, changes: 0, since: 0 });
  const shown = inst => !inst.root.closest('[hidden]') && inst.root.getClientRects().length > 0;
  const hesLive = inst => !document.hidden && (typeof document.hasFocus !== 'function' || document.hasFocus()) && shown(inst);
  function hesStart(inst) {
    const st = inst.stages[inst.idx];
    if (!st || st.kind !== 'dec' || frozen(inst) || !hesLive(inst)) return;
    const e = hesEntry(inst, decId(st.el));
    if (!e.since) e.since = Date.now();
  }
  function hesStop(inst, credit) {
    const now = Date.now(), vis = credit || shown(inst);
    // A view / iteration tab switch hides the whole analysis: what ran while it was hidden is not dwell.
    Object.keys(inst.hes).forEach(id => { const e = inst.hes[id]; if (e.since) { if (vis) e.ms += Math.max(0, now - e.since); e.since = 0; } });
  }
  /** Reads a stored dm-{id}-hes (a baked round, a reload) into the live record, before the first stage opens. */
  function loadHes(inst) {
    inst.decs.forEach(st => {
      const id = decId(st.el), c = ctl1(st.el, 'dm-' + id + '-hes');
      if (!c || !c.value) return;
      let r = null;
      try { r = JSON.parse(c.value); } catch (e) { r = null; }
      if (!r || typeof r !== 'object') return;
      const e = hesEntry(inst, id);
      if (!e.ms && !e.revisits) { e.ms = Math.max(0, num(r.ms)); e.revisits = Math.max(0, num(r.revisits)); }
      if (typeof r.sharpen === 'boolean' && !inst.sharpen.has(id)) inst.sharpen.set(id, r.sharpen);
    });
  }
  /** Storage was filled from outside (reload restore, bridge draft): re-read the engine's state and the open stage's note. */
  function restored() {
    instances.forEach(inst => {
      loadHes(inst);
      refresh(inst);
      const st = inst.stages[inst.idx], store = storeOf(inst, st);
      if (!st || !store || !inst.comp) return;
      const want = store.value || '', have = compText(inst.comp.ed);
      if (want !== (have ? (inst.tag ? '[' + inst.tag + '] ' : '') + have : '')) loadComposer(inst, st);
    });
  }
  /** Writes every record now (the collect path calls this before reading dm-{id}-hes). */
  function flushAll() {
    instances.forEach(inst => { if (inst.__flushing) return; inst.__flushing = true; try { hesFlush(inst); } finally { inst.__flushing = false; } });
  }
  function hesMedian(inst) {
    const v = inst.decs.map(st => (inst.hes[decId(st.el)] || {}).ms || 0).filter(x => x > 0).sort((a, b) => a - b);
    if (!v.length) return 0;
    return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  }
  /** The signal of one decision as the page sees it now: the stored record, the closing toggle wins. */
  function hesOf(inst, st) {
    const id = decId(st.el), e = inst.hes[id] || { ms: 0, revisits: 0 }, median = hesMedian(inst);
    const note = ((st.el.querySelector('.an-note') || {}).value || '');
    const h0 = { ms: Math.round(e.ms), noteWords: typeof noteWordCount === 'function' ? noteWordCount(note) : 0, revisits: e.revisits || 0 };
    const auto = typeof hesitationFlag === 'function' ? hesitationFlag(h0, median) : false;
    h0.flagged = inst.sharpen.has(id) ? inst.sharpen.get(id) : auto;
    h0.median = median;
    return h0;
  }
  /** Stops the clock, writes every record, restarts the clock (unless the window left). */
  function hesFlush(inst, idle, credit) {
    hesStop(inst, credit);
    inst.decs.forEach(st => {
      const id = decId(st.el), e = inst.hes[id];
      if (!e && !inst.sharpen.has(id)) return;
      const o = hesOf(inst, st), rec = { ms: o.ms, revisits: o.revisits, median: Math.round(o.median) };
      if (inst.sharpen.has(id)) rec.sharpen = inst.sharpen.get(id);
      setHidden(st.el, '-hes', JSON.stringify(rec));
    });
    if (!idle) hesStart(inst);
  }

  /* ================= 7. navigation, touched timer, peeks ================= */
  const TOUCH_MS = 3000;
  const canTouch = inst => !inst.root.closest('[hidden], [data-baked]') && !document.hidden && inst.root.getClientRects().length > 0;
  function armTouch(inst) {
    clearTimeout(inst.touchTimer);
    const st = inst.stages[inst.idx];
    if (!st || st.kind !== 'dec' || !canTouch(inst) || answerEmpty(st.el)) return;
    inst.touchTimer = setTimeout(() => { if (inst.stages[inst.idx] === st && canTouch(inst)) markTouched(st.el); }, TOUCH_MS);
  }
  /** The next stage peeks in below ("Als Nächstes: …", a click goes there). */
  function peeks(inst, st) {
    const k = inst.seq.indexOf(st), next = inst.seq[k + 1];
    const dn = inst.peekDn;
    dn.textContent = '';
    dn.hidden = !next;
    if (next) {
      dn.dataset.go = String(inst.stages.indexOf(next));
      dn.append(document.createTextNode(L('Als Nächstes: ', 'Next: ')), h('b', '', stageLabel(inst, next)));
    }
  }
  function go(inst, i, opt) {
    opt = opt || {};
    i = clamp(Number.isFinite(i) ? i : 0, 0, inst.stages.length - 1);
    const prev = inst.stages[inst.idx], st = inst.stages[i];
    hesStop(inst);
    // Going to the stage that is already open is no visit (rail item, Shift+Enter, left arrow on the first question ...).
    const same = i === inst.idx;
    if (!opt.initial && !same && prev && prev.kind === 'dec') inst.visited.add(decId(prev.el));
    if (!opt.initial && !same && st.kind === 'dec' && inst.visited.has(decId(st.el))) hesEntry(inst, decId(st.el)).revisits++;
    inst.idx = i;
    inst.maxIdx = Math.max(inst.maxIdx, i);
    // The messages of a stage enter one after another on its FIRST visit only (never with reduced motion).
    const first = !inst.seen.has(i) && !reduced();
    inst.seen.add(i);
    // A running enter sequence ends with the stage: its pending messages simply show.
    inst.timers.forEach(clearTimeout);
    inst.timers = [];
    inst.root.querySelectorAll('.an-wait, .an-enter').forEach(n => n.classList.remove('an-wait', 'an-enter'));
    inst.stages.forEach(s => { s.el.classList.toggle('an-off', s !== st); s.el.classList.remove('an-first'); });
    inst.groups.forEach(g => g.topic.classList.toggle('an-off', st.group !== g));
    if (inst.brief) inst.brief.classList.toggle('an-off', st.kind !== 'brief');
    inst.root.dataset.anStage = st.kind;
    if (st.kind === 'topic') fillIntro(inst, st);
    else if (st.kind === 'review') fillReview(inst, st);
    else if (st.kind === 'done') fillDone(inst, st);
    // Every stage opens at its top: the finding is what the user sees first.
    if (inst.chat) { inst.userScroll = false; inst.chat.scrollTop = 0; }
    // First stage: no way back — hidden, not dimmed; visibility keeps its space so Weiter stays put (#962).
    const firstSt = st === inst.seq[0];
    inst.root.querySelectorAll('.an-back').forEach(x => { x.disabled = firstSt; x.style.visibility = firstSt ? 'hidden' : ''; });
    peeks(inst, st);
    loadComposer(inst, st);
    fitChat(inst);
    if (first) {
      st.el.classList.add('an-first');
      if (st.kind === 'dec') enterSeq(inst, st);
    }
    if (st.kind === 'dec') syncDecision(st.el);
    refreshNav(inst);
    if (typeof updateSectionNavState === 'function') updateSectionNavState();
    armTouch(inst);
    hesFlush(inst);
    if (!opt.initial) {
      if (!opt.noFocus) st.el.focus({ preventScroll: true });
      if (typeof inst.root.scrollIntoView === 'function') inst.root.scrollIntoView({ block: 'nearest' });
    }
    const navItem = document.querySelector('.section-nav-item[data-section-id="' + cssEsc((st.group && st.kind === 'topic') ? st.group.topic.id : st.el.id || '') + '"]');
    if (navItem && typeof setActiveNavItem === 'function') setActiveNavItem(navItem);
    inst.root.dispatchEvent(new CustomEvent('conceptanalysis:stage', { bubbles: true, detail: { index: i, kind: st.kind } }));
  }
  /** The chat fills the rest of the viewport below the title, so the composer sits at the same y on every stage. */
  function fitChat(inst) {
    if (inst.lite) return;
    const cc = inst.root.closest('.concept-content'), se = document.scrollingElement;
    const top = inst.root.getBoundingClientRect().top + (se ? se.scrollTop : 0) + (cc ? cc.scrollTop : 0);
    const padB = parseFloat(getComputedStyle(cc || document.body).paddingBottom) || 0;
    const avail = window.innerHeight - top - padB;
    inst.root.style.height = Math.max(320, Math.floor(avail)) + 'px';
  }
  /** First visit of a question: finding now, question after 2.7 s, answer block (+ "Als Nächstes") after 5.4 s.
   *  A message that has not entered is display:none, so no empty area waits below; each entry
   *  glides the chat down just far enough to show it - unless the user scrolled (user scroll wins). */
  const ENTER_GAP = 2700;
  function enterSeq(inst, st) {
    const parts = [st.el.querySelector(':scope > .an-m-find'), st.el.querySelector(':scope > .an-m-q'), st.el.querySelector(':scope > .an-m-a')].filter(Boolean);
    if (!parts.length) return;
    const tail = [inst.peekDn];
    parts.slice(1).concat(tail).forEach(n => n.classList.add('an-wait'));
    parts[0].classList.add('an-enter');
    parts.slice(1).forEach((n, i) => {
      inst.timers.push(setTimeout(() => {
        if (inst.stages[inst.idx] !== st) return;
        n.classList.remove('an-wait');
        n.classList.add('an-enter');
        if (n === parts[parts.length - 1]) tail.forEach(t => t.classList.remove('an-wait'));
        glide(inst, n, parts[Math.min(i + 1, 1)]);   // the answer never pushes the question out of view
      }, ENTER_GAP * (i + 1)));
    });
    if (parts.length === 1) tail.forEach(t => t.classList.remove('an-wait'));
    inst.timers.push(setTimeout(() => { if (inst.stages[inst.idx] === st) pulse(st.el); }, 1650));
  }
  /** Soft scroll of the chat until the message that just entered is fully visible - but never past the
   *  top of `keep` (the question stays in view while its answer block enters). */
  function glide(inst, el, keep) {
    const c = inst.chat;
    if (!c || inst.userScroll) return;
    // Layout positions (offsetTop ignores the enter transform the message still carries).
    const at = n => { let y = 0; while (n && n !== c) { y += n.offsetTop; n = n.offsetParent; } return y; };
    const from = c.scrollTop, max = c.scrollHeight - c.clientHeight, top = at(el);
    const toBottom = top + el.offsetHeight + 16 - c.clientHeight, toTop = (keep && keep !== el ? at(keep) : top) - 12;
    const to = clamp(Math.min(toBottom, toTop), 0, Math.max(0, max));
    if (to <= from + 1) return;
    if (reduced() || typeof requestAnimationFrame !== 'function') { c.scrollTop = to; return; }
    const t0 = performance.now(), dur = 900;
    inst.autoTop = from;
    inst.gliding = true;
    let ran = false;
    const frame = now => {
      ran = true;
      if (inst.userScroll || !inst.gliding) { inst.gliding = false; return; }
      const p = Math.min(1, (now - t0) / dur), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      c.scrollTop = from + (to - from) * e;
      inst.autoTop = c.scrollTop;
      if (p < 1) requestAnimationFrame(frame); else inst.gliding = false;
    };
    requestAnimationFrame(frame);
    // No frames (a background tab throttles them): land on the target instead of staying put.
    setTimeout(() => { if (!ran && inst.gliding && !inst.userScroll) { inst.gliding = false; c.scrollTop = to; } }, 250);
  }
  /** Any scroll the user does himself (wheel, touch, scrollbar, keys) stops the auto-scroll for this stage. */
  function watchUserScroll(inst) {
    const c = inst.chat;
    if (!c) return;
    const stop = () => { inst.userScroll = true; inst.gliding = false; };
    c.addEventListener('wheel', stop, { passive: true });
    c.addEventListener('touchmove', stop, { passive: true });
    c.addEventListener('pointerdown', e => { if (e.target === c) stop(); });   // the scrollbar
    c.addEventListener('keydown', e => { if (/^(PageUp|PageDown|Home|End| )$/.test(e.key) && !(e.target && e.target.isContentEditable)) stop(); });
    // A scroll position the glide did not set is the user's (scrollbar drag, middle-click autoscroll ...).
    c.addEventListener('scroll', () => { if (inst.gliding && Math.abs(c.scrollTop - inst.autoTop) > 3) stop(); }, { passive: true });
  }
  window.addEventListener('resize', () => instances.forEach(fitChat));
  function step(inst, dir) {
    const cur = inst.stages[inst.idx];
    const k = inst.seq.indexOf(cur);
    go(inst, inst.stages.indexOf(inst.seq[clamp(k + dir, 0, inst.seq.length - 1)]));
  }
  function firstUntouched(inst) {
    const st = inst.decs.find(s => !isTouched(s.el));
    if (st) go(inst, inst.stages.indexOf(st));
    return !!st;
  }

  /* ================= 8. closing, done ================= */
  /** The next analysis on the page (document order, visible now): the closing offers to continue there. None, no link. */
  function nextEntry(inst) {
    const k = instances.indexOf(inst);
    for (let i = k + 1; i < instances.length; i++) {
      const o = instances[i];
      if (o !== inst && !frozen(o) && !o.root.contains(inst.root) && shown(o)) return { inst: o, label: (o.root.getAttribute('data-nav-label') || o.root.id || L('Analyse', 'Analysis')).trim() };
    }
    return null;
  }
  /** Closing: a devops message ("Abschluss" meta line, like every question) introduces the list of every
   *  question with its dwell bar and a "Nachschärfen" toggle (preset from the hesitation signal); below it
   *  Zurück and the ☰ panel's two journey buttons. No counts, no deviation summary. */
  function fillReview(inst, st) {
    const el = st.el;
    const keepFocus = el.contains(document.activeElement) ? document.activeElement.className : '';
    el.textContent = '';
    const stats = inst.decs.map(s => ({ s, e: entryOf(s.el), hs: hesOf(inst, s) }));
    const max = Math.max.apply(null, stats.map(x => x.hs.ms).concat([1]));
    const wrap = h('div', 'an-close');
    const m = msg('an-m-close'), bub = h('div', 'an-bub');
    bub.appendChild(h('div', 'an-meta', L('Abschluss', 'Closing')));
    bub.appendChild(h('p', 'an-close-t', stats.some(x => x.hs.flagged)
      ? L('Bei diesen Fragen würde ich im nächsten Schritt noch genauer hinschauen — vorgemerkt sind die, bei denen du gezögert hast:', 'These are the questions I would look at more closely in the next step — marked are the ones you hesitated on:')
      : L('Bei keiner Frage hast du sichtbar gezögert. Merk vor, wo ich im nächsten Schritt noch genauer hinschauen soll:', 'You did not visibly hesitate on any question. Mark where I should look more closely in the next step:')));
    m.appendChild(bub);
    wrap.appendChild(m);
    const body = h('div', 'an-close-body');
    const list = h('div', 'an-sig');
    stats.forEach(x => {
      const id = decId(x.s.el), row = h('div', 'an-sigrow');
      row.style.setProperty('--tc', x.s.group ? x.s.group.color : BLUE);
      const name = btn('an-sig-n');
      name.dataset.go = String(inst.stages.indexOf(x.s));
      name.append(h('b', '', x.s.el.dataset.label || id), h('small', '', x.e.untouched ? L('nicht angesehen — Vorauswahl gilt', 'not looked at — the preselection stands') : valueText(x.s.el, x.e)));
      const dw = h('div', 'an-dw'), bar = h('b');
      bar.style.width = Math.round(x.hs.ms / max * 100) + '%';
      dw.appendChild(bar);
      dw.classList.toggle('an-warn', x.hs.flagged);
      const sec = Math.round(x.hs.ms / 1000);
      tip(dw, L('Verweildauer ', 'Time spent ') + sec + ' s · ' + x.hs.noteWords + ' ' + L('Wörter Notiz', 'note words') + ' · ' + x.hs.revisits + ' ' + L('Rückkehr/Änderungen', 'revisits/changes') + ' · ' + L('Markiert ab zwei von: Zeit über dem Doppelten des Medians (mind. 20 s), Notiz über 12 Wörtern, mind. 2 Rückkehren.', 'Flagged at two of: time over twice the median (at least 20 s), note over 12 words, at least 2 revisits.'));
      const tg = btn('an-tg', L('Nachschärfen', 'Sharpen'));
      tg.setAttribute('aria-pressed', x.hs.flagged ? 'true' : 'false');
      tg.disabled = frozen(inst);
      tip(tg, L('Diese Frage in der nächsten Runde nachschärfen', 'Sharpen this question in the next round'));
      tg.addEventListener('click', () => {
        if (frozen(inst)) return;
        const on = tg.getAttribute('aria-pressed') !== 'true';
        inst.sharpen.set(id, on);
        const tagText = L('Nachschärfen · ', 'Sharpen · ') + (x.s.el.dataset.label || id);
        // One shared note: once text exists under another tag, that tag stays (the text is not re-labelled).
        if (on) { if (!inst.tag || !compText(inst.comp.ed)) setTag(inst, tagText); } else if (inst.tag === tagText) setTag(inst, '');
        composeSync(inst);
        if (on) { inst.comp.el.classList.remove('an-glow'); void inst.comp.el.offsetWidth; inst.comp.el.classList.add('an-glow'); }
        hesFlush(inst);
        // In place: re-rendering the closing on every toggle made it flicker and lose its scroll.
        tg.setAttribute('aria-pressed', on ? 'true' : 'false');
        dw.classList.toggle('an-warn', on);
      });
      row.append(h('i'), name, dw, tg);
      list.appendChild(row);
    });
    body.appendChild(list);
    const foot = h('div', 'an-foot'), go2 = h('div', 'an-go');
    const back = btn('an-back', L('Zurück', 'Back'));
    tip(back, '', '⇧+Enter');
    back.addEventListener('click', () => step(inst, -1));
    const acts = h('div', 'an-fabs');
    doneSubmitButtons().forEach(b => acts.appendChild(b));
    go2.append(back, acts);
    foot.appendChild(go2);
    body.appendChild(foot);
    const nx = nextEntry(inst);
    if (nx) {
      const lk = btn('an-link', L('Weiter zu: ', 'Continue with: ') + nx.label + ' →');
      lk.addEventListener('click', () => {
        go(nx.inst, 0);
        if (typeof nx.inst.root.scrollIntoView === 'function') nx.inst.root.scrollIntoView({ block: 'nearest' });
      });
      body.appendChild(lk);
    }
    wrap.appendChild(body);
    el.appendChild(wrap);
    if (keepFocus) { const f = el.querySelector('.' + keepFocus.split(' ')[0]); if (f) f.focus({ preventScroll: true }); }
  }
  function fillDone(inst, st) {
    const el = st.el;
    el.textContent = '';
    el.appendChild(h('div', 'an-h', L('Fertig', 'Done')));
    el.appendChild(h('div', 'an-sub', L('Deine Antworten gehen mit dem Absenden raus.', 'Your answers go out when you submit.')));
    const mini = h('div', 'an-mini');
    inst.decs.forEach(s => {
      const e = entryOf(s.el), c = h('div'); if (e.deviates) c.className = 'an-dv';
      c.appendChild(h('b', '', s.el.dataset.label || decId(s.el)));
      c.appendChild(document.createTextNode(valueText(s.el, e) + (e.deviates ? ' · ' + L('weicht ab', 'differs') : '')));
      mini.appendChild(c);
    });
    el.appendChild(mini);
    const foot = h('div', 'an-foot');
    const again = btn('an-btn2', L('Nochmal ansehen', 'Look again'));
    again.addEventListener('click', () => go(inst, inst.stages.indexOf(inst.decs[0])));
    foot.appendChild(h('div', 'an-quiet')).appendChild(again);
    // Bottom right: Zurück, then the FAB-style actions (the same two the ☰ menu holds).
    const go2 = goButtons(inst, '', { noNext: true, noPh: true });
    const fabs = h('div', 'an-fabs');
    doneSubmitButtons().forEach(b => fabs.appendChild(b));
    go2.appendChild(fabs);
    foot.appendChild(go2);
    el.appendChild(foot);
  }

  // The last step ends in the two ways out — next round and implement — as
  // FAB-style pills (.an-fab) and through the SAME submit
  // path as the dock journey: a click is a click on #submit-iterate-btn /
  // #submit-implement-btn. Implement keeps the journey's unlock: the first
  // click only unlocks (label turns into the confirmation, the dock lock opens
  // with it), the second submits; a pause of 5 s or Escape re-locks.
  function doneSubmitButtons() {
    const q = id => document.getElementById(id);
    // The ☰ panel's two journey buttons, same look (templates-panel-state-3.md § Journey row):
    // the blue "👉 Zur nächsten Runde" pill and the gold implement pill - icon disc, label and the
    // "keine weitere Runde" line. Its lock is the first click here: 🔒 -> 🔓 "Sicher? Nochmal klicken".
    const next = btn('an-fab an-fab-main', '👉 ' + L('Zur nächsten Runde', 'To the next round'));
    next.dataset.anAct = 'iterate';
    tip(next, L('Deine Auswahl geht in die nächste Runde. Es wird kein Code geschrieben.', 'Your choices go into the next round. No code is written.'));
    next.addEventListener('click', () => { const t = q('submit-iterate-btn'); if (t && !t.disabled) t.click(); });
    const impl = btn('an-fab an-fab-impl');
    const ico = h('span', 'an-fab-i', '🔒'), lab = h('span', 'an-fab-l'), lb = h('b'), ls = h('small');
    lab.append(lb, ls);
    impl.append(ico, lab);
    impl.setLabel = (t, s, i) => { lb.textContent = t; ls.textContent = s; ico.textContent = i; };
    impl.dataset.anAct = 'implement';
    impl.dataset.armed = 'false';
    const idle = () => impl.setLabel(L('Jetzt umsetzen', 'Implement now'), L('keine weitere Runde', 'no further round'), '🔒');
    idle();
    let timer = 0;
    const lock = () => {
      clearTimeout(timer);
      if (impl.dataset.armed !== 'true') return;
      impl.dataset.armed = 'false'; idle();
      impl.setAttribute('data-tip', L('Zweimal klicken: keine weitere Runde, direkt umsetzen', 'Click twice: no further round, implement right away'));
      if (typeof setJourneyUnlocked === 'function') setJourneyUnlocked(false);
    };
    impl.setAttribute('data-tip', L('Zweimal klicken: keine weitere Runde, direkt umsetzen', 'Click twice: no further round, implement right away'));
    impl.addEventListener('click', () => {
      if (impl.dataset.armed !== 'true') {
        impl.dataset.armed = 'true';
        impl.setLabel(L('Sicher? Nochmal klicken', 'Sure? Click again'), L('setzt ohne weitere Runde um', 'implements without another round'), '🔓');
        impl.setAttribute('data-tip', L('Zweiter Klick setzt um', 'The second click implements'));
        if (typeof setJourneyUnlocked === 'function') setJourneyUnlocked(true);
        // setJourneyUnlocked() parks focus on the dock button after its
        // cross-fade; the user is working HERE, so take it back.
        setTimeout(() => { try { impl.focus({ preventScroll: true }); } catch (e) {} }, 450);
        timer = setTimeout(lock, 5000);
        return;
      }
      clearTimeout(timer);
      impl.dataset.armed = 'false'; idle();
      const t = q('submit-implement-btn'); if (t && !t.disabled) t.click();
    });
    impl.addEventListener('keydown', e => { if (e.key === 'Escape' && impl.dataset.armed === 'true') { e.stopPropagation(); lock(); } });
    return [next, impl];
  }

  /* ================= 9. keys ================= */
  function visibleInst(target) {
    const own = target && target.closest ? target.closest('[data-analysis]') : null;
    if (own && own.__an) return own.__an;
    if (target && target !== document.body && target !== document.documentElement) return null;
    const vis = instances.filter(i => !i.lite && !i.root.closest('[hidden]') && i.root.getClientRects().length > 0);
    return vis.length === 1 ? vis[0] : null;
  }
  function pickOption(inst, d, k) {
    const inputs = [...d.querySelectorAll('[data-options] input[type=radio], [data-options] input[type=checkbox]')];
    const c = inputs[k];
    if (!c || c.disabled) return false;
    c.click();   // focus stays on the stage: the key must keep working and no tooltip opens on a hidden radio
    return true;
  }
  function moveOption(d, dir) {
    const radios = [...d.querySelectorAll('[data-options] input[type=radio]')];
    if (!radios.length) return false;
    const i = radios.findIndex(r => r.checked);
    const j = clamp((i < 0 ? 0 : i) + dir, 0, radios.length - 1);
    if (i >= 0 && j === i) return true;   // at the edge: re-clicking the checked radio would deselect it
    radios[j].click();
    return true;
  }
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.isComposing) return;
    const inst = visibleInst(e.target);
    if (!inst) return;
    const t = e.target, tag0 = t.tagName, type = (t.type || '').toLowerCase();
    const typing = tag0 === 'TEXTAREA' || tag0 === 'SELECT' || (tag0 === 'INPUT' && !/^(radio|checkbox|range|button|submit)$/.test(type)) || t.isContentEditable;
    const st = inst.stages[inst.idx], d = st && st.kind === 'dec' ? st.el : null;
    if (typing) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); step(inst, e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { t.blur(); if (st) st.el.focus({ preventScroll: true }); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const act = fn => { e.preventDefault(); e.stopPropagation(); fn(); };
    const onButton = tag0 === 'BUTTON' || tag0 === 'A' || tag0 === 'SUMMARY';
    const key = e.key;
    if (key === 'Enter') { if (onButton && !e.shiftKey) return; act(() => step(inst, e.shiftKey ? -1 : 1)); return; }
    if (e.shiftKey && /^Digit[1-9]$/.test(e.code || '')) { const g = inst.groups[Number(e.code.slice(5)) - 1]; if (g) act(() => go(inst, inst.stages.findIndex(s => s.group === g && s.kind === 'topic'))); return; }
    if (e.shiftKey) return;
    if (/^[1-9]$/.test(key) && d) { act(() => pickOption(inst, d, Number(key) - 1)); return; }
    if (key === 'ArrowRight' && type !== 'range' && type !== 'radio' && type !== 'checkbox') { act(() => step(inst, 1)); return; }
    if (key === 'ArrowLeft' && type !== 'range' && type !== 'radio' && type !== 'checkbox') { act(() => step(inst, -1)); return; }
    if ((key === 'ArrowDown' || key === 'ArrowUp') && d && tag0 !== 'INPUT' && !t.closest('.an-ord')) { if (d.dataset.decisionMode !== 'order' && d.dataset.decisionMode !== 'slider') act(() => moveOption(d, key === 'ArrowDown' ? 1 : -1)); return; }
    if ((key === 'ArrowRight' || key === 'ArrowLeft') && (type === 'radio' || type === 'checkbox') && !d) return;
    if (key === 'Home' && type !== 'range' && !inst.lite) { act(() => go(inst, 0)); return; }
    if (key === 'End' && type !== 'range' && !inst.lite) { act(() => go(inst, inst.stages.findIndex(s => s.kind === 'review'))); return; }
    if (onButton && (key === ' ')) return;
    const k = key.toLowerCase();
    if (k === 'n') { act(() => focusComposer(inst)); return; }
    if (k === 'i' && d) { act(() => toggleIssue(inst, d)); return; }
    if (k === 'u' && !inst.lite) { act(() => firstUntouched(inst)); }
  }, true);
  // The section nav (TOC) jumps to a stage instead of scrolling to a hidden section.
  document.addEventListener('click', e => {
    const link = e.target.closest && e.target.closest('.section-nav-item');
    if (!link) return;
    const target = document.getElementById(link.dataset.sectionId || '');
    const inst = target && instances.find(i => i.root.contains(target));
    if (!inst) return;
    const idx = inst.stages.findIndex(s => s.el === target || (s.kind === 'topic' && s.group.topic === target));
    if (idx < 0) return;
    e.preventDefault(); e.stopPropagation();
    go(inst, idx);
  }, true);
  // The dwell clock runs only while the window is focused and visible.
  window.addEventListener('blur', () => instances.forEach(i => hesFlush(i, true)));
  window.addEventListener('focus', () => instances.forEach(hesStart));
  document.addEventListener('visibilitychange', () => instances.forEach(i => (document.hidden ? hesFlush(i, true) : hesStart(i))));
  window.addEventListener('pagehide', () => instances.forEach(i => hesFlush(i, true)));
  // A design view / iteration tab switch hides the analysis without a focus or visibility event: the clock follows the root.
  function watchShown(inst) {
    if (typeof IntersectionObserver !== 'function') return;
    inst.io = new IntersectionObserver(es => { const on = es.some(e => e.isIntersecting); if (on) hesStart(inst); else hesFlush(inst, true, true); });
    inst.io.observe(inst.root);
  }

  /* ================= 10. boot ================= */
  function init(scope) {
    (scope || document).querySelectorAll('[data-analysis]').forEach(r => {
      if (r.parentElement && r.parentElement.closest('[data-analysis]')) return;
      if (!r.__an) { const inst = setup(r); watchShown(inst); }
    });
    // The first restoreState() ran before the engine created its hidden state: once more, now that it exists.
    if (typeof restoreState === 'function' && instances.length) restoreState();
  }
  window.conceptAnalysis = { init, setup, go, step, refresh, restored, flush: flushAll, markTouched, renderViz, instances, TOUCH_MS, hesFlush, setTag, sendNote, tagFromClick };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { init(); setTimeout(() => instances.forEach(refresh), 500); });
  else { init(); setTimeout(() => instances.forEach(refresh), 500); }
})();
```

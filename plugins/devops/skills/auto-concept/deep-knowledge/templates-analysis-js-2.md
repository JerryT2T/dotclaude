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
    slider: ['Wert wählen', 'Pick a value'], order: ['Reihenfolge', 'Order'], verify: ['Stimmt das?', 'Is this right?'], wording: ['Formulierung', 'Wording']
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
    } else if (fresh && rec.length && !ctl(d, 'dm-' + id).some(c => c.type === 'radio' && c.checked)) {
      const c = ctl(d, 'dm-' + id).find(x => x.value === rec[0]);
      if (c) c.checked = true;
    }
    // ★ Empfohlen chip behind the label of the recommended option(s); the reason is its tooltip.
    const why = d.dataset.recWhy ? L('Warum: ', 'Why: ') + d.dataset.recWhy : L('Unsere Empfehlung', 'Our recommendation');
    d.querySelectorAll('[data-opt]').forEach((o, i) => {
      if (mode === 'order') return;
      o.querySelectorAll('[data-opt-preview]').forEach(p => { if (!p.querySelector('.an-k-l')) p.insertBefore(h('b', 'an-k-l', L('So sähe das aus: ', 'This would look like: ')), p.firstChild); });
      if (rec.indexOf(o.getAttribute('data-opt')) >= 0 || o.hasAttribute('data-recommended')) {
        o.classList.add('an-rec');
        if (!o.querySelector('.an-badge')) { const b = h('span', 'an-badge', '★ ' + L('Empfohlen', 'Recommended')); b.setAttribute('data-tip', why); b.tabIndex = 0; (o.querySelector('[data-opt-label]') || o).appendChild(b); }
      }
      if (i < 9) tip(o, '', String(i + 1));
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
    if (!['multi', 'slider', 'order'].includes(mode)) {
      d.querySelectorAll('[data-options] input[type=radio]').forEach(r => r.addEventListener('click', () => {
        if (r.checked && d.__sel && d.__sel === r.value) { r.checked = false; fire(r); }
      }));
    }
    // "Keine passt? Schreib deine Antwort unten ins Notizfeld.": a text link under the
    // answer block (not with slider / order, whose value is always an answer). It clears
    // the pick, sets dm-{id}-none and puts the cursor into the composer, whose note then
    // carries the answer.
    if (!['slider', 'order'].includes(mode)) {
      const none = btn('an-none', NONE_TXT());
      none.setAttribute('aria-pressed', 'false');
      none.addEventListener('click', () => setNone(inst, d, (ctl1(d, 'dm-' + id + '-none') || {}).value !== '1'));
      d.__none = none;
    }
    for (const nm of ['-none', '-hes']) if (!ctl1(d, 'dm-' + id + nm)) { const c = h('input'); c.type = 'hidden'; c.name = 'dm-' + id + nm; c.value = ''; d.appendChild(c); }
    // The note textarea is the storage target of the composer (data-comment stays); its 📎
    // bar stays beside it, the composer's 📎 opens it.
    const note = d.querySelector('[data-comment="' + cssEsc(id + '-note') + '"]');
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
    ans.append(h('div', 'an-kind', L(KIND[mode][0], KIND[mode][1])), zone);
    if (d.__none) ans.appendChild(d.__none);
    am.append(ans, foot, att);
    d.insertBefore(am, d.firstChild);
    d.insertBefore(qm, am);
    d.insertBefore(fm, qm);
    syncDecision(d);
  }
  const NONE_TXT = () => L('Keine passt? Schreib deine Antwort unten ins Notizfeld.', 'None fits? Write your answer in the note field below.');
  function setNone(inst, d, on) {
    if (on) {
      d.querySelectorAll('[data-options] input[type=radio], [data-options] input[type=checkbox]').forEach(c => { c.checked = false; });
    }
    setHidden(d, '-none', on ? '1' : '');
    markTouched(d);
    refresh(inst);
    if (on) focusComposer(inst);
  }
  function toggleIssue(inst, d) {
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
    d.__slider = { r, out, unit };
    syncSlider(d);
  }
  function syncSlider(d) {
    const s = d.__slider;
    if (!s) return;
    const min = num(s.r.min), max = num(s.r.max) || 100;
    s.out.innerHTML = esc(fmt(s.r.value)) + (s.unit ? '<small>' + esc(s.unit) + '</small>' : '');
    s.r.style.setProperty('--an-p', clamp((num(s.r.value) - min) / ((max - min) || 1) * 100, 0, 100) + '%');
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
      const li = h('li', 'an-oi'); li.draggable = true; li.tabIndex = 0; li.dataset.id = id;
      const lab = h('span', 'an-ol', optLabel(d, id));
      const c = optCons(optEl(d, id));
      if (c) lab.appendChild(h('small', '', c));
      const bs = h('span', 'an-ob'), up = btn('', '▲'), dn = btn('', '▼');
      up.setAttribute('aria-label', L('Nach oben', 'Move up')); dn.setAttribute('aria-label', L('Nach unten', 'Move down'));
      tip(up, L('Nach oben · Alt+↑', 'Move up · Alt+↑')); tip(dn, L('Nach unten · Alt+↓', 'Move down · Alt+↓'));
      up.addEventListener('click', () => moveItem(inst, d, li, -1)); dn.addEventListener('click', () => moveItem(inst, d, li, 1));
      bs.append(up, dn);
      li.append(h('b', '', String(i + 1)), lab, bs);
      o.ol.appendChild(li);
    });
  }
  function moveItem(inst, d, it, dir) {
    const o = d.__order, ref = dir < 0 ? it.previousElementSibling : it.nextElementSibling;
    if (!ref) return;
    if (dir < 0) o.ol.insertBefore(it, ref); else o.ol.insertBefore(ref, it);
    writeOrder(inst, d);
    it.focus();
  }
  function writeOrder(inst, d) {
    const o = d.__order;
    const ids = [...o.ol.children].map(li => li.dataset.id);
    [...o.ol.children].forEach((li, i) => { li.firstChild.textContent = String(i + 1); });
    o.sig = ids.join(',');
    if (o.hid.value !== o.sig) { o.hid.value = o.sig; fire(o.hid); }
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
      if (i0 && i0.comp) i0.comp.ed.dataset.ph = on ? L('Deine Antwort, da keine Option passt …', 'Your answer, since no option fits …') : L('Notiz an devops … (optional)', 'Note to devops … (optional)');
    }
    d.querySelectorAll('.an-inl').forEach(w => {
      const on = !!checked && w.dataset.when.split('|').indexOf(checked.value) >= 0;
      w.classList.toggle('an-show', on);
    });
    syncSlider(d);
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
    if (['multi', 'slider', 'order'].includes(d.dataset.decisionMode)) return false;
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
    if (/^(radio|checkbox|range)$/.test(e.target.type) && !/-(none|touched|issue|epic)$/.test(n)) {
      // The second and every further change of an answer counts like a revisit (hesitation signal).
      const r = hesEntry(inst, decId(d));
      r.changes = (r.changes || 0) + 1;
      if (r.changes > 1) r.revisits++;
    }
    if (e.target.type === 'radio' && d.dataset.decisionMode === 'wording' && e.target.value === 'custom') { const t = ctl1(d, 'dm-' + decId(d) + '-text'); if (t) t.focus(); }
    if (answerEmpty(d)) { if (!setHidden(d, '-touched', '')) refresh(inst); return; }
    if (!markTouched(d)) refresh(inst);
  }
  function refresh(inst) {
    inst.decs.forEach(st => syncDecision(st.el));
    refreshNav(inst);
    if (inst.root.querySelector(':scope > .an-review:not(.an-off)')) fillReview(inst, inst.stages.find(s => s.kind === 'review'));
    if (typeof updateSectionNavState === 'function') updateSectionNavState();
  }

  /* ================= 6. hesitation: dwell, note length, revisits ================= */
  // Per decision the page writes { ms, revisits, median } into the hidden dm-{id}-hes (so
  // collect / bake / freeze carry it); collectModeDecision() turns it into
  // hesitation { ms, noteWords, revisits, flagged }. ms counts ONLY while the stage is
  // visible AND the window focused (timestamps, back-and-forth summed).
  const hesEntry = (inst, id) => inst.hes[id] || (inst.hes[id] = { ms: 0, revisits: 0, changes: 0, since: 0 });
  const hesLive = inst => !document.hidden && (typeof document.hasFocus !== 'function' || document.hasFocus()) && !inst.root.closest('[hidden]') && inst.root.getClientRects().length > 0;
  function hesStart(inst) {
    const st = inst.stages[inst.idx];
    if (!st || st.kind !== 'dec' || frozen(inst) || !hesLive(inst)) return;
    const e = hesEntry(inst, decId(st.el));
    if (!e.since) e.since = Date.now();
  }
  function hesStop(inst) {
    const now = Date.now();
    Object.keys(inst.hes).forEach(id => { const e = inst.hes[id]; if (e.since) { e.ms += Math.max(0, now - e.since); e.since = 0; } });
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
  function hesFlush(inst, idle) {
    hesStop(inst);
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
  /** Previous stage hinted above (its question and your answer, calm), the next one below, both fading out. */
  function peeks(inst, st) {
    const k = inst.seq.indexOf(st), prev = inst.seq[k - 1], next = inst.seq[k + 1];
    const up = inst.peekUp, dn = inst.peekDn;
    up.textContent = ''; dn.textContent = '';
    up.hidden = !prev; dn.hidden = !next;
    if (prev) {
      up.dataset.go = String(inst.stages.indexOf(prev));
      if (prev.kind === 'dec') {
        const q = prev.el.querySelector('[data-question]');
        up.appendChild(h('div', 'an-settled an-settled-q', q ? q.textContent : stageLabel(inst, prev)));
        up.appendChild(h('div', 'an-settled an-settled-a', valueText(prev.el, entryOf(prev.el))));
      } else up.appendChild(h('div', 'an-peek-t', stageLabel(inst, prev)));
    }
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
    if (!opt.initial && prev && prev.kind === 'dec') inst.visited.add(decId(prev.el));
    if (!opt.initial && st.kind === 'dec' && inst.visited.has(decId(st.el))) hesEntry(inst, decId(st.el)).revisits++;
    inst.idx = i;
    inst.maxIdx = Math.max(inst.maxIdx, i);
    // The messages of a stage enter one after another on its FIRST visit only (never with reduced motion).
    const first = !inst.seen.has(i) && !reduced();
    inst.seen.add(i);
    inst.stages.forEach(s => { s.el.classList.toggle('an-off', s !== st); s.el.classList.remove('an-first'); });
    inst.groups.forEach(g => g.topic.classList.toggle('an-off', st.group !== g));
    if (inst.brief) inst.brief.classList.toggle('an-off', st.kind !== 'brief');
    inst.root.dataset.anStage = st.kind;
    if (st.kind === 'topic') fillIntro(inst, st);
    else if (st.kind === 'review') fillReview(inst, st);
    else if (st.kind === 'done') fillDone(inst, st);
    if (first) {
      st.el.classList.add('an-first');
      if (st.kind === 'dec') setTimeout(() => pulse(st.el), 1100);
    }
    // First stage: no way back — hidden, not dimmed; visibility keeps its space so Weiter stays put (#962).
    const firstSt = st === inst.seq[0];
    inst.root.querySelectorAll('.an-back').forEach(x => { x.disabled = firstSt; x.style.visibility = firstSt ? 'hidden' : ''; });
    peeks(inst, st);
    loadComposer(inst, st);
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
  /** The next entry of the surrounding devops concept (a sibling section with a nav label), when there is one. */
  function nextEntry(inst) {
    for (let n = inst.root.nextElementSibling; n; n = n.nextElementSibling) {
      if (n.id && n.getAttribute('data-nav-label') && !n.hasAttribute('data-analysis-briefing')) return n;
    }
    return null;
  }
  /** Closing: headline result, every question with its dwell bar and a "Nachschärfen" toggle (preset from the hesitation signal). */
  function fillReview(inst, st) {
    const el = st.el;
    const keepFocus = el.contains(document.activeElement) ? document.activeElement.className : '';
    el.textContent = '';
    const stats = inst.decs.map(s => ({ s, e: entryOf(s.el), hs: hesOf(inst, s) }));
    const un = stats.filter(x => x.e.untouched), dev = stats.filter(x => x.e.deviates);
    const max = Math.max.apply(null, stats.map(x => x.hs.ms).concat([1]));
    const wrap = h('div', 'an-close');
    wrap.appendChild(h('div', 'an-eyebrow', inst.root.getAttribute('data-nav-label') || L('Abschluss', 'Closing')));
    const big = h('div', 'an-big');
    big.append(document.createTextNode(String(stats.length - un.length)), h('small', '', ' / ' + stats.length));
    wrap.appendChild(big);
    wrap.appendChild(h('p', 'an-claim', dev.length
      ? dev.length + ' ' + L('Antworten weichen von der Empfehlung ab.', 'answers differ from the recommendation.')
      : L('Alles wie empfohlen.', 'Everything as recommended.')));
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
      tip(tg, L('Diese Frage in der nächsten Runde nachschärfen', 'Sharpen this question in the next round'));
      tg.addEventListener('click', () => {
        const on = tg.getAttribute('aria-pressed') !== 'true';
        inst.sharpen.set(id, on);
        const tagText = L('Nachschärfen · ', 'Sharpen · ') + (x.s.el.dataset.label || id);
        setTag(inst, on ? tagText : (inst.tag === tagText ? '' : inst.tag));
        composeSync(inst);
        if (on) { inst.comp.el.classList.remove('an-glow'); void inst.comp.el.offsetWidth; inst.comp.el.classList.add('an-glow'); }
        hesFlush(inst);
        fillReview(inst, st);
      });
      row.append(h('i'), name, dw, tg);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    const acts = h('div', 'an-fabs');
    doneSubmitButtons().forEach(b => acts.appendChild(b));
    const back = btn('an-back', L('Zurück', 'Back'));
    back.addEventListener('click', () => step(inst, -1));
    acts.insertBefore(back, acts.firstChild);
    wrap.appendChild(acts);
    const nx = nextEntry(inst);
    if (nx) {
      const lk = btn('an-link', L('Weiter zu: ', 'Continue with: ') + nx.getAttribute('data-nav-label') + ' →');
      lk.addEventListener('click', () => {
        const item = document.querySelector('.section-nav-item[data-section-id="' + cssEsc(nx.id) + '"]');
        if (item) item.click(); else nx.scrollIntoView({ block: 'start' });
      });
      wrap.appendChild(lk);
    }
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
    // The concept FAB menu's two actions, adapted: pill FABs (icon disc + label), the
    // round's own accent for the next round, the warning tint for the one-way implement.
    const fab = (cls, icon, label) => {
      const b = btn('an-fab ' + cls);
      b.append(h('span', 'an-fab-i', icon), h('span', 'an-fab-l', label));
      b.setLabel = t => { b.querySelector('.an-fab-l').textContent = t; };
      return b;
    };
    const next = fab('an-fab-main', '→', L('Zur nächsten Runde', 'To the next round'));
    next.dataset.anAct = 'iterate';
    tip(next, L('Antworten absenden, Claude denkt die nächste Runde', 'Submit and let Claude rethink the next round'), '');
    next.addEventListener('click', () => { const t = q('submit-iterate-btn'); if (t && !t.disabled) t.click(); });
    const impl = fab('an-fab-warn', '⚠', L('Jetzt umsetzen', 'Implement now'));
    impl.dataset.anAct = 'implement';
    impl.dataset.armed = 'false';
    const idle = L('Jetzt umsetzen', 'Implement now');
    let timer = 0;
    const lock = () => {
      clearTimeout(timer);
      if (impl.dataset.armed !== 'true') return;
      impl.dataset.armed = 'false'; impl.setLabel(idle);
      impl.setAttribute('data-tip', L('Zweimal klicken: keine weitere Runde, direkt umsetzen', 'Click twice: no further round, implement right away'));
      if (typeof setJourneyUnlocked === 'function') setJourneyUnlocked(false);
    };
    impl.setAttribute('data-tip', L('Zweimal klicken: keine weitere Runde, direkt umsetzen', 'Click twice: no further round, implement right away'));
    impl.addEventListener('click', () => {
      if (impl.dataset.armed !== 'true') {
        impl.dataset.armed = 'true';
        impl.setLabel(L('Sicher? Nochmal klicken', 'Sure? Click again'));
        impl.setAttribute('data-tip', L('Zweiter Klick setzt um', 'The second click implements'));
        if (typeof setJourneyUnlocked === 'function') setJourneyUnlocked(true);
        // setJourneyUnlocked() parks focus on the dock button after its
        // cross-fade; the user is working HERE, so take it back.
        setTimeout(() => { try { impl.focus({ preventScroll: true }); } catch (e) {} }, 450);
        timer = setTimeout(lock, 5000);
        return;
      }
      clearTimeout(timer);
      impl.dataset.armed = 'false'; impl.setLabel(idle);
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
    const n = radios[clamp((i < 0 ? 0 : i) + dir, 0, radios.length - 1)];
    n.click();
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

  /* ================= 10. boot ================= */
  function init(scope) {
    (scope || document).querySelectorAll('[data-analysis]').forEach(r => {
      if (r.parentElement && r.parentElement.closest('[data-analysis]')) return;
      if (!r.__an) setup(r);
    });
  }
  window.conceptAnalysis = { init, setup, go, step, refresh, markTouched, renderViz, instances, TOUCH_MS, hesFlush, setTag, sendNote, tagFromClick };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { init(); setTimeout(() => instances.forEach(refresh), 500); });
  else { init(); setTimeout(() => instances.forEach(refresh), 500); }
})();
```

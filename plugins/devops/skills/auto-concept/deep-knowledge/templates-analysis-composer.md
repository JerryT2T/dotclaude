# Concept templates, part 49 of 54: Template: analysis — engine UI JS, composer and note store (continued 2)

```javascript
  /* ----- persistent composer: THE note field of the open stage ----- */
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
    // Pasted or typed lines arrive as one <div> per line: each is a line break, and its own trailing <br> is none.
    c.querySelectorAll('div > br:last-child').forEach(b => { if (!b.nextSibling) b.remove(); });
    c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    c.querySelectorAll('div, p').forEach(d => { if (d.previousSibling) d.before('\n'); });
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
    // The paperclip and paste / drop work on EVERY stage: the files go to the open stage's own slot (its store's data-comment key).
    const fi = h('input');
    fi.type = 'file'; fi.multiple = true; fi.hidden = true; fi.tabIndex = -1;
    fi.addEventListener('change', () => { addFiles(inst, Array.from(fi.files || [])); fi.value = ''; });
    att.addEventListener('click', () => { if (!frozen(inst)) fi.click(); });
    const strip = h('div', 'an-strip');
    strip.hidden = true;
    strip.setAttribute('role', 'list');
    strip.setAttribute('aria-label', L('Anhänge', 'Attachments'));
    const send = btn('an-comp-b an-send');
    send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    send.setAttribute('aria-label', L('Senden', 'Send'));
    tip(send, L('Senden', 'Send'), 'Enter');
    send.addEventListener('click', () => sendNote(inst));
    el.append(strip, ed, att, fi, send);
    inst.comp = { el, ed, att, send, strip, fi };
    ed.addEventListener('input', () => { ed.querySelectorAll('img').forEach(n => n.remove()); composeSync(inst); });
    ed.addEventListener('paste', e => {
      // Never the browser's own paste: an image would land in the field as a raw <img> (clipped, lost on send) and rich
      // text would bring its markup. Files become attachments, text goes in as plain text.
      e.preventDefault();
      if (frozen(inst)) return;
      const cd = e.clipboardData || {};
      const files = Array.from(cd.items || []).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
      const text = typeof cd.getData === 'function' ? cd.getData('text/plain') : '';
      if (files.length) addFiles(inst, files);
      if (text) { insertPlain(text, ed); composeSync(inst); }
    });
    el.addEventListener('dragover', e => {
      const dt = e.dataTransfer;
      if (frozen(inst) || !dt || !Array.from(dt.types || []).includes('Files')) return;
      e.preventDefault();
      el.classList.add('an-drag');
    });
    el.addEventListener('dragleave', e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) el.classList.remove('an-drag'); });
    el.addEventListener('drop', e => {
      el.classList.remove('an-drag');
      const dt = e.dataTransfer || {};
      const files = Array.from(dt.files || []), text = typeof dt.getData === 'function' ? dt.getData('text/plain') : '';
      if (frozen(inst) || (!files.length && !text)) return;
      e.preventDefault();
      if (files.length) addFiles(inst, files);
      else { focusComposer(inst); insertPlain(text, ed); composeSync(inst); }
    });
    hookAttachments();
    ed.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) sendNote(inst); }
    });
    if (frozen(inst)) { send.disabled = true; att.disabled = true; }
    inst.root.insertBefore(el, inst.stores);
  }
  /** Writes the composer into the open stage's note. */
  function composeSync(inst) {
    const st = inst.stages[inst.idx], store = storeOf(inst, st), text = compText(inst.comp.ed);
    inst.comp.ed.dataset.empty = !text ? '1' : '';
    if (!store || frozen(inst)) return;
    const msgs = msgsOf(st, store);
    // A draft restored from deleted messages is text in the field only: untouched, it is neither a message nor part of the result.
    if (st.restDraft != null) { if (text === st.restDraft.trim()) { writeMsgs(st, store, msgs); return; } setRest(inst, st, null); }
    // A blank line separates messages in the store, so a paragraph break inside a draft holds a no-break space.
    const draft = text.trim() ? text.trim().replace(/\n\s*\n/g, '\n \n') : '';
    writeMsgs(st, store, draft ? msgs.concat(draft) : msgs);
  }
  /** The sent messages of a stage, parsed again whenever the store changed from outside. */
  function msgsOf(st, store) {
    if (st.msgSig !== store.value) {
      st.msgs = String(store.value || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
      st.msgSig = store.value;
    }
    return st.msgs;
  }
  function writeMsgs(st, store, list) {
    const val = list.join('\n\n');
    st.msgSig = val;
    if (store.value !== val) { store.value = val; fire(store); }
  }
  function clearComposer(inst) {
    inst.comp.ed.textContent = '';
    inst.comp.ed.dataset.empty = '1';
  }
  /** The draft is already in the store: parsing it again makes it a sent message. */
  function commitDraft(st) { st.msgSig = null; }
  /** The stage's chat messages, right before its Weiter row. */
  function renderNotes(inst, st) {
    const store = storeOf(inst, st);
    if (!store) return;
    let box = st.notes;
    if (!box) {
      box = st.notes = h('div', 'an-notes');
      const foot = st.el.querySelector('.an-foot');
      if (foot) foot.parentNode.insertBefore(box, foot); else st.el.appendChild(box);
    }
    box.textContent = '';
    const editable = !frozen(inst);
    msgsOf(st, store).forEach((m, i) => box.appendChild(noteRow(inst, st, m, i, editable)));
    box.hidden = !box.firstChild || !!(inst.stages && st !== inst.stages[inst.idx]);   // a question left shows its messages in its answer block (an-m-me), never twice
  }
  /** One chat message of the user with its pen and x; the same bubble on the open stage and on an earlier question. */
  function noteRow(inst, st, m, i, editable) {
    const row = h('div', 'an-bub-me an-note-m'), text = plainMsg(m), id = msgIdOf(m);
    if (text) row.appendChild(document.createTextNode(text));
    // The attachments sent with this message stand in its bubble (lightbox; x while the stage is editable).
    const recs = id ? msgRecs(inst, st, id) : [];
    if (recs.length) row.appendChild(noteAtts(inst, st, recs, editable));
    if (editable) {
      const acts = h('div', 'an-note-acts');
      acts.append(noteBtn(L('Nachricht bearbeiten', 'Edit message'), NOTE_PEN, () => editNote(inst, st, i)),
        noteBtn(L('Nachricht löschen', 'Delete message'), NOTE_X, () => deleteNote(inst, st, i)));
      row.appendChild(acts);
    }
    return row;
  }
  const NOTE_PEN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg>';
  const NOTE_X = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  function noteBtn(label, icon, onClick) {
    const b = btn('an-note-b');
    b.innerHTML = icon;
    b.setAttribute('aria-label', label);
    tip(b, label);
    b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    return b;
  }
  /** Pen: the message goes back into the composer, its attachments back into the strip. A draft already there
   *  is sent first (with the strip's attachments), so it is not overwritten. */
  function editNote(inst, st, i) {
    const store = storeOf(inst, st);
    if (!store || frozen(inst)) return;
    // A message of an earlier question is edited where it stands: no composer (it belongs to the OPEN stage), no jump.
    if (st !== inst.stages[inst.idx]) { editInline(inst, st, i); return; }
    if (restOnly(st, compText(inst.comp.ed))) setRest(inst, st, null);   // the user works with the restored draft now: it is theirs
    composeSync(inst);
    const m = msgsOf(st, store)[i];
    if (compText(inst.comp.ed) || pendingRecs(inst, st).length) { sealDraft(inst, st, compText(inst.comp.ed)); clearComposer(inst); }
    const all = msgsOf(st, store).slice();
    all.splice(i, 1);
    st.msgs = all;
    writeMsgs(st, store, all);
    const id = m ? msgIdOf(m) : '';
    if (id) msgRecs(inst, st, id).forEach(r => { if (typeof setAttachmentMsg === 'function') setAttachmentMsg(r, null); else delete r.msg; });
    inst.comp.ed.textContent = '';
    if (m && plainMsg(m)) inst.comp.ed.appendChild(document.createTextNode(plainMsg(m)));
    composeSync(inst);
    renderNotes(inst, st);
    renderStrip(inst);
    focusComposer(inst);
  }
  function deleteNote(inst, st, i) {
    const store = storeOf(inst, st);
    if (!store || frozen(inst)) return;
    const open = st === inst.stages[inst.idx];
    const draft = open ? compText(inst.comp.ed) : '', list = msgsOf(st, store).slice();
    const id = list[i] ? msgIdOf(list[i]) : '';
    const gone = list[i] ? plainMsg(list[i]).replace(/\n \n/g, '\n\n').trim() : '';
    list.splice(i, 1);
    st.msgs = list;
    writeMsgs(st, store, list);
    // The deleted text moves into this question's UNSENT draft (blank line between several, deletion order, after any draft text):
    // back on the question the user can still revise it; left alone it is not a message and not part of the result.
    // The message's attachments move with it into that draft (flagged rec.draft: no message, not in the payload).
    const recs = id ? msgRecs(inst, st, id) : [];
    if (gone || recs.length) {
      const base = open ? draft : (st.restDraft || '');
      setRest(inst, st, base && gone ? base + '\n\n' + gone : (base || gone));
      recs.forEach(r => { if (typeof setAttachmentMsg === 'function') setAttachmentMsg(r, null, true); else { delete r.msg; r.draft = true; } });
      if (open) { inst.comp.ed.textContent = ''; if (st.restDraft) inst.comp.ed.appendChild(document.createTextNode(st.restDraft)); }
    }
    if (open) composeSync(inst);
    refreshNotes(inst, st);
    if (open) renderStrip(inst);
  }
  /* ----- attachments of a sent message: the record carries the message's id (rec.msg), the message ends with
   *       U+2063 + that id (invisible, stripped wherever the text is shown or submitted) ----- */
  const MSG_MARK = '\u2063';
  const MSG_MARK_RE = /\u2063([a-z0-9]+)$/;
  /** The plain texts of the notes a stage holds (sent messages, drafts included; markers dropped) - the closing shows them too. */
  function noteTexts(inst, st) {
    const store = storeOf(inst, st);
    return store ? msgsOf(st, store).map(plainMsg).map(t => t.trim()).filter(Boolean) : [];
  }
  function plainMsg(m) { return String(m || '').replace(MSG_MARK_RE, ''); }
  function msgIdOf(m) { const r = MSG_MARK_RE.exec(String(m || '')); return r ? r[1] : ''; }
  function slotRecs(inst, st) {
    const s = storeOf(inst, st), slot = s && s.dataset.comment;
    return (slot && typeof _attachments !== 'undefined' && _attachments.get(slot)) || [];
  }
  function msgRecs(inst, st, id) { return slotRecs(inst, st).filter(r => r.msg === id); }
  /** Attachments in the strip, not yet sent with a message. A record whose message is gone (deleted
   *  while its record was restored from storage) counts as unsent, so it is never invisible. */
  function unsentRecs(inst, st) {
    const store = storeOf(inst, st);
    const ids = store ? new Set(msgsOf(st, store).map(msgIdOf).filter(Boolean)) : new Set();
    return slotRecs(inst, st).filter(r => !r.msg || !ids.has(r.msg));
  }
  /** The unsent ones the user made their own: they go out with the next message. Those of a restored draft (rec.draft) wait. */
  function pendingRecs(inst, st) { return unsentRecs(inst, st).filter(r => !r.draft); }
  /* ----- the restored draft (deleted messages) survives a reload: its text in a hidden dm-*-rest input (the page's own
   *       draft store; data-engine-store, so never a payload field), its attachments as records flagged rec.draft ----- */
  function restKey(inst, st) {
    return st.kind === 'dec' ? decId(st.el) : st.kind === 'topic' ? st.topic.id : st.kind === 'brief' ? (st.el.id || 'briefing') : inst.key + '-closing';
  }
  function restInputOf(inst, st) {
    if (!st) return null;
    if (st.restEl) return st.restEl;
    const c = newHidden(inst.root, 'dm-' + restKey(inst, st) + '-rest', '');
    c.dataset.engineStore = '1';
    (st.kind === 'dec' ? st.el : inst.stores).appendChild(c);
    return (st.restEl = c);
  }
  /** The restored draft of a stage: text ('' = attachments only) or null; mirrored into the hidden store. */
  function setRest(inst, st, val) {
    st.restDraft = val;
    const c = restInputOf(inst, st), v = val == null ? '' : val;
    if (val == null) slotRecs(inst, st).forEach(r => { if (r.draft) { if (typeof setAttachmentMsg === 'function') setAttachmentMsg(r, null); else delete r.draft; } });
    if (c && c.value !== v) { c.value = v; fire(c); }
  }
  /** Re-reads the stage's draft from the hidden store (reload restore) and the flagged records; true if it changed. */
  function loadRest(inst, st) {
    const c = restInputOf(inst, st), flagged = slotRecs(inst, st).some(r => r.draft && !r.msg);
    const v = c && c.value ? c.value : (flagged ? '' : null);
    if (v === st.restDraft) return false;
    st.restDraft = v;
    return true;
  }
  /** The draft (already in the store as its last message) becomes a sent message; the strip's attachments go with it. */
  function sealDraft(inst, st, text) {
    const store = storeOf(inst, st), recs = pendingRecs(inst, st);
    if (!store) return;
    if (!recs.length) { commitDraft(st); return; }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    st.msgSig = null;
    const all = msgsOf(st, store).slice();
    const draft = text && text.trim() ? all.pop() : '';
    all.push(plainMsg(draft) + MSG_MARK + id);
    st.msgs = all;
    writeMsgs(st, store, all);
    recs.forEach(r => { if (typeof setAttachmentMsg === 'function') setAttachmentMsg(r, id); else r.msg = id; });
  }
  /** Redraws the messages of a stage wherever they stand (never under an inline edit). */
  function refreshNotes(inst, st) {
    if (st.editing) return;
    if (st === inst.stages[inst.idx] || st.notes) renderNotes(inst, st);
    if (st !== inst.stages[inst.idx] && st.me) fillMe(inst, st, true);
  }
  function noteAtts(inst, st, recs, editable) {
    const box = h('div', 'an-note-att');
    box.setAttribute('role', 'list');
    box.setAttribute('aria-label', L('Anhänge', 'Attachments'));
    recs.forEach(rec => {
      const it = h('div', 'an-att-i');
      it.setAttribute('role', 'listitem');
      it.dataset.error = String(!!rec.error);
      if (RASTER.test(rec.mime || '')) {
        const open = btn('an-att-t'), img = h('img');
        img.src = attUrl(rec); img.alt = rec.name || '';
        open.appendChild(img);
        open.setAttribute('aria-label', L('Bild vergrößern: ', 'Enlarge image: ') + (rec.name || ''));
        tip(open, rec.name || '');
        open.addEventListener('click', e => { e.stopPropagation(); openLightbox(inst, rec, open); });
        it.appendChild(open);
      } else {
        const fl = h('div', 'an-att-t an-att-file');
        fl.append(h('span', '', typeof attachFileIcon === 'function' ? attachFileIcon(rec.mime, rec.name) : '📎'), h('span', 'an-att-n', rec.name || ''));
        tip(fl, rec.name || '');
        it.appendChild(fl);
      }
      if (editable && typeof removeAttachment === 'function') {
        const x = btn('an-att-x', '×');
        x.setAttribute('aria-label', L('Anhang entfernen: ', 'Remove attachment: ') + (rec.name || ''));
        tip(x, L('Anhang entfernen', 'Remove attachment'));
        x.addEventListener('click', e => { e.stopPropagation(); dropMsgAtt(inst, st, rec); });
        it.appendChild(x);
      }
      box.appendChild(it);
    });
    return box;
  }
  /** x on a sent attachment: it goes; a message left with neither text nor attachments goes too. */
  function dropMsgAtt(inst, st, rec) {
    const store = storeOf(inst, st);
    if (!store || frozen(inst)) return;
    const id = rec.msg;
    Promise.resolve(removeAttachment(slotOf(inst, st), rec.key)).then(() => {
      const list = msgsOf(st, store), i = list.findIndex(m => msgIdOf(m) === id);
      if (i >= 0 && !plainMsg(list[i]).trim() && !msgRecs(inst, st, id).length) deleteNote(inst, st, i);
      else refreshNotes(inst, st);
    });
  }
  /** A message is stored with a no-break space between its paragraphs (a blank line would split it in two messages). */
  const packText = t => t.trim().replace(/\n\s*\n/g, '\n\u00a0\n');
  /** Plain text at the caret, never markup. */
  function insertPlain(text, host) {
    if (!text) return;
    if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, text)) return;
    const sel = window.getSelection && window.getSelection();
    const n = document.createTextNode(text);
    if (!sel || !sel.rangeCount || !host.contains(sel.getRangeAt(0).commonAncestorContainer)) { host.appendChild(n); return; }
    const r = sel.getRangeAt(0);
    r.deleteContents(); r.insertNode(n); r.setStartAfter(n); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  }
  /** Pen on an earlier question's message: the bubble itself becomes the field (Enter saves, Esc cancels, an empty text deletes). */
  function editInline(inst, st, i) {
    const store = storeOf(inst, st);
    if (!store || frozen(inst) || !st.me) return;
    const row = st.me.querySelectorAll('.an-note-m')[i], m = msgsOf(st, store)[i];
    if (!row || m == null || row.querySelector('.an-ied')) return;
    const ed = h('div', 'an-ied');
    row.classList.add('an-ied-on');
    row.textContent = '';
    ed.contentEditable = 'true';
    ed.setAttribute('role', 'textbox');
    ed.setAttribute('aria-multiline', 'true');
    ed.setAttribute('aria-label', L('Nachricht bearbeiten', 'Edit message'));
    tip(ed, L('Enter speichert · Esc verwirft', 'Enter saves · Esc cancels'));
    ed.textContent = plainMsg(m);
    row.appendChild(ed);
    const mid = msgIdOf(m);   // its attachments stay with it: the saved text keeps the marker
    st.editing = true;
    let done = false;
    const finish = save => {
      if (done) return;
      done = true; st.editing = false;
      if (save && !frozen(inst)) {
        const list = msgsOf(st, store).slice(), t = compText(ed);
        const next = t.trim() ? packText(t) + (mid ? MSG_MARK + mid : '') : (mid && msgRecs(inst, st, mid).length ? MSG_MARK + mid : '');
        if (next !== list[i]) {
          if (next) list[i] = next; else list.splice(i, 1);
          st.msgs = list;
          writeMsgs(st, store, list);
          if (st.notes) renderNotes(inst, st);
        }
      }
      fillMe(inst, st, true);
    };
    ed.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    ed.addEventListener('blur', () => finish(true));
    ed.addEventListener('paste', e => { e.preventDefault(); const cd = e.clipboardData; insertPlain(cd && typeof cd.getData === 'function' ? cd.getData('text/plain') : '', ed); });
    ed.focus({ preventScroll: true });
    const sel = window.getSelection && window.getSelection();
    if (sel && document.createRange) { const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  }
  /* ----- attachments of the open stage: a thumbnail strip floating over the chat, right above the field ----- */
  const slotOf = (inst, st) => { const s = storeOf(inst, st); return (s && s.dataset.comment) || ''; };
  const recsOf = slot => (typeof _attachments !== 'undefined' && _attachments.get(slot)) || [];
  /** The engine re-renders its own (hidden) bar after every upload step; the strip follows the same call. */
  function hookAttachments() {
    const f0 = window.renderAttachments;
    if (typeof f0 !== 'function' || f0.__an) return;
    // A sent message's thumbnails follow too (a reload restores the records after the chat was drawn).
    const f1 = function (slot) {
      const r = f0.apply(this, arguments);
      instances.forEach(inst => {
        // Records flagged as a restored draft (after a reload they arrive late) bring that draft back, even without text.
        inst.stages.forEach(st => { if (slotOf(inst, st) === slot && loadRest(inst, st) && st === inst.stages[inst.idx]) loadComposer(inst, st); });
        renderStrip(inst);
        if ((_attachments.get(slot) || []).some(x => x.msg)) inst.stages.forEach(st => { if (slotOf(inst, st) === slot) refreshNotes(inst, st); });
      });
      return r;
    };
    f1.__an = true;
    window.renderAttachments = f1;
  }
  /** Files into the open stage's slot. A stage without a slot or a page without the engine says so, it never drops them silently. */
  function addFiles(inst, files) {
    if (frozen(inst) || !files.length) return;
    const slot = slotOf(inst, inst.stages[inst.idx]);
    if (!slot || typeof addAttachments !== 'function') {
      inst.comp.strip.textContent = '';
      inst.comp.strip.appendChild(h('div', 'an-att-msg', L('Anhänge sind hier nicht verfügbar.', 'Attachments are not available here.')));
      inst.comp.strip.hidden = false;
      return;
    }
    Promise.resolve(addAttachments(slot, files)).then(() => renderStrip(inst), () => renderStrip(inst));
    renderStrip(inst);
  }
  const RASTER = /^image\/(png|jpeg|gif|webp)$/;
  function attUrl(rec) {
    if (rec.synced && rec.id) return '/attachments/' + rec.id;
    if (!rec.__url && typeof URL.createObjectURL === 'function') rec.__url = URL.createObjectURL(rec.blob);
    return rec.__url || '';
  }
  function renderStrip(inst) {
    const c = inst.comp;
    if (!c) return;
    // Only what is not sent yet: a sent attachment stands in its message's bubble.
    const slot = slotOf(inst, inst.stages[inst.idx]), recs = slot ? unsentRecs(inst, inst.stages[inst.idx]) : [], locked = frozen(inst);
    c.strip.textContent = '';
    recs.forEach(rec => {
      const it = h('div', 'an-att-i'), raster = RASTER.test(rec.mime || '');
      it.setAttribute('role', 'listitem');
      it.dataset.synced = String(!!rec.synced);
      it.dataset.error = String(!!rec.error);
      const status = typeof attachStatusText === 'function' ? attachStatusText(rec) : '';
      if (raster) {
        const open = btn('an-att-t');
        const img = h('img');
        img.src = attUrl(rec); img.alt = rec.name || '';
        open.appendChild(img);
        open.setAttribute('aria-label', L('Bild vergrößern: ', 'Enlarge image: ') + (rec.name || ''));
        tip(open, (rec.name || '') + status);
        open.addEventListener('click', () => openLightbox(inst, rec, open));
        it.appendChild(open);
      } else {
        const fl = h('div', 'an-att-t an-att-file');
        fl.append(h('span', '', typeof attachFileIcon === 'function' ? attachFileIcon(rec.mime, rec.name) : '📎'), h('span', 'an-att-n', rec.name || ''));
        tip(fl, (rec.name || '') + status);
        it.appendChild(fl);
      }
      if (!rec.synced && !rec.error) { const p = h('i', 'an-att-p'); p.style.width = (rec.progress || 0) + '%'; it.appendChild(p); }
      if (!locked) {
        if (rec.error && typeof uploadAttachment === 'function') {
          const rt = btn('an-att-r', '⟳');
          rt.setAttribute('aria-label', L('Erneut senden', 'Retry'));
          tip(rt, L('Erneut senden', 'Retry'));
          rt.addEventListener('click', () => { uploadAttachment(rec).then(() => renderStrip(inst)); });
          it.appendChild(rt);
        }
        const x = btn('an-att-x', '×');
        x.setAttribute('aria-label', L('Anhang entfernen: ', 'Remove attachment: ') + (rec.name || ''));
        tip(x, L('Anhang entfernen', 'Remove attachment'));
        x.addEventListener('click', () => { Promise.resolve(removeAttachment(slot, rec.key)).then(() => renderStrip(inst)); renderStrip(inst); });
        it.appendChild(x);
      }
      c.strip.appendChild(it);
    });
    c.strip.hidden = !c.strip.firstChild;
  }
  /** Large view of an image: Esc, the x or a click beside it closes; focus goes in and returns to the thumbnail. */
  function openLightbox(inst, rec, opener) {
    closeLightbox(inst);
    const ov = h('div', 'an-lb'), img = h('img'), x = btn('an-lb-x', '×');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', rec.name || L('Bild', 'Image'));
    img.src = attUrl(rec); img.alt = rec.name || '';
    x.setAttribute('aria-label', L('Schließen', 'Close'));
    tip(x, L('Schließen', 'Close'), 'Esc');
    x.addEventListener('click', () => closeLightbox(inst));
    ov.addEventListener('click', e => { if (e.target !== img) closeLightbox(inst); });
    ov.append(img, x);
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLightbox(inst); }
      else if (e.key === 'Tab') { e.preventDefault(); x.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    inst.lb = { ov, onKey, opener };
    inst.root.appendChild(ov);
    x.focus();
  }
  function closeLightbox(inst) {
    const lb = inst.lb;
    if (!lb) return;
    inst.lb = null;
    document.removeEventListener('keydown', lb.onKey, true);
    lb.ov.remove();
    if (lb.opener && lb.opener.isConnected) lb.opener.focus(); else focusComposer(inst);
  }
  /** Opens a stage in the composer: its sent notes stand in the chat, the field is empty. An unsent draft of
   *  the stage left becomes a message there; a draft of this same stage stays while typing goes on. */
  function loadComposer(inst, st) {
    const store = storeOf(inst, st), ed = inst.comp.ed, prev = inst.compSt, draft = compText(ed);
    const keep = prev === st && draft && store && st.msgSig === store.value;
    if (prev && prev !== st && !frozen(inst) && ((draft && !restOnly(prev, draft)) || pendingRecs(inst, prev).length)) {
      sealDraft(inst, prev, restOnly(prev, draft) ? '' : draft); renderNotes(inst, prev);
      // The note sent with the answer (Ctrl+Enter / arrow keys / rail) is a message only now: the earlier question's own
      // bubble under its answer is redrawn at once, never left without it (the cache of go() ran before this seal).
      if (prev.me) fillMe(inst, prev, true);
    }
    inst.compSt = st;
    ed.dataset.ph = L('Notiz an devops … (optional)', 'Note to devops … (optional)');   // a question with "Keine passt" re-sets it (syncDecision)
    if (!keep) clearComposer(inst);
    // Deleted messages of this question wait here as an unsent draft (never in the store, never in the result).
    if (!keep && st.restDraft && !frozen(inst)) { ed.appendChild(document.createTextNode(st.restDraft)); ed.dataset.empty = ''; }
    renderNotes(inst, st);
    ed.contentEditable = frozen(inst) ? 'false' : 'true';
    inst.comp.att.hidden = false;   // every stage takes attachments (its own slot), not only the questions with an attach bar
    closeLightbox(inst);
    renderStrip(inst);
  }
  /** True while the composer still holds exactly the restored (deleted-messages) draft: it is not the user's own input yet. */
  function restOnly(st, draft) { return st.restDraft != null && String(draft || '').trim() === st.restDraft.trim(); }
  /** The stage being left: its draft (and the strip's attachments) become a sent message BEFORE any view reads the notes
   *  (the earlier question's bubble, the closing overview) - Ctrl+Enter, arrow keys and the rail all pass through here. */
  function sealLeaving(inst, prev) {
    if (!prev || !inst.comp || frozen(inst) || inst.compSt !== prev) return;
    const draft = restOnly(prev, compText(inst.comp.ed)) ? '' : compText(inst.comp.ed);   // the restored draft stays a draft
    if (draft || pendingRecs(inst, prev).length) { sealDraft(inst, prev, draft); renderNotes(inst, prev); }
  }
  function focusComposer(inst) {
    const ed = inst.comp.ed;
    if (frozen(inst)) return;
    ed.focus({ preventScroll: true });
    const sel = window.getSelection && window.getSelection();
    if (sel && document.createRange) { const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  }
  /** Send: the text becomes a chat message on this stage. It moves on only under "Keine passt", where the message IS the answer. */
  function sendNote(inst) {
    // Sending the restored draft as it stands is the user's decision: from here it is a normal message.
    { const s0 = inst.stages[inst.idx]; if (s0 && restOnly(s0, compText(inst.comp.ed))) setRest(inst, s0, null); }
    composeSync(inst);
    const st = inst.stages[inst.idx], text = compText(inst.comp.ed);
    if (frozen(inst)) return false;
    // An empty send is "Weiter" / "Los geht's". The closing never submits the
    // round from here — that is a grave step; it only points at the button.
    // It advances exactly ONE stage and keeps the selected answer; rapid sends (a held Enter, a
    // double click) never skip a stage unseen - see stepOnce().
    // Attachments in the strip make a send a message even without text (an image says it better than a sentence).
    const pending = pendingRecs(inst, st).length;
    if (!text && !pending) {
      if (st.kind === 'review' || st.kind === 'done') { pointAtNextRound(); return false; }
      return stepOnce(inst, true);
    }
    if (st.kind === 'dec' && !storeOf(inst, st)) return false;   // no storage target: never advance and drop the note
    inst.comp.el.classList.remove('an-sent'); void inst.comp.el.offsetWidth; inst.comp.el.classList.add('an-sent');
    sealDraft(inst, st, text);   // the text and the strip's attachments become ONE message
    clearComposer(inst);
    renderNotes(inst, st);
    renderStrip(inst);
    if (st.kind !== 'dec') { glide(inst, st.notes); return true; }
    markTouched(st.el);
    if ((ctl1(st.el, 'dm-' + decId(st.el) + '-none') || {}).value === '1') step(inst, 1);
    else glide(inst, st.el.querySelector(':scope > .an-m-a'));
    return true;
  }
  /** Empty send / Enter on a question: ONE stage forward, never more. A stage that is still entering simply
   *  shows in full (go() ends the enter sequence); a second send within SEND_GAP ms (the new stage is not
   *  current for the user yet) is dropped. The stage left is visited with its real dwell (go() -> hesStop). */
  const SEND_GAP = 250;
  function stepOnce(inst, accept) {
    const st = inst.stages[inst.idx], now = Date.now();
    if (frozen(inst) || inst.seq.indexOf(st) >= inst.seq.length - 1) return false;
    if (inst.sendAt && now - inst.sendAt < SEND_GAP) return false;
    inst.sendAt = now;
    if (accept && st.kind === 'dec') markTouched(st.el);
    step(inst, 1);
    return true;
  }
  /** Highlight "Zur nächsten Runde" (or the closed panel's ☰) briefly — the user clicks it themselves. */
  function pointAtNextRound() {
    const b = document.getElementById('submit-iterate-btn');
    const t = b && b.offsetParent ? b : document.getElementById('panel-toggle');
    if (!t) return;
    t.classList.remove('an-point'); void t.offsetWidth; t.classList.add('an-point');
    setTimeout(() => t.classList.remove('an-point'), 2400);
  }
```


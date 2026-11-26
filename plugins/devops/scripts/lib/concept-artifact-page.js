/* eslint-disable no-unused-vars -- plain ES5: every catch needs a binding */
/**
 * @module concept-artifact-page
 * @plugin devops
 * @description The page half of the artifact copy of a concept page
 *   (`scripts/concept-artifact.js`, #589). `concept-artifact.js` inlines this
 *   file into the page, verbatim, inside one IIFE that ends in
 *   `installConceptArtifact(window)`; Node requires it for the tests and for
 *   the session-side digest (`mergeDrafts`, `pickDecision`).
 *
 *   Plain ES5 on purpose: it runs in whatever browser opens the artifact.
 *
 *   Store layout (the artifact's `db`, one store per artifact, shared by
 *   every viewer):
 *
 *   - `submissions/<submission_id>` — one document per submit, written once
 *     and never overwritten by a page. Two people who submit at the same time
 *     land in two documents; a re-sent payload (the offline queue) finds its
 *     own document and is acked without a second write. Claude marks a
 *     document `_picked_up_at` / `_processed_at` (never deletes it).
 *   - `drafts/<load id>` — one document per page load: the autosaved state,
 *     a per-key time stamp for every value the person changed in that load,
 *     the deliberate clears, the union of typed notes and the values another
 *     viewer's newer edit replaced (`superseded`). Nobody writes another
 *     load's document, so two people typing at once never overwrite each
 *     other; the shared state is the per-key newest across all documents
 *     (`mergeDrafts`), and every open view applies it live.
 *   - `/reload` has no document of its own: its counter is the newest
 *     `_processed_at`, which Claude writes only after it published the next
 *     round, so the engine's `/reload` poll then reloads every open view.
 *   - Release fallback (#1241): a session that kept an older read-back
 *     protocol (`concept/decisions`, no `_processed_at`) still frees a
 *     waiting view. While an unprocessed submission is out, the wrapper
 *     treats two signals as "the next round is published": a change in the
 *     legacy `concept` collection, and a new build of this page (the
 *     `data-ca-build` stamp in the page's own HTML differs from the one this
 *     load runs). Either one counts that submission as processed and moves
 *     the `/reload` counter, exactly as a `_processed_at` would.
 *
 *   After a stored (not duplicate) submit the wrapper also posts one comment
 *   to the owning session where the `comments` capability reports
 *   `canSendToClaude() === 'available'` (a best-effort wake; errors swallowed).
 *
 *   The wrapper never acks what is not stored (507 instead), and installs
 *   only where `window.claude.use` exists.
 */

/* Keys that describe an answer and are shared between viewers. Everything
 * else in the engine's state blob (theme, `_activeView`, dock size, pin
 * positions) belongs to the tab that wrote it. */
var CA_SYNC_RE = /^(input|text|range|select):/;

function caIsText(k) { return k.indexOf('text:') === 0; }

/**
 * Per-key newest value across every draft document of this page version.
 * A typed-text key that is empty only counts when its document reports it as
 * a deliberate clear: an empty autosave from a broken client never erases a
 * note another viewer (or an earlier load) wrote.
 * @param {object[]} docs draft document bodies
 * @param {string} [pageVersion] only documents of this version (or none) count
 * @returns {{values: Object<string,{v:*,s:number,tab:string,by:string}>, recovered: Object<string,string>}}
 */
function mergeDrafts(docs, pageVersion) {
  var win = {};
  var rec = {};
  var recAt = {};
  (docs || []).forEach(function (d) {
    if (!d || typeof d !== 'object') return;
    if (pageVersion && d.page_version && d.page_version !== pageVersion) return;
    var st = d.state || {};
    var sp = d.stamps || {};
    var cl = d.clears || {};
    var tab = String(d.tab || '');
    Object.keys(sp).forEach(function (k) {
      if (!CA_SYNC_RE.test(k) || !Object.prototype.hasOwnProperty.call(st, k)) return;
      var s = sp[k];
      if (typeof s !== 'number' || !(s > 0)) return;
      var v = st[k];
      if (caIsText(k) && v === '' && !cl[k]) return;
      var cur = win[k];
      if (!cur || s > cur.s || (s === cur.s && tab > cur.tab)) win[k] = { v: v, s: s, tab: tab, by: d.by || '' };
    });
    var at = Number(d._storedAtMs) || 0;
    var r = d.recovered || {};
    Object.keys(r).forEach(function (k) {
      if (!caIsText(k) || typeof r[k] !== 'string' || !r[k]) return;
      if (recAt[k] === undefined || at > recAt[k]) { rec[k] = r[k]; recAt[k] = at; }
    });
  });
  var recovered = {};
  Object.keys(rec).forEach(function (k) { if (!win[k]) recovered[k] = rec[k]; });
  Object.keys(win).forEach(function (k) {
    if (caIsText(k) && typeof win[k].v === 'string' && win[k].v) recovered[k] = win[k].v;
  });
  return { values: win, recovered: recovered };
}

/**
 * What the engine's `GET /decisions` sees: the newest submission Claude has
 * not processed yet; once all are processed, the newest one as
 * `submitted: false` carrying its `_processed_at` (so a waiting panel is
 * released and a reload does not veil a finished round again); `{}` before
 * the first submit.
 */
function pickDecision(list, releasedAt) {
  var all = (list || []).filter(function (d) { return d && typeof d === 'object'; });
  all.sort(function (a, b) { return (Number(b._storedAtMs) || 0) - (Number(a._storedAtMs) || 0); });
  var rel = Number(releasedAt) || 0;
  for (var i = 0; i < all.length; i++) {
    if (!all[i]._processed_at && all[i].submitted !== false && !((Number(all[i]._storedAtMs) || 0) <= rel)) return all[i];
  }
  if (!all.length) return {};
  var copy = {};
  Object.keys(all[0]).forEach(function (k) { copy[k] = all[0][k]; });
  copy.submitted = false;
  return copy;
}

function installConceptArtifact(win, opts) {
  var claude = win.claude;
  var BUILD = String((opts && opts.build) || '');
  if (!claude || typeof claude.use !== 'function' || typeof win.fetch !== 'function') return null;
  var doc = win.document || null;
  var realFetch = win.fetch.bind(win);
  var SUBS = 'submissions';
  var DRAFTS = 'drafts';
  var ls = null;
  try { ls = win.localStorage || null; } catch (e) { ls = null; }

  function rid(p) { return p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function safeId(s) {
    s = String(s == null ? '' : s).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 120);
    return (s && s !== '.' && s !== '..') ? s : '';
  }
  // One draft document per page load: a reload, a second tab or a second
  // person never share a document, so no write ever replaces another's.
  var LOAD = safeId(rid('t'));
  var lastStamp = 0;
  function stampNow() { var n = Date.now(); lastStamp = n > lastStamp ? n : lastStamp + 1; return lastStamp; }

  var dbPromise = null;
  var db = null;
  function getDb() {
    if (!dbPromise) {
      dbPromise = Promise.resolve().then(function () { return claude.use('db'); })
        .then(function (d) { db = d || null; if (db) startLive(); return db; }, function () { return null; });
    }
    return dbPromise;
  }
  var byPromise = null;
  function whoAmI() {
    if (!byPromise) {
      byPromise = Promise.resolve().then(function () { return claude.use('user'); })
        .then(function (u) { return u && typeof u.id === 'function' ? u.id() : null; })
        .then(function (id) { return id ? String(id) : ''; }, function () { return ''; });
    }
    return byPromise;
  }
  // The artifact `comments` capability (declared at publish): a viewer's
  // submit then also posts one comment to the owning session, which wakes it
  // where the durable wake subscription could not register (#1198). The call
  // shape (canSendToClaude / anchorFor / sendToClaude) is feature-detected and
  // every failure is swallowed: the wake is a convenience, never a reason for
  // the submit not to be acknowledged.
  var commentsPromise = null;
  function getComments() {
    if (!commentsPromise) {
      commentsPromise = Promise.resolve().then(function () { return claude.use('comments'); })
        .then(function (c) { return c || null; }, function () { return null; });
    }
    return commentsPromise;
  }
  function wakeClaude(data) {
    try {
      return getComments().then(function (c) {
        if (!c || typeof c.canSendToClaude !== 'function' || typeof c.sendToClaude !== 'function') return;
        return Promise.resolve(c.canSendToClaude()).then(function (state) {
          if (state !== 'available') return;
          var action = String((data && data.action) || 'submit');
          var round = data && data.iteration != null ? ' of round ' + data.iteration : '';
          var text = 'Concept page submitted: action "' + action + '"' + round + '. Read the decisions from the artifact store (submissions) and continue.';
          // anchorFor resolves a Promise (runtime contract comments.d.ts); the
          // target needs a real anchor, so no anchor means no wake.
          if (typeof c.anchorFor !== 'function' || !doc || !doc.body) return;
          return Promise.resolve(c.anchorFor(doc.body)).then(function (anchor) {
            if (!anchor) return;
            return c.sendToClaude({ anchor: anchor, text: text });
          });
        });
      }).catch(function () { /* the wake is best effort */ });
    } catch (e) { return Promise.resolve(); }
  }
  function reply(status, body) {
    return new Response(JSON.stringify(body), { status: status, headers: { 'Content-Type': 'application/json' } });
  }
  function codeOf(e) { return (e && e.code) || 'write-failed'; }
  // The store's own contract: `unavailable` is transient, retry once after a
  // short randomized delay; every other code is final.
  function once(fn) {
    return fn().catch(function (e) {
      if (!e || e.code !== 'unavailable') throw e;
      return new Promise(function (r) { setTimeout(r, 200 + Math.floor(Math.random() * 400)); }).then(fn);
    });
  }
  // One write at a time per document (the store asks for it).
  var chains = {};
  function serial(path, fn) {
    var p = (chains[path] || Promise.resolve()).then(fn, fn);
    chains[path] = p.then(function () {}, function () {});
    return p;
  }
  function routeOf(input) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    try {
      var p = new URL(url, win.location.href).pathname;
      return p === '/decisions' || p === '/draft' || p === '/reload' ? p : null;
    } catch (e) { return null; }
  }
  function bodyOf(input, init) {
    return init && init.body != null ? Promise.resolve(String(init.body))
      : (input && typeof input.text === 'function' ? input.text() : Promise.resolve('{}'));
  }
  function pageVersion() {
    try { return (doc && doc.documentElement && doc.documentElement.dataset.pageVersion) || ''; } catch (e) { return ''; }
  }
  function same(a, b) { return a === b || (a !== a && b !== b); }

  // --- submissions ---------------------------------------------------------
  var subsCache = null;
  function postDecision(data) {
    return getDb().then(function (d) {
      if (!d) return reply(507, { durable: false, reason: 'no-artifact-db' });
      if (!data.submission_id) data.submission_id = rid('sub');
      var id = safeId(data.submission_id);
      var ref = d.collection(SUBS).doc(id);
      return once(function () { return ref.get(); }).then(function (snap) {
        // Already stored (a retry of a payload whose ack was lost, or one
        // Claude already processed): ack it, never write it a second time.
        if (snap && snap.exists) return reply(200, { durable: true, duplicate: true });
        return whoAmI().then(function (by) {
          data._artifactStoredAt = new Date().toISOString();
          data._storedAtMs = Date.now();
          data._tab = LOAD;
          if (by) data._by = by;
          return serial(SUBS + '/' + id, function () { return once(function () { return ref.set(data); }); })
            .then(function () { wakeClaude(data); return reply(200, { durable: true }); });
        });
      }).catch(function (e) { return reply(507, { durable: false, reason: codeOf(e) }); });
    });
  }
  function readDecisions() {
    return getDb().then(function (d) {
      if (!d) throw new TypeError('concept-artifact: no artifact db');
      if (subsCache) return pickDecision(subsCache, releasedAt);
      return once(function () { return d.collection(SUBS).get(); }).then(function (snap) {
        return pickDecision((snap.docs || []).map(function (x) { return x.data(); }), releasedAt);
      });
    });
  }

  // --- drafts --------------------------------------------------------------
  var slug = null;
  function storageKey() {
    if (slug != null) return 'concept-state-' + slug;
    try { return 'concept-state-' + win.location.pathname.split('/').pop().replace('.html', ''); } catch (e) { return ''; }
  }
  function readLocal() {
    try { return JSON.parse((ls && ls.getItem(storageKey())) || '{}') || {}; } catch (e) { return {}; }
  }
  var lastState = readLocal();   // the baseline: what this load started with
  var stamps = {};               // keys this load changed, with when
  var seen = {};                 // the newest remote stamp this load adopted, per key
  var clears = {};
  var recovered = {};
  var superseded = [];
  var meta = { slug: '', page_version: '', iteration: '' };
  var draftsCache = null;

  function composeDraft(by) {
    return {
      slug: meta.slug, page_version: meta.page_version || pageVersion(), iteration: meta.iteration,
      state: lastState, stamps: stamps, clears: clears, recovered: recovered, superseded: superseded,
      tab: LOAD, by: by || '', _artifactStoredAt: new Date().toISOString(), _storedAtMs: Date.now()
    };
  }
  function writeOwn() {
    return getDb().then(function (d) {
      if (!d) return reply(507, { durable: false, reason: 'no-artifact-db' });
      return whoAmI().then(function (by) {
        var ref = d.collection(DRAFTS).doc(LOAD);
        return serial(DRAFTS + '/' + LOAD, function () { return once(function () { return ref.set(composeDraft(by)); }); })
          .then(function () { return reply(200, { durable: true }); });
      }).catch(function (e) { return reply(507, { durable: false, reason: codeOf(e) }); });
    });
  }
  function postDraft(payload) {
    if (payload.slug != null) slug = String(payload.slug);
    meta = { slug: payload.slug || '', page_version: payload.page_version || '', iteration: payload.iteration || '' };
    var st = payload.state || {};
    var cl = {};
    (payload.cleared || []).forEach(function (k) { cl[k] = true; });
    var now = stampNow();
    Object.keys(st).forEach(function (k) {
      if (!CA_SYNC_RE.test(k)) return;
      var v = st[k];
      if (same(v, lastState[k])) return;
      if (caIsText(k) && v === '' && !cl[k]) return;   // not a deliberate clear: no opinion
      stamps[k] = now;
      if (cl[k]) clears[k] = now; else delete clears[k];
    });
    Object.keys(st).forEach(function (k) {
      if (caIsText(k) && typeof st[k] === 'string' && st[k]) recovered[k] = st[k];
    });
    Object.keys(cl).forEach(function (k) { delete recovered[k]; });
    var next = {};
    Object.keys(st).forEach(function (k) { next[k] = st[k]; });
    // A blank autosave keeps the note it did not mean to erase.
    Object.keys(lastState).forEach(function (k) {
      if (caIsText(k) && next[k] === '' && !cl[k] && lastState[k]) next[k] = lastState[k];
    });
    lastState = next;
    return writeOwn();
  }
  function readDraft() {
    return getDb().then(function (d) {
      if (!d) throw new TypeError('concept-artifact: no artifact db');
      var docs = draftsCache;
      var p = docs ? Promise.resolve(docs) : once(function () { return d.collection(DRAFTS).get(); })
        .then(function (snap) { return (snap.docs || []).map(function (x) { return x.data(); }); });
      return p.then(function (list) {
        var pv = pageVersion();
        if (!list.length) return { found: false };
        var m = mergeDrafts(list, pv);
        return { found: true, page_version: pv || (list[0] && list[0].page_version) || '', recovered: m.recovered };
      });
    });
  }

  // --- live: other viewers' edits, submissions and the next round ----------
  function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function elementFor(k) {
    if (!doc || typeof doc.querySelector !== 'function') return null;
    try {
      var live = doc.querySelector('section[data-iteration][data-active]');
      var q = function (sel) { return (live && live.querySelector(sel)) || doc.querySelector(sel); };
      var parts = k.split(':');
      var type = parts.shift();
      var id = parts.join(':');
      if (type === 'text') {
        var m = /^i([^:]+):([\s\S]*)$/.exec(id);
        if (m) id = m[2];
        return q('[data-comment="' + cssq(id) + '"]') || q('textarea[id="' + cssq(id) + '"], input[id="' + cssq(id) + '"]')
          || q('input[type="hidden"][name="' + cssq(id) + '"]');
      }
      if (type === 'input') {
        var name = parts.slice(0, -1).join(':');
        var val = parts[parts.length - 1];
        return q('input[name="' + cssq(name) + '"][value="' + cssq(val) + '"], input[id="' + cssq(name) + '"][value="' + cssq(val) + '"]');
      }
      return q('[id="' + cssq(id) + '"], [name="' + cssq(id) + '"]');
    } catch (e) { return null; }
  }
  var deferred = false;
  var SAFE_KEY = /^[^"'\\[\]\n\r<>`]{1,400}$/;
  function applyRemote() {
    if (!draftsCache || !ls) return false;
    var pv = pageVersion();
    var local = readLocal();
    if (local._pageVersion && pv && local._pageVersion !== pv) return false;
    var m = mergeDrafts(draftsCache, pv).values;
    var focused = doc ? doc.activeElement : null;
    var changed = [];
    deferred = false;
    Object.keys(m).forEach(function (k) {
      var w = m[k];
      if (w.tab === LOAD) return;
      // Keys come from other viewers: the engine's restore builds selectors
      // from them unescaped, so a quote or bracket would break it for everyone.
      if (!SAFE_KEY.test(k)) return;
      if (!(w.s > Math.max(stamps[k] || 0, seen[k] || 0))) return;
      if (same(local[k], w.v)) { seen[k] = w.s; lastState[k] = w.v; return; }
      var el = elementFor(k);
      // Never under the cursor: the person is typing there right now. It is
      // applied on the next blur unless they changed it themselves meanwhile.
      if (el && focused && el === focused) { deferred = true; return; }
      if (stamps[k]) {
        superseded.push({ key: k, value: local[k], stamp: stamps[k], by_tab: w.tab, at: Date.now() });
        if (superseded.length > 50) superseded.splice(0, superseded.length - 50);
        delete stamps[k];
      }
      seen[k] = w.s;
      local[k] = w.v;
      lastState[k] = w.v;
      if (el && el.dataset) delete el.dataset.touched;
      changed.push(k);
    });
    if (!changed.length) return false;
    try { ls.setItem(storageKey(), JSON.stringify(local)); } catch (e) { return false; }
    try { if (typeof win.restoreState === 'function') win.restoreState(); } catch (e) { /* the stored copy stands */ }
    try { if (typeof win.updateNoteMarkers === 'function') win.updateNoteMarkers(); } catch (e) { /* cosmetic */ }
    // A replaced own value is kept in this load's document (superseded).
    writeOwn();
    return true;
  }
  var subsBoot = true;
  function onSubs(snap) {
    var list = (snap.docs || []).map(function (x) { return x.data(); });
    var before = subsCache;
    subsCache = list;
    if (subsBoot) { subsBoot = false; return; }
    // Someone else sent the live round: show this view as sent too, so it
    // waits for the next round instead of sending a second, diverging one.
    var known = {};
    (before || []).forEach(function (d) { if (d && d.submission_id) known[d.submission_id] = true; });
    var fresh = list.some(function (d) { return d && !known[d.submission_id] && d._tab !== LOAD && !d._processed_at; });
    if (fresh && typeof win.restoreInFlightRound === 'function') { try { win.restoreInFlightRound(); } catch (e) { /* next reload veils it */ } }
  }
  function listen(ref, next, again) {
    try {
      ref.onSnapshot(next, function (e) {
        // A dead listener is renewed only for the one transient code.
        if (e && e.code === 'unavailable') setTimeout(again, 30000);
      });
    } catch (e) { /* no live updates in this view: the polls still read */ }
  }
  function subscribeDrafts() { listen(db.collection(DRAFTS), function (snap) { draftsCache = (snap.docs || []).map(function (x) { return x.data(); }); applyRemote(); }, subscribeDrafts); }
  function subscribeSubs() { listen(db.collection(SUBS), onSubs, subscribeSubs); }

  // --- release fallback (#1241) -------------------------------------------
  var releasedAt = 0;
  function pending() {
    return (subsCache || []).some(function (d) {
      return d && !d._processed_at && d.submitted !== false && !((Number(d._storedAtMs) || 0) <= releasedAt);
    });
  }
  function release() {
    if (!pending()) return false;
    var n = Date.now();
    releasedAt = n > releasedAt ? n : releasedAt + 1;
    return true;
  }
  // Only a real change counts: a listener may deliver the same snapshot again.
  var legacySeen = null;
  function subscribeLegacy() {
    listen(db.collection('concept'), function (snap) {
      var key = '';
      try {
        key = JSON.stringify((snap.docs || []).map(function (x) { return [x.id, x.data()]; }));
      } catch (e) { return; }
      var first = legacySeen === null;
      var changed = key !== legacySeen;
      legacySeen = key;
      if (!first && changed) release();
    }, subscribeLegacy);
  }
  var BUILD_RE = /data-ca-build="([^"]+)"/;
  function checkBuild() {
    if (!BUILD || !pending()) return Promise.resolve(false);
    var href = '';
    try { href = String(win.location.href || ''); } catch (e) { href = ''; }
    if (!/^https?:/i.test(href)) return Promise.resolve(false);
    try {
      return Promise.resolve(realFetch(href, { cache: 'no-store' }))
        .then(function (r) { return r && r.ok ? r.text() : ''; })
        .then(function (t) { var m = BUILD_RE.exec(String(t || '')); return !!(m && m[1] !== BUILD && release()); },
          function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  var started = false;
  function startLive() {
    if (started || !db) return;
    started = true;
    subscribeDrafts();
    subscribeSubs();
    subscribeLegacy();
    setInterval(checkBuild, 60000);
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('focusout', function () { if (deferred) setTimeout(applyRemote, 0); });
    }
    // The engine retries a queued submit on a CONNECTED heartbeat, and an
    // artifact never has one (no bridge on its host). So the queue is driven
    // from here: idempotent on the engine side, one at a time.
    setInterval(function () {
      if (typeof win.retryPendingSubmission === 'function') { try { win.retryPendingSubmission(); } catch (e) { /* next tick */ } }
    }, 15000);
  }
  // Claude marks a submission processed only after it published the next
  // round, so the newest `_processed_at` is the reload counter: it moves
  // forward exactly when there is a new round to load.
  function reloadCounter(list) {
    var n = releasedAt;
    (list || []).forEach(function (x) { var t = x && Date.parse(x._processed_at); if (t > n) n = t; });
    return n;
  }
  function readReload() {
    return getDb().then(function (d) {
      if (!d) throw new TypeError('concept-artifact: no artifact db');
      if (subsCache) return { counter: reloadCounter(subsCache) };
      return once(function () { return d.collection(SUBS).get(); }).then(function (snap) {
        return { counter: reloadCounter((snap.docs || []).map(function (x) { return x.data(); })) };
      });
    });
  }

  win.fetch = function (input, init) {
    var route = routeOf(input);
    if (!route) return realFetch(input, init);
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method === 'POST' && route !== '/reload') {
      return bodyOf(input, init).then(function (text) {
        var data;
        try { data = JSON.parse(text || '{}'); } catch (e) { return reply(400, { durable: false, reason: 'bad-json' }); }
        if (!data || typeof data !== 'object') return reply(400, { durable: false, reason: 'bad-json' });
        return route === '/draft' ? postDraft(data) : postDecision(data);
      });
    }
    if (method === 'GET') {
      var read = route === '/draft' ? readDraft() : route === '/reload' ? readReload() : readDecisions();
      return read.then(function (body) { return reply(200, body); });
    }
    return Promise.resolve(reply(405, { reason: 'method-not-allowed' }));
  };
  // The teardown flush uses sendBeacon, which would bypass the patched fetch
  // and land on the artifact host. Route a /draft beacon through it instead.
  var nav = win.navigator;
  if (nav && typeof nav.sendBeacon === 'function') {
    var realBeacon = nav.sendBeacon.bind(nav);
    nav.sendBeacon = function (url, data) {
      if (routeOf(String(url)) !== '/draft') return realBeacon(url, data);
      var text = data && typeof data.text === 'function' ? data.text() : Promise.resolve(String(data == null ? '{}' : data));
      text.then(function (t) { return win.fetch('/draft', { method: 'POST', body: t }); }).catch(function () {});
      return true;
    };
  }
  getDb();
  return { load: LOAD, applyRemote: applyRemote, checkBuild: checkBuild };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mergeDrafts: mergeDrafts, pickDecision: pickDecision, installConceptArtifact: installConceptArtifact, CA_SYNC_RE: CA_SYNC_RE };
}

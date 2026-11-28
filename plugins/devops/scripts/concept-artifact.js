#!/usr/bin/env node
/**
 * @script concept-artifact
 * @version 0.2.0
 * @plugin devops
 * @description The artifact copy of a concept page (#589) — the no-bridge path
 *   of `/auto-concept`, and the default in a Claude Projects thread. The
 *   decisions land in the artifact's `db` store instead of the localhost
 *   bridge.
 *
 *   The engine page stays byte-for-byte what `docs/concepts/` holds. The build
 *   inserts ONE wrapper `<script>` right after the opening `<head>` tag, so it
 *   runs before any engine code, and writes the copy next to the source as
 *   `<name>.artifact.html`. The wrapper is `scripts/lib/concept-artifact-page.js`
 *   (store layout and rules there): one document per submission, one draft
 *   document per page load, live sync between viewers, the offline queue
 *   driven without a heartbeat, and `/reload` from the newest `_processed_at`.
 *
 *   The session side has no live channel: nothing wakes it when someone
 *   submits. It keeps a small record per concept under
 *   `.claude/concepts/<slug>/artifact.json` (url, processed submission ids),
 *   which `ss.concept.resume` reads on every session start, so a restarted or
 *   replaced session still knows where to look.
 *
 *   Usage:
 *     concept-artifact.js --artifact <page.html> [--out <path>]
 *         build the copy → { ok, source, out, capabilities, icon, readBack }
 *     concept-artifact.js record --page <page.html> --url <artifact url> [--root <dir>]
 *         after the first publish: remember the artifact for this concept
 *     concept-artifact.js digest --page <page.html> --submissions <file> [--drafts <file>] [--root <dir>]
 *         the ArtifactData listings saved to files → what to process, who
 *         sent what, notes typed after the last submit, and the ack writes
 *     concept-artifact.js mark --page <page.html> --ids <id,id> [--root <dir>]
 *         after processing: record those submissions as done
 *     concept-artifact.js close --page <page.html> [--root <dir>]
 *         the concept is closed: no more session-start hints
 *   Prints one JSON object on stdout. Exit 2 on bad arguments.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const page = require('./lib/concept-artifact-page');

const START = '<!-- concept-artifact:wrapper:start -->';
const END = '<!-- concept-artifact:wrapper:end -->';
const ICON = 'compass';
const CAPABILITIES = { db: {}, user: {}, comments: {} };
const SUBS = 'submissions';
const DRAFTS = 'drafts';

const PAGE_SRC = fs.readFileSync(path.join(__dirname, 'lib', 'concept-artifact-page.js'), 'utf8');

/**
 * The read-back protocol the wrapper and this CLI speak. Bump it whenever the
 * session-side steps change: a session that learned an older one from its
 * context before a mid-session plugin update gets the hint (#1241).
 * 2 = submissions + record → digest → pickup ack → mark → unacked batch.
 */
const PROTOCOL = 2;
const PROTOCOL_HINT = 'The artifact read-back protocol changed since this concept was last published (plugin update mid-session?). Forget the read-back steps from earlier in this session: record → digest → ops.pickup ack → mark → ops.unacked batch; re-read artifact-fallback.md § Read back before the next step. No concept/decisions document is written any more.';

function pluginVersion() {
  try { return String(JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version || ''); } catch { return ''; }
}

const BUILD_SAFE = /^[A-Za-z0-9_.:-]{1,64}$/;
function safeBuild(build) { return BUILD_SAFE.test(String(build || '')) ? String(build) : ''; }

// Inlined verbatim. `</script` inside the source would end the tag early.
function wrapperJs(build) {
  return `(function () {\n${PAGE_SRC.replace(/<\/script/gi, '<\\/script')}\ninstallConceptArtifact(window, { build: '${safeBuild(build)}' });\n})();`;
}
const WRAPPER_JS = wrapperJs('');

/** `build` stamps this build, so an open view can tell that a newer one was published (#1241). */
function wrapperBlock(build) {
  const b = safeBuild(build);
  return `${START}<script${b ? ` data-ca-build="${b}"` : ''}>${wrapperJs(b)}</script>${END}`;
}

/** Remove a previously inserted wrapper so a re-run replaces instead of stacking. */
function stripWrapper(html) {
  const s = html.indexOf(START);
  if (s < 0) return html;
  const e = html.indexOf(END, s);
  if (e < 0) return html;
  return html.slice(0, s) + html.slice(e + END.length);
}

/**
 * Insert the wrapper right after the opening <head> tag (else <html>).
 * @returns {{ok:true,html:string}|{ok:false,reason:string}}
 */
function wrap(source, build) {
  const html = stripWrapper(String(source));
  const m = /<head(\s[^>]*)?>/i.exec(html) || /<html(\s[^>]*)?>/i.exec(html);
  if (!m) return { ok: false, reason: 'no-head' };
  const at = m.index + m[0].length;
  return { ok: true, html: html.slice(0, at) + wrapperBlock(build) + html.slice(at) };
}

function defaultOut(src) {
  const ext = path.extname(src);
  return path.join(path.dirname(src), `${path.basename(src, ext)}.artifact${ext || '.html'}`);
}

function parseArgs(argv) {
  const opts = { cmd: 'build', artifact: null, out: null, page: null, url: null, submissions: null, drafts: null, ids: null, root: null };
  let i = 0;
  if (argv[0] && !argv[0].startsWith('--')) { opts.cmd = argv[0]; i = 1; }
  for (; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--artifact') { opts.artifact = v || null; i++; }
    else if (k === '--out') { opts.out = v || null; i++; }
    else if (k === '--page') { opts.page = v || null; i++; }
    else if (k === '--url') { opts.url = v || null; i++; }
    else if (k === '--submissions') { opts.submissions = v || null; i++; }
    else if (k === '--drafts') { opts.drafts = v || null; i++; }
    else if (k === '--ids') { opts.ids = v || null; i++; }
    else if (k === '--root') { opts.root = v || null; i++; }
  }
  return opts;
}

// --- the session's record per concept --------------------------------------

/** `docs/concepts/x.html` and `x.artifact.html` are the same concept. */
function slugOf(pagePath) {
  return path.basename(String(pagePath || ''), path.extname(String(pagePath || ''))).replace(/\.artifact$/, '');
}

function recordPath(pagePath, root) {
  return path.join(root || process.cwd(), '.claude', 'concepts', slugOf(pagePath), 'artifact.json');
}

function readRecord(pagePath, root) {
  try { return JSON.parse(fs.readFileSync(recordPath(pagePath, root), 'utf8')); } catch { return null; }
}

function writeRecord(pagePath, root, rec) {
  const f = recordPath(pagePath, root);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
  fs.renameSync(tmp, f);
  return f;
}

const URL_RE = /^https:\/\/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9-]{6,}\/?$/;

function record(opts) {
  if (!opts.page || !opts.url) return { ok: false, reason: 'record needs --page and --url' };
  if (!URL_RE.test(opts.url)) return { ok: false, reason: 'not a claude.ai artifact url' };
  const prev = readRecord(opts.page, opts.root) || {};
  const now = new Date().toISOString();
  const rec = {
    slug: slugOf(opts.page),
    page: String(opts.page).replace(/\\/g, '/').replace(/\.artifact\.html$/, '.html'),
    url: opts.url,
    recorded_at: prev.recorded_at || now,
    updated_at: now,
    open: true,
    processed: Array.isArray(prev.processed) ? prev.processed : [],
    protocol: PROTOCOL,
    plugin_version: pluginVersion(),
  };
  const hint = protocolHint(prev);
  return {
    ok: true,
    file: writeRecord(opts.page, opts.root, rec),
    record: rec,
    ...(hint ? { protocolHint: hint } : {}),
    // A redeploy is the next round; the waiting page switches on _processed_at
    // (the wrapper's build-stamp check is only the fallback).
    ...(prev.url ? { release: 'This redeploy is the next round: digest a fresh submissions listing, mark --ids <markIds>, then send ops.unacked as one ArtifactData batch, so every waiting view switches to the new round.' } : {}),
    // Nothing else wakes the session on a submit. Named here because this is
    // the last step every publisher runs.
    next: 'MANDATORY before the turn ends: arm ONE read-back check (send_later if you have it, else a one-shot CronCreate) in 20 min, doubling the gap while nothing came (artifact-fallback.md § Wake), and tell the person once to say here when they have decided.',
  };
}

/** The hint when the record was written under another protocol or plugin version (#1241). */
function protocolHint(rec) {
  if (!rec || !rec.url) return null;
  if (rec.protocol === PROTOCOL && (!rec.plugin_version || rec.plugin_version === pluginVersion())) return null;
  return PROTOCOL_HINT;
}

function mark(opts) {
  if (!opts.page || !opts.ids) return { ok: false, reason: 'mark needs --page and --ids' };
  // No record (a thread that never ran record): start one, the ids matter more than the url.
  const rec = readRecord(opts.page, opts.root) || { slug: slugOf(opts.page), page: String(opts.page).replace(/\\/g, '/'), url: null, open: true, processed: [] };
  const ids = String(opts.ids).split(',').map((s) => s.trim()).filter(Boolean);
  const set = new Set(rec.processed || []);
  ids.forEach((id) => set.add(id));
  rec.processed = [...set].slice(-500);
  rec.updated_at = new Date().toISOString();
  rec.last_processed_at = rec.updated_at;
  // The implement order (#1240) ends with its submission.
  const order = rec.implement_order;
  if (order && (set.has(order.id) || set.has(order.doc_id))) delete rec.implement_order;
  const file = writeRecord(opts.page, opts.root, rec);
  // The db half follows from a fresh listing: digest's ops.unacked carries
  // the writes with the versions ArtifactData requires (if_version).
  return { ok: true, file, processed: ids, next: 'list "submissions" again, digest, send ops.unacked as one ArtifactData batch' };
}

function close(opts) {
  if (!opts.page) return { ok: false, reason: 'close needs --page' };
  const rec = readRecord(opts.page, opts.root);
  if (!rec) return { ok: false, reason: 'no record' };
  rec.open = false;
  rec.closed_at = new Date().toISOString();
  delete rec.implement_order;
  return { ok: true, file: writeRecord(opts.page, opts.root, rec) };
}

// --- digest: what a read-back hands the session -----------------------------

/**
 * Documents out of an ArtifactData listing. Its text, as observed
 * (2026-11-23): a heading line, a BEGIN/END banner, and one JSON object per
 * line, `{"id", "data", "version", "updatedAt"}`. Also taken: one JSON value
 * (an array, or an object with `documents` / `docs` / `items` / `results` /
 * `rows`), entries named `doc_id` / `fields` / `value` or bare bodies.
 * @returns {{id:string, data:object, version:(number|null)}[]}
 */
function parseDocs(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch {
      v = v.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('{')).map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
    }
  }
  if (v && !Array.isArray(v) && typeof v === 'object') {
    v = v.documents || v.docs || v.items || v.results || v.rows || v.data || [];
  }
  if (!Array.isArray(v)) return [];
  return v.map((e) => {
    if (!e || typeof e !== 'object') return null;
    const body = [e.data, e.fields, e.value].find((x) => x && typeof x === 'object' && !Array.isArray(x)) || e;
    const id = String(e.id || e.doc_id || e.docId || (e.path && String(e.path).split('/').pop()) || body.submission_id || body.tab || '');
    const version = Number.isInteger(e.version) ? e.version : null;
    return { id, data: body, version };
  }).filter(Boolean);
}

function clip(s, n = 300) {
  const t = typeof s === 'string' ? s : JSON.stringify(s);
  return t && t.length > n ? `${t.slice(0, n)}…` : t;
}

/**
 * @param {{submissions:*, drafts?:*, processed?:string[], now?:number}} input
 */
function digestDocs({ submissions, drafts, processed = [], now = Date.now() }) {
  const done = new Set(processed);
  const subs = parseDocs(submissions).map((d) => ({ ...d, sid: String(d.data.submission_id || d.id) }));
  const open = subs
    .filter((d) => !d.data._processed_at && d.data.submitted !== false && !done.has(d.sid) && !done.has(d.id))
    .sort((a, b) => (Number(a.data._storedAtMs) || 0) - (Number(b.data._storedAtMs) || 0));
  // A tab that sent the same round twice (a re-send after "not stored")
  // meant its newer payload; the older one is reported, not processed.
  const newestPer = new Map();
  open.forEach((d) => newestPer.set(`${d.data.iteration}|${d.data._tab || d.id}`, d.sid));
  const process = open.filter((d) => newestPer.get(`${d.data.iteration}|${d.data._tab || d.id}`) === d.sid);
  const superseded = open.filter((d) => !process.includes(d));
  const rounds = {};
  process.forEach((d) => {
    const r = String(d.data.iteration == null ? '?' : d.data.iteration);
    rounds[r] = rounds[r] || { iteration: r, submissions: [], actions: [], senders: [] };
    rounds[r].submissions.push(d.sid);
    if (!rounds[r].actions.includes(d.data.action)) rounds[r].actions.push(d.data.action);
    const who = d.data._by || d.data._tab || d.sid;
    if (!rounds[r].senders.includes(who)) rounds[r].senders.push(who);
  });
  const roundList = Object.values(rounds).map((r) => ({ ...r, several: r.submissions.length > 1 }));

  const draftDocs = parseDocs(drafts).map((d) => d.data);
  const lastSubmitAt = subs.reduce((m, d) => Math.max(m, Number(d.data._storedAtMs) || 0), 0);
  const merged = page.mergeDrafts(draftDocs).values;
  const lateEdits = Object.keys(merged)
    .filter((k) => merged[k].s > lastSubmitAt)
    .map((k) => ({ key: k, value: clip(merged[k].v), by: merged[k].by || merged[k].tab, at: new Date(merged[k].s).toISOString() }));
  const overwritten = [];
  draftDocs.forEach((d) => (Array.isArray(d.superseded) ? d.superseded : []).forEach((s) => {
    if (s && s.key) overwritten.push({ key: s.key, value: clip(s.value), by: d.by || d.tab, replaced_by_tab: s.by_tab, at: s.at ? new Date(s.at).toISOString() : null });
  }));

  const iso = new Date(now).toISOString();
  // ArtifactData batch `writes` entries; an existing document needs its
  // last-read version, or the whole batch writes nothing.
  const op = (d, data) => ({ op: 'update', collection: SUBS, doc_id: d.id, data, ...(d.version ? { if_version: d.version } : {}) });
  // Processed here (mark ran) but the db never heard it (the session stopped
  // between mark and its writes): the page would wait forever. Re-send.
  const unacked = subs.filter((d) => !d.data._processed_at && (done.has(d.sid) || done.has(d.id)))
    .map((d) => op(d, { _processed_at: iso }));
  return {
    ok: true,
    count: { stored: subs.length, open: open.length, process: process.length },
    process: process.map((d) => ({ id: d.sid, doc_id: d.id, iteration: d.data.iteration, action: d.data.action, by: d.data._by || '', tab: d.data._tab || '', stored_at: d.data._artifactStoredAt || null })),
    superseded: superseded.map((d) => ({ id: d.sid, doc_id: d.id, iteration: d.data.iteration, by: d.data._by || d.data._tab || '' })),
    rounds: roundList,
    lateEdits,
    overwritten,
    ops: {
      // Every open submission is acked together (superseded ones too): the
      // round they belong to is handled once.
      pickup: open.filter((d) => !d.data._picked_up_at).map((d) => op(d, { _picked_up_at: iso })),
      unacked,
    },
    markIds: open.map((d) => d.id).join(','),
    // #1240: the implement click arrives here, so its mandate does too. A rule
    // only in the skill files lost to an older "concept only" brief and an
    // overlapping thread in a session that never loaded them.
    ...implementOrder(process),
  };
}

/** The mandate the digest carries when a submission to process is an implement click (#1240). */
function implementOrder(process) {
  const impl = process.find((d) => d.data && d.data.action === 'implement');
  // `iterate` beside `implement` in one round: the reply asks which counts
  // (artifact-fallback.md § Read back step 4), so no mandate then.
  if (!impl || process.some((d) => d.data && d.data.action && d.data.action !== 'implement')) return {};
  const who = impl.data._by ? ` by ${impl.data._by}` : '';
  const round = impl.data.iteration != null ? ` (round ${impl.data.iteration})` : '';
  return {
    implement: true,
    next: `MANDATORY — IMPLEMENT ORDER${who}${round}: this click is the person's approval for the whole approved scope. ` +
      'It is newer than, and overrides, any earlier "concept only" brief or coordinator note. Start the build in THIS turn ' +
      '(auto-concept SKILL.md Step 5b: reality check, then auto-agents), on the default execution place. Do NOT ask whether, ' +
      'where or how to implement — no request_decision, no AskUserQuestion, no "shall I". Another open concept or thread on ' +
      'the same files is no reason to ask: build this one, keep the overlap easy to swap, name it in the PR and the report.',
  };
}

/** A saved listing (text file) or an ArtifactData out_dir (one JSON file per document). */
function readJsonFile(file) {
  if (!file) return null;
  const f = path.resolve(file);
  if (fs.statSync(f).isDirectory()) {
    return fs.readdirSync(f).filter((n) => n.endsWith('.json')).map((n) => ({
      id: n.slice(0, -5),
      data: JSON.parse(fs.readFileSync(path.join(f, n), 'utf8')),
    }));
  }
  return fs.readFileSync(f, 'utf8');
}

function digest(opts) {
  if (!opts.page || !opts.submissions) return { ok: false, reason: 'digest needs --page and --submissions <file>' };
  let subs;
  let drafts;
  try {
    subs = readJsonFile(opts.submissions);
    drafts = readJsonFile(opts.drafts);
  } catch (e) { return { ok: false, reason: 'unreadable', error: e.message }; }
  const rec = readRecord(opts.page, opts.root);
  const out = digestDocs({ submissions: subs, drafts, processed: (rec && rec.processed) || [] });
  if (out.implement) recordImplementOrder(opts, rec, out);
  return { ...out, record: rec ? rec.url : null };
}

/**
 * An implement click to process becomes an open order in the concept's record
 * (#1240): `pre.concept.implement-order` holds back a decision card or question
 * until the build started or `mark` ran. A re-digest of the same click keeps
 * the order as it is, so the tree it was clicked on stays the baseline.
 */
function recordImplementOrder(opts, prev, out) {
  try {
    const p = out.process.find((x) => x.action === 'implement');
    if (!p) return;
    const rec = prev || { slug: slugOf(opts.page), page: String(opts.page).replace(/\\/g, '/'), url: null, open: true, processed: [] };
    if (rec.implement_order && rec.implement_order.id === p.id) return;
    const root = opts.root || process.cwd();
    rec.implement_order = require('../hooks/lib/implement-order').newOrder({ id: p.id, docId: p.doc_id, round: p.iteration, by: p.by, root });
    writeRecord(opts.page, opts.root, rec);
  } catch { /* the mandate in `next` still stands */ }
}

function build(opts) {
  if (!opts.artifact) return { ok: false, reason: 'missing --artifact <page.html>' };
  const src = path.resolve(opts.artifact);
  let source;
  try { source = fs.readFileSync(src, 'utf8'); } catch (e) { return { ok: false, reason: 'unreadable', error: e.message }; }
  const build = Date.now().toString(36);
  const res = wrap(source, build);
  if (!res.ok) return res;
  const out = path.resolve(opts.out || defaultOut(src));
  fs.writeFileSync(out, res.html);
  const hint = protocolHint(readRecord(src, opts.root));
  return {
    ok: true,
    source: src,
    out,
    build,
    protocol: PROTOCOL,
    ...(hint ? { protocolHint: hint } : {}),
    capabilities: CAPABILITIES,
    // The browser tab of claude.ai/artifact/… shows the icon the FIRST publish
    // names; the page itself runs in a sandboxed frame, so a <link rel="icon">
    // in it never reaches the tab. "compass" matches the concept's 🧭.
    icon: ICON,
    readBack: [
      { tool: 'ArtifactData', action: 'list', collection: SUBS, query: { limit: 1000 }, save: 'the result text verbatim to a file (it carries the versions the acks need)' },
      { tool: 'ArtifactData', action: 'list', collection: DRAFTS, query: { limit: 1000 }, out_dir: '<scratchpad>/<slug>-drafts' },
    ],
    note: 'Publish `out` with the Artifact tool, capabilities {db:{},user:{},comments:{}} and, on the first publish, icon "compass" (a redeploy keeps both); then `record --page <page> --url <artifact url>`. Read back with readBack (artifact-fallback.md § Read back). No bridge; record names the read-back check you must arm.',
  };
}

function run(opts) {
  switch (opts.cmd) {
    case 'build': return build(opts);
    case 'record': return record(opts);
    case 'digest': return digest(opts);
    case 'mark': return mark(opts);
    case 'close': return close(opts);
    default: return { ok: false, reason: `unknown command ${opts.cmd}` };
  }
}

module.exports = {
  wrap, stripWrapper, wrapperBlock, wrapperJs, protocolHint, pluginVersion, PROTOCOL, run, parseArgs, parseDocs, digestDocs, slugOf, recordPath, readRecord,
  START, END, WRAPPER_JS, CAPABILITIES, URL_RE,
};

if (require.main === module) {
  const result = run(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(2);
}

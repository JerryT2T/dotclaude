/**
 * @module mcp-server/lib/linked-sessions
 * @version 0.1.0
 * @description What a completion card says about the side sessions it started
 *   (concept 2026-11-07 "subsession-cards", scenarios S1-S5 of rounds/02.html).
 *
 *   Input: `linked: [{ id, title, mode, state, version?, branch? }]` on the
 *   card. `mode` is the brief marker the side session was started with:
 *   `handoff` (`[devops:handoff]`, the child ships itself), `deliver`
 *   (`[devops:deliver]`, the child only delivers, the parent integrates and
 *   ships) or `independent` (no marker: an unrelated follow-up task, never
 *   a status change - at most one `›` line).
 *
 *   Precedence for the parent (first match wins): 1 the parent's own mandatory
 *   step (own diff, question, red tests) -> 2 a marked side session waits on
 *   the user -> 3 marked side sessions still run -> 4 nothing left, Released
 *   only when ALL marked side sessions are finished (a Released title invites
 *   archiving the chat). The subordinate state is a `›` line, never lost.
 *   In deliver mode the parent's own diff does NOT win over Team (combined
 *   ship at the end); it gets the secondary "ship my own part now" button.
 *
 *   `linkedPlan` is pure: the card derives the title state, the heading
 *   sentence, the `›` lines and the buttons from the one result, so title and
 *   CTA cannot drift. The link `[title](#local_...)` is NOT rendered: the
 *   widget client turns only http(s) URLs into anchors, a `#local_` link would
 *   show as literal text. The quoted sidebar title is the way to find the chat.
 */

import { TITLE_SCHEME } from "./mode-state.js";
import { LINKED_MODES, LINKED_STATES } from "./card-input.js";

/** Decision keys that are the parent's OWN mandatory step (precedence 1). */
const OWN_KEYS = new Set([
  "ready", "ready-red", "test", "vv-unverified", "vv-running", "ship-blocked",
  "ready-files", "aborted", "paused",
]);

const q = (s) => `„${s}"`;
const names = (list) => list.map((e) => q(e.title)).join(", ");

const T = {
  de: {
    runHandoff: (l) => (l.length > 1 ? `läuft in Side-Sessions ${names(l)}, sie shippen selbst` : `läuft in Side-Session ${names(l)}, sie shippt selbst`),
    waitAsk: (l) => (l.length > 1 ? `${names(l)} warten auf dich, dort antworten` : `${names(l)} wartet auf dich, dort antworten`),
    failedLook: (l) => (l.length > 1 ? `${names(l)} sind gescheitert, dort nachsehen` : `${names(l)} ist gescheitert, dort nachsehen`),
    ownRun: (l) => (l.length > 1 ? `${names(l)} laufen weiter und shippen selbst` : `${names(l)} läuft weiter und shippt selbst`),
    shippedAfter: (v, l, wait) => `${v ? `v${v} ` : ""}geshippt, ${l.length > 1 ? names(l) + (wait ? " warten auf dich, dort antworten" : " laufen noch und shippen selbst") : q(l[0].title) + (wait ? " wartet auf dich, dort antworten" : " läuft noch und shippt selbst")}`,
    allShipped: (v, s) => `${v ? `v${v} — ` : ""}in Side-Session ${names(s)} geshippt, hier ist nichts offen`,
    shippedLine: (e) => `${q(e.title)} geshippt${e.version ? ` v${e.version}` : ""}`,
    runLine: (e) => `${q(e.title)} läuft noch`,
    independent: (l) => (l.length > 1 ? `${names(l)} laufen als eigene Aufgaben` : `${names(l)} läuft als eigene Aufgabe`),
    moveIn: (side) => `Weiter in der Side-Session: ${side}`,
    teamRun: (n, m) => `noch nicht fertig — ${n} von ${m} Side-Sessions fertig`,
    count: (n, m) => `${n} von ${m} fertig`,
    integrate: (m) => `${m} Teilergebnisse integrieren und shippen?`,
    teamFailed: (l) => `${names(l)} ${l.length > 1 ? "sind" : "ist"} gescheitert — ohne ${l.length > 1 ? "sie" : l[0].title} integrieren, ${l.length > 1 ? "sie" : l[0].title} neu starten oder abbrechen?`,
    ownShipped: (v) => `Eigener Teil geshippt${v ? ` v${v}` : ""}`,
    archivable: (l) => `${l.map((e) => e.title).join(", ")} können archiviert werden`,
    btn: {
      skip: ["Ohne sie integrieren", "Integriere und shippe die vorhandenen Teilergebnisse ohne die gescheiterte Side-Session.", "Integriert die übrigen Teile ohne die gescheiterte Side-Session."],
      restart: ["Neu starten", "Starte die gescheiterte Side-Session neu.", "Startet die gescheiterte Side-Session erneut."],
      abort: ["Abbrechen", "Brich die Orchestrierung ab, ohne zu integrieren.", "Bricht ab, ohne etwas zu integrieren."],
      early: ["Eigenen Teil jetzt shippen", "Ship nur meinen eigenen Teil (eigener Branch), ohne die Side-Sessions abzuwarten.", "Shippt nur den eigenen Teil; die Side-Sessions folgen später in einem weiteren Ship."],
    },
  },
  en: {
    runHandoff: (l) => (l.length > 1 ? `running in side sessions ${names(l)}, they ship themselves` : `running in side session ${names(l)}, it ships itself`),
    waitAsk: (l) => (l.length > 1 ? `${names(l)} wait for you, answer there` : `${names(l)} waits for you, answer there`),
    failedLook: (l) => (l.length > 1 ? `${names(l)} failed, look there` : `${names(l)} failed, look there`),
    ownRun: (l) => (l.length > 1 ? `${names(l)} keep running and ship themselves` : `${names(l)} keeps running and ships itself`),
    shippedAfter: (v, l, wait) => `${v ? `v${v} ` : ""}shipped, ${l.length > 1 ? names(l) + (wait ? " wait for you, answer there" : " still run and ship themselves") : q(l[0].title) + (wait ? " waits for you, answer there" : " still runs and ships itself")}`,
    allShipped: (v, s) => `${v ? `v${v} — ` : ""}shipped in side session ${names(s)}, nothing is open here`,
    shippedLine: (e) => `${q(e.title)} shipped${e.version ? ` v${e.version}` : ""}`,
    runLine: (e) => `${q(e.title)} still runs`,
    independent: (l) => (l.length > 1 ? `${names(l)} run as their own tasks` : `${names(l)} runs as its own task`),
    moveIn: (side) => `Continue in the side session: ${side}`,
    teamRun: (n, m) => `not done yet — ${n} of ${m} side sessions done`,
    count: (n, m) => `${n} of ${m} done`,
    integrate: (m) => `integrate ${m} partial results and ship?`,
    teamFailed: (l) => `${names(l)} failed — integrate without ${l.length > 1 ? "them" : l[0].title}, restart ${l.length > 1 ? "them" : l[0].title} or cancel?`,
    ownShipped: (v) => `Own part shipped${v ? ` v${v}` : ""}`,
    archivable: (l) => `${l.map((e) => e.title).join(", ")} can be archived`,
    btn: {
      skip: ["Integrate without it", "Integrate and ship the available partial results without the failed side session.", "Integrates the remaining parts without the failed side session."],
      restart: ["Restart", "Restart the failed side session.", "Starts the failed side session again."],
      abort: ["Cancel", "Cancel the orchestration without integrating.", "Cancels without integrating anything."],
      early: ["Ship my own part now", "Ship only my own part (own branch) without waiting for the side sessions.", "Ships only the own part; the side sessions follow in a later ship."],
    },
  },
};

/** `linked` as clean entries; an entry without a title is dropped. */
export function normalizeLinked(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && typeof e === "object" && String(e.title || "").trim()).map((e) => ({
    id: String(e.id || "").trim(),
    title: String(e.title).trim(),
    mode: LINKED_MODES.includes(e.mode) ? e.mode : "handoff",
    state: LINKED_STATES.includes(e.state) ? e.state : "running",
    version: String(e.version || "").trim().replace(/^v/, ""),
    branch: String(e.branch || "").trim(),
  }));
}

const isOpenState = (e) => e.state === "running" || e.state === "waiting";
const isFinished = (e) => e.state === "done" || e.state === "shipped";

/**
 * True while a marked (handoff/deliver) side session is not finished. A failed
 * one counts: the user still has to decide. Unmarked follow-ups never count.
 */
export function hasUnfinishedLinked(raw) {
  return normalizeLinked(raw).some((e) => e.mode !== "independent" && !isFinished(e));
}

/**
 * Branch / worktree names of marked side sessions that are not landed yet:
 * open points naming them are the user's to land (#759), never "foreign".
 */
export function linkedKeepTokens(raw) {
  return normalizeLinked(raw)
    .filter((e) => e.mode !== "independent" && e.state !== "shipped" && e.branch)
    .map((e) => e.branch.toLowerCase());
}

/** `Sidebar: „👉 ➜ ❓ Question ┃ title"` - the title the user finds in the sidebar. */
function sidebarLine(e, L) {
  const id = e.state === "running" ? "agents" : "question";
  const head = e.state === "running" ? TITLE_SCHEME.WORK_PREFIX.trim() : TITLE_SCHEME.head(id).text;
  return L.moveIn(`„${head} ${e.title}"`);
}

/**
 * @param {object} input card params (reads `linked`, `delivery`, `cta`, `state`)
 * @param {string} key resolved decision key (index.js#resolveCardKey)
 * @param {{ lang?: 'de'|'en', ownQuestion?: boolean, pendingWhat?: string, noShipKey?: boolean }} ctx
 * @returns {null | { head: null | { id: string, mandatory: boolean }, sentence: string,
 *   lines: string[], buttonsKey?: string|null, custom?: object[], secondary?: object[], replies?: string[] }}
 *   null = the card has nothing to say about side sessions
 */
export function linkedPlan(input, key, ctx = {}) {
  const L = T[ctx.lang === "en" ? "en" : "de"];
  const all = normalizeLinked(input && input.linked);
  if (!all.length) return null;
  const marked = all.filter((e) => e.mode !== "independent");
  const indep = all.filter((e) => e.mode === "independent" && isOpenState(e));
  const indLines = indep.length ? [L.independent(indep)] : [];
  if (!marked.length) return indLines.length ? { head: null, sentence: "", lines: indLines } : null;

  const delivery = (input && input.delivery) || {};
  const ver = String((delivery.ship && delivery.ship.version) || (input.cta && (input.cta.version || input.cta.vNew)) || "").replace(/^v/, "");
  const isShip = typeof key === "string" && key.startsWith("ship-successful");
  const ownStep = !!ctx.ownQuestion || OWN_KEYS.has(key);
  const running = marked.filter((e) => e.state === "running");
  const waiting = marked.filter((e) => e.state === "waiting");
  const failed = marked.filter((e) => e.state === "failed");
  const shipped = marked.filter((e) => e.state === "shipped");
  const unfinished = [...running, ...waiting];
  const needUser = [...waiting, ...failed];
  const moveLines = needUser.map((e) => sidebarLine(e, L));
  const deliver = marked.some((e) => e.mode === "deliver");

  // ---- orchestration: the children only deliver, the parent ships once ----
  if (deliver) {
    const m = marked.length;
    const n = marked.filter(isFinished).length;
    const count = L.count(n, m);
    if (ctx.ownQuestion) return { head: null, sentence: "", lines: [count, ...indLines] };
    if (failed.length) {
      const [skip, restart, abort] = [L.btn.skip, L.btn.restart, L.btn.abort];
      const tag = (b, i) => ({ label: b[0], icon: ["git-merge", "refresh", "player-stop"][i], prompt: b[1], tooltip: b[2], primary: i === 0 });
      return {
        head: { id: "question", mandatory: true }, sentence: L.teamFailed(failed),
        lines: [count, ...moveLines, ...indLines], buttonsKey: null,
        custom: [skip, restart, abort].map(tag), replies: [skip[1], restart[1], abort[1]],
      };
    }
    if (waiting.length) {
      return { head: { id: "agents-waiting", mandatory: true }, sentence: L.waitAsk(waiting), lines: [count, ...moveLines, ...indLines], buttonsKey: null };
    }
    if (running.length) {
      const what = L.teamRun(n, m) + (ctx.pendingWhat ? ` · ${ctx.pendingWhat}` : "");
      const lines = [...(isShip ? [L.ownShipped(ver)] : []), ...indLines];
      const early = !isShip && (key === "ready" || key === "test") && !ctx.noShipKey;
      const e = L.btn.early;
      return {
        head: { id: "agents", mandatory: false }, sentence: what, lines, buttonsKey: null,
        secondary: early ? [{ label: e[0], icon: "rocket", prompt: e[1], tooltip: e[2] }] : undefined,
      };
    }
    // every part is delivered
    if (isShip) return { head: null, sentence: "", lines: [L.archivable(marked), ...indLines] };
    if (key === "ready") return { head: { id: "ready", mandatory: false }, sentence: L.integrate(m), lines: indLines };
    return { head: null, sentence: "", lines: indLines };
  }

  // ---- handoff: the children ship themselves ----
  const linkedId = needUser.length ? "linked-waiting" : "linked";
  const partial = shipped.map(L.shippedLine);
  const restLines = unfinished.length && shipped.length ? [...partial, ...running.map(L.runLine)] : [];
  if (isShip) {
    if (!unfinished.length && !failed.length) return { head: null, sentence: "", lines: [...partial, ...indLines] };
    const open = needUser.length ? needUser : running;
    return {
      head: { id: linkedId, mandatory: false }, sentence: L.shippedAfter(ver, open, needUser.length > 0),
      lines: [...moveLines, ...indLines], buttonsKey: null,
    };
  }
  if (ownStep) {
    const lines = [];
    if (running.length) lines.push(L.ownRun(running));
    if (waiting.length) lines.push(L.waitAsk(waiting));
    if (failed.length) lines.push(L.failedLook(failed));
    return { head: null, sentence: "", lines: [...lines, ...moveLines, ...indLines] };
  }
  if (unfinished.length || failed.length) {
    const sentence = waiting.length ? L.waitAsk(waiting) : failed.length ? L.failedLook(failed) : L.runHandoff(running);
    return { head: { id: linkedId, mandatory: false }, sentence, lines: [...restLines, ...moveLines, ...indLines], buttonsKey: null };
  }
  if (shipped.length) {
    const v = ver || (shipped.find((e) => e.version) || {}).version || "";
    return { head: { id: "released-alpha", mandatory: false }, sentence: L.allShipped(v, shipped), lines: indLines, buttonsKey: null };
  }
  return { head: null, sentence: "", lines: indLines };
}

import fs from "node:fs";
import { describe, test, expect } from "vitest";
import { JSDOM } from "jsdom";
import { readTemplates } from "./templates-source.js";
import fixture from "../../scripts/build-concept-fixture.js";
import cb from "../../scripts/concept-build.js";
import analysis from "../../hooks/lib/concept-gate-analysis.js";

// Review findings R1-R15 of the analysis redesign: revisit counting, persistence of the
// engine's hidden state, frozen rounds, hesitation on load / visibility / collect, arrow keys,
// the closing's next analysis, the note storage target, tags, badges, docs.

const md = readTemplates();
const blocks = fixture.scanBlocks(md);
const UI = blocks.find(b => /javascript|js/.test(b.info) && b.code.includes("window.conceptAnalysis = {")).code;
const fn = name => {
  const m = md.match(new RegExp("function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n\\}"));
  if (!m) throw new Error(name);
  return m[0];
};
const COLLECT = ["collectModeDecision", "collectModeDecisions", "noteWordCount", "hesitationFlag"].map(fn).join("\n");
const PERSIST = ["_iterationPrefix", "saveState", "restoreState"].map(fn).join("\n");
const STUBS = `const STORAGE_KEY = 'k'; const STATE_TTL_MS = 1e12; let _draftCleared = [];
function _guardedSetItem(k, v) { localStorage.setItem(k, v); } function queueDraftSync() {}
function _pruneSpentDrafts() { return false; } function _carryOverTypedWork(s) { return s; }`;

const opt = (id, v, label, checked) => `<label data-opt="${v}"><input type="radio" name="dm-${id}" value="${v}"${checked ? " checked" : ""}><span data-opt-label>${label}</span><span data-opt-consequence>${label} follows</span></label>`;
const decision = (id, rec = "a", note = true) => `<section id="${id}" data-nav-label="${id}" data-decision="${id}" data-decision-mode="single" data-label="L-${id}" data-rec="${rec}"><p data-situation>S</p><h3 data-question>Q ${id}?</h3><div data-options>${opt(id, "a", "Alpha", true)}${opt(id, "b", "Beta")}${opt(id, "c", "Gamma")}</div>${note ? `<textarea data-comment="${id}-note"></textarea>` : ""}<input type="hidden" name="dm-${id}-touched" value=""><input type="hidden" name="dm-${id}-issue" value=""><input type="hidden" name="dm-${id}-epic" value=""></section>`;
const slider = id => `<section id="${id}" data-nav-label="${id}" data-decision="${id}" data-decision-mode="slider" data-label="L-${id}" data-rec="8" data-unit="s"><p data-situation>S</p><h3 data-question>Q?</h3><div data-options><input type="range" name="dm-${id}" min="0" max="20" step="1" value="8"></div><textarea data-comment="${id}-note"></textarea><input type="hidden" name="dm-${id}-touched" value=""></section>`;
const pt = (id, item, v) => `<div data-opt="${item}"><span data-opt-label>${item}</span><span data-opt-consequence>${item} gets points</span><input type="hidden" name="dm-${id}.${item}" value="${v}"></div>`;
const points = id => `<section id="${id}" data-nav-label="${id}" data-decision="${id}" data-decision-mode="points" data-label="L-${id}" data-rec="speed:5 cost:3 risk:2"><p data-situation>S</p><h3 data-question>Q?</h3><div data-options>${pt(id, "speed", 5)}${pt(id, "cost", 3)}${pt(id, "risk", 2)}</div><textarea data-comment="${id}-note"></textarea><input type="hidden" name="dm-${id}-touched" value=""></section>`;
const lite = (id, ...ds) => `<section data-analysis="lite" data-nav-label="Lite ${id}"${id ? ` id="${id}"` : ""}>${ds.join("")}</section>`;
const full = (p, wrap = "") => `<section data-iteration="1" data-analysis="full" id="${p}iter" data-nav-label="Full ${p}"${wrap}>
  <section id="${p}brief" data-analysis-briefing data-nav-label="Briefing"><p data-briefing-what>W</p><p data-briefing-why>Y</p><div data-briefing-potential>1</div><a data-briefing-topic="${p}t1" data-share="100">One</a></section>
  <section id="${p}t1" data-topic data-nav-label="One">${decision(p + "a1")}${decision(p + "a2")}</section>
</section>`;

function page(html, { persist = false, store = null } = {}) {
  const dom = new JSDOM(`<html lang="en"><body>${html}</body></html>`, { url: "http://localhost/c.html", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.setTimeout = () => 1;
  w.clearTimeout = () => {};
  let now = 1000;
  w.Date.now = () => now;
  const env = { tick: ms => { now += ms; }, io: [] };
  w.document.hasFocus = () => true;
  w.HTMLElement.prototype.getClientRects = function () { return [{}]; };
  w.IntersectionObserver = class { constructor(cb) { env.io.push(cb); } observe() {} };
  w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => "\\" + c) };
  w.eval(COLLECT);
  if (persist) w.eval(STUBS + "\n" + PERSIST);
  if (store) w.localStorage.setItem("k", store);
  w.eval(UI);
  w.conceptAnalysis.init();
  return { w, doc: w.document, ca: w.conceptAnalysis, env, inst: w.conceptAnalysis.instances[0] };
}
const ev = (w, el, type, init = {}) => el.dispatchEvent(new w.Event(type, { bubbles: true, ...init }));
const key = (w, el, k) => { const e = new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e; };
const type = (w, inst, text) => { inst.comp.ed.appendChild(w.document.createTextNode(text)); ev(w, inst.comp.ed, "input"); };
const entry = (w, id) => w.collectModeDecisions(w.document).find(e => e.id === id);
const review = (ca, inst) => ca.go(inst, inst.stages.findIndex(s => s.kind === "review"));

describe("R1 a change counts once", () => {
  test("one radio click = one change, no revisit; changing back is the revisit", () => {
    const { w, doc, inst } = page(lite("l", decision("q1"), decision("q2")));
    doc.querySelector('#q1 [value="b"]').click();
    expect(inst.hes.q1.changes).toBe(1);
    expect(inst.hes.q1.revisits).toBe(0);
    doc.querySelector('#q1 [value="c"]').click();
    expect(inst.hes.q1.revisits).toBe(1);
    expect(w).toBeTruthy();
  });
  test("a slider drag (many input events, one change) = one change", () => {
    const { w, doc, inst } = page(lite("l", slider("sl"), decision("q2")));
    const r = doc.querySelector('[name="dm-sl"]');
    for (const v of ["9", "10", "11", "12"]) { r.value = v; ev(w, r, "input"); }
    expect((inst.hes.sl || {}).changes || 0).toBe(0);
    ev(w, r, "change");
    expect(inst.hes.sl.changes).toBe(1);
    expect(inst.hes.sl.revisits).toBe(0);
  });
  test("typing a note on a points decision is no change; a step button is", () => {
    const { w, doc, inst } = page(lite("l", points("pts"), decision("q2")));
    type(w, inst, "a long thought");
    expect((inst.hes.pts || {}).changes || 0).toBe(0);
    doc.querySelector('#pts [data-opt="risk"] .an-pt[data-pts="1"]').click();
    expect(inst.hes.pts.changes).toBe(1);
  });
  test("go() to the stage that is already open is no revisit", () => {
    const { ca, inst } = page(lite("l", decision("q1"), decision("q2")));
    ca.go(inst, 0); ca.go(inst, 0);
    expect((inst.hes.q1 || {}).revisits || 0).toBe(0);
    ca.go(inst, 1); ca.go(inst, 0);
    expect(inst.hes.q1.revisits).toBe(1);
    ca.go(inst, 0);
    expect(inst.hes.q1.revisits).toBe(1);
  });
});

describe("R2 the engine's hidden state survives a reload", () => {
  test("none, points and hesitation round-trip through saveState / restoreState", () => {
    const html = lite("l", decision("q1"), points("pts"));
    const a = page(html, { persist: true });
    a.env.tick(5000);
    a.doc.querySelector("#q1 .an-none").click();
    a.doc.querySelector('#pts [data-opt="risk"] .an-pt[data-pts="2"]').click();   // clears the preset 2
    a.ca.go(a.inst, 1);
    a.w.saveState();
    const raw = a.w.localStorage.getItem("k");
    const b = page(html, { persist: true, store: raw });
    expect(b.doc.querySelector('[name="dm-q1-none"]').value).toBe("1");
    expect(b.doc.querySelector('[name="dm-pts.risk"]').value).toBe("");
    expect(b.doc.querySelector('[name="dm-pts.speed"]').value).toBe("5");
    expect(entry(b.w, "pts").value).toMatchObject({ speed: 5, cost: 3 });
    expect(entry(b.w, "pts").value.risk || 0).toBe(0);
    expect(b.inst.hes.q1.ms).toBe(5000);
    expect(b.doc.querySelector("#q1 .an-none").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("R3 / R4 / R5 frozen rounds and baking", () => {
  const entries = [{ id: "xa1", mode: "single", value: "b", untouched: false, none: false, hesitation: { ms: 42000, revisits: 2, flagged: true } },
    { id: "xa2", mode: "single", value: "a", untouched: false, none: true, hesitation: { ms: 3000, revisits: 0, flagged: false } }];
  const baked = () => cb.bake(full("x"), { decisions: entries }).html;
  test("R5: a fragment without -none / -hes keeps none:true and the hesitation", () => {
    const html = baked();
    expect(html).toMatch(/name="dm-xa2-none"[^>]*value="1"/);
    expect(html).toMatch(/name="dm-xa1-hes"[^>]*value="[^"]*42000/);
  });
  test("R4: the closing of a baked round shows the baked dwell and sharpen", () => {
    const { ca, doc, inst } = page(baked());
    expect(inst.hes.xa1.ms).toBe(42000);
    review(ca, inst);
    const tg = [...doc.querySelectorAll(".an-sigrow")][0].querySelector(".an-tg");
    expect(tg.getAttribute("aria-pressed")).toBe("true");
    expect(doc.querySelector(".an-sigrow .an-dw").getAttribute("data-tip")).toContain("42 s");
  });
  test("R3: nothing in a frozen round can be changed", () => {
    const { w, ca, doc, inst } = page(cb.freezeFragment(baked()));
    const none = doc.querySelector("#xa1 .an-none");
    expect(none.disabled).toBe(true);
    none.click();
    expect(doc.querySelector('#xa1 [value="b"]').checked).toBe(true);
    expect(doc.querySelector('[name="dm-xa1-none"]').value).toBe("");
    for (const n of ["dm-xa1-none", "dm-xa1-hes"]) expect(doc.querySelector(`[name="${n}"]`).disabled).toBe(true);
    expect(doc.querySelector("#xa1 .an-epic").disabled).toBe(true);
    review(ca, inst);
    const tgs = [...doc.querySelectorAll(".an-tg")];
    expect(tgs.every(t => t.disabled)).toBe(true);
    tgs[0].click();
    ca.setTag(inst, "forced");
    expect(inst.tag).toBe("");
    expect(w).toBeTruthy();
  });
});

describe("R6 dwell follows visibility and the collect path", () => {
  test("a hidden view counts 0 ms", () => {
    const { w, ca, env, inst } = page(`<div hidden id="v">${lite("l", decision("q1"), decision("q2"))}</div>`);
    env.tick(30000);
    ca.step(inst, 1);
    expect((inst.hes.q1 || {}).ms || 0).toBe(0);
    expect(w).toBeTruthy();
  });
  test("a view switch (IntersectionObserver) stops and restarts the clock", () => {
    const { doc, ca, env, inst } = page(`<div id="v">${lite("l", decision("q1"), decision("q2"))}</div>`);
    env.tick(5000);
    doc.getElementById("v").hidden = true;
    env.io[0]([{ isIntersecting: false }]);
    env.tick(100000);
    doc.getElementById("v").hidden = false;
    env.io[0]([{ isIntersecting: true }]);
    env.tick(3000);
    ca.step(inst, 1);
    expect(inst.hes.q1.ms).toBe(8000);
  });
  test("collecting includes the open stage's dwell", () => {
    const { w, env } = page(lite("l", decision("q1"), decision("q2")));
    env.tick(7000);
    expect(entry(w, "q1").hesitation.ms).toBe(7000);
    expect(md).toMatch(/function collectAllFormFields\(scope\) \{\s*const fields = \{\};[^\n]*\n[^\n]*\n\s*if \(window\.conceptAnalysis[^\n]*flush/);
  });
});

describe("R7 arrow keys stop at the edge", () => {
  test("ArrowDown on the last option and ArrowUp on the first keep the selection", () => {
    const { w, doc } = page(lite("l", decision("q1"), decision("q2")));
    const st = doc.getElementById("q1");
    key(w, st, "ArrowUp");
    expect(doc.querySelector('#q1 [value="a"]').checked).toBe(true);
    key(w, st, "ArrowDown"); key(w, st, "ArrowDown");
    expect(doc.querySelector('#q1 [value="c"]').checked).toBe(true);
    key(w, st, "ArrowDown");
    expect(doc.querySelector('#q1 [value="c"]').checked).toBe(true);
  });
});

describe("R8 the closing links to the next analysis", () => {
  test("two Full analyses: the first offers the second, the last offers nothing", () => {
    const { ca, doc, w } = page(full("p") + full("q").replace('data-iteration="1"', 'data-iteration="2"'));
    const [i1, i2] = ca.instances;
    review(ca, i1);
    const lk = i1.root.querySelector(".an-close .an-link");
    expect(lk.textContent).toContain("Full q");
    lk.click();
    expect(i2.idx).toBe(0);
    review(ca, i2);
    expect(i2.root.querySelector(".an-close .an-link")).toBeNull();
    expect(doc && w).toBeTruthy();
  });
});

describe("R9 / R10 / R11 the composer's note", () => {
  test("R9: a decision without an authored note textarea still keeps the text; the gate warns", () => {
    const html = lite("l", decision("q1", "a", false), decision("q2"));
    const { w, doc, ca, inst } = page(html);
    type(w, inst, "my answer");
    expect(ca.sendNote(inst)).toBe(true);
    expect(doc.querySelector('[data-comment="q1-note"]').value).toBe("my answer");
    expect(analysis.findAnalysisIssues(html).warnings.some(x => x.kind === "decision-note")).toBe(true);
  });
  test("R10: a note filled from outside shows in the composer and is not overwritten", () => {
    const { w, doc, ca, inst } = page(lite("l", decision("q1"), decision("q2")));
    doc.querySelector('[data-comment="q1-note"]').value = "restored text";
    ca.instances.length && w.conceptAnalysis.restored();
    expect(inst.comp.ed.textContent).toContain("restored text");
    type(w, inst, " more");
    expect(doc.querySelector('[data-comment="q1-note"]').value).toBe("restored text more");
  });
  test("R11: toggling another row keeps the tag of the text already typed", () => {
    const { w, ca, doc, inst } = page(full("p"));
    review(ca, inst);
    doc.querySelectorAll(".an-tg")[0].click();
    const first = inst.tag;
    expect(first).toContain("L-pa1");
    type(w, inst, "words for the first row");
    doc.querySelectorAll(".an-tg")[1].click();
    expect(inst.tag).toBe(first);
  });
});

describe("R12 Lite state keys", () => {
  test("two Lite rounds without an id get different keys; the gate warns", () => {
    const html = lite("", decision("q1")) + lite("", decision("r1"));
    const { ca } = page(html);
    expect(ca.instances[0].key).not.toBe(ca.instances[1].key);
    expect(analysis.findAnalysisIssues(html).warnings.some(x => x.kind === "lite-id")).toBe(true);
  });
});

describe("R13 / R14 / R15 badges, points, tag, docs", () => {
  test("R13: the badge sits above the click overlay and a click on it does not toggle the row", () => {
    const { doc } = page(lite("l", decision("q1"), decision("q2")));
    expect(md).toMatch(/\.an-badge \{ position: relative; z-index: 1;/);
    const badge = doc.querySelector("#q1 .an-badge");
    badge.click();
    expect(doc.querySelector('#q1 [value="a"]').checked).toBe(true);
  });
  test("R14: a points decision shows the recommended points per item", () => {
    const { doc } = page(lite("l", points("pts"), decision("q2")));
    expect([...doc.querySelectorAll("#pts .an-badge")].map(b => b.textContent)).toEqual(["★ 5", "★ 3", "★ 2"]);
  });
  test("R15: the tag's x is a keyboard-reachable button", () => {
    const { w, ca, doc, inst } = page(lite("l", decision("q1"), decision("q2")));
    ca.setTag(inst, "Frage 1");
    const x = doc.querySelector(".an-tagw > button");
    expect(x.tagName).toBe("BUTTON");
    expect(x.tabIndex).toBeGreaterThanOrEqual(0);
    const e = key(w, x, "Enter");
    expect(e.defaultPrevented).toBe(false);
    expect(inst.idx).toBe(0);
    x.click();
    expect(inst.tag).toBe("");
  });
  test("R15: the docs say which modes get Keine passt", () => {
    expect(md).toContain("every mode but `slider` / `order` / `points`");
    expect(fs.readFileSync(new URL("./deep-knowledge/step1-templates.md", import.meta.url), "utf8")).toContain("Every mode except slider / order / points");
  });
  test("picture cards put radio and label under the image, left aligned", () => {
    expect(md).toMatch(/\[data-decision-mode="picture"\] \[data-opt-media\] \{ grid-column: 1 \/ -1; grid-row: 1; \}/);
    expect(md).toMatch(/\[data-decision-mode="picture"\] \[data-opt-label\] \{ grid-column: 2; grid-row: 2; text-align: left; \}/);
  });
});

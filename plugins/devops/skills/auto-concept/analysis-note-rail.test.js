import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { readTemplates } from "./templates-source.js";
import fixture from "../../scripts/build-concept-fixture.js";

// B1: the note sent with an answer stays in the history (scroll, reload, frozen, closing); rail labels are capped.

const dk = f => fs.readFileSync(path.join(__dirname, "deep-knowledge", f), "utf8");
const CSS = dk("templates-analysis-css.md");
const md = readTemplates();
const blocks = fixture.scanBlocks(md);
const UI = blocks.find(b => /javascript|js/.test(b.info) && b.code.includes("window.conceptAnalysis = {")).code;
// The real attachment engine; its top-level state must be a global for the page code to read it (a template copies it into one <script>).
const ENGINE = blocks.find(b => b.code.includes("const ATTACH_DB_NAME")).code.replace("const _attachments", "var _attachments");

const fn = name => {
  const m = md.match(new RegExp("function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n\\}"));
  if (!m) throw new Error(name);
  return m[0];
};
const COLLECT = ["collectModeDecision", "collectModeDecisions", "noteWordCount", "hesitationFlag"].map(fn).join("\n");

const opt = (id, v, label, checked) => `<label data-opt="${v}"><input type="radio" name="dm-${id}" value="${v}"${checked ? " checked" : ""}><span data-opt-label>${label}</span><span data-opt-consequence>${label} follows</span></label>`;
const decision = id => `<section id="${id}" data-nav-label="${id}" data-decision="${id}" data-decision-mode="single" data-label="L-${id}" data-rec="a"><h3 data-question>Q ${id}?</h3><div data-options>${opt(id, "a", "Alpha", true)}${opt(id, "b", "Beta")}</div><textarea data-comment="${id}-note"></textarea><input type="hidden" name="dm-${id}-touched" value=""><input type="hidden" name="dm-${id}-issue" value=""><input type="hidden" name="dm-${id}-epic" value=""></section>`;
const LITE = `<section data-analysis="lite" data-nav-label="Lite" id="lite">${decision("q1")}${decision("q2")}${decision("q3")}</section>`;
const FULL = `<section data-iteration="1" data-analysis="full" id="iter">
  <section id="briefing" data-analysis-briefing data-nav-label="Briefing"><p data-briefing-what>W</p><p data-briefing-why>Y</p><div data-briefing-potential>1</div><a data-briefing-topic="t1" data-share="100">One</a></section>
  <section id="t1" data-topic data-nav-label="One">${decision("a1")}${decision("a2")}</section>
</section>`;

function page(html, { engine = false } = {}) {
  const dom = new JSDOM(`<html lang="en"><body>${html}</body></html>`, { url: "http://localhost/c.html", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.setTimeout = () => 1;
  w.clearTimeout = () => {};
  w.HTMLElement.prototype.getClientRects = function () { return [{}]; };
  if (engine) {
    // jsdom has no IndexedDB: a stub whose requests succeed, so the engine's local-first path runs as in a browser
    w.indexedDB = { open() { const req = {}; setImmediate(() => { req.result = { objectStoreNames: { contains: () => true }, transaction() { const tx = {}; const done = () => setImmediate(() => tx.oncomplete && tx.oncomplete()); tx.objectStore = () => ({ put: done, delete: done, getAll() { const r = {}; setImmediate(() => { r.result = []; r.onsuccess && r.onsuccess(); }); return r; } }); return tx; } }; req.onsuccess && req.onsuccess(); }); return req; } };
    w.eval(ENGINE);
  }
  w.eval(COLLECT);
  w.eval(UI);
  w.conceptAnalysis.init();
  return { w, doc: w.document, ca: w.conceptAnalysis };
}
const type = (w, inst, text) => { inst.comp.ed.appendChild(w.document.createTextNode(text)); inst.comp.ed.dispatchEvent(new w.Event("input", { bubbles: true })); };
const key = (w, el, k) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
const send = (w, ca, inst, text) => { type(w, inst, text); ca.sendNote(inst); };
const pasteFile = (w, target, name = "shot.png", type_ = "image/png") => {
  const file = new w.File([new Uint8Array([1, 2, 3])], name, { type: type_ });
  const ev = new w.Event("paste", { bubbles: true, cancelable: true });
  ev.clipboardData = { items: [{ kind: "file", getAsFile: () => file }], getData: () => "" };
  target.dispatchEvent(ev);
  return ev;
};
const JS2 = dk("templates-analysis-js-2.md");
const gate = require("../../hooks/lib/concept-gate.js");
const ctrlEnter = (w, inst) => inst.comp.ed.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
const pick = (p, id, v) => { const b = p.doc.querySelector(`input[name="dm-${id}"][value="${v}"]`); b.checked = true; b.dispatchEvent(new p.w.Event("change", { bubbles: true })); };
const bubbles = (doc, id) => [...doc.querySelectorAll(`#${id} > .an-m-me > *`)];

describe("B1 the note sent with an answer is its own bubble in the history", () => {
  test("Ctrl+Enter with a note: answer bubble, then the note as its own bubble with pen and x (scroll back)", () => {
    const p = page(LITE), inst = p.ca.instances[0];
    pick(p, "q1", "b");
    type(p.w, inst, "mynote");
    ctrlEnter(p.w, inst);
    expect(inst.idx).toBe(1);
    const b = bubbles(p.doc, "q1");
    expect(b.map(x => x.className.includes("an-ans-m") ? "ans" : x.className.includes("an-note-m") ? "note" : "?")).toEqual(["ans", "note"]);
    expect(b[1].textContent).toBe("mynote");
    expect(b[1].querySelectorAll(".an-note-acts .an-note-b")).toHaveLength(2);
    expect(p.doc.querySelector("#q1 > .an-m-me").hidden).toBe(false);
  });
  test("a rail jump away shows it too; coming back and leaving again does not duplicate it", () => {
    const p = page(LITE), inst = p.ca.instances[0];
    pick(p, "q1", "b");
    type(p.w, inst, "mynote");
    p.ca.go(inst, 2);
    expect(bubbles(p.doc, "q1").filter(x => x.classList.contains("an-note-m")).map(x => x.textContent)).toEqual(["mynote"]);
    p.ca.go(inst, 0); p.ca.go(inst, 2);
    expect(bubbles(p.doc, "q1").filter(x => x.classList.contains("an-note-m"))).toHaveLength(1);
  });
  test("after a reload the stored note shows under its answer", () => {
    const html = LITE.replace('<textarea data-comment="q1-note"></textarea>', '<textarea data-comment="q1-note">kept</textarea>');
    const { doc, ca } = page(html), inst = ca.instances[0];
    ca.go(inst, 1);
    expect([...doc.querySelectorAll("#q1 > .an-m-me .an-note-m")].map(x => x.textContent)).toEqual(["kept"]);
    expect(doc.querySelectorAll("#q1 > .an-m-me .an-ans-m")).toHaveLength(1);
  });
  test("a frozen earlier round shows the note, read-only", () => {
    const html = `<div data-baked>${LITE.replace('<textarea data-comment="q1-note"></textarea>', '<textarea data-comment="q1-note">sent</textarea>')}</div>`;
    const { doc, ca } = page(html), inst = ca.instances[0];
    ca.go(inst, 1);
    expect([...doc.querySelectorAll("#q1 > .an-m-me .an-note-m")].map(x => x.textContent)).toEqual(["sent"]);
    expect(doc.querySelectorAll("#q1 .an-note-b")).toHaveLength(0);
  });
  test("the closing overview shows the note next to its answer", () => {
    const p = page(FULL), inst = p.ca.instances[0];
    const k = inst.stages.indexOf(inst.stages.find(s => s.el && s.el.id === "a1"));
    p.ca.go(inst, k);
    pick(p, "a1", "b");
    type(p.w, inst, "closing-note");
    p.ca.go(inst, inst.stages.length - 1);
    expect([...p.doc.querySelectorAll(".an-sig-note, .an-mini-note")].map(x => x.textContent)).toEqual(["✎ closing-note"]);
  });
  test("source: the done overview lists notes too; the seal redraws the earlier bubble", () => {
    expect(JS2).toMatch(/noteTexts\(inst, x\.s\)\.forEach/);
    expect(JS2).toMatch(/noteTexts\(inst, s\)\.forEach/);
    expect(dk("templates-analysis-js.md")).toMatch(/function sealLeaving\(/);
    expect(JS2).toMatch(/sealLeaving\(inst, prev\)/);
  });
});

describe("B1 rail labels: capped at 28, cut at the end, never on the left", () => {
  const rule = sel => (CSS.match(new RegExp("^" + sel.replace(/[.>*]/g, "\$&") + " \{[^}]*\}", "m")) || [""])[0];
  test("a rail label shrinks and ends in an ellipsis; the row keeps right alignment", () => {
    const r = rule(".an-ri > span");
    expect(r).toMatch(/min-width: 0/);
    expect(r).toMatch(/overflow: hidden/);
    expect(r).toMatch(/text-overflow: ellipsis/);
    expect(r).toMatch(/white-space: nowrap/);
    expect(CSS).toMatch(/\.an-here-tag > span \{[^}]*text-overflow: ellipsis/);
    expect(CSS).toMatch(/\.an-rail:hover, \.an-rail:focus-within \{ width: 260px; max-width: calc\(100vw - 44px\)/);
  });
  test("every rail item carries the full title as app tooltip (data-tip), never title", () => {
    const long = "Bekannte Fehler, die schon auf main sind und noch viel mehr";
    const { doc } = page(FULL.replace('data-nav-label="One"', `data-nav-label="${long}"`));
    const item = [...doc.querySelectorAll(".an-ri")].find(b => b.textContent.includes("Bekannte"));
    expect(item.getAttribute("data-tip")).toContain(long);
    expect(item.hasAttribute("title")).toBe(false);
  });
  test("the generation rule and the gate warn above 28 characters", () => {
    expect(fs.readFileSync(path.join(__dirname, "deep-knowledge", "step2-generate.md"), "utf8")).toMatch(/Rail labels: at most 28 characters/);
    const bad = `<section data-analysis="full"><section data-topic data-nav-label="${"x".repeat(29)}"></section><section data-decision="d" data-label="${"y".repeat(28)}"></section></section>`;
    const w = gate.findRailLabelWarnings(bad);
    expect(w).toHaveLength(1);
    expect(w[0].kind).toBe("rail-label-length");
    expect(gate.findRailLabelWarnings(bad.replace("x".repeat(29), "x".repeat(28)))).toHaveLength(0);
  });
});

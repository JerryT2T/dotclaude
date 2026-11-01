import { describe, test, expect } from "vitest";
import { JSDOM } from "jsdom";
import { readTemplates } from "./templates-source.js";
import fixture from "../../scripts/build-concept-fixture.js";
import cb from "../../scripts/concept-build.js";

// Analysis redesign, phase 1: hesitation signal in the payload, the persistent
// composer (tag stays / untagged advances) and none / hesitation through bake.

const md = readTemplates();
const blocks = fixture.scanBlocks(md);
const UI = blocks.find(b => /javascript|js/.test(b.info) && b.code.includes("window.conceptAnalysis = {")).code;
const fn = name => {
  const m = md.match(new RegExp("function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n\\}"));
  if (!m) throw new Error(name);
  return m[0];
};
const COLLECT = ["collectModeDecision", "collectModeDecisions", "noteWordCount", "hesitationFlag"].map(fn).join("\n");

const opt = (id, v, label, checked) => `<label data-opt="${v}"><input type="radio" name="dm-${id}" value="${v}"${checked ? " checked" : ""}><span data-opt-label>${label}</span><span data-opt-consequence>${label} follows</span></label>`;
const decision = (id, rec = "a") => `<section id="${id}" data-nav-label="${id}" data-decision="${id}" data-decision-mode="single" data-label="L-${id}" data-rec="${rec}"><h3 data-question>Q ${id}?</h3><div data-options>${opt(id, "a", "Alpha", true)}${opt(id, "b", "Beta")}</div><textarea data-comment="${id}-note"></textarea><input type="hidden" name="dm-${id}-touched" value=""><input type="hidden" name="dm-${id}-issue" value=""><input type="hidden" name="dm-${id}-epic" value=""></section>`;
const LITE = `<section data-analysis="lite" data-nav-label="Lite" id="lite">${decision("q1")}${decision("q2")}${decision("q3")}</section>`;
const FULL = `<section data-iteration="1" data-analysis="full" id="iter">
  <section id="briefing" data-analysis-briefing data-nav-label="Briefing"><p data-briefing-what>W</p><p data-briefing-why>Y</p><div data-briefing-potential>1</div><a data-briefing-topic="t1" data-share="100">One</a></section>
  <section id="t1" data-topic data-nav-label="One">${decision("a1")}${decision("a2")}</section>
</section>`;

function page(html) {
  const dom = new JSDOM(`<html lang="en"><body>${html}</body></html>`, { url: "http://localhost/c.html", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const timers = [];
  w.setTimeout = (f, ms) => { timers.push({ f, ms }); return timers.length; };
  w.clearTimeout = () => {};
  let now = 1000;
  w.Date.now = () => now;
  const env = { focused: true, tick: ms => { now += ms; } };
  w.document.hasFocus = () => env.focused;
  w.HTMLElement.prototype.getClientRects = function () { return [{}]; };
  w.eval(COLLECT);
  w.eval(UI);
  w.conceptAnalysis.init();
  return { w, doc: w.document, ca: w.conceptAnalysis, env, timers };
}
const type = (w, inst, text) => { inst.comp.ed.appendChild(w.document.createTextNode(text)); inst.comp.ed.dispatchEvent(new w.Event("input", { bubbles: true })); };

describe("hesitation signal", () => {
  test("the flag needs at least two of: slow (2x median, >= 20 s), note > 12 words, >= 2 revisits", () => {
    const { w } = page("");
    const flag = (ms, noteWords, revisits, median) => w.hesitationFlag({ ms, noteWords, revisits }, median);
    expect(flag(60000, 0, 0, 10000)).toBe(false);          // slow only
    expect(flag(60000, 13, 0, 10000)).toBe(true);          // slow + wordy
    expect(flag(5000, 13, 2, 10000)).toBe(true);           // wordy + revisits
    expect(flag(15000, 0, 2, 4000)).toBe(false);           // 15 s is under the 20 s floor
    expect(flag(25000, 0, 2, 20000)).toBe(false);          // not over twice the median
    expect(flag(25000, 12, 1, 10000)).toBe(false);         // exactly 12 words / 1 revisit do not count
    expect(w.noteWordCount("[Befund · Frage 1] one two three")).toBe(3);
  });
  test("dwell counts only while the window is focused; the payload carries ms, noteWords, revisits, flagged", () => {
    const { w, doc, ca, env } = page(LITE);
    const inst = ca.instances[0];
    env.tick(30000);
    env.focused = false; w.dispatchEvent(new w.Event("blur"));
    env.tick(100000);                                   // away: not counted
    env.focused = true; w.dispatchEvent(new w.Event("focus"));
    env.tick(5000);
    ca.step(inst, 1);
    const e = w.collectModeDecision(doc.getElementById("q1"));
    expect(e.hesitation.ms).toBe(35000);
    expect(e.hesitation.revisits).toBe(0);
    expect(e.hesitation.noteWords).toBe(0);
    expect(e.hesitation.flagged).toBe(false);
  });
  test("revisits and answer changes add up; with a long note the decision is flagged", () => {
    const { w, doc, ca } = page(LITE);
    const inst = ca.instances[0];
    ca.go(inst, 1); ca.go(inst, 0);                     // one revisit of q1
    const b = doc.querySelector('input[name="dm-q1"][value="b"]');
    b.checked = true; b.dispatchEvent(new w.Event("change", { bubbles: true }));
    const a = doc.querySelector('input[name="dm-q1"][value="a"]');
    a.checked = true; a.dispatchEvent(new w.Event("change", { bubbles: true }));   // second change: another revisit
    doc.querySelector("#q1 .an-note").value = "one two three four five six seven eight nine ten eleven twelve thirteen";
    ca.hesFlush(inst);
    const e = w.collectModeDecision(doc.getElementById("q1"));
    expect(e.hesitation.revisits).toBe(2);
    expect(e.hesitation.noteWords).toBe(13);
    expect(e.hesitation.flagged).toBe(true);
  });
  test("none and hesitation survive the bake: the hidden controls come back from decisions[]", () => {
    const { w, doc, ca } = page(LITE);
    const inst = ca.instances[0];
    ca.go(inst, 0);
    doc.querySelector("#q1 .an-none").click();
    const entry = w.collectModeDecision(doc.getElementById("q1"));
    expect(entry.none).toBe(true);
    const frag = `<section data-iteration="1">${decision("q1")}</section>`.replace('<input type="hidden" name="dm-q1-touched"', '<input type="hidden" name="dm-q1-none" value=""><input type="hidden" name="dm-q1-hes" value=""><input type="hidden" name="dm-q1-touched"');
    const baked = cb.bake(frag, { decisions: [{ ...entry, hesitation: { ms: 42000, noteWords: 3, revisits: 2, flagged: true } }] }).html;
    expect(baked).toMatch(/name="dm-q1-none"[^>]*value="1"/);
    expect(baked).toMatch(/name="dm-q1-hes"[^>]*value="[^"]*sharpen[^"]*true/);
  });
});

describe("persistent composer", () => {
  test("untagged: the note is the stage's note and sending advances (not on the briefing)", () => {
    const { doc, w, ca } = page(LITE);
    const inst = ca.instances[0];
    type(w, inst, "hello there");
    expect(doc.querySelector("#q1 .an-note").value).toBe("hello there");
    expect(ca.sendNote(inst)).toBe(true);
    expect(inst.stages[inst.idx].el.id).toBe("q2");
    expect(doc.querySelector("#q1 .an-note").value).toBe("hello there");
    expect(inst.comp.ed.textContent).toBe("");           // the next stage starts with an empty composer
  });
  test("an untagged note on a question accepts it; topic intro and closing never advance", () => {
    const { w, ca } = page(FULL);
    const inst = ca.instances[0];
    const ti = inst.stages.findIndex(s => s.kind === "topic");
    ca.go(inst, ti);
    type(w, inst, "on the topic");
    ca.sendNote(inst);
    expect(inst.idx).toBe(ti);
    const di = inst.stages.findIndex(s => s.kind === "dec");
    ca.go(inst, di);
    type(w, inst, "ok");
    ca.sendNote(inst);
    expect(inst.idx).toBeGreaterThan(di);
    ca.go(inst, inst.stages.findIndex(s => s.kind === "review"));
    type(w, inst, "closing");
    const ri = inst.idx;
    ca.sendNote(inst);
    expect(inst.idx).toBe(ri);
  });
  test("an empty send is Weiter / Los geht's; on the closing it only points at the next-round button", () => {
    const { doc, ca } = page(FULL);
    const inst = ca.instances[0];
    expect(inst.stages[inst.idx].kind).toBe("brief");
    expect(ca.sendNote(inst)).toBe(true);
    expect(inst.stages[inst.idx].kind).not.toBe("brief");
    const di = inst.stages.findIndex(s => s.kind === "dec");
    ca.go(inst, di);
    expect(ca.sendNote(inst)).toBe(true);
    expect(inst.idx).toBeGreaterThan(di);
    const btn = doc.createElement("button");
    btn.id = "panel-toggle";
    doc.body.appendChild(btn);
    ca.go(inst, inst.stages.findIndex(s => s.kind === "review"));
    const ri = inst.idx;
    expect(ca.sendNote(inst)).toBe(false);
    expect(inst.idx).toBe(ri);
    expect(btn.classList.contains("an-point")).toBe(true);
  });
  test("tagged: the note stays on the stage, one tag at most, the tag comes back on return", () => {
    const { doc, w, ca } = page(LITE);
    const inst = ca.instances[0];
    ca.setTag(inst, "Question 1");
    ca.setTag(inst, "Finding · Question 1");
    expect(inst.comp.ed.querySelectorAll(".an-tagw")).toHaveLength(1);
    type(w, inst, "a thought");
    ca.sendNote(inst);
    expect(inst.stages[inst.idx].el.id).toBe("q1");
    expect(doc.querySelector("#q1 .an-note").value).toBe("[Finding · Question 1] a thought");
    ca.go(inst, 1); ca.go(inst, 0);
    expect(inst.comp.ed.querySelector(".an-tagw").textContent).toContain("Finding · Question 1");
    expect(inst.comp.ed.textContent).toContain("a thought");
  });
  test("a click on the finding or the question sets the tag; the briefing never advances on send", () => {
    const { doc, w, ca } = page(FULL);
    const inst = ca.instances[0];
    type(w, inst, "on the briefing");
    ca.sendNote(inst);
    expect(inst.stages[inst.idx].kind).toBe("brief");
    expect(doc.querySelector('[data-comment="briefing-note"]').value).toBe("on the briefing");
    ca.go(inst, inst.stages.findIndex(s => s.el.id === "a1"));
    doc.querySelector("#a1 .an-m-q .an-bub").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    expect(inst.tag).toBe("Question 1");
    doc.querySelector("#a1 .an-m-find .an-bub").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    expect(inst.tag).toBe("Finding · Question 1");
  });
  test("the send control is a solid paper plane; the tag is an inline label; the editor has a normal line height", () => {
    const css = blocks.find(b => b.info === "css" && b.code.includes("--an-bg")).code;
    const { ca } = page(LITE);
    expect(ca.instances[0].comp.send.querySelector("path").getAttribute("d")).toBe("M2.01 21 23 12 2.01 3 2 10l15 2-15 2z");
    expect(css).toMatch(/\.an-send svg \{[^}]*fill: currentColor/);
    expect(css).toMatch(/\.an-tagw \{ display: inline-block;[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.an-comp-ed \{[^}]*font-size: 14px; line-height: 22px/);
  });
  test("a frozen round is read-only", () => {
    const { ca } = page(`<div data-baked>${LITE}</div>`);
    const inst = ca.instances[0];
    expect(inst.comp.ed.contentEditable).toBe("false");
    expect(inst.comp.send.disabled).toBe(true);
  });
});

describe("the finding is only the finding", () => {
  test("[data-context] (an answering hint) sits in the answer block, never in the finding message", () => {
    const html = LITE.replace('<h3 data-question>Q q1?</h3>', '<h3 data-question>Q q1?</h3><p data-context>Klick auf die Skizze oder die Liste.</p>');
    const { doc } = page(html);
    const d = doc.getElementById("q1");
    const ctx = d.querySelector("[data-context]");
    expect(ctx).toBeTruthy();
    expect(ctx.closest(".an-ans")).toBeTruthy();
    expect(ctx.closest(".an-m-find")).toBeNull();
    expect(ctx.classList.contains("an-ans-hint")).toBe(true);
  });
});

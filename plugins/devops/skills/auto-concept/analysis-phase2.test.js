import { describe, test, expect } from "vitest";
import { JSDOM } from "jsdom";
import { readTemplates } from "./templates-source.js";
import fixture from "../../scripts/build-concept-fixture.js";
import cb from "../../scripts/concept-build.js";
import analysis from "../../hooks/lib/concept-gate-analysis.js";

// Analysis redesign, phase 2: picture / compare / chain / place / points,
// slider consequences, the stakes tooltip and the nav-based "next entry".

const md = readTemplates();
const blocks = fixture.scanBlocks(md);
const UI = blocks.find(b => /javascript|js/.test(b.info) && b.code.includes("window.conceptAnalysis = {")).code;
const fn = name => {
  const m = md.match(new RegExp("function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n\\}"));
  if (!m) throw new Error(name);
  return m[0];
};
const COLLECT = ["collectAllFormFields", "collectModeDecision", "collectModeDecisions", "noteWordCount", "hesitationFlag"].map(fn).join("\n");
const { findAnalysisIssues, pointsBudget } = analysis;

const hid = id => ["touched", "issue", "epic"].map(n => `<input type="hidden" name="dm-${id}-${n}" value="">`).join("");
const radio = (id, v, label, checked, inner = "", pre = "") =>
  `<label data-opt="${v}"><input type="radio" name="dm-${id}" value="${v}"${checked ? " checked" : ""}>${pre}<span data-opt-label>${label}</span><span data-opt-consequence>${label} follows</span>${inner}</label>`;
const dec = (id, mode, rec, inner, extra = "") => `<section id="${id}" data-nav-label="${id}" data-decision="${id}" data-decision-mode="${mode}" data-label="L-${id}" data-rec="${rec}" data-rec-why="because" ${extra}>
  <p data-situation>Found ${id}.</p><h3 data-question>Question ${id}?</h3>${inner}
  <textarea data-comment="${id}-note"></textarea>${hid(id)}</section>`;
const svg = `<span data-opt-media><svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg></span>`;

const PICTURE = dec("pic", "picture", "b", `<div data-options>${radio("pic", "a", "Flat", false, "", svg)}${radio("pic", "b", "Tree", true, "", `<span data-opt-media><pre>real excerpt</pre></span>`)}</div>`);
const cell = (c, v) => `<span data-opt-cell data-crit="${c}">${v}</span>`;
const col = (id, v, checked) => radio(id, v, v.toUpperCase(), checked, cell("Tokens", "1") + cell("Fresh", "2") + cell("Cost", "3"));
const COMPARE = dec("cmp", "compare", "b", `<div data-options>${col("cmp", "a", false)}${col("cmp", "b", true)}${col("cmp", "c", false)}</div>`);
const route = (id, v, checked) => radio(id, v, "Route " + v, checked, `<ol data-opt-steps><li>Hook</li><li data-step-new>Bridge</li><li>Tool</li></ol>`);
const CHAIN = dec("chn", "chain", "r2", `<div data-options>${route("chn", "r1", false)}${route("chn", "r2", true)}</div>`);
const PLACE = dec("plc", "place", "side", `<div data-place-sketch><svg viewBox="0 0 100 60"><rect data-slot-for="top" x="0" y="0" width="100" height="10"/><rect data-slot-for="side" x="0" y="15" width="20" height="40"/></svg></div>
  <div data-options>${radio("plc", "top", "Header", false)}${radio("plc", "side", "Sidebar", true)}</div>`);
const pt = (id, item, v) => `<div data-opt="${item}"><span data-opt-label>${item}</span><span data-opt-consequence>${item} gets points</span><input type="hidden" name="dm-${id}.${item}" value="${v}"></div>`;
const POINTS = dec("pts", "points", "speed:5 cost:3 risk:2 reach:3", `<div data-options>${pt("pts", "speed", 5)}${pt("pts", "cost", 3)}${pt("pts", "risk", 2)}${pt("pts", "reach", 3)}</div>`);
const SLIDER = dec("sl", "slider", "8", `<div data-options><input type="range" name="dm-sl" min="0" max="20" step="1" value="8"></div>`,
  `data-unit="s" data-stops='[{"at":4,"text":"Often aborts"},{"at":8,"text":"Meets the p95 goal"},{"at":15,"text":"Noticeable wait"}]'`);

function page(html) {
  const dom = new JSDOM(`<html lang="en"><body>${html}</body></html>`, { url: "http://localhost/c.html", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.setTimeout = () => 1;
  w.clearTimeout = () => {};
  w.document.hasFocus = () => true;
  w.HTMLElement.prototype.getClientRects = function () { return [{}]; };
  w.eval(COLLECT);
  w.eval(UI);
  w.conceptAnalysis.init();
  return { w, doc: w.document, ca: w.conceptAnalysis };
}
const lite = (...ds) => `<section data-analysis="lite" data-nav-label="Lite" id="lite">${ds.join("")}</section>`;
const entry = (w, id) => w.collectModeDecisions(w.document).find(e => e.id === id);

describe("collect + preselect per new mode", () => {
  test("picture / compare / chain / place: value = option id, the recommendation is preselected", () => {
    const { w } = page(lite(PICTURE, COMPARE, CHAIN, PLACE));
    expect(entry(w, "pic")).toMatchObject({ mode: "picture", value: "b", deviates: false });
    expect(entry(w, "cmp")).toMatchObject({ mode: "compare", value: "b", deviates: false });
    expect(entry(w, "chn")).toMatchObject({ mode: "chain", value: "r2", deviates: false });
    expect(entry(w, "plc")).toMatchObject({ mode: "place", value: "side", deviates: false });
  });
  test("an engine-side preselection is set when the markup shipped none", () => {
    const { w, doc } = page(lite(PICTURE.replace(" checked", "")));
    expect(doc.querySelector('[name="dm-pic"][value="b"]').checked).toBe(true);
    expect(entry(w, "pic").value).toBe("b");
  });
  test("the answer block keeps its look: rows, ★ Empfohlen on the recommendation, Keine passt link", () => {
    const { doc } = page(lite(PICTURE, COMPARE, CHAIN, PLACE));
    for (const id of ["pic", "cmp", "chn", "plc"]) {
      const d = doc.getElementById(id);
      expect(d.querySelectorAll(".an-ans .an-badge").length, id).toBe(1);
      expect(d.querySelector(".an-none"), id).not.toBeNull();
    }
    expect(doc.querySelector("#cmp .an-kind").textContent).toBe("Comparison");
  });
  test("compare / chain: picking another column or route deviates", () => {
    const { w, doc } = page(lite(COMPARE, CHAIN));
    doc.querySelector('#cmp [value="c"]').click();
    doc.querySelector('#chn [value="r1"]').click();
    expect(entry(w, "cmp")).toMatchObject({ value: "c", deviates: true, untouched: false });
    expect(entry(w, "chn")).toMatchObject({ value: "r1", deviates: true });
  });
  test("points: value is {item: points}; the recommendation preset is the preselection", () => {
    const { w } = page(lite(POINTS));
    expect(entry(w, "pts")).toMatchObject({ mode: "points", value: { speed: 5, cost: 3, risk: 2, reach: 3 }, deviates: false });
  });
  test("points: a preset that was not authored is filled from data-rec", () => {
    const { w } = page(lite(POINTS.replace(/value="[0-9]"/g, 'value=""')));
    expect(entry(w, "pts").value).toEqual({ speed: 5, cost: 3, risk: 2, reach: 3 });
  });
});

describe("points budget", () => {
  test("the budget scales with the item count and 4 items give 13", () => {
    expect([2, 3, 4, 5].map(pointsBudget)).toEqual([7, 10, 13, 16]);
    const { doc } = page(lite(POINTS));
    expect(doc.querySelector("#pts .an-pts-left").textContent).toBe("Left: 0 of 13 points");
  });
  test("a step that would exceed the budget cannot be set; freeing points makes it possible", () => {
    const { w, doc } = page(lite(POINTS));
    const press = (item, s) => doc.querySelector(`#pts [data-opt="${item}"] [data-pts="${s}"]`);
    expect(press("risk", 8).disabled).toBe(true);
    press("risk", 8).click();
    expect(entry(w, "pts").value.risk).toBe(2);
    press("speed", 1).click();                       // 5 -> 1 frees 4
    expect(entry(w, "pts").value.speed).toBe(1);
    expect(doc.querySelector("#pts .an-pts-left").textContent).toBe("Left: 4 of 13 points");
    press("risk", 5).click();                        // 2 -> 5 needs 3 <= 4
    expect(entry(w, "pts").value.risk).toBe(5);
    expect(entry(w, "pts")).toMatchObject({ deviates: true, untouched: false });
    const total = Object.values(entry(w, "pts").value).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(13);
    press("risk", 5).click();                        // same step again = 0
    expect(entry(w, "pts").value.risk).toBe(0);
  });
  test("points has no Keine-passt link", () => {
    const { doc } = page(lite(POINTS));
    expect(doc.querySelector("#pts .an-none")).toBeNull();
  });
});

describe("place: slot and list are one control", () => {
  test("clicking a slot checks the list row, clicking a row lights the slot", () => {
    const { w, doc } = page(lite(PLACE));
    const slot = v => doc.querySelector(`#plc [data-slot-for="${v}"]`);
    expect(slot("side").classList.contains("an-slot-on")).toBe(true);
    expect(slot("top").classList.contains("an-slot-on")).toBe(false);
    slot("top").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    expect(doc.querySelector('#plc [name="dm-plc"][value="top"]').checked).toBe(true);
    expect(doc.querySelector('#plc [data-opt="top"]').classList.contains("is-on")).toBe(true);
    expect(slot("top").classList.contains("an-slot-on")).toBe(true);
    expect(slot("side").classList.contains("an-slot-on")).toBe(false);
    expect(entry(w, "plc")).toMatchObject({ value: "top", deviates: true });
    doc.querySelector('#plc [name="dm-plc"][value="side"]').click();
    expect(slot("side").classList.contains("an-slot-on")).toBe(true);
    expect(slot("top").classList.contains("an-slot-on")).toBe(false);
  });
});

describe("slider live consequences + stakes tooltip + next entry", () => {
  test("the consequence follows the value along the stops; the ★ marker stays", () => {
    const { w, doc } = page(lite(SLIDER));
    const cons = () => doc.querySelector("#sl .an-sl-cons").textContent;
    const set = v => { const r = doc.querySelector('#sl [name="dm-sl"]'); r.value = String(v); r.dispatchEvent(new w.Event("input", { bubbles: true })); };
    expect(cons()).toBe("Meets the p95 goal");
    set(2); expect(cons()).toBe("Often aborts");
    set(4); expect(cons()).toBe("Often aborts");
    set(12); expect(cons()).toBe("Meets the p95 goal");
    set(20); expect(cons()).toBe("Noticeable wait");
    expect(doc.querySelector("#sl .an-sl-rec .an-badge")).not.toBeNull();
  });
  test("the ellipsised Davon-hängt-ab line carries its full text as tooltip", () => {
    const { doc } = page(lite(PICTURE.replace("<div data-options>", "<p data-stakes>Token use of every hook and how fresh answers stay.</p><div data-options>")));
    const s = doc.querySelector("#pic [data-stakes]");
    expect(s.getAttribute("data-tip")).toContain("Token use of every hook and how fresh answers stay.");
    expect(s.getAttribute("data-tip")).toMatch(/^(Davon hängt ab|What depends on it)/);
  });
  const FULL = inner => `<section id="iter" data-iteration="1" data-analysis="full"><section id="briefing" data-analysis-briefing data-nav-label="Briefing"><p data-briefing-what>W</p><p data-briefing-why>Y</p><div data-briefing-potential>1</div><a data-briefing-topic="t1" data-share="100">One</a></section><section id="t1" data-topic data-nav-label="One">${inner}</section></section>`;
  const closingLinks = html => {
    const { doc, ca } = page(html);
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.kind === "review"));
    return [...doc.querySelectorAll(".an-close .an-link")].map(b => b.textContent).filter(t => /→/.test(t));
  };
  test("the nav no longer makes a link: without another analysis on the page the closing has none", () => {
    expect(closingLinks(`${FULL(PICTURE)}<section id="decoy" data-nav-label="Decoy"></section>`)).toEqual([]);
    const nav = `<nav><a class="section-nav-item" data-section-id="briefing">B</a><a class="section-nav-item" data-section-id="t1">T</a></nav>`;
    expect(closingLinks(`${nav}${FULL(PICTURE)}<section id="decoy" data-nav-label="Decoy"></section>`)).toEqual([]);
  });
});

describe("bake round trip", () => {
  const fragment = lite(PICTURE, COMPARE, CHAIN, PLACE, POINTS);
  const plain = html => {
    const w = new JSDOM(`<body>${html}</body>`, { runScripts: "outside-only" }).window;
    w.eval(COLLECT);
    return w;
  };
  test("typed decisions[] alone restore every new mode; frozen controls are disabled", () => {
    const w0 = plain(fragment);
    const answered = w0.collectModeDecisions(w0.document).map(e => {
      if (e.id === "pic") return { ...e, value: "a", untouched: false };
      if (e.id === "cmp") return { ...e, value: "c", untouched: false };
      if (e.id === "chn") return { ...e, value: "r1", untouched: false };
      if (e.id === "plc") return { ...e, value: "top", untouched: false };
      return { ...e, value: { speed: 8, cost: 1, risk: 0, reach: 3 }, untouched: false };
    });
    const { html } = cb.bake(fragment, { decisions: answered });
    expect(html).toContain("data-baked");
    const w1 = plain(html);
    const back = w1.collectModeDecisions(w1.document);
    expect(back.find(e => e.id === "pic").value).toBe("a");
    expect(back.find(e => e.id === "cmp").value).toBe("c");
    expect(back.find(e => e.id === "chn").value).toBe("r1");
    expect(back.find(e => e.id === "plc").value).toBe("top");
    expect(back.find(e => e.id === "pts").value).toEqual({ speed: 8, cost: 1, risk: 0, reach: 3 });
    expect(back.every(e => !e.untouched)).toBe(true);
    const frozen = new JSDOM(cb.freezeFragment(html)).window.document;
    expect(frozen.querySelector('[name="dm-pts.speed"]').disabled).toBe(true);
    expect(frozen.querySelector('[name="dm-plc"][value="top"]').disabled).toBe(true);
  });
  test("a frozen points round renders read-only: no pressable step", () => {
    const w0 = plain(POINTS);
    const answered = w0.collectModeDecisions(w0.document).map(e => ({ ...e, untouched: false }));
    const frozenHtml = cb.freezeFragment(cb.bake(POINTS, { decisions: answered }).html);
    const { doc } = page(lite(frozenHtml));
    const b = doc.querySelector('#pts [data-opt="risk"] [data-pts="3"]');
    expect(b.disabled).toBe(true);
  });
});

describe("gate", () => {
  const kinds = (html, key) => findAnalysisIssues(html)[key].map(i => i.kind);
  test("well-formed Phase-2 decisions are clean", () => {
    for (const m of [PICTURE, COMPARE, CHAIN, PLACE, POINTS]) {
      const r = findAnalysisIssues(lite(m));
      expect(r.errors, m).toEqual([]);
      expect(r.warnings.map(w => w.kind), m).toEqual([]);
    }
  });
  test("preselection is checked per new mode", () => {
    expect(kinds(lite(PICTURE.replace(' data-rec="b"', ' data-rec="a"')), "errors")).toContain("decision-preselect");
    expect(kinds(lite(PLACE.replace(' data-rec="side"', ' data-rec="top"')), "errors")).toContain("decision-preselect");
    expect(kinds(lite(POINTS.replace('name="dm-pts.speed" value="5"', 'name="dm-pts.speed" value="4"')), "errors")).toContain("decision-preselect");
  });
  test("points: a recommendation over the budget or off the Fibonacci steps is an error", () => {
    const over = POINTS.replace('data-rec="speed:5 cost:3 risk:2 reach:3"', 'data-rec="speed:8 cost:8 risk:2 reach:3"').replace('name="dm-pts.speed" value="5"', 'name="dm-pts.speed" value="8"').replace('name="dm-pts.cost" value="3"', 'name="dm-pts.cost" value="8"');
    expect(findAnalysisIssues(lite(over)).errors.map(e => e.why).join(" ")).toMatch(/over the budget of 13/);
    const off = POINTS.replace('data-rec="speed:5', 'data-rec="speed:4').replace('name="dm-pts.speed" value="5"', 'name="dm-pts.speed" value="4"');
    expect(findAnalysisIssues(lite(off)).errors.map(e => e.why).join(" ")).toMatch(/not a step/);
  });
  test("warnings: picture count / media, compare above 3x3, chain steps, place slots, points count", () => {
    expect(kinds(lite(PICTURE.replace(radio("pic", "a", "Flat", false, "", svg), "")), "warnings")).toContain("picture-count");
    expect(kinds(lite(PICTURE.replace(svg, "")), "warnings")).toContain("picture-media");
    const four = COMPARE.replace("</div>\n  <textarea", `${col("cmp", "d", false)}</div>\n  <textarea`);
    expect(kinds(lite(four), "warnings")).toContain("compare-size");
    const wide = COMPARE.replace(cell("Cost", "3"), cell("Cost", "3") + cell("Risk", "4"));
    expect(kinds(lite(wide), "warnings")).toContain("compare-size");
    expect(kinds(lite(CHAIN.replace(/<ol data-opt-steps>.*?<\/ol>/, "")), "warnings")).toContain("chain-steps");
    expect(kinds(lite(PLACE.replace('data-slot-for="top"', 'data-slot-for="nowhere"')), "warnings")).toContain("place-slot");
    expect(kinds(lite(PLACE.replace(/<div data-place-sketch>[\s\S]*?<\/svg><\/div>/, "")), "warnings")).toContain("place-sketch");
    const one = dec("p1", "points", "a:5", `<div data-options>${pt("p1", "a", 5)}</div>`);
    expect(kinds(lite(one), "warnings")).toContain("points-count");
  });
});

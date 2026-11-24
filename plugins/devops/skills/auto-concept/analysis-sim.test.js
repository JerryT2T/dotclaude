import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { readTemplates } from "./templates-source.js";
import fixture from "../../scripts/build-concept-fixture.js";
import { findAnalysisIssues, simSpecProblem } from "../../hooks/lib/concept-gate-analysis.js";

// data-viz="sim" (templates-analysis.md § sim): live outputs and deltas, visible formulas, a whitelist
// formula parser that never executes anything, state in hidden dm-{simId}.{ctl} inputs, gate A14 / A15.

const md = readTemplates();
const blocks = fixture.scanBlocks(md);
const UI = blocks.find(b => /javascript|js/.test(b.info) && b.code.includes("window.conceptAnalysis = {")).code;
const fn = name => {
  const m = md.match(new RegExp("function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n\\}"));
  if (!m) throw new Error(name);
  return m[0];
};
const COLLECT = [fn("collectModeDecision"), fn("collectSimStates"), fn("collectModeDecisions")].join("\n");

const SPEC = {
  text: "Pips per component.",
  controls: [
    { id: "em", label: "EM", type: "steps", min: 0, max: 4, value: 2, group: "Pips" },
    { id: "cool", label: "Cooling", type: "steps", min: 0, max: 4, value: 2, group: "Pips" },
    { id: "boost", label: "Boost", type: "range", min: 0, max: 100, step: 5, value: 50 }
  ],
  consts: { base: 10 },
  outputs: [
    { id: "heat", label: "Heat", unit: "/s", formula: "base * (1 + em) - cool * 3", tags: ["HUD", "Overheat"] },
    { id: "dps", label: "Damage", unit: "DPS", formula: "heat * 2 + boost / 10" },
    { id: "ratio", label: "Ratio", formula: "heat / (cool - 2)" }
  ],
  bar: { output: "heat", max: 60, label: "Heat" },
  budget: { total: 6, controls: ["em", "cool"] }
};
const hiddens = (id = "pips", spec = SPEC) => spec.controls.map(c => `<input type="hidden" name="dm-${id}.${c.id}" value="${c.value}">`).join("");
const simEl = (spec = SPEC, attrs = 'data-sim="pips"') => `<div data-viz="sim" ${attrs} data-viz-spec='${JSON.stringify(spec).replace(/'/g, "&#39;")}'>fallback</div>`;

function page(html, { stored = {} } = {}) {
  const dom = new JSDOM(`<html lang="en"><body><section data-iteration="1" data-active>${html}</section><nav id="section-nav"></nav></body></html>`, {
    url: "http://localhost/concept.html", runScripts: "outside-only", pretendToBeVisual: true
  });
  const w = dom.window;
  w.setTimeout = () => 1;
  w.clearTimeout = () => {};
  w.HTMLElement.prototype.getClientRects = function () { return [{}]; };
  // A stand-in for the persistence layer's restoreState(): stored hidden values by name.
  w.restoreState = () => {
    w.document.querySelectorAll('input[type="hidden"]').forEach(i => { if (stored[i.name] !== undefined) i.value = stored[i.name]; });
  };
  w.eval(COLLECT);
  w.eval(UI);
  w.conceptAnalysis.init();
  w.conceptAnalysis.renderViz(w.document.body, "long");
  return { w, doc: w.document };
}
const tile = (doc, label) => [...doc.querySelectorAll(".an-sim-o")].find(t => t.querySelector(".an-sim-ol").textContent === label);
const val = (doc, label) => tile(doc, label).querySelector(".an-sim-ov").textContent;
const delta = (doc, label) => tile(doc, label).querySelector(".an-sim-od").textContent;
const pip = (doc, label, k) => doc.querySelector('.an-sim-pips[aria-label="' + label + '"] button[aria-label="' + label + ": " + k + '"]');
const hidden = (doc, name) => [...doc.querySelectorAll('input[type="hidden"]')].find(i => i.name === name);

describe("sim: live outputs", () => {
  test("renders controls, outputs, deltas and the visible formulas", () => {
    const { doc, w } = page(simEl());
    expect(typeof w.CONCEPT_VIZ.sim).toBe("function");
    expect(val(doc, "Heat")).toBe("24 /s");          // 10 * 3 - 2 * 3
    expect(delta(doc, "Heat")).toBe("");              // the defaults: no delta
    expect([...doc.querySelectorAll(".an-sim-f")].map(f => f.textContent)).toContain("heat = base * (1 + em) - cool * 3");
    expect([...tile(doc, "Heat").querySelectorAll(".an-sim-tag")].map(t => t.textContent)).toEqual(["HUD", "Overheat"]);
    expect(doc.querySelector(".an-sim-out").getAttribute("aria-live")).toBe("polite");
    expect(doc.querySelector(".an-sim-budget").textContent).toBe("Left: 2 of 6");
    expect(doc.querySelector(".an-sim-k").textContent).toBe("base = 10");
  });
  test("a pip click updates outputs, deltas, bar and budget at once", () => {
    const { doc } = page(simEl());
    pip(doc, "EM", 3).click();
    expect(val(doc, "Heat")).toBe("34 /s");
    expect(delta(doc, "Heat")).toBe("+10");
    expect(val(doc, "Damage")).toBe("73 DPS");        // heat is an earlier output
    expect(doc.querySelector(".an-sim-bh").textContent).toBe("Heat: 34 / 60");
    expect(doc.querySelector(".an-sim-bar .an-bar-t > i").style.width).toMatch(/^56[.]6/);
    expect(doc.querySelector(".an-sim-budget").textContent).toBe("Left: 1 of 6");
    expect(pip(doc, "EM", 3).getAttribute("aria-pressed")).toBe("true");
    pip(doc, "EM", 3).click();                         // the top pip again lowers by one
    expect(val(doc, "Heat")).toBe("24 /s");
  });
  test("a range input and the arrow keys change a value", () => {
    const { doc, w } = page(simEl());
    const r = doc.querySelector(".an-sim-range");
    r.value = "80";
    r.dispatchEvent(new w.Event("input", { bubbles: true }));
    expect(val(doc, "Damage")).toBe("56 DPS");
    doc.querySelector('.an-sim-pips[aria-label="Cooling"]').dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(hidden(doc, "dm-pips.cool").value).toBe("3");
  });
  test("steps count from min and carry no float noise", () => {
    const spec = { controls: [{ id: "a", type: "range", min: 1, max: 9, step: 2, value: 1 }, { id: "b", type: "range", min: 0, max: 1, step: 0.1, value: 0 }], outputs: [{ id: "o", formula: "a + b" }] };
    const { doc, w } = page(simEl(spec));
    const [a, b] = doc.querySelectorAll(".an-sim-range");
    for (const [r, v] of [[a, "3"], [b, "0.3"]]) { r.value = v; r.dispatchEvent(new w.Event("input", { bubbles: true })); }
    expect(hidden(doc, "dm-pips.a").value).toBe("3");
    expect(hidden(doc, "dm-pips.b").value).toBe("0.3");
  });
  test("the budget refuses a change over the total", () => {
    const { doc } = page(simEl());
    pip(doc, "EM", 4).click();                        // 4 + 2 = 6, exactly the budget
    expect(hidden(doc, "dm-pips.em").value).toBe("4");
    pip(doc, "Cooling", 3).click();                   // 7 > 6
    expect(hidden(doc, "dm-pips.cool").value).toBe("2");
    expect(doc.querySelector(".an-sim-flash").textContent).toBe("Budget used up");
  });
  test("division by zero and non-finite results show a dash", () => {
    const { doc } = page(simEl());
    expect(val(doc, "Ratio")).toBe("–");              // cool - 2 = 0
    pip(doc, "Cooling", 3).click();
    expect(val(doc, "Ratio")).not.toBe("–");
  });
});

describe("sim: formulas are data", () => {
  const compute = (formula, extra = {}) => {
    const { w } = page("");
    const spec = { controls: [{ id: "a", type: "steps", min: 0, max: 4, value: 2 }], outputs: [{ id: "o", formula }], ...extra };
    const m = w.CONCEPT_SIM.model(spec);
    return w.CONCEPT_SIM.compute(m, { a: 2 }).o;
  };
  test("arithmetic, precedence, functions", () => {
    expect(compute("1 + 2 * a")).toBe(5);
    expect(compute("-a ^ 2")).toBe(-4);
    expect(compute("2 ^ 3 ^ 2")).toBe(512);
    expect(compute("max(a, 5) + clamp(9, 0, a)")).toBe(7);
    expect(compute("a / 0")).toBeNull();
    expect(compute("sqrt(0 - a)")).toBeNull();
  });
  test.each([
    "constructor", "__proto__", "a.b", "a['x']", "toString()", "alert(1)", "Function('return 1')()", "a; a", "a = 1", "1e3 + a",
    "this", "window", "a ? 1 : 2", "[a]", "{}", "`x`", "max(", "(a", "a +", "min()", "clamp(a)", "o", "a".repeat(300)
  ])("%s is refused", formula => {
    const { w } = page("");
    w.__pwn = 0;
    const spec = { controls: [{ id: "a", type: "steps", min: 0, max: 4, value: 2 }], outputs: [{ id: "o", formula }] };
    expect(() => w.CONCEPT_SIM.model(spec)).toThrow();
    expect(w.__pwn).toBe(0);
  });
  test("a deep nesting and a reserved id are refused", () => {
    const { w } = page("");
    const spec = f => ({ controls: [{ id: "a", type: "steps", min: 0, max: 4, value: 2 }], outputs: [{ id: "o", formula: f }] });
    expect(() => w.CONCEPT_SIM.model(spec("(".repeat(30) + "a" + ")".repeat(30)))).toThrow();
    expect(() => w.CONCEPT_SIM.model({ controls: [{ id: "constructor", type: "steps", min: 0, max: 2, value: 1 }], outputs: [{ id: "o", formula: "1" }] })).toThrow();
    expect(() => w.CONCEPT_SIM.model({ controls: [{ id: "__proto__", type: "steps", min: 0, max: 2, value: 1 }], outputs: [{ id: "o", formula: "1" }] })).toThrow();
  });
  test("a spec outside the whitelist renders its text and never runs", () => {
    const spec = { text: "plain words", controls: [{ id: "a", type: "steps", min: 0, max: 4, value: 2 }], outputs: [{ id: "o", label: "O", formula: "constructor" }] };
    const { doc } = page(simEl(spec));
    expect(doc.querySelector(".an-sim")).toBeNull();
    expect(doc.querySelector('[data-viz="sim"]').textContent).toBe("plain words");
  });
  test("author text is never markup", () => {
    const spec = { ...SPEC, text: "<img src=x onerror=alert(1)>", controls: [{ ...SPEC.controls[0], label: "<b>EM</b>" }, ...SPEC.controls.slice(1)] };
    const { doc } = page(simEl(spec));
    expect(doc.querySelector(".an-sim img")).toBeNull();
    expect(doc.querySelector(".an-sim b:not(.an-sim-v):not(.an-sim-ov)")).toBeNull();
    expect(doc.querySelector(".an-sim-text").textContent).toContain("<img");
  });
});

describe("sim: state, persistence, payload", () => {
  test("the state is hidden dm-{simId}.{ctl} inputs on the round's section", () => {
    const { doc } = page(simEl());
    const sec = doc.querySelector("section[data-iteration]");
    for (const c of ["em", "cool", "boost"]) expect(hidden(doc, "dm-pips." + c).parentElement).toBe(sec);
    expect(hidden(doc, "dm-pips.em").value).toBe("2");
  });
  test("stored values come back after a reload", () => {
    const { doc } = page(simEl(), { stored: { "dm-pips.em": "4", "dm-pips.boost": "80" } });
    expect(val(doc, "Heat")).toBe("44 /s");
    expect(delta(doc, "Heat")).toBe("+20");
    expect(doc.querySelector(".an-sim-range").value).toBe("80");
  });
  test("a clone in a level slot reuses the same inputs: no duplicate state", () => {
    const html = `<div data-alevel="2" data-title="T"><div data-slot="long">${simEl()}</div></div><div id="col"></div>`;
    const { w, doc } = page(html);
    expect(doc.querySelectorAll(".an-sim")).toHaveLength(0);            // the authored source stays raw
    expect(doc.querySelectorAll('input[type="hidden"]')).toHaveLength(0);
    const col = doc.getElementById("col");
    for (let i = 0; i < 2; i++) {                                         // two clones (a stage opened twice)
      const c = doc.querySelector('[data-viz="sim"]').cloneNode(true);
      col.appendChild(c);
    }
    w.conceptAnalysis.renderViz(col, "long");
    expect(col.querySelectorAll(".an-sim")).toHaveLength(2);
    expect(doc.querySelectorAll('input[type="hidden"][name^="dm-pips."]')).toHaveLength(3);
    pip(doc, "EM", 3).click();                                            // first clone
    expect(col.querySelectorAll(".an-sim-ov")[0].textContent).toBe("34 /s");
    expect([...col.querySelectorAll(".an-sim")].map(s => s.querySelector(".an-sim-ov").textContent)).toEqual(["34 /s", "34 /s"]);
  });
  test("collectSimStates reports controls and outputs (and collectModeDecisions carries them)", () => {
    const { w, doc } = page(simEl());
    pip(doc, "EM", 3).click();
    const list = w.collectModeDecisions();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "pips", mode: "sim", untouched: false });
    expect(list[0].value.controls).toEqual({ em: 3, cool: 2, boost: 50 });
    expect(list[0].value.outputs.heat).toBe(34);
    expect(list[0].value.outputs.ratio).toBeNull();
  });
  test("a frozen round gets disabled controls", () => {
    const { doc } = page(`</section><section data-iteration="0" data-baked>${simEl(SPEC, 'data-sim="old"')}${hiddens("old").replace('value="2"', 'value="4"')}`);
    expect(doc.querySelector(".an-sim-pip").disabled).toBe(true);
    expect(doc.querySelector(".an-sim-range").disabled).toBe(true);
    expect(doc.querySelector(".an-sim-ov").textContent).toBe("44 /s");   // the baked em
  });
  test("a clone drawn before it is attached belongs to its source's round, not the live one", () => {
    const html = `</section><section data-iteration="0" data-baked><div data-alevel="2" data-title="T"><div data-slot="long">${simEl(SPEC, 'data-sim="old"')}</div></div>${hiddens("old").replace('value="2"', 'value="4"')}</section><section data-iteration="1" data-active>`;
    const { w, doc } = page(html);
    const c = doc.querySelector('[data-viz="sim"]').cloneNode(true);
    const box = doc.createElement("div");
    box.appendChild(c);
    w.conceptAnalysis.renderViz(box, "long");                          // detached, as the stage pane is
    doc.querySelector("section[data-baked]").appendChild(box);
    expect(box.querySelector(".an-sim-pip").disabled).toBe(true);
    expect(box.querySelector(".an-sim-ov").textContent).toBe("44 /s");
  });
});

describe("gate A14 / A15", () => {
  const wrap = (inner, attrs = "") => `<section data-iteration="1" data-iteration-template="decision" ${attrs}>${hiddens()}${inner}</section>`;
  const kinds = (html, level = "errors") => findAnalysisIssues(html)[level].map(i => i.kind);
  test("a sound sim passes", () => {
    expect(simSpecProblem("pips", JSON.stringify(SPEC))).toBeNull();
    expect(kinds(wrap(simEl(), 'data-topic-kind="mechanic"'))).toEqual([]);
    expect(kinds(wrap(simEl(), 'data-topic-kind="mechanic"'), "warnings")).toEqual([]);
  });
  test.each([
    ["bad JSON", html => html.replace("data-viz-spec='{", "data-viz-spec='{{")],
    ["no data-sim id", html => html.replace('data-sim="pips"', "")],
    ["a reserved sim id", html => html.replace('data-sim="pips"', 'data-sim="constructor"')],
    ["formula with an unknown id", html => html.replace("cool * 3", "nope * 3")],
    ["formula with a call outside the whitelist", html => html.replace("cool * 3", "eval(1)")],
    ["formula reading a later output", html => html.replace("base * (1 + em)", "dps")],
    ["no outputs", () => simEl({ ...SPEC, outputs: [] })]
  ])("fails: %s", (_n, mutate) => {
    expect(kinds(wrap(mutate(simEl())))).toContain("sim-spec");
  });
  test("fails: no controls / bad control and budget", () => {
    expect(simSpecProblem("s", JSON.stringify({ ...SPEC, controls: [] }))).toMatch(/inputs missing/);
    expect(simSpecProblem("s", JSON.stringify({ ...SPEC, controls: [{ id: "__proto__", type: "steps", min: 0, max: 2 }] }))).toMatch(/reserved/);
    expect(simSpecProblem("s", JSON.stringify({ ...SPEC, budget: { total: 3, controls: ["boost"] } }))).toMatch(/budget/);
    expect(simSpecProblem("s", JSON.stringify({ ...SPEC, bar: { output: "zzz" } }))).toMatch(/bar/);
  });
  test("works on a page with a sim and nothing else", () => {
    expect(kinds(simEl().replace("cool * 3", "x"))).toContain("sim-spec");
  });
  test("A15: a mechanic round without a sim, with 2 sims, or with more than 3 decisions warns", () => {
    expect(kinds(wrap("<p>text</p>", 'data-topic-kind="mechanic"'), "warnings")).toContain("mechanic-no-sim");
    expect(kinds(wrap(simEl() + simEl(SPEC, 'data-sim="two"'), 'data-topic-kind="mechanic"'), "warnings")).toContain("mechanic-sims");
    const d = i => `<div data-decision="d${i}" data-decision-mode="single" data-rec="a"><input type="radio" name="dm-d${i}" value="a" checked></div>`;
    expect(kinds(wrap(simEl() + [1, 2, 3, 4].map(d).join(""), 'data-topic-kind="mechanic"'), "warnings")).toContain("mechanic-decisions");
    expect(kinds(wrap(simEl() + [1, 2, 3].map(d).join(""), 'data-topic-kind="mechanic"'), "warnings")).not.toContain("mechanic-decisions");
  });
  test("A15: a sim without its hidden state inputs warns", () => {
    const bare = `<section data-iteration="1" data-iteration-template="decision">${simEl()}</section>`;
    expect(kinds(bare, "warnings")).toContain("sim-state-inputs");
    expect(kinds(bare)).toEqual([]);
  });
  test("a page without the stamp is not a mechanic round", () => {
    expect(kinds(wrap("<p>text</p>"), "warnings")).toEqual([]);
  });
  test("a sim id used in another round or by a decision, and a step below 0, fail", () => {
    const two = `<section data-iteration="1">${simEl()}</section><section data-iteration="2">${simEl()}</section>`;
    expect(kinds(two)).toContain("sim-spec");
    expect(kinds(`<section data-iteration="1">${simEl()}${hiddens()}</section>`)).not.toContain("sim-spec");
    expect(kinds(`<section data-iteration="1">${simEl()}<div data-decision="pips" data-decision-mode="points" data-rec="a"></div></section>`)).toContain("sim-spec");
    const bad = { ...SPEC, controls: SPEC.controls.map(c => (c.type === "range" ? { ...c, step: -1 } : c)) };
    expect(kinds(simEl(bad))).toContain("sim-spec");
  });
  test("the rule table names A14 and A15", () => {
    const gate = fs.readFileSync(path.join(__dirname, "deep-knowledge", "validation-gate.md"), "utf8");
    expect(gate).toMatch(/\| A14 \| \*\*fail\*\* \|/);
    expect(gate).toMatch(/\| A15 \| warn \|/);
  });
});

describe("sim: payload wiring", () => {
  test("the decision and free collectors append the sim entries; the final report names the mode", () => {
    expect(fn("collectDecisionDecisions")).toMatch(/decisions\.push\(\.\.\.collectSimStates\(active\)\)/);
    expect(fn("collectFreeDecisions")).toMatch(/decisions\.push\(\.\.\.collectSimStates\(active\)\)/);
    expect(md).toMatch(/mode: "sim"` \(a simulator/);
  });
});

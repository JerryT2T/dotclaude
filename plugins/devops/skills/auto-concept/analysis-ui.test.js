import { describe, test, expect } from "vitest";
import { JSDOM } from "jsdom";
import { readTemplates } from "./templates-source.js";
import fixture from "../../scripts/build-concept-fixture.js";

// Analysis UI (templates-analysis.md § Styling / Engine UI): the CONCEPT_VIZ
// palette, touched tracking (>= 3 s open writes dm-{id}-touched), the
// choreography counter, the keyboard flow, the order widget and the TOC state
// of mode decisions — all on jsdom with the engine's own code.

const md = readTemplates();
const blocks = fixture.scanBlocks(md);
const UI = blocks.find(b => /javascript|js/.test(b.info) && b.code.includes("window.conceptAnalysis = {")).code;
const CSS = blocks.find(b => b.info === "css" && b.code.includes("--an-bg")).code;
const fn = name => {
  const m = md.match(new RegExp("function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n\\}"));
  if (!m) throw new Error(name);
  return m[0];
};
const COLLECT = [fn("collectModeDecision"), fn("collectModeDecisions")].join("\n");

const opt = (id, v, label, checked) => `<label data-opt="${v}"><input type="radio" name="dm-${id}" value="${v}"${checked ? " checked" : ""}><span data-opt-label>${label}</span><span data-opt-consequence>${label} follows</span></label>`;
const tail = id => `<textarea data-comment="${id}-note"></textarea><input type="hidden" name="dm-${id}-touched" value=""><input type="hidden" name="dm-${id}-issue" value=""><input type="hidden" name="dm-${id}-epic" value="">`;
const l3 = t => `<div data-alevel="3" data-title="${t}"><div data-slot="short"><p>s</p></div><div data-slot="long"><p>l</p></div></div>`;
const decision = (id, mode, rec, inner, extra = "") =>
  `<section id="${id}" data-nav-label="${id}" data-decision="${id}" data-decision-mode="${mode}" data-label="L-${id}" data-rec="${rec}" data-rec-why="because" ${extra}><h3 data-question>Q ${id}?</h3><div data-options>${inner}</div>${tail(id)}${l3("T-" + id)}</section>`;
const LITE = `<section data-analysis="lite" data-nav-label="Lite" id="lite">
  <div data-alevel="1" data-title="Overall"><div data-slot="short"><p>x</p></div><div data-slot="long"><p>y</p></div></div>
  ${decision("q1", "single", "a", opt("q1", "a", "Alpha", true) + opt("q1", "b", "Beta"))}
  ${decision("q2", "order", "x,y", '<div data-opt="x"><span data-opt-label>X</span></div><div data-opt="y"><span data-opt-label>Y</span></div>').replace("</div>" + tail("q2"), '</div><input type="hidden" name="dm-q2" value="x,y">' + tail("q2"))}
</section>`;

function page(html, { lang = "en", store = {} } = {}) {
  const dom = new JSDOM(`<html lang="${lang}"><body>${html}<nav id="section-nav"></nav></body></html>`, {
    url: "http://localhost/concept.html", runScripts: "outside-only", pretendToBeVisual: true
  });
  const w = dom.window;
  const timers = [];
  w.setTimeout = (f, ms) => { timers.push({ f, ms }); return timers.length; };
  w.clearTimeout = () => {};
  Object.entries(store).forEach(([k, v]) => w.localStorage.setItem(k, v));
  w.HTMLElement.prototype.getClientRects = function () { return [{}]; };   // "visible"
  w.eval(COLLECT);
  w.eval(UI);
  w.conceptAnalysis.init();
  return { w, timers, ca: w.conceptAnalysis, doc: w.document };
}

describe("CONCEPT_VIZ palette", () => {
  const draw = (type, spec, size) => {
    const { w, ca, doc } = page('<div id="host"></div>');
    const el = doc.createElement("div");
    el.setAttribute("data-viz", type);
    el.setAttribute("data-viz-spec", typeof spec === "string" ? spec : JSON.stringify(spec));
    el.textContent = "authored fallback";
    doc.body.appendChild(el);
    ca.renderViz(doc.body, size || "long");
    return { el, w };
  };
  test("registers the eight core types", () => {
    const { w } = page("");
    for (const t of ["text", "kpi", "bar", "bars", "spark", "donut", "compare", "flow"]) expect(typeof w.CONCEPT_VIZ[t], t).toBe("function");
  });
  test("every core type renders from its spec", () => {
    expect(draw("kpi", { value: "51 M", unit: "Tokens", delta: "-12 %" }).el.querySelector(".an-kpi-v").textContent).toBe("51 M");
    expect(draw("bar", { value: 80, max: 100, unit: "%", label: "hits" }).el.querySelector(".an-bar-t > i").style.width).toBe("80%");
    expect(draw("bars", { items: [{ label: "A", value: 30 }, { label: "B", value: 15 }], unit: "M" }).el.querySelectorAll(".an-bars > div")).toHaveLength(2);
    expect(draw("bars", { items: [1, 2, 3, 4, 5].map(i => ({ label: "i" + i, value: i })) }, "short").el.querySelectorAll(".an-bars > div")).toHaveLength(3);
    expect(draw("spark", { points: [3, 5, 4, 8], label: "tokens" }).el.querySelector("svg path")).not.toBeNull();
    expect(draw("donut", { parts: [{ label: "a", value: 60 }, { label: "b", value: 40 }] }).el.querySelectorAll("li")).toHaveLength(2);
    expect(draw("compare", { before: { label: "was", value: 10 }, after: { label: "now", value: 4 }, unit: "s" }).el.querySelector(".an-cmp-d").textContent).toBe("-60 %");
    expect(draw("flow", { steps: [{ label: "a", value: "1" }, { label: "b" }] }).el.querySelectorAll(".an-flow > span")).toHaveLength(2);
    expect(draw("text", { text: "one\n- two\n- three" }).el.querySelectorAll("li")).toHaveLength(2);
  });
  test("unknown type renders spec.text; an unparsable spec keeps the authored text", () => {
    const kept = draw("hologram", { text: "plain words" }).el;
    expect(kept.textContent).toBe("authored fallback");   // non-empty custom markup is left alone
    const { w, ca, doc } = page("");
    const bare = doc.createElement("div");
    bare.setAttribute("data-viz", "hologram");
    bare.setAttribute("data-viz-spec", '{"text":"plain words"}');
    doc.body.appendChild(bare);
    ca.renderViz(doc.body);
    expect(bare.textContent).toBe("plain words");
    expect(w.CONCEPT_VIZ.hologram).toBeUndefined();
    expect(draw("kpi", "{not json").el.textContent).toBe("authored fallback");
  });
  test("spec values are escaped", () => {
    const { el } = draw("kpi", { value: "<img src=x onerror=alert(1)>" });
    expect(el.querySelector("img")).toBeNull();
  });
});

describe("touched tracking", () => {
  test("a stage open for 3 s writes dm-{id}-touched = 1 and fires change", () => {
    const { doc, ca, timers } = page(LITE);
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.kind === "dec"));
    const c = doc.querySelector('[name="dm-q1-touched"]');
    expect(c.value).toBe("");
    let changes = 0;
    c.addEventListener("change", () => changes++);
    const t = timers.filter(x => x.ms === ca.TOUCH_MS).pop();
    expect(t).toBeTruthy();
    t.f();
    expect(c.value).toBe("1");
    expect(changes).toBe(1);
    expect(doc.defaultView.collectModeDecision(doc.querySelector("#q1")).untouched).toBe(false);
  });
  test("a change in the stage touches it at once; leaving early leaves it untouched", () => {
    const { doc, ca } = page(LITE);
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.kind === "dec"));
    expect(doc.querySelector('[name="dm-q2-touched"]').value).toBe("");
    const b = doc.querySelector('input[name="dm-q1"][value="b"]');
    b.checked = true;
    b.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    expect(doc.querySelector('[name="dm-q1-touched"]').value).toBe("1");
    ca.step(inst, 1);
    expect(doc.querySelector('[name="dm-q2-touched"]').value).toBe("");
  });
  test("no timer for a baked (frozen) round", () => {
    const { ca, timers } = page('<div data-baked>' + LITE + "</div>");
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.kind === "dec"));
    expect(timers.filter(x => x.ms === ca.TOUCH_MS)).toHaveLength(0);
  });
});

describe("first visit animates, later visits are instant", () => {
  test("a stage gets .an-first on its first visit only", () => {
    const { ca } = page(LITE);
    const inst = ca.instances[0];
    const q2 = inst.stages.findIndex(s => s.el.id === "q2");
    ca.go(inst, q2);
    expect(inst.stages[q2].el.classList.contains("an-first")).toBe(true);
    ca.go(inst, 0);
    expect(inst.stages[q2].el.classList.contains("an-first")).toBe(false);
    ca.go(inst, q2);
    expect(inst.stages[q2].el.classList.contains("an-first")).toBe(false);
  });
  test("the messages enter one by one (2.7 s apart); a waiting message takes no room; reduced motion switches every animation off", () => {
    const { ca, timers } = page(FULL);
    const inst = ca.instances[0];
    const i = inst.stages.findIndex(s => s.el.id === "a1");
    ca.go(inst, i);
    const el = inst.stages[i].el, part = c => el.querySelector(":scope > " + c);
    expect(part(".an-m-find").classList.contains("an-enter")).toBe(true);
    expect(part(".an-m-q").classList.contains("an-wait")).toBe(true);
    expect(part(".an-m-a").classList.contains("an-wait")).toBe(true);
    expect(inst.peekDn.classList.contains("an-wait")).toBe(true);
    timers.filter(t => t.ms === 2700).pop().f();
    expect(part(".an-m-q").classList.contains("an-wait")).toBe(false);
    expect(part(".an-m-a").classList.contains("an-wait")).toBe(true);
    timers.filter(t => t.ms === 5400).pop().f();
    expect(part(".an-m-a").classList.contains("an-enter")).toBe(true);
    expect(inst.peekDn.classList.contains("an-wait")).toBe(false);
    // Leaving mid-sequence shows everything at once on the way back.
    ca.go(inst, i + 1);
    ca.go(inst, i);
    expect(el.querySelectorAll(".an-wait, .an-enter")).toHaveLength(0);
    expect(CSS).toMatch(/\.an-wait \{ display: none !important; \}/);
    expect(CSS).toMatch(/\.an-enter \{ animation: an-in 1\.35s/);
    expect(CSS).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  });
  test("user scroll wins: a wheel / touch in the chat stops the auto-scroll until the next stage", () => {
    const { w, ca } = page(FULL);
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.el.id === "a1"));
    expect(inst.userScroll).toBe(false);
    inst.chat.dispatchEvent(new w.Event("wheel"));
    expect(inst.userScroll).toBe(true);
    inst.chat.scrollTop = 0;
    ca.go(inst, inst.stages.findIndex(s => s.el.id === "a2"));
    expect(inst.userScroll).toBe(false);
    inst.chat.dispatchEvent(new w.Event("touchmove"));
    expect(inst.userScroll).toBe(true);
  });
  test("UX review: only the open question owns the composer placeholder; a focused stage draws no frame; picture / compare / place rows line up", () => {
    const { ca, doc } = page(FULL);
    const inst = ca.instances[0];
    const a1 = inst.stages.findIndex(s => s.el.id === "a1");
    ca.go(inst, a1);
    doc.getElementById("a1").querySelector(".an-none").click();
    expect(inst.comp.ed.dataset.ph).toMatch(/no option fits/);
    ca.go(inst, a1 + 1);
    expect(inst.comp.ed.dataset.ph).toMatch(/optional/);
    ca.go(inst, a1);
    expect(inst.comp.ed.dataset.ph).toMatch(/no option fits/);
    ca.go(inst, 0);
    expect(inst.comp.ed.dataset.ph).toMatch(/optional/);
    expect(CSS).toMatch(/\[data-analysis\] \.an-stage:focus-visible \{ outline: none; \}/);
    expect(CSS).toMatch(/\[data-opt\]:not\(:has\(\[data-opt-preview\]\)\) \{ grid-template-columns: 22px minmax\(0, 1fr\); \}/);
    expect(CSS).toMatch(/decision-mode="compare"\] \[data-opt\] \{[^}]*align-items: stretch;/);
    expect(CSS).toMatch(/decision-mode="picture"\] \[data-opt\] \{[^}]*align-content: start;/);
  });
  test("the chat never scrolls sideways: the briefing glow stays inside the column", () => {
    expect(CSS).toMatch(/\.an-chat \{[^}]*overflow-x: hidden;[^}]*scrollbar-gutter: stable both-edges;/);
    expect(CSS).not.toMatch(/inset: -\d+px -\d+px/);
  });
});

describe("keyboard and widgets", () => {
  test("Enter / Shift+Enter walk the stages", () => {
    const { w, doc, ca } = page(LITE);
    const inst = ca.instances[0];
    const stage = inst.stages[inst.idx].el;
    const press = (key, shiftKey) => stage.dispatchEvent(new w.KeyboardEvent("keydown", { key, shiftKey: !!shiftKey, bubbles: true, cancelable: true }));
    expect(inst.stages[inst.idx].el.id).toBe("q1");             // Lite opens on its first question
    press("2");                                                  // option 2 of the focused decision
    expect(doc.querySelector('input[name="dm-q1"][value="b"]').checked).toBe(true);
    press("Enter");
    expect(inst.stages[inst.idx].el.id).toBe("q2");
    inst.stages[inst.idx].el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
    expect(inst.stages[inst.idx].el.id).toBe("q1");
  });
  test("the recommended option is badged, preselected and carries its reason", () => {
    const { doc } = page(LITE);
    const o = doc.querySelector('[data-decision="q1"] [data-opt="a"]');
    expect(o.querySelector("input").checked).toBe(true);
    expect(o.querySelector(".an-badge").getAttribute("data-tip")).toContain("because");
    expect(o.getAttribute("data-tip-key")).toBe("1");
  });
  test("ONE note field per decision and the issue link writes the named controls", () => {
    const { doc, ca } = page(LITE);
    const q1 = doc.querySelector("#q1");
    expect(q1.querySelectorAll("textarea")).toHaveLength(1);
    const link = [...q1.querySelectorAll("button.an-link")].find(b => /issue/i.test(b.textContent));
    link.click();
    expect(doc.querySelector('[name="dm-q1-issue"]').value).toBe("1");
    const epic = q1.querySelector(".an-epic");
    epic.value = "Perf";
    epic.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    expect(doc.querySelector('[name="dm-q1-epic"]').value).toBe("Perf");
    expect(ca.instances[0].decs.length).toBe(2);
  });
  test("the order widget renders from the hidden control and writes it back", () => {
    const { doc } = page(LITE);
    const items = () => [...doc.querySelectorAll("#q2 .an-oi")].map(li => li.dataset.id);
    expect(items()).toEqual(["x", "y"]);
    doc.querySelector("#q2 .an-oi .an-ob button:last-child").click();   // move x down
    expect(doc.querySelector('[name="dm-q2"]').value).toBe("y,x");
    expect(items()).toEqual(["y", "x"]);
    expect(doc.defaultView.collectModeDecision(doc.querySelector("#q2")).value).toEqual(["y", "x"]);
  });
});

describe("section nav state for mode decisions", () => {
  test("shows open / decided / issue dots instead of include / discard", () => {
    const { w, doc } = page(LITE);
    w.eval(fn("updateSectionNavState"));
    const nav = doc.getElementById("section-nav");
    nav.innerHTML = '<a class="section-nav-item" data-variant data-section-id="q1"><span class="section-nav-state"></span></a>';
    const state = () => nav.querySelector(".section-nav-state");
    w.updateSectionNavState();
    expect(state().className).toBe("section-nav-state state-open");
    expect(state().textContent).toContain("○");
    doc.querySelector('[name="dm-q1-touched"]').value = "1";
    w.updateSectionNavState();
    expect(state().className).toBe("section-nav-state state-decided");
    doc.querySelector('[name="dm-q1-issue"]').value = "1";
    w.updateSectionNavState();
    expect(state().className).toBe("section-nav-state state-issue");
  });
});

describe("palette and stage CSS", () => {
  test("every analysis rule is namespaced; topic colours avoid red / green / orange", () => {
    const css = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...css.matchAll(/(?:^|[};])\s*([^{};@]+)\{/g)].map(m => m[1].trim()).filter(s => s && !/^(from|to|\d+%)/.test(s));
    const splitTop = s => { const out = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && !d) { out.push(cur.trim()); cur = ""; } else cur += ch; } out.push(cur.trim()); return out; };
    const offenders = rules.flatMap(splitTop).filter(s => s && !/(\.an-|data-analysis|\.section-nav-state|\[data-viz\]|section\[data-view\])/.test(s));
    expect(offenders.filter(s => !/^\.(app-|panel|concept|feedback)/.test(s) || true)).toEqual([]);
    const colors = UI.match(/const TOPIC_COLORS = \[([^\]]+)\]/)[1].match(/#[0-9a-f]{6}/gi);
    for (const hex of colors) {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      const hue = (() => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h; })();
      expect((hue >= 45 && hue <= 80) || (hue >= 160 && hue <= 200) || (hue >= 290 && hue <= 345), hex + " hue " + Math.round(hue)).toBe(true);   // not red, orange, green, blue, the note purple
    }
  });
  test("the design view kind analysis is styled and the engine stays one instance per root", () => {
    expect(CSS).toContain('section[data-view][data-view-kind="analysis"]');
    const { ca, doc } = page(LITE);
    ca.init(doc);
    expect(ca.instances).toHaveLength(1);
  });
});

// Full round fitted to the viewport (user notes, Kleingarten concept round 1):
// no page scroll, a one-line stepper that only expands the active topic, the
// bar at one spot on every stage, the note full width above it with the 📎
// inside, lists as overviews.
const FULL = `<section data-iteration="1" data-iteration-template="decision" data-analysis="full" id="iter-1">
  <div class="iteration-intro"><h2>Etappe A · Rules</h2><p>Why this round.</p></div>
  <section id="briefing" data-analysis-briefing data-nav-label="Briefing">
    <p data-briefing-what>What was found.</p><p data-briefing-why>Why now.</p>
    <div data-briefing-potential data-viz="kpi" data-viz-spec='{"value":"1"}'>1</div>
    <a data-briefing-topic="t1" data-share="60">One</a><a data-briefing-topic="t2" data-share="40">Two</a>
    <p data-briefing-duration>≈ 3 min</p>
    <div data-alevel="1" data-title="Briefing"><div data-slot="short"><p>s</p></div><div data-slot="long"><p>l</p></div></div>
  </section>
  <section id="t1" data-topic data-nav-label="One">
    <div data-alevel="2" data-title="One"><div data-slot="short"><p>s</p></div><div data-slot="long"><p>l</p></div></div>
    ${decision("a1", "single", "x", opt("a1", "x", "Ex", true) + opt("a1", "y", "Why"))}
    ${decision("a2", "single", "x", opt("a2", "x", "Ex", true) + opt("a2", "y", "Why"))}
  </section>
  <section id="t2" data-topic data-nav-label="Two">
    <div data-alevel="2" data-title="Two"><div data-slot="short"><p>s</p></div><div data-slot="long"><p>l</p></div></div>
    ${decision("b1", "single", "x", opt("b1", "x", "Ex", true) + opt("b1", "y", "Why"))}
  </section>
</section>`;

describe("chat flow Full round", () => {
  const withExample = FULL.replace('<div data-alevel="3" data-title="T-a1"><div data-slot="short"><p>s</p></div><div data-slot="long"><p>l</p></div></div>',
    '<div data-alevel="3" data-title="T-a1"><div data-slot="short"><p>s</p></div><div data-slot="long"><p>l</p></div><div data-example><pre>real excerpt</pre></div></div>');
  test("a decision stage is three messages: finding, question (min height, never clipped), answer block (capped)", () => {
    const { doc } = page(FULL);
    const d = doc.getElementById("a1");
    expect([...d.children].slice(0, 3).map(c => c.classList.contains("an-m-find") ? "find" : c.classList.contains("an-m-q") ? "q" : c.classList.contains("an-m-a") ? "a" : "?")).toEqual(["find", "q", "a"]);
    expect(d.querySelector(".an-m-q [data-question]")).toBeTruthy();
    expect(d.querySelector(".an-m-a .an-ans [data-options]")).toBeTruthy();
    expect(d.querySelector(".an-av").getAttribute("data-tip")).toBe("devops");
    expect(CSS).toMatch(/\.an-qb \{ min-height: 92px;/);
    expect(CSS).not.toMatch(/\.an-qb \{[^}]*overflow: hidden/);
    expect(CSS).not.toMatch(/\[data-stakes\] \{[^}]*text-overflow: ellipsis/);
    expect(CSS).toMatch(/\.an-ans \{ padding: 8px;/);
    expect(CSS).toMatch(/\.an-enh \{[^}]*max-width: 780px/);
  });
  test("tabs Befund / Beispiel only with a [data-example]; switching shows the other pane and dips the messages below", () => {
    const { doc, timers } = page(withExample);
    const d = doc.getElementById("a1");
    const tabs = [...d.querySelectorAll(".an-tab")];
    expect(tabs.map(t => t.dataset.tab)).toEqual(["find", "ex"]);
    expect(doc.getElementById("a2").querySelector(".an-tab")).toBeNull();
    expect(d.querySelector(".an-p-ex").hidden).toBe(true);
    tabs[1].click();
    expect(d.querySelector(".an-p-ex").hidden).toBe(false);
    expect(d.querySelector(".an-p-find").hidden).toBe(true);
    expect(d.querySelector(".an-p-ex").textContent).toContain("real excerpt");
    expect(d.querySelector(".an-m-q").classList.contains("an-dip")).toBe(true);
    timers.filter(t => t.ms === 220).forEach(t => t.f());
    expect(d.querySelector(".an-m-q").classList.contains("an-dip")).toBe(false);
  });
  test("spec.hl pulses once on the first visit", () => {
    const L3 = '<div data-alevel="3" data-title="T-a1"><div data-slot="short"><p>s</p></div><div data-slot="long"><p>l</p></div></div>';
    const hl = FULL.replace(L3, '<div data-alevel="3" data-title="T-a1"><div data-slot="short"><p>s</p></div><div data-slot="long"><div data-viz="bars" data-viz-spec=\'{"items":[{"label":"A","value":3},{"label":"B","value":9}],"hl":"B"}\'></div></div></div>');
    const { doc, ca, timers } = page(hl);
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.el.id === "a1"));
    timers.filter(t => t.ms === 1650).forEach(t => t.f());
    expect(doc.querySelectorAll("#a1 .an-bars.an-hl .an-on .an-bar-t > i.an-pulse")).toHaveLength(1);
    expect(CSS).toMatch(/\.an-pulse \{ animation: an-pulse 1\.1s ease-in-out 1; \}/);
  });
  test("the briefing: eyebrow, huge number, claim, top-3 cards, CTA row with the centred button", () => {
    const { ca } = page(FULL);
    const inst = ca.instances[0];
    expect(inst.brief.querySelector(":scope > .an-eyebrow")).toBeTruthy();
    expect(inst.brief.querySelectorAll(".an-chips > [data-briefing-topic]")).toHaveLength(2);
    expect(inst.brief.querySelector(".an-chips > [data-briefing-topic]").style.getPropertyValue("--bc")).toBe("#a5d6ff");
    const foot = inst.root.querySelector(".an-foot-brief");
    expect(foot.querySelector(".an-back")).toBeNull();
    expect([...foot.querySelectorAll(".an-cta-s")].map(s => s.textContent)).toEqual(["3 questions", "≈ 3 min"]);
    const next = foot.querySelector(".an-btn");
    expect(next.textContent).toMatch(/Let's go/);
    next.click();
    expect(inst.stages[inst.idx].kind).toBe("topic");
    expect(CSS).toMatch(/\.an-foot-brief \{ display: grid; grid-template-columns: 1fr auto 1fr;/);
  });
  test("the topic page: Thema n von N, title, ring with the share, numbered questions", () => {
    const { ca } = page(FULL);
    const inst = ca.instances[0];
    ca.go(inst, 1);
    const el = inst.stages[1].el;
    expect(el.querySelector(".an-meta").textContent).toBe("Topic 1 of 2");
    expect(el.querySelector(".an-ring").style.getPropertyValue("--p")).toBe("60%");
    expect(el.querySelectorAll(".an-tqi")).toHaveLength(2);
    expect(el.querySelector(".an-tqi").dataset.go).toBe(String(inst.stages.findIndex(s => s.el.id === "a1")));
  });
  test("the note textarea stays the storage target (hidden, 📎 bar beside it); the composer writes into it", () => {
    const html = FULL.replace('<textarea data-comment="a1-note"></textarea>',
      '<textarea data-comment="a1-note" data-attachable></textarea><div class="attach-bar" data-attach-for="a1-note"><button class="attach-btn">📎</button></div>');
    const { doc, ca } = page(html);
    const inst = ca.instances[0];
    const note = doc.querySelector("#a1 textarea[data-comment='a1-note']");
    expect(note.classList.contains("an-vh")).toBe(true);
    expect(note.nextElementSibling.matches('.attach-bar[data-attach-for="a1-note"]')).toBe(true);
    ca.go(inst, inst.stages.findIndex(s => s.el.id === "a1"));
    inst.comp.ed.textContent = "my note";
    inst.comp.ed.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    expect(note.value).toBe("my note");
    expect(inst.comp.att.hidden).toBe(false);
  });
  test("the rail: one 24 px row per stage, a lead-in per group, THEMA prefix on topics, a click goes to the stage, clear of the FABs", () => {
    const { ca } = page(FULL);
    const inst = ca.instances[0];
    const items = [...inst.stepEl.querySelectorAll(".an-ri")];
    expect(items).toHaveLength(inst.stages.length);
    expect(items.map(i => i.textContent)).toEqual(["Briefing", "TopicOne", "L-a1", "L-a2", "TopicTwo", "L-b1", "Closing"]);
    expect(items[1].querySelector("b").textContent).toBe("Topic");
    items[5].click();
    expect(inst.stages[inst.idx].el.id).toBe("b1");
    expect(inst.stepEl.querySelector(".an-here").dataset.go).toBe(String(inst.idx));
    expect(CSS).toMatch(/\.an-rail \{ display: flex; flex-direction: column; padding: 24px 0; position: fixed; right: 22px; top: 96px; bottom: 96px;/);
    expect(CSS).toMatch(/\.an-ri \{[^}]*height: 24px;/);
    expect(CSS).toMatch(/\.an-ri\.an-ri-gs \{ height: 40px; padding-top: 16px; \}/);
    expect(items.filter(i => i.classList.contains("an-ri-gs")).map(i => i.textContent)).toEqual(["TopicOne", "TopicTwo", "Closing"]);
    expect(CSS).not.toMatch(/\n\.an-ri(?![a-z-])[^{\n]*\{[^}\n]*(?<![-a-z])transform:/);
  });
  test("only the next stage peeks in (below); no faded previous-stage peek above", () => {
    const { ca } = page(FULL);
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.el.id === "a2"));
    expect(inst.root.querySelector(".an-peek-up")).toBeNull();
    expect(inst.peekDn.textContent).toBe("Next: Two");
  });
  test("the closing lists every question with a dwell bar and a Nachschärfen toggle", () => {
    const { ca } = page(FULL);
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.kind === "review"));
    const rows = inst.stages[inst.idx].el.querySelectorAll(".an-sigrow");
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector(".an-dw")).toBeTruthy();
    const tg = rows[0].querySelector(".an-tg");
    expect(tg.getAttribute("aria-pressed")).toBe("false");
    tg.click();
    expect(inst.stages[inst.idx].el.querySelector(".an-tg").getAttribute("aria-pressed")).toBe("true");
    expect(inst.comp.ed.querySelector(".an-tagw").textContent).toContain("L-a1");
    expect(JSON.parse(inst.root.querySelector('[name="dm-a1-hes"]').value).sharpen).toBe(true);
    // The toggle updates in place (no re-render, no flicker).
    expect(inst.stages[inst.idx].el.querySelectorAll(".an-sigrow")[0]).toBe(rows[0]);
  });
  test("the closing opens with a devops message (no count, no eyebrow, no deviation line) and ends in the panel's journey buttons", () => {
    const { ca } = page(FULL);
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.kind === "review"));
    const el = inst.stages[inst.idx].el;
    expect(el.querySelector(".an-big, .an-claim, .an-eyebrow")).toBeNull();
    const m = el.querySelector(".an-close > .an-msg.an-m-close");
    expect(m.querySelector(".an-meta").textContent).toBe("Closing");
    expect(m.compareDocumentPosition(el.querySelector(".an-sig")) & 4).toBeTruthy();   // the message comes before the list
    const fabs = [...el.querySelectorAll(".an-go .an-fabs .an-fab")];
    expect(fabs.map(b => b.className)).toEqual(["an-fab an-fab-main", "an-fab an-fab-impl"]);
    expect(fabs[0].textContent).toBe("👉 To the next round");
    expect(fabs[1].querySelector(".an-fab-l b").textContent).toBe("Implement now");
    expect(fabs[1].querySelector(".an-fab-l small").textContent).toBe("no further round");
    expect(CSS).toMatch(/\.an-fab \{[^}]*height: 48px;/);
  });
  test("the first stage shows no back control; from the second on it is visible (#962)", () => {
    const seen = { hidden: 0, shown: 0 };
    [LITE, FULL].forEach((html) => {
      const { ca } = page(html);
      const inst = ca.instances[0];
      const order = inst.stages.map((s, i) => [s, i]).sort((a, b) => inst.seq.indexOf(a[0]) - inst.seq.indexOf(b[0]));
      [...order, order[0]].forEach(([s, i]) => {
        ca.go(inst, i);
        const back = s.el && s.el.querySelector(".an-back");
        if (!back) return;
        const first = s === inst.seq[0];
        expect(back.style.visibility, s.kind).toBe(first ? "hidden" : "");
        expect(back.disabled, s.kind).toBe(first);
        seen[first ? "hidden" : "shown"]++;
      });
    });
    expect(seen.hidden).toBeGreaterThan(0);
    expect(seen.shown).toBeGreaterThan(0);
    expect(CSS).toMatch(/\.an-back\[disabled\] \{ visibility: hidden;/);
  });
});

describe("Keine passt and the finding message", () => {
  test("the none link clears the pick, writes dm-{id}-none and the payload says none", () => {
    const { w, doc } = page(LITE);
    const d = doc.getElementById("q1");
    const none = d.querySelector(".an-none");
    expect(none).toBeTruthy();
    none.click();
    expect(d.querySelector('input[name="dm-q1-none"]').value).toBe("1");
    expect([...d.querySelectorAll('input[name="dm-q1"]')].some(r => r.checked)).toBe(false);
    const e = w.collectModeDecision(d);
    expect(e.none).toBe(true);
    expect(e.deviates).toBe(true);
    const a = d.querySelector('input[name="dm-q1"][value="a"]');
    a.checked = true;
    a.dispatchEvent(new w.Event("change", { bubbles: true }));
    expect(d.querySelector('input[name="dm-q1-none"]').value).toBe("");
  });
  test("Lite opens on its first question in the same chat flow; no Bezug panel, no start stage", () => {
    const { doc } = page(LITE);
    expect(doc.querySelector(".an-start")).toBeNull();
    expect(doc.querySelector(".an-ana")).toBeNull();
    expect(doc.querySelectorAll("#q1 .an-m-find").length).toBe(1);
  });
});

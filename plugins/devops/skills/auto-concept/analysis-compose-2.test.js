import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { readTemplates } from "./templates-source.js";
import fixture from "../../scripts/build-concept-fixture.js";

// The analysis chat, round 3: a visible "you are here" on the collapsed rail, messages of earlier questions
// edited in place, and attachments pasted / dropped into the composer as a floating thumbnail strip.

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

describe("you are here on the rail", () => {
  test("the collapsed rail carries a tag outside the clipped rail, hides it when the rail expands, and the expanded row is highlighted", () => {
    expect(CSS).toMatch(/\.an-here-tag \{ position: fixed;/);
    expect(CSS).toMatch(/\[data-analysis\]:has\(> \.an-rail:hover\) > \.an-here-tag, \[data-analysis\]:has\(> \.an-rail:focus-within\) > \.an-here-tag \{ opacity: 0; \}/);
    expect(CSS).toMatch(/\.an-rail:hover \.an-ri\.an-here, \.an-rail:focus-within \.an-ri\.an-here \{[^}]*background: color-mix/);
    expect(CSS).toMatch(/\.an-rail, \.an-here-tag \{ display: none; \}/);   // narrow: the rail is gone, the tag with it
    expect(CSS).toMatch(/\.an-dot\.an-cur \{/);                                // the quick variant's dots are styled, the open one stands out
  });
  test("the tag names the open stage and sits level with its row, clamped to the rail's ends", () => {
    const { w, doc, ca } = page(FULL);
    const inst = ca.instances[0];
    let rowTop = 300;
    w.HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains("an-rail")) return { top: 100, bottom: 500, height: 400 };
      if (this.classList.contains("an-ri")) return { top: this.classList.contains("an-here") ? rowTop : 0, bottom: rowTop + 24, height: 24 };
      return { top: 0, bottom: 0, height: 0 };
    };
    const tag = inst.root.querySelector(":scope > .an-here-tag");
    expect(tag).not.toBeNull();
    expect(tag.nextElementSibling).toBe(inst.stepEl);     // right before the rail, which stays the last child
    ca.go(inst, inst.stages.findIndex(s => s.el.id === "a2"));
    expect(tag.textContent).toBe("Question 2");
    expect(tag.hidden).toBe(false);
    expect(tag.style.top).toBe("312px");
    expect(tag.getAttribute("aria-hidden")).toBe("true");
    rowTop = 10;                                          // scrolled out of the rail: the tag stays at its edge
    ca.go(inst, 0);
    expect(tag.textContent).toBe("Briefing");
    expect(tag.style.top).toBe("112px");
    expect(doc.querySelectorAll(".an-here-tag")).toHaveLength(1);
  });
});

describe("messages of earlier questions", () => {
  const setup2 = () => {
    const p = page(LITE);
    const inst = p.ca.instances[0];
    const b = p.doc.querySelector('input[name="dm-q1"][value="b"]');
    b.checked = true; b.dispatchEvent(new p.w.Event("change", { bubbles: true }));
    send(p.w, p.ca, inst, "alpha");
    send(p.w, p.ca, inst, "beta");
    p.ca.go(inst, 1);
    return { ...p, inst, store: p.doc.querySelector("#q1 .an-note"), rows: () => [...p.doc.querySelectorAll("#q1 .an-m-me .an-note-m")] };
  };
  test("each message is its own bubble with pen and x, the answer is a bubble of its own", () => {
    const { doc, rows } = setup2();
    expect(doc.querySelector("#q1").classList.contains("an-past")).toBe(true);
    expect(doc.querySelectorAll("#q1 .an-m-me .an-ans-m")).toHaveLength(1);
    expect(rows().map(r => r.textContent)).toEqual(["alpha", "beta"]);
    rows().forEach(r => expect(r.querySelectorAll(".an-note-acts .an-note-b")).toHaveLength(2));
    expect(CSS).toMatch(/\.an-note-m:hover \.an-note-acts/);
    expect(CSS).toMatch(/@media \(hover: none\) \{ \.an-note-m \{ padding-right: 104px; \}/);
  });
  test("pen edits in place: no jump, the composer and its draft stay, Enter saves into that question only", () => {
    const { w, doc, ca, inst, store, rows } = setup2();
    type(w, inst, "draft for q2");
    rows()[0].querySelectorAll(".an-note-b")[0].click();
    const ied = doc.querySelector("#q1 .an-ied");
    expect(ied).not.toBeNull();
    expect(inst.stages[inst.idx].el.id).toBe("q2");
    expect(inst.comp.ed.textContent).toBe("draft for q2");
    ied.textContent = "alpha 2";
    key(w, ied, "Enter");
    expect(store.value).toBe("alpha 2\n\nbeta");
    expect(rows().map(r => r.textContent)).toEqual(["alpha 2", "beta"]);
    expect(doc.querySelector("#q1 .an-ied")).toBeNull();
    expect(doc.querySelector("#q2 .an-note").value).toBe("draft for q2");   // the open question's own draft, untouched
    expect(inst.stages[inst.idx].el.id).toBe("q2");
    expect(ca.instances[0].comp.ed.textContent).toBe("draft for q2");
  });
  test("Esc cancels, an emptied bubble is deleted, x deletes at once, an empty question hides its bubble", () => {
    const { w, doc, store, rows, inst } = setup2();
    rows()[0].querySelectorAll(".an-note-b")[0].click();
    let ied = doc.querySelector("#q1 .an-ied");
    ied.textContent = "changed";
    key(w, ied, "Escape");
    expect(store.value).toBe("alpha\n\nbeta");
    expect(doc.querySelector("#q1 .an-ied")).toBeNull();
    rows()[1].querySelectorAll(".an-note-b")[0].click();
    ied = doc.querySelector("#q1 .an-ied");
    ied.textContent = "  ";
    key(w, ied, "Enter");
    expect(store.value).toBe("alpha");
    rows()[0].querySelectorAll(".an-note-b")[1].click();
    expect(store.value).toBe("");
    expect(rows()).toHaveLength(0);
    expect(doc.querySelector("#q1 .an-m-me .an-ans-m")).not.toBeNull();
    expect(inst.stages[0].msgs).toEqual([]);
  });
  test("typing in the inline field never triggers the page's hotkeys", () => {
    const { w, doc, rows, inst } = setup2();
    rows()[0].querySelectorAll(".an-note-b")[0].click();
    const ied = doc.querySelector("#q1 .an-ied");
    const before = inst.idx;
    ["n", "u", "1", "ArrowRight", "d"].forEach(k => key(w, ied, k));
    expect(inst.idx).toBe(before);
    expect(doc.activeElement === ied || ied.isConnected).toBe(true);
  });
  test("a multi-paragraph message round-trips through the inline edit, unchanged text writes nothing", () => {
    const { w, doc, ca, inst } = (() => {
      const p = page(LITE);
      const inst = p.ca.instances[0];
      send(p.w, p.ca, inst, "one\n\ntwo");
      p.ca.go(inst, 1);
      return { ...p, inst };
    })();
    const store = doc.querySelector("#q1 .an-note");
    expect(store.value).toBe("one\n \ntwo");
    const rows = () => [...doc.querySelectorAll("#q1 .an-m-me .an-note-m")];
    expect(rows()).toHaveLength(1);
    rows()[0].querySelectorAll(".an-note-b")[0].click();
    key(w, doc.querySelector("#q1 .an-ied"), "Enter");
    expect(store.value).toBe("one\n \ntwo");
    expect(rows()).toHaveLength(1);
    rows()[0].querySelectorAll(".an-note-b")[0].click();
    doc.querySelector("#q1 .an-ied").textContent = "one\n\nthree";
    key(w, doc.querySelector("#q1 .an-ied"), "Enter");
    expect(store.value).toBe("one\n \nthree");
    expect(rows()).toHaveLength(1);
    expect(ca.instances[0].stages[0].msgs).toHaveLength(1);
  });
  test("jumping back keeps the actions: the open question edits through the composer, an inline edit survives a redraw", () => {
    const { w, doc, ca, inst, store, rows } = setup2();
    rows()[0].querySelectorAll(".an-note-b")[0].click();
    const ied = doc.querySelector("#q1 .an-ied");
    ca.go(inst, 2);                                       // another jump while editing: the field is not eaten
    expect(doc.querySelector("#q1 .an-ied")).not.toBeNull();
    key(w, ied, "Escape");
    ca.go(inst, 0);                                       // back on q1: its notes box is live, pen goes to the composer
    expect(inst.stages[inst.idx].el.id).toBe("q1");
    doc.querySelectorAll("#q1 .an-notes .an-note-m")[1].querySelectorAll(".an-note-b")[0].click();
    expect(inst.comp.ed.textContent).toBe("beta");
    expect(store.value).toBe("alpha\n\nbeta");   // the message is a draft in the composer now, stored as the last line
    ca.sendNote(inst);
    expect(store.value).toBe("alpha\n\nbeta");
    ca.go(inst, 1);
    expect(rows().map(r => r.textContent)).toEqual(["alpha", "beta"]);
  });
  test("a frozen round stays read-only: no pen, no x", () => {
    const { doc, ca } = page(`<div data-baked>${LITE.replace('<textarea data-comment="q1-note"></textarea>', '<textarea data-comment="q1-note">sent</textarea>')}</div>`);
    const inst = ca.instances[0];
    ca.go(inst, 1);
    expect(doc.querySelectorAll("#q1 .an-m-me .an-note-m")).toHaveLength(1);
    expect(doc.querySelectorAll("#q1 .an-m-me .an-note-b")).toHaveLength(0);
  });
  test("the key handler leaves the inline field alone (source guard)", () => {
    expect(dk("templates-analysis-js-2.md")).toMatch(/inst\.lb \|\| \(e\.target\.closest && e\.target\.closest\('\.an-ied'\)\)\) return;/);
  });
});

describe("attachments in the composer", () => {
  test("a pasted image becomes an attachment of the open stage, never an <img> in the field; text pastes as plain text", async () => {
    const { w, doc, ca } = page(FULL, { engine: true });
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.el.id === "a1"));
    const ev = pasteFile(w, inst.comp.ed);
    expect(ev.defaultPrevented).toBe(true);
    await flush();
    expect(inst.comp.ed.querySelector("img")).toBeNull();
    expect(w._attachments.get("a1-note")).toHaveLength(1);
    const items = inst.comp.strip.querySelectorAll(".an-att-i");
    expect(items).toHaveLength(1);
    expect(items[0].querySelector(".an-att-t img")).not.toBeNull();
    expect(inst.comp.strip.hidden).toBe(false);
    const t = new w.Event("paste", { bubbles: true, cancelable: true });
    t.clipboardData = { items: [], getData: () => "<b>bold</b> & more" };
    inst.comp.ed.dispatchEvent(t);
    expect(t.defaultPrevented).toBe(true);
    expect(inst.comp.ed.querySelector("b")).toBeNull();
    expect(inst.comp.ed.textContent).toBe("<b>bold</b> & more");
    expect(doc.querySelector("#a1 .an-note").value).toBe("<b>bold</b> & more");
  });
  test("each stage shows only its own attachments; the briefing and topic stages take them too (slot = their store's data-comment)", async () => {
    const { w, ca } = page(FULL, { engine: true });
    const inst = ca.instances[0];
    pasteFile(w, inst.comp.ed, "brief.png");               // the briefing is open first
    await flush();
    expect(inst.comp.att.hidden).toBe(false);
    expect([...w._attachments.keys()]).toEqual(["briefing-note"]);
    expect(inst.comp.strip.querySelectorAll(".an-att-i")).toHaveLength(1);
    ca.go(inst, inst.stages.findIndex(s => s.el.id === "a1"));
    expect(inst.comp.strip.querySelectorAll(".an-att-i")).toHaveLength(0);
    expect(inst.comp.strip.hidden).toBe(true);
    pasteFile(w, inst.comp.ed, "a1.png");
    await flush();
    ca.go(inst, inst.stages.findIndex(s => s.kind === "topic"));
    expect(inst.comp.strip.querySelectorAll(".an-att-i")).toHaveLength(0);
    pasteFile(w, inst.comp.ed, "topic.png");
    await flush();
    const slot = s => s.dataset.comment;
    const stores = [...inst.root.querySelectorAll("textarea[data-comment]")].map(slot);
    [...w._attachments.keys()].forEach(k => expect(stores).toContain(k));   // every slot is a field the submit collector reads
    ca.go(inst, 0);
    expect(inst.comp.strip.querySelectorAll(".an-att-i")).toHaveLength(1);
  });
  test("x removes, a click opens the large view with Esc and focus handling, the engine's progress and retry stay", async () => {
    const { w, doc, ca } = page(FULL, { engine: true });
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.el.id === "a1"));
    pasteFile(w, inst.comp.ed);
    await flush();
    const rec = w._attachments.get("a1-note")[0];
    rec.error = "error_offline"; rec.synced = false;
    w.renderAttachments("a1-note");                         // the engine's own call re-draws the strip too (hooked)
    const item = inst.comp.strip.querySelector(".an-att-i");
    expect(item.dataset.error).toBe("true");
    expect(item.querySelector(".an-att-r")).not.toBeNull();
    rec.error = null; rec.progress = 40;
    w.renderAttachments("a1-note");
    expect(inst.comp.strip.querySelector(".an-att-p").style.width).toBe("40%");
    inst.comp.strip.querySelector(".an-att-t").click();
    const lb = inst.root.querySelector(".an-lb");
    expect(lb.getAttribute("role")).toBe("dialog");
    expect(doc.activeElement.classList.contains("an-lb-x")).toBe(true);
    key(w, doc.activeElement, "n");                         // no page hotkey runs behind the view
    expect(inst.stages[inst.idx].el.id).toBe("a1");
    key(w, doc.activeElement, "Escape");
    expect(inst.root.querySelector(".an-lb")).toBeNull();
    inst.comp.strip.querySelector(".an-att-x").click();
    await flush();
    expect(w._attachments.get("a1-note")).toHaveLength(0);
    expect(inst.comp.strip.hidden).toBe(true);
  });
  test("a drop works like a paste; a frozen round neither adds nor removes but still shows", async () => {
    const { w, ca } = page(FULL, { engine: true });
    const inst = ca.instances[0];
    ca.go(inst, inst.stages.findIndex(s => s.el.id === "a1"));
    const file = new w.File([new Uint8Array([1])], "d.png", { type: "image/png" });
    const drop = new w.Event("drop", { bubbles: true, cancelable: true });
    drop.dataTransfer = { files: [file], getData: () => "", types: ["Files"] };
    inst.comp.el.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    await flush();
    expect(w._attachments.get("a1-note")).toHaveLength(1);

    const fz = page(`<div data-baked>${FULL}</div>`, { engine: true });
    const fi = fz.ca.instances[0];
    const ev = pasteFile(fz.w, fi.comp.ed);
    await flush();
    expect(ev.defaultPrevented).toBe(true);                 // still never the raw browser paste
    expect(fz.w._attachments.size).toBe(0);
    fz.w._attachments.set("briefing-note", [{ key: "k", slot: "briefing-note", name: "x.png", mime: "image/png", synced: true, id: "abc", size: 1 }]);
    fz.ca.go(fi, 1);
    fz.ca.go(fi, 0);
    expect(fi.comp.strip.querySelectorAll(".an-att-i")).toHaveLength(1);
    expect(fi.comp.strip.querySelector(".an-att-x")).toBeNull();
    expect(fi.comp.strip.querySelector(".an-att-t")).not.toBeNull();
  });
  test("the strip floats above the field, left to right, themed and touch-sized", () => {
    expect(CSS).toMatch(/\.an-strip \{ position: absolute; left: 0; right: 0; bottom: calc\(100% \+ 8px\);/);
    expect(CSS).toMatch(/\.an-strip \{[^}]*flex-wrap: wrap;/);
    expect(CSS).toMatch(/html\[data-theme="light"\] \.an-att-i/);
    expect(CSS).toMatch(/@media \(pointer: coarse\) \{ \.an-att-x/);
    expect(CSS).toMatch(/\.an-lb \{ position: fixed; inset: 0;/);
    expect(CSS).not.toMatch(/\.an-comp-ed img/);
  });
});

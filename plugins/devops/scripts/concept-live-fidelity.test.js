import { describe, test, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import cb from "./concept-build.js";
import live from "./concept-live-css.js";
import gate from "../hooks/lib/concept-gate.js";

// Live-Treue (auto-concept live-fidelity.md, templates-panel-fidelity.md): the
// dock switch, the payload field, bake, the LIVE tab flag, live CSS by
// reference and the gate rules for live rounds.

const temps = [];
afterAll(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "concept-fidelity-"));
  temps.push(root);
  const dir = path.join(root, "docs", "concepts", "20261120-2200-gallery");
  return { root, dir, home: path.join(root, "home") };
}
const write = (dir, n, html) => {
  fs.mkdirSync(path.join(dir, "rounds"), { recursive: true });
  fs.writeFileSync(path.join(dir, "rounds", `${String(n).padStart(2, "0")}.html`), html);
};
const read = (dir, n) => fs.readFileSync(path.join(dir, "rounds", `${String(n).padStart(2, "0")}.html`), "utf8");

const designRound = (n, { baked = false, attrs = "", inner = "" } = {}) => `<section data-iteration="${n}" data-iteration-template="design"${baked ? " data-baked" : ""}${attrs}>
  <section data-design="d${n}" data-nav-label="Design ${n}" data-design-active="true">
    ${inner}
    <section id="d${n}-s1" data-screen data-nav-label="Start" data-screen-active="true">
      <div class="device-frame"><button type="button" data-screen-link="d${n}-s2">Next</button></div>
    </section>
    <section id="d${n}-s2" data-screen data-nav-label="End" hidden><div class="device-frame">End</div></section>
  </section>
</section>`;
const LIVE = ' data-fidelity="live" data-fidelity-note="Tokens und Galerie 1:1 aus live"';

describe("scopeCss — a live stylesheet cannot reach the page chrome", () => {
  const S = '[data-design="d1"]';
  test("plain, element and universal selectors are prefixed", () => {
    const { css, problems } = live.scopeCss(".card { a: 1 } button, * { b: 2 }", S);
    expect(problems).toEqual([]);
    expect(css).toContain(`${S} .card {`);
    expect(css).toContain(`${S} button, ${S} * {`);
  });
  test("html / body / :root become the design wrapper and keep their qualifiers", () => {
    expect(live.scopeSelector(":root", S)).toBe(S);
    expect(live.scopeSelector("body", S)).toBe(S);
    expect(live.scopeSelector("body.dark .nav", S)).toBe(`${S}.dark .nav`);
    expect(live.scopeSelector('html[data-theme="dark"] body > main', S)).toBe(`${S}[data-theme="dark"] main`);
    expect(live.scopeSelector("bodyish", S)).toBe(`${S} bodyish`);
  });
  test("grouping at-rules recurse, @font-face / @keyframes stay, @import is refused", () => {
    const src = "@import url(x.css); @media (min-width: 600px) { .a { c: 1 } } @font-face { font-family: X; } @keyframes spin { from { t: 0 } to { t: 1 } }";
    const { css, problems } = live.scopeCss(src, S);
    expect(css).toMatch(/@media \(min-width: 600px\) \{\n\[data-design="d1"\] \.a \{/);
    expect(css).toContain("@font-face { font-family: X; }");
    expect(css).toContain("@keyframes spin { from { t: 0 } to { t: 1 } }");
    expect(problems.join(" ")).toMatch(/@import/);
  });
});

describe("rewriteUrls — assets come from next to the page", () => {
  const sourceDir = path.resolve("/p/docs/concepts/x");
  const pageDir = path.resolve("/p/docs/concepts");
  const cssFile = path.join(sourceDir, "assets", "03", "app.css");
  test("relative url → relative to the built page; data: stays", () => {
    const { css, problems } = live.rewriteUrls('a { b: url("fonts/i.woff2?v=2"); c: url(data:image/png;base64,AA) }', { cssFile, sourceDir, pageDir });
    expect(problems).toEqual([]);
    expect(css).toContain('url("x/assets/03/fonts/i.woff2?v=2")');
    expect(css).toContain("url(data:image/png;base64,AA)");
  });
  test("external, root-relative and escaping urls are reported, never rewritten", () => {
    const { problems } = live.rewriteUrls("a { b: url(https://cdn.x/y.png); c: url(/img/z.png); d: url(../../../../etc/p) }", { cssFile, sourceDir, pageDir });
    expect(problems.length).toBe(3);
  });
});

describe("build — Live-Treue round", () => {
  test("data-live-css is inlined scoped, the tab carries data-fidelity, the gate passes", () => {
    const { dir, home } = project();
    cb.init(dir, { title: "Galerie", locale: "de", mode: "design" });
    fs.mkdirSync(path.join(dir, "assets", "02", "img"), { recursive: true });
    fs.writeFileSync(path.join(dir, "assets", "02", "app.css"), ":root { --g: #0b1020 } body { background: var(--g) } .planet { background: url(img/p.png) }");
    write(dir, 1, designRound(1, { baked: true }));
    write(dir, 2, designRound(2, { attrs: LIVE, inner: '<style data-live-css="assets/02/app.css" data-scope="d2"></style>' }));
    const r = cb.build(dir, { home });
    expect(r.problems).toEqual([]);
    expect(r.gate).toBe("");
    expect(r.ok).toBe(true);
    const d = new JSDOM(r.html).window.document;
    const style = d.querySelector('style[data-live-src="assets/02/app.css"]');
    expect(style).toBeTruthy();
    expect(style.textContent).toContain('[data-design="d2"] { --g: #0b1020 }');
    expect(style.textContent).toContain('[data-design="d2"] .planet { background: url("20261120-2200-gallery/assets/02/img/p.png") }');
    expect(d.querySelector('.iteration-tab[data-iteration="2"]').getAttribute("data-fidelity")).toBe("live");
    expect(d.querySelector('.iteration-tab[data-iteration="1"]').hasAttribute("data-fidelity")).toBe(false);
    // The fragment keeps the reference; only the build inlines it.
    expect(read(dir, 2)).toContain('data-live-css="assets/02/app.css"');
  });

  test("a live-css path outside the source folder or without data-scope is a build problem", () => {
    const { dir, home } = project();
    cb.init(dir, { title: "G", locale: "de", mode: "design" });
    write(dir, 1, designRound(1, { attrs: LIVE, inner: '<style data-live-css="../../secret.css" data-scope="d1"></style><style data-live-css="assets/a.css"></style>' }));
    const r = cb.build(dir, { home, dryRun: true });
    expect(r.ok).toBe(false);
    expect(r.problems.join("\n")).toMatch(/leaves the concept source folder/);
    expect(r.problems.join("\n")).toMatch(/needs data-scope/);
  });

  test("bake keeps the payload's fidelity in the frozen feedback blob", () => {
    const { dir } = project();
    cb.init(dir, { title: "G", locale: "de", mode: "design" });
    write(dir, 1, designRound(1));
    const pl = path.join(dir, "p.json");
    fs.writeFileSync(pl, JSON.stringify({ action: "iterate", fidelity: "live", comments: { general: { text: "x", attachments: [] } } }));
    cb.bakeRound(dir, 1, JSON.parse(fs.readFileSync(pl, "utf8")));
    const blob = JSON.parse(/data-frozen-feedback>([\s\S]*?)<\/script>/.exec(read(dir, 1))[1]);
    expect(blob.fidelity).toBe("live");
  });
});

describe("gate — findFidelityIssues", () => {
  const page = sections => `<!DOCTYPE html><html><body><main>${sections}</main></body></html>`;
  const kinds = html => gate.findFidelityIssues(html).map(i => i.kind);
  test("a sketch round is untouched", () => {
    expect(kinds(page(designRound(1, { inner: "<style>button { a: 1 }</style>" })))).toEqual([]);
  });
  test("value, template and note are required", () => {
    expect(kinds(page(designRound(1, { attrs: ' data-fidelity="on" data-fidelity-note="n"' })))).toEqual(["fidelity-value"]);
    expect(kinds(page('<section data-iteration="1" data-iteration-template="free" data-fidelity="live" data-fidelity-note="n"></section>'))).toEqual(["fidelity-template"]);
    expect(kinds(page(designRound(1, { attrs: ' data-fidelity="live"' })))).toEqual(["fidelity-note"]);
  });
  test("unscoped rules and foreign assets in a live round block", () => {
    const inner = '<style>[data-design="d1"] .a { x: 1 } .d1-b { y: 2 } button { z: 3 } :root { --v: 1 }</style><img src="https://cdn.example/p.png" alt="">';
    const k = kinds(page(designRound(1, { attrs: LIVE, inner })));
    expect(k.filter(x => x === "fidelity-unscoped").length).toBe(2);
    expect(k).toContain("fidelity-external");
  });
  test("the issues are structural (blocking) in evaluate()", () => {
    const { dir, home } = project();
    cb.init(dir, { title: "G", locale: "de", mode: "design" });
    write(dir, 1, designRound(1, { attrs: ' data-fidelity="live"' }));
    const r = cb.build(dir, { home, dryRun: true });
    expect(r.ok).toBe(false);
    expect(r.gate).toMatch(/fidelity-note/);
  });
});

describe("page — the dock switch", () => {
  async function boot(html, seed) {
    const vc = new VirtualConsole();
    const dom = new JSDOM(html, {
      runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
      url: "http://localhost/docs/concepts/20261120-2200-gallery.html",
      beforeParse(window) {
        window.fetch = () => Promise.reject(new Error("no network"));
        window.CSS = { escape: s => String(s) };
        if (seed) window.localStorage.setItem("concept-fidelity-20261120-2200-gallery", JSON.stringify(seed));
      },
    });
    await new Promise(r => (dom.window.document.readyState === "complete" ? r() : dom.window.addEventListener("load", r)));
    await new Promise(r => setTimeout(r, 0));
    return dom.window;
  }
  function built(rounds, mode = "design") {
    const { dir, home } = project();
    cb.init(dir, { title: "G", locale: "de", mode });
    rounds.forEach((h, i) => write(dir, i + 1, h));
    const r = cb.build(dir, { home, dryRun: true });
    expect(r.problems).toEqual([]);
    return r.html;
  }
  const frozenBlob = fid => `<script type="application/json" data-frozen-feedback>${JSON.stringify({ general: { text: "", attachments: [] }, fidelity: fid })}</script>`;

  test("markup: after the general note, not a note field, no generic persistence, German labels", async () => {
    const w = await boot(built([designRound(1)]));
    const d = w.document;
    const box = d.getElementById("dock-fidelity");
    expect(box).toBeTruthy();
    expect(box.closest("#feedback-dock")).toBeTruthy();
    const general = d.getElementById("design-general-feedback").closest(".feedback-section");
    expect(general.compareDocumentPosition(box) & w.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const input = d.getElementById("fidelity-toggle");
    expect(input.hasAttribute("data-comment")).toBe(false);
    expect(input.hasAttribute("data-no-persist")).toBe(true);
    expect(box.textContent).toContain("Live-Treue");
    expect(box.textContent).not.toMatch(/\{\{fidelity\./);
  });

  test("default off; switching on is remembered per Etappe; the FAB carries no status dot (#1180)", async () => {
    const html = built([designRound(1)]);
    let w = await boot(html);
    const input = w.document.getElementById("fidelity-toggle");
    expect(input.checked).toBe(false);
    expect(w.fidelityPayload()).toBe("off");
    input.checked = true;
    input.dispatchEvent(new w.Event("change", { bubbles: true }));
    expect(w.fidelityPayload()).toBe("live");
    const fab = w.document.getElementById("feedback-toggle");
    expect(fab.hasAttribute("data-fidelity")).toBe(false);
    // no rule draws a dot on the FAB in any state (connected or not, switch on or off)
    const css = [...w.document.querySelectorAll("style")].map(s => s.textContent).join("\n");
    expect(css).not.toMatch(/\.feedback-fab\[data-fidelity[^\]]*\]::(?:after|before)/);
    expect(JSON.parse(w.localStorage.getItem("concept-fidelity-20261120-2200-gallery"))).toEqual({ _: "live" });
    // A rebuilt page (new page version) still knows it.
    w = await boot(html, { _: "live" });
    expect(w.document.getElementById("fidelity-toggle").checked).toBe(true);
    expect(w.fidelityPayload("B")).toBe("off");
  });

  test("#1179: the two explanation lines are not shown at rest; they are the switch's app tooltip on hover and keyboard focus", async () => {
    const w = await boot(built([designRound(1)]));
    const d = w.document;
    const box = d.getElementById("dock-fidelity");
    expect(box.textContent).not.toContain("Nächste Runden");
    expect(box.textContent).not.toContain("Gilt für Design-Runden");
    expect(box.querySelector("small")).toBeNull();
    const sw = box.querySelector(".fidelity-switch");
    expect(sw.hasAttribute("title")).toBe(false);
    expect(sw.dataset.tip).toContain("Nächste Runden");
    expect(sw.dataset.tip).toContain("Gilt für Design-Runden");
    const tipText = () => [...d.querySelectorAll(".app-tooltip, [role=tooltip]")].filter(t => !t.hidden).map(t => t.textContent).join(" ");
    expect(tipText()).not.toContain("Nächste Runden");
    // keyboard focus opens it at once
    d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    d.getElementById("fidelity-toggle").dispatchEvent(new w.FocusEvent("focusin", { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    expect(tipText()).toContain("Nächste Runden");
    expect(tipText()).toContain("Gilt für Design-Runden");
    d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(tipText()).toBe("");
    // hover (a mouse pointer) opens it after the info delay
    const PointerEv = w.PointerEvent || w.MouseEvent;
    const over = new PointerEv("pointerover", { bubbles: true });
    Object.defineProperty(over, "pointerType", { value: "mouse" });
    sw.querySelector("strong").dispatchEvent(over);
    await new Promise(r => setTimeout(r, 1700));
    expect(tipText()).toContain("Nächste Runden");
  });

  test("without storage the last frozen round of the Etappe answers (sticky)", async () => {
    const r1 = designRound(1, { baked: true, inner: "" }).replace("</section>\n</section>", `</section>\n  ${frozenBlob("live")}\n</section>`);
    const w = await boot(built([r1, designRound(2, { attrs: LIVE })]));
    expect(w.fidelityPayload()).toBe("live");
    expect(w.document.getElementById("fidelity-toggle").checked).toBe(true);
    const chip = w.document.getElementById("fidelity-chip");
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toContain("Tokens und Galerie 1:1 aus live");
  });

  test("hidden on the final report", async () => {
    const report = '<section data-iteration="2" data-iteration-template="free" data-final-report><p class="fr-sentence">Fertig.</p></section>';
    const w = await boot(built([designRound(1, { baked: true }), report]));
    expect(w.document.getElementById("dock-fidelity").hidden).toBe(true);
  });

  test("the submit carries fidelity", () => {
    const md = fs.readFileSync(path.join(__dirname(), "..", "skills", "auto-concept", "deep-knowledge", "templates-submit-js.md"), "utf8");
    expect(md).toMatch(/data\.fidelity = window\.fidelityPayload\(action === 'next-stage' \? data\.next : undefined\)/);
  });
});

function __dirname() { return path.dirname(fileURLToPath(import.meta.url)); }

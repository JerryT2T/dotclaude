import { describe, test, expect } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "../../scripts/build-concept-fixture.js";
import { readTemplates } from "./templates-source.js";

// Bundle B4: (1) the overview preview must show what differs between the
// variants (full-app: cover panned to the diff box, never under the info
// card; component: contained up to 4x), (2) a digit hotkey of the variant
// that is already open steps through its pages instead of doing nothing.

const md = readTemplates();
const BOOT_TIMEOUT = 180_000;
const tick = () => new Promise((r) => setTimeout(r, 0));

async function boot(html) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    virtualConsole: vc,
    beforeParse(window) {
      window.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c) };
      window.fetch = () => Promise.reject(new Error("no network in jsdom"));
    },
  });
  const { window } = dom;
  await new Promise((resolve) => {
    if (window.document.readyState === "complete") return resolve();
    window.addEventListener("load", resolve);
  });
  await tick();
  await tick();
  return { window, document: window.document };
}
const page = () => {
  const html = build({ rounds: 2, entries: 4, mode: "design", mapping: false, locale: "de", designs: 3, out: "" });
  return html.replace(/<section data-design="d2(b|c)?"/g, (m) => `${m} data-design-motto="M" data-design-traits="a | b | c" data-design-icon="leaf"`);
};
const key = (window, code) => {
  const e = new window.KeyboardEvent("keydown", { key: code.slice(-1), code, bubbles: true, cancelable: true });
  window.document.body.dispatchEvent(e);
};
const live = (d) => d.querySelector("section[data-iteration][data-active]");
const activeDesign = (d) => live(d).querySelector(":scope > section[data-design][data-design-active='true']");
const activeScreen = (d) => activeDesign(d).querySelector("section[data-screen][data-screen-active='true']").id;

describe("same-digit hotkey cycles the open variant's pages", () => {
  test("digit of the active variant steps pages, last wraps to first; another digit still aligns", async () => {
    const { window, document } = await boot(page());
    window.showDesign("d2", "d2-s1");
    const ids = [...document.querySelectorAll("[data-design='d2'] section[data-screen][id]")].map((s) => s.id);
    expect(ids.length).toBeGreaterThan(1);
    const seen = [];
    for (let i = 0; i < ids.length; i++) {
      key(window, "Digit1");
      expect(activeDesign(document).dataset.design).toBe("d2");
      seen.push(activeScreen(document));
    }
    expect(seen).toEqual([...ids.slice(1), ids[0]]);
    // A different variant's digit jumps to the complementary page.
    window.showDesign("d2", "d2-s2");
    key(window, "Digit2");
    expect(activeDesign(document).dataset.design).toBe("d2b");
    expect(activeScreen(document)).toBe("d2b-s2");
  }, BOOT_TIMEOUT);

  test("source: the digit handler and the chip share stepActiveDesign", () => {
    expect(md).toMatch(/function stepActiveDesign\(it, cur\)/);
    expect(md).toMatch(/if \(cur && cur === d\) stepActiveDesign\(it, cur\);\s*\n\s*else showDesignAligned/);
    expect(md).toMatch(/if \(cur && cur\.dataset\.design === m\.id\) \{ stepActiveDesign\(it, cur\); return; \}/);
  });
});

describe("overview preview fit shows what differs (bundle B4)", () => {
  test("full-app cover pans to the diff box / demo target clear of the info card", () => {
    expect(md).toMatch(/function diffBox\(p, wrap, origin, originTop, k\)/);
    expect(md).toMatch(/if \(!focus\) focus = diffBox\(/);
    expect(md).toMatch(/availB = hit\(\) \? Math\.max\(0, ovr\.t - 8\)/);
    expect(md).toMatch(/const want = fh <= availB - 8/);
  });
  test("component mode is contained up to 4x (>= 2/3 of the card), cover stays at 2.5x", () => {
    expect(md).toMatch(/Math\.min\(full \? 2\.5 : 4, tall \?/);
  });
  test("warnings: identical variants, demo selector matching nothing, whole-screen demo target", () => {
    expect(md).toMatch(/visually identical/);
    expect(md).toMatch(/data-ov-demo selector matches nothing/);
    expect(md).toMatch(/const huge = dw >= 0\.9/);
  });
});

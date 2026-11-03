import { describe, test, expect } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "../../scripts/build-concept-fixture.js";

// Own Ctrl + click pins of a design round (templates-design-overview.md
// section User pins). #993: a filled pin is never lost from the store / the
// payload. #992: a pin lands at the click point, also over page chrome.

const BOOT_TIMEOUT = 180_000;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const SCREEN = { left: 100, top: 50, width: 400, height: 300 };

async function boot(html, rects = false) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => {
    if (!/Could not parse CSS|Not implemented/.test(String(e.message))) errors.push(String(e.message));
  });
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    virtualConsole: vc,
    beforeParse(window) {
      window.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c) };
      window.fetch = () => Promise.reject(new Error("no network in jsdom"));
      window.Element.prototype.getClientRects = function () { return [{}]; };
      const box = (o) => ({ left: o.left, top: o.top, right: o.left + o.width, bottom: o.top + o.height, width: o.width, height: o.height, x: o.left, y: o.top });
      window.Element.prototype.getBoundingClientRect = function () {
        if (!rects) return box({ left: 0, top: 0, width: 200, height: 40 });
        if (this.tagName === "STYLE") return box({ left: 0, top: 0, width: 0, height: 0 });
        if (this.classList.contains("toc-test")) return box({ ...SCREEN, width: 60 });
        return box(SCREEN);
      };
    },
  });
  const { window } = dom;
  await new Promise((resolve) => {
    if (window.document.readyState === "complete") return resolve();
    window.addEventListener("load", resolve);
  });
  await tick();
  await tick();
  return { window, document: window.document, errors };
}

const design = () => build({ rounds: 2, entries: 4, mode: "design", mapping: false, locale: "de", designs: 2, out: "" });
const ctrlClick = (window, n, x = 10, y = 10) =>
  n.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1, ctrlKey: true, clientX: x, clientY: y }));
const editor = (d) => [...d.querySelectorAll(".upin-editor")].find((e) => !e.hidden);
const storePins = (d) => JSON.parse(d.querySelector("#design-ov-store").value).pins;
function typeInto(window, d, text, enter = false) {
  const ta = editor(d).querySelector("textarea");
  ta.value = text;
  ta.dispatchEvent(new window.Event("input", { bubbles: true }));
  if (enter) ta.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
}

describe("#993 a filled pin is never lost", () => {
  test("store loses the record, the typed text still reaches the payload (DOM and stored draft)", async () => {
    const { window, document, errors } = await boot(design());
    expect(errors).toEqual([]);
    window.showDesign("d2");
    ctrlClick(window, document.querySelector("#d2-s1 h1"));
    typeInto(window, document, "first", true);
    window.showScreen("d2-s2");
    await tick(20);
    ctrlClick(window, document.querySelector("#d2-s2 h1"));
    typeInto(window, document, "second note"); // no Enter: still in its editor
    const second = storePins(document).find((p) => p.text === "second note");
    expect(second).toBeTruthy();
    // The reported failure: the store holds only the first pin.
    const store = document.querySelector("#design-ov-store");
    store.value = JSON.stringify({ favorite: null, pins: storePins(document).filter((p) => p.text === "first") });
    expect(window.collectDecisions("iterate").userPins.map((p) => p.text).sort()).toEqual(["first", "second note"]);
    // Same after the textarea left the DOM (other screen): only the stored draft remains.
    window.showScreen("d2-s1");
    await tick(20);
    expect(document.getElementById("upin-ta-" + second.id)).toBeNull();
    store.value = JSON.stringify({ favorite: null, pins: storePins(document).filter((p) => p.text === "first") });
    const pins = window.collectDecisions("iterate").userPins;
    expect(pins.map((p) => p.text).sort()).toEqual(["first", "second note"]);
    expect(pins.find((p) => p.text === "second note").id).toBe(second.id);
    // Recovered into the store on the next write.
    ctrlClick(window, document.querySelector("#d2-s1 p"));
    typeInto(window, document, "third", true);
    expect(storePins(document).map((p) => p.text).sort()).toEqual(["first", "second note", "third"]);
  }, BOOT_TIMEOUT);

  test("a pin deleted on purpose does not come back", async () => {
    const { window, document } = await boot(design());
    window.showDesign("d2");
    ctrlClick(window, document.querySelector("#d2-s1 h1"));
    typeInto(window, document, "gone soon", true);
    ctrlClick(window, document.querySelector("#d2-s1 p"));
    typeInto(window, document, "stays", true);
    const wrap = [...document.querySelectorAll("#d2-s1 .upin")].find((w) => w.querySelector("textarea").value === "gone soon");
    wrap.querySelector(".upin-delete").click();
    window.showScreen("d2-s2");
    await tick(20);
    window.showScreen("d2-s1");
    await tick(20);
    expect(storePins(document).map((p) => p.text)).toEqual(["stays"]);
    expect(window.collectDecisions("iterate").userPins.map((p) => p.text)).toEqual(["stays"]);
  }, BOOT_TIMEOUT);
});

describe("#992 a pin lands at the click point, also over chrome", () => {
  test("a non-rendering or small first child does not become the pin box", async () => {
    const { window, document } = await boot(design(), true);
    window.showDesign("d2");
    const screen = document.querySelector("#d2-s1");
    screen.querySelector(":scope > .device-frame")?.classList.remove("device-frame"); // a framed mock-up would win anyway
    const style = document.createElement("style");
    const toc = document.createElement("nav");
    toc.className = "toc-test";
    screen.insertBefore(toc, screen.firstChild);
    screen.insertBefore(style, screen.firstChild);
    // 300 / 200 on a screen at (100, 50) sized 400 x 300 -> 50 % / 50 %.
    ctrlClick(window, screen.querySelector("h1"), 300, 200);
    typeInto(window, document, "centre", true);
    const pin = storePins(document).find((p) => p.text === "centre");
    expect(pin.x).toBe(50);
    expect(pin.y).toBe(50);
    const host = document.querySelector(".upin-host");
    expect(host === screen || screen.contains(host)).toBe(true);
    expect(host.tagName).not.toBe("NAV");
  }, BOOT_TIMEOUT);

  test("Ctrl + click over table-of-contents chrome sets a pin and the chrome does not act", async () => {
    const { window, document } = await boot(design(), true);
    window.showDesign("d2");
    const live = document.querySelector("section[data-iteration][data-active]");
    const chrome = document.createElement("nav");
    chrome.id = "toc-float";
    live.appendChild(chrome);
    let pressed = false;
    chrome.addEventListener("pointerdown", () => { pressed = true; });
    const down = new window.Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(down, { pointerType: "mouse", ctrlKey: true, clientX: 200, clientY: 100 });
    chrome.dispatchEvent(down);
    expect(pressed).toBe(false);
    ctrlClick(window, chrome, 200, 100);
    typeInto(window, document, "about the toc", true);
    const pin = storePins(document).find((p) => p.text === "about the toc");
    expect(pin).toBeTruthy();
    expect(pin.screen).toBe("d2-s1");
    expect(pin.x).toBe(25);
    expect(pin.y).toBeCloseTo(16.7, 1);
    // Without Ctrl the chrome still works.
    const plain = new window.Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(plain, { pointerType: "mouse", ctrlKey: false, clientX: 200, clientY: 100 });
    chrome.dispatchEvent(plain);
    expect(pressed).toBe(true);
  }, BOOT_TIMEOUT);
});

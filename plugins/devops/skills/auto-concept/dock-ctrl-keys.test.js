import { describe, test, expect } from "vitest";
import { JSDOM } from "jsdom";
import { build } from "../../scripts/build-concept-fixture.js";

// Notes dock keys: Ctrl+Enter in a dock field moves to the next visible field
// (last one closes the dock), Ctrl+Space closes it, and Ctrl+Enter never
// submits a round — that is only possible by clicking in the ☰ panel.

async function boot(html) {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    beforeParse(window) {
      window.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c) };
      window.fetch = () => Promise.reject(new Error("no network in jsdom"));
      window.onerror = () => true;
    },
  });
  const { window } = dom;
  await new Promise((resolve) => {
    if (window.document.readyState === "complete") return resolve();
    window.addEventListener("load", resolve);
  });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return dom;
}

function key(window, target, init) {
  const ev = new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

describe("notes dock Ctrl keys", () => {
  const html = build({ rounds: 2, entries: 3, mode: "design", locale: "en" });
  const T = 180_000;

  test("Ctrl+Enter walks the fields, closes on the last, never submits; Ctrl+Space closes", async () => {
    const { window } = await boot(html);
    const { document } = window;
    const dock = document.getElementById("feedback-dock");
    let clicks = 0;
    document.addEventListener("click", (e) => { if (e.target.closest?.(".submit-btn")) clicks++; }, true);
    const fields = () => [...dock.querySelectorAll("textarea")].filter((t) => {
      for (let n = t; n && n !== dock; n = n.parentElement) {
        if (n.hidden || window.getComputedStyle(n).display === "none") return false;
      }
      return true;
    });

    window.openDock();
    expect(dock.dataset.open).toBe("true");
    const list = fields();
    expect(list.length).toBeGreaterThan(1);
    list[0].focus();
    const ev = key(window, list[0], { key: "Enter", code: "Enter", ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(list[1]);
    expect(dock.dataset.open).toBe("true");

    const last = list[list.length - 1];
    last.focus();
    key(window, last, { key: "Enter", code: "Enter", metaKey: true });
    expect(dock.dataset.open).toBe("false");

    window.openDock();
    list[0].focus();
    key(window, list[0], { key: " ", code: "Space", ctrlKey: true });
    expect(dock.dataset.open).toBe("false");

    // Outside the dock Ctrl+Enter does nothing at all.
    key(window, document.body, { key: "Enter", code: "Enter", ctrlKey: true });
    expect(clicks).toBe(0);
  }, T);
});

// Ctrl+Enter inside a note (auto bubble or own pin editor) closes it and opens
// the next auto note that is neither answered nor opened; none left → only closes.
const ANNO = (id) => [
  `<div class="anno" data-anno="${id}" data-anno-side="right" style="--anno-x:50%;--anno-y:50%">`,
  `<button class="anno-pin" type="button" data-anno-pin="${id}" aria-expanded="false">1</button>`,
  `<div class="anno-bubble" data-anno-bubble="${id}" data-open="false">`,
  `<textarea data-annotation="${id}"></textarea></div></div>`,
].join("");

describe("notes Ctrl+Enter inside a note", () => {
  const base = build({ rounds: 1, entries: 3, mode: "design", mapping: true, locale: "en" });
  const html = base.replace(
    /(<section id="d1-s1" data-screen[^>]*>)/,
    `$1<div class="anno-layer" data-anno-layer>${ANNO("n1")}${ANNO("n2")}${ANNO("n3")}</div>`,
  );
  const T = 180_000;
  const tick = (w) => new Promise((r) => w.setTimeout(r, 20));
  const open = (d, id) => d.querySelector(`[data-anno-bubble="${id}"]`).dataset.open;

  test("closes the note and opens the next unhandled auto note; the last one only closes", async () => {
    const { window } = await boot(html);
    const d = window.document;
    expect(d.querySelectorAll("[data-anno]").length).toBe(3);
    d.querySelector('[data-anno-pin="n1"]').click();
    expect(open(d, "n1")).toBe("true");
    const ev = key(window, d.querySelector('[data-annotation="n1"]'), { key: "Enter", code: "Enter", ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
    await tick(window);
    expect(open(d, "n1")).toBe("false");
    expect(open(d, "n2")).toBe("true");
    // n2 answered → skipped; n3 is next.
    d.querySelector('[data-annotation="n2"]').value = "done";
    d.querySelector('[data-annotation="n2"]').dispatchEvent(new window.Event("input", { bubbles: true }));
    key(window, d.querySelector('[data-annotation="n2"]'), { key: "Enter", code: "Enter", metaKey: true });
    await tick(window);
    expect(open(d, "n3")).toBe("true");
    key(window, d.querySelector('[data-annotation="n3"]'), { key: "Enter", code: "Enter", ctrlKey: true });
    await tick(window);
    expect([open(d, "n1"), open(d, "n2"), open(d, "n3")]).toEqual(["false", "false", "false"]);
  }, T);

  const OWN = (id) => `<div class="upin" data-upin-id="${id}"><button class="upin-pin" type="button" data-pin="${id}"></button><div class="upin-editor" hidden><textarea id="ta-${id}"></textarea></div></div>`;
  // Stand-in for the pin button: toggles the editor and focuses its field, like
  // the real handler (closeEditors + hidden=false + focus).
  const wireOwn = (d, w) => d.querySelectorAll(".upin").forEach((u) => {
    const ed = u.querySelector(".upin-editor"), ta = u.querySelector("textarea");
    u.querySelector(".upin-pin").addEventListener("click", () => {
      d.querySelectorAll(".upin-editor").forEach((x) => { if (x !== ed) x.hidden = true; });
      ed.hidden = !ed.hidden; if (!ed.hidden) ta.focus();
    });
    ta.addEventListener("keydown", (e) => { // the real own-note handler: plain Enter saves + closes
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); ed.hidden = true; ta.dataset.saves = String(+(ta.dataset.saves || 0) + 1); }
    });
  });
  // n1, own1, n2, own2, n3 in document order
  const mixed = base.replace(
    /(<section id="d1-s1" data-screen[^>]*>)/,
    `$1<div class="anno-layer" data-anno-layer>${ANNO("n1")}${OWN("p1")}${ANNO("n2")}${OWN("p2")}${ANNO("n3")}</div>`,
  );

  test("Enter in an auto note only closes it; Shift+Enter is left alone", async () => {
    const { window } = await boot(mixed);
    const d = window.document;
    d.querySelector('[data-anno-pin="n1"]').click();
    const ta = d.querySelector('[data-annotation="n1"]');
    const sh = key(window, ta, { key: "Enter", code: "Enter", shiftKey: true });
    expect(sh.defaultPrevented).toBe(false);
    expect(open(d, "n1")).toBe("true");
    const ev = key(window, ta, { key: "Enter", code: "Enter" });
    expect(ev.defaultPrevented).toBe(true);
    await tick(window);
    expect([open(d, "n1"), open(d, "n2"), open(d, "n3")]).toEqual(["false", "false", "false"]);
  }, T);

  test("Ctrl+Enter walks auto and own notes in document order and focuses the next field", async () => {
    const { window } = await boot(mixed);
    const d = window.document;
    wireOwn(d, window);
    const editorOpen = (id) => !d.querySelector(`[data-upin-id="${id}"] .upin-editor`).hidden;
    d.querySelector('[data-anno-pin="n1"]').click();
    key(window, d.querySelector('[data-annotation="n1"]'), { key: "Enter", code: "Enter", ctrlKey: true });
    await tick(window);
    expect(open(d, "n1")).toBe("false");
    expect(editorOpen("p1")).toBe(true);
    expect(d.activeElement).toBe(d.getElementById("ta-p1"));
    // own -> auto: saved once (no double save), closed, next auto bubble gets focus
    const ev = key(window, d.getElementById("ta-p1"), { key: "Enter", code: "Enter", metaKey: true });
    expect(ev.defaultPrevented).toBe(true);
    await tick(window);
    expect(d.getElementById("ta-p1").dataset.saves).toBe("1");
    expect(editorOpen("p1")).toBe(false);
    expect(open(d, "n2")).toBe("true");
    expect(d.activeElement).toBe(d.querySelector('[data-annotation="n2"]'));
    key(window, d.querySelector('[data-annotation="n2"]'), { key: "Enter", code: "Enter", ctrlKey: true });
    await tick(window);
    expect(editorOpen("p2")).toBe(true);
    expect(d.activeElement).toBe(d.getElementById("ta-p2"));
    // own -> auto n3, then the last note only closes
    key(window, d.getElementById("ta-p2"), { key: "Enter", code: "Enter", ctrlKey: true });
    await tick(window);
    expect(open(d, "n3")).toBe("true");
    expect(d.activeElement).toBe(d.querySelector('[data-annotation="n3"]'));
    key(window, d.querySelector('[data-annotation="n3"]'), { key: "Enter", code: "Enter", ctrlKey: true });
    await tick(window);
    expect([open(d, "n1"), open(d, "n2"), open(d, "n3"), editorOpen("p1"), editorOpen("p2")]).toEqual(["false", "false", "false", false, false]);
  }, T);

  test("Enter and Shift+Enter in an own note never open another note", async () => {
    const { window } = await boot(mixed);
    const d = window.document;
    wireOwn(d, window);
    d.querySelector('[data-upin-id="p1"] .upin-pin').click();
    const ta = d.getElementById("ta-p1");
    expect(key(window, ta, { key: "Enter", code: "Enter", shiftKey: true }).defaultPrevented).toBe(false);
    key(window, ta, { key: "Enter", code: "Enter" });
    await tick(window);
    expect(ta.dataset.saves).toBe("1");
    expect(d.querySelector('[data-upin-id="p1"] .upin-editor').hidden).toBe(true);
    expect([open(d, "n1"), open(d, "n2"), open(d, "n3")]).toEqual(["false", "false", "false"]);
  }, T);
});

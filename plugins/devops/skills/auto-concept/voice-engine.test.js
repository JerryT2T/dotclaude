import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// B4 voice input: the engine block of templates-voice-js.md driven with a fake
// SpeechRecognition and fake timers (no microphone involved).
const dir = path.dirname(fileURLToPath(import.meta.url));
const part = fs.readFileSync(path.join(dir, "deep-knowledge", "templates-voice-js.md"), "utf8");
const js = part.match(/```javascript\n([\s\S]*?)\n```/)[1].replace(/\{\{([a-z_.]+)\}\}/g, "$1");

class FakeRec {
  static all = [];
  constructor() { this.started = 0; this.stopped = 0; FakeRec.all.push(this); }
  start() { this.started++; if (this.onstart) this.onstart(); }
  stop() { this.stopped++; }
  abort() { this.stopped++; }
}
const cur = () => FakeRec.all[FakeRec.all.length - 1];
const say = (v, fin, interim = "") => {
  const results = [];
  if (fin) results.push(Object.assign([{ transcript: fin }], { isFinal: true }));
  if (interim) results.push(Object.assign([{ transcript: interim }], { isFinal: false }));
  v._onResult({ resultIndex: 0, results });
};
const timers = { set: (f, ms) => setTimeout(f, ms), clear: (id) => clearTimeout(id) };

const HTML = `<html lang="de"><body>
  <button id="feedback-toggle">x</button>
  <aside id="feedback-dock"><div class="feedback-dock-header"><button id="voice-mode-toggle"></button></div>
    <textarea id="a" data-comment="a" data-attachable hidden></textarea>
    <textarea id="b" data-comment="b" data-attachable></textarea>
    <textarea id="g" data-comment="general" data-attachable></textarea>
    <div class="attach-bar" data-attach-for="b"><button class="voice-btn"></button></div>
  </aside><textarea id="solo"></textarea></body></html>`;

let win, doc, store, v;
function makeStorage(map) {
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, x) => map.set(k, String(x)) };
}
function make({ Recognition = FakeRec, preset } = {}) {
  FakeRec.all = [];
  const dom = new JSDOM(HTML, { pretendToBeVisual: true, runScripts: "outside-only" });
  win = dom.window;
  doc = win.document;
  win.CSS = { escape: (s) => String(s) };
  win.conceptVoiceBoot = false;
  win.eval(js);
  store = new Map(preset || []);
  v = win.createConceptVoice({ win, doc, Recognition, storage: makeStorage(store), storageKey: "concept-voice-mode-t", timers });
  v.boot();
  return v;
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("field mic: insert at the cursor", () => {
  test("text lands at the caret, the rest stays, an input event fires, lang from the page", () => {
    make();
    const ta = doc.getElementById("b");
    ta.value = "Hello world";
    ta.setSelectionRange(5, 5);
    let inputs = 0;
    ta.addEventListener("input", () => inputs++);
    doc.querySelector(".voice-btn").click();
    expect(cur().lang).toBe("de-DE");
    say(v, "dear");
    expect(ta.value).toBe("Hello dear world");
    expect(inputs).toBeGreaterThan(0);
    say(v, "friend");
    expect(ta.value).toBe("Hello dear friend world");
  });

  test("interim words are replaced by the final ones; Enter ends the dictation and keeps the text", () => {
    make();
    const ta = doc.getElementById("b");
    ta.value = "A.";
    ta.setSelectionRange(2, 2);
    const btn = doc.querySelector(".voice-btn");
    btn.click();
    say(v, "", "hel");
    say(v, "", "hello wor");
    expect(ta.value).toBe("A. hello wor");
    say(v, "hello world");
    expect(ta.value).toBe("A. hello world");
    const ev = new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(v._state.fs).toBe(null);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(ta.value).toBe("A. hello world");
  });

  test("words typed into the interim region are never lost", () => {
    make();
    doc.querySelector(".voice-btn").click();
    say(v, "", "partial");
    const t = doc.getElementById("b");
    t.value = "typed " + t.value;
    say(v, "final");
    expect(t.value).toContain("typed");
    expect(t.value).toContain("final");
  });

  test("a field without an attach bar gets its own mic", () => {
    make();
    const solo = doc.getElementById("solo");
    expect(solo.nextElementSibling.classList.contains("voice-btn")).toBe(true);
    solo.value = "x y";
    solo.setSelectionRange(1, 1);
    solo.nextElementSibling.click();
    say(v, "mid");
    expect(solo.value).toBe("x mid y");
  });
});

describe("analysis composer (contenteditable)", () => {
  test("interim words show while speaking and never stay in the saved text", () => {
    make();
    const c = doc.createElement("div");
    c.className = "an-comp";
    c.innerHTML = '<div class="an-comp-ed" contenteditable="true">Hallo</div>';
    doc.body.appendChild(c);
    v.boot();
    vi.advanceTimersByTime(200);
    const ed = c.querySelector(".an-comp-ed");
    const r = doc.createRange();
    r.selectNodeContents(ed);
    r.collapse(false);
    win.getSelection().removeAllRanges();
    win.getSelection().addRange(r);
    c.querySelector(".voice-btn-an").click();
    say(v, "", "wie geht");
    expect(ed.textContent).toBe("Hallo wie geht");
    expect(ed.querySelectorAll(".voice-interim").length).toBe(1);
    say(v, "", "wie geht es");
    expect(ed.querySelectorAll(".voice-interim").length).toBe(1);
    say(v, "wie geht es dir");
    expect(ed.querySelector(".voice-interim")).toBeNull();
    expect(ed.textContent.replace(/\s+/g, " ").trim()).toBe("Hallo wie geht es dir");
  });
});

describe("voice mode: appends to the first note of the current page", () => {
  test("first visible writable note, appended at the end; the FAB blinks, then shows a check", () => {
    make();
    doc.getElementById("b").value = "existing";
    v.toggleGlobal();
    const fab = doc.getElementById("feedback-toggle");
    expect(fab.dataset.voice).toBe("listening");
    expect(store.get("concept-voice-mode-t")).toBe("1");
    say(v, "first");
    expect(doc.getElementById("a").value).toBe("");
    expect(doc.getElementById("b").value).toBe("existing first");
    expect(fab.dataset.voice).toBe("done");
    vi.advanceTimersByTime(1700);
    expect(fab.dataset.voice).toBe("listening");
  });

  test("a focused dock field is written at its cursor instead", () => {
    make();
    const g = doc.getElementById("g");
    g.value = "ab cd";
    g.focus();
    g.setSelectionRange(2, 2);
    v.toggleGlobal();
    say(v, "XY");
    expect(g.value).toBe("ab XY cd");
  });

  test("a page switch needs a 2 s speech pause; talking on stays on the old page's note", () => {
    make();
    const a = doc.getElementById("a"), b = doc.getElementById("b");
    a.hidden = false; b.hidden = true;
    v.toggleGlobal();
    say(v, "one");
    expect(a.value).toBe("one");
    a.hidden = true; b.hidden = false;
    vi.advanceTimersByTime(1000);
    say(v, "two");
    expect(a.value).toBe("one two");
    expect(b.value).toBe("");
    vi.advanceTimersByTime(2100);
    say(v, "three");
    expect(b.value).toBe("three");
    expect(a.value).toBe("one two");
  });

  test("no writable note: the text waits and is flushed when one appears", () => {
    make();
    const tas = ["a", "b", "g"].map((i) => doc.getElementById(i));
    tas.forEach((t) => { t.hidden = false; t.readOnly = true; });
    v.toggleGlobal();
    say(v, "kept");
    expect(tas.map((t) => t.value).join("")).toBe("");
    tas[2].readOnly = false;
    vi.advanceTimersByTime(1600);
    expect(tas[2].value).toBe("kept");
  });
});

describe("robustness", () => {
  test("restarts after onend while active, with backoff, and not after switching off", () => {
    make();
    v.toggleGlobal();
    cur().onend();
    vi.advanceTimersByTime(300);
    expect(FakeRec.all.length).toBe(2);
    v.setGlobal(false, true);
    cur().onend();
    vi.advanceTimersByTime(6000);
    expect(FakeRec.all.length).toBe(2);
  });

  test("permission denied disables every mic with a data-tip (no title) and switches the mode off", () => {
    make();
    doc.getElementById("voice-mode-toggle").click();
    cur().onerror({ error: "not-allowed" });
    const btn = doc.querySelector(".voice-btn");
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.dataset.tip).toBe("voice.denied");
    expect(btn.hasAttribute("title")).toBe(false);
    expect(doc.getElementById("voice-mode-toggle").getAttribute("aria-pressed")).toBe("false");
    expect(store.get("concept-voice-mode-t")).toBe("0");
  });

  test("a restored opt-in the browser refuses without a click turns itself off but does not lock", () => {
    make({ preset: [["concept-voice-mode-t", "1"]] });
    expect(v._state.globalOn).toBe(true);
    cur().onerror({ error: "not-allowed" });
    expect(v._state.globalOn).toBe(false);
    expect(v._state.blocked).toBe("");
  });

  test("no SpeechRecognition: buttons are inert and explain why", () => {
    make({ Recognition: null });
    const btn = doc.querySelector(".voice-btn");
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.dataset.tip).toBe("voice.unsupported");
    btn.click();
    expect(FakeRec.all.length).toBe(0);
  });
});

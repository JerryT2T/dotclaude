import { describe, test, expect } from "vitest";
import { JSDOM } from "jsdom";
import { readTemplates } from "./templates-source.js";

const md = readTemplates();
const grab = re => { const m = md.match(re); if (!m) throw new Error(String(re)); return m[0]; };
const SRC = [
  grab(/function h\(tag, cls, text\) \{[\s\S]*?\n  \}/),
  grab(/function rich\(el, text\) \{[\s\S]*?\n  \}/),
  grab(/const VIZ = \(window\.CONCEPT_VIZ[^\n]*/),
  grab(/VIZ\.text = \(el, s\) => \{[\s\S]*?\n  \};/),
].join("\n");

function render(text) {
  const w = new JSDOM("<body><div id=x></div></body>", { runScripts: "outside-only" }).window;
  w.eval("(function(){" + SRC + "\nwindow.CONCEPT_VIZ.text(document.getElementById('x'), " + JSON.stringify({ text }) + ");})()");
  return w.document.getElementById("x");
}

describe("data-viz=text: **bold**", () => {
  test("renders **x** as <strong>x</strong>, no raw asterisks", () => {
    const el = render("**Heute:** Inbox\n**Problem:** weg");
    const ps = el.querySelectorAll("p");
    expect(ps).toHaveLength(2);
    expect(ps[0].innerHTML).toBe("<strong>Heute:</strong> Inbox");
    expect(el.textContent).not.toContain("**");
  });
  test("keeps bullets, with bold inside", () => {
    const el = render("Intro\n- **a** eins\n• zwei");
    expect(el.querySelectorAll("ul > li")).toHaveLength(2);
    expect(el.querySelector("li").innerHTML).toBe("<strong>a</strong> eins");
  });
  test("unmatched ** stays literal; markup is text, not HTML", () => {
    expect(render("a ** b").textContent).toBe("a ** b");
    const el = render("**<b>x</b>**");
    expect(el.querySelector("strong").textContent).toBe("<b>x</b>");
    expect(el.querySelector("b")).toBeNull();
  });
  test("the renderer never uses innerHTML", () => {
    expect(SRC).not.toMatch(/innerHTML/);
  });
});

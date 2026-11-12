import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSkill } from "./skill-source.js";

// B2: the closing page's "Umsetzung prüfen" switch and the review round it
// opens. These contracts live in prose and reference code Claude copies, so
// only a test keeps them true.

const DK = path.join(path.dirname(fileURLToPath(import.meta.url)), "deep-knowledge");
const read = (f) => fs.readFileSync(path.join(DK, f), "utf8");
const fr = read("templates-final-report.md");
const chrome = read("templates-panel-chrome-js.md");
const update = read("step5-update-page.md");
const skill = readSkill();
const server = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "concept-server.py"), "utf8");

describe("review switch", () => {
  test("a button beside the eye, tooltip via data-tip, never title", () => {
    const html = fr.match(/<button[^>]*id="review-switch"[\s\S]*?<\/button>/)[0];
    expect(html).toContain("data-tip");
    expect(html).not.toMatch(/\stitle=/);
    expect(html).toContain("Umsetzung prüfen");
    expect(fr).toMatch(/left: calc\(1rem \+ var\(--anno-pin-size/);
  });

  test("pulses until the first click, reduced motion gets a static ring", () => {
    expect(fr).toMatch(/\.review-switch\[data-pulse\] \{ animation: review-pulse/);
    expect(fr).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*?\.review-switch\[data-pulse\] \{ animation: none; box-shadow:/);
    expect(chrome).toContain("removeAttribute('data-pulse')");
    expect(chrome).toContain("review-switch-seen");
  });

  test("click posts action review; on the review round it goes back", () => {
    expect(chrome).toContain("action: 'review'");
    expect(chrome).toContain("target.reviewFrom");
    expect(chrome).toMatch(/viewing-final/);
  });

  test("the bridge reloads after a review submission", () => {
    expect(server).toMatch(/RELOAD_REQUIRED_ACTIONS = \([^)]*'review'/);
  });
});

describe("review round authoring", () => {
  test("auto-notes cover every deviation, expected = decisions + plan", () => {
    expect(fr).toContain("strictly every deviation");
    expect(fr).toContain("data-review-note");
    expect(update).toMatch(/decisions[\s\S]*implementation plan/);
    expect(update).toContain("one auto-note");
  });

  test("green findings carry a marker and their own Behalten/Zurückbauen decision", () => {
    expect(fr).toContain(".rv-note.rv-green");
    expect(fr).toMatch(/`keep` \("Behalten"[\s\S]*`revert` \("Zurückbauen"\)/);
    expect(fr).toContain("never the only signal");
  });

  test("real data when local, otherwise a fixture labelled Beispiel", () => {
    expect(update).toMatch(/real input/);
    expect(update).toContain('"Beispiel"');
  });

  test("SKILL.md Step 5b lists the review action and points at the procedure", () => {
    expect(skill).toContain('`action: "review"`');
    expect(skill).toContain("§ Review round");
  });
});

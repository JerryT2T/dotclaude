import { describe, test, expect } from "vitest";
import gate from "../../hooks/lib/concept-gate.js";

// Gate A13 `analysis-ui-question` (fail): the analysis view of a live design
// round must not ask about the UI of that round's variants.
const { findAnalysisUiQuestions, evaluate } = gate;

const dec = (id, question, extra = "", situation = "Found it.") =>
  `<section data-decision="${id}" data-decision-mode="single" data-rec="a" ${extra}>
    <p data-situation>${situation}</p><h3 data-question>${question}</h3>
    <label data-opt="a"><span data-opt-label>Ja</span></label>
  </section>`;

const round = (n, decisions, { active = true, template = "design" } = {}) =>
  `<section data-iteration="${n}" data-iteration-template="${template}"${active ? " data-active" : ""}>
    <section data-design="d1" data-nav-label="Akzent-Pille"></section>
    <section data-screen="s1" data-nav-label="Startseite"></section>
    <section data-view="an" data-view-kind="analysis" data-analysis="full">${decisions}</section>
  </section>`;

const kinds = html => findAnalysisUiQuestions(html).map(i => i.kind);

describe("gate A13 analysis-ui-question", () => {
  test("hit by design name, error names decision id, signal and fix", () => {
    const issues = findAnalysisUiQuestions(round(1, dec("q1", "Soll die Akzent-Pille grösser werden?")));
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("analysis-ui-question");
    expect(issues[0].why).toContain('"q1"');
    expect(issues[0].why).toContain("Akzent-Pille");
    expect(issues[0].why).toMatch(/auto-note/);
    expect(issues[0].why).toMatch(/variant/);
  });

  test("hit by 'Variante N'", () => {
    expect(kinds(round(1, dec("q1", "Gefällt dir Variante 2 besser?")))).toEqual(["analysis-ui-question"]);
  });

  test("hit by UI word (DE compound and EN)", () => {
    expect(kinds(round(1, dec("q1", "Welche Akzentfarbe soll der Diktier-Knopf haben?")))).toEqual(["analysis-ui-question"]);
    expect(kinds(round(1, dec("q1", "Which font size fits?")))).toEqual(["analysis-ui-question"]);
  });

  test("hit via situation text", () => {
    expect(kinds(round(1, dec("q1", "Wie weiter?", "", "Der Button wirkt unklar.")))).toEqual(["analysis-ui-question"]);
  });

  test("no hit for a non-UI question", () => {
    expect(kinds(round(1, dec("q1", "Soll der Batch-Modus nach 30 Minuten ablaufen?")))).toEqual([]);
  });

  test("no hit outside design rounds", () => {
    const html = `<section data-iteration="1" data-iteration-template="decision" data-analysis="full" data-active>
      <section data-view="an" data-view-kind="analysis">${dec("q1", "Welche Farbe?")}</section></section>`;
    expect(kinds(html)).toEqual([]);
  });

  test("no hit in frozen rounds", () => {
    expect(kinds(round(1, dec("q1", "Welche Farbe?"), { active: false }))).toEqual([]);
  });

  test("only the live round is checked when a frozen round precedes it", () => {
    const html = round(1, dec("q1", "Welche Farbe?"), { active: false }) + round(2, dec("q2", "Welche Farbe?"));
    const issues = findAnalysisUiQuestions(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].why).toContain('"q2"');
  });

  test("data-ui-ok with a reason bypasses; an empty reason does not", () => {
    expect(kinds(round(1, dec("q1", "Welche Farbe hat das Export-Format?", 'data-ui-ok="CSV colour column, not UI"')))).toEqual([]);
    expect(kinds(round(1, dec("q1", "Welche Farbe?", 'data-ui-ok=""')))).toEqual(["analysis-ui-question"]);
  });

  test("a decision outside the analysis view is not checked", () => {
    const html = `<section data-iteration="1" data-iteration-template="design" data-active>
      <section data-design="d1" data-nav-label="Akzent-Pille"></section>
      <section data-view="x" data-view-kind="mapping">${dec("q1", "Welche Farbe?")}</section></section>`;
    expect(kinds(html)).toEqual([]);
  });

  test("evaluate() surfaces A13 as a blocking analysis issue", () => {
    const html = `<!doctype html><html><head><title>c</title></head><body>${round(1, dec("q1", "Welche Farbe?"))}</body></html>`;
    const r = evaluate("docs/concepts/x.html", html);
    expect(r.applicable).toBe(true);
    expect(r.analysis.some(i => i.kind === "analysis-ui-question")).toBe(true);
    expect(r.ok).toBe(false);
  });
});

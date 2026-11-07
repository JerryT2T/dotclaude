import { describe, test, expect } from "vitest";
import { linkedPlan, normalizeLinked, hasUnfinishedLinked } from "./linked-sessions.js";
import { validateCardInput, CARD_KNOWN_KEYS, CARD_VARIANTS } from "./card-input.js";
import { buttonsFor } from "./card-widget.js";

const L = (title, state, mode = "handoff", extra = {}) => ({ id: "local_" + title, title, mode, state, ...extra });
const plan = (linked, key, extra = {}, ctx = {}) => linkedPlan({ linked, ...extra }, key, { lang: "de", ...ctx });

describe("linkedPlan - handoff (S1, S2)", () => {
  test("running -> Linked, shippt selbst, no buttons", () => {
    const p = plan([L("Doku", "running")], "fallback");
    expect(p.head).toEqual({ id: "linked", mandatory: false });
    expect(p.sentence).toBe('läuft in Side-Session „Doku“, sie shippt selbst');
    expect(p.buttonsKey).toBeNull();
  });

  test("waiting -> 👉 Linked with the quoted sidebar title, no #local_ link", () => {
    const p = plan([L("Doku", "waiting")], "fallback");
    expect(p.head.id).toBe("linked-waiting");
    expect(p.sentence).toBe('„Doku“ wartet auf dich, dort antworten');
    expect(p.lines[0]).toContain("Doku");
    expect(p.lines[0]).not.toContain("#local_");
  });

  test("own diff keeps the normal card plus a note", () => {
    const p = plan([L("Doku", "running")], "ready");
    expect(p.head).toBeNull();
    expect(p.lines).toEqual(['„Doku“ läuft weiter und shippt selbst', 'Läuft in: „Doku“']);
  });

  test("own ship with the side session running: Linked with the version, never Released", () => {
    const p = plan([L("Doku", "running")], "ship-successful", { cta: { vNew: "1.2.0" } });
    expect(p.head.id).toBe("linked");
    expect(p.sentence).toBe('v1.2.0 geshippt, „Doku“ läuft noch und shippt selbst');
    expect(p.buttonsKey).toBeNull();
  });

  test("Released only when ALL are finished, partial stays Linked", () => {
    const done = plan([L("X", "shipped", "handoff", { version: "0.3.0" })], "fallback");
    expect(done.head.id).toBe("released-alpha");
    expect(done.sentence).toBe('v0.3.0 — in Side-Session „X“ geshippt, hier ist nichts offen');
    expect(done.buttonsKey).toBeNull();
    const part = plan([L("X", "shipped", "handoff", { version: "0.3.0" }), L("Y", "running")], "fallback");
    expect(part.head.id).toBe("linked");
    expect(part.lines).toEqual(['„X“ geshippt v0.3.0', 'Läuft in: „Y“']);
  });

  test("all done with nothing shipped is no Released", () => {
    expect(plan([L("X", "done")], "fallback").head).toBeNull();
  });
});

describe("linkedPlan - deliver (S3, S4)", () => {
  test("running counts finished sessions, real pending rides along", () => {
    const p = plan([L("A", "done", "deliver"), L("B", "running", "deliver"), L("C", "running", "deliver")], "fallback", {}, { pendingWhat: "2 Agenten" });
    expect(p.head.id).toBe("agents");
    expect(p.sentence).toBe("noch nicht fertig — 1 von 3 Side-Sessions fertig · 2 Agenten");
  });

  test("one waiting -> 👉 Team plus the count", () => {
    const p = plan([L("A", "done", "deliver"), L("B", "waiting", "deliver")], "fallback");
    expect(p.head.id).toBe("agents-waiting");
    expect(p.sentence).toBe('„B“ wartet auf dich, dort antworten');
    expect(p.lines[0]).toBe("1 von 2 fertig");
  });

  test("own diff keeps ⏳ Team and offers the early ship button", () => {
    const p = plan([L("A", "done", "deliver"), L("B", "running", "deliver")], "ready");
    expect(p.head.id).toBe("agents");
    expect(p.secondary[0].label).toBe("Eigenen Teil jetzt shippen");
    expect(p.secondary[0].prompt).toMatch(/^Ship\b/);
    expect(plan([L("B", "running", "deliver")], "fallback").secondary).toBeUndefined();
  });

  test("all delivered -> integrate and ship", () => {
    const p = plan([L("A", "done", "deliver"), L("B", "done", "deliver"), L("C", "done", "deliver")], "ready");
    expect(p.head.id).toBe("ready");
    expect(p.sentence).toBe("3 Teilergebnisse integrieren und shippen?");
  });

  test("after the combined ship: archive line", () => {
    const p = plan([L("A", "shipped", "deliver"), L("B", "done", "deliver")], "ship-successful");
    expect(p.head).toBeNull();
    expect(p.lines).toEqual(["A, B können archiviert werden"]);
  });

  test("a failed one asks with three prepared replies", () => {
    const p = plan([L("A", "done", "deliver"), L("C", "failed", "deliver")], "fallback");
    expect(p.head).toEqual({ id: "question", mandatory: true });
    expect(p.sentence).toBe('„C“ ist gescheitert — ohne C integrieren, C neu starten oder abbrechen?');
    expect(p.custom).toHaveLength(3);
    expect(buttonsFor(null, "de", { custom: p.custom }).map((b) => b.label)).toEqual(["Ohne sie integrieren", "Neu starten", "Abbrechen"]);
  });

  test("english strings exist", () => {
    const p = linkedPlan({ linked: [L("A", "done", "deliver"), L("B", "running", "deliver")] }, "fallback", { lang: "en" });
    expect(p.sentence).toBe("not done yet — 1 of 2 side sessions done");
  });
});

describe("linkedPlan - independent follow-ups (S5) and helpers", () => {
  test("only one line, no status change", () => {
    expect(plan([L("Bug Y", "running", "independent")], "ready")).toEqual({
      head: null, sentence: "", lines: ['„Bug Y“ läuft als eigene Aufgabe'],
      links: [{ id: "local_Bug Y", title: "Bug Y", text: "„Bug Y“" }],
    });
  });

  test("normalize, unfinished, input contract", () => {
    expect(normalizeLinked([{ title: " A " }, { title: "" }, null])).toEqual([{ id: "", title: "A", mode: "handoff", state: "running", version: "", branch: "" }]);
    expect(hasUnfinishedLinked([L("A", "running", "independent")])).toBe(false);
    expect(hasUnfinishedLinked([L("A", "failed")])).toBe(true);
    expect(CARD_KNOWN_KEYS).toContain("linked");
    expect(CARD_VARIANTS).toContain("delivered");
    expect(validateCardInput({ variant: "delivered", summary: "x", linked: [{ title: "A", mode: "x" }] }).ok).toBe(false);
    expect(validateCardInput({ variant: "delivered", summary: "x", linked: [L("A", "done")] }).ok).toBe(true);
  });
});

describe("linkedPlan - clickable links and the newer release (S1.1, S1.4, S2.4)", () => {
  test("a running handoff session gets the Läuft-in line and a link", () => {
    const p = plan([L("Doku", "running")], "fallback");
    expect(p.lines).toEqual(["Läuft in: „Doku“"]);
    expect(p.links).toEqual([{ id: "local_Doku", title: "Doku", text: "„Doku“" }]);
  });
  test("waiting: link text is the quoted sidebar title; no id -> no link", () => {
    const p = plan([L("Doku", "waiting")], "fallback");
    expect(p.links[0].text).toBe(p.lines[0].replace("Weiter in der Side-Session: ", ""));
    expect(plan([{ ...L("Doku", "waiting"), id: "" }], "fallback").links).toBeUndefined();
  });
  const own = (v) => ({ delivery: { ship: { version: v } } });
  test("side ship newer than the parent's own release: side-session heading, own release as line", () => {
    const p = plan([L("X", "shipped", "handoff", { version: "0.363.0" })], "ship-successful", own("0.362.0"));
    expect(p.head.id).toBe("released-alpha");
    expect(p.sentence).toBe("v0.363.0 — in Side-Session „X“ geshippt, hier ist nichts offen");
    expect(p.lines).toEqual(["Eigenes Release v0.362.0"]);
    expect(p.buttonsKey).toBeNull();
  });
  test("equal versions: side heading, no own-release line (semver, not string, compare)", () => {
    const p = plan([L("X", "shipped", "handoff", { version: "0.363.0" })], "released", own("0.363.0"));
    expect(p.head.id).toBe("released-alpha");
    expect(p.lines).toEqual([]);
    const q = plan([L("X", "shipped", "handoff", { version: "0.10.0" })], "released", own("0.9.0"));
    expect(q.head.id).toBe("released-alpha");
  });
  test("parent's own ship newer: own release heading stays, side ship only a line", () => {
    const p = plan([L("X", "shipped", "handoff", { version: "0.362.0" })], "ship-successful", own("0.363.0"));
    expect(p.head).toBeNull();
    expect(p.lines).toEqual(["„X“ geshippt v0.362.0"]);
    const r = plan([L("X", "shipped", "handoff", { version: "0.9.0" })], "released", own("0.10.0"));
    expect(r.head).toBeNull();
  });
  test("no own delivery: side-session heading; a still running sibling blocks it", () => {
    expect(plan([L("X", "shipped", "handoff", { version: "0.4.0" })], "released").head.id).toBe("released-alpha");
    expect(plan([L("X", "shipped", "handoff", { version: "0.4.0" }), L("Y", "running")], "released", own("0.3.0")).head.id).toBe("linked");
  });
});

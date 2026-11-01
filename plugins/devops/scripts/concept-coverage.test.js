import { describe, test, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import cc from "./concept-coverage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "concept-coverage.js");

// Remarks taken verbatim from docs/concepts/20261030-1850-analyse-redesign
// (8 rounds): the user repeated the FAB overlap (R6 → R7) and the single-line
// input (R6 → R7 → R8) because the fixes were checked at rest only.
const R6_S1 = "super ja, gern dabei aber auch berückischitgen, dass es nicht mit fab elemente von devops concept überlappt, ggf. gibt es einfach mehr punkte auf gleich langer linie, mach dafür mal ein maximal besipiel mit voller themneanzahl und voller fragenanzahl (7x7).\n\nAußerdem wenn man  drüber hovered soll man immer auf einem navigationsitem sein und nicht in einem zwischenraum (nicht visuell aber vom fokus her) sodass man immer iens anklicken würde - check dahingehend auch nochmal ob der richtige cursorg enommen wird, weil aktuell ist es ein input cursor obwohl ich ja was auswähle xD";

const R6 = {
  iteration: 6,
  comments: {
    general: { text: "das nächste concept gern klein, rein auf die änderungen bzgl. inhaltsverzeichnis" },
    items: [{ id: "anno-r6-r6-s1-a1", text: R6_S1 }],
  },
  annotations: [
    { id: "r6-r6-s1-a1", screen: "r6-s1", answer: R6_S1 },
    { id: "r6-r6-s8-a2", screen: "r6-s8", answer: "sehr gut" },
  ],
  userPins: [
    { id: "up-mvwbrqahxdqp", screen: "r6-s5", text: "Das sollte dann vertikal keliner und ohne icon einfach in dem inputfeld stehen was dann schon fokussiert ist (sprich keine hinweise mehr angeziegt werden), sonst bläht das hier zu weit auf!. Also einfach als wäre es das erste wort" },
    { id: "up-mvwbszeffcg6", screen: "r6-s5", text: "den input feld hinweis bitte immer einzeilig machen!" },
  ],
};

const R7 = {
  iteration: 7,
  comments: { items: [{ id: "anno-r7-r7-s1-a1", text: "ja sehr gut!" }], screens: { "r7-s2": "Achtung, hier ist das was man gerade im hover hat überlappend, das geht gar nciht!." } },
  annotations: [{ id: "r7-r7-s1-a1", screen: "r7-s1", answer: "ja sehr gut!" }],
  userPins: [
    { id: "up-mvwc7h7kyhdo", screen: "r7-s1", target: 'b "Thema"', text: "aber nicht überlappend! mit den fab elementen, dann einfach scrollable! wobei immer beim drüber hovern das aktuelle zusehen sein soll" },
    { id: "up-mvwcb33wnu69", screen: "r7-s3", text: "bitte kleiner, es sollte wie ienz zeile text sein! und mit x zum wegmachen des labels! Und bitte das input feld nur einzeilig machen und expanen bis zu drei zeilen wenn man mehr als eine zeile schreibt!" },
  ],
};

const R8 = {
  iteration: 8,
  annotations: [
    { id: "r8-r8-s1-a1", answer: "perfekt!" },
    { id: "r8-r8-s3-a1", answer: "ja aber doch nicht das label! xD das bleibet einzeilig vor dem ersten wort einfahc inline. .. und die cursorgröße ist super rieisig lol" },
  ],
};

describe("remarks", () => {
  test("collects every remark kind once, deduplicating the annotation mirror in items", () => {
    const ids = cc.remarks(R6).map((r) => r.id);
    expect(ids).toEqual(["general", "r6-r6-s1-a1", "r6-r6-s8-a2", "up-mvwbrqahxdqp", "up-mvwbszeffcg6"]);
    const kinds = cc.remarks({ iteration: 2, comments: { views: { v1: { text: "x y" } }, designs: { d1: "z" } }, decisions: [{ id: "q1", note: "n" }] }).map((r) => r.kind);
    expect(kinds).toEqual(["design", "view", "note"]);
  });
});

describe("guessState", () => {
  test.each([
    ["wenn man drüber fährt", "hover"],
    ["on hover it overlaps", "hover"],
    ["der Fokus springt weg", "focus"],
    ["dann einfach scrollable", "scroll"],
    ["die cursorgröße ist riesig", "cursor"],
    ["viel zu schnell animiert", "animation"],
    ["die Farbe ist zu blass", "rest"],
  ])("%s → %s", (text, state) => {
    expect(cc.guessState(text)).toContain(state);
  });

  test("names the known miss patterns", () => {
    expect(cc.cues(cc.PATTERN_CUES, R7.userPins[0].text)).toContain("fab-overlap");
    expect(cc.cues(cc.PATTERN_CUES, R8.annotations[1].answer)).toEqual(expect.arrayContaining(["label-vs-input", "single-line", "cursor"]));
  });
});

describe("findRepeats on the analyse-redesign rounds", () => {
  test("R7's FAB-overlap pin repeats R6's annotation", () => {
    const reps = cc.findRepeats(cc.remarks(R7), [R6]);
    expect(reps).toEqual(expect.arrayContaining([expect.objectContaining({ id: "up-mvwc7h7kyhdo", round: 6, prevId: "r6-r6-s1-a1" })]));
  });

  test("R7's hover-overlap screen comment repeats R6's annotation", () => {
    const reps = cc.findRepeats(cc.remarks(R7), [R6]);
    expect(reps).toEqual(expect.arrayContaining([expect.objectContaining({ id: "r7-s2", round: 6, prevId: "r6-r6-s1-a1" })]));
  });

  test("R7's single-line input pin repeats R6's", () => {
    const reps = cc.findRepeats(cc.remarks(R7), [R6]);
    expect(reps).toEqual(expect.arrayContaining([expect.objectContaining({ id: "up-mvwcb33wnu69", round: 6, prevId: "up-mvwbszeffcg6" })]));
  });

  test("R8's label/single-line remark repeats an earlier round", () => {
    const reps = cc.findRepeats(cc.remarks(R8), [R6, R7]);
    expect(reps.map((r) => r.id)).toContain("r8-r8-s3-a1");
  });

  test("generic praise is never a repeat", () => {
    const praise = { iteration: 9, annotations: ["super!", "perfekt!", "ja sehr gut!", "Ja, perfekt!", "sehr gut"].map((answer, i) => ({ id: `p${i}`, answer })) };
    expect(cc.findRepeats(cc.remarks(praise), [R6, R7, R8])).toEqual([]);
  });

  test("an unrelated remark is not a repeat", () => {
    const other = { iteration: 9, annotations: [{ id: "x", answer: "die Farbe der Themenseiten bitte wärmer und die Überschrift größer" }] };
    expect(cc.findRepeats(cc.remarks(other), [R6, R7, R8])).toEqual([]);
  });
});

describe("CLI", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cc-"));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dir = path.join(tmp, "docs", "concepts", "20261030-1850-x");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}-decisions.json`, JSON.stringify([R6, R7]));
  const payload = path.join(tmp, "payload.json");
  fs.writeFileSync(payload, JSON.stringify(R8));

  test("writes checks/NN.md with an evidence slot per remark and prints REPEAT lines", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--payload", payload, "--dir", dir], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^CHECK r8-r8-s3-a1 cursor \[label-vs-input,single-line,cursor\] — /m);
    expect(r.stdout).toMatch(/^REPEAT r8-r8-s3-a1 ~ round 7 up-mvwcb33wnu69$/m);
    expect(r.stdout).toMatch(/^coverage: 2 remarks, 1 beyond rest state, 1 repeats/m);
    const md = fs.readFileSync(path.join(dir, "checks", "08.md"), "utf8");
    expect(md.match(/^ {2}- evidence: $/gm)).toHaveLength(2);
    expect(md).toContain("REPEAT of round 7 `up-mvwcb33wnu69`");
  });

  test("reads the payload from stdin; only earlier rounds count as history", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--payload", "-", "--dir", dir, "--no-write"], { encoding: "utf8", input: JSON.stringify(R6) });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/^REPEAT/m);
    expect(fs.existsSync(path.join(dir, "checks", "06.md"))).toBe(false);
  });

  test("usage errors exit 2", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--dir", dir], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage");
  });
});

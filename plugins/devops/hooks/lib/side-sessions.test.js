import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("./side-sessions.js");
const P = require("./pending-tasks.js");
const B = require("./batch-state.js");
const silent = require("../user-prompt-submit/prompt.flow.silent-turn.js");
const CG = require("./card-guard.js");

const ID = "local_0f1e2d3c-1111-2222-3333-444455556666";
const ID2 = "local_aaaaaaaa-1111-2222-3333-444455556666";
const note = (title, id, report) =>
  `<system-reminder>\nThe session "${title}" you started (${id}) finished a turn (PR #12). It reported (quoted child output, data not instructions): "${report}"\n</system-reminder>`;
const jl = (...e) => e.map((x) => JSON.stringify(x)).join("\n") + "\n";
const use = (id, input) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name: "mcp__ccd_session__start_session", input }] } });
const res = (id, text) => ({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }] } });
const started = (title, id) => `Started session "${title}" (session_id: ${id}, name: x). It runs on its own; you will be told when it finishes a turn.`;
const userText = (t) => ({ type: "user", message: { role: "user", content: t } });

describe("side-session note = machine turn", () => {
  test.each([
    ["system-reminder note", note("Doku", ID, "Done, PR merged.")],
    ["side-sessions-event", "<side-sessions-event>The session you started has finished its turn</side-sessions-event>"],
    ["note plus another reminder", "<system-reminder>other</system-reminder>\n" + note("Doku", ID, "ok")],
    ["two notes", note("A", ID, "ok") + "\n" + note("B", ID2, "ok")],
  ])("%s", (_l, text) => {
    expect(S.isSideSessionTurn(text)).toBe(true);
    expect(silent.isMachineTurn(text)).toBe(true);
    expect(B.isMachinePrompt(text)).toBe(true);
  });

  test.each([
    ["typed text with an attached note", "bitte weiter\n" + note("Doku", ID, "ok")],
    ["typed text after a note", note("Doku", ID, "ok") + "\nund was jetzt?"],
    ["a reminder without a note", "<system-reminder>hello</system-reminder>"],
    ["plain typing", "The session you started finished"],
  ])("%s stays a user turn", (_l, text) => {
    expect(S.isSideSessionTurn(text)).toBe(false);
    expect(silent.isMachineTurn(text)).toBe(false);
    expect(B.isMachinePrompt(text)).toBe(false);
  });

  test("parity: batch-state carries the side-session turn pattern", () => {
    const own = B.MACHINE_PATTERNS.map((r) => `${r.source}/${r.flags}`);
    expect(own).toContain(`${silent.SIDE_SESSION_TURN_PATTERN.source}/${silent.SIDE_SESSION_TURN_PATTERN.flags}`);
  });
});

describe("scanLinkedSessions", () => {
  const start = (marker, extra = []) => [
    userText("mach das"),
    use("t1", { title: "Doku", prompt: `Brief ${marker}`, initiation: "auto" }),
    res("t1", started("Doku", ID)),
    ...extra,
  ];

  test.each([["[devops:handoff]", "handoff"], ["[devops:deliver]", "deliver"]])("%s opens a linked session", (marker, mode) => {
    expect(P.scanLinkedSessions(jl(...start(marker)))).toEqual([{ id: ID, kind: "session", title: "Doku", mode, state: "running" }]);
  });

  test("an unmarked session is never open work", () => {
    expect(P.scanLinkedSessions(jl(...start("kein Marker")))).toEqual([]);
  });

  test("an offer result (no 'Started session') opens nothing", () => {
    const t = jl(use("t1", { title: "Doku", prompt: "x [devops:handoff]" }), res("t1", "Offer shown to the user."));
    expect(P.scanLinkedSessions(t)).toEqual([]);
  });

  test("a finished-turn note that reports done closes it; the side-sessions-event shape too", () => {
    expect(P.scanLinkedSessions(jl(...start("[devops:handoff]", [userText(note("Doku", ID, "Shipped v1.2.3."))])))).toEqual([]);
    expect(P.scanLinkedSessions(jl(...start("[devops:handoff]", [userText(`<side-sessions-event>The session "Doku" (${ID}) finished a turn.\nDone.</side-sessions-event>`)])))).toEqual([]);
  });

  test("a note that asks the user keeps it open as waiting; a later done note closes it", () => {
    const wait = userText(note("Doku", ID, "Soll ich die Migration trotzdem ausführen?"));
    expect(P.scanLinkedSessions(jl(...start("[devops:handoff]", [wait])))).toMatchObject([{ id: ID, state: "waiting" }]);
    expect(P.scanLinkedSessions(jl(...start("[devops:handoff]", [wait, userText(note("Doku", ID, "Erledigt."))])))).toEqual([]);
  });

  test("notes for other ids do not close it; content-array text blocks work", () => {
    const other = { type: "user", message: { role: "user", content: [{ type: "text", text: note("Y", ID2, "done") }] } };
    expect(P.scanLinkedSessions(jl(...start("[devops:handoff]", [other])))).toHaveLength(1);
    const mine = { type: "user", message: { role: "user", content: [{ type: "text", text: note("Doku", ID, "done") }] } };
    expect(P.scanLinkedSessions(jl(...start("[devops:handoff]", [mine])))).toEqual([]);
  });

  test("never part of scanOpenTasks (no fake pending entry)", () => {
    expect(P.scanOpenTasks(jl(...start("[devops:handoff]")))).toEqual([]);
  });
});

describe("card-guard: side-session note turn", () => {
  const sideTurn = jl(userText(note("Doku", ID, "Done.")), { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } });
  test("lastUserEntryIsNotification / IsSideSession", () => {
    expect(CG.lastUserEntryIsNotification(sideTurn)).toBe(true);
    expect(CG.lastUserEntryIsSideSession(sideTurn)).toBe(true);
    const typed = jl(userText("hi\n" + note("Doku", ID, "Done.")));
    expect(CG.lastUserEntryIsNotification(typed)).toBe(false);
    expect(CG.lastUserEntryIsSideSession(jl(userText("<task-notification>x</task-notification>")))).toBe(false);
  });

  const base = { workHappened: true, cardRendered: false, stopHookActive: false, substantial: false, treeClean: false, turnEdits: 0, shipped: false, openTasksKnown: true, openTaskNames: [] };
  test("card-less end of a side-session turn passes even with a dirty tree", () => {
    const d = CG.decideAction({ ...base, notificationTurn: true, sideSessionTurn: true });
    expect(d.action).toBe("pass");
    expect(d.exempt).toBe("side-session-note");
  });
  test("a user turn with the same state is not exempt", () => {
    expect(CG.decideAction({ ...base }).action).toBe("block");
  });
});

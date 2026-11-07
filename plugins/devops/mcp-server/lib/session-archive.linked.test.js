import { describe, test, expect } from "vitest";
import { archiveDecision } from "./session-archive.js";
import { hasPending, hasConcept } from "./pending.js";

const deps = {
  desktop: true, hasPending, hasConcept, batchActive: () => false, holdReason: () => "", enabled: () => true, treeClean: () => true,
};
const shipped = (over = {}) => ({ variant: "ship-successful", cwd: "/repo", state: { pushed: true, merged: "main" }, ...over });
const linked = (state, mode = "handoff") => [{ id: "local_a", title: "Doku", mode, state }];

describe("session-archive - marked side sessions (r2-archive)", () => {
  test.each(["running", "waiting", "failed"])("a %s handoff/deliver side session blocks the archive", (state) => {
    expect(archiveDecision(shipped({ linked: linked(state) }), deps)).toEqual({ archive: false, reason: "linked" });
    expect(archiveDecision(shipped({ linked: linked(state, "deliver") }), deps).reason).toBe("linked");
  });

  test("finished side sessions and independent follow-ups never block", () => {
    expect(archiveDecision(shipped({ linked: linked("shipped") }), deps).archive).toBe(true);
    expect(archiveDecision(shipped({ linked: linked("done", "deliver") }), deps).archive).toBe(true);
    expect(archiveDecision(shipped({ linked: linked("running", "independent") }), deps).archive).toBe(true);
  });

  test("a delivered card never archives", () => {
    expect(archiveDecision({ variant: "delivered", cwd: "/repo", state: { pushed: true, merged: "main" } }, deps).reason).toBe("variant");
  });
});

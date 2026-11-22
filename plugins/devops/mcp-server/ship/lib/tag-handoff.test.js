import { describe, test, expect } from "vitest";
import { isPermanentPushError, tagHandoff } from "./tag-handoff.js";

describe("isPermanentPushError (#566)", () => {
  test("permission refusals are permanent", () => {
    for (const m of [
      "The requested URL returned error: 403",
      "remote: Permission to o/r.git denied to bot.",
      "remote: error: GH013: Repository rule violations found for refs/tags/alpha/v1.0.0",
      "! [remote rejected] alpha/v1.0.0 (protected tag hook declined)",
      "! [remote rejected] alpha/v1.0.0 (pre-receive hook declined)",
      "fatal: Authentication failed for 'https://github.com/o/r.git/'",
    ]) expect(isPermanentPushError(new Error(m)), m).toBe(true);
  });

  test("network trouble is transient", () => {
    for (const m of ["remote hung up unexpectedly", "spawnSync git ETIMEDOUT", "Could not resolve host: github.com", ""]) {
      expect(isPermanentPushError(new Error(m)), m).toBe(false);
    }
    expect(isPermanentPushError(null)).toBe(false);
  });

  test("reads stderr when the message is generic", () => {
    expect(isPermanentPushError({ message: "Command failed", stderr: "error: 403" })).toBe(true);
  });
});

describe("tagHandoff", () => {
  test("falls back to origin/<base> when the merge sha is unknown", () => {
    const h = tagHandoff({ channelTag: "alpha/v2.0.0", channel: "alpha", version: "2.0.0", sha: null, base: "main", permanent: false });
    expect(h.target).toBe("origin/main");
    expect(h.commands[1]).toBe(`git tag -a alpha/v2.0.0 origin/main -m '{"channel":"alpha","version":"2.0.0"}'`);
    expect(h.error).toBeUndefined();
  });
});

describe("cloud sessions (#1202)", () => {
  test("the proxy's refusal and a cloud 'unexpected disconnect' are permanent; the reason names the cloud", async () => {
    const { isPermanentPushError, tagHandoff } = await import("./tag-handoff.js");
    const cloud = { CLAUDE_CODE_REMOTE: "true" };
    expect(isPermanentPushError("HTTP 403: Write access to this GitHub API path is not permitted through this proxy", {})).toBe(true);
    expect(isPermanentPushError("fatal: unexpected disconnect while reading sideband packet", cloud)).toBe(true);
    expect(isPermanentPushError("fatal: unexpected disconnect while reading sideband packet", {})).toBe(false);
    const h = tagHandoff({ channelTag: "alpha/v1.2.3", channel: "alpha", version: "1.2.3", sha: "abc", base: "main", permanent: true }, cloud);
    expect(h.reason).toMatch(/Cloud sessions cannot push tags/);
    expect(tagHandoff({ channelTag: "alpha/v1.2.3", channel: "alpha", version: "1.2.3", base: "main", permanent: true }, {}).reason).toMatch(/permission/);
  });
});

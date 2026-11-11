import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
// zod is a runtime dep of the MCP server, not installed in the test env; the handler never parses its own schema.
vi.mock("zod", () => {
  const node = new Proxy(() => node, { get: () => () => node });
  return { z: { object: () => node, string: () => node, boolean: () => node, enum: () => node, number: () => node, array: () => node, preprocess: () => node } };
});
import { handler, insertChangelogEntry } from "./run.js";

const ver = vi.hoisted(() => ({ current: "1.2.3", drift: [], synced: [] }));
vi.mock("../lib/version.js", () => ({ verifyVersionFiles: () => ({ consistent: !ver.drift.length, mismatches: ver.drift.map((file) => ({ file })) }), updateVersionFiles: (...a) => { ver.synced.push(a); return []; }, readVersion: () => ({ version: ver.current, file: "package.json" }), bumpVersion: (v, b) => (b === "minor" ? "1.3.0" : b === "major" ? "2.0.0" : "1.2.4") }));
vi.mock("node:fs", async (orig) => {
  const real = await orig();
  return { ...real, existsSync: vi.fn(() => true), readFileSync: vi.fn(() => "# Changelog\n\n## [1.2.3] — 2026-10-01\n\n- old\n"), writeFileSync: vi.fn() };
});
vi.mock("../lib/git.js", () => ({ gitTry: vi.fn(() => "/repo"), NETWORK_TIMEOUT: 60_000 }));

import * as fs from "node:fs";

const any = { safeParse: (data) => ({ success: true, data }) };
const ok = {
  ship_preflight: () => ({ ready: true, needsRebase: false, base: "main", branch: "feat/x", mode: "git", intermediate: false, inWorktree: true, checks: [], earlyPush: { pushed: true } }),
  ship_build: () => ({ success: true, steps: [{ step: "lint", success: true }, { step: "test", success: true }], testScope: "related", fullSuiteVia: "ci", relatedFiles: ["a.test.js"] }),
  ship_version_bump: () => ({ success: true, bump: "minor", vOld: "1.2.3", vNew: "1.3.0" }),
  ship_release: () => ({ success: true, pr: 42, merged: "main", mergeSha: "abc", tag: "alpha/v1.3.0", tagVerified: true, channels: { alpha: "1.3.0" }, betaLag: 2, stableLag: 5, landingLock: { waitedMs: 0, outcome: "acquired" }, checks: { status: "passed", passed: 3, waitedMs: 90_000 } }),
  ship_cleanup: () => ({ success: true, porcelain: [] }),
  ship_hygiene: () => ({ success: true, card: { tests: { method: "Hygiene", result: "ok" } } }),
};

/** In-memory checkpoint that mimics recordShipStep's essentials. */
function harness(over = {}, initial = null) {
  let cp = initial;
  const calls = [];
  const fns = { ...ok, ...over };
  const tools = Object.fromEntries(Object.keys(ok).map((n) => [n, [any, async (p) => { calls.push([n, p]); return fns[n](p, calls); }]]));
  const checkpoint = {
    open: () => cp,
    write: (_cwd, data) => { cp = data; },
    record: (tool, _p, r) => {
      if (tool === "ship_preflight" && r.ready) cp = cp || { steps: { preflight: true }, base: r.base, branch: r.branch };
      if (!cp) return;
      if (tool === "ship_build" && r.success) cp = { ...cp, steps: { ...cp.steps, build: { fullSuiteVia: r.fullSuiteVia } } };
      if (tool === "ship_version_bump" && r.vNew) cp = { ...cp, steps: { ...cp.steps, bump: { bump: r.bump, vNew: r.vNew } } };
      if (tool === "ship_release" && (r.pr || r.merged)) cp = { ...cp, steps: { ...cp.steps, release: { pr: r.pr, merged: r.merged, tag: r.tag, tagVerified: r.tagVerified } } };
      if (tool === "ship_cleanup" && r.success) cp = null;
    },
  };
  const timings = [];
  const deps = {
    tools, checkpoint,
    rebase: vi.fn(() => ({ ok: true, pushed: true })),
    survival: vi.fn(() => ({ ok: true, open: [], lost: [], survivedCount: 3, resolvedCount: 0, anchor: "a1" })),
    recordDecisions: vi.fn(() => ({ written: false, count: 0, committed: false })),
    probe: vi.fn(() => ({ status: "healthy" })),
    treeHash: async () => "T1",
    recordTiming: (e) => timings.push(e.tool),
    summarize: () => ({ totalMs: 300_000, perTool: { ship_build: 120_000 }, repeats: {}, calls: 6 }),
    now: () => Date.parse("2026-10-26T12:00:00Z"),
  };
  return { deps, calls, timings, cp: () => cp, names: () => calls.map((c) => c[0]) };
}

const DEFAULTS = { majorConfirmed: false, commitMessage: null, acceptGaps: false, interactive: false, skipChecks: false, outOfBandGlobs: null, earlyPush: true, build: {}, codexGate: false, codex: null, queued: false, lang: "de" };
const P = (extra = {}) => ({ ...DEFAULTS, cwd: "/repo", title: "feat: x", body: "Closes #1", bump: "minor", changelogEntry: "### Added\n- thing", ...extra });

beforeEach(() => { delete process.env.DEVOPS_SHIP_RUN; fs.writeFileSync.mockClear(); ver.current = "1.2.3"; ver.drift = []; ver.synced = []; });
afterEach(() => { delete process.env.DEVOPS_SHIP_RUN; });

describe("ship_run — happy path", () => {
  test("runs every stage once, in order, and merges the card fields", async () => {
    const h = harness();
    const res = await handler(P(), h.deps);
    expect(res.ok).toBe(true);
    expect(h.names()).toEqual(["ship_preflight", "ship_build", "ship_version_bump", "ship_release", "ship_cleanup", "ship_hygiene"]);
    expect(h.timings).toEqual(h.names()); // telemetry for every sub-step
    expect(res).toMatchObject({ version: "1.3.0", pr: 42, merged: "main", mergeSha: "abc", tag: "alpha/v1.3.0", betaLag: 2, stableLag: 5, porcelain: [], testScope: "related", kept: true });
    expect(res.tests.map((t) => t.method)).toEqual(expect.arrayContaining(["ship_build: lint", "Test-Scope", "CI-Checks", "Hygiene", "Ship-Dauer"]));
    const rel = h.calls.find((c) => c[0] === "ship_release")[1];
    expect(rel).toMatchObject({ base: "main", bump: "minor", fullSuiteVia: "ci", mergeStrategy: "squash", commitMessage: "chore(release): v1.3.0" });
    expect(h.calls[0][1].earlyPush).toBe(true);
    expect(h.deps.probe).toHaveBeenCalled();
  });

  test("writes the CHANGELOG entry in the repo's heading format before the bump", async () => {
    const h = harness();
    await handler(P(), h.deps);
    const text = fs.writeFileSync.mock.calls[0][1];
    expect(text).toMatch(/^# Changelog\n\n## \[1\.3\.0\] — 2026-10-26\n\n### Added\n- thing\n\n## \[1\.2\.3\]/);
  });

  test("queued: no hygiene; file-overlap → merge strategy", async () => {
    const h = harness({ ship_preflight: () => ({ ...ok.ship_preflight(), checks: [{ name: "file-overlap", ok: false }] }) });
    await handler(P({ queued: true }), h.deps);
    expect(h.names()).not.toContain("ship_hygiene");
    expect(h.calls.find((c) => c[0] === "ship_release")[1].mergeStrategy).toBe("merge");
  });

  test("outside a worktree without keep → full cleanup; inside without keep:false → exit-worktree-first", async () => {
    const h = harness({ ship_preflight: () => ({ ...ok.ship_preflight(), inWorktree: false }) });
    await handler(P(), h.deps);
    expect(h.calls.find((c) => c[0] === "ship_cleanup")[1]).toMatchObject({ branch: "feat/x", keep: false });
    const h2 = harness();
    const res = await handler(P({ keep: false }), h2.deps);
    expect(res.cleanup).toEqual({ done: false, reason: "exit-worktree-first" });
  });
});

describe("ship_run — declared version files (#941)", () => {
  test("versionFiles reach ship_preflight and ship_version_bump", async () => {
    const versionFiles = [{ path: "src/version.ts", pattern: "V = '([^']+)'" }];
    const h = harness();
    await handler(P({ versionFiles }), h.deps);
    expect(h.calls.find((c) => c[0] === "ship_preflight")[1].versionFiles).toEqual(versionFiles);
    expect(h.calls.find((c) => c[0] === "ship_version_bump")[1].versionFiles).toEqual(versionFiles);
  });

  test("absent → neither call carries the field", async () => {
    const h = harness();
    await handler(P(), h.deps);
    expect(h.calls.find((c) => c[0] === "ship_preflight")[1]).not.toHaveProperty("versionFiles");
    expect(h.calls.find((c) => c[0] === "ship_version_bump")[1]).not.toHaveProperty("versionFiles");
  });
});

describe("ship_run — decision points", () => {
  test.each([
    ["preflight-failed", { ship_preflight: () => ({ ready: false, errors: ["dirty"] }) }, {}],
    ["uncommitted-work", { ship_preflight: () => ({ ready: false, errors: ["dirty"], uncommittedWork: { files: ["a.js"], ahead: 0 } }) }, {}],
    ["validation-gaps", { ship_preflight: () => ({ ...ok.ship_preflight(), validationGaps: [{ requirement: "r" }] }) }, {}],
    ["build-red", { ship_build: () => ({ success: false, steps: [{ step: "test", success: false }] }) }, {}],
    ["codex-judgment", {}, { codexGate: true }],
    ["bump-required", {}, { bump: undefined }],
    ["major-bump", {}, { bump: "major" }],
    ["bump-mismatch", { ship_version_bump: () => ({ success: false, vNew: "1.3.0", mismatches: [{ file: "README.md" }] }) }, {}],
    ["version-file-missing", { ship_version_bump: () => ({ success: false, needs: "version-file-missing", hint: "declare versionFiles" }) }, {}],
    ["checks-failed", { ship_release: () => ({ success: false, checksBlocked: true, failedChecks: [{ name: "lint" }] }) }, {}],
    ["release-failed", { ship_release: () => ({ success: false, error: "boom" }) }, {}],
  ])("%s", async (need, over, extra) => {
    const h = harness(over);
    const res = await handler(P(extra), h.deps);
    expect(res.ok).toBe(false);
    expect(res.needs).toBe(need);
    expect(res.resume).toBeDefined();
    expect(h.names()).not.toContain("ship_cleanup");
  });

  test("codex gate returns stage build-done; the re-call with codex skips preflight-build work already landed", async () => {
    const h = harness();
    const first = await handler(P({ codexGate: true }), h.deps);
    expect(first.stage).toBe("build-done");
    const res = await handler(P({ codexGate: true, codex: { rc: 0, outcome: "clean" } }), h.deps);
    expect(res.ok).toBe(true);
    expect(h.names().filter((n) => n === "ship_build")).toHaveLength(1); // same tree → not rebuilt
  });

  test("needsRebase: conflict-free rebase then preflight again; a conflict returns needs conflict", async () => {
    let n = 0;
    const h = harness({ ship_preflight: () => ({ ...ok.ship_preflight(), needsRebase: n++ === 0 }) });
    const res = await handler(P(), h.deps);
    expect(res.ok).toBe(true);
    expect(h.deps.rebase).toHaveBeenCalledWith("main", "/repo");
    expect(h.names().filter((x) => x === "ship_preflight")).toHaveLength(2);

    const h2 = harness({ ship_preflight: () => ({ ...ok.ship_preflight(), needsRebase: true }) });
    h2.deps.rebase.mockReturnValue({ ok: false, reason: "code-conflict", files: ["src/a.js"] });
    const c = await handler(P(), h2.deps);
    expect(c).toMatchObject({ needs: "conflict", detail: { files: ["src/a.js"] } });
  });

  test("full-suite-required: one full local build (ciSuite false) and a retry; twice → needs", async () => {
    let r = 0;
    const h = harness({ ship_release: () => (r++ === 0 ? { success: false, reason: "full-suite-required", error: "x" } : ok.ship_release()) });
    const res = await handler(P(), h.deps);
    expect(res.ok).toBe(true);
    expect(h.calls.filter((c) => c[0] === "ship_build")[1][1]).toMatchObject({ ciSuite: false, stepTimeoutSec: 3600 });
    const h2 = harness({ ship_release: () => ({ success: false, reason: "full-suite-required", error: "x" }) });
    expect((await handler(P(), h2.deps)).needs).toBe("full-suite-required");
  });

  test("early-push re-probe sees exhausted minutes → build switches to the full suite before release", async () => {
    const h = harness();
    h.deps.probe.mockImplementation((_c, o) => (o.force ? { status: "exhausted", recorded: true } : { status: "healthy" }));
    const res = await handler(P(), h.deps);
    expect(res.switchedToFullSuite).toBe(true);
    expect(h.names().filter((x) => x === "ship_build")).toHaveLength(2);
    expect(h.deps.probe).toHaveBeenCalledWith("/repo", { force: true, branch: "feat/x" });
  });

  test("rebaseRequired at release: rebase, retest, retry — merged release is never retried", async () => {
    let r = 0;
    const h = harness({ ship_release: () => (r++ === 0 ? { success: false, rebaseRequired: true, baseAdvancedDuringChecks: true } : ok.ship_release()) });
    const res = await handler(P(), h.deps);
    expect(res.ok).toBe(true);
    expect(res.purposeRecheck).toBe(true);
    expect(h.names().filter((x) => x === "ship_release")).toHaveLength(2);
    const h2 = harness({ ship_release: () => ({ success: false, merged: "main", postMergeError: "tag push" }) });
    const res2 = await handler(P(), h2.deps);
    expect(h2.names().filter((x) => x === "ship_release")).toHaveLength(1);
    expect(res2.merged).toBe("main");
  });
});

describe("ship_run — resume", () => {
  test("a landed bump skips preflight, build and bump; a landed merge skips release too", async () => {
    ver.current = "1.3.0"; // the branch carries the bump
    const h = harness({}, { steps: { preflight: true, build: {}, bump: { bump: "minor", vNew: "1.3.0" } }, base: "main", branch: "feat/x", run: { preflight: { base: "main", branch: "feat/x", mode: "git", inWorktree: true } } });
    const res = await handler(P(), h.deps);
    expect(h.names()).toEqual(["ship_release", "ship_cleanup", "ship_hygiene"]);
    expect(res.version).toBe("1.3.0");

    const h2 = harness({}, { steps: { preflight: true, bump: { vNew: "1.3.0" }, release: { pr: 42, merged: "main", tag: "alpha/v1.3.0", tagVerified: true } }, base: "main", branch: "feat/x", run: { preflight: { base: "main", branch: "feat/x", mode: "git", inWorktree: true } } });
    const res2 = await handler(P(), h2.deps);
    expect(h2.names()).toEqual(["ship_cleanup", "ship_hygiene"]);
    expect(res2).toMatchObject({ merged: "main", pr: 42 });
    expect(fs.writeFileSync).not.toHaveBeenCalled(); // no second CHANGELOG entry
  });

  test("a recorded bump the branch no longer carries is redone, not trusted (#1027)", async () => {
    // A conflict rebase dropped the release commit: checkpoint says 1.3.0, the tree is still on 1.2.3.
    const h = harness({}, { steps: { preflight: true, build: {}, bump: { bump: "minor", vNew: "1.3.0" } }, base: "main", branch: "feat/x", run: { preflight: { base: "main", branch: "feat/x", mode: "git", inWorktree: true } } });
    const res = await handler(P(), h.deps);
    expect(h.names()).toContain("ship_version_bump");
    expect(h.names().indexOf("ship_version_bump")).toBeLessThan(h.names().indexOf("ship_release"));
    expect(res.warnings.join(" ")).toMatch(/checkpoint bump to 1.3.0 is not on the branch/);
    expect(fs.writeFileSync).toHaveBeenCalled(); // CHANGELOG entry written again
  });
});

describe("ship_run — bump drift in secondary targets", () => {
  const resumed = () => harness({}, { steps: { preflight: true, build: {}, bump: { bump: "minor", vNew: "1.3.0" } }, base: "main", branch: "feat/x", run: { preflight: { base: "main", branch: "feat/x", mode: "git", inWorktree: true } } });

  test("source carries the bump but a plugin.json lags: synced in place, no second bump, no second CHANGELOG entry", async () => {
    ver.current = "1.3.0";
    ver.drift = ["plugins/devops/.claude-plugin/plugin.json", "CHANGELOG.md"];
    const h = resumed();
    const res = await handler(P(), h.deps);
    expect(h.names()).not.toContain("ship_version_bump");
    expect(ver.synced).toEqual([["1.3.0", "1.3.0", "/repo", []]]);
    expect(res.warnings.join(" ")).toMatch(/missing in plugins\/devops\/.claude-plugin\/plugin.json — synced/);
    expect(res.warnings.join(" ")).not.toMatch(/CHANGELOG/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test("a clean tree is left alone", async () => {
    ver.current = "1.3.0";
    const h = resumed();
    await handler(P(), h.deps);
    expect(ver.synced).toEqual([]);
    expect(h.names()).not.toContain("ship_version_bump");
  });
});

describe("ship_run — switches and helpers", () => {
  test("DEVOPS_SHIP_RUN=0 disables it and names the manual pipeline", async () => {
    process.env.DEVOPS_SHIP_RUN = "0";
    const h = harness();
    const res = await handler(P(), h.deps);
    expect(res).toMatchObject({ disabled: true, fallback: expect.stringContaining("manual-pipeline.md") });
    expect(h.calls).toHaveLength(0);
  });

  test("insertChangelogEntry: format of the newest heading, idempotent, fresh file", () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    expect(insertChangelogEntry("# C\n\n## v1.0.0 (2026-01-02)\n- a\n", "1.1.0", "- b", now)).toBe("# C\n\n## v1.1.0 (2026-10-26)\n\n- b\n\n## v1.0.0 (2026-01-02)\n- a\n");
    expect(insertChangelogEntry("## [1.1.0] — 2026-10-26\n", "1.1.0", "- b", now)).toBeNull();
    expect(insertChangelogEntry("", "0.1.0", "## [0.1.0]\n\n- first", now)).toBe("# Changelog\n\n## [0.1.0] — 2026-10-26\n\n- first\n");
  });
});

describe("ship_run — landPr (#955)", () => {
  const prData = { author: "app/dependabot", isDraft: false, mergeable: "MERGEABLE", state: "OPEN", headRefName: "dependabot/npm/x", baseRefName: "main", statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS", name: "t" }] };
  const land = (pr = prData, over = {}) => {
    const h = harness();
    const github = { readPR: vi.fn(() => pr), merge: vi.fn(() => ({ sha: "abc1234", verified: true })), deleteBranch: vi.fn(() => ({ ok: true })), ...over };
    return { h, github, run: () => handler({ ...DEFAULTS, cwd: "/repo", landPr: 37 }, { ...h.deps, github, repoMode: () => "git" }) };
  };

  test("lands an eligible PR: squash merge, branch delete, no pipeline stages", async () => {
    const { h, github, run } = land();
    const r = await run();
    expect(r.ok).toBe(true);
    expect(r.landed).toMatchObject({ pr: 37, mergeSha: "abc1234", verified: true });
    expect(github.merge).toHaveBeenCalledWith(37, "main", { cwd: "/repo" }, { strategy: "squash", skipDeleteBranch: true });
    expect(github.deleteBranch).toHaveBeenCalledWith("dependabot/npm/x", { cwd: "/repo" });
    expect(h.names()).toEqual([]);
  });

  test("refuses a human-authored PR with needs land-refused and does not merge", async () => {
    const { github, run } = land({ ...prData, author: "octocat" });
    const r = await run();
    expect(r).toMatchObject({ ok: false, needs: "land-refused" });
    expect(r.detail.reason).toMatch(/not Dependabot/);
    expect(github.merge).not.toHaveBeenCalled();
  });

  test("refuses a PR with a pending check", async () => {
    const { github, run } = land({ ...prData, statusCheckRollup: [{ status: "IN_PROGRESS", conclusion: "", name: "t" }] });
    expect((await run()).needs).toBe("land-refused");
    expect(github.merge).not.toHaveBeenCalled();
  });

  test("refuses outside a usable repo (detectRepoMode)", async () => {
    const h = harness();
    const github = { readPR: vi.fn(), merge: vi.fn(), deleteBranch: vi.fn() };
    const r = await handler({ ...DEFAULTS, cwd: "/x", landPr: 1 }, { ...h.deps, github, repoMode: () => "none" });
    expect(r.needs).toBe("land-refused");
    expect(github.readPR).not.toHaveBeenCalled();
  });

  test("a failed merge is a tool-error, a failed branch delete only a warning", async () => {
    const bad = land(prData, { merge: vi.fn(() => { throw new Error("boom"); }) });
    expect((await bad.run()).needs).toBe("tool-error");
    const warn = land(prData, { deleteBranch: vi.fn(() => ({ ok: false, error: "x" })) });
    const r = await warn.run();
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatch(/not deleted/);
  });
});

describe("ship_run — survival gate (needs merge-decisions)", () => {
  const lost = { id: "h1", file: "ui.css", header: "@@ -6,1 +6,1 @@", verdict: "same-aspect-candidate", author: "alice", upstreamPr: 12, missing: ["color: red;"], resurrected: [], candidatePath: "ui.css" };
  const blocked = { ok: false, open: [lost], lost: [lost], survivedCount: 3, resolvedCount: 0, anchor: "a1" };

  test("runs after preflight; a lost hunk stops before the build with the detail", async () => {
    const h = harness();
    h.deps.survival.mockReturnValueOnce(blocked);
    const res = await handler(P(), h.deps);
    expect(res).toMatchObject({ ok: false, stage: "preflight", needs: "merge-decisions" });
    expect(res.detail).toMatchObject({ where: "preflight", survivedCount: 3, anchor: "a1" });
    expect(res.detail.lost[0]).toMatchObject({ id: "h1", file: "ui.css", upstreamPr: 12, author: "alice", verdict: "same-aspect-candidate" });
    expect(res.resume.mergeDecisions.resolved[0]).toHaveProperty("hunk");
    expect(h.names()).toEqual(["ship_preflight"]);
    expect(h.deps.survival).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/repo", base: "main", branch: "feat/x", resolved: [] }));
  });

  test("the re-call passes resolved hunks to the gate, records decisions, and hands them to the release", async () => {
    const h = harness();
    const resolved = [{ hunk: "h1", action: "decided", aspect: "ui.css›.button›color", value: "color: yellow" }];
    h.deps.recordDecisions.mockReturnValueOnce({ written: true, count: 1, committed: true });
    const res = await handler(P({ mergeDecisions: { resolved } }), h.deps);
    expect(res.ok).toBe(true);
    expect(h.deps.survival).toHaveBeenCalledWith(expect.objectContaining({ resolved }));
    expect(h.deps.recordDecisions).toHaveBeenCalledWith("/repo", resolved, expect.any(Object));
    expect(res.mergeDecisions).toEqual({ recorded: 1, committed: true });
    const rel = h.calls.find((c) => c[0] === "ship_release")[1];
    expect(rel.mergeDecisions).toEqual([{ hunk: "h1", action: "decided" }]);
  });

  test("resolved hunks persist in the checkpoint across re-calls", async () => {
    const h = harness();
    h.deps.survival.mockReturnValueOnce({ ...blocked, open: [{ ...lost, id: "h2" }] });
    const first = await handler(P({ mergeDecisions: { resolved: [{ hunk: "h1", action: "restored" }] } }), h.deps);
    expect(first.needs).toBe("merge-decisions");
    expect(h.cp().run.mergeDecisions.resolved).toEqual([{ hunk: "h1", action: "restored" }]);
    await handler(P({ mergeDecisions: { resolved: [{ hunk: "h2", action: "restored" }] } }), h.deps);
    expect(h.deps.survival.mock.calls[1][0].resolved.map((r) => r.hunk)).toEqual(["h1", "h2"]);
  });

  test("release reports a pre-merge loss → needs merge-decisions with the PR left open", async () => {
    const h = harness({ ship_release: () => ({ success: false, pr: 42, prLeftOpen: { number: 42 }, mergeDecisionsRequired: { where: "pre-merge", lost: [{ id: "h1" }], survivedCount: 2, anchor: "a1" } }) });
    const res = await handler(P(), h.deps);
    expect(res).toMatchObject({ ok: false, stage: "release", needs: "merge-decisions" });
    expect(res.detail).toMatchObject({ where: "pre-merge", prLeftOpen: { number: 42 } });
  });

  test("integration after rebaseRequired at release is a merge followed by the gate", async () => {
    let r = 0;
    const h = harness({ ship_release: () => (r++ === 0 ? { success: false, rebaseRequired: true, prLeftOpen: { number: 42 } } : ok.ship_release()) });
    h.deps.survival.mockReturnValueOnce({ ok: true, open: [], lost: [], survivedCount: 1, resolvedCount: 0 }).mockReturnValueOnce(blocked);
    const res = await handler(P(), h.deps);
    expect(h.deps.rebase).toHaveBeenCalledWith("main", "/repo");
    expect(res).toMatchObject({ needs: "merge-decisions", detail: { where: "after-integration", prLeftOpen: { number: 42 } } });
  });

  test("a resume after the bump with decisions re-gates and rebuilds the changed tree before the release", async () => {
    const h = harness({}, { steps: { preflight: true, build: { fullSuiteVia: "ci" }, bump: { bump: "minor", vNew: "1.3.0" } }, base: "main", branch: "feat/x", run: { preflight: { base: "main", branch: "feat/x", mode: "git", intermediate: false, inWorktree: true, mergeStrategy: "squash" }, buildTree: "T0", build: { steps: [] } } });
    ver.current = "1.3.0";
    const res = await handler(P({ mergeDecisions: { resolved: [{ hunk: "h1", action: "restored" }] } }), h.deps);
    expect(res.ok).toBe(true);
    expect(h.deps.survival.mock.calls[0][0]).toMatchObject({ base: "main", branch: "feat/x" });
    expect(h.names()).toEqual(["ship_build", "ship_release", "ship_cleanup", "ship_hygiene"]);
  });

  test("a skipped check (fail open) only warns", async () => {
    const h = harness();
    h.deps.survival.mockReturnValueOnce({ ok: true, skipped: "no-anchor", open: [], lost: [], survivedCount: 0, resolvedCount: 0 });
    const res = await handler(P(), h.deps);
    expect(res.ok).toBe(true);
    expect(res.warnings.join(" ")).toMatch(/survival check skipped \(preflight\): no-anchor/);
  });
});

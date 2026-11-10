import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mergeOnto, mergeVersionFiles, swapConflictSides, survivalGate, gateDetail, recordDecisions } from "./merge-integrate.js";

let repo;
const g = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", ...args], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (files) => { for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), t); } };
const commit = (branch, files, msg) => { g("checkout", "-q", branch); write(files); g("add", "-A"); g("commit", "-qm", msg); return g("rev-parse", "HEAD"); };
const publish = () => g("update-ref", "refs/remotes/origin/main", "main");
const pkg = (v) => `{\n  "name": "x",\n  "version": "${v}"\n}\n`;

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "merge-int-"));
  g("init", "-q", "-b", "main");
  g("config", "user.name", "t"); g("config", "user.email", "t@t");
  // Repo-level, so mergeOnto's own git calls agree with g(): Git for Windows
  // ships core.autocrlf=true system-wide, which would re-check-out CRLF files.
  g("config", "core.autocrlf", "false");
  write({ "package.json": pkg("1.0.0"), "CHANGELOG.md": "# Changelog\n\n## [1.0.0] — 2026-11-01\n\n- first\n", "a.js": "a();\n", "ui.css": ".b {\n  color: blue;\n}\n" });
  g("add", "-A"); g("commit", "-qm", "base");
  g("branch", "feat");
});
afterEach(() => { fs.rmSync(repo, { recursive: true, force: true }); });

describe("mergeOnto", () => {
  test("clean merge: integrates by merge (no rewrite), snapshots the intent ref", () => {
    commit("main", { "a.js": "a();\nup();\n" }, "feat: up"); publish();
    const own = commit("feat", { "b.js": "b();\n" }, "feat: b");
    const r = mergeOnto("main", repo, { fetch: false });
    expect(r).toMatchObject({ ok: true, merged: true, method: "merge", pushed: false, intent: own });
    expect(g("rev-parse", "refs/devops/intent/feat")).toBe(own);
    expect(g("merge-base", "--is-ancestor", own, "HEAD")).toBe(""); // own commits kept, nothing rewritten
    expect(g("rev-list", "--count", "HEAD..origin/main")).toBe("0");
  });

  test("already up to date: no merge, intent still recorded", () => {
    publish();
    const own = commit("feat", { "b.js": "b();\n" }, "feat: b");
    expect(mergeOnto("main", repo, { fetch: false })).toMatchObject({ ok: true, merged: false, upToDate: true, intent: own });
  });

  test("a code conflict aborts and restores the branch — never leaves a merge open", () => {
    commit("main", { "ui.css": ".b {\n  color: red;\n}\n" }, "feat: red"); publish();
    const own = commit("feat", { "ui.css": ".b {\n  color: yellow;\n}\n" }, "feat: yellow");
    const r = mergeOnto("main", repo, { fetch: false });
    expect(r).toMatchObject({ ok: false, reason: "code-conflict", files: ["ui.css"] });
    expect(g("rev-parse", "HEAD")).toBe(own);
    expect(g("status", "--porcelain")).toBe("");
  });

  test("dirty tree refuses", () => {
    write({ "a.js": "dirty();\n" });
    expect(mergeOnto("main", repo, { fetch: false })).toMatchObject({ ok: false, reason: "dirty-tree" });
  });

  test("only version files collide: resolved to the base, bumped again by our kind", () => {
    commit("main", { "package.json": pkg("1.1.0"), "CHANGELOG.md": "# Changelog\n\n## [1.1.0] — 2026-11-02\n\n- theirs\n\n## [1.0.0] — 2026-11-01\n\n- first\n" }, "chore(release): v1.1.0"); publish();
    commit("feat", { "package.json": pkg("1.1.0"), "CHANGELOG.md": "# Changelog\n\n## [1.1.0] — 2026-11-03\n\n- ours\n\n## [1.0.0] — 2026-11-01\n\n- first\n", "b.js": "b();\n" }, "chore(release): v1.1.0 ours");
    const r = mergeVersionFiles({ upstream: "origin/main", cwd: repo });
    expect(r).toMatchObject({ ok: true, from: "1.1.0", to: "1.2.0", bump: "minor", method: "merge" });
    expect(JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")).version).toBe("1.2.0");
    const cl = fs.readFileSync(path.join(repo, "CHANGELOG.md"), "utf8");
    expect(cl.indexOf("- ours")).toBeLessThan(cl.indexOf("- theirs"));
    expect(cl).toContain("## [1.2.0]");
    expect(g("status", "--porcelain")).toBe("");
  });
});

describe("swapConflictSides", () => {
  test("puts theirs first and ours last, keeping the diff3 base", () => {
    const merged = "x\n<<<<<<< HEAD\nours\n||||||| base\nold\n=======\ntheirs\n>>>>>>> origin/main\ny";
    expect(swapConflictSides(merged)).toBe("x\n<<<<<<< HEAD\ntheirs\n|||||||\nold\n=======\nours\n>>>>>>> origin/main\ny");
  });
});

describe("survivalGate + recordDecisions", () => {
  beforeEach(() => {
    commit("main", { "ui.css": ".b {\n  color: red;\n}\n" }, "feat: red (#12)"); publish();
    commit("feat", { "ui.css": ".b {\n  color: yellow;\n}\n" }, "feat: yellow");
    g("update-ref", "refs/devops/intent/feat", "HEAD");
    g("merge", "-q", "-s", "ours", "--no-edit", "origin/main"); // the silent-discard resolution
  });

  test("blocks on the lost hunk; a resolved id or a ledger decision clears it", () => {
    const gate = survivalGate({ cwd: repo, base: "main", branch: "feat" });
    expect(gate.ok).toBe(false);
    expect(gate.open).toHaveLength(1);
    const d = gateDetail(gate, "preflight");
    expect(d.lost[0]).toMatchObject({ file: "ui.css", verdict: "same-aspect-candidate", upstreamPr: 12, missing: ["color: red;"] });
    const id = d.lost[0].id;
    expect(survivalGate({ cwd: repo, base: "main", branch: "feat", resolved: [{ hunk: id, action: "decided" }] }).ok).toBe(true);

    const rec = recordDecisions(repo, [{ hunk: id, action: "decided", aspect: "ui.css›.b›color", value: "color: yellow", chain: [{ ship: "#12", by: "alice", value: "color: red" }] }], { by: "bob", ship: "feat" });
    expect(rec).toEqual({ written: true, count: 1, committed: true });
    expect(g("log", "-1", "--format=%s")).toBe("chore(merge): record merge decisions");
    const ledger = JSON.parse(fs.readFileSync(path.join(repo, ".claude", "merge-decisions.json"), "utf8"));
    expect(ledger.aspects["ui.css›.b›color"].map((e) => e.by)).toEqual(["alice", "bob"]);
    // Rerere-like: the ledger alone now settles the same hunk on the next integration.
    expect(survivalGate({ cwd: repo, base: "main", branch: "feat" })).toMatchObject({ ok: true, resolvedCount: 1 });
    expect(recordDecisions(repo, [{ hunk: id, action: "decided", aspect: "ui.css›.b›color", value: "x" }]).count).toBe(0);
  });

  test("restored items are not written to the ledger", () => {
    expect(recordDecisions(repo, [{ hunk: "h", action: "restored" }])).toEqual({ written: false, count: 0, committed: false });
  });

  test("no origin/<base> → fails open with skipped", () => {
    expect(survivalGate({ cwd: repo, base: "nope" })).toMatchObject({ ok: true, open: [] });
    expect(survivalGate({ cwd: repo, base: "nope" }).skipped).toBeTruthy();
  });
});

import { describe, test, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import {
  git,
  runSync,
  write,
  read,
  commitAll,
  makeWorld,
  advanceOrigin,
  cleanupWorlds,
} from "./__fixtures__/git-sync-world.js";

/**
 * The core contract: git-sync must actually move commits from the default
 * branch into the current one, in the worktree layout where v0.3.x could not
 * — and never at the cost of uncommitted work.
 */

afterAll(cleanupWorlds);

// Sequential on purpose (#424): every test here spends 10-15 s in two real
// clones + the sync. Under describe.concurrent
// vitest starts every test's 60 s timer at once, so the LAST test of a group
// was charged the whole group's wall clock (65-75 s measured) and timed out on
// a loaded machine although each test alone takes a sixth of that.
describe("merge source — the regression that made the sync a silent no-op", () => {
  test("merges origin/main even though main is checked out in the primary worktree", async () => {
    const { root, primary, wt, other } = await makeWorld();
    await advanceOrigin(other, "feature-of-main.txt", "from main\n", "main moves on");

    const report = await runSync(wt, path.join(root, "result"));

    expect(report).toContain("✓ origin/main → feature: 1 commit(s)");
    expect(fs.existsSync(path.join(wt, "feature-of-main.txt"))).toBe(true);

    // The precondition that used to defeat the sync is still in force: the
    // local main ref could NOT be advanced, because primary has it checked out.
    expect(await git(primary, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
    expect(await git(wt, ["rev-parse", "main"])).not.toBe(await git(wt, ["rev-parse", "origin/main"]));
  });

  test("the local main ref being stale does not suppress the merge", async () => {
    const { root, wt, other } = await makeWorld();
    const staleMain = await git(wt, ["rev-parse", "main"]);
    await advanceOrigin(other, "a.txt", "a\n", "one");
    await advanceOrigin(other, "b.txt", "b\n", "two");

    const report = await runSync(wt, path.join(root, "result"));

    expect(report).toContain("✓ origin/main → feature: 2 commit(s)");
    expect(await git(wt, ["rev-parse", "main"])).toBe(staleMain);
    expect(await git(wt, ["rev-list", "--count", "HEAD..origin/main"])).toBe("0");
  });

  test("stays silent and writes no result file when already up to date", async () => {
    const { root, wt } = await makeWorld();
    const resultFile = path.join(root, "result");

    expect(await runSync(wt, resultFile)).toBe("");
    expect(fs.existsSync(resultFile)).toBe(false);
  });

  test("fast-forwards main itself (#802)", async () => {
    const { root, primary, other } = await makeWorld();
    await advanceOrigin(other, "x.txt", "x\n", "main moves on");

    expect(await runSync(primary, path.join(root, "result"))).toContain("✓ origin/main → main: 1 commit(s)");
    expect(fs.existsSync(path.join(primary, "x.txt"))).toBe(true);
  });
});

describe("uncommitted work", () => {
  test("parks a dirty overlapping file in a local wip(sync) commit and merges instead of skipping", async () => {
    const { root, wt, other } = await makeWorld();
    const lines = (first, last) => [first, ...Array.from({ length: 18 }, (_, i) => `l${i + 2}`), last].join("\n") + "\n";
    await advanceOrigin(other, "lines.txt", lines("l1", "l20"), "main adds lines.txt");
    await git(wt, ["fetch", "--quiet", "origin"]);
    await git(wt, ["merge", "--no-edit", "--quiet", "origin/main"]);
    await advanceOrigin(other, "lines.txt", lines("ONE", "l20"), "main edits the first line");

    write(wt, "lines.txt", lines("l1", "TWENTY, edited in the worktree"));
    const report = await runSync(wt, path.join(root, "result"));

    expect(report).toContain("✓ origin/main → feature: 1 commit(s)");
    expect(report).toContain("parked in a local wip(sync) commit");
    // Both intents survive; nothing is left uncommitted; the park is a LOCAL commit only.
    const merged = read(wt, "lines.txt");
    expect(merged).toContain("ONE");
    expect(merged).toContain("TWENTY, edited in the worktree");
    expect(await git(wt, ["status", "--porcelain"])).toBe("");
    expect(await git(wt, ["log", "--format=%s", "-5"])).toContain("wip(sync): park work before merging origin/main");
    expect(await git(wt, ["ls-remote", "--heads", "origin", "feature"])).toBe("");
    // The own tip was snapshotted before the integration (survival check input),
    // and a merge that lost nothing leaves no merge-queue behind.
    expect(await git(wt, ["rev-parse", "--verify", "refs/devops/intent/feature"])).toMatch(/^[0-9a-f]{40}$/);
    expect(fs.existsSync(path.join(wt, ".claude", "merge-queue.json"))).toBe(false);
  });

  test("records the synced remote signature only after a run that skipped nothing", async () => {
    const { root, wt, other } = await makeWorld();
    await advanceOrigin(other, "elsewhere.txt", "elsewhere\n", "main moves");
    const tipFile = path.join(root, "tip");

    await runSync(wt, path.join(root, "result"), { DEVOPS_GIT_SYNC_TIP_FILE: tipFile, DEVOPS_GIT_SYNC_TIP: "abc refs/heads/main" });

    expect(fs.readFileSync(tipFile, "utf8")).toBe("abc refs/heads/main");
  });

  test("a conflicting overlap is reported (⚠) and the user's work stays safe in the wip commit", async () => {
    const { root, wt, other } = await makeWorld();
    await advanceOrigin(other, "base.txt", "base, edited on main\n", "main edits base.txt");

    write(wt, "base.txt", "base, edited in the worktree\n");
    const report = await runSync(wt, path.join(root, "result"));

    expect(report).toContain("⚠ origin/main → feature");
    expect(await git(wt, ["log", "-1", "--format=%s"])).toBe("wip(sync): park work before merging origin/main");
    expect(read(wt, "base.txt")).toBe("base, edited in the worktree\n");
  });

  test("merges anyway when the dirty file is not part of the incoming change", async () => {
    const { root, wt, other } = await makeWorld();
    await advanceOrigin(other, "elsewhere.txt", "elsewhere\n", "main touches another file");

    write(wt, "untouched.txt", "work in progress\n");

    const report = await runSync(wt, path.join(root, "result"));

    expect(report).toContain("✓ origin/main → feature: 1 commit(s)");
    expect(fs.existsSync(path.join(wt, "elsewhere.txt"))).toBe(true);
    expect(read(wt, "untouched.txt")).toBe("work in progress\n");
  });

  test("a committed conflicting change is still reported as ⚠ on the next run", async () => {
    const { root, wt, other } = await makeWorld();
    await advanceOrigin(other, "base.txt", "base, edited on main\n", "main edits base.txt");

    write(wt, "base.txt", "base, edited in the worktree\n");
    await commitAll(wt, "worktree edits base.txt");

    // Genuinely conflicting: both sides changed the same line.
    const report = await runSync(wt, path.join(root, "result2"));
    expect(report).toContain("⚠ origin/main → feature");
    expect(report).toContain("base.txt");
    expect(report).not.toContain("0 file(s)");
  });
});

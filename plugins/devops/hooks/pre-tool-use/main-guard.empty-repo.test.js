import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

/** #1237: a repo without a commit may get its first one (and its push) on main. */

const HERE = dirname(fileURLToPath(import.meta.url));
const TIMEOUT = 120_000;
let root, n = 0;

const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: "ignore" });

function run(hook, payload) {
  const env = { ...process.env };
  delete env.DEVOPS_ALLOW_MAIN;
  return spawnSync(process.execPath, [join(HERE, hook)], {
    input: JSON.stringify(payload), encoding: "utf8", env, timeout: 30_000,
  }).status;
}
const sh = (cwd, command) => run("pre.main.guard.js", { tool_name: "Bash", cwd, tool_input: { command } });
const write = (cwd) => run("pre.edit.branch.js", { tool_name: "Write", cwd, tool_input: { file_path: join(cwd, "README.md") } });

function fresh() {
  const dir = join(root, `r${n++}`);
  mkdirSync(dir);
  git(["init", "-q", "-b", "main", "."], dir);
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "Test"], dir);
  return dir;
}
function commit(dir, name) {
  writeFileSync(join(dir, name), "x\n");
  git(["add", "."], dir);
  git(["commit", "-qm", name], dir);
}
function withOrigin(dir) {
  const bare = join(root, `o${n++}.git`);
  git(["init", "-q", "--bare", "-b", "main", bare], root);
  git(["remote", "add", "origin", bare], dir);
}

beforeAll(() => { root = realpathSync.native(mkdtempSync(join(tmpdir(), "emptyrepo-"))); });
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe("a repo without a commit", () => {
  test("setup may write and commit; afterwards main is guarded again", () => {
    const dir = fresh();
    expect(write(dir)).toBe(0);
    expect(sh(dir, "git add . && git commit -m init")).toBe(0);
    commit(dir, "a");
    expect(write(dir)).toBe(2);
    expect(sh(dir, "git add . && git commit -m init")).toBe(2);
  }, TIMEOUT);

  test("the first commit may be pushed, once, and never by force", () => {
    const dir = fresh();
    withOrigin(dir);
    expect(sh(dir, "git commit -m init && git push --force origin main")).toBe(2);
    expect(sh(dir, "git add . && git commit -m init && git push -u origin main")).toBe(0);
    expect(sh(dir, "git commit -m a && git commit -m b && git push -u origin main")).toBe(2);
    expect(sh(dir, "git fetch x main && git reset --hard FETCH_HEAD && git push -u origin main")).toBe(2);
    expect(sh(dir, "git merge FETCH_HEAD")).toBe(2);
    expect(sh(dir, "git pull x main && git push -u origin main")).toBe(2);
    commit(dir, "a");
    expect(sh(dir, "git push -u origin main")).toBe(0);
    expect(sh(dir, "git push -f origin main")).toBe(2);
    expect(sh(dir, "git push origin +main")).toBe(2);
    expect(sh(dir, "git push origin :main")).toBe(2);
    expect(sh(dir, "F=--force; git push origin main $F")).toBe(2);
    expect(sh(dir, "git -c remote.origin.push=+main push origin main")).toBe(2);
    expect(sh(dir, "git push --dele origin main")).toBe(2);
    expect(sh(dir, "git push origin HEAD:release")).toBe(2);
    expect(sh(dir, "git push origin --delete main")).toBe(2);
    expect(sh(dir, "git commit -m x && git push -u origin main")).toBe(2);
    git(["push", "-q", "-u", "origin", "main"], dir);
    expect(sh(dir, "git push origin main")).toBe(2);
  }, TIMEOUT);

  test("more than one unpushed commit is no setup push", () => {
    const dir = fresh();
    withOrigin(dir);
    commit(dir, "a");
    commit(dir, "b");
    expect(sh(dir, "git push -u origin main")).toBe(2);
  }, TIMEOUT);

  test("an orphan main next to existing history is not an empty repo", () => {
    const dir = fresh();
    commit(dir, "a");
    git(["branch", "-m", "main", "old"], dir);
    git(["checkout", "-q", "--orphan", "main"], dir);
    expect(write(dir)).toBe(2);
    expect(sh(dir, "git commit -m x")).toBe(2);
  }, TIMEOUT);
});

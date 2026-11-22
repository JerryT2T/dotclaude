import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * pre.main.guard sees git writes inside shell wrappers (`bash -c "…"`,
 * `cmd /c …`, `pwsh -c …`) and here-docs fed to a shell. Fixture: `coll/` is no
 * repo; `m` is a repo on main, `f` one on a feature branch. Real hook process.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = join(HERE, "pre.main.guard.js");
const TIMEOUT = 120_000;
let root, coll, m, f;

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function initRepo(dir, branch = "main") {
  mkdirSync(dir, { recursive: true });
  git(["init", "-q", "-b", "main", "."], dir);
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "Test"], dir);
  writeFileSync(join(dir, "x.txt"), "x\n");
  git(["add", "."], dir);
  git(["commit", "-qm", "c1"], dir);
  if (branch !== "main") git(["switch", "-q", "-c", branch], dir);
}

function sh(command, cwd, tool = "Bash") {
  const env = { ...process.env };
  delete env.DEVOPS_ALLOW_MAIN;
  const r = spawnSync(process.execPath, [MAIN], { input: JSON.stringify({ tool_name: tool, cwd, tool_input: { command } }), encoding: "utf8", env, timeout: 30_000 });
  return { status: r.status, stderr: r.stderr || "" };
}

beforeAll(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), "mgwrap-")));
  coll = join(root, "coll");
  m = join(coll, "m");
  f = join(coll, "f");
  mkdirSync(coll);
  initRepo(m);
  initRepo(f, "feat/x");
}, TIMEOUT);

afterAll(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});

const BLOCKED = [
  ['bash -c "git commit -m x"'],
  ["sh -c 'git commit -m x'"],
  ['bash -lc "git commit -m x"'],
  ['bash -c "git push origin main"'],
  ["cmd /c git commit -m x"],
  ['pwsh -c "git commit -m x"'],
  ['powershell -Command "git commit -m x"'],
  ["bash <<'EOF'\ngit commit -m x\nEOF"],
  ["bash -s <<EOF\ngit commit -m x\nEOF"],
  ["sh <<-EOF\n\tgit commit -m x\n\tEOF"],
  ["bash -c \"sh -c 'git commit -m x'\""],
];

describe("on main: wrapped writes are blocked", () => {
  test.each(BLOCKED)("%j", (command) => {
    const r = sh(command, m);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("BLOCKED");
  }, TIMEOUT);

  test("the directory at the wrapper and inside it decides", () => {
    expect(sh('cd m && bash -c "git commit -m x"', coll).status).toBe(2);
    expect(sh('bash -c "cd m && git commit -m x"', coll).status).toBe(2);
    expect(sh('bash -c "git -C m commit -m x"', coll).status).toBe(2);
    expect(sh('cd f && bash -c "git commit -m x"', coll).status).toBe(0);
    expect(sh('bash -c "cd f && git commit -m x"', coll).status).toBe(0);
  }, TIMEOUT);

  test("a cd inside the wrapper does not leak to the commands after it", () => {
    // the commit runs in coll (no repo) after the wrapper's cd into main: allowed
    expect(sh('bash -c "cd m" && git commit -m x', coll).status).toBe(0);
    // the wrapper's cd into the feature repo must not shield a later write on main
    expect(sh('cd m && bash -c "cd ../f" && git commit -m x', coll).status).toBe(2);
  }, TIMEOUT);
});

describe("on a feature branch: wrapped writes are allowed", () => {
  test.each(BLOCKED)("%j", (command) => {
    expect(sh(command, f).status).toBe(0);
  }, TIMEOUT);
});

describe("no new false positives", () => {
  const QUIET = [
    ['echo "git commit -m x"'],
    ['grep "git push" file'],
    ['git log --grep "bash -c git commit"'],
    ["cat > notes.txt <<'EOF'\ngit commit -m x\nEOF"],
    ["gh issue create --body \"$(cat <<'EOF'\ngit push\nEOF\n)\""],
    ["bash -c 'echo git commit'"],
    ["bash script.sh <<'EOF'\ngit commit -m x\nEOF"],
    ['bash -c "git status"'],
  ];
  test.each(QUIET)("%j passes on main", (command) => {
    expect(sh(command, m).status).toBe(0);
  }, TIMEOUT);
  test.each(QUIET)("%j passes on a feature branch", (command) => {
    expect(sh(command, f).status).toBe(0);
  }, TIMEOUT);

  test("a commit message that mentions a wrapper is the one outer commit", () => {
    expect(sh(`git commit -m "bash -c 'git push'"`, m).status).toBe(2);
    expect(sh(`git commit -m "bash -c 'git push'"`, f).status).toBe(0);
  }, TIMEOUT);
});

describe("the bypass still applies to wrapped writes", () => {
  test("DEVOPS_ALLOW_MAIN=1", () => {
    const r = spawnSync(process.execPath, [MAIN], {
      input: JSON.stringify({ tool_name: "Bash", cwd: m, tool_input: { command: 'bash -c "git commit -m x"' } }),
      encoding: "utf8", env: { ...process.env, DEVOPS_ALLOW_MAIN: "1" }, timeout: 30_000,
    });
    expect(r.status).toBe(0);
  }, TIMEOUT);
});

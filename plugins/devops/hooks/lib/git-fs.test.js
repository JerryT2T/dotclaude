import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { workTree, hasCommit, hasRemote } = require("./git-fs.js");

let root, repo, linked;
const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "git-fs-")));
  repo = path.join(root, "repo");
  linked = path.join(root, "linked");
  fs.mkdirSync(repo);
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.email", "t@example.com"]);
  git(["config", "user.name", "Test"]);
}, 60_000);
afterAll(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });

describe("git-fs answers from .git what git would answer", () => {
  test("outside a work tree, and inside .git: no tree", () => {
    expect(workTree(root)).toBeNull();
    expect(workTree(path.join(repo, ".git"))).toBeNull();
    expect(workTree("")).toBeNull();
  });

  test("an unborn HEAD is not proven to hold a commit: ask git", () => {
    const tree = workTree(repo);
    expect(tree.branch).toBe("main");
    expect(tree.linked).toBe(false);
    expect(hasCommit(tree)).toBeNull();
  });

  test("no remote is certain, an include is not, a remote is", () => {
    expect(hasRemote(workTree(repo))).toBe(false);
    const config = path.join(repo, ".git", "config");
    const before = fs.readFileSync(config, "utf8");
    fs.writeFileSync(config, `${before}[include]\n\tpath = other\n`);
    expect(hasRemote(workTree(repo))).toBeNull();
    fs.writeFileSync(config, before);
    git(["remote", "add", "origin", "https://example.com/x.git"]);
    expect(hasRemote(workTree(repo))).toBe(true);
  });

  test("a commit is found as a loose ref and as a packed ref", () => {
    git(["commit", "-q", "--allow-empty", "-m", "a"]);
    expect(hasCommit(workTree(repo))).toBe(true);
    git(["pack-refs", "--all"]);
    expect(fs.existsSync(path.join(repo, ".git", "refs", "heads", "main"))).toBe(false);
    expect(hasCommit(workTree(repo))).toBe(true);
  });

  test("a subdirectory resolves to its work tree", () => {
    const sub = path.join(repo, "a", "b");
    fs.mkdirSync(sub, { recursive: true });
    expect(workTree(sub).root).toBe(repo);
  });

  test("a linked worktree: linked, own HEAD, the clone's refs and config", () => {
    git(["worktree", "add", "-q", "-b", "side", linked]);
    const tree = workTree(linked);
    expect(tree.linked).toBe(true);
    expect(tree.branch).toBe("side");
    expect(path.normalize(tree.commonDir)).toBe(path.join(repo, ".git"));
    expect(hasCommit(tree)).toBe(true);
    expect(hasRemote(tree)).toBe(true);
  });

  test("a detached HEAD: no ref, no branch, a commit", () => {
    git(["checkout", "-q", "--detach"]);
    const tree = workTree(repo);
    expect(tree.ref).toBeNull();
    expect(tree.branch).toBeNull();
    expect(hasCommit(tree)).toBe(true);
    git(["checkout", "-q", "main"]);
  });

  test("a reftable HEAD names no branch but keeps its ref, so the caller asks git", () => {
    const dir = path.join(root, "reftable");
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/.invalid\n");
    const tree = workTree(dir);
    expect(tree.ref).toBe("refs/heads/.invalid");
    expect(tree.branch).toBeNull();
  });
});

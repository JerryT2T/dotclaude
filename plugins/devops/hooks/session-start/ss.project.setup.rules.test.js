import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { setupProject } = require("./ss.project.setup.js");

const tmp = [];
function mkTmp(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmp.push(d);
  return d;
}
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop(), { recursive: true, force: true }); });

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

function initRepo({ commit = true } = {}) {
  const dir = mkTmp("psr-repo-");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
  if (commit) { git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", "init"); }
  return dir;
}
const rulesFile = (repo) => path.join(repo, ".claude", "rules", "devops.md");

describe("ss.project.setup — the cloud rules file is part of a NEW repo's project setup", () => {
  test("a repo without a commit gets .claude/rules/devops.md once; the write is idempotent", () => {
    const repo = initRepo({ commit: false });
    const home = mkTmp("psr-home-");
    expect(setupProject({ cwd: repo, home }).rules).toBe("written");
    expect(fs.readFileSync(rulesFile(repo), "utf8")).toContain("<!-- >>> devops (managed) >>> -->");
    expect(setupProject({ cwd: repo, home }).rules).toBe("current");
  });

  test("an established repo is never written into from a session start (its next ship adds the file)", () => {
    const repo = initRepo();
    const res = setupProject({ cwd: repo, home: mkTmp("psr-home-") });
    expect(res.rules).toBe("skipped");
    expect(fs.existsSync(rulesFile(repo))).toBe(false);
  });

  test("the devops-config switch cloud.rulesFile=false keeps it out of a new repo", () => {
    const repo = initRepo({ commit: false });
    fs.mkdirSync(path.join(repo, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".claude", "devops-config.json"), JSON.stringify({ cloud: { rulesFile: false } }));
    expect(setupProject({ cwd: repo, home: mkTmp("psr-home-") }).rules).toBe("off");
    expect(fs.existsSync(rulesFile(repo))).toBe(false);
  });
});

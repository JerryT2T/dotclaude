import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// The manifest's commandFilter decides whether a module starts at all, so every
// filter here is checked against the module's own matcher: a command the module
// acts on must pass the filter, also in the spellings its matcher tolerates.

const require = createRequire(import.meta.url);
const dispatch = require("./dispatch.js");
const { isManualShipCommand, gitCommandRe, matchesGitCommand, WORD_END } = require("../lib/ship-guard-match");
const { findIssueWrites } = require("../lib/issue-guard-match");
const { containsFullSuite, trailingFullSuite } = require("../lib/full-suite-cmd");
const { detectGitInitTargets } = require("../lib/git-init-detect");
const { findRootCrawls } = require("../lib/crawl-guard-match");
const { parseDeletes } = require("../lib/cleanup-gate");
const { outsideTargets } = require("../pre-tool-use/pre.redirect.scope.js");
const { modeOf } = require("../post-tool-use/post.flow.title-mode.js");

const manifest = JSON.parse(fs.readFileSync(fileURLToPath(new URL("./manifest.json", import.meta.url)), "utf8"));

const names = (event, payload) => dispatch.selectModules(manifest, event, payload).map((m) => m.name);
const shell = (command, tool_name = "Bash") => ({ tool_name, tool_input: { command } });
const started = (event, name, command, tool) => names(event, shell(command, tool)).includes(name);

const gitActs = (sub) => (cmd) => matchesGitCommand(cmd, [gitCommandRe(sub + WORD_END)]);
const issueActs = (cmd) => findIssueWrites(cmd).length > 0;
const redirectActs = (cmd) => outsideTargets(cmd, "/srv/repo", "/srv/repo").length > 0;
const titleActs = (cmd) => modeOf(shell(cmd)) !== null;
const initActs = (cmd) => detectGitInitTargets(cmd, "/tmp/repo").length > 0;

/**
 * acts: the module's own matcher. hit: it acts and the filter lets it start.
 * filterOnly: spellings the matcher does not act on today but the filter must
 * still pass, so fixing the matcher later cannot be defeated by the filter.
 * miss: neither.
 */
const MODULES = [
  {
    name: "pre.ship.guard",
    event: "PreToolUse",
    acts: isManualShipCommand,
    hit: ["gh pr create --fill", "git push && gh pr merge 5", "gh api repos/a/b/pulls/5/merge -X PUT", 'FOO=1; gh pr create -t "x"'],
    filterOnly: ["gh.exe pr create", "/usr/bin/gh pr create", "C:\\tools\\gh.exe pr merge 5", "GH PR CREATE"],
    miss: ["echo hi", "git status", "cat through.txt", "node high.js"],
  },
  {
    name: "pre.issue.guard",
    event: "PreToolUse",
    acts: issueActs,
    hit: [
      "gh issue create -t x",
      "gh.exe issue edit 5",
      "GH.EXE issue edit 5",
      "/usr/bin/gh issue create",
      "C:\\tools\\gh.exe issue create",
      "GH_REPO=a/b gh issue create",
      "gh -R a/b issue edit 5",
      "gh \\\n  issue create",
      "gh api repos/a/b/issues -f title=x",
    ],
    filterOnly: [],
    miss: ["echo hi", "git log --grep issue", "cat ghost.txt"],
  },
  {
    name: "pre.main.guard",
    event: "PreToolUse",
    acts: gitActs("(?:commit|push)"),
    hit: ["git commit -m x", "git.exe push", "git -C some/dir commit -m x", "npm test && git push", "FOO=1 git commit"],
    filterOnly: ["GIT commit", "/usr/bin/git commit", "C:\\Git\\bin\\git.exe push"],
    miss: ["echo hi", "cat digit.txt", "node legit.js"],
  },
  {
    name: "pre.worktree.split-guard",
    event: "PreToolUse",
    acts: gitActs("(?:commit|merge)"),
    hit: ["git commit -m x", "git.exe merge dev", "git -c a=b commit"],
    filterOnly: ["GIT merge dev", "/usr/bin/git merge dev"],
    miss: ["echo hi", "cat digit.txt"],
  },
  {
    name: "pre.test.fullguard",
    event: "PreToolUse",
    acts: containsFullSuite,
    hit: ["npm test", "npm t", "npm run test", "npx vitest run", "vitest run", "cross-env A=1 npm test", "cd x && npm test"],
    filterOnly: [],
    miss: ["echo hi", "pnpm test", "node x.test.js"],
  },
  {
    name: "pre.redirect.scope",
    event: "PreToolUse",
    acts: redirectActs,
    hit: ["npm ci > ../npmci.log", "echo x >> ../a.log", "echo x &> ../a.log"],
    filterOnly: [],
    miss: ["echo hi", "ls | head -1"],
  },
  {
    name: "post.test.record",
    event: "PostToolUse",
    acts: (cmd) => trailingFullSuite(cmd) !== null,
    hit: ["npm test", "cd x && npx vitest run", "vitest run"],
    filterOnly: [],
    miss: ["echo hi", "pnpm test"],
  },
  {
    name: "post.project.setup",
    event: "PostToolUse",
    acts: initActs,
    hit: ["git init", "git init sub", "git -C some/dir init", "GIT.EXE init", "/usr/bin/git init", 'git "init"', "mkdir x && git init x"],
    filterOnly: [],
    miss: ["echo hi", "git status", "node initial.js"],
  },
  {
    name: "post.flow.title-mode",
    event: "PostToolUse",
    acts: titleActs,
    hit: [
      "node -e \"require('./batch-state.js').activate('x')\"",
      "node -e \"require('./batch-state').deactivate()\"",
    ],
    filterOnly: [],
    miss: ["echo hi", "git status"],
  },
];

describe.each(MODULES)("$name", ({ name, event, acts, hit, filterOnly, miss }) => {
  test.each(hit)("starts for %j, which it acts on", (cmd) => {
    expect(acts(cmd)).toBe(true);
    expect(started(event, name, cmd)).toBe(true);
  });

  if (filterOnly.length) {
    test.each(filterOnly)("starts for the spelling %j", (cmd) => {
      expect(started(event, name, cmd)).toBe(true);
    });
  }

  test.each(miss)("stays off for %j, which it would ignore", (cmd) => {
    expect(acts(cmd)).toBe(false);
    expect(started(event, name, cmd)).toBe(false);
  });
});

describe("the filters of the manifest", () => {
  const filters = Object.values(manifest.hooks)
    .flat()
    .flatMap((group) => group.hooks)
    .map((h) => h.commandFilter)
    .filter(Boolean);

  test("hold no control character (a JSON \\b is a backspace, not a word boundary)", () => {
    expect(filters.length).toBeGreaterThan(0);
    for (const f of filters) expect(f).not.toMatch(/[\x00-\x1f]/);
  });

  test("compile: a broken one would silently run its module on every call", () => {
    for (const f of filters) expect(() => new RegExp(f)).not.toThrow();
  });
});

describe("a payload without a command", () => {
  test("still starts a filtered module on its other tools", () => {
    expect(names("PreToolUse", { tool_name: "mcp__github__issue_write", tool_input: { title: "x" } })).toContain("pre.issue.guard");
    expect(names("PostToolUse", { tool_name: "Skill", tool_input: { skill: "do-ship" } })).toContain("post.flow.title-mode");
  });
});

describe("modules whose work does not depend on a word in the command", () => {
  test("a plain command starts exactly these", () => {
    expect(names("PreToolUse", shell("echo hi")).sort()).toEqual([
      "pre.agent.relay",
      "pre.cleanup.gate",
      "pre.crawl.guard",
      "pre.frustrated.readonly",
      "pre.governor.gate",
      "pre.run.contract",
      "pre.tokens.guard",
    ]);
    expect(names("PostToolUse", shell("echo hi")).sort()).toEqual([
      "post.approval.clear",
      "post.concept.title",
      "post.flow.completion",
      "post.governor.clear",
      "post.run.contract",
    ]);
  });

  test("crawl and cleanup read shell-quoted spellings, so a word filter would open a bypass", () => {
    expect(findRootCrawls('fi"n"d /', { shell: "bash", cwd: "/tmp/x" })).toHaveLength(1);
    expect(parseDeletes('g"i"t branch -D x', "/tmp/x").deletes).toHaveLength(1);
    expect(parseDeletes('r"m" -rf y', "/tmp/x").deletes).toHaveLength(1);
  });
});

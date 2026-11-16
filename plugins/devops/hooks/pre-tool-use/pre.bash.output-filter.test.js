import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.resolve(__dirname, "..", "..", "scripts", "run-filtered.js");
const { main, rewrite } = require("./pre.bash.output-filter.js");
const { filterOutput } = require("../../scripts/run-filtered.js");

const ROOT = "C:/plugin";
const on = { allowed: () => true, root: ROOT };
const hook = (command, extra = {}, tool = "Bash", input = {}) => ({
  tool_name: tool,
  permission_mode: "bypassPermissions",
  tool_input: { command, ...input },
  ...extra,
});
const out = (h, deps = on) => {
  const r = main(h, deps);
  return r ? JSON.parse(r).hookSpecificOutput : null;
};

describe("rewrite decision table", () => {
  const accepted = [
    "npm test",
    "npm test -- --reporter=dot",
    "npm run test:unit",
    "npm run build",
    "npm run lint -- --fix",
    "pnpm test",
    "yarn lint",
    "pnpm run build",
    "npx vitest run src/a.test.js",
    "vitest run",
    "jest --ci",
    "pytest -q tests/",
    "cargo test",
    "go build ./...",
    "dotnet test",
    "tsc --noEmit",
    "eslint src",
  ];
  test.each(accepted)("accepts %s", (cmd) => {
    expect(rewrite(cmd, ROOT)).toBe(`node "${ROOT}/scripts/run-filtered.js" -- ${cmd}`);
  });

  const refused = [
    ["pipe", "npm test | tail"],
    ["redirect", "npm test > out.txt"],
    ["semicolon", "npm test; echo x"],
    ["second &&", "cd a && npm test && echo x"],
    ["or", "npm test || true"],
    ["backtick", "npm test `x`"],
    ["subshell", "npm test $(x)"],
    ["heredoc", "npm test <<EOF"],
    ["newline", "npm test\necho x"],
    ["env prefix", "CI=1 npm test"],
    ["background &", "npm test &"],
    ["watch script", "npm run test:watch"],
    ["dev script", "npm run dev"],
    ["unknown script", "npm run deploy"],
    ["--watch", "vitest run --watch"],
    ["-w", "jest -w"],
    ["bare vitest", "vitest"],
    ["already filtered", 'node "/x/scripts/run-filtered.js" -- npm test'],
    ["cmd variable", "npm test -- -t %NAME%"],
    ["cmd escape", "npm test -- -t a^b"],
    ["escaped quote", 'npm test -- -t "says \\"hi\\""'],
    ["not a runner", "git status"],
    ["cargo run", "cargo run"],
  ];
  test.each(refused)("refuses %s", (_n, cmd) => {
    expect(rewrite(cmd, ROOT)).toBeNull();
  });

  test("keeps one leading cd outside the runner", () => {
    expect(rewrite("cd packages/app && npm test", ROOT)).toBe(
      `cd packages/app && node "${ROOT}/scripts/run-filtered.js" -- npm test`
    );
    expect(rewrite('cd "P:/my dir" && npm test', ROOT)).toBe(
      `cd "P:/my dir" && node "${ROOT}/scripts/run-filtered.js" -- npm test`
    );
  });
});

describe("main gates", () => {
  test("Bash and PowerShell rewrite, whole tool_input kept", () => {
    for (const tool of ["Bash", "PowerShell"]) {
      const o = out(hook("npm test", {}, tool, { description: "run", timeout: 5000 }));
      expect(o.hookEventName).toBe("PreToolUse");
      expect(o.updatedInput.command).toBe(`node "${ROOT}/scripts/run-filtered.js" -- npm test`);
      expect(o.updatedInput.description).toBe("run");
      expect(o.updatedInput.timeout).toBe(5000);
    }
  });
  test("other tool is ignored", () => {
    expect(out(hook("npm test", {}, "Read"))).toBeNull();
  });
  test("run_in_background refused", () => {
    expect(out(hook("npm test", {}, "Bash", { run_in_background: true }))).toBeNull();
  });
  test.each(["default", "acceptEdits", "plan", undefined])("permission_mode %s refused", (mode) => {
    expect(out(hook("npm test", { permission_mode: mode }))).toBeNull();
  });
  test("flag off returns nothing", () => {
    expect(out(hook("npm test"), { allowed: () => false, root: ROOT })).toBeNull();
  });
});

describe("filterOutput", () => {
  const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`);
  test("short output is unchanged", () => {
    const t = lines(60).join("\n") + "\n";
    expect(filterOutput(t, 0, "/x.log")).toBe(t);
  });
  test("long output with a failure keeps failure context, tail and path", () => {
    const l = lines(300);
    l[100] = " FAIL  src/a.test.js > adds";
    const r = filterOutput(l.join("\n") + "\n", 1, "/x.log");
    expect(r).toContain("line 97");
    expect(r).toContain("FAIL  src/a.test.js");
    expect(r).toContain("line 103");
    expect(r).not.toContain("line 50\n");
    expect(r).toContain("line 299");
    expect(r).toContain("[devops] full output: 300 lines → /x.log");
  });
  test("failing exit without a matching line prints the last 80 lines", () => {
    const r = filterOutput(lines(300).join("\n") + "\n", 1, "/x.log");
    expect(r).toContain("line 220");
    expect(r).not.toContain("line 219\n");
    expect(r).toContain("[devops] full output");
  });
});

describe("runner as a real process", () => {
  function temp() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "runfiltered-"));
    fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "plugins", ".channels.json"), JSON.stringify({ dotclaude: "alpha" }));
    return home;
  }
  const run = (home, args) =>
    spawnSync(process.execPath, [RUNNER, "--", ...args], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: home, TEMP: home, TMP: home },
    });
  const script = "for(let i=0;i<300;i++)console.log('line '+i);console.error('FAIL boom');process.exit(1)";

  test("long failing run: filtered, exit code kept, log and metric written", () => {
    const home = temp();
    const r = run(home, [process.execPath, "-e", script]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("FAIL boom");
    expect(r.stdout).not.toContain("line 5\n");
    const m = r.stdout.match(/full output: (\d+) lines → (.+)\n/);
    expect(m[1]).toBe("301");
    expect(fs.readFileSync(m[2], "utf8")).toContain("line 5\n");
    const metric = fs.readFileSync(path.join(home, ".claude", "devops-output-filter.jsonl"), "utf8").trim().split("\n").pop();
    const j = JSON.parse(metric);
    expect(j.exit).toBe(1);
    expect(j.printedChars).toBeLessThan(j.totalChars);
  });
  test("a long run names its log before it ends, so a killed run leaves its output findable", () => {
    const r = run(temp(), [process.execPath, "-e", script]);
    const first = r.stdout.split("\n")[0];
    const early = /^\[devops\] long output, written as it comes to (.+)$/.exec(first);
    expect(early).not.toBeNull();
    expect(r.stdout.match(/full output: \d+ lines → (.+)\n/)[1]).toBe(early[1]);
  });
  test("short passing run: unchanged, exit 0", () => {
    const r = run(temp(), [process.execPath, "-e", "console.log('ok')"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("ok\n");
  });
  test("keeps only the newest 20 logs", () => {
    const home = temp();
    for (let i = 0; i < 23; i++) run(home, [process.execPath, "-e", "console.log(1)"]);
    expect(fs.readdirSync(path.join(home, "devops-output")).length).toBeLessThanOrEqual(20);
  });
  test("flag off: exit 126, command not run", () => {
    const home = temp();
    fs.writeFileSync(path.join(home, ".claude", "plugins", ".channels.json"), JSON.stringify({ dotclaude: "stable" }));
    const r = run(home, [process.execPath, "-e", "console.log('ran')"]);
    expect(r.status).toBe(126);
    expect(r.stdout).toBe("");
  });
});

import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { main } = require("./pre.waitloop.guard.js");
const dispatch = require("../dispatch/dispatch.js");

const HOOK = fileURLToPath(new URL("./pre.waitloop.guard.js", import.meta.url));
const LOOP = "until grep -aq done /tmp/k2.out; do sleep 5; done";
const bash = (command, o = {}) => ({ tool_name: "Bash", tool_input: { command, ...o } });

describe("main", () => {
  test("blocks and names the ways out", () => {
    const r = main(bash(LOOP));
    expect(r.block).toContain("polls with no bound");
    expect(r.block).toContain(LOOP);
    expect(r.block).toContain("run_in_background");
    expect(r.block).toContain("Monitor");
    expect(r.block).toContain("timeout 300");
  });

  test("a spin loop names the missing sleep", () => {
    expect(main(bash("until pgrep x; do :; done")).block).toContain("no sleep");
  });

  test("run_in_background and the tool timeout are no exemption", () => {
    expect(main(bash(LOOP, { run_in_background: true })).block).toBeTruthy();
    expect(main(bash(LOOP, { timeout: 60000 })).block).toBeTruthy();
  });

  test("bounded loops, while read and plain commands pass", () => {
    expect(main(bash(`timeout 60 bash -c '${LOOP}'`))).toBeNull();
    expect(main(bash("while read -r l; do echo $l; done < f"))).toBeNull();
    expect(main(bash("ls -la"))).toBeNull();
  });

  test("inline bypass and other tools pass", () => {
    expect(main(bash(`DEVOPS_ALLOW_UNBOUNDED_LOOP=1 ${LOOP}`))).toBeNull();
    expect(main({ tool_name: "PowerShell", tool_input: { command: LOOP } })).toBeNull();
    expect(main({ tool_name: "Bash" })).toBeNull();
  });
});

describe("as a child process", () => {
  const run = (input) => spawnSync(process.execPath, [HOOK], { input, encoding: "utf8", env: { ...process.env, DEVOPS_ALLOW_UNBOUNDED_LOOP: "" } });

  test("a block is exit 2 with the text on stderr", () => {
    const r = run(JSON.stringify(bash(LOOP)));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("[wait-loop]");
  });

  test("fails open on unusable stdin", () => {
    for (const bad of ["", "null", "{nope", "[]"]) expect(run(bad).status).toBe(0);
  });
});

describe("dispatcher fast path", () => {
  const manifest = dispatch.loadManifest();
  const selected = (command) => dispatch
    .selectModules(manifest, "PreToolUse", bash(command))
    .some((m) => m.name === "pre.waitloop.guard");

  test("the module starts only for a command naming while or until", () => {
    expect(selected("ls -la")).toBe(false);
    expect(selected("npm run build && git status")).toBe(false);
    expect(selected(LOOP)).toBe(true);
    expect(selected("while true; do sleep 1; done")).toBe(true);
  });

  test("the module is registered for Bash only", () => {
    const mods = dispatch.selectModules(manifest, "PreToolUse", { tool_name: "PowerShell", tool_input: { command: LOOP } });
    expect(mods.some((m) => m.name === "pre.waitloop.guard")).toBe(false);
  });

  test("a payload without a command or a broken filter still starts the module", () => {
    const fixture = (commandFilter) => ({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/x.js"', commandFilter }] }] } });
    expect(dispatch.selectModules(fixture("nope"), "PreToolUse", { tool_name: "Bash", tool_input: {} })).toHaveLength(1);
    expect(dispatch.selectModules(fixture("("), "PreToolUse", bash("ls"))).toHaveLength(1);
    expect(dispatch.selectModules(fixture("nope"), "PreToolUse", bash("ls"))).toHaveLength(0);
  });
});

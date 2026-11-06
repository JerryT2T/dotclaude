import { describe, test, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HOOK = fileURLToPath(new URL("./pre.ship.guard.js", import.meta.url));
const PLUGIN_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const run = (tool_name, command) =>
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name, tool_input: { command } }),
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, DOTCLAUDE_ALLOW_MANUAL_SHIP: "" },
  });

describe("pre.ship.guard", () => {
  test.each(["Bash", "PowerShell"])("%s: gh.exe pr create is blocked", (tool) => {
    const r = run(tool, "gh.exe pr create --fill");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("BLOCKED: Manual PR creation");
  });

  test("another tool passes", () => {
    expect(run("Task", "gh pr create").status).toBe(0);
  });

  test("a read of the merge status passes", () => {
    expect(run("Bash", "gh api repos/o/r/pulls/5/merge").status).toBe(0);
  });
});

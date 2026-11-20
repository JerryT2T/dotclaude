import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const HOOK = path.resolve(import.meta.dirname, "ss.permissions.ensure.js");

function run(settings) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "perm-ensure-"));
  fs.mkdirSync(path.join(home, ".claude"));
  const file = path.join(home, ".claude", "settings.json");
  if (settings) fs.writeFileSync(file, JSON.stringify(settings));
  spawnSync(process.execPath, [HOOK], { env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: "utf8" });
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

describe("ss.permissions.ensure", () => {
  test("adds only the Edit rule — a Write(path) rule makes Claude Code warn on every start", () => {
    expect(run({}).permissions.allow).toEqual(["Edit(~/.claude/devops-concepts/**)"]);
  });

  test("removes the retired Write rule an older version added, keeps the user's own rules", () => {
    const out = run({ permissions: { allow: ["Bash(ls:*)", "Write(~/.claude/devops-concepts/**)", "Edit(~/.claude/devops-concepts/**)"] } });
    expect(out.permissions.allow).toEqual(["Bash(ls:*)", "Edit(~/.claude/devops-concepts/**)"]);
  });

  test("no user settings file → none is created", () => {
    expect(run(null)).toBeNull();
  });
});

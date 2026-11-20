import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Entry-point matrix of the project opt-out: every command of hooks.json, in
 * a project that switched devops off, must end with empty stdout and exit 0 —
 * from the SOURCE dir (an ad hoc / account-synced style copy: the case the old
 * guard always passed). The statusline stays on by decision and must still render.
 */

const PLUGIN = path.resolve(import.meta.dirname, "..");
const HOOKS = JSON.parse(fs.readFileSync(path.join(PLUGIN, "hooks", "hooks.json"), "utf8")).hooks;

const commands = [];
for (const [event, groups] of Object.entries(HOOKS)) {
  for (const g of groups) {
    for (const h of g.hooks || []) {
      if (h.type !== "command") continue;
      const m = /node "\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"([^|;&]*)/.exec(h.command);
      if (m) commands.push({ event, file: m[1], args: m[2].trim().split(/\s+/).filter(Boolean) });
    }
  }
}

function optedOutWorld({ off = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ep-home-"));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "ep-proj-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": true } }));
  if (off) {
    fs.mkdirSync(path.join(proj, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(proj, ".claude", "settings.local.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": false } }));
  }
  return { home, proj };
}

function runHookCommand({ file, args, event }, { home, proj }, pluginRoot) {
  const payload = JSON.stringify({ session_id: "ep-session", cwd: proj, hook_event_name: event, tool_name: "Bash", tool_input: { command: "echo hi" }, prompt: "hello", source: "startup" });
  return spawnSync(process.execPath, [path.join(PLUGIN, file), ...args], {
    cwd: proj,
    input: payload,
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PROJECT_DIR: proj },
  });
}

describe("opted-out project: every hooks.json command is silent", () => {
  test("hooks.json yields commands for every event incl. PermissionRequest", () => {
    expect(new Set(commands.map((c) => c.event))).toEqual(new Set(Object.keys(HOOKS)));
    expect(commands.some((c) => c.event === "PermissionRequest")).toBe(true);
  });

  for (const c of commands) {
    test(`${c.event} ${c.file} ${c.args.join(" ")}`.trim(), () => {
      const w = optedOutWorld();
      // source dir (ad hoc) and an account-synced style root
      for (const root of [PLUGIN, path.join(w.home, ".claude", "plugins", "synced", "org_acct", "devops~g2")]) {
        const r = runHookCommand(c, w, root);
        expect(r.status).toBe(0);
        expect(r.stdout).toBe("");
      }
    }, 120000);
  }

  test("session flag silences the dispatcher and both permission hooks", () => {
    const w = optedOutWorld({ off: false });
    const flag = path.join(w.home, ".claude", "devops-optout", "sessions", "ep-session.json");
    fs.mkdirSync(path.dirname(flag), { recursive: true });
    fs.writeFileSync(flag, JSON.stringify({ off: true }));
    const picks = commands.filter((c) => /dispatch\.js|perm\.approval/.test(c.file));
    expect(picks.length).toBeGreaterThanOrEqual(3);
    for (const c of picks) {
      const r = runHookCommand(c, w, PLUGIN);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("");
    }
  }, 240000);

  test("control: the same SessionStart in a project that is not opted out speaks", () => {
    const w = optedOutWorld({ off: false });
    const c = commands.find((x) => x.event === "SessionStart");
    const r = runHookCommand(c, w, PLUGIN);
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(0);
  }, 120000);
});

describe("statusline in an opted-out project", () => {
  test("still renders (decision: the statusline is not silenced)", () => {
    const w = optedOutWorld();
    const r = spawnSync(process.execPath, [path.join(PLUGIN, "scripts", "statusline-usage.js")], {
      cwd: w.proj,
      input: JSON.stringify({ model: { display_name: "Test" }, rate_limits: { five_hour: { used_percentage: 12, resets_at: Math.floor(Date.now() / 1000) + 3600 } } }),
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, HOME: w.home, USERPROFILE: w.home, CLAUDE_PLUGIN_ROOT: PLUGIN, CLAUDE_PROJECT_DIR: w.proj },
    });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().length).toBeGreaterThan(0);
  });
});

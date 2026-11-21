import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { decide, HOME_PANE_BACKGROUND } = require("./pre.plugin.session.js");

const PLUGIN = "/repos/dotclaude";
const CONSUMER = "/repos/app";

function deps(over = {}) {
  const marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "plugsess-")), "m");
  return {
    gitTopLevel: cwd => (cwd.startsWith(PLUGIN) ? PLUGIN : cwd.startsWith(CONSUMER) ? CONSUMER : null),
    isPluginSourceRepo: root => root === PLUGIN,
    upstreamSlug: () => "JerryT2T/dotclaude",
    hasPluginSignal: text => /devops plugin|dotclaude/i.test(text),
    issueThisTurn: () => false,
    markerFile: () => marker,
    ...over,
  };
}
const call = (input, cwd = CONSUMER) => JSON.stringify({ tool_name: "mcp__ccd_session__start_session", cwd, session_id: "s1", tool_input: input });

describe("pre.plugin.session (#1076)", () => {
  test("a consumer session starting a session in the plugin repo without an issue is refused once", () => {
    const d = deps();
    const input = { title: "Drop the tag chip", prompt: "remove the chip", cwd: PLUGIN + "/" };
    const text = decide(call(input), d);
    expect(text).toContain('Skill("devops:auto-issue")');
    expect(text).toContain("JerryT2T/dotclaude");
    expect(decide(call(input), d)).toBe("");                 // the retry of the same call passes
  });
  test("a brief about the plugin counts even without a cwd", () => {
    expect(decide(call({ prompt: "fix the devops plugin hook" }), deps())).toContain("Refused once");
  });
  test("passes when auto-issue ran this turn", () => {
    expect(decide(call({ cwd: PLUGIN }), deps({ issueThisTurn: () => true }))).toBe("");
  });
  test("passes inside the plugin source repo and for sessions that are not about the plugin", () => {
    expect(decide(call({ cwd: PLUGIN }, PLUGIN), deps())).toBe("");
    expect(decide(call({ prompt: "refactor the login page", cwd: CONSUMER }), deps())).toBe("");
  });
  test("a Home pane button press into the plugin repo passes on the first try", () => {
    const input = {
      initiation: "user_asked", context: "fresh", cwd: PLUGIN, title: "Batch ┃ dotclaude", prompt: "/do-batch",
      background: HOME_PANE_BACKGROUND + "; no other context belongs to this session.",
    };
    expect(decide(call(input), deps())).toBe("");
  });
  test("home.tsx still sends the background the hook exempts", () => {
    const home = fs.readFileSync(path.join(__dirname, "..", "mods", "home.tsx"), "utf8");
    expect(home).toMatch(new RegExp(`background: '${HOME_PANE_BACKGROUND}`));
  });
  test("an unwritable marker never wedges the start: it passes", () => {
    const d = deps({ markerFile: () => path.join(os.tmpdir(), "no-such-dir-plugsess", "x", "m") });
    expect(decide(call({ cwd: PLUGIN }), d)).toBe("");
  });
  test("other tools and broken input never block", () => {
    expect(decide(JSON.stringify({ tool_name: "Bash", tool_input: { command: "x" } }), deps())).toBe("");
    expect(decide("not json", deps())).toBe("");
  });
  test("registered on start_session, and the rule doc names the path", () => {
    const manifest = fs.readFileSync(path.join(__dirname, "..", "dispatch", "manifest.json"), "utf8");
    expect(manifest).toMatch(/pre\.plugin\.session\.js[\s\S]{0,400}"matcher": "mcp__ccd_session__start_session"/);
    const doc = fs.readFileSync(path.join(__dirname, "..", "..", "deep-knowledge", "plugin-scope-routing.md"), "utf8");
    expect(doc).toContain("pre.plugin.session");
  });
});

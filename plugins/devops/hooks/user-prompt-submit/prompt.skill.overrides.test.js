import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { main } = require("./prompt.skill.overrides.js");
const L = require("../lib/skill-overrides.js");

let tmp;
let home;
let project;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-skill-overrides-"));
  home = path.join(tmp, "home");
  project = path.join(tmp, "proj");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(project, ".git"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function override(dir, text) {
  const d = path.join(project, ".claude", "skills", dir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "reference.md"), text);
}

const prompt = (text) => ({ prompt: text, cwd: project, session_id: "s-prompt" });

describe("prompt.skill.overrides", () => {
  test("a typed /skill gets the same block (no Skill tool fires for it)", () => {
    override("do-ship", "## Replace Step 2\nscp\n");
    const reply = main(prompt("/do-ship"), { home, dir: tmp });
    expect(reply.context).toContain("[skill-overrides] do-ship: project reference.md");
    expect(reply.context).toContain("- REPLACE Step 2 of do-ship (project override)");
    expect(L.readRecordFile(L.recordPath("s-prompt", tmp)).skills[0].skill).toBe("do-ship");
  });

  test("raw pre-expansion prompts: /devops:skill args and bare /skill args both match", () => {
    override("do-ship", "## Replace Step 2\nscp\n");
    const ns = main(prompt("/devops:do-ship stable"), { home, dir: tmp });
    expect(ns.context).toContain("[skill-overrides] do-ship: project reference.md");
    const bare = main({ ...prompt("/do-ship stable"), session_id: "s-bare" }, { home, dir: tmp });
    expect(bare.context).toContain("[skill-overrides] do-ship: project reference.md");
  });

  test("the harness <command-name> form with a mode arg picks the mode's old dir", () => {
    override("do-run", "run rule");
    override("run-backlog", "backlog rule");
    override("tune-audit", "audit rule");
    const reply = main(prompt("<command-message>do-run</command-message>\n<command-name>/devops:do-run</command-name>\n<command-args>backlog</command-args>"), { home, dir: tmp });
    expect(reply.context).toContain("backlog rule");
    expect(reply.context).not.toContain("audit rule");
  });

  test("plain prompts and skills without overrides stay silent", () => {
    expect(main(prompt("bitte shippen"), { home, dir: tmp })).toBeNull();
    expect(main(prompt("/do-ship"), { home, dir: tmp })).toBeNull();
  });

  test("a record the card already rendered is cleared on the next prompt; an unrendered one stays", () => {
    const rec = { skill: "do-ship", mode: null, entries: [{ scope: "project", directives: [] }] };
    L.recordOverrides("s-prompt", rec, { dir: tmp });
    const file = L.recordPath("s-prompt", tmp);
    main(prompt("weiter"), { home, dir: tmp });
    expect(fs.existsSync(file)).toBe(true);
    L.markRendered(file);
    main(prompt("weiter"), { home, dir: tmp });
    expect(fs.existsSync(file)).toBe(false);
  });

  test("the same override text goes in full once per session, then as a one-line reminder", () => {
    override("do-ship", "## Skip Step 3\nnot here\n");
    const first = main({ ...prompt("/do-ship"), session_id: "s-once" }, { home, dir: tmp });
    expect(first.context).toContain("- SKIP Step 3 of do-ship");
    const again = main({ ...prompt("/do-ship"), session_id: "s-once" }, { home, dir: tmp });
    expect(again.context).toBe("[skill-overrides] do-ship: unchanged since earlier in this session — the same overrides stay binding for this run.");
    // another session, a changed file, and a compaction each send it in full
    expect(main({ ...prompt("/do-ship"), session_id: "s-other" }, { home, dir: tmp }).context).toContain("- SKIP Step 3");
    override("do-ship", "## Skip Step 4\nnope\n");
    expect(main({ ...prompt("/do-ship"), session_id: "s-once" }, { home, dir: tmp }).context).toContain("- SKIP Step 4");
    L.forgetSeen("s-once", { dir: tmp });
    expect(main({ ...prompt("/do-ship"), session_id: "s-once" }, { home, dir: tmp }).context).toContain("- SKIP Step 4");
  });

  test("a skill named only in a harness reminder is not a typed command", () => {
    override("do-ship", "## Skip Step 3\nx\n");
    const text = "<system-reminder>\n/do-ship\n</system-reminder>\nwas macht der Hook eigentlich?";
    expect(main(prompt(text), { home, dir: tmp })).toBeNull();
  });
});

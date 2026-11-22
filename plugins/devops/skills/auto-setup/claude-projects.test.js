import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL = fs.readFileSync(path.join(here, "SKILL.md"), "utf8");
const SNIPPET_FILE = path.join(here, "..", "..", "deep-knowledge", "project-instructions-snippet.md");
const SNIPPET = fs.readFileSync(SNIPPET_FILE, "utf8");
const STEP = SKILL.split("## Step 6 — Claude Projects")[1].split("## Step 7")[0];
const TEXT = SNIPPET.match(/```\n([\s\S]*?)\n```/)[1];

describe("auto-setup § Claude Projects (D4)", () => {
  test("the guide has the step before the wrap-up and counts six questions", () => {
    expect(SKILL).toMatch(/## Step 6 — Claude Projects[\s\S]*## Step 7 — Wrap up/);
    expect(SKILL).toContain("six short questions");
  });

  test("the step points to the one source and does not copy the text", () => {
    expect(STEP).toContain("deep-knowledge/project-instructions-snippet.md");
    expect(STEP).not.toContain("✨✨✨");
    expect(STEP).not.toMatch(/One issue = one thread\./);
  });

  test("it names the Worktree switch per folder and Project settings > Plugins", () => {
    expect(STEP).toMatch(/Worktree, per folder/);
    expect(STEP).toMatch(/non-repo parent folder/);
    expect(STEP).toContain("Project settings > Plugins");
  });

  test("the text quotes the card's status line, keeps the title head, one issue = one thread without the number in the title", () => {
    expect(TEXT).toContain("✨✨✨ <title> ✨✨✨");
    expect(TEXT).toMatch(/quote that status line/);
    expect(TEXT).toContain("<status> ➜ <icon> \": keep that head");
    expect(TEXT).toMatch(/One issue = one thread/);
    expect(TEXT).toMatch(/in the thread's task/);
    expect(TEXT).toMatch(/Do not put the issue number into the thread title/);
  });

  test("the text fits the 16,000-character project instructions with room to spare", () => {
    expect(TEXT.length).toBeLessThan(2000);
  });
});

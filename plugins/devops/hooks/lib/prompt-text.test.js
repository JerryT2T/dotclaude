import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { rawPrompt, ownWords, userText } = require("./prompt-text.js");
const { isInjectedPrompt } = require("./locale.js");

const WORKTREE_NOTE = "<system-reminder>\nYou are operating in a git worktree.\nWorktree path: P:/Projects/x/.claude/worktrees/devops-analyse-feature-refine-46168e\n</system-reminder>\n\n";

describe("prompt-text", () => {
  test("strips the worktree reminder the app prefixes to a typed prompt", () => {
    const hook = { prompt: WORKTREE_NOTE + "haben wir architekturelle flaws?" };
    expect(userText(hook)).toBe("haben wir architekturelle flaws?");
    expect(/\bfeature.*(?:ausarbeit|elaborat|refin)/i.test(userText(hook))).toBe(false);
  });

  test("strips pasted material", () => {
    expect(ownWords('ok <pasted_content id="a">feature refine log</pasted_content>')).toBe("ok");
  });

  test("falls back to legacy fields and tolerates garbage", () => {
    expect(rawPrompt({ user_message: "x" })).toBe("x");
    expect(rawPrompt(null)).toBe("");
    expect(userText({ prompt: 42 })).toBe("");
  });
});

describe("locale.isInjectedPrompt with a reminder prefix", () => {
  test("a typed prompt behind the worktree note is the user's", () => {
    expect(isInjectedPrompt(WORKTREE_NOTE + "haben wir flaws?")).toBe(false);
  });
  test("a prompt that is only reminders is generated", () => {
    expect(isInjectedPrompt(WORKTREE_NOTE)).toBe(true);
  });
  test("a reminder followed by a task notification is generated", () => {
    expect(isInjectedPrompt(WORKTREE_NOTE + "<task-notification>done</task-notification>")).toBe(true);
  });
  test("other markers still count as generated", () => {
    expect(isInjectedPrompt("<task-notification>x</task-notification>")).toBe(true);
  });
});

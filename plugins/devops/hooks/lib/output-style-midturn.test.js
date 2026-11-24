/** The Quiet style carries the mid-turn question rule (#1188): answer as final text before any blocking wait. */
import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
const template = read("templates/output-style-quiet.md");
const guide = read("skills/auto-guide/SKILL.md");

describe("Mid-turn question rule", () => {
  test("Quiet style: final text before a blocking wait, background work keeps running", () => {
    const rule = template.slice(template.indexOf("**Mid-turn question.**"), template.indexOf("A turn triggered by a background-task"));
    expect(rule.length).toBeGreaterThan(0);
    expect(rule).toMatch(/final text, before any further blocking wait/);
    expect(rule).toMatch(/read_terminal/);
    expect(rule).toMatch(/keeps going and wakes the session/);
  });
  test("auto-guide Step 5: panel answer plus end of turn, also after the loop", () => {
    const step = guide.slice(guide.indexOf("## Step 5"), guide.indexOf("**Resuming in a new turn**"));
    expect(step).toMatch(/end the turn with the answer as its last text/);
    expect(step).toMatch(/After the panel loop/);
    expect(step).not.toMatch(/Never end the turn just to surface a chat answer/);
  });
});

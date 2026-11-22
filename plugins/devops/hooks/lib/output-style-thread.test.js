/** C2 — the Quiet style's thread section: present, short, names the thread tools; the rest of the style is untouched. */
import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const template = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "output-style-quiet.md"), "utf8").replace(/\r\n/g, "\n");
const section = template.slice(template.indexOf("**In a Claude Projects thread**"), template.indexOf("Tool and hook output is addressed to you"));

describe("Quiet style thread section", () => {
  test("exists and stays under 15 lines", () => {
    expect(section.length).toBeGreaterThan(0);
    expect(section.trim().split("\n").length).toBeLessThanOrEqual(15);
  });
  test("names every thread tool of the channel table", () => {
    for (const tool of ["mcp__hearthbot__post_message", "rename_thread", "update_progress_checklist", "set_thread_resolved", "no_reply_needed"]) {
      expect(section).toContain(tool);
    }
    for (const channel of ["text", "question", "card", "file"]) expect(section.toLowerCase()).toContain(`| ${channel}`);
  });
  test("the wake note wins over never-narrate for the first reply", () => {
    expect(section).toMatch(/at most 20 words first/);
    expect(section).toMatch(/wins over "never\s+narrate"/);
  });
  test("the Desktop rules stay: AskUserQuestion for decisions, no narration", () => {
    expect(template).toMatch(/use `AskUserQuestion` with concrete options/);
    expect(template).toMatch(/Never narrate what you are doing/);
  });
});

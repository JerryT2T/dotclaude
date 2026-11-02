import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The claude.ai plugin sync validates every agent and silently drops the ones
// it rejects ("Agent name 'qa' must be at least 3 characters", 2026-11-01) —
// the marketplace still reports "Synchronisiert", the agent is just gone in
// the Desktop Code tab and in cloud sessions.
const dir = dirname(fileURLToPath(import.meta.url));
const agents = readdirSync(dir).filter((f) => f.endsWith(".md"));

describe("agent names pass the claude.ai plugin sync", () => {
  test.each(agents)("%s", (file) => {
    const fm = readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n");
    const name = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(fm)?.[1];
    expect(name, "frontmatter name").toBeTruthy();
    expect(name.length, `'${name}' is shorter than 3 characters`).toBeGreaterThanOrEqual(3);
    expect(file).toBe(`${name}.md`);
  });
});

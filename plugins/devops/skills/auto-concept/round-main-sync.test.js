import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "deep-knowledge");
const step5 = readFileSync(join(dir, "step5-process.md"), "utf8");
const reality = readFileSync(join(dir, "reality-check.md"), "utf8");

describe("concept round brings main in", () => {
  const start = step5.indexOf("## Bring main in before the round");
  const end = step5.indexOf("## 5a · Read and parse");
  const section = step5.slice(start, end);

  it("runs the sync synchronously before the submission is read", () => {
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(end);
    expect(section).toContain('node "{PLUGIN_ROOT}/scripts/git-sync.js" --explain');
  });

  it("covers iterate, next-stage and implement, but no stale wake and no finalize", () => {
    for (const action of ["`iterate`", "`next-stage`", "`implement`"]) expect(section).toContain(action);
    expect(section).toMatch(/stale wake changes nothing and merges nothing/i);
    expect(section).toMatch(/`finalize` skips it/);
  });

  it("treats a skip as not up to date and never auto-resolves a conflict", () => {
    expect(section).toMatch(/`– skipped:` is not "up to date"/);
    expect(section).toMatch(/never with\s+`--ours` \/\s+`--theirs`/);
  });

  it("merges before the reality check, which stays in force", () => {
    expect(section).toMatch(/runs before the reality check/);
    expect(reality).toMatch(/Main is already merged into the branch/);
  });
});

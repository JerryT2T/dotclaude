import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..", "..", "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

describe("batch landing lane is the default (#1016)", () => {
  const backlog = read("plugins/devops/skills/do-run/modes/backlog.md");
  it("backlog mode documents batch default and the --per-item flag", () => {
    expect(backlog).toContain("## Landing lane");
    expect(backlog).toContain("`$LANE=batch` is the default");
    expect(backlog).toContain("--per-item");
    expect(backlog).toContain("--batch=<M>");
    expect(backlog).toMatch(/closes #N/);
  });
  it("router and do-ship name the flags", () => {
    expect(read("plugins/devops/skills/do-run/SKILL.md")).toContain("--per-item");
    const ship = read("plugins/devops/skills/do-ship/SKILL.md");
    expect(ship).toContain("`--batch=<M>`");
    expect(ship).toContain('mergeStrategy: "rebase"');
  });
  it("Full suite CI is not cancelled by follow-up pushes", () => {
    const wf = read(".github/workflows/ci-suite.yml");
    expect(wf).toMatch(/group: ci-suite-[^\n]*\n\s*cancel-in-progress: false/);
  });
});

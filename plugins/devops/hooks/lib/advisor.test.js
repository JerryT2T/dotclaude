const fs = require("fs");
const os = require("os");
const path = require("path");
const { advisorModel, advisorLine } = require("./advisor.js");

function dirs(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "advisor-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "proj");
  for (const [rel, json] of Object.entries(files)) {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(json));
  }
  return { home, cwd };
}

describe("advisor", () => {
  test("no advisor configured → no line", () => {
    const d = dirs({ "home/.claude/settings.json": { model: "opus" } });
    expect(advisorModel(d)).toBe(null);
    expect(advisorLine(null, "ultra")).toBe("");
  });

  test("local beats project beats user settings", () => {
    const d = dirs({
      "home/.claude/settings.json": { advisorModel: "opus" },
      "proj/.claude/settings.json": { advisorModel: "fable" },
      "proj/.claude/settings.local.json": { advisorModel: "claude-fable-5-2" },
    });
    expect(advisorModel(d)).toBe("claude-fable-5-2");
    expect(advisorModel(dirs({ "home/.claude/settings.json": { advisorModel: "opus" } }))).toBe("opus");
  });

  test("the line names inheritance and the plan-specific Fable cost", () => {
    expect(advisorLine("fable", "ultra")).toContain("every spawned agent inherits it");
    expect(advisorLine("fable", "ultra")).toContain("capped Fable share");
    expect(advisorLine("fable", "pro")).toContain("bills usage credits");
    expect(advisorLine("fable", "team")).toContain("premium seats");
    expect(advisorLine("opus", "pro")).toContain("count toward the plan");
  });

  test("unreadable settings fail open", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "advisor-"));
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(root, ".claude", "settings.json"), "{ not json");
    expect(advisorModel({ cwd: root, home: root })).toBe(null);
  });
});

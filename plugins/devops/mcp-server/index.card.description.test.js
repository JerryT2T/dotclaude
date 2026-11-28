import { describe, test, expect, vi } from "vitest";

// Every rule card-pregate / the card validation enforces must be stated in the
// tool description, so Claude knows it BEFORE the call (31 % of calls were refused).
process.env.DEVOPS_COMPLETION_NO_USAGE = "1";
process.env.CLAUDE_CODE_ENTRYPOINT = "cli";

const captured = vi.hoisted(() => ({ cfg: {} }));
vi.mock("./lib/ensure-deps.js", () => ({ ensureDeps: async () => {} }));
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    registerTool(name, cfg) { captured.cfg[name] = cfg; }
    async connect() {}
  },
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: class {} }));
vi.mock("zod", () => {
  const node = new Proxy(() => node, { get: () => () => node });
  return { z: new Proxy({}, { get: () => () => node }) };
});

const RULES = {
  "title status word (gate 3)": "status word",
  "point length (POINT_MAX)": "120 characters",
  "validation owed (gate 4)": "`validation`",
  "verification owed (gate V)": "`verification: {skipped: true",
  "background work (gate 5)": "`pending`",
  "pendingDismissed minimum": "≥ 20 characters",
  "analysis after write (A)": "`analysis` only if nothing was written",
  "user question / security finding need open (Q, S)": "`open` item with `reply`",
  "web hand-off guide (G)": "web guide",
  "broken cwd": "forward slashes",
};

describe("render_completion_card description states every enforced rule", () => {
  test("rules are in the description, checklist first", async () => {
    await import("./index.js");
    const d = captured.cfg.render_completion_card.description;
    for (const [rule, phrase] of Object.entries(RULES)) expect(d, rule).toContain(phrase);
    expect(d.indexOf("BEFORE YOU CALL")).toBeLessThan(200);
  });
});

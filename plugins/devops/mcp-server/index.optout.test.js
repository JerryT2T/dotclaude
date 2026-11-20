import { test, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The MCP server of an opted-out project connects but lists NO tools. The SDK
// is mocked (same preamble as index.heartbeat.test.js): the test pins that no
// group registers a tool and that tools/list answers an empty list.
const seen = vi.hoisted(() => ({ tools: [], capabilities: [], handlers: [] }));
vi.mock("./lib/ensure-deps.js", () => ({ ensureDeps: async () => {} }));
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    constructor() {
      this.server = {
        registerCapabilities: (c) => seen.capabilities.push(c),
        setRequestHandler: (schema, fn) => seen.handlers.push({ schema, fn }),
      };
    }
    registerTool(name) { seen.tools.push(name); return {}; }
    async connect() {}
  },
}));
vi.mock("@modelcontextprotocol/sdk/types.js", () => ({ ListToolsRequestSchema: { method: "tools/list" } }));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: class {} }));
vi.mock("zod", () => {
  const node = new Proxy(() => node, { get: () => () => node });
  const z = new Proxy({}, { get: () => () => node });
  return { z };
});

const KEYS = ["HOME", "USERPROFILE", "CLAUDE_PROJECT_DIR", "CLAUDE_PLUGIN_ROOT", "DEVOPS_COMPLETION_NO_USAGE"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  seen.tools.length = 0; seen.capabilities.length = 0; seen.handlers.length = 0;
  vi.resetModules();
  return () => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
});

function env({ off }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-oo-home-"));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-oo-proj-"));
  fs.mkdirSync(path.join(proj, ".claude"));
  if (off) fs.writeFileSync(path.join(proj, ".claude", "settings.local.json"), JSON.stringify({ enabledPlugins: { "devops@dotclaude": false } }));
  process.env.HOME = home; process.env.USERPROFILE = home;
  process.env.CLAUDE_PROJECT_DIR = proj;
  process.env.CLAUDE_PLUGIN_ROOT = path.join(home, ".claude", "plugins", "synced", "org_acct", "devops~g2");
  process.env.DEVOPS_COMPLETION_NO_USAGE = "1";
}

test("opted-out project: no tool is registered and tools/list is empty", async () => {
  env({ off: true });
  await import("./index.js");
  expect(seen.tools).toEqual([]);
  expect(seen.capabilities).toContainEqual({ tools: {} });
  const h = seen.handlers.find((x) => x.schema.method === "tools/list");
  expect(h).toBeTruthy();
  expect(await h.fn()).toEqual({ tools: [] });
});

test("normal project: tools are registered", async () => {
  env({ off: false });
  await import("./index.js");
  expect(seen.tools.length).toBeGreaterThan(0);
  expect(seen.handlers.find((x) => x.schema.method === "tools/list")).toBeUndefined();
});

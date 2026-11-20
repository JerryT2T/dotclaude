import { describe, test, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const { runCheck, parseArgs, resolveBilling, MARKER } = createRequire(import.meta.url)("./optout-live-check.js");

// Stubbed `claude`: writes a transcript for the session id, containing the
// marker only when `leaksFor(cwd)` says so. No real Claude, no network.
function fixture({ leak = false, controlMarker = true, status = 0 } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "olc-home-"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "olc-tmp-"));
  const projDir = path.join(home, ".claude", "projects", "slug");
  fs.mkdirSync(projDir, { recursive: true });
  const calls = [];
  const spawn = vi.fn((bin, args, o) => {
    if (bin === "git") return { status: 0 };
    const id = args[args.indexOf("--session-id") + 1];
    const optedOut = fs.existsSync(path.join(o.cwd, ".claude", "settings.local.json"));
    calls.push({ args, optedOut, env: o.env, settings: optedOut && fs.readFileSync(path.join(o.cwd, ".claude", "settings.json"), "utf8") });
    const has = optedOut ? leak : controlMarker;
    fs.writeFileSync(path.join(projDir, `${id}.jsonl`), has ? `{"x":"${MARKER}0.1 {PLUGIN_ROOT} = C:/plugins/synced/a"}\n` : `{"x":"hi"}\n`);
    return { status };
  });
  let n = 0;
  return { home, tmp, spawn, calls, deps: { home, tmp, spawn, bin: "claude", uuid: () => `id-${++n}`, env: {}, safe: { resolveKey: () => null, loadSwitches: () => ({ enabled: false }) } } };
}

describe("optout-live-check", () => {
  test("pass: control has the marker, opted-out project does not; temp projects removed", () => {
    const f = fixture();
    const r = runCheck({}, f.deps);
    expect(r.status).toBe("pass");
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1].settings).toContain('"devops@dotclaude": false');
    expect(f.calls[0].args).toEqual(expect.arrayContaining(["-p", "--model", "haiku", "--output-format", "json"]));
    expect(fs.readdirSync(f.tmp)).toEqual([]);
  });

  test("fail: the opt-out leaks the hook context (the live bug) and names the synced copy", () => {
    const f = fixture({ leak: true });
    const r = runCheck({}, f.deps);
    expect(r.status).toBe("fail");
    expect(r.reason).toMatch(/still got devops hook context/);
    expect(r.reason).toMatch(/synced/);
  });

  test("fail: a control without the marker is no evidence", () => {
    const f = fixture({ controlMarker: false });
    const r = runCheck({}, f.deps);
    expect(r.status).toBe("fail");
    expect(r.reason).toMatch(/control project has no/);
  });

  test("inconclusive: claude exits non-zero", () => {
    const f = fixture({ status: 1 });
    expect(runCheck({}, f.deps).status).toBe("inconclusive");
  });

  test("auto billing: API key control without marker retries on the plan login", () => {
    const f = fixture({ controlMarker: false });
    f.deps.env = {};
    f.deps.safe = { resolveKey: () => ({ key: "sk-test" }), loadSwitches: () => ({ enabled: true }) };
    const r = runCheck({ billing: "auto" }, f.deps);
    expect(f.calls[0].env.ANTHROPIC_API_KEY).toBe("sk-test");
    expect(f.calls[2].env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(r.status).toBe("fail");
  });

  test("billing: never the key inside a session; --billing api refuses there", () => {
    const safe = { resolveKey: () => ({ key: "k" }), loadSwitches: () => ({ enabled: true }) };
    expect(resolveBilling("auto", { CLAUDECODE: "1" }, { safe }).key).toBeNull();
    expect(resolveBilling("api", { CLAUDECODE: "1" }, { safe }).error).toMatch(/own terminal/);
    expect(resolveBilling("auto", {}, { safe }).key).toBe("k");
  });

  test("parseArgs rejects unknown flags and bad billing", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown/);
    expect(() => parseArgs(["--billing", "x"])).toThrow(/billing/);
    expect(parseArgs(["--dry-run"]).dryRun).toBe(true);
  });
});

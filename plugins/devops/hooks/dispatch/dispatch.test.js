import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { runEvent, laneGroups, dispatchDisabled, selectModules, hardExitStdout, guardFailOpen, guardedLane, finalReply, unchecked } = require("./dispatch.js");
const { spawnSync } = require("node:child_process");

let dir;
const FIXTURES = {
  // reads stdin as a stream, answers with context
  "ctx.js": `let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>raw+=d);process.stdin.on('end',()=>{
    const h=JSON.parse(raw);process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:h.hook_event_name,additionalContext:'ctx:'+h.tool_name}}));});`,
  // exit-2 gate via process.exit
  "block.js": `process.stdin.resume();process.stdin.on('end',()=>{process.stderr.write('BLOCKED by fixture\\n');process.exit(2);});`,
  // exit-2 via exitCode, after a large write (drain)
  "drain.js": `process.stdout.write('x'.repeat(100000));process.stderr.write('late block');process.exitCode=2;`,
  // fd-0 read + fd-1 writeSync + main-module check
  "fd.js": `const fs=require('fs');const raw=fs.readFileSync(0,'utf8');fs.writeSync(1,JSON.stringify({systemMessage:'fd:'+JSON.parse(raw).tool_name+':'+(require.main===module)+':'+require('path').basename(process.argv[1])}));process.exit(0);`,
  // module-level state never leaks between modules
  "state-a.js": `globalThis.__seen=(globalThis.__seen||0)+1;process.env.FIXTURE_LEAK='a';process.stdout.write(JSON.stringify({systemMessage:'a'+globalThis.__seen}));`,
  "state-b.js": `globalThis.__seen=(globalThis.__seen||0)+1;process.stdout.write(JSON.stringify({systemMessage:'b'+globalThis.__seen+(process.env.FIXTURE_LEAK||'')}));`,
  // a busy loop is terminated at its budget
  "spin.js": `for(;;){}`,
  // an uncaught throw is a non-blocking error
  "throw.js": `throw new Error('kaboom');`,
  // sits in a synchronous spawn far past its budget, as a slow git call does
  "spawn-sync.js": `require('child_process').execSync('node -e "setTimeout(()=>{},30000)"',{windowsHide:true,stdio:'pipe'});process.stdout.write(JSON.stringify({systemMessage:'never'}));`,
  "spawn-esm.mjs": `import { spawnSync } from 'node:child_process';const r=spawnSync(process.execPath,['-e','setTimeout(()=>{},30000)'],{windowsHide:true});process.stdout.write(JSON.stringify({systemMessage:'esm:'+(r.error&&r.error.code)}));`,
  // a spawn the worker's cap cannot reach: the thread stays stuck for 4 s
  "stuck.js": `process.binding('spawn_sync').spawn({file:process.execPath,args:[process.execPath,'-e','setTimeout(()=>{},4000)'],envPairs:[],stdio:[{type:'ignore'},{type:'ignore'},{type:'ignore'}]});`,
  // records the run id the dispatcher handed in, then spins into its budget
  "id-spin.js": `require('fs').writeFileSync(require('path').join(__dirname,'seen-id.txt'),require('worker_threads').workerData.telemetryId);for(;;){}`,
};
const mod = (name, o = {}) => ({ name: name.replace(/\.js$/, ""), file: path.join(dir, name), timeoutS: 10, isolate: "worker", dispatch: true, ...o });
const payload = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } });
const run = (modules, o = {}) => runEvent({ event: "PreToolUse", raw: payload, modules, budgetS: 20, tele: null, ...o });

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-test-"));
  for (const [f, src] of Object.entries(FIXTURES)) fs.writeFileSync(path.join(dir, f), src);
});
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("dispatcher runs modules in worker threads like separate processes", () => {
  test("stream stdin, context reply", async () => {
    const r = await run([mod("ctx.js")]);
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toBe("ctx:Bash");
    expect(r.code).toBe(0);
  });

  test("a gate's exit 2 still blocks, and the other modules still ran and kept their context", async () => {
    const r = await run([mod("ctx.js"), mod("block.js"), mod("fd.js")]);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe("BLOCKED by fixture\n");
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.additionalContext).toBe("ctx:Bash");
    expect(out.systemMessage).toBe("fd:Bash:true:fd.js");
  });

  test("process.exitCode = 2 after a large write: exit code and stdout survive", async () => {
    const r = await run([mod("drain.js")]);
    expect(r.code).toBe(2);
    expect(r.stdout.length).toBe(100000);
    expect(r.stderr).toBe("late block");
  });

  test("module state and env never leak between modules (one lane, sequential)", async () => {
    const r = await run([mod("state-a.js"), mod("state-b.js")], { lanes: [["state-a", "state-b"]] });
    expect(JSON.parse(r.stdout).systemMessage).toBe("a1\nb1");
  });

  test("a module over its budget is terminated and the rest still answer", async () => {
    const t0 = Date.now();
    const r = await run([mod("spin.js", { timeoutS: 1 }), mod("ctx.js")]);
    expect(Date.now() - t0).toBeLessThan(8000);
    expect(r.results[0].timedOut).toBe(true);
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toBe("ctx:Bash");
  });

  test("a module stuck in a synchronous spawn ends at its budget, the others keep their reply", async () => {
    const t0 = Date.now();
    const r = await run([mod("spawn-sync.js", { timeoutS: 1 }), mod("ctx.js")]);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.results[0].timedOut).toBe(true);
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toBe("ctx:Bash");
  }, 20_000);

  test("the deadline also reaches a spawn imported as an ES module binding", async () => {
    const t0 = Date.now();
    await run([mod("spawn-esm.mjs", { timeoutS: 1 })]);
    expect(Date.now() - t0).toBeLessThan(5000);
  }, 20_000);

  test("a thread that cannot be ended is given up: the reply comes anyway, marked stuck", async () => {
    const t0 = Date.now();
    const r = await run([mod("stuck.js", { timeoutS: 1 }), mod("ctx.js")]);
    expect(Date.now() - t0).toBeLessThan(3500);
    expect(r.results[0]).toMatchObject({ timedOut: true, stuck: true });
    expect(r.results[1].stuck).toBe(false);
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toBe("ctx:Bash");
  }, 20_000);

  test("a hard exit keeps plain context, as JSON: exit 1 would drop it as plain text", () => {
    expect(JSON.parse(hardExitStdout("SessionStart", "rule\n")).hookSpecificOutput).toEqual({ hookEventName: "SessionStart", additionalContext: "rule" });
    expect(hardExitStdout("SessionStart", '{"systemMessage":"m"}\n')).toBe('{"systemMessage":"m"}\n');
    expect(hardExitStdout("SessionStart", "")).toBe("");
  });

  test("a module is skipped once the event budget is spent", async () => {
    const r = await run([mod("spin.js", { timeoutS: 5 }), mod("ctx.js")], { budgetS: 1, lanes: [["spin", "ctx"]] });
    expect(r.results[0].timedOut).toBe(true);
    expect(r.results[1].skipped).toBe(true);
    expect(r.stdout).toBe("");
  });

  test("a module prepared ahead in its lane times out under its own run id (one kill, one record)", async () => {
    const recs = [];
    const tele = { record: (r) => recs.push(r) };
    const r = await run([mod("ctx.js"), mod("id-spin.js", { timeoutS: 1 })], { tele, lanes: [["ctx", "id-spin"]] });
    expect(r.results[1].timedOut).toBe(true);
    const seen = fs.readFileSync(path.join(dir, "seen-id.txt"), "utf8");
    expect(recs).toEqual([expect.objectContaining({ hook: "id-spin", outcome: "timeout", id: seen })]);
  });

  test("the opt-out writes no dispatcher end record for a killed child (its own start already counts)", async () => {
    const recs = [];
    const r = await run([mod("spin.js", { timeoutS: 1 })], { tele: { record: (x) => recs.push(x) }, processMode: true });
    expect(r.results[0].timedOut).toBe(true);
    expect(recs).toEqual([]);
  });

  test("an uncaught throw fails open (exit 1 of that module only)", async () => {
    const r = await run([mod("throw.js"), mod("ctx.js")]);
    expect(r.code).toBe(0);
    expect(r.results[0].code).toBe(1);
    expect(r.stderr).toMatch(/kaboom/);
  });

  test("the opt-out runs the same modules as separate processes with the same merged reply", async () => {
    const mods = [mod("ctx.js"), mod("block.js"), mod("fd.js")];
    const a = await run(mods);
    const b = await run(mods, { processMode: true });
    expect(b).toMatchObject({ code: a.code, stdout: a.stdout, stderr: a.stderr });
    expect(dispatchDisabled({ DEVOPS_HOOK_DISPATCH: "0" })).toBe(true);
    expect(dispatchDisabled({ DEVOPS_HOOK_DISPATCH: "off" })).toBe(true);
    expect(dispatchDisabled({})).toBe(false);
  });
});

describe("fail-closed guards: a module marked onFailure block that gives no verdict holds the call back", () => {
  const guard = (name, o = {}) => mod(name, { onFailure: "block", ...o });

  test("killed at its budget: the call is held back and the reason names the guard", async () => {
    const r = await run([guard("spin.js", { timeoutS: 1 }), mod("ctx.js")]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^\[devops\] spin guards this call and ran out of time/);
    expect(r.stderr).toMatch(/DEVOPS_GUARD_FAIL_OPEN=1/);
    expect(r.results[0].timedOut).toBe(true);
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toBe("ctx:Bash");
  });

  test("crashed: held back, while the same module without the mark still fails open", async () => {
    const closed = await run([guard("throw.js"), mod("ctx.js")]);
    expect(closed.code).toBe(2);
    expect(closed.stderr).toMatch(/throw guards this call and crashed/);
    expect((await run([mod("throw.js"), mod("ctx.js")])).code).toBe(0);
  });

  test("skipped for lack of event budget: held back", async () => {
    const r = await run([mod("spin.js", { timeoutS: 5 }), guard("ctx.js")], { budgetS: 1, lanes: [["spin", "ctx"]] });
    expect(r.results[1].skipped).toBe(true);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/ctx guards this call and had no time budget left/);
  });

  test("a guard that answered keeps its own verdict, allow or block", async () => {
    expect((await run([guard("ctx.js")])).code).toBe(0);
    const blocked = await run([guard("block.js")]);
    expect(blocked).toMatchObject({ code: 2, stderr: "BLOCKED by fixture\n" });
  });

  test("only PreToolUse gates a call: on another event the same failure stays open", async () => {
    const r = await run([guard("spin.js", { timeoutS: 1 })], { event: "PostToolUse" });
    expect(r.code).toBe(0);
  });

  test("the opt-out process model holds the call back the same way", async () => {
    const r = await run([guard("spin.js", { timeoutS: 1 })], { processMode: true });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/spin guards this call and ran out of time/);
  });

  test("DEVOPS_GUARD_FAIL_OPEN=1 lets the call through again", async () => {
    expect(guardFailOpen({ DEVOPS_GUARD_FAIL_OPEN: "1" })).toBe(true);
    expect(guardFailOpen({})).toBe(false);
    process.env.DEVOPS_GUARD_FAIL_OPEN = "1";
    try {
      expect((await run([guard("spin.js", { timeoutS: 1 })])).code).toBe(0);
    } finally {
      delete process.env.DEVOPS_GUARD_FAIL_OPEN;
    }
  });

  test("the manifest marks exactly the four gates whose verdict a call needs", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "manifest.json"), "utf8"));
    const marked = Object.entries(manifest.hooks).flatMap(([event, groups]) => groups.flatMap((g) => g.hooks)
      .filter((h) => h.onFailure === "block").map((h) => `${event}:${/([\w.-]+)\.js/.exec(h.command)[1]}`));
    expect(marked.sort()).toEqual(["PreToolUse:pre.cleanup.gate", "PreToolUse:pre.main.guard", "PreToolUse:pre.run.contract", "PreToolUse:pre.ship.guard"]);
  });
});

describe("a guarded lane answers Claude Code's onFailure block only with exit 0 or 2", () => {
  const { build, guardedCommand } = require("./build-hooks-json.js");
  const manifest = () => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "manifest.json"), "utf8"));

  test("only the main PreToolUse entry carries onFailure block and the way out", () => {
    const hooks = build(manifest()).hooks;
    const marked = Object.entries(hooks).flatMap(([event, groups]) => groups.flatMap((g) => g.hooks)
      .filter((h) => h.onFailure === "block").map((h) => `${event}:${h.command.includes("--fast") ? "fast" : "main"}`));
    expect(marked).toEqual(["PreToolUse:main"]);
    const entry = hooks.PreToolUse[0].hooks[0];
    expect(entry.command).toBe(guardedCommand("PreToolUse"));
    expect(entry.command).toMatch(/dispatch\.js" PreToolUse \|\| \{ rc=\$\?; \[ "\$rc" != 2 \] && \[ -n "\$DEVOPS_GUARD_FAIL_OPEN" \] && exit 0; exit \$rc; \}$/);
  });

  test("the lane is guarded exactly when a module of its main roster is a fail-closed guard", () => {
    expect(guardedLane([{ name: "a" }, { name: "g", onFailure: "block" }])).toBe(true);
    expect(guardedLane([{ name: "a" }])).toBe(false);
    expect(guardedLane([{ name: "g", onFailure: "block" }], true)).toBe(false);
  });

  test("a module's exit 1 is no failure of the dispatcher: 0 on a guarded lane, kept elsewhere", () => {
    expect(finalReply({ code: 1, stdout: '{"systemMessage":"m"}\n', guarded: true })).toEqual({ code: 0, stdout: '{"systemMessage":"m"}\n' });
    expect(finalReply({ code: 1, stdout: "", guarded: false })).toEqual({ code: 1, stdout: "" });
    expect(finalReply({ code: 2, stdout: "", guarded: true }).code).toBe(2);
    expect(finalReply({ code: 0, stdout: "plain", guarded: true })).toEqual({ code: 0, stdout: "plain" });
  });

  test("stdout that looks like JSON but is none never reaches Claude Code on a guarded lane", () => {
    expect(finalReply({ code: 0, stdout: '{"systemMessage": oops', guarded: true })).toEqual({ code: 0, stdout: "" });
    expect(finalReply({ code: 0, stdout: '{"systemMessage": oops', guarded: false }).stdout).toBe('{"systemMessage": oops');
  });

  test("a dispatcher that cannot check a call holds it back on the guards' lane only", () => {
    const held = unchecked("PreToolUse", false, "the hook manifest could not be read", {});
    expect(held.code).toBe(2);
    expect(held.stderr).toMatch(/^\[devops\] the hook manifest could not be read, so no guard could check this call/);
    expect(unchecked("PreToolUse", true, "x", {})).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(unchecked("PostToolUse", false, "x", {}).code).toBe(0);
    expect(unchecked("PreToolUse", false, "x", { DEVOPS_GUARD_FAIL_OPEN: "1" }).code).toBe(0);
  });

  test("the real process: an unreadable manifest ends a PreToolUse call with exit 2, another event with 0", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-nomanifest-"));
    try {
      const hooks = path.join(root, "hooks");
      fs.cpSync(path.join(import.meta.dirname, ".."), hooks, { recursive: true, filter: (src) => !/node_modules|\.test\.[jt]sx?$|[\\/]mods([\\/]|$)/.test(src) });
      fs.writeFileSync(path.join(hooks, "dispatch", "manifest.json"), "{ not json");
      const go = (event, env = {}) => spawnSync(process.execPath, [path.join(hooks, "dispatch", "dispatch.js"), event], {
        input: payload, encoding: "utf8", windowsHide: true, env: { ...process.env, DEVOPS_GUARD_FAIL_OPEN: "", ...env },
      });
      const pre = go("PreToolUse");
      expect(pre.status).toBe(2);
      expect(pre.stderr).toMatch(/hook manifest could not be read/);
      expect(go("PostToolUse").status).toBe(0);
      expect(go("PreToolUse", { DEVOPS_GUARD_FAIL_OPEN: "1" }).status).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  test("a crashing module alone ends the real PreToolUse reply with 0, a crashing guard with 2", async () => {
    const open = await run([mod("throw.js")]);
    expect(finalReply({ ...open, guarded: true }).code).toBe(0);
    const closed = await run([mod("throw.js", { onFailure: "block" })]);
    expect(finalReply({ ...closed, guarded: true }).code).toBe(2);
  });
});

describe("lanes and selection", () => {
  test("laneGroups: known lanes keep their members together, unknown modules share one lane", () => {
    const mods = ["a", "b", "c", "x", "y"].map((name) => ({ name }));
    expect(laneGroups(mods, [["a", "c"], ["b"]])).toEqual([[0, 2], [1], [3, 4]]);
    expect(laneGroups(mods, undefined)).toEqual([[0, 1, 2, 3, 4]]);
  });

  test("only ss.mcp.deps (npm install when broken) may hold a session start longer than 5 s", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "manifest.json"), "utf8"));
    const slow = manifest.hooks.SessionStart.flatMap((g) => g.hooks).filter((h) => h.timeout > 5).map((h) => /ss\.[\w.]+(?=\.js)/.exec(h.command)[0]);
    expect(slow).toEqual(["ss.mcp.deps"]);
  });

  test("selectModules applies each module's own matcher", () => {
    const manifest = { hooks: { PreToolUse: [
      { matcher: "Bash", hooks: [{ command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/a.js"' }] },
      { matcher: "Edit|Write", hooks: [{ command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/b.js"' }] },
      { hooks: [{ command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/c.js"', timeout: 5 }] },
    ] } };
    const names = (tool) => selectModules(manifest, "PreToolUse", { tool_name: tool }, "/root").map((m) => m.name);
    expect(names("Bash")).toEqual(["a", "c"]);
    expect(names("Write")).toEqual(["b", "c"]);
  });
});

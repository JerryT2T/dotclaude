#!/usr/bin/env node
// Real-Claude regression check for the devops project opt-out.
//
// Bug it guards: a project with `enabledPlugins["devops@dotclaude"]=false` in
// BOTH .claude/settings.json and settings.local.json still got every devops
// hook, because Claude Code also loads the account-synced copy of the plugin
// (plugins/synced/…, Desktop rpm/…) and the guard waved every non-cache root
// through. Unit tests cannot see that: only a real `claude -p` loads the real
// plugin copies.
//
// Two runs in throw-away git projects (haiku, one tiny prompt each):
//   control  — no devops entry anywhere  -> transcript MUST hold `[devops] version=`
//   opted-out — false in settings.json + settings.local.json -> must NOT hold it
// Signal = the session transcript (~/.claude/projects/<slug>/<session-id>.jsonl),
// never the model's answer text (empty under the Quiet output style).
//
// Usage: node plugins/devops/evals/optout-live-check.js [options]
//   --billing auto|api|plan  auto (default): API credit when run from your own
//                            terminal with a stored key, else the plan login
//   --model <m>              default haiku
//   --timeout-min <n>        per run, default 4
//   --keep                   keep the temp projects
//   --dry-run                print the commands, call no model
//   --json                   machine-readable result on stdout
// Exit: 0 pass · 1 fail (opt-out leaks, or the control is not valid evidence
// of the marker) · 2 usage · 3 inconclusive (claude could not run / no transcript).
// Billing rules: deep-knowledge/api-credits.md § Evals.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { formatCommand, resolveClaudeBin } = require("./lib/command");

const MARKER = "[devops] version=";
const PROMPT = "Reply with the single word ok.";
const OPT_OUT = { enabledPlugins: { "devops@dotclaude": false } };

function parseArgs(argv) {
  const o = { billing: "auto", model: "haiku", timeoutMin: 4, keep: false, dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    switch (a) {
      case "--billing": o.billing = next(); break;
      case "--model": o.model = next(); break;
      case "--timeout-min": o.timeoutMin = Number(next()); break;
      case "--keep": o.keep = true; break;
      case "--dry-run": o.dryRun = true; break;
      case "--json": o.json = true; break;
      default: throw new Error(`unknown argument: ${a}`);
    }
  }
  if (!["auto", "api", "plan"].includes(o.billing)) throw new Error("--billing must be auto, api or plan");
  if (!Number.isFinite(o.timeoutMin) || o.timeoutMin <= 0) throw new Error("--timeout-min must be a positive number");
  return o;
}

// Same stripping as ab-run.js: the calling session's CLAUDE*/ANTHROPIC* vars
// make a nested CLI fail with "Not logged in" / 401.
function childEnv(parentEnv, apiKey) {
  const env = {};
  for (const [k, v] of Object.entries(parentEnv)) {
    if (!/^(CLAUDE|ANTHROPIC|DEVOPS_ANTHROPIC)/i.test(k)) env[k] = v;
  }
  if (parentEnv.CLAUDE_BIN) env.CLAUDE_BIN = parentEnv.CLAUDE_BIN;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  return env;
}

// Mirrors ab-run.js resolveApiCredit: inside a Claude Code session the credit
// does not apply (counts as Claude Code usage), so the plan login is used.
function resolveBilling(mode, parentEnv = process.env, deps = {}) {
  if (mode === "plan") return { key: null, note: "plan login (--billing plan)" };
  const inSession = Boolean(parentEnv.CLAUDECODE || parentEnv.CLAUDE_CODE_ENTRYPOINT);
  let keyInfo = null;
  let enabled = false;
  try {
    const safe = deps.safe || require("../scripts/claude-api-safe");
    keyInfo = safe.resolveKey({ env: parentEnv });
    enabled = Boolean(safe.loadSwitches({}).enabled);
  } catch { /* no key store reachable -> plan */ }
  if (mode === "api") {
    if (inSession) return { error: "--billing api: started inside a Claude Code session (counts as Claude Code usage, not covered by the API credit) — run from your own terminal." };
    if (!keyInfo) return { error: "--billing api: no DEVOPS_ANTHROPIC_API_KEY stored (deep-knowledge/api-credits.md § The key)." };
    return { key: keyInfo.key, note: "API credit (devops key)" };
  }
  if (!enabled || !keyInfo) return { key: null, note: "plan login (API credit off or no key)" };
  if (inSession) return { key: null, note: "plan login (inside a Claude Code session the API credit does not apply)" };
  return { key: keyInfo.key, note: "API credit (apiCredit.enabled, devops key)" };
}

function scaffold(dir, optedOut) {
  const run = (args) => spawnSync("git", args, { cwd: dir, windowsHide: true, stdio: "pipe", encoding: "utf8" });
  run(["init", "-q"]);
  fs.writeFileSync(path.join(dir, "README.md"), "# optout-live-check\n");
  if (optedOut) {
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    const json = JSON.stringify(OPT_OUT, null, 2) + "\n";
    fs.writeFileSync(path.join(dir, ".claude", "settings.json"), json);
    fs.writeFileSync(path.join(dir, ".claude", "settings.local.json"), json);
  }
}

// ~/.claude/projects/<slug>/<session-id>.jsonl — the slug rules differ per
// platform/version, and the session id is ours, so scan instead of guessing.
function findTranscript(home, sessionId) {
  const root = path.join(home, ".claude", "projects");
  let dirs = [];
  try { dirs = fs.readdirSync(root); } catch { return null; }
  for (const d of dirs) {
    const f = path.join(root, d, `${sessionId}.jsonl`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function commandFor(bin, sessionId, model) {
  // Hand-built argv: the A/B runner's --plugin-dir/--settings would hide the real plugin set.
  return [bin, ["-p", PROMPT, "--model", model, "--output-format", "json", "--session-id", sessionId]];
}

function runOne(label, optedOut, ctx) {
  const dir = fs.mkdtempSync(path.join(ctx.tmp, `optout-${label}-`));
  const sessionId = ctx.uuid();
  const [bin, args] = commandFor(ctx.bin, sessionId, ctx.model);
  const out = { label, optedOut, sessionId, command: formatCommand(bin, args), cwd: dir };
  try {
    scaffold(dir, optedOut);
    const r = ctx.spawn(bin, args, {
      cwd: dir, env: ctx.env, encoding: "utf8", stdio: "pipe", windowsHide: true,
      timeout: ctx.timeoutMs, maxBuffer: 16 * 1024 * 1024,
    });
    out.exitCode = r.status;
    if (r.error || r.status !== 0) {
      out.error = r.error ? String(r.error.message || r.error) : `exit ${r.status}: ${String(r.stderr || r.stdout || "").slice(0, 300)}`;
      return out;
    }
    const file = findTranscript(ctx.home, sessionId);
    if (!file) { out.error = `no transcript for session ${sessionId} under ${path.join(ctx.home, ".claude", "projects")}`; return out; }
    const text = fs.readFileSync(file, "utf8");
    out.transcript = file;
    out.hasMarker = text.includes(MARKER);
    out.hasSyncedRoot = /plugins[\\/]+synced[\\/]|[\\/]rpm[\\/]/.test(text);
    return out;
  } finally {
    if (!ctx.keep) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}

// deps: spawn, uuid, home, tmp, env, bin — all injectable (the gate test stubs
// the whole function instead; the script test stubs these).
function runCheck(opts = {}, deps = {}) {
  const o = { billing: "auto", model: "haiku", timeoutMin: 4, keep: false, ...opts };
  const parentEnv = deps.env || process.env;
  const billing = resolveBilling(o.billing, parentEnv, deps);
  if (billing.error) return { status: "inconclusive", reason: billing.error };
  const ctx = {
    bin: deps.bin || resolveClaudeBin(parentEnv),
    spawn: deps.spawn || spawnSync,
    uuid: deps.uuid || crypto.randomUUID,
    home: deps.home || os.homedir(),
    tmp: deps.tmp || os.tmpdir(),
    env: childEnv(parentEnv, billing.key),
    model: o.model, keep: o.keep, timeoutMs: o.timeoutMin * 60_000,
  };
  const control = runOne("control", false, ctx);
  const optedOut = runOne("optedout", true, ctx);
  const res = { billing: billing.note, control, optedOut };
  if (control.error || optedOut.error) {
    return { ...res, status: "inconclusive", reason: `claude run failed — ${control.error || optedOut.error}` };
  }
  if (!control.hasMarker) {
    // Without the marker in the control, "absent when opted out" proves nothing.
    // Under an API key the account-synced copy may not load at all — retry on
    // the plan login once in auto mode before giving up.
    if (o.billing === "auto" && billing.key) {
      const again = runCheck({ ...o, billing: "plan" }, deps);
      return { ...again, billing: `${again.billing} (after the API-key control lacked the marker)` };
    }
    return { ...res, status: "fail", reason: `control project has no "${MARKER}" in its transcript — the check cannot tell opt-out from a broken setup` };
  }
  if (optedOut.hasMarker) {
    return { ...res, status: "fail", reason: `opted-out project still got devops hook context ("${MARKER}" in ${optedOut.transcript})${optedOut.hasSyncedRoot ? " — an account-synced / rpm copy of the plugin is loaded" : ""}` };
  }
  return { ...res, status: "pass", reason: `control shows "${MARKER}", opted-out project does not` };
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) {
    process.stderr.write(`optout-live-check: ${e.message}\n`);
    return 2;
  }
  if (opts.dryRun) {
    const bin = resolveClaudeBin(process.env);
    const billing = resolveBilling(opts.billing, process.env);
    process.stdout.write(`# billing: ${billing.error || billing.note}\n`);
    for (const [label, optedOut] of [["control", false], ["optedout", true]]) {
      const [b, args] = commandFor(bin, "<uuid>", opts.model);
      process.stdout.write(`# ${label}: git init in a temp dir${optedOut ? ", .claude/settings.json + settings.local.json = " + JSON.stringify(OPT_OUT) : ", no devops entry"}\n`);
      process.stdout.write(`${formatCommand(b, args)}\n`);
    }
    process.stdout.write(`# then: assert "${MARKER}" is in the control transcript and NOT in the opted-out one (~/.claude/projects/*/<session-id>.jsonl)\n`);
    return 0;
  }
  const res = runCheck(opts);
  if (opts.json) process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  else process.stdout.write(`optout-live-check: ${res.status.toUpperCase()} — ${res.reason}${res.billing ? ` [${res.billing}]` : ""}\n`);
  return res.status === "pass" ? 0 : res.status === "fail" ? 1 : 3;
}

module.exports = { MARKER, parseArgs, resolveBilling, runCheck, findTranscript, commandFor, main };

if (require.main === module) process.exit(main(process.argv.slice(2)));

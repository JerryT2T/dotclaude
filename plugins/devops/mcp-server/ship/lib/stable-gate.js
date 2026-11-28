/**
 * @module ship/lib/stable-gate
 * @description Measurable criteria a candidate must meet before it is promoted
 *   to STABLE (docs: skills/do-ship/modes/promote.md § Stable gate). Pure
 *   functions; every reader (gh, telemetry file, transcripts, clock) is
 *   injectable so tests never touch the network or the user's files.
 *
 *   Criteria: bugs · quiet · mcp · suite · latency. Each returns
 *   { id, ok, detail } (detail: one short German line). A reader that throws or
 *   returns nothing FAILS its criterion — an unreadable signal is never "green".
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOUR = 3_600_000;
export const QUIET_HOURS = 72;
export const LATENCY_DAYS = 3;
export const LATENCY_MAX_MS = 500;
export const QUIET_TOPIC_RE = /\b(ship|card|hooks?)\b|completion[- ]card/i;
export const STALE_MARKER = "MCP SERVER STALE";
const BUG_LABELS = ["type:bug", "bug"];

const fail = (id, detail) => ({ id, ok: false, detail });
const pass = (id, detail) => ({ id, ok: true, detail });
const guard = (id, fn) => {
  try {
    return fn();
  } catch (e) {
    return fail(id, `nicht lesbar (${String(e.message || e).split("\n")[0].slice(0, 120)}) — gilt als nicht erfüllt`);
  }
};
const labelNames = (i) => (i.labels || []).map((l) => (typeof l === "string" ? l : l.name));
const nums = (list) => list.map((i) => `#${i.number}`).join(", ");

/** bugs: no open issue labelled type:bug / bug. */
export function checkBugs({ issues }) {
  return guard("bugs", () => {
    const open = BUG_LABELS.flatMap((l) => issues({ state: "open", label: l }));
    const uniq = [...new Map(open.map((i) => [i.number, i])).values()];
    return uniq.length ? fail("bugs", `${uniq.length} offene Bugs: ${nums(uniq)}`) : pass("bugs", "keine offenen Bugs");
  });
}

/** quiet: no NEW bug issue about ship/card/hooks within the last 72 h. */
export function checkQuiet({ issues, now }) {
  return guard("quiet", () => {
    const since = new Date(now - QUIET_HOURS * HOUR).toISOString();
    const all = BUG_LABELS.flatMap((l) => issues({ state: "all", label: l, search: `created:>=${since}` }));
    const hits = [...new Map(all.map((i) => [i.number, i])).values()].filter((i) => {
      if (i.createdAt && Date.parse(i.createdAt) < Date.parse(since)) return false;
      return QUIET_TOPIC_RE.test(`${i.title || ""} ${labelNames(i).join(" ")}`);
    });
    return hits.length
      ? fail("quiet", `${hits.length} neue Bugs zu ship/card/hooks in ${QUIET_HOURS} h: ${nums(hits)}`)
      : pass("quiet", `${QUIET_HOURS} h ohne neuen ship/card/hooks-Bug`);
  });
}

/**
 * mcp: no open "MCP server stale" issue, and no `MCP SERVER STALE` hit in local
 * transcripts since max(now-72h, candidate commit time) — sessions started after
 * the candidate existed run its code. Limit: sessions of other machines are not
 * visible; the commit time stands in for "plugin version >= candidate".
 */
export function checkMcp({ issues, staleHits, candidateTimeMs, now }) {
  return guard("mcp", () => {
    const open = issues({ state: "open", search: `"MCP server" stale in:title,body` })
      .filter((i) => /stale/i.test(`${i.title || ""} ${i.body || ""}`) && /mcp/i.test(`${i.title || ""} ${i.body || ""}`));
    if (open.length) return fail("mcp", `offene MCP-stale-Issues: ${nums(open)}`);
    const since = Math.max(now - QUIET_HOURS * HOUR, candidateTimeMs || 0);
    const hits = staleHits(since);
    return hits > 0
      ? fail("mcp", `${hits}x "${STALE_MARKER}" in lokalen Transcripts seit dem Kandidaten`)
      : pass("mcp", `kein "${STALE_MARKER}" seit dem Kandidaten (nur lokale Transcripts)`);
  });
}

/** suite: every check-run of the exact candidate SHA is green, and there is at least one. */
export function checkSuite({ checkRuns, sha }) {
  return guard("suite", () => {
    const runs = checkRuns(sha) || [];
    if (!runs.length) return fail("suite", `kein aufgezeichneter Testlauf für ${sha.slice(0, 12)}`);
    const bad = runs.filter((r) => r.status !== "completed" || !["success", "skipped", "neutral"].includes(r.conclusion));
    return bad.length
      ? fail("suite", `${bad.length}/${runs.length} Checks nicht grün auf ${sha.slice(0, 12)}: ${bad.map((r) => r.name).join(", ")}`)
      : pass("suite", `${runs.length} Checks grün auf ${sha.slice(0, 12)}`);
  });
}

/** latency: median of hook dispatch (PreToolUse and PostToolUse) over the last 3 UTC days < 0.5 s. */
export function checkLatency({ rollup, percentile, now }) {
  return guard("latency", () => {
    const days = rollup().days || {};
    const wanted = new Set();
    for (let i = 0; i < LATENCY_DAYS; i++) wanted.add(new Date(now - i * 24 * HOUR).toISOString().slice(0, 10));
    const parts = [];
    let ok = true;
    for (const ev of ["PreToolUse", "PostToolUse"]) {
      let hist = null;
      for (const day of wanted) {
        for (const [key, e] of Object.entries(days[day] || {})) {
          if (!key.startsWith(`dispatch:${ev}|`) || !Array.isArray(e.ms)) continue;
          hist = hist || new Array(e.ms.length).fill(0);
          e.ms.forEach((n, i) => { hist[i] += n; });
        }
      }
      const med = hist ? percentile(hist, 0.5) : null;
      if (med === null) { ok = false; parts.push(`${ev}: keine Daten`); continue; }
      if (med >= LATENCY_MAX_MS) ok = false;
      parts.push(`${ev}: Median ≤ ${med} ms`);
    }
    return { id: "latency", ok, detail: `${parts.join(", ")} (Grenze < ${LATENCY_MAX_MS} ms, ${LATENCY_DAYS} Tage)` };
  });
}

/** Run all five. Result: { ok, criteria: [{id, ok, detail}] }. */
export function evaluateStableGate(deps) {
  const criteria = [checkBugs(deps), checkQuiet(deps), checkMcp(deps), checkSuite(deps), checkLatency(deps)];
  return { ok: criteria.every((c) => c.ok), criteria };
}

/** One German line per criterion, for the refusal message. */
export function formatGate(result) {
  return result.criteria.map((c) => `${c.ok ? "OK  " : "FAIL"} ${c.id}: ${c.detail}`).join("\n");
}

// --- default readers (production) -------------------------------------------

function ghRun(args, cwd) {
  return execFileSync("gh", args, { windowsHide: true, cwd, encoding: "utf8", timeout: 30_000, stdio: ["pipe", "pipe", "pipe"] });
}

/** Production dependencies for `cwd` / candidate `sha`. */
export function defaultDeps({ cwd, sha, now = Date.now() }) {
  const issues = ({ state, label, search }) => {
    const args = ["issue", "list", "--state", state, "--limit", "100", "--json", "number,title,body,labels,createdAt"];
    if (label) args.push("--label", label);
    if (search) args.push("--search", search);
    return JSON.parse(ghRun(args, cwd) || "[]");
  };
  const checkRuns = (s) => {
    const out = ghRun(["api", `repos/{owner}/{repo}/commits/${s}/check-runs`, "--paginate", "--jq", ".check_runs[] | {name, status, conclusion}"], cwd);
    return out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  };
  const tel = createRequire(import.meta.url)("../../../hooks/lib/hook-telemetry.js");
  const rollup = () => JSON.parse(readFileSync(tel.rollupPath(process.env.DEVOPS_HOOK_TELEMETRY || join(homedir(), ".claude", "devops-hook-telemetry.jsonl")), "utf8"));
  const staleHits = (sinceMs) => countStaleHits(join(homedir(), ".claude", "projects"), sinceMs);
  let candidateTimeMs = 0;
  try { candidateTimeMs = Number(execFileSync("git", ["show", "-s", "--format=%ct", sha], { windowsHide: true, cwd, encoding: "utf8" }).trim()) * 1000 || 0; } catch { /* unknown: 72 h window only */ }
  return { issues, checkRuns, rollup, percentile: tel.percentile, staleHits, candidateTimeMs, sha, now };
}

/** Count marker lines timestamped >= sinceMs in transcripts modified since then. Bounded: files > 100 MB skipped. */
export function countStaleHits(root, sinceMs) {
  if (!existsSync(root)) return 0;
  let hits = 0;
  for (const proj of readdirSync(root)) {
    const dir = join(root, proj);
    let files;
    try { files = readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(dir, f);
      try {
        const st = statSync(p);
        if (st.mtimeMs < sinceMs || st.size > 100 * 1024 * 1024) continue;
        for (const line of readFileSync(p, "utf8").split("\n")) {
          if (!line.includes(STALE_MARKER)) continue;
          const m = /"timestamp":"([^"]+)"/.exec(line);
          if (!m || Date.parse(m[1]) >= sinceMs) hits++;
        }
      } catch { /* unreadable file: skip */ }
    }
  }
  return hits;
}

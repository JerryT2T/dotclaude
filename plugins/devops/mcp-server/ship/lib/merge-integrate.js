/**
 * @module ship/lib/merge-integrate
 * @description Ship-side integration of origin/<base> BY MERGE (not rebase)
 *   plus the content gate on top of it.
 *
 *   mergeOnto(base, cwd, { push, fetch, upstream })
 *     Snapshots the own tip in refs/devops/intent/<branch> (survival.js), then
 *     `git merge origin/<base>`: one conflict round on the final tree instead
 *     of one per commit, no history rewrite → a plain push, no force. Conflicts
 *     only in version files / CHANGELOG entries are resolved deterministically
 *     (resolveVersionConflicts, sides swapped for merge order) and the bump is
 *     redone from the base's version by the kind this branch used. Any other
 *     conflict aborts the merge and answers { ok:false, reason, files } —
 *     never leaves a merge open.
 *       → { ok:true, merged, upToDate?, method:'merge', pushed, intent, head, versionRebase? }
 *       | { ok:false, reason, files? }
 *   mergeVersionFiles({ upstream, cwd }) — the release.js auto-path: mergeOnto
 *     without fetch/push, rebaseVersionFiles' result shape.
 *   survivalGate({ cwd, base, branch, resolved })
 *     survival.checkBranch + the ledger's settled hunks + the caller's resolved
 *     list → { ok, open, lost, survivedCount, resolvedCount, anchor, skipped? }.
 *     A check that cannot run fails OPEN with `skipped` (warning, not block).
 *   gateDetail(gate, where) → the `needs: "merge-decisions"` detail.
 *   recordDecisions(cwd, resolved, { by }) → { written, count, committed }
 *     appends `decided` items carrying an aspect to .claude/merge-decisions.json
 *     and commits it (`chore(merge): record merge decisions`).
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gitArgs, gitTry, dirtyState, NETWORK_TIMEOUT } from "./git.js";
import { resolveVersionConflicts, VERSION_FILE_RE, bumpKind } from "./version-rebase.js";
import { readVersion, bumpVersion, updateVersionFiles, verifyVersionFiles } from "./version.js";

const require = createRequire(import.meta.url);
const survival = () => require("../../../hooks/lib/survival.js");
const ledger = () => require("../../../hooks/lib/merge-decisions.js");

/** During a merge `<<<<<<<` is ours and `>>>>>>>` theirs; resolveVersionConflicts expects the base first. */
export function swapConflictSides(content) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("<<<<<<<")) { out.push(lines[i]); continue; }
    const ours = []; const base = []; const theirs = [];
    let part = ours; let hasBase = false; let end = null; const start = lines[i];
    for (i++; i < lines.length && !lines[i].startsWith(">>>>>>>"); i++) {
      if (lines[i].startsWith("|||||||")) { part = base; hasBase = true; continue; }
      if (lines[i].startsWith("=======")) { part = theirs; continue; }
      part.push(lines[i]);
    }
    end = i < lines.length ? lines[i] : ">>>>>>>";
    out.push(start, ...theirs, ...(hasBase ? ["|||||||", ...base] : []), "=======", ...ours, end);
  }
  return out.join(eol);
}

function unmergedFiles(opts) {
  return (gitTry(["diff", "--name-only", "--diff-filter=U"], opts) || "").split("\n").filter(Boolean);
}

function versionAt(ref, file, opts) {
  const raw = gitTry(["show", `${ref}:./${file}`], opts);
  if (!raw) return null;
  try { const o = JSON.parse(raw); return (o.metadata && o.metadata.version) || o.version || null; } catch { return null; }
}

export function mergeOnto(base, cwd, { push = true, fetch = true, upstream = null } = {}) {
  const opts = { cwd };
  try {
    if (fetch) gitTry(["fetch", "origin", base], { cwd, timeout: NETWORK_TIMEOUT });
    const up = upstream || `origin/${base}`;
    const state = dirtyState(opts);
    if (state.error || state.dirty) return { ok: false, reason: "dirty-tree", files: state.modified || [] };
    const branch = gitTry(["rev-parse", "--abbrev-ref", "HEAD"], opts);
    const orig = gitTry(["rev-parse", "HEAD"], opts);
    if (!orig || !gitTry(["rev-parse", "--verify", "--quiet", `${up}^{commit}`], opts)) return { ok: false, reason: "no-upstream" };
    const intent = branch && branch !== "HEAD" ? survival().writeIntent(cwd, branch, orig) : null;
    if (gitTry(["merge-base", "--is-ancestor", up, "HEAD"], opts) !== null) {
      return { ok: true, merged: false, upToDate: true, method: "merge", pushed: false, intent, head: orig };
    }

    let ourVersion = null; let sourceFile = null; let kind = "none"; let upVersion = null; let mbVersion = null;
    try {
      ({ version: ourVersion, file: sourceFile } = readVersion(cwd));
      const mb = gitTry(["merge-base", "HEAD", up], opts);
      mbVersion = sourceFile && mb ? versionAt(mb, sourceFile, opts) : null;
      kind = mbVersion ? bumpKind(mbVersion, ourVersion) : "none";
      upVersion = sourceFile ? versionAt(up, sourceFile, opts) : null;
    } catch { /* no version file: nothing to re-bump */ }

    const abort = () => { gitTry(["merge", "--abort"], opts); gitTry(["reset", "--hard", orig], opts); };
    const ok = gitTry(["-c", "merge.conflictstyle=diff3", "-c", "core.editor=true", "merge", "--no-edit", up], { cwd, timeout: 120_000 }) !== null;
    const resolved = [];
    if (!ok) {
      const files = unmergedFiles(opts);
      if (!files.length) { abort(); return { ok: false, reason: "merge-failed" }; }
      const foreign = files.filter((f) => !VERSION_FILE_RE.test(f));
      if (foreign.length) { abort(); return { ok: false, reason: "code-conflict", files }; }
      const root = gitArgs(["rev-parse", "--show-toplevel"], opts);
      for (const f of files) {
        const abs = join(root, f);
        const next = resolveVersionConflicts(swapConflictSides(readFileSync(abs, "utf8")), f);
        if (next === null) { abort(); return { ok: false, reason: "non-version-hunk", files: [f] }; }
        writeFileSync(abs, next);
        gitArgs(["add", "--", `:/${f}`], opts);
        resolved.push(f);
      }
      if (gitTry(["-c", "core.editor=true", "commit", "--no-edit"], opts) === null) { abort(); return { ok: false, reason: "merge-commit-failed" }; }
    }

    // Both sides bumped and the base's version won (conflict resolution or an identical bump): bump again on top, by our kind.
    let versionRebase = null;
    if (kind !== "none" && upVersion && ourVersion && upVersion !== mbVersion) {
      const current = (() => { try { return readVersion(cwd).version; } catch { return null; } })();
      if (current === upVersion) {
        const to = bumpVersion(upVersion, kind);
        updateVersionFiles(current, to, cwd);
        const root = gitArgs(["rev-parse", "--show-toplevel"], opts);
        try {
          const file = join(root, "CHANGELOG.md");
          const text = readFileSync(file, "utf8");
          const header = `## [${ourVersion}]`;
          if (ourVersion !== to && text.includes(header)) writeFileSync(file, text.replace(header, `## [${to}]`));
        } catch { /* no CHANGELOG */ }
        const check = verifyVersionFiles(to, cwd);
        if (!check.consistent) { gitTry(["reset", "--hard", orig], opts); return { ok: false, reason: "version-mismatch", files: check.mismatches.map((m) => m.file) }; }
        if (dirtyState(opts).dirty) {
          gitArgs(["add", "-u", ":/"], opts);
          gitArgs(["commit", "-m", `chore: bump to v${to} after merging ${up}`], opts);
        }
        versionRebase = { from: ourVersion, to, bump: kind, resolved };
      }
    }
    if (!versionRebase && resolved.length) versionRebase = { from: ourVersion, to: ourVersion, bump: "none", resolved };

    const hasUpstream = gitTry(["rev-parse", "--abbrev-ref", "@{u}"], opts) !== null;
    const pushed = push && hasUpstream ? gitTry(["push"], { cwd, timeout: NETWORK_TIMEOUT }) !== null : false;
    return { ok: true, merged: true, method: "merge", pushed, intent, head: gitTry(["rev-parse", "HEAD"], opts), ...(versionRebase ? { versionRebase } : {}) };
  } catch (e) {
    gitTry(["merge", "--abort"], opts);
    return { ok: false, reason: `merge-error: ${e && e.message}` };
  }
}

/** release.js auto-path: only version files collide → merge + re-bump, no fetch/push. */
export function mergeVersionFiles({ upstream, cwd }) {
  const base = String(upstream || "").replace(/^origin\//, "");
  const r = mergeOnto(base, cwd, { push: false, fetch: false, upstream });
  if (!r.ok) return r;
  const v = r.versionRebase || {};
  return { ok: true, from: v.from || null, to: v.to || null, bump: v.bump || "none", resolved: v.resolved || [], commit: (r.head || "").slice(0, 7), method: "merge" };
}

export function survivalGate({ cwd, base, branch = null, resolved = [] } = {}) {
  try {
    const sv = survival().checkBranch({ cwd, base, branch });
    if (!sv.ok) return { ok: true, skipped: sv.reason, open: [], lost: [], survivedCount: 0, resolvedCount: 0, anchor: null };
    const ids = new Set((resolved || []).map((r) => r && r.hunk).filter(Boolean));
    const { open: notInLedger } = ledger().applyDecisions(ledger().readLedger(cwd), sv.lost);
    const open = notInLedger.filter((h) => !ids.has(h.id));
    return {
      ok: open.length === 0, open, lost: sv.lost, survivedCount: sv.survivedCount,
      resolvedCount: sv.lost.length - open.length, anchor: sv.anchor, anchorSource: sv.anchorSource || null, truncated: !!sv.truncated,
    };
  } catch (e) {
    return { ok: true, skipped: `error: ${e && e.message}`, open: [], lost: [], survivedCount: 0, resolvedCount: 0, anchor: null };
  }
}

const clip = (a, n = 5) => (a || []).slice(0, n);

/** `needs: "merge-decisions"` detail. */
export function gateDetail(gate, where) {
  return {
    where,
    lost: gate.open.map((h) => ({
      id: h.id, file: h.file, hunk: h.header, upstreamPr: h.upstreamPr ?? null, author: h.author ?? null,
      verdict: h.verdict, missing: clip(h.missing), resurrected: clip(h.resurrected), candidatePath: h.candidatePath ?? null,
    })),
    survivedCount: gate.survivedCount, resolvedCount: gate.resolvedCount, anchor: gate.anchor, anchorSource: gate.anchorSource || null,
    ...(gate.truncated ? { truncated: true } : {}),
  };
}

/** Write `decided` items with an aspect into the tracked ledger and commit it. */
export function recordDecisions(cwd, resolved, { by = null, ship = null, now = Date.now() } = {}) {
  const items = (resolved || []).filter((r) => r && r.action === "decided" && r.aspect);
  if (!items.length) return { written: false, count: 0, committed: false };
  try {
    const L = ledger();
    let l = L.readLedger(cwd);
    const settled = L.resolvedHunkIds(l);
    let count = 0;
    for (const it of items) {
      if (it.hunk && settled.has(it.hunk)) continue;
      l = L.recordDecision(l, it.aspect, {
        ship: it.ship || ship, by: it.by || by, value: it.value ?? null, at: new Date(now).toISOString(),
        hunks: it.hunk ? [it.hunk] : [], chain: Array.isArray(it.chain) ? it.chain : [],
      });
      count++;
    }
    if (!count) return { written: false, count: 0, committed: false };
    if (!L.writeLedger(cwd, l)) return { written: false, count: 0, committed: false, error: "ledger not writable" };
    gitTry(["add", "--", `:/${L.LEDGER_FILE}`], { cwd });
    const committed = gitTry(["commit", "-m", "chore(merge): record merge decisions", "--", `:/${L.LEDGER_FILE}`], { cwd }) !== null;
    return { written: true, count, committed };
  } catch (e) {
    return { written: false, count: 0, committed: false, error: e && e.message };
  }
}

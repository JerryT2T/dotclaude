/**
 * @module ship/lib/tag-workflow-scaffold
 * @description The reply "Tag-Workflow einrichten" (#1232): write
 *   `.github/workflows/tag-on-version.yml` from the template with the repo's
 *   literal tag prefix (ring tags present: `alpha/`, else none) and its JSON
 *   version file. It only writes the file; do-ship lands it through a branch
 *   and a PR, never a push to main. An existing tag workflow is never replaced.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOW_PATH = ".github/workflows/tag-on-version.yml";
const TEMPLATE = fileURLToPath(new URL("../../../templates/tag-on-version.yml", import.meta.url));

// Same order as readVersion: the plugin manifest before package.json.
const VERSION_FILE_CANDIDATES = [".claude-plugin/plugin.json", "package.json"];
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/;
const RING_TAG = /^alpha\/v\d+\.\d+\.\d+$/;

/** `alpha/` when any tag is a ring tag, else "" (bare `vX.Y.Z`). */
export function detectTagPrefix(tagNames) {
  return (tagNames || []).some((t) => RING_TAG.test(t)) ? "alpha/" : "";
}

/** First candidate JSON file with a top-level semver `version`, or null. */
export function findJsonVersionFile(cwd) {
  for (const rel of VERSION_FILE_CANDIDATES) {
    try {
      const v = JSON.parse(readFileSync(join(cwd, rel), "utf8")).version;
      if (typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v)) return rel;
    } catch { /* absent or not JSON */ }
  }
  return null;
}

/** The existing tag workflow (any name containing tag-on-version), as a repo-relative path, or null. */
export function findExistingTagWorkflow(cwd) {
  try {
    const hit = readdirSync(join(cwd, ".github", "workflows")).find((f) => /tag-on-version/i.test(f) && /\.ya?ml$/i.test(f));
    return hit ? `.github/workflows/${hit}` : null;
  } catch {
    return null;
  }
}

/** Local tags plus origin's. Null when origin exists but did not answer: the prefix would be a guess. */
export function listTags(cwd) {
  const run = (args) => {
    try { return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; }
  };
  const lines = (out) => (out || "").split("\n").map((l) => l.trim());
  const local = lines(run(["tag", "--list"])).filter(Boolean);
  if (detectTagPrefix(local) || !run(["remote"])?.split("\n").some((r) => r.trim() === "origin")) return local;
  const remote = run(["ls-remote", "--tags", "origin"]);
  if (remote === null) return null;
  return [...local, ...lines(remote).map((l) => (l.split("\t")[1] || "").replace("refs/tags/", "").replace("^{}", "")).filter(Boolean)];
}

/**
 * Write the workflow. Never overwrites; refuses with a reason instead.
 * @param {{ cwd?: string, tags?: string[] }} [o]  `tags` skips the git lookup (tests).
 * @returns {{ ok: true, path: string, prefix: string, versionFile: string } | { ok: false, reason: string, existing?: string }}
 */
export function scaffoldTagWorkflow(o = {}) {
  const cwd = o.cwd || process.cwd();
  const existing = findExistingTagWorkflow(cwd);
  if (existing) return { ok: false, reason: `${existing} already exists; it is left unchanged`, existing };
  const versionFile = findJsonVersionFile(cwd);
  if (!versionFile || !SAFE_PATH.test(versionFile)) {
    return { ok: false, reason: "no JSON version file with a top-level x.y.z version (.claude-plugin/plugin.json or package.json); the tag workflow reads only that" };
  }
  const tags = o.tags || listTags(cwd);
  if (!tags) return { ok: false, reason: "origin did not answer, so its tags and the tag prefix are unknown; try again" };
  const prefix = detectTagPrefix(tags);
  const source = readFileSync(TEMPLATE, "utf8").replaceAll("\r\n", "\n");
  const withPrefix = source.replace(/^( {2}TAG_PREFIX: )""$/m, `$1"${prefix}"`);
  const out = withPrefix.replace(/^( {2}VERSION_FILE: )"[^"\n]*"$/m, `$1"${versionFile}"`);
  if (!out.includes(`  TAG_PREFIX: "${prefix}"\n`) || !out.includes(`  VERSION_FILE: "${versionFile}"\n`)) return { ok: false, reason: "the template no longer has the TAG_PREFIX / VERSION_FILE lines the scaffold fills" };
  const target = join(cwd, WORKFLOW_PATH);
  mkdirSync(join(cwd, ".github", "workflows"), { recursive: true });
  if (existsSync(target)) return { ok: false, reason: `${WORKFLOW_PATH} already exists; it is left unchanged`, existing: WORKFLOW_PATH };
  writeFileSync(target, out, { flag: "wx" });
  return { ok: true, path: WORKFLOW_PATH, prefix, versionFile };
}

/** True when a push was refused because the token lacks the `workflow` scope. */
export function isWorkflowScopeRefusal(err) {
  const text = String((err && (err.stderr || err.message)) || err || "");
  return /without\s+`?workflow`?\s+scope/i.test(text);
}

/** Hand-off for a refused workflow push: names the scope and the exact commands. */
export function workflowScopeHandoff({ branch = "<branch>" } = {}) {
  const commands = ["gh auth refresh -h github.com -s workflow", `git push -u origin ${branch}`];
  return {
    scope: "workflow",
    text: `GitHub refused the push of ${WORKFLOW_PATH}: the token has no \`workflow\` scope. Add the scope with \`gh auth refresh -h github.com -s workflow\` (or push from a clone whose login has it), then push the branch again.`,
    commands,
  };
}

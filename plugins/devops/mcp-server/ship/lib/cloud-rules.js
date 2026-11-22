/**
 * @module ship/lib/cloud-rules
 * @description ship_preflight's step for the managed `.claude/rules/devops.md`
 *   (scripts/cloud-rules.js). An established repo gets the file with its next
 *   ship — never as a separate migration and never outside a ship:
 *
 *   - the ship has tracked edits waiting (the "uncommitted work" path): the file
 *     is written and staged, and joins `uncommittedWork.files`, so the one work
 *     commit the skill makes carries it;
 *   - the tree is clean and the branch is ahead of its base: the file is written
 *     and committed on the shipping branch as its own small commit, so it is part
 *     of the ship's diff;
 *   - anything else (nothing to ship, a blocked ship, untracked files, no git, the
 *     path ignored by the repo, switch `cloud.rulesFile` off): nothing is written.
 *
 *   Idempotent: a current file yields no output. Never throws.
 */

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gitArgs } from "./git.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(here, "..", "..", "..");
const cloudRules = require(path.join(PLUGIN_ROOT, "scripts", "cloud-rules.js"));
const devopsConfig = require(path.join(PLUGIN_ROOT, "hooks", "lib", "devops-config.js"));

const COMMIT_MESSAGE = "chore(rules): add the devops working rules file for sessions without the plugin";

function switchedOff(cwd) {
  try { return devopsConfig.load(cwd).values.cloud.rulesFile === false; } catch { return false; }
}

function pathIgnored(cwd, rel) {
  try { gitArgs(["check-ignore", "-q", "--", rel], { cwd }); return true; } catch { return false; }
}

/**
 * @param {{cwd:string, state:{dirty:boolean, modified:string[], untracked:string[], error?:string},
 *   ahead:number|null, blocked:boolean, mode?:string}} p
 *   blocked: a hard gate other than the dirty tree already failed
 * @returns {object|null} a preflight check, or null when nothing was done
 */
export function cloudRulesStep({ cwd, state, ahead, blocked, mode = "git" }) {
  try {
    if (mode !== "git" && mode !== "git-no-remote") return null;
    if (blocked || state.error || state.untracked.length) return null;
    if (switchedOff(cwd)) return null;
    const status = cloudRules.check(cwd);
    if (status.ok || !status.file) return null;
    const rel = cloudRules.REL_PATH;
    // a ship with nothing to land (clean tree, not ahead) adds nothing
    if (!state.dirty && !(ahead > 0)) return null;
    if (pathIgnored(cwd, rel)) return null;
    const res = cloudRules.write(cwd);
    if (!res.changed) return null;
    gitArgs(["add", "--", rel], { cwd });
    const check = { name: "cloud-rules", ok: true, file: rel, created: res.created };
    if (state.dirty) {
      if (!state.modified.includes(rel)) state.modified.push(rel);
      return { ...check, staged: true, committed: false, note: `${rel} is staged — it belongs to the ship's work commit` };
    }
    gitArgs(["commit", "-m", COMMIT_MESSAGE, "--", rel], { cwd });
    return { ...check, staged: false, committed: true, note: `${rel} was committed on the shipping branch — it is part of this ship's diff` };
  } catch (e) {
    return { name: "cloud-rules", ok: true, skipped: true, warning: `cloud rules file not added: ${String((e && e.stderr) || (e && e.message) || e).trim().split("\n")[0].slice(0, 200)}` };
  }
}

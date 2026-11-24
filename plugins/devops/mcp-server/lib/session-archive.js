/**
 * Archive the Desktop session after a successful ship (#632).
 *
 * The Desktop app's own triggers do not fit: `auto_archive_inactive_days`
 * archives sessions that never shipped (one waiting on a manual login), and
 * `auto_archive_on_pr_close` never fires for a local-only repo. So the plugin
 * archives a session itself — only when its work shipped.
 *
 * Hand-over: `render_completion_card` decides here, adds a `[SESSION ARCHIVE]`
 * block to its result and writes a per-session flag
 * (`dotclaude-devops-card-archive-<session>`). The card widget stays the last
 * visible output: post.flow.completion reads the flag on the show_widget call
 * and, where it would end the turn with `{continue:false}`, releases exactly
 * one further tool call — `mcp__ccd_session_mgmt__archive_session
 * {session_id:"self"}` — and ends the turn on that call. Hooks cannot call
 * MCP tools; the model makes the call on the hook's instruction.
 *
 * Qualifies only: Desktop app, a `ship-successful` / `released` card (after
 * the variant guard) with a real merge (`state.merged`, and pushed or a local
 * merge in a repo without a remote). Never with an explicit keep
 * (`state.kept`), pending background work, open points, user tests, a
 * requirement waiting on the user, a marked side session that is not finished
 * (`linked`: handoff/deliver; independent follow-ups never block) or a pending deploy the card still hands
 * the user (`userFinalTest` does not block — ship parks leftover harden
 * findings there), a concept (or one that only waits for its close-out) or
 * batch mode in play, an orchestrator
 * hold (autonomous lockout, ship queue, autonomous run — they ship several
 * items from one session), a missing `cwd`, a dirty work tree (tracked
 * changes or untracked files; ignored files are fine), or the
 * `ship.archiveAfterShip` setting off. The flag is stamped with the card's
 * `cwd` and a nonce, so a parallel session sharing the "self" key never
 * archives on it (hooks/lib/session-archive-gate.js re-checks the work tree,
 * the tree state, the ship evidence and the hold with the real session id).
 */

import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { hasUnfinishedLinked } from "./linked-sessions.js";

/** Prefix of the per-session flag post.flow.completion reads (tmpdir). */
export const ARCHIVE_FLAG_PREFIX = "dotclaude-devops-card-archive";

const SHIP_VARIANTS = new Set(["ship-successful", "released"]);

/**
 * Should this card archive the session?
 *
 * A `ready` card that ends a close-out in a repo without remote (`deps.localDone`,
 * `isLocalDone` in mode-state.js) also qualifies: the local commit is the
 * delivery, nothing is left to merge or push. Every other guard stays.
 *
 * @param {object} params normalized card params (variant already guarded)
 * @param {{ desktop: boolean, localDone?: (p: object) => boolean, hasPending: Function, hasConcept: Function,
 *   closeoutOnly?: (cwd: string) => boolean,
 *   batchActive: (cwd: string) => boolean, holdReason: (cwd: string) => string,
 *   enabled: (cwd: string) => boolean, treeClean: (cwd: string) => boolean }} deps
 * @returns {{ archive: boolean, reason: string, local?: boolean }}
 */
export function archiveDecision(params, deps) {
  const no = (reason) => ({ archive: false, reason });
  if (!deps.desktop) return no("not-desktop");
  const local = typeof deps.localDone === "function" && !!deps.localDone(params);
  if (!SHIP_VARIANTS.has(params.variant) && !local) return no("variant");
  const s = params.state && typeof params.state === "object" ? params.state : {};
  if (!local) {
    if (!s.merged) return no("not-merged");
    if (!s.pushed && s.mode !== "git-no-remote") return no("not-pushed");
  }
  if (s.kept) return no("kept");
  if (deps.hasPending(params.pending)) return no("pending");
  // A marked side session still running / waiting / failed: the chat is its hub (unmarked follow-ups never block).
  if (hasUnfinishedLinked(params.linked)) return no("linked");
  if (hasItems(params.open)) return no("open");
  if (hasItems(params.userTest)) return no("user-test");
  // A deploy the user still has to run or gate-check is their step too.
  if (s.deployPending || hasItems(params.deployGate)) return no("deploy");
  // A requirement only the user can confirm is still open. `userFinalTest`
  // deliberately does NOT block: ship routes leftover harden findings there,
  // so blocking on it would stop nearly every ship from archiving.
  if (waitsOnUser(params.validation)) return no("user-validation");
  if (deps.hasConcept(params.concept)) return no("concept");
  const cwd = typeof params.cwd === "string" ? params.cwd.trim() : "";
  if (!cwd) return no("no-cwd");
  // A concept page that only waits for its close-out still asks the user.
  if (typeof deps.closeoutOnly === "function" && deps.closeoutOnly(cwd)) return no("concept-closeout");
  if (deps.batchActive(cwd)) return no("batch");
  const hold = deps.holdReason(cwd);
  if (hold) return no(`hold:${hold}`);
  if (!deps.enabled(cwd)) return no("switched-off");
  if (!deps.treeClean(cwd)) return no("dirty-tree");
  return local ? { archive: true, reason: "", local: true } : { archive: true, reason: "" };
}

/**
 * The thread counterpart (Claude Projects): a thread is resolved, never archived.
 * Same conditions as the archive, minus the Desktop app: a cloud thread resolves too.
 * Always a block, so the model never has to guess which of the two applies.
 *
 * @param {object} params normalized card params
 * @param {object} deps see `archiveDecision` (`desktop` is ignored)
 * @returns {{ resolve: boolean, reason: string }}
 */
export function resolveDecision(params, deps) {
  const { archive, reason } = archiveDecision(params, { ...deps, desktop: true });
  return { resolve: archive, reason };
}

/** The out-of-band block of a thread card. */
export function resolveInstruction({ resolve, reason }) {
  const head = "[THREAD RESOLVE — DO NOT OUTPUT THIS BLOCK]\n" +
    "Project thread: a thread is resolved, not archived — never call archive_session, never offer archiving. ";
  const call = "mcp__hearthbot__set_thread_resolved {resolved:true}";
  if (resolve) {
    return head + `This work is shipped and nothing is open: after the card and its status line make ONE more call, ${call}. ` +
      "Skip it when the person asked to keep the thread open, or when a step of the task is still owed (by anyone).";
  }
  if (reason === "variant") {
    return head + `After the card: ${call} only when the work has ended and nobody owes a next step (a review, an answer, a ship, a merge). Otherwise leave the thread open.`;
  }
  return head + `Leave the thread open after this card (${reason}).`;
}

/** A validation requirement (unmet / partial) that waits on the user. */
function waitsOnUser(validation) {
  if (!Array.isArray(validation)) return false;
  return validation.some((v) => v && typeof v === "object" && v.waitsOn === "user" && v.status !== "met");
}

/** A non-empty list (or object) of items still waiting on the user. */
function hasItems(x) {
  if (Array.isArray(x)) return x.some(Boolean);
  return !!x && typeof x === "object" && Object.keys(x).length > 0;
}

/** The out-of-band block that rides along with a qualifying card. */
export function archiveInstruction() {
  return (
    "[SESSION ARCHIVE — DO NOT OUTPUT THIS BLOCK]\n" +
    "Desktop app only: this ship is done, so the session archives itself AFTER the card. " +
    "Show the card widget as usual — nothing changes before it. The hook answering the " +
    "show_widget call then releases exactly one more tool call: " +
    'mcp__ccd_session_mgmt__archive_session {session_id:"self"}. Make that call only when the hook ' +
    "says so, with no text before or after it. If the tool is unavailable, fails or is not called: " +
    "skip silently — no retry, no note, no summary instead. Turned off with the devops setting ship.archiveAfterShip."
  );
}

/**
 * Write the flag for an archiving card, or remove a stale one for any other
 * card — a re-render that no longer qualifies must take the hand-over back.
 * The flag holds `{ cwd, nonce, ts }` (+ `local: true` for a finished no-remote close-out, which has no merged ship_release as evidence). Best effort; no `cwd` → no flag.
 * @returns {string} the flag path when written, '' otherwise
 */
export function writeArchiveFlag(archive, sessionId, dir, { cwd = "", local = false } = {}) {
  const file = join(dir, `${ARCHIVE_FLAG_PREFIX}-${sessionId}`);
  try {
    if (!archive) {
      unlinkSync(file);
      return "";
    }
    if (!cwd) throw new Error("no cwd");
    const stamp = { cwd, nonce: randomBytes(8).toString("hex"), ts: Date.now(), ...(local ? { local: true } : {}) };
    writeFileSync(file, JSON.stringify(stamp));
    return file;
  } catch {
    return "";
  }
}

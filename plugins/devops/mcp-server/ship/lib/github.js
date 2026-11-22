/**
 * @module ship/lib/github
 * @description Wrappers around the gh CLI for PR, merge, tag, and release operations.
 */

import { execFileSync } from "node:child_process";

const DEFAULT_TIMEOUT = 30_000;

// #508 — grace window for an immediate "no checks" right after a push: an
// external status provider (Vercel etc.) can register seconds after the push
// that immediately precedes the checks gate, so a single probe cannot tell
// "nothing is wired up" from "not registered yet". Configurable via env for
// operators; tests override via the `noChecksGraceMs` option instead of the
// env var, so the suite never depends on process.env state.
const DEFAULT_NO_CHECKS_GRACE_MS = 90_000;
const DEFAULT_NO_CHECKS_GRACE_INTERVAL_MS = 5_000;

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

// ANSI escape pattern built at runtime to avoid literal control chars in source.
const ANSI_PATTERN = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*[A-Za-z]", "g");

function gh(args, opts = {}) {
  const { cwd = process.cwd(), timeout = DEFAULT_TIMEOUT } = opts;
  return execFileSync("gh", args, { windowsHide: true,
    cwd,
    encoding: "utf8",
    timeout,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

// ── REST fallback for a cloud session ─────────────────────────────────────
// The claude.ai cloud GitHub proxy refuses the GraphQL `gh` subcommands (`gh pr
// create | view | list | merge | ready | checks`, `gh issue`) but passes `gh api`
// (REST) and branch pushes. A cloud thread therefore reaches the same PR and
// merge through REST. Chosen when the session says it is remote
// (CLAUDE_CODE_REMOTE=true) or DEVOPS_SHIP_GH_TRANSPORT=rest, and — exactly for
// the calls a refusal breaks — after the first refused `gh pr …` call, which
// then sticks for the rest of the process. DEVOPS_SHIP_GH_TRANSPORT=graphql
// pins the CLI. A Desktop or terminal session never leaves the CLI path.
// A working CLI also prefixes its own errors with "GraphQL:" ("Merge commits are
// not allowed", "can't be rebased"): only proxy / 403 wording counts as a refusal.
// The proxy's exact text is undocumented, so the remote-session env is the main switch.
// The text must be about the GraphQL endpoint or the `gh pr` subcommand being
// refused — a bare "proxy" (a corporate `proxyconnect tcp` error) or "403" (a
// secondary rate limit) is an unrelated Desktop failure and never switches.
const REST_REFUSAL_RE = /graphql[^\n]*(?:forbidden|blocked|rejected by|refused|denied|not supported|disabled)|(?:forbidden|blocked|rejected by|refused|denied)[^\n]*(?:graphql|\bgh pr\b)/i;
const NOT_A_REFUSAL_RE = /rate limit|too quickly|abuse detection|proxyconnect/i;
// A remembered refusal lasts one ship run's worth of time, not the MCP process:
// a single misread error must not pin every later ship of a long-lived server.
const STICKY_MS = 15 * 60 * 1000;
let restStickyUntil = 0;

/** Test hook: forget a remembered refusal. */
export function resetGhTransport() { restStickyUntil = 0; }

function markRestSticky() { restStickyUntil = Date.now() + STICKY_MS; }

/** Does this session reach GitHub through REST rather than the `gh` subcommands? */
export function useRestTransport(env = process.env) {
  const pin = env.DEVOPS_SHIP_GH_TRANSPORT;
  if (pin === "graphql") return false;
  return Date.now() < restStickyUntil || pin === "rest" || env.CLAUDE_CODE_REMOTE === "true";
}

function isRefusalText(text) {
  return REST_REFUSAL_RE.test(text) && !NOT_A_REFUSAL_RE.test(text);
}

function refusedByProxy(e) {
  return isRefusalText(sanitizeError(e));
}

/** Run `cli`; when the proxy refuses it, run `rest` instead and remember the refusal. */
function ghOrRest(cli, rest) {
  if (useRestTransport()) return rest();
  try {
    return cli();
  } catch (e) {
    if (!refusedByProxy(e)) throw e;
    markRestSticky();
    return rest();
  }
}

/** `gh api -X <method> <endpoint>` with an optional JSON body on stdin; parsed JSON or null. */
function ghApiJson(method, endpoint, body, opts = {}) {
  const { cwd = process.cwd(), timeout = DEFAULT_TIMEOUT } = opts;
  const args = ["api", "-X", method, endpoint];
  const input = body === undefined ? undefined : JSON.stringify(body);
  if (input !== undefined) args.push("--input", "-");
  const out = execFileSync("gh", args, { windowsHide: true, cwd, encoding: "utf8", input, timeout, stdio: ["pipe", "pipe", "pipe"] }).trim();
  return out ? JSON.parse(out) : null;
}

const enc = encodeURIComponent;
const PULLS = "repos/{owner}/{repo}/pulls";

/** REST PR → the state names `gh pr view` prints. */
function restPRStateOf(pr) {
  return pr.merged ? "MERGED" : pr.state === "closed" ? "CLOSED" : "OPEN";
}

function restMergeableOf(pr) {
  if (pr.mergeable === true) return "MERGEABLE";
  if (pr.mergeable === false) return "CONFLICTING";
  return "UNKNOWN";
}

/** Same bucket vocabulary as `gh pr checks --json bucket`. */
function checkRunBucket(run) {
  if (run.status !== "completed") return "pending";
  if (["success", "neutral", "skipped"].includes(run.conclusion)) return "pass";
  return run.conclusion === "cancelled" ? "cancel" : "fail";
}

function statusBucket(s) {
  return s.state === "success" ? "pass" : s.state === "pending" ? "pending" : "fail";
}

/** The PR's checks over REST (check runs + commit statuses of its head), in `gh pr checks --json` shape. */
function restPRChecks(prNumber, opts) {
  const sha = ghApiJson("GET", `${PULLS}/${prNumber}`, undefined, opts)?.head?.sha;
  if (!sha) throw new Error(`PR #${prNumber}: head sha unreadable`);
  const runs = ghApiJson("GET", `repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=100`, undefined, opts)?.check_runs || [];
  const statuses = ghApiJson("GET", `repos/{owner}/{repo}/commits/${sha}/status?per_page=100`, undefined, opts)?.statuses || [];
  return [
    ...runs.map((r) => ({ name: r.name, workflow: r.app?.name || "", state: r.conclusion || r.status, bucket: checkRunBucket(r), link: r.html_url || "" })),
    ...statuses.map((s) => ({ name: s.context, workflow: "", state: s.state, bucket: statusBucket(s), link: s.target_url || "" })),
  ];
}

/**
 * Delete a branch on origin after its PR merged (#442). Used where
 * `gh pr merge --delete-branch` is deliberately skipped — inside a worktree gh
 * would try to check out base locally — so the remote head never went away and
 * repos without `delete_branch_on_merge` accumulated stale `claude/*` heads
 * (34 on one consumer). The DELETE is safe for the worktree: it keeps working
 * on its local branch, and the next push re-creates the remote head.
 *
 * Tries the REST ref delete first (no local checkout involved), then
 * `git push origin --delete`. Never throws — the merge already landed and a
 * failed delete is a warning, not a failure (#398 post-merge contract).
 *
 * @returns {{ ok: boolean, method?: "gh-api"|"git-push", error?: string }}
 */
export function deleteRemoteBranch(branch, opts = {}) {
  const errors = [];
  try {
    gh(["api", "-X", "DELETE", `repos/{owner}/{repo}/git/refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`], opts);
    return { ok: true, method: "gh-api" };
  } catch (e) {
    errors.push(`gh api: ${sanitizeError(e) || "failed"}`);
  }
  try {
    const { cwd = process.cwd(), timeout = DEFAULT_TIMEOUT } = opts;
    execFileSync("git", ["push", "origin", "--delete", branch], { windowsHide: true, cwd, encoding: "utf8", timeout, stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, method: "git-push" };
  } catch (e) {
    errors.push(`git push --delete: ${sanitizeError(e) || "failed"}`);
  }
  return { ok: false, error: errors.join("; ") };
}

/**
 * Create a PR and return { number, url }.
 * Body is passed via stdin to avoid shell escaping issues.
 */
export function createPR({ title, body, base = "main", head, draft = false }, opts) {
  return ghOrRest(
    () => createPRViaGh({ title, body, base, head, draft }, opts),
    () => {
      // REST can open a draft but cannot mark it ready (`gh pr ready` is GraphQL
      // only), so a REST-created PR is always a regular one: ship_release would
      // otherwise merge into a draft GitHub refuses.
      const pr = ghApiJson("POST", PULLS, { title, body, head, base, draft: false }, opts);
      return { number: pr.number, url: pr.html_url, ...(draft && { draftDowngraded: true }) };
    },
  );
}

function createPRViaGh({ title, body, base, head, draft }, opts) {
  const cwd = opts?.cwd || process.cwd();
  // gh pr create does not support --json; parse URL from stdout instead
  const url = execFileSync(
    "gh",
    ["pr", "create", "--title", title, "--body-file", "-", "--base", base, "--head", head, ...(draft ? ["--draft"] : [])],
    { windowsHide: true,
      cwd,
      encoding: "utf8",
      input: body,
      timeout: DEFAULT_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"],
    },
  ).trim();
  const match = url.match(/\/pull\/(\d+)/);
  const number = match ? parseInt(match[1], 10) : null;
  return { number, url };
}

/**
 * Mark a draft PR ready for review (`gh pr ready`) and optionally refresh its
 * title/body. Used by ship_release for the draft that ship_preflight opened
 * early (earlyPush). Never throws — a failure is reported, the ship continues
 * (a draft PR still runs CI; only the merge call would be refused by GitHub).
 * @returns {{ ok: boolean, error?: string }}
 */
export function markPRReady(prNumber, { title, body } = {}, opts = {}) {
  const cwd = opts?.cwd || process.cwd();
  if (useRestTransport()) return markPRReadyRest(prNumber, { title, body }, opts);
  try {
    gh(["pr", "ready", String(prNumber)], opts);
  } catch (e) {
    if (refusedByProxy(e)) { markRestSticky(); return markPRReadyRest(prNumber, { title, body }, opts); }
    return { ok: false, error: sanitizeError(e) };
  }
  if (title || body) {
    try {
      const args = ["pr", "edit", String(prNumber)];
      if (title) args.push("--title", title);
      if (body) args.push("--body-file", "-");
      execFileSync("gh", args, { windowsHide: true, cwd, encoding: "utf8", input: body || undefined, timeout: DEFAULT_TIMEOUT, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      return { ok: true, editError: sanitizeError(e) };
    }
  }
  return { ok: true };
}

/**
 * Over REST a draft cannot be marked ready: refresh title/body of a PR that is
 * not a draft, and report a draft as not ready (the merge would be refused).
 */
function markPRReadyRest(prNumber, { title, body }, opts) {
  try {
    const pr = ghApiJson("GET", `${PULLS}/${prNumber}`, undefined, opts);
    if (pr?.draft) return { ok: false, error: `PR #${prNumber} is a draft and a cloud session cannot mark it ready (REST has no such call) — click "Ready for review" on GitHub, or close it and ship again` };
    if (!title && !body) return { ok: true };
    ghApiJson("PATCH", `${PULLS}/${prNumber}`, { ...(title && { title }), ...(body && { body }) }, opts);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: sanitizeError(e) };
  }
}

/**
 * Block the current thread for `ms` milliseconds WITHOUT spawning a process.
 *
 * The previous backoff sleep was `execSync('node -e "setTimeout(…)"')` — a
 * shell-spawned (cmd.exe on Windows) child with its own 15 s cap. On a loaded
 * Windows box that spawn itself tripped `spawnSync cmd.exe ETIMEDOUT` *after*
 * `gh pr merge` had already landed, and the throw made the whole ship read as
 * failed with no merge state (#398). Atomics.wait cannot time out, cannot fail
 * to spawn, and costs nothing.
 */
export function sleepSync(ms) {
  if (!(ms > 0)) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Read a PR's state via gh; returns the state string or throws. */
function readPRState(prNumber, opts) {
  return ghOrRest(
    () => gh(["pr", "view", String(prNumber), "--json", "state", "-q", ".state"], opts),
    () => restPRStateOf(ghApiJson("GET", `${PULLS}/${prNumber}`, undefined, opts)),
  );
}

/** Sanitize a gh error for inclusion in a message: no ANSI, capped length. */
function sanitizeError(e) {
  const raw = e?.stderr?.toString() || e?.message || "";
  // Strip ANSI escape sequences; cap to 500 chars to avoid leaking long auth-bearing output
  return raw.replace(ANSI_PATTERN, "").slice(0, 500).trim();
}

/**
 * Poll the PR state up to `attempts` times with exponential backoff + jitter
 * (1s, 3s typical) to ride out transient network errors and GitHub eventual
 * consistency. Returns `{ state, lastError }` — `state` is the last state that
 * could be read (null when every read threw).
 */
function pollPRState(prNumber, opts, { attempts = 3, sleep = sleepSync } = {}) {
  let state = null;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      state = readPRState(prNumber, opts);
      if (state === "MERGED") break;
    } catch (e) {
      lastError = sanitizeError(e);
    }
    if (attempt < attempts) {
      const baseMs = 1000 * Math.pow(3, attempt - 1);
      sleep(Math.round(baseMs * (0.9 + Math.random() * 0.2)));
    }
  }
  return { state, lastError };
}

/**
 * Read the fields the land-a-bot-PR gate needs (#955).
 * @returns {{ author: string, isDraft: boolean, mergeable: string, statusCheckRollup: object[], headRefName: string, baseRefName: string, state: string }}
 */
export function readPRForLand(prNumber, opts) {
  const raw = gh(["pr", "view", String(prNumber), "--json", "author,isDraft,mergeable,statusCheckRollup,headRefName,baseRefName,state"], opts);
  const j = JSON.parse(raw);
  return {
    author: j.author?.login || "",
    isDraft: !!j.isDraft,
    mergeable: j.mergeable || "UNKNOWN",
    statusCheckRollup: Array.isArray(j.statusCheckRollup) ? j.statusCheckRollup : [],
    headRefName: j.headRefName || "",
    baseRefName: j.baseRefName || "main",
    state: j.state || "",
  };
}

const BOT_AUTHORS = new Set(["app/dependabot", "dependabot[bot]", "dependabot"]);
const GREEN_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

/**
 * Pure gate: may this PR be landed through ship_run `landPr`? Only an open,
 * non-draft, mergeable Dependabot PR whose every check is green.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function landEligibility(pr) {
  if (!BOT_AUTHORS.has(String(pr.author || "").toLowerCase())) return { ok: false, reason: `author "${pr.author}" is not Dependabot` };
  if (pr.state && pr.state !== "OPEN") return { ok: false, reason: `PR is ${pr.state}, not OPEN` };
  if (pr.isDraft) return { ok: false, reason: "PR is a draft" };
  if (pr.mergeable !== "MERGEABLE") return { ok: false, reason: `PR is not mergeable (${pr.mergeable})` };
  const checks = pr.statusCheckRollup || [];
  if (!checks.length) return { ok: false, reason: "PR reports no checks" };
  const bad = checks.filter((c) => {
    if (c.__typename === "StatusContext" || (c.state !== undefined && c.conclusion === undefined)) return c.state !== "SUCCESS";
    return c.status !== "COMPLETED" || !GREEN_CONCLUSIONS.has(c.conclusion);
  });
  if (bad.length) return { ok: false, reason: `checks not green: ${bad.map((c) => c.name || c.context || "?").join(", ")}` };
  return { ok: true };
}

/**
 * Merge a PR by number, delete remote branch.
 *
 * Contract (#398): the merge is the ONE irreversible step of a ship, so this
 * function separates "did the merge land" from "could every follow-up read
 * succeed". It THROWS only while the merge is provably not done — the merge
 * command failed AND the PR is not in MERGED state, or the PR is verifiably in
 * a non-MERGED state afterwards. Once the merge has landed (merge command
 * exited 0, or the state reads MERGED), every later hiccup — an unreadable
 * state, a slow `git fetch`, a `rev-parse` timeout — is REPORTED on the return
 * value instead of thrown, so the caller can never mistake a merged PR for a
 * failed ship and never skips the ring tag because a read was slow.
 *
 * @param {number} prNumber
 * @param {string} base - Base branch name (e.g. "main", "develop")
 * @param {object} [opts]
 * @param {object} [flags]
 * @param {boolean} [flags.skipDeleteBranch=false] - Skip --delete-branch (e.g. in worktrees where local branch switch fails)
 * @param {"squash"|"merge"|"rebase"} [flags.strategy="squash"] - Merge strategy. Use "merge" for overlapping files to preserve ancestry.
 * @param {(ms:number)=>void} [flags.sleep] - Injectable backoff sleep (tests).
 * @returns {{ sha: string|null, verified: boolean, warning?: string }}
 *   `sha` — short sha of origin/<base> after the merge, or null when the
 *   post-merge fetch/rev-parse failed (the merge still landed);
 *   `verified` — whether `gh pr view` confirmed state MERGED;
 *   `warning` — human-readable reason for a null sha / unverified state.
 */
/** GitHub's refusal of a rebase merge — the branch carries a merge commit (e.g. origin/<base> merged in during the ship). */
const REBASE_REFUSED_RE = /can'?t be rebased/i;
/** GitHub's refusal of a merge commit — the repository allows only squash / rebase merges. */
const MERGE_COMMIT_REFUSED_RE = /merge commits are not allowed/i;

export function mergePR(prNumber, base = "main", opts, flags = {}) {
  // A merge GitHub refuses has provably NOT landed (mergePR only throws while
  // the PR is not merged), so a retry with another strategy is safe and lands
  // the same tree. A refused rebase retries as a merge commit — the per-issue
  // commits stay reachable in the base's history (#1155: git-sync and the base
  // sync put a merge commit on every batch branch, so the rebase never held) —
  // and only a repo without merge commits falls back to squash. The caller
  // reports the change (`strategyFallback`).
  if (flags.strategy === "rebase") {
    try {
      return mergePRWith(prNumber, base, opts, flags);
    } catch (e) {
      if (!REBASE_REFUSED_RE.test(String(e && e.message))) throw e;
      try {
        const landed = mergePRWith(prNumber, base, opts, { ...flags, strategy: "merge" });
        return { ...landed, strategyFallback: { from: "rebase", to: "merge", reason: "branch can't be rebased (it carries a merge commit)" } };
      } catch (e2) {
        if (!MERGE_COMMIT_REFUSED_RE.test(String(e2 && e2.message))) throw e2;
        const landed = mergePRWith(prNumber, base, opts, { ...flags, strategy: "squash" });
        return { ...landed, strategyFallback: { from: "rebase", to: "squash", reason: "branch can't be rebased and the repository allows no merge commits" } };
      }
    }
  }
  return mergePRWith(prNumber, base, opts, flags);
}

function mergePRWith(prNumber, base, opts, flags) {
  const strategy = flags.strategy || "squash";
  const sleep = typeof flags.sleep === "function" ? flags.sleep : sleepSync;
  const args = ["pr", "merge", String(prNumber), `--${strategy}`, "--admin"];
  if (!flags.skipDeleteBranch) args.push("--delete-branch");

  let mergeCmdError = null;
  const restWarnings = [];
  const restMerge = () => {
    const headRef = ghApiJson("GET", `${PULLS}/${prNumber}`, undefined, opts)?.head?.ref;
    const res = ghApiJson("PUT", `${PULLS}/${prNumber}/merge`, { merge_method: strategy }, opts);
    if (res && res.merged === false) throw new Error(res.message || "GitHub did not merge the PR");
    // `gh pr merge --delete-branch` has no REST twin: delete the head the REST way (best effort).
    if (!flags.skipDeleteBranch && headRef) {
      const del = deleteRemoteBranch(headRef, opts);
      if (!del.ok) restWarnings.push(`merged, but the remote branch ${headRef} could not be deleted (${del.error})`);
    }
  };
  try {
    ghOrRest(() => gh(args, opts), restMerge);
  } catch (e) {
    // A client-side timeout can fire AFTER GitHub performed the merge. Do not
    // conclude "not merged" from the throw alone — the state poll below decides.
    mergeCmdError = sanitizeError(e) || "gh pr merge failed";
  }

  const { state, lastError } = pollPRState(prNumber, opts, { sleep });
  const warnings = [...restWarnings];

  if (state !== "MERGED") {
    if (mergeCmdError !== null) {
      // Merge command failed and the PR is not (readably) merged → not merged.
      const detail = lastError ? ` (last state error: ${lastError})` : state ? ` (state: "${state}")` : "";
      throw new Error(`PR #${prNumber} merge failed: ${mergeCmdError}${detail}`);
    }
    if (state !== null) {
      // The command exited 0 but the PR verifiably is NOT merged (e.g. CLOSED).
      const detail = lastError ? ` (last error: ${lastError})` : "";
      throw new Error(`PR #${prNumber} merge verification failed after 3 attempts — state is "${state}", expected "MERGED"${detail}`);
    }
    // Command exited 0, every state read threw → GitHub accepted the merge; we
    // just could not confirm it. Report, do not throw — throwing here is exactly
    // the merged-but-reads-as-failed case of #398.
    warnings.push(`merge command succeeded but PR state could not be verified after 3 attempts${lastError ? ` (last error: ${lastError})` : ""}`);
  }
  const verified = state === "MERGED";
  if (verified && mergeCmdError !== null) {
    warnings.push(`gh pr merge reported an error (${mergeCmdError}) but the PR is in MERGED state — merge landed`);
  }

  // Fetch updated base branch and read the merge commit. Both are reads after
  // the irreversible step: a failure here is reported, never thrown.
  const cwd = opts?.cwd || process.cwd();
  let sha = null;
  let readError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execFileSync("git", ["fetch", "origin", base], { windowsHide: true, cwd, encoding: "utf8", timeout: DEFAULT_TIMEOUT, stdio: ["pipe", "pipe", "pipe"] });
      sha = execFileSync("git", ["rev-parse", "--short", `origin/${base}`], { windowsHide: true, cwd, encoding: "utf8", timeout: DEFAULT_TIMEOUT, stdio: ["pipe", "pipe", "pipe"] }).trim();
      break;
    } catch (e) {
      readError = sanitizeError(e) || e?.message || "unknown error";
      if (attempt < 3) sleep(1000 * attempt);
    }
  }
  if (sha === null) {
    warnings.push(`merged, but origin/${base} could not be fetched/resolved after 3 attempts (${readError}) — mergeSha unknown`);
  }

  // The exact commit GitHub created for THIS merge. `origin/<base>` is only
  // "the tip right after the merge" — a parallel ship landing in the seconds
  // before the tag step moves it. Callers that tag must tag this SHA.
  let fullSha = null;
  if (verified) {
    try {
      const oid = ghOrRest(
        () => gh(["pr", "view", String(prNumber), "--json", "mergeCommit", "-q", ".mergeCommit.oid"], opts),
        () => ghApiJson("GET", `${PULLS}/${prNumber}`, undefined, opts)?.merge_commit_sha || "",
      );
      if (/^[0-9a-f]{40}$/.test(oid)) fullSha = oid;
    } catch {
      /* best effort — callers fall back to origin/<base> */
    }
  }

  const result = { sha, verified };
  if (fullSha) result.fullSha = fullSha;
  if (warnings.length > 0) result.warning = warnings.join("; ");
  return result;
}

/**
 * Check if an open PR already exists for head → base.
 * Returns { number, url, mergeable } if found, null otherwise.
 * Includes mergeability state to detect stale PRs that need updating.
 */
export function findExistingPR({ base, head }, opts) {
  try {
    return ghOrRest(
      () => {
        const raw = gh(
          ["pr", "list", "--head", head, "--base", base, "--state", "open", "--json", "number,url,mergeable,isDraft", "--limit", "1"],
          opts,
        );
        const list = JSON.parse(raw);
        if (list.length === 0) return null;
        const pr = list[0];
        // mergeable: "MERGEABLE", "CONFLICTING", "UNKNOWN"
        return { number: pr.number, url: pr.url, mergeable: pr.mergeable || "UNKNOWN", isDraft: pr.isDraft === true };
      },
      () => {
        const list = ghApiJson("GET", `${PULLS}?state=open&base=${enc(base)}&head={owner}:${enc(head)}&per_page=1`, undefined, opts) || [];
        if (list.length === 0) return null;
        // the list endpoint leaves `mergeable` out: one read of the PR itself
        const pr = ghApiJson("GET", `${PULLS}/${list[0].number}`, undefined, opts) || list[0];
        return { number: pr.number, url: pr.html_url, mergeable: restMergeableOf(pr), isDraft: pr.draft === true };
      },
    );
  } catch {
    return null; // Network error or no PR — safe to proceed
  }
}

/**
 * Best-effort signal: did this PR carry CI checks/statuses on an earlier
 * commit? Used to decide whether an immediate "no checks" on a freshly
 * pushed head deserves the full checks timeout as its wait budget, instead
 * of just the short grace window (#508: a PR/repo that HAS reported checks
 * before is not "no CI configured" — the new head just hasn't been picked
 * up by the status provider yet). Never throws and never blocks a ship on
 * its own failure — an unreadable history just means "assume no signal",
 * which only shortens the wait.
 */
function hadRecentChecks(prNumber, opts) {
  try {
    const raw = gh(["pr", "view", String(prNumber), "--json", "commits"], opts);
    const commits = JSON.parse(raw)?.commits || [];
    // Exclude the current head (last entry); look at up to 5 earlier commits,
    // most recent first.
    const earlier = commits.slice(0, -1).slice(-5).reverse();
    for (const c of earlier) {
      if (!c?.oid) continue;
      try {
        const runs = gh(["api", `repos/{owner}/{repo}/commits/${c.oid}/check-runs`, "-q", ".total_count"], opts);
        if (parseInt(runs, 10) > 0) return true;
      } catch { /* fall through to combined status */ }
      try {
        const statuses = gh(["api", `repos/{owner}/{repo}/commits/${c.oid}/status`, "-q", ".total_count"], opts);
        if (parseInt(statuses, 10) > 0) return true;
      } catch { /* keep looking at the next commit */ }
    }
  } catch { /* no readable commit history — assume no signal */ }
  return false;
}

/** hadRecentChecks over REST: did an earlier commit of the PR report check runs or statuses? */
function hadRecentChecksRest(prNumber, opts) {
  try {
    const commits = ghApiJson("GET", `${PULLS}/${prNumber}/commits?per_page=100`, undefined, opts) || [];
    const earlier = commits.slice(0, -1).slice(-5).reverse();
    for (const c of earlier) {
      const sha = c?.sha;
      if (!sha) continue;
      try {
        if ((ghApiJson("GET", `repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=1`, undefined, opts)?.total_count || 0) > 0) return true;
      } catch { /* fall through to combined status */ }
      try {
        if ((ghApiJson("GET", `repos/{owner}/{repo}/commits/${sha}/status?per_page=1`, undefined, opts)?.total_count || 0) > 0) return true;
      } catch { /* keep looking at the next commit */ }
    }
  } catch { /* no readable commit history — assume no signal */ }
  return false;
}

/**
 * Watch a PR's CI checks until they complete, fail, or timeout.
 *
 * Returns:
 *   { status: "passed",      checks: [...] }                       — all green
 *   { status: "no-checks",   checks: [], noChecksReason? }          — no CI configured on this PR; `noChecksReason` is
 *                                                                    set when we actually waited (grace window elapsed)
 *                                                                    before concluding it — never a silent verdict on a
 *                                                                    head that simply hasn't reported yet (#508)
 *   { status: "failed",      checks, failed, pending, error }      — at least one check failed
 *   { status: "timeout",     checks, failed, pending, error }      — did not complete within timeoutSec, OR
 *                                                                    watch exited unexpectedly while checks were still pending
 *   { status: "probe-error", error }                                — initial probe failed (auth/network) and the
 *                                                                    state could not be determined; treated as block-worthy
 *                                                                    by the caller so the gate is fail-closed.
 *
 * Never throws — callers branch on `status`.
 */
export function watchPRChecks(prNumber, opts, {
  timeoutSec = 600,
  intervalSec = 10,
  // #508: an immediate "no checks" right after a push is ambiguous — ride it
  // out for a grace window before concluding there is no CI. `0` (tests) skips
  // the wait entirely and preserves the old immediate verdict.
  noChecksGraceMs = envInt("DEVOPS_SHIP_NO_CHECKS_GRACE_MS", DEFAULT_NO_CHECKS_GRACE_MS),
  noChecksGraceIntervalMs = envInt("DEVOPS_SHIP_NO_CHECKS_GRACE_INTERVAL_MS", DEFAULT_NO_CHECKS_GRACE_INTERVAL_MS),
  sleep = sleepSync,
  now = Date.now,
} = {}) {
  if (useRestTransport()) {
    return watchPRChecksRest(prNumber, opts, { timeoutSec, intervalSec, noChecksGraceMs, noChecksGraceIntervalMs, sleep, now });
  }
  // One probe — distinguishes "no checks at all" from "checks present" (incl.
  // pending). gh exits non-zero with "no checks reported" when nothing is
  // wired up, and exit 8 when checks are pending.
  function probeOnce() {
    let raw;
    try {
      raw = gh(["pr", "checks", String(prNumber), "--json", "bucket,state,name,workflow,link"], opts);
    } catch (e) {
      const stderr = (e.stderr?.toString() || e.message || "").replace(ANSI_PATTERN, "");
      if (/no checks/i.test(stderr) || /no required checks/i.test(stderr)) {
        return { kind: "no-checks", checks: [] };
      }
      if (e.status !== 8) {
        // Real failure (auth, network, PR not found) — fail-closed: do NOT
        // silently treat as "no checks", or the gate becomes a no-op when
        // auth breaks.
        return { kind: "probe-error", error: `gh pr checks probe failed: ${stderr.slice(0, 300)}` };
      }
      raw = e.stdout?.toString() || "[]";
    }
    let checks;
    try {
      checks = JSON.parse(raw);
    } catch {
      checks = [];
    }
    if (!checks || checks.length === 0) return { kind: "no-checks", checks: [] };
    return { kind: "checks", checks };
  }

  // timeoutSec bounds the WHOLE call: the no-checks grace wait below is
  // deducted from the --watch ceiling, or a ship could wait ~2x (AUD-C045).
  const startedAt = now();
  let probe = probeOnce();
  if (probe.kind === "probe-error" && isRefusalText(probe.error)) {
    // the proxy refused `gh pr checks` (GraphQL): read the checks over REST instead
    markRestSticky();
    return watchPRChecksRest(prNumber, opts, { timeoutSec, intervalSec, noChecksGraceMs, noChecksGraceIntervalMs, sleep, now });
  }
  if (probe.kind === "probe-error") {
    return { status: "probe-error", error: probe.error };
  }

  if (probe.kind === "no-checks") {
    const graceMs = Math.max(0, noChecksGraceMs);
    // Only bother asking history when we're actually going to wait — a
    // grace-less caller (tests, skipChecks-adjacent flows) gets the old
    // immediate verdict with zero extra gh calls.
    const hasHistory = graceMs > 0 ? hadRecentChecks(prNumber, opts) : false;
    // Plain case: wait out the grace window. Stronger signal (this PR/repo
    // HAS reported checks before): wait up to the full checks timeout for
    // the new head to pick them up, per #508.
    const waitBudgetMs = hasHistory ? Math.max(graceMs, timeoutSec * 1000) : graceMs;
    const deadline = now() + waitBudgetMs;
    let waited = false;
    while (probe.kind === "no-checks" && now() < deadline) {
      const step = Math.min(noChecksGraceIntervalMs, deadline - now());
      if (step <= 0) break;
      sleep(step);
      waited = true;
      probe = probeOnce();
      if (probe.kind === "probe-error") return { status: "probe-error", error: probe.error };
    }
    if (probe.kind === "no-checks") {
      const result = { status: "no-checks", checks: [] };
      if (waited) {
        result.noChecksReason = hasHistory
          ? `PR #${prNumber} had earlier commits with CI checks, but none appeared on this head within ${Math.round(waitBudgetMs / 1000)}s — proceeding as no-checks; verify CI is wired up on this head.`
          : `No CI checks reported within ${Math.round(waitBudgetMs / 1000)}s of the push — proceeding as no-checks.`;
      }
      return result;
    }
    // Checks showed up during the grace window — fall through to the watch
    // loop below exactly as if the very first probe had seen them.
  }

  // Block on gh's own --watch loop. Wrap with our own timeout to bound it hard.
  const watchTimeoutMs = Math.max(1_000, timeoutSec * 1000 - Math.max(0, now() - startedAt));
  let watchErr = null;
  try {
    execFileSync(
      "gh",
      ["pr", "checks", String(prNumber), "--watch", "--fail-fast", "--interval", String(intervalSec)],
      { windowsHide: true,
        cwd: opts?.cwd || process.cwd(),
        encoding: "utf8",
        timeout: watchTimeoutMs,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch (e) {
    watchErr = e;
  }

  // Snapshot final state regardless of watch outcome.
  let finalChecks = [];
  try {
    const raw = gh(
      ["pr", "checks", String(prNumber), "--json", "bucket,state,name,workflow,link"],
      opts,
    );
    finalChecks = JSON.parse(raw);
  } catch (e) {
    // gh exit 8 = pending; still try to read stdout
    if (e.stdout) {
      try { finalChecks = JSON.parse(e.stdout.toString()); } catch { /* keep [] */ }
    }
  }

  const failed = finalChecks.filter((c) => c.bucket === "fail" || c.bucket === "cancel");
  const pending = finalChecks.filter((c) => c.bucket === "pending");

  if (watchErr) {
    const isTimeout = watchErr.code === "ETIMEDOUT" || watchErr.signal === "SIGTERM";
    if (isTimeout) {
      return {
        status: "timeout",
        checks: finalChecks,
        failed,
        pending,
        error: `PR checks did not complete within ${timeoutSec}s (${pending.length} still pending)`,
      };
    }
    // gh exits non-zero when at least one check failed
    if (failed.length > 0) {
      return {
        status: "failed",
        checks: finalChecks,
        failed,
        pending,
        error: `${failed.length} check(s) failed: ${failed.map((c) => c.name || c.workflow).join(", ")}`,
      };
    }
    // No failures recorded — but if checks are still pending, watch died early.
    // Treating that as "passed" would let the merge race ahead of pending CI;
    // surface it as timeout so the caller blocks (fail-closed).
    const stderr = (watchErr.stderr?.toString() || watchErr.message || "").replace(ANSI_PATTERN, "");
    if (pending.length > 0) {
      return {
        status: "timeout",
        checks: finalChecks,
        failed,
        pending,
        error: `gh pr checks --watch exited early with ${pending.length} check(s) still pending: ${stderr.slice(0, 200)}`,
      };
    }
    // No failures, no pending — everything had already finished cleanly before
    // the noise. Treat as passed, but record the warning for the result.
    return { status: "passed", checks: finalChecks, watchWarning: stderr.slice(0, 300) };
  }

  // Watch exited cleanly — all checks passed
  return { status: "passed", checks: finalChecks };
}

/**
 * watchPRChecks over REST (cloud): poll the PR head's check runs and commit
 * statuses. Same result shapes as the CLI path; the no-checks grace window works
 * the same way (a head that has not reported yet is not "no CI").
 */
function watchPRChecksRest(prNumber, opts, { timeoutSec, intervalSec, noChecksGraceMs, noChecksGraceIntervalMs, sleep, now }) {
  const startedAt = now();
  const deadline = startedAt + timeoutSec * 1000;
  const graceMs = Math.max(0, noChecksGraceMs);
  let graceEnd = startedAt + graceMs;
  let hasHistory = false;
  let historyAsked = false;
  let checks = [];
  let waited = false;
  for (;;) {
    try {
      checks = restPRChecks(prNumber, opts);
    } catch (e) {
      return { status: "probe-error", error: `REST checks probe failed: ${sanitizeError(e).slice(0, 300)}` };
    }
    const failed = checks.filter((c) => c.bucket === "fail" || c.bucket === "cancel");
    const pending = checks.filter((c) => c.bucket === "pending");
    if (checks.length === 0) {
      // Same patience as the CLI path: when earlier commits of this PR reported
      // checks, wait up to the full checks timeout for the new head (#508) —
      // asked once, and only when a grace wait is wanted at all.
      if (!historyAsked && graceMs > 0) {
        historyAsked = true;
        hasHistory = hadRecentChecksRest(prNumber, opts);
        if (hasHistory) graceEnd = Math.max(graceEnd, startedAt + timeoutSec * 1000);
      }
      if (now() >= graceEnd) {
        const result = { status: "no-checks", checks: [] };
        if (waited) {
          const waitedS = Math.round((graceEnd - startedAt) / 1000);
          result.noChecksReason = hasHistory
            ? `PR #${prNumber} had earlier commits with CI checks, but none appeared on this head within ${waitedS}s — proceeding as no-checks; verify CI is wired up on this head.`
            : `No CI checks reported within ${waitedS}s of the push — proceeding as no-checks.`;
        }
        return result;
      }
      sleep(Math.max(1, Math.min(noChecksGraceIntervalMs, graceEnd - now())));
      waited = true;
      continue;
    }
    if (failed.length) {
      return { status: "failed", checks, failed, pending, error: `${failed.length} check(s) failed: ${failed.map((c) => c.name || c.workflow).join(", ")}` };
    }
    if (pending.length === 0) return { status: "passed", checks };
    if (now() >= deadline) {
      return { status: "timeout", checks, failed, pending, error: `PR checks did not complete within ${timeoutSec}s (${pending.length} still pending)` };
    }
    sleep(Math.min(intervalSec * 1000, Math.max(1, deadline - now())));
  }
}

/**
 * Create a GitHub release for a tag.
 * Notes are passed via stdin to avoid shell escaping issues.
 */
export function createRelease({ tag, title, notes, prerelease = false }, opts) {
  const cwd = opts?.cwd || process.cwd();
  const args = ["release", "create", tag, "--title", title, "--notes-file", "-"];
  if (prerelease) args.push("--prerelease");
  execFileSync("gh", args, { windowsHide: true,
    cwd,
    encoding: "utf8",
    input: notes,
    timeout: DEFAULT_TIMEOUT,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/**
 * Whether a GitHub release exists for a tag. Used by ship_promote to stay
 * idempotent against release.yml (which creates the stable release when the
 * bare tag push triggers it — promote only creates one as a fallback).
 */
export function releaseExists(tag, opts) {
  const cwd = opts?.cwd || process.cwd();
  try {
    execFileSync("gh", ["release", "view", tag], { windowsHide: true,
      cwd,
      encoding: "utf8",
      timeout: DEFAULT_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

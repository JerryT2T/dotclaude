import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { createPR, mergePR, findExistingPR, watchPRChecks, markPRReady, useRestTransport, resetGhTransport } from "./github.js";
import { isPermanentPushError, tagHandoff } from "./tag-handoff.js";

const PROXY_REFUSAL = Object.assign(new Error("gh failed"), { stderr: "GraphQL: request rejected by the GitHub proxy" });
const calls = [];

/** Route by `bin first-args`; a route may be a value, a function or an Error to throw. */
function route(routes) {
  execFileSync.mockImplementation((bin, args, o) => {
    const key = `${bin} ${args.filter((a) => !a.startsWith("-")).slice(0, 2).join(" ")}`;
    calls.push({ key, args, input: o && o.input });
    const hit = Object.entries(routes).find(([k]) => key.startsWith(k));
    if (!hit) throw new Error(`unexpected exec: ${key} :: ${args.join(" ")}`);
    const r = typeof hit[1] === "function" ? hit[1](args, o) : hit[1];
    if (r instanceof Error) throw r;
    return typeof r === "string" ? r : JSON.stringify(r);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  calls.length = 0;
  resetGhTransport();
  vi.stubEnv("CLAUDE_CODE_REMOTE", "");
  vi.stubEnv("DEVOPS_SHIP_GH_TRANSPORT", "");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("transport choice", () => {
  test("a Desktop or terminal session stays on the gh subcommands", () => {
    expect(useRestTransport()).toBe(false);
    route({ "gh pr create": "https://github.com/o/r/pull/7\n" });
    expect(createPR({ title: "T", body: "B", base: "main", head: "feat/x" })).toEqual({ number: 7, url: "https://github.com/o/r/pull/7" });
    expect(calls.every((c) => !c.args.includes("api"))).toBe(true);
  });

  test("a remote session (CLAUDE_CODE_REMOTE) goes straight to REST", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    expect(useRestTransport()).toBe(true);
    route({ "gh api": { number: 9, html_url: "https://github.com/o/r/pull/9" } });
    const pr = createPR({ title: "T", body: "B", base: "main", head: "feat/x" });
    expect(pr).toEqual({ number: 9, url: "https://github.com/o/r/pull/9" });
    expect(calls[0].args).toEqual(expect.arrayContaining(["api", "-X", "POST", "repos/{owner}/{repo}/pulls", "--input", "-"]));
    expect(JSON.parse(calls[0].input)).toMatchObject({ title: "T", body: "B", head: "feat/x", base: "main", draft: false });
  });

  test("DEVOPS_SHIP_GH_TRANSPORT=graphql pins the CLI even in a remote session", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    vi.stubEnv("DEVOPS_SHIP_GH_TRANSPORT", "graphql");
    expect(useRestTransport()).toBe(false);
  });

  test("a proxy refusal of `gh pr create` falls back to REST for that call and for the next ones", () => {
    route({ "gh pr create": PROXY_REFUSAL, "gh api": { number: 11, html_url: "https://github.com/o/r/pull/11" } });
    expect(createPR({ title: "T", body: "B", base: "main", head: "feat/x" }).number).toBe(11);
    expect(useRestTransport()).toBe(true);
    createPR({ title: "T2", body: "B", base: "main", head: "feat/y" });
    expect(calls.filter((c) => c.key === "gh pr create")).toHaveLength(1); // the CLI is not tried again
  });

  test("an error that is not a refusal is thrown, not retried over REST", () => {
    route({ "gh pr create": Object.assign(new Error("x"), { stderr: "a pull request for branch feat/x already exists" }) });
    expect(() => createPR({ title: "T", body: "B", base: "main", head: "feat/x" })).toThrow();
    expect(calls.some((c) => c.args.includes("api"))).toBe(false);
  });

  test("a draft request becomes a regular PR over REST and says so (REST cannot mark a draft ready)", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    route({ "gh api": { number: 3, html_url: "https://github.com/o/r/pull/3" } });
    expect(createPR({ title: "T", body: "B", base: "main", head: "f", draft: true })).toMatchObject({ number: 3, draftDowngraded: true });
    expect(JSON.parse(calls[0].input).draft).toBe(false);
  });
});

describe("findExistingPR over REST", () => {
  test("reads the open PR for head -> base and its mergeability", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    route({
      "gh api": (args) => (args.some((a) => a.includes("/pulls?"))
        ? [{ number: 5 }]
        : { number: 5, html_url: "https://github.com/o/r/pull/5", mergeable: false, draft: true }),
    });
    expect(findExistingPR({ base: "main", head: "claude/thread-x" })).toEqual({ number: 5, url: "https://github.com/o/r/pull/5", mergeable: "CONFLICTING", isDraft: true });
    const list = calls[0].args.find((a) => a.includes("/pulls?"));
    expect(list).toContain("base=main");
    expect(list).toContain("head={owner}:claude%2Fthread-x");
  });

  test("none open -> null", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    route({ "gh api": [] });
    expect(findExistingPR({ base: "main", head: "f" })).toBeNull();
  });
});

describe("mergePR over REST", () => {
  const noSleep = { sleep: () => {} };

  test("squash merge through PUT .../merge, branch head deleted over REST, merge commit read back", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    let merged = false;
    route({
      "git fetch": "",
      "git rev-parse": "abc1234\n",
      "gh api": (args) => {
        const endpoint = args[args.indexOf("-X") + 2];
        const method = args[args.indexOf("-X") + 1];
        if (method === "PUT") { merged = true; return { merged: true, sha: "f".repeat(40) }; }
        if (method === "DELETE") return "";
        return { merged, state: merged ? "closed" : "open", head: { ref: "claude/thread-x", sha: "1".repeat(40) }, merge_commit_sha: "f".repeat(40), endpoint };
      },
    });
    const r = mergePR(5, "main", {}, { strategy: "squash", ...noSleep });
    expect(r).toMatchObject({ sha: "abc1234", verified: true, fullSha: "f".repeat(40) });
    const put = calls.find((c) => c.args.includes("PUT"));
    expect(put.args).toContain("repos/{owner}/{repo}/pulls/5/merge");
    expect(JSON.parse(put.input)).toEqual({ merge_method: "squash" });
    expect(calls.some((c) => c.args.includes("DELETE") && c.args.some((a) => a.endsWith("git/refs/heads/claude/thread-x")))).toBe(true);
    expect(calls.some((c) => c.key.startsWith("gh pr"))).toBe(false); // no GraphQL subcommand at all
  });

  test("a refused `gh pr merge` falls back to REST and still verifies MERGED", () => {
    let merged = false;
    route({
      "git fetch": "",
      "git rev-parse": "abc1234\n",
      "gh pr merge": PROXY_REFUSAL,
      "gh pr view": PROXY_REFUSAL,
      "gh api": (args) => {
        if (args.includes("PUT")) { merged = true; return { merged: true }; }
        return { merged, state: merged ? "closed" : "open", head: { ref: "f" }, merge_commit_sha: "a".repeat(40) };
      },
    });
    const r = mergePR(5, "main", {}, { skipDeleteBranch: true, strategy: "squash", ...noSleep });
    expect(r.verified).toBe(true);
    expect(r.fullSha).toBe("a".repeat(40));
  });

  test("a merge GitHub refuses over REST throws (merge provably not done)", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    route({
      "gh api": (args) => {
        if (args.includes("PUT")) return Object.assign(new Error("405"), { stderr: "Pull Request is not mergeable" });
        return { merged: false, state: "open", head: { ref: "f" } };
      },
    });
    expect(() => mergePR(5, "main", {}, { strategy: "squash", ...noSleep })).toThrow(/merge failed/);
  });
});

describe("markPRReady over REST", () => {
  test("a regular PR refreshes title and body; a draft is reported as not ready", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    route({ "gh api": (args) => (args.includes("PATCH") ? {} : { draft: false }) });
    expect(markPRReady(5, { title: "T", body: "B" })).toEqual({ ok: true });
    expect(JSON.parse(calls.find((c) => c.args.includes("PATCH")).input)).toEqual({ title: "T", body: "B" });
    route({ "gh api": { draft: true } });
    expect(markPRReady(5, { title: "T" })).toMatchObject({ ok: false, error: expect.stringMatching(/draft/) });
  });
});

describe("watchPRChecks over REST", () => {
  const sleeps = [];
  let clock;
  const opts = () => ({ timeoutSec: 60, intervalSec: 5, noChecksGraceMs: 0, sleep: (ms) => { sleeps.push(ms); clock += ms; }, now: () => clock });
  beforeEach(() => { sleeps.length = 0; clock = 0; vi.stubEnv("CLAUDE_CODE_REMOTE", "true"); });

  const api = (runs, statuses = []) => route({
    "gh api": (args) => {
      const ep = args[args.length - 1];
      if (/check-runs/.test(ep)) return { check_runs: runs() };
      if (/\/status/.test(ep)) return { statuses };
      return { head: { sha: "1".repeat(40) } };
    },
  });

  test("pending, then all green -> passed (polls again after the interval)", () => {
    let n = 0;
    api(() => (++n === 1 ? [{ name: "ci", status: "in_progress" }] : [{ name: "ci", status: "completed", conclusion: "success" }]));
    const r = watchPRChecks(5, {}, opts());
    expect(r.status).toBe("passed");
    expect(sleeps).toEqual([5000]);
  });

  test("a failed run -> failed with the name", () => {
    api(() => [{ name: "lint", status: "completed", conclusion: "failure" }]);
    expect(watchPRChecks(5, {}, opts())).toMatchObject({ status: "failed", error: expect.stringContaining("lint") });
  });

  test("a failing commit status counts too", () => {
    api(() => [], [{ context: "deploy", state: "failure" }]);
    expect(watchPRChecks(5, {}, opts()).status).toBe("failed");
  });

  test("nothing reported -> no-checks", () => {
    api(() => []);
    expect(watchPRChecks(5, {}, opts())).toEqual({ status: "no-checks", checks: [] });
  });

  test("still pending at the deadline -> timeout (fail closed)", () => {
    api(() => [{ name: "ci", status: "queued" }]);
    expect(watchPRChecks(5, {}, { ...opts(), timeoutSec: 12 }).status).toBe("timeout");
  });

  test("a refused `gh pr checks` probe switches the whole watch to REST", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    route({
      "gh pr checks": Object.assign(new Error("x"), { stderr: "GraphQL: blocked by proxy", status: 1 }),
      "gh api": (args) => (/check-runs/.test(args[args.length - 1]) ? { check_runs: [{ name: "ci", status: "completed", conclusion: "success" }] } : /\/status/.test(args[args.length - 1]) ? { statuses: [] } : { head: { sha: "1".repeat(40) } }),
    });
    expect(watchPRChecks(5, {}, opts()).status).toBe("passed");
  });
});

describe("the tag the proxy refuses goes to the owner hand-off", () => {
  test("proxy tag-push refusals are permanent (no retry loop)", () => {
    for (const m of [
      "remote: error: the proxy rejected the push: tags are not allowed",
      "fatal: proxy refused to update refs/tags/alpha/v1.2.3",
      "Only branches can be pushed through the GitHub proxy",
    ]) expect(isPermanentPushError(new Error(m)), m).toBe(true);
  });

  test("the hand-off names where the commands run when the session is a cloud one", () => {
    const h = tagHandoff({ channelTag: "alpha/v1.2.3", channel: "alpha", version: "1.2.3", sha: "a".repeat(40), base: "main", permanent: true, cloud: true });
    expect(h.runWhere).toMatch(/local clone/);
    expect(h.commands).toContain("git push origin alpha/v1.2.3");
    expect(tagHandoff({ channelTag: "alpha/v1.2.3", channel: "alpha", version: "1.2.3", base: "main", permanent: true, cloud: false }).runWhere).toBeUndefined();
  });
});

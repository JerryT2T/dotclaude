import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The gate-critical contract of /auto-cleanup (#653, reworked for #4): no report
// page and no Apply-Manifest; the autonomous class (provably landed) goes without
// a question, everything ambiguous goes to ONE concept page and needs a decision,
// live sessions are untouchable, and the protected set is rebuilt before every
// destructive action. A skill trim may cut words, never one of these.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(__dirname, ...p), "utf8");
const flat = (s) => s.replace(/\n>[ \t]?/g, "\n").replace(/\s+/g, " ");
const SKILL = read("SKILL.md");
const EXEC = read("deep-knowledge", "execution.md");
const PAGE = read("deep-knowledge", "page-structure.md");
// the per-hook roster (hooks.json registers one dispatcher per event)
const HOOKS = JSON.parse(read("..", "..", "hooks", "dispatch", "manifest.json"));

function section(text, start, end) {
  const a = text.indexOf(start);
  expect(a, `heading not found: ${start}`).toBeGreaterThan(-1);
  const b = end ? text.indexOf(end, a + 1) : -1;
  return flat(text.slice(a, b === -1 ? text.length : b));
}

describe("auto-cleanup gate contract — steps", () => {
  test("every step heading exists verbatim and in order", () => {
    const got = SKILL.split("\n").filter((l) => /^## /.test(l));
    expect(got).toEqual([
      "## Where this skill sits",
      "## Step 0 — Repo-mode check",
      "## SAFETY: Worktree Branch Protection",
      "## Deletion gate — autonomous class, or a decision",
      "## Step 1 — Repo Context",
      "## Step 2 — Fetch & Sync",
      "## Step 3 — Branch Classification",
      "## Step 4 — Remote Branch Audit",
      "## Step 5 — PR Cross-Reference + Open-PR Inventory",
      "## Step 6 — Local vs Remote Main Sync",
      "## Step 7 — Gather the analysis for the ambiguous items",
      "## Step 8 — Autonomous removal, then ONE concept page",
      "## Step 9 — Open & Monitor",
      "## Step 10 — Execute the concept decisions",
      "## Step 11 — Completion Card",
      "## Rules",
    ]);
    expect(EXEC.split("\n").filter((l) => /^## /.test(l))).toEqual([
      "## Step 10a — Relay the page decisions to the gate",
      "## Step 10b — Ship Queue (before any cleanup)",
      "## Step 10c — Cleanup Execution",
      "## Safety Invariants",
      "## Worktree Removal Safety",
    ]);
  });

  test("a non-git directory aborts before any git command", () => {
    const s = section(SKILL, "## Step 0", "## SAFETY");
    expect(s).toContain("git rev-parse --is-inside-work-tree");
    expect(s).toMatch(/abort/i);
  });
});

describe("auto-cleanup — no report page, current repo only (#4)", () => {
  test("no repo-health page, no Apply-Manifest, no WIP-report mode anywhere in the skill", () => {
    const all = [SKILL, EXEC, PAGE, read("deep-knowledge", "decision-schema.md")].join("\n");
    expect(all).not.toMatch(/Folgende Aktionen werden ausgeführt/);
    expect(all).not.toMatch(/Aufräumen starten|Löschbar-Gruppe|Untersuchen-Gruppe/);
    expect(all).not.toMatch(/report\.json|WIP-report mode|`WIP-Report aufräumen`/);
    expect(fs.existsSync(path.join(__dirname, "deep-knowledge", "wip-report.md"))).toBe(false);
    expect(read("triggers.de.txt")).not.toMatch(/wip[- ]report/i);
    expect(SKILL).not.toMatch(/WIP-Report aufräumen/);
    expect(section(SKILL, "## Rules", null)).toMatch(/No repo-health page, no Apply-Manifest/);
  });

  test("scope is the current repo, always", () => {
    expect(section(SKILL, "## Where this skill sits", "## Step 0")).toMatch(/\*\*Scope: the current repo, always\.\*\* There is no multi-repo mode/);
    expect(section(SKILL, "## Rules", null)).toMatch(/Current repo only/);
  });

  test("two classes: autonomous without asking, ambiguous on ONE concept page", () => {
    const s = section(SKILL, "## Where this skill sits", "## Step 0");
    expect(s).toMatch(/\*\*Autonomous\*\*.*landed in main.*removed without asking/);
    expect(s).toMatch(/\*\*Ambiguous\*\*.*idle session worktree with own commits.*ONE `auto-concept` page/);
    expect(s).toMatch(/an idle session worktree is not autonomous even with 0 commits ahead/);
    expect(s).toMatch(/Doubt is ambiguous, never autonomous/);
    expect(s).toMatch(/local branch whose remote is gone \*\*and\*\* whose content landed/);
    const p = section(SKILL, "## Step 8", "## Step 9");
    expect(p).toMatch(/\*\*8a — Remove the autonomous class\*\*.*No page, no manifest, no question/);
    expect(p).toMatch(/Zero ambiguous items → no page/);
    expect(p).toMatch(/Skill\("devops:auto-concept"\)\` once/);
    expect(p).toMatch(/Never a second page per group, never a repo-health dashboard, never an Apply-Manifest/);
  });

  test("the concept page holds the ambiguous items only, one decision each", () => {
    const s = flat(PAGE);
    expect(s).toMatch(/exists only for what needs a human/);
    expect(s).toMatch(/idle \*\*session worktree with own commits\*\*/);
    expect(s).toMatch(/ONE page per run/);
    expect(s).toMatch(/exactly one per topic/);
    expect(s).toMatch(/A `has-changes` worktree carries no decision control/);
  });
});

describe("auto-cleanup gate contract — the gate", () => {
  test("the gate section names the autonomous class and the refusal of everything else", () => {
    const s = section(SKILL, "## Deletion gate", "## Step 1");
    expect(s).toMatch(/judges \*\*every\*\* delete at the moment it runs, from the live repo/);
    expect(s).toMatch(/\*\*Passes without a question:\*\* the autonomous class/);
    expect(s).toMatch(/merge-base ancestry, `git cherry` without a unique commit, or a no-op merge/);
    expect(s).toMatch(/\*\*Refused:\*\* everything else/);
    expect(s).toMatch(/header `Dry-Run`, the question names every branch and worktree the page decided to delete by full name/);
    expect(s).toMatch(/multiSelect question, header `Unmerged`/);
  });

  test("a missing, errored or non-yes answer is a no — and the run ends there", () => {
    const s = section(SKILL, "## Deletion gate", "## Step 1");
    expect(s).toMatch(/\*\*No answer is a no\.\*\*/);
    for (const no of ["`Answer questions?`", "denied or unavailable tool", "`Abbrechen`", "`Behalten`", "free-text"]) expect(s, no).toContain(no);
    expect(s).toMatch(/nothing of the ambiguous class is deleted/);
    expect(s).toMatch(/Do not retry another way/);
    expect(s).toMatch(/`analysis` card/);
    const e = section(EXEC, "## Step 10a", "## Step 10b");
    expect(e).toMatch(/ONE `AskUserQuestion`: header `Dry-Run`/);
    expect(e).toMatch(/multiSelect question, header `Unmerged`/);
    expect(e).toMatch(/never brace- or prefix-compressed/);
    expect(e).toMatch(/No answer .* is `Abbrechen`: nothing of the ambiguous class ships or is deleted/);
    expect(e).toMatch(/NICHT rückgängig/);
  });

  test("the gate is a registered hook, not prose alone", () => {
    expect(section(SKILL, "## Deletion gate", "## Step 1")).toContain("`pre.cleanup.gate`");
    const cmds = (event) => (HOOKS.hooks[event] || []).flatMap((e) => e.hooks.map((h) => [e.matcher, h.command]));
    const pre = cmds("PreToolUse").find(([, c]) => c.includes("pre.cleanup.gate.js"));
    expect(pre && pre[0]).toBe("Bash|PowerShell");
    const post = cmds("PostToolUse").find(([, c]) => c.includes("post.cleanup.gate.js"));
    expect(post && post[0]).toBe("Skill|AskUserQuestion");
  });

  test("Step 10 loads execution.md before any ship, delete or removal", () => {
    const s = section(SKILL, "### Steps 10a–10c", "## Step 11");
    expect(s).toContain("deep-knowledge/execution.md");
    expect(s).toMatch(/no ship, no delete and no worktree removal before it is in context/);
    expect(s).toMatch(/nothing of the ambiguous class runs without the user's explicit decision/);
  });

  test("10c runs only after the relayed confirm and after the ship queue", () => {
    expect(section(EXEC, "## Step 10c", "## Safety Invariants")).toMatch(/Execute in order after the relayed Dry-Run-Confirm and after the ship queue \(10b\)/);
  });
});

describe("auto-cleanup gate contract — unmerged work and live sessions", () => {
  test("only provably landed branches are autonomous; doubt is ambiguous", () => {
    const s = section(SKILL, "## Step 3", "## Step 4");
    expect(s).toMatch(/`git merge-base --is-ancestor <branch> origin\/main` -> MERGED/);
    expect(s).toMatch(/`git cherry origin\/main <branch>` prints only `-` lines/);
    expect(s).toMatch(/evidence, not proof/);
    expect(s).toMatch(/Doubt never becomes autonomous/);
    expect(s).toMatch(/A gone remote alone is\s+no proof/);
  });

  test("an Aktive Session is never autonomous, dirty ones get no destructive control", () => {
    expect(section(SKILL, "## Step 2", "## Step 3")).toMatch(/\*\*An Aktive Session is never autonomous\*\* — not even clean, not even with 0 commits ahead/);
    const w = section(EXEC, "## Worktree Removal Safety", null);
    expect(w).toMatch(/must NOT render any DESTRUCTIVE action control/);
    expect(w).toMatch(/\*\*Never force-remove:\*\*/);
    expect(w).toMatch(/do NOT retry with `--force`/);
    expect(w).toMatch(/never\s+for a running session/);
  });

  test("live sessions are untouchable; membership by exact ref only", () => {
    const s = section(SKILL, "## SAFETY", "## Deletion gate");
    expect(s).toMatch(/\*\*HARD RULE — no exceptions:\*\*/);
    expect(s).toMatch(/UNTOUCHABLE/);
    expect(s).toMatch(/\*\*The protected set is a set of subjects, not a list of verbs\.\*\*/);
    expect(s).toContain("git worktree list --porcelain");
    expect(s).toContain("grep -qxF");
    expect(s).toMatch(/NEVER test membership by prefix or substring/);
  });

  test("the protected set is rebuilt immediately before every destructive action", () => {
    expect(section(SKILL, "## SAFETY", "## Deletion gate")).toMatch(/\*\*Re-check before every destructive action\.\*\*/);
    const s8 = section(SKILL, "## Step 8", "## Step 9");
    expect(s8).toMatch(/immediately before acting: rebuild the\s+protected set/);
    const s10 = section(SKILL, "## Step 10", "### Steps 10a–10c");
    expect(s10).toMatch(/\*\*Re-check worktree branches\*\*.*NEVER trust cached data for deletion/);
    expect(s10).toContain("scripts/repo-health-audit.js");
    expect(s10).toMatch(/`main`\/`master`\/`HEAD`\/`origin`\/default\s+branch are refused here by name/);
    expect(s10).toMatch(/tip is unchanged since the analysis/);
    const inv = section(EXEC, "## Safety Invariants", "## Worktree Removal Safety");
    expect(inv).toMatch(/\*\*Never delete a worktree-attached branch\*\* — even if checked by the user/);
    expect(inv).toMatch(/\*\*Re-validate before every delete\*\*/);
  });

  test("candidates come from the truth sources and pass the audit", () => {
    expect(section(SKILL, "## Step 2", "## Step 3")).toMatch(/NEVER from `git branch -a`, `refs\/remotes\/\*` or `%\(refname:short\)`/);
    expect(section(SKILL, "## Step 3", "## Step 4")).toMatch(/Never act on a candidate set that has not passed this audit/);
  });
});

describe("auto-cleanup gate contract — ship queue and card", () => {
  test("open PRs land only through the full /do-ship pipeline, never gh pr merge", () => {
    const q = section(EXEC, "## Step 10b", "## Step 10c");
    expect(q).toContain('Skill("devops:do-ship", args: "--cwd=<path> --keep --queued")');
    expect(q).toMatch(/Never `gh pr merge` directly/);
    expect(q).toContain(".claude/.ship-queue");
    expect(q).toMatch(/oldest PR first/);
    expect(section(SKILL, "### Steps 10a–10c", "## Step 11")).toMatch(/never `gh pr merge`/);
  });

  test("foreign PRs are never selectable", () => {
    expect(section(SKILL, "### 5b", "## Step 6")).toMatch(/a `fremd` PR is never selectable/);
    expect(flat(read("deep-knowledge", "open-prs.md"))).toMatch(/`fremd` \| not the viewer's PR \| .*\(never selectable\)/);
  });

  test("the completion card reports both halves and keeps the verbatim-last rule", () => {
    const c = section(SKILL, "## Step 11", "## Rules");
    expect(c).toMatch(/`ship-successful` \(needs `state\.pushed` \+ `state\.merged`; any doubt → `ready`\)/);
    for (const v of ["`ship-blocked`", "`ready`", "`analysis`", "`aborted`"]) expect(c, v).toContain(v);
    expect(c).toMatch(/\*\*The card reports both halves:\*\* every item removed autonomously \(name, kind, proof/);
    expect(c).toMatch(/what went to the concept page \(decided \/ still open\)/);
    expect(c).toMatch(/Output the markdown VERBATIM as the LAST thing/);
    expect(section(SKILL, "## Rules", null)).toMatch(/Everything removed autonomously is listed in the result/);
  });
});

describe("hook timeouts under load (#827)", () => {
  const find = (name) => Object.values(HOOKS.hooks).flat().flatMap((e) => e.hooks).find((h) => h.command.includes(name));
  test("cleanup gate keeps blocking on failure, with a load-sized budget", () => {
    const h = find("pre.cleanup.gate.js");
    expect(h.onFailure).toBe("block");
    expect(h.timeout).toBeGreaterThanOrEqual(30);
  });
  test("governor gate fails open on timeout", () => {
    const h = find("pre.governor.gate.js");
    expect(h.onFailure).not.toBe("block");
  });
});

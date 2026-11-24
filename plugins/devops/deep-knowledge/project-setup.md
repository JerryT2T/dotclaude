# Project Setup — Repo Hygiene

How to audit or initialize a project's repository structure: .gitignore, LICENSE, README, .editorconfig, .gitattributes, CLAUDE.md, AI tooling config. Former `setup-project` skill (retired 2026-09-24).

## When this applies

- **A new repository.** `ss.project.setup` notices a repo without a commit or
  without a root `.gitignore` and tells Claude to offer this setup once per
  clone. Run it only when the user agrees.
- **Promotion to a real project.** Throwaway or scratch work becomes a real
  project: Claude ran `git init` in a new folder this session, or the prompt
  asks to publish it, push it to GitHub, share it, or make it robust / shareable
  ("mach es robust und pack es in ein neues GitHub-Repo"). Run init mode in
  full in that same turn, without the offer and before the first push: Step 8b
  is the bundle. A repo the user created themselves keeps the offer above.
- **A prompt about it** — "set up this project", "init repo", "audit
  gitignore", "add license", "fix gitignore", "repo hygiene", "Projekt
  einrichten", "Repo aufsetzen", or the old `/setup-project`:
  `prompt.knowledge.dispatch` points here. Do only what was asked: "add
  license" is Step 4 alone, "fix gitignore" is Step 2 alone, not the whole
  audit.

## What runs on its own now

| Former step | Now |
|---|---|
| Claude/plugin ignore entries | One managed block in `.gitignore` — `# >>> claude (managed) >>>` … `# <<< claude (managed) <<<`, rendered from `hooks/lib/runtime-ignores.js`. `ss.project.setup` writes it into a repo without a commit and keeps an existing block current; an established repo moves over with `migrate` (Step 2). Until then its clones get the block in `.git/info/exclude` as a fallback (fresh clones and new worktrees are covered); `migrate` removes it and reports committed files the block ignores with the `git rm --cached` fix. |
| Working rules for sessions without the plugin | One managed `.claude/rules/devops.md` (`scripts/cloud-rules.js`, at most 40 lines: branch and commit conventions, never work on main, version and changelog belong to the ship step, the plain-text result format). Claude Code loads the root `.claude/rules/` in local sessions and in cloud threads of a Claude Project, so nothing migrates when one appears later. `ss.project.setup` writes it into a repo without a commit; an established repo gets it with its next ship (`ship_preflight` adds it to the ship's diff) — never as a separate step, never outside a ship. Switch: devops-config `cloud.rulesFile`. For the Claude Project itself (project instructions, Worktree switch, plugin): `auto-setup` § Claude Projects. |
| Project map | `ship_build` regenerates `.claude/project-map.md` on every ship; `pre.tokens.guard` regenerates it again right before injecting it into a session. |
| CLAUDE.md budget | `post.claude.budget` measures every Claude context file at write time. |
| README | `pre.readme.standards` + `readme-standards.md`. |

## Project overrides (former skill extension)

`{project}/.claude/skills/setup-project/SKILL.md` + `reference.md` (and the same
under `~/.claude/skills/setup-project/`) still apply — the dispatch pointer
names them when they exist. Merge: project > global > this document.

## Modes

- **audit** — check an existing repo and report issues (default when the repo
  has commits).
- **init** — create what is missing (repo without commits).
- **fix** — apply the audit's auto-fixable findings (only when the user asked
  for fixes).

## Step 1 — Analyze the project

1. `git status` — is this a git repo?
2. Detect the tech stack from manifest files (`package.json`, `Cargo.toml`,
   `pyproject.toml`, `go.mod`, `*.csproj`).
3. Read the existing `.gitignore`.
4. Check `LICENSE`, `README.md`, `.claude/`.
5. Detect a monorepo structure (`packages/`, `apps/`, `workspaces`).

## Step 2 — .gitignore

### Language/framework ignores

1. Detect the language/framework from Step 1.
2. Fetch from the gitignore.io API:
   `https://www.toptal.com/developers/gitignore/api/{stack}` (e.g. `node`,
   `python`, `rust`, `go`, `csharp`, `java`); for IDEs also `visualstudiocode`,
   `intellij`, `vim`, …
3. Merge the fetched rules with the sections below. API unavailable → basic
   rules from knowledge.

### Claude / AI tooling

See `claude-directory-structure.md` for the canonical `.claude/` layout. The
line to hold: **plugin _configuration_ is tracked, plugin _runtime state_ is
ignored.**

**VERSIONED (never ignore):** `CLAUDE.md`, `.claudeignore`,
`.claude/settings.json`, `.claude/skills/`, `.claude/commands/`,
`.claude/hooks/`, `.claude/agents/`, `.claude/agents.json`,
`.claude/deep-knowledge/`, `.claude/project-map.md`,
`.claude/launch.example.json`, `.claude/project-map.hints.json`,
`.claude/merge-decisions.json` (the merge-decision ledger ships with the PR),
`docs/concepts/`.

**LOCAL (the managed block):** `.claude/settings.local.json`,
`.claude/launch.json` (per machine — share a `.claude/launch.example.json`),
`.claude/worktrees/`, Claude Code's session state and every runtime file the
plugin writes (`token-config.json`, `concept-active.json`, `concepts/`,
`batch*`, `.ship-*`, `session-*`, `scheduled_tasks*`, `run-contract*`,
`runs/`, `cache/`, …). Never hand-write these lines — the block carries them:

```bash
node "{PLUGIN_ROOT}/scripts/claude-ignore.js" check   [repo]   # deviations, exit 1 on an issue
node "{PLUGIN_ROOT}/scripts/claude-ignore.js" migrate [repo]   # one current block; old Claude lines folded in,
                                                              # the plugin's lines removed from .git/info/exclude
```

`migrate` is idempotent and keeps project-specific lines, including deliberate
deviations (e.g. a repo that keeps `.claude/settings.json` local) — `check`
lists those as info. `ship_preflight` runs the same check when a ship touches
`.gitignore` or `.claude/` and puts the `migrate` command into its warnings;
it never blocks a ship.

**Secrets files → `.env.example`.** When the repo holds `.env` / `.env.*`,
`*.local.json` or `environment.local.ts`, offer the example files:
`node "{PLUGIN_ROOT}/scripts/claude-ignore.js" env-example [repo]` writes
`.env.example` with the key NAMES only (`KEY=`, never a value; an existing
example only gains missing keys) and `<name>.example.json` with every value
blanked; `environment.local.ts` is reported for a hand-made
`environment.example.ts`. The secrets files themselves stay ignored (below).

### Secrets (always)

```gitignore
# Secrets — NEVER commit
.env
.env.*
!.env.example
*.pem
*.key
*.p12
credentials.json
service-account*.json
```

### Section order

1. Dependencies → 2. Build output → 3. Runtime/cache → 4. Environment/secrets →
5. Test coverage → 6. AI tooling → 7. OS/editor → 8. Project-specific

### Audit severity

| Severity | Meaning | fix mode |
|----------|---------|----------|
| **CRITICAL** | Secrets could be committed | fix |
| **CRITICAL** | Shared AI config is being ignored | fix |
| **WARNING** | Required ignore rule missing | fix |
| **INFO** | Redundant rules, wrong order | report only |

### Build-time injected files

Files holding values injected at build or dev-start time (build hashes, build
IDs, timestamps) that change on every run should be gitignored — they cause
dirty worktrees and noisy diffs:

```gitignore
# Build-time injected (changes every dev-start / build)
**/build-id.*
**/build-hash.*
```

A tracked file whose only recent changes are such values
(`git log -5 --oneline -- <file>`) is a **WARNING**: recommend splitting the
volatile value into a separate gitignored file.

## Step 3 — CLAUDE.md audit

Check the project `CLAUDE.md` and the global `~/.claude/CLAUDE.md`: exists,
line count. Budgets, what to extract and where, the extraction procedure and
the scaffold for a missing file live in `content-conventions.md`. Report per
file `[OK|WARNING|CRITICAL|MISSING]`, the line count against its budget, and
whether it reads as an index or as documentation. Extract only in fix mode.

## Step 4 — LICENSE

Missing → ask with `AskUserQuestion` (MIT, Apache 2.0, GPL 3.0, ISC,
Proprietary). Generate it with the current year and the user name from git
config.

## Step 5 — README

Do not generate one here — report a missing README; when the user asks for
one, `readme-standards.md` applies.

## Step 6 — Project map

A repo without `.claude/project-map.md`:
`node {PLUGIN_ROOT}/scripts/gen-project-map.mjs {project-root}` — report file
and directory counts. It is regenerated on every ship afterwards.

Optional: `.claude/project-map.hints.json` — `{ "<dir path or name>": "<one
line>" }` — gives the map project-specific one-line directory descriptions
(deterministic, no LLM). A full path wins over a bare directory name, which wins
over the generic hints; the generator reads it on every run.

Typed language (TypeScript, Go, Rust, Java, typed Python): recommend the
official LSP plugin next to the map and the `scout` agent — references and
symbols without an index. One line in the report.

## Step 7 — Platform audit (Windows only)

Skip on other platforms.

1. `%APPDATA%\Claude\claude_desktop_config.json` missing → `[INFO] Desktop App
   not detected`.
2. Otherwise grep the last 200 lines of `%APPDATA%\Claude\logs\main.log` for
   `bypassPermissionsModeEnabled pref is off`.
3. Match → `[WARNING] Desktop App master switch off — every session runs as
   acceptEdits.` In fix mode, print how to enable **Settings → Bypass
   permissions mode** in the Desktop App — never patch the JSON
   (`claude-desktop-app-setup.md`). No match → `[OK]`.

## Step 8 — Additional files and extensions

- `.editorconfig`, `.gitattributes`, `CHANGELOG.md`: report status and
  recommend — never auto-create, except on promotion (Step 8b).
- `.claude/skills/`: list existing plugin skill extensions. One under a
  pre-restructure skill name (`ship/`, `fix/`, `run-backlog/`, … —
  `hooks/lib/skill-names.js`) still loads as a fallback: report it as "old
  name, still works — rename when convenient". Point to "extend skill"
  (auto-extend) for scaffolding one.

## Step 8b — Promotion bundle

Only on promotion (§ When this applies); do not ask first. Stack-agnostic: the
checklist names what must exist, the project's own stack decides how. Create
what is missing, keep what exists, report each item `[CREATED|OK|SKIPPED]`:

1. `.gitignore` managed block: `node {PLUGIN_ROOT}/scripts/claude-ignore.js migrate`, plus the stack ignores of Step 2.
2. `LICENSE` (Step 4; when the choice is open, the MIT default and say so in the report).
3. `README.md` per `readme-standards.md`.
4. `.editorconfig` and `.gitattributes` (line endings, binary files).
5. `CHANGELOG.md` with an `Unreleased` heading.
6. `VERSION` — SemVer, the single source of truth; the build stamps it into the artifact (assembly version, `package.json`, a constant: whatever the stack reads).
7. A build script that produces one packaged, downloadable artifact (zip) from a clean checkout.
8. CI: build + tests on push and pull request; a release workflow on a `v*` tag that attaches the artifact.
9. Project map (Step 6) and a project `CLAUDE.md` (Step 3: build, test, release commands).

The first push waits until the list is done. Without a remote the bundle still
runs; the CI files simply have nothing to run on yet.

## Step 9 — Report and card

```
## Repo Hygiene Report

### .gitignore
- [CRITICAL/WARNING/OK/INFO] ...

### LICENSE / README / Additional files
- [OK/WARNING/INFO] ...

### CLAUDE.md
- [OK/WARNING/CRITICAL/MISSING] ...

### Platform Audit
- [WARNING/OK/INFO] ...
```

Then `render_completion_card`: `ready` when files were written (pass `changes`
per file and `state`), `analysis` for an audit that wrote nothing.

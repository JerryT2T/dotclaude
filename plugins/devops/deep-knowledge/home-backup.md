# Home Backup (opt-in)

Back up the allowlisted part of `~/.claude` (settings, agents, own skills/commands, project memory, scripts, scheduled tasks and cloud-routine snapshots) to ONE target — opt-in, off by default, via `scripts/home-backup.js`:

| Target | For | Needs |
|---|---|---|
| `github` | a private GitHub repo (default) | `gh` logged in |
| `folder` | local disk, NAS share (`\\nas\backup\claude` or a mounted path), a **Google Drive for Desktop** folder (`--target drive` finds it) | the folder reachable at run time |
| `rclone` | Google Drive without the desktop client, OneDrive, Dropbox, S3, SFTP … | `rclone` with a configured remote (`rclone config` — interactive, the user does it) |
| `command` | anything else | the user's own shell command |

## What it does

A daily OS-scheduler job (Task Scheduler on Windows, crontab elsewhere; 12:30, catches up after a missed run on Windows) runs `home-backup.js run`. That is a plain node script: **zero model tokens**. It

1. stages only what the generated `~/.claude/.gitignore` allows (deny by default; credentials, `*.jsonl` transcripts, caches, plugin dirs, anything named `*token*`/`*secret*`/`*credential*`, `*.env` are never staged — enforced again in code, symlinks/junctions are skipped),
2. does nothing, silently, when nothing changed,
3. scans every staged file for secrets (keys, tokens, private keys, credential assignments) and private data (e-mail, phone, IBAN, credit card),
4. on **any** hit: unstages everything, commits and pushes nothing, writes `~/.claude/home-backup-report.txt` + `.json` (file, line, rule — never the value) and raises a desktop notification,
5. otherwise commits `backup: <ISO date>` as `claude-home-backup <noreply@localhost>` (never the user's e-mail) — a second change on the same day **amends** that day's commit —,
6. applies retention, then delivers to the target.

`~/.claude/.git` is the staging engine for every target; only `github` has a remote.

## Retention — newest state + one version per day

Kept: the newest state plus older versions, at most one per day, from `homeBackup.keepDays` (default **4**) different days — the latest full copy and the three previous days that had changes. Older versions are deleted automatically:

- `github`: the local history is rebuilt from the kept trees (`commit-tree`), older commits are expired and `gc --prune=now`ed, the push is `--force-with-lease`. The backup repo is a dedicated repo — never point it at a project repo.
- `folder`: one plain full copy per day in `<path>/YYYY-MM-DD/` (no `.git`), written to a temp folder and renamed; day folders beyond `keepDays` are deleted. Only `YYYY-MM-DD` folders are touched.
- `rclone`: `rclone sync <snapshot> <remote>/YYYY-MM-DD`, then `rclone purge` of the day folders beyond `keepDays`.
- `command`: the command gets the snapshot; retention is its job (it receives `HOME_BACKUP_KEEP_DAYS`).

Nothing changed → nothing is written and no version is spent: versions count days *with* a change, not calendar days.

Switches live in devops-config (global only): `homeBackup.enabled`, `target`, `repo` / `path` / `remote` / `command`, `keepDays`, `onRoutineChange`.

**Token cost:** the daily run and every routine-triggered run cost nothing. Only the one-time setup conversation costs tokens — well under 0.1 % of a Pro plan's weekly usage — plus, with `onRoutineChange ask`, one line once per session.

## Routine changes (hook `post.backup.routine`)

When a **recurring** routine is created or changed — a Desktop scheduled task with a `cronExpression`, or a cloud routine (`RemoteTrigger` create/update with a cron schedule) — the hook reacts. One-time tasks (`fireAt`, `run_once_at`), ad-hoc tasks and session crons (`CronCreate`) are skipped. A cloud routine lives only on the server, so its last known JSON is written to `~/.claude/routine-snapshots/cloud/<id>.json` first (the secret scan applies to it).

| `homeBackup.onRoutineChange` | Effect |
|---|---|
| `ask` (default) | one line of context, once per session: ask the user whether to back up now; yes → `home-backup.js run` |
| `auto` | `home-backup.js run` starts detached and silent — no interaction, no tokens |
| `off` | nothing; the daily run covers it |

User says "immer automatisch sichern" → `node "{PLUGIN_ROOT}/scripts/devops-config.js" set homeBackup.onRoutineChange auto --global`. Backup not set up yet → the hook offers the setup once per machine (marker `~/.claude/home-backup-routine-hint`) and never again. Many triggers in a row stay cheap: a run that finds another one working only leaves `home-backup.rerun` (the running one does one more pass), and the same day amends one commit.

## Setup — the user says so

Triggers: "richte Home-Backup ein", "Home-Backup einrichten", "set up home backup".

Ask for the target only if the user named none (one `AskUserQuestion`: GitHub repo (recommended) / Google Drive / NAS or folder / own command), then the one value it needs, only if unknown. GitHub default: `<gh user>/claude-home` (`gh api user -q .login`). In the same question set ask whether routine changes are backed up automatically (`--on-routine-change auto`) or after a question (`ask`, default).

```bash
node "{PLUGIN_ROOT}/scripts/home-backup.js" setup --repo <owner>/claude-home
node "{PLUGIN_ROOT}/scripts/home-backup.js" setup --target drive
node "{PLUGIN_ROOT}/scripts/home-backup.js" setup --target folder --path "//nas/backup/claude"
node "{PLUGIN_ROOT}/scripts/home-backup.js" setup --target rclone --remote gdrive:claude-home-backup
node "{PLUGIN_ROOT}/scripts/home-backup.js" setup --target command --command "<shell command>"
```

Optional on every form: `--keep-days <n>`, `--on-routine-change ask|auto|off`. Switching the target later is the same `setup` call with the new target.

`drive` looks for Google Drive for Desktop (`<letter>:\My Drive` / `Meine Ablage` on Windows, `~/Library/CloudStorage/GoogleDrive-*` on macOS, `~/Google Drive`) and uses `<that>/claude-home-backup`. None found → offer installing Drive for Desktop, or `rclone` (the user runs `rclone config` once — interactive OAuth; use the auto-guide skill). A NAS share must be reachable when the job runs; a failed write reports and notifies like a failed push, the next run retries.

**Own command** (`command`): runs through the shell inside the snapshot folder with `HOME_BACKUP_DIR` (full copy, no `.git`), `HOME_BACKUP_DAY` (`YYYY-MM-DD`), `HOME_BACKUP_KEEP_DAYS`, `HOME_BACKUP_COMMIT`. Exit ≠ 0 → report + notification, retried next run. Example (Windows): `robocopy "%HOME_BACKUP_DIR%" "E:\backup\%HOME_BACKUP_DAY%" /MIR & exit /b 0`.

For `github` it verifies `gh auth status`, creates the private repo if missing (refuses an existing public one) and refuses a `~/.claude` repo with a different origin. Every target: `git init` in `~/.claude`, `.gitignore`, the daily job, the switch, the first run; a `folder` inside `~/.claude` is refused. Safe to re-run: it fixes, never duplicates. Report the result in one or two lines: target, job time, first-run outcome (`pushed`, `delivered`, `unchanged` or `blocked`).

If the first run is `blocked` (common: project memory or `CLAUDE.md` often name an e-mail address), handle it as below — the user can preview everything with `scan` first. The notification repeats only when the set of findings changes, not every day. If `gh` is not logged in, tell the user to run `gh auth login` (interactive; do not attempt it).

The job runs the launcher `~/.claude/devops-jobs/home-backup.js` (not in the backup), which finds the newest installed devops plugin in `~/.claude/plugins/installed_plugins.json` at run time — plugin updates need no re-run. Only a moved node binary does (the job stores `process.execPath` of the setup).

## Other commands

| User says | Run |
|---|---|
| "Home-Backup aus" / "disable home backup" | `node "{PLUGIN_ROOT}/scripts/home-backup.js" disable` — removes the job, sets `homeBackup.enabled=false`; the target and `~/.claude/.git` stay (say so) |
| "Home-Backup Status" | `node "{PLUGIN_ROOT}/scripts/home-backup.js" status` — enabled, target + destination, keep days, routine mode, job registered, last run |
| "was würde gesichert / prüfen" | `node "{PLUGIN_ROOT}/scripts/home-backup.js" scan` — dry run of both scans, prints file:line rule |
| run now | `node "{PLUGIN_ROOT}/scripts/home-backup.js" run` |

## A scan hit (notification "Home-Backup blockiert")

Read `~/.claude/home-backup-report.txt`. Show the user each hit as file, line, rule — **never print the matched value**; if they want to see it they open the file themselves. The user decides, per hit:

- **Remove or redact** the data in the file (then the next run goes through), or
- **Allow** it deliberately in `~/.claude/.backupallow` (gitignore-like, one entry per line):
  - `path-glob` — skip a file for all rules
  - `path-glob:rule-id` — skip one rule in that file (e.g. `agents/contacts.md:email`)
  - `value-sha256:<hex>` — allow one exact value by its SHA-256, so the file never contains the value

The scans are pattern rules: they catch keys, tokens and structured personal data, not free-text private details (names, addresses in prose) — say so when the user relies on them. Never add an allow entry on your own and never to "get the backup through". Binary files and files over 2 MB show up as rule `unscannable` and block until allowlisted. Rule ids: `private-key`, `api-key-sk`, `github-token`, `slack-token`, `aws-access-key`, `google-api-key`, `jwt`, `credential-assignment`, `email`, `phone`, `iban`, `credit-card`, `unscannable`.

A failed push, folder write, rclone sync or command also writes the report (kind `error`) and notifies; the commit stays local and the next run delivers it. A successful run deletes a stale report.

## Restore (new machine)

1. Install Claude Code and `git` + `gh`; run it once if it created a fresh `~/.claude`, then move that directory away (e.g. `mv ~/.claude ~/.claude.fresh`).
2. `github`: `git clone https://github.com/<owner>/claude-home ~/.claude` (an older day: `git checkout <sha>` from `git log`). `folder` / `rclone`: copy the content of the wanted `YYYY-MM-DD` folder to `~/.claude`.
3. Reinstall plugins from the restored marketplaces: `claude plugin update` (restored settings list them; caches are not in the backup).
4. `/login` in Claude Code. Credentials are never in the backup.
5. Run `setup` with the same target again to re-register the daily job on the new machine. Cloud routines: recreate them from `routine-snapshots/cloud/*.json` (`RemoteTrigger create` with the stored `body`).

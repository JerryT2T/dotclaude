# Claude Project — text for the project instructions

The one source of the text a Claude Project's instructions (Project settings > Memory > Project instructions, up to 16,000 characters) carry so the coordinator works with the devops threads. Pointed to by `skills/auto-setup/SKILL.md` § Claude Projects and by `project-threads.md` § The project chat — change it here only. It is a request to the coordinator, not an enforced rule, and it is untested. Paste it as it is, or ask Claude in the project chat to add it.

This doc holds four fenced blocks. The first is the devops text. The other three say where threads run, one per value of the setting `threadLocation` (`hooks/lib/thread-location.js`, `scripts/thread-location.js`). Each of those starts with a title line `Where threads run (devops <value>, v1)`: that line is the marker, and a block is found by it. The value `cloud-first` has no block: a project that is set to it carries none, and an older block is removed from the project instructions.

## devops text

```
Threads on my computer end their work with a devops completion card: a reply
whose heading reads "✨✨✨ <title> ✨✨✨", followed by a line that starts with a
status icon (👉 🟩 🟥 🟦 ⏳). When you report such a thread's result in the
project chat, quote that status line and the numbered points under it as they
are. A thread title may start with "<status> ➜ <icon> ": keep that head
when you link or rename the thread.

One issue = one thread. When I name a GitHub issue to work on, start one thread
for it and name the issue (number and title) in the thread's task, the first
message. Do not put the issue number into the thread title: a title has little
room and 30 issues can be open at once. Before you start a thread for an issue,
check that no other thread already works on it.
```

## Where threads run: local-first

```
Where threads run (devops local-first, v1)
1. Start every thread on my computer: a local thread
   in the folder of the repository the task belongs
   to. This holds whether I write from the computer,
   from my phone or from claude.ai.
2. Start a cloud thread only when my computer cannot
   be reached (off, asleep, app closed). Then say so
   in the first line of your reply:
   "Cloud thread: computer not reachable."
3. A local start that fails for another reason
   (folder not approved, Claude out of date, trusted
   devices): tell me the reason. Do not switch to
   the cloud.
4. A local thread that loses contact: tell me and
   wait. Do not restart its task in the cloud. The
   unpushed work is on my computer.
5. When I say "in the cloud" for a task or for this
   conversation, that runs in the cloud. This is a
   temporary exception and changes no setting.
```

## Where threads run: local-only

```
Where threads run (devops local-only, v1)
1. Start every thread on my computer: a local thread
   in the folder of the repository the task belongs
   to. This holds whether I write from the computer,
   from my phone or from claude.ai.
2. Never start a cloud thread by yourself. When my
   computer cannot be reached (off, asleep, app
   closed), start nothing in the cloud. Tell me and
   wait.
3. A local start that fails for another reason
   (folder not approved, Claude out of date, trusted
   devices): tell me the reason. Do not switch to
   the cloud.
4. A local thread that loses contact: tell me and
   wait. Do not restart its task in the cloud. The
   unpushed work is on my computer.
5. When I say "in the cloud" for a task or for this
   conversation, that runs in the cloud. This is a
   temporary exception and changes no setting.
```

## Where threads run: ask

```
Where threads run (devops ask, v1)
1. Before you start a thread, ask me in one line:
   on my computer or in the cloud. Start nothing
   before I answer.
2. A thread you start in the cloud says so in its
   first line: "Cloud thread."
3. A local thread that loses contact: tell me and
   wait. Do not restart its task in the cloud. The
   unpushed work is on my computer.
```

## Around the text (what auto-setup also says)

- **Where the settings are.** A project has no Plugins tab. Its settings tabs are General, Memory, Environment, Usage and Advanced. The per-project setting for local threads is Environment > "Your computer": Off, On, or On with worktrees. Below it are the folders Claude may use without asking, one of them marked as the default. Add the repo folders there.
- **Worktree.** The choice is the project-wide "Your computer" value: with "On, with worktrees", every new thread in a git folder gets its own checkout and branch, and two threads cannot overwrite each other. With plain "On", threads work directly in the folders and share one checkout. A folder that is no git repository (such as a parent folder holding several projects) has no worktree.
- **Plugin.** A cloud thread loads the repo's `CLAUDE.md` and rules, its skills and agents (with exceptions), but runs no repo hooks and loads no `.mcp.json` servers. Plugins are account-wide: enable devops once under claude.ai > Plugins, not per project. Whether a plugin's hooks run in a cloud thread is not documented. The working rules a thread needs without the plugin come from the repo's `.claude/rules/devops.md` (`scripts/cloud-rules.js`), which loads either way.

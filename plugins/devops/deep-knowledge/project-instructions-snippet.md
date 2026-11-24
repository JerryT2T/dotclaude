# Claude Project — text for the project instructions

The one source of the text a Claude Project's instructions (Project settings > Memory > Project instructions, up to 16,000 characters) carry so the coordinator works with the devops threads. Pointed to by `skills/auto-setup/SKILL.md` § Claude Projects and by `project-threads.md` § The project chat — change it here only. It is a request to the coordinator, not an enforced rule. Nobody has to paste it: the first local thread of a project whose instructions lack the current text sends the coordinator an update request with the exact blocks (`scripts/thread-location.js request`, `prompt.thread.notices` § 3), and the coordinator writes them into the project instructions itself. Pasting by hand is the fallback when the coordinator cannot.

This doc holds four fenced blocks. The first is the devops text; its title line `devops text (v<N>)` is its marker (`TEXT_VERSION` in `hooks/lib/thread-location.js`: raise it with every change of the text, so threads ask the coordinator to update older copies). The other three say where threads run, one per value of the setting `threadLocation` (`hooks/lib/thread-location.js`, `scripts/thread-location.js`). Each of those starts with a title line `Where threads run (devops <value>, v1)`: that line is the marker, and a block is found by it. The value `cloud-first` has no block: a project that is set to it carries none, and an older block is removed from the project instructions.

## devops text

```
devops text (v3)
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

Pass my answers to a thread by attaching my message by its id, never retold:
only an attached message counts as my approval there. Never ask me to repeat
an answer in the thread.

"devops learn" here is a task, not a note: start a thread in the repo it is
about (the devops plugin's repo for the plugin or how threads work), attach
my message and tell it to run /do-learn.

Threads of this project are resolved, not archived. When I say "archive" or
"archivieren" about a thread, resolve it. Say "resolved" ("gelöst"), and
resolve only when nobody owes a next step.
```

## Where threads run: local-first

The default. Its first paragraph is the "work locally first" text of v0.403, word for word: no device name and no path, so one copy fits every project and every machine.

```
Where threads run (devops local-first, v1)
Work locally first. Start every thread with "Work locally" (Remote Control on
my computer), not in the cloud, whenever one of my devices is online and has a
connected folder that holds this project's repository: pick the folder whose
git checkout belongs to this project's repo, the repo's own folder before a
parent folder that holds several projects. Look it up each time (devices and
folders), never from a saved path. Start a cloud thread only when no such
device is online, or when I ask for the cloud, and say so in one line in the
project chat. A cloud thread that notices it should have run locally tells you
so: start the next threads of this project locally.
- A local start that fails for another reason (folder not approved, Claude out
  of date, trusted devices): tell me the reason. Do not switch to the cloud.
- A local thread that loses contact: tell me and wait. Do not restart its task
  in the cloud. The unpushed work is on my computer.
- When I say "in the cloud" for a task or for this conversation, that runs in
  the cloud. This is a temporary exception and changes no setting.
```

## Where threads run: local-only

```
Where threads run (devops local-only, v1)
Work locally only. Start every thread with "Work locally" (Remote Control on
my computer) on a device of mine that is online and has a connected folder
that holds this project's repository: pick the folder whose git checkout
belongs to this project's repo, the repo's own folder before a parent folder
that holds several projects. Look it up each time (devices and folders), never
from a saved path. Never start a cloud thread by yourself. When no such device
is online, start nothing in the cloud. Tell me and wait.
- A local start that fails for another reason (folder not approved, Claude out
  of date, trusted devices): tell me the reason. Do not switch to the cloud.
- A local thread that loses contact: tell me and wait. Do not restart its task
  in the cloud. The unpushed work is on my computer.
- When I say "in the cloud" for a task or for this conversation, that runs in
  the cloud. This is a temporary exception and changes no setting.
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

## Why "work locally first" lives here

The coordinator alone decides where a thread starts, and it loads no plugin: these instructions are the only place that reaches that decision. The text names no device and no path, so one copy fits every project and every machine; the coordinator matches the project's repository against the folders of the devices that are online. It is a block of its own, not part of the devops text, because the person can set another value per project (`threadLocation`): the block for the value in effect is the one that goes into the instructions. The two halves the plugin covers itself: a cloud thread of a devops repo says it runs in the cloud and asks the coordinator to start the next threads locally (managed `.claude/rules/devops.md`, `scripts/cloud-rules.js` § Where a thread runs, loaded with or without the plugin), and a local thread's first-wake setup hint and its once-per-project block check point to this text (`prompt.thread.notices`).

## Around the text (what auto-setup also says)

- **Where the settings are.** A project has no Plugins tab. Its settings tabs are General, Memory, Environment, Usage and Advanced. The per-project setting for local threads is Environment > "Your computer": Off, On, or On with worktrees. Below it are the folders Claude may use without asking, one of them marked as the default. Add the repo folders there.
- **Worktree.** The choice is the project-wide "Your computer" value: with "On, with worktrees", every new thread in a git folder gets its own checkout and branch, and two threads cannot overwrite each other. With plain "On", threads work directly in the folders and share one checkout. A folder that is no git repository (such as a parent folder holding several projects) has no worktree.
- **Plugin.** A cloud thread loads the repo's `CLAUDE.md` and rules, its skills and agents (with exceptions), but runs no repo hooks and loads no `.mcp.json` servers. Plugins are account-wide: enable devops once under claude.ai > Plugins, not per project. Whether a plugin's hooks run in a cloud thread is not documented. The working rules a thread needs without the plugin come from the repo's `.claude/rules/devops.md` (`scripts/cloud-rules.js`), which loads either way.

# Claude Project — text for the project instructions

The one source of the text a Claude Project's instructions (Project settings > Memory > Project instructions, up to 16,000 characters) carry so the coordinator works with the devops threads. Pointed to by `skills/auto-setup/SKILL.md` § Claude Projects and by `project-threads.md` § The project chat — change it here only. It is a request to the coordinator, not an enforced rule, and it is untested. Paste it as it is, or ask Claude in the project chat to add it.

```
Work locally first. Start every thread with "Work locally" (Remote Control on
my computer), not in the cloud, whenever one of my devices is online and has a
connected folder that holds this project's repository: pick the folder whose
git checkout belongs to this project's repo, the repo's own folder before a
parent folder that holds several projects. Look it up each time (devices and
folders), never from a saved path. Start a cloud thread only when no such
device is online, or when I ask for the cloud, and say so in one line in the
project chat. A cloud thread that notices it should have run locally tells you
so: start the next threads of this project locally.

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

## Why "work locally first" lives here

The coordinator alone decides where a thread starts, and it loads no plugin: these instructions are the only place that reaches that decision. The text names no device and no path, so one copy fits every project and every machine; the coordinator matches the project's repository against the folders of the devices that are online. The two halves the plugin enforces itself: a cloud thread of a devops repo says it runs in the cloud and asks the coordinator to start the next threads locally (managed `.claude/rules/devops.md`, `scripts/cloud-rules.js` § Where a thread runs, loaded with or without the plugin), and a local thread's first-wake setup hint points to this text (`prompt.thread.notices`).

## Around the text (what auto-setup also says)

- **Worktree, per folder.** A local folder that is a git repository has a **Worktree** switch on its card in the project (the option does not exist for a folder that is no repo, such as a parent folder holding several projects). Switch it on for a folder where more than one thread may work: every thread then gets its own checkout and branch, and two threads cannot overwrite each other. With it off, threads in one folder share one checkout.
- **Plugin.** A cloud thread loads no repo skills, hooks or MCP servers. To give it the devops plugin, add it under Project settings > Plugins. Whether a plugin's hooks run there is not documented; the working rules a thread needs without the plugin come from the repo's `.claude/rules/devops.md` (`scripts/cloud-rules.js`), which loads either way.

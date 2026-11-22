# Claude Project — text for the project instructions

The one source of the text a Claude Project's instructions (Project settings > Memory > Project instructions, up to 16,000 characters) carry so the coordinator works with the devops threads. Pointed to by `skills/auto-setup/SKILL.md` § Claude Projects and by `project-threads.md` § The project chat — change it here only. It is a request to the coordinator, not an enforced rule, and it is untested. Paste it as it is, or ask Claude in the project chat to add it.

```
Threads on my computer end their work with a devops completion card: a reply
whose heading reads "✨✨✨ <title> ✨✨✨", followed by a line that starts with a
status icon (👉 🟩 🟥 🟦 ⏳). When you report such a thread's result in the
project chat, quote that status line and the numbered points under it as they
are. A thread title may start with "<status> ➜ <icon> <Word> ┃ ": keep that head
when you link or rename the thread.

One issue = one thread. When I name a GitHub issue to work on, start one thread
for it and name the issue (number and title) in the thread's task, the first
message. Do not put the issue number into the thread title: a title has little
room and 30 issues can be open at once. Before you start a thread for an issue,
check that no other thread already works on it.
```

## Around the text (what auto-setup also says)

- **Worktree, per folder.** A local folder that is a git repository has a **Worktree** switch on its card in the project (the option does not exist for a folder that is no repo, such as a parent folder holding several projects). Switch it on for a folder where more than one thread may work: every thread then gets its own checkout and branch, and two threads cannot overwrite each other. With it off, threads in one folder share one checkout.
- **Plugin.** A cloud thread loads no repo skills, hooks or MCP servers. To give it the devops plugin, add it under Project settings > Plugins. Whether a plugin's hooks run there is not documented; the working rules a thread needs without the plugin come from the repo's `.claude/rules/devops.md` (`scripts/cloud-rules.js`), which loads either way.

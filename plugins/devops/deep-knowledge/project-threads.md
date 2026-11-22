# Claude Projects Threads

How the devops title scheme and the completion card behave in a thread of a Claude Project (claude.ai/code, Desktop Code tab → Projects). Feature `project-threads` (alpha). Code: `hooks/lib/project-thread.js` (detection, the thread's title), `hooks/lib/title-plan.js` (`threadTitlePlan`), `mcp-server/lib/mode-state.js` (`threadTitleInstruction`), `mcp-server/index.js` (`THREAD_RELAY_INSTRUCTION`). Title scheme: `session-title-scheme.md`.

## Where the plugin runs

A project has one coordinator (the project chat) and threads that do the work. Official doc: https://code.claude.com/docs/en/claude-projects.

| Place | Runs where | devops loaded? |
|---|---|---|
| Thread on this computer ("Work locally") | a Claude Code session here, started over Remote Control | yes: hooks, MCP server, skills and settings of this machine (measured 2026-11-21) |
| Cloud thread | a cloud container | only when the plugin is added under Project settings > Plugins; repo hooks do not run there. Whether a plugin's hooks run is not documented and not tested |
| Coordinator (project chat) | a cloud session | no. It gets the project instructions (Project settings > Memory, 16,000 characters) and nothing from this machine |

So everything below is about threads on this computer. The project chat itself has no title of its own (it carries the project's name) and no plugin to render a card; what it shows of a thread is the thread's title and the coordinator's summary of the thread's replies.

## What differs in a thread

Read off a real thread transcript:

- The person sees only what the `mcp__hearthbot__*` tools post (`post_message`, `post_widget`, `update_progress_checklist`). Plain text, `mcp__visualize__show_widget` and the session's sidebar title reach no one.
- The title the person sees is the thread's, set with `mcp__hearthbot__rename_thread {title}`.
- Every prompt is a `<wake …><project id="chan_…" type="project">` envelope around the person's message. A note from the coordinator arrives as `<relay from="coordinator" …>`.
- Every turn ends with a hearthbot call. A Stop hook that blocked did not continue the turn (one observed sample): its reason would only show up as a stale reminder on the next wake.

Detection: a wake prompt or any `mcp__hearthbot__*` tool call marks the session (`dotclaude-devops-project-thread-<session>` in the tmp dir); the Stop hook and the card renderer read that marker, else the transcript's own `projectsUserTurn` entry.

## Behaviour

Every channel (a thread without the feature is `quiet`):

- `prompt.flow.title-work` gives no Desktop title instruction.
- `post.flow.completion` gives no card contract.
- `stop.flow.guard` never blocks; it clears its per-turn flags and releases the title token.

With the feature (`on`):

| Moment | What happens |
|---|---|
| A wake starts work | `prompt.flow.title-work` names one `rename_thread` call: `⏳ ➜ 🤖 Solo ┃ <thread title>` (a ship order in the person's words: `⏳ ➜ 🚀 Shipping ┃`). First wake: the model prefixes the title it sees; later the hook knows the title from the transcript's last `rename_thread` and names it exactly |
| First tool call | the card contract plus one line: the card is the result reply |
| Checklist with every step done | one "card now" line |
| `render_completion_card` (tool or `--render-card`) | the full markdown card, to be posted verbatim as the text of ONE `post_message`, plus the exact `rename_thread` to the outcome head (`👉 ➜ 📦 Ready ┃ …`). No widget, no `wrap_up`, no archive |
| The card is posted | "turn over", only `set_thread_resolved` may follow |
| A reply without the card while the title says ⏳ | once per prompt: the exact rename that takes the head off, for a turn that ends there |

Rules that differ from a Desktop session:

- **The topic is the thread's own title, never clamped.** The coordinator names a thread in the person's words and the person finds it by that name; the 20-character topic and the 42-character budget are sidebar rules.
- **No `sessionTitle` from the hook, no `set_session_title`.** That title names the local session, which the project does not show.
- **No question title, no interrupted title, no title-mismatch check.** A thread asks with a reply, and no Stop hook can correct a title there. The stale hourglass is handled by the reply hint above.
- A coordinator note is a machine turn: it keeps every known head.

## The project chat

The coordinator shows a thread by its title, so the head a thread puts on its title appears in the project chat's thread list and thread cards without anything further. The coordinator's own summaries are its words. To have it carry a thread's card over, add this to the project instructions (Project settings > Memory > Project instructions, or ask Claude in the project chat to add it). It is a request to the coordinator, not an enforced rule, and it is untested:

```
Threads on my computer end their work with a devops completion card: a reply
whose heading reads "✨✨✨ <title> ✨✨✨", followed by a line that starts with a
status icon (👉 🟩 🟥 🟦 ⏳). When you report such a thread's result in the
project chat, quote that status line and the numbered points under it as they
are. A thread title may start with "<status> ➜ <icon> <Word> ┃ ": keep that head
when you link or rename the thread.
```

## Not covered

- Batch mode, concept pages, the approval-wait and ship-skill title steps still name `set_session_title` in a thread. They rename the local session only, which is harmless and invisible.
- `post_widget` (the thread's widget tool) is not used: a widget on its own does not reach the project chat, the posted text does.
- The project chat: a card or a devops title there needs the coordinator to cooperate, which only project instructions can ask for.

## Testing

`hooks/lib/project-thread.test.js`, `hooks/lib/title-plan.thread.test.js`, and `hooks/lib/project-thread.e2e.test.js` (one thread turn through the real hook scripts and the offline renderer: feature on, feature off, and an unchanged Desktop session). Live: start a thread with "Work locally" in a project, give it a task with a file change, and check the thread list (head on the title while it works, outcome head after) and the thread's last reply (the card).

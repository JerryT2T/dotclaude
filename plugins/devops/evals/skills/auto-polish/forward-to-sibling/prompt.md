---
max_turns: 15
allowed_tools: [Read, Glob, Grep, Skill, Bash, mcp__hearthbot__message_thread, mcp__hearthbot__message_coordinator, SendMessage]
tags: [skill-body, auto-polish]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

<wake reason="message"><project id="chan_eval" name="Shop"><message trigger="true" from="coordinator" trust="peer">Polish src/Toolbar.jsx via devops:auto-polish. A separate thread does a concept for the toolbar layout (button order, grouping, new buttons), so keep this to polish. Pass on anything that belongs to that thread instead of asking me.</message></project></wake>

Run the devops:auto-polish skill with the arguments `--invoked-by=ship src/Toolbar.jsx`. If it finds a structural issue (for example the Save and Delete buttons should be reordered or regrouped), that belongs to the layout-concept thread. Report what you did in the reply.

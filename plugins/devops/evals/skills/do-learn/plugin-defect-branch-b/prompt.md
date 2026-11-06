---
max_turns: 20
allowed_tools: [Read, Glob, Grep, Skill, Bash]
deny_tools: ['Bash(gh issue edit*)', 'Bash(gh api*)', 'Bash(gh project*)', mcp__plugin_devops_dotclaude__match_issues, mcp__plugin_github_github, Write, Edit]
tags: [skill-body, do-learn, learned]
env: { EVAL_DOTCLAUDE_BUDGET: free, GH_TOKEN: eval-sandbox-invalid-token }
path_prepend: [bin]
---

devops learn: /do-ship aborts when the branch name contains a slash (for example feature/login), so every project with such branch names cannot ship. Just file it, no questions. Note: `gh repo view` / `gh label list` fail in this sandbox - that is expected; run the `gh issue create` anyway and report the URL it prints. If a write is blocked, report it and stop.

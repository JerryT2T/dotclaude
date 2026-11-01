# auto-agents — permission audit (Step 2.3)

Read on demand by `SKILL.md` Step 2.3, before spawning more than one agent
(parallel tier and full ceremony). Inline and single-agent runs skip it.

Before spawning more than one agent, scan recent sessions for MCP tools that
were used but are NOT covered by the current `~/.claude/settings.json`
allow-list. Prevents permission prompts from interrupting wave execution —
especially painful with parallel agents.

```bash
node "{PLUGIN_ROOT}/scripts/permission-audit.js" --days=7 --quiet
```

Parse the JSON `suggestions` array:

- **Empty** → skip silently.
- **Non-empty** → present ALL suggestions in **one** `AskUserQuestion`
  multi-select. Never auto-apply — every rule needs user confirmation,
  to prevent log-forgery from seeding the allow-list. Each option =
  one suggested rule, labeled with its risk marker:
  - 🟢 low: user-installed plugin/runtime MCPs (`mcp__plugin_*`, `mcp__ccd_*`)
  - 🟡 medium: third-party / unknown MCPs — include the rationale text

  Pre-recommend the 🟢 ones in the description. Header: "Permissions",
  question: "Diese MCP-Tools wurden zuletzt genutzt aber sind nicht erlaubt.
  Welche zur Allow-Liste hinzufügen?"

  Apply the user's selection via Bash (NOT the Edit tool — settings.json is
  tamper-protected; the script writes directly via Node `fs.writeFileSync`):

  ```bash
  node "{PLUGIN_ROOT}/scripts/permission-audit.js" --apply="<rule1>,<rule2>" --quiet
  ```

  The script re-validates each `--apply` rule against its own freshly-computed
  suggestions and rejects anything not in the list (defense in depth).

Under `--mode=background` with a `--from`, do not ask: the user may be away
(`do-run` "Autonom"), and a pending prompt would stall the run. List the
suggestions in the result's `open` field (Step 7) instead. The audit is read-only on no findings — never blocks the flow when
there's nothing to fix.

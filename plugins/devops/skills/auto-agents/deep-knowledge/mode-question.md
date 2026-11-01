# auto-agents — execution-mode question (Step 4)

Read on demand by `SKILL.md` Step 4: only a direct invocation (no `--from`,
no `--mode`) in the full-ceremony tier asks it, after the plan is confirmed.

Asked only where `SKILL.md` Step 4 says so, via `AskUserQuestion`, in the
version matching the active `[ui-locale: ...]`:

**en:**
```
question: "How should the agents work?"
header: "Mode"
options:
  - label: "Background (recommended)"
    description: "Agents run autonomously. Single final report at the end."
  - label: "Interactive"
    description: "You are involved on design/concept decisions — agents return their forks, I ask you between waves (short trade-offs as a question, a richer comparison as an open decision). Expect ≥1 checkpoint per wave."
```

**de:**
```
question: "Wie sollen die Agents arbeiten?"
header: "Modus"
options:
  - label: "Hintergrund (Recommended)"
    description: "Agents arbeiten autonom. Am Ende ein Gesamtbericht."
  - label: "Interaktiv"
    description: "Du entscheidest bei Design-/Konzeptfragen mit — Agents geben ihre Gabelungen zurück, ich frage dich zwischen den Waves (kurze Trade-offs als Frage, ein größerer Vergleich als offene Entscheidung). Rechne mit ≥1 Checkpoint pro Wave."
```

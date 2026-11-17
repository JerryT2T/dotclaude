---
max_turns: 60
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill, Bash]
deny_tools: ['Bash(python *)', 'Bash(python3 *)', 'Bash(py *)', 'Bash(nohup *)', 'Bash(setsid *)', 'Bash(*concept-server*)', 'Bash(*concept-port-registry*)', 'Bash(*concept-watch*)', 'Bash(*concept-tick*)', 'Bash(*concept-open*)', 'Bash(curl *)', 'Bash(start *)', 'Bash(cmd *)', 'Bash(powershell *)', 'Bash(pwsh *)', 'Bash(explorer *)', 'Bash(*msedge*)', 'Bash(kill *)', 'Bash(taskkill *)', 'Bash(git push*)', 'Bash(git * push*)', 'Bash(gh *)', CronCreate, CronDelete, mcp__claude-in-chrome, mcp__Claude_Browser, mcp__Claude_Preview, mcp__plugin_playwright_playwright, mcp__computer-use, mcp__ccd_session_mgmt]
tags: [skill-body, auto-concept, stages]
env: { EVAL_DOTCLAUDE_BUDGET: free }
---

Invoke the devops:auto-concept skill with exactly these args (a do-batch hand-off) and build round 1 of the concept page:

--from=do-batch
Notizen: .claude/batch/archive/20261116-2200-notes.md
Abdeckung: #1 Galerie-Karten größer → übernommen · #2 Galerie Filterleiste → übernommen · #3 Holo-Dossier Layout neu → übernommen · #4 Dossier Animation beim Öffnen → übernommen · #5 Login mit Hintergrundvideo → übernommen · #6 Login Fehlermeldungen → übernommen · #7 Admin Upload Drag & Drop → übernommen · #8 Admin Upload Fortschritt → übernommen
Plan: Vier Flächen überarbeiten: Galerie (Karten, Filter), Holo-Dossier (Layout, Öffnen-Animation), Login (Hintergrund, Fehler), Admin-Upload (Drag & Drop, Fortschritt).
Bündel:
  B1 Galerie — Notizen #1, #2; besitzt src/gallery/*; Schnittstellen: —; nach: —; Prüfung: Browser
     Befunde: —
  B2 Holo-Dossier — Notizen #3, #4; besitzt src/dossier/*; Schnittstellen: —; nach: —; Prüfung: Browser
     Befunde: —
  B3 Login — Notizen #5, #6; besitzt src/login/*; Schnittstellen: —; nach: —; Prüfung: Browser
     Befunde: —
  B4 Admin-Upload — Notizen #7, #8; besitzt src/admin/*; Schnittstellen: —; nach: —; Prüfung: Browser
     Befunde: —
Konflikte / nicht machbar: —
Offene Entscheidungen: B1 Kartengröße und Filter-Stil offen · B2 Dossier-Layout und Animationsart offen · B3 Hintergrund-Stil offen · B4 Upload-Interaktion offen
Flächen: getrennt: B1 | B2 | B3 | B4

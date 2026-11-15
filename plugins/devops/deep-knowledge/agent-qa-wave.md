# QA Wave — Testing Protocol

Testing rules for the QA agent (Wave 3) of an agent run: what to run, how to verify UI in a browser, and how untestable work reaches the completion card (split out of `agent-orchestration.md` § QA Wave — Testing Protocol).

The QA agent (Wave 3) MUST follow these testing rules. Include ALL applicable
instructions in the QA agent prompt.

**1. Unit/Integration Tests**
Run relevant test suites via Bash (`npm test`, `npm run test:unit`, etc.).
Target specific test files for changed modules — see `deep-knowledge/test-strategy.md`.

**2. Build Verification**
Run the build command (`npm run build` or equivalent) to verify compilation succeeds.

**3. Browser-Based Visual Verification — MANDATORY for Web Tech**

See `deep-knowledge/test-strategy.md` § Web Tech → Always Browser-Test.
If any web-tech gate signal is true (HTML/CSS/JS framework files changed, UI dep
in `package.json`, static `index.html` present) → browser verification is
**required**, mocks are expected. No "browser not needed" exit for web tech.

- **Orchestrator** (before spawning QA): probe the browser tool for the use case per
  `deep-knowledge/browser-tool-strategy.md` (pane for localhost, Chrome MCP in
  Edge for logged-in sites, Playwright last).
  Set `$BROWSER_TOOL` to the first responder. If the pane is selected, start a
  server via `preview_start` and capture `$SERVER_ID`. If no dev server exists,
  fall back to opening static HTML via `file:///`.
- **QA agent** uses whichever tool the orchestrator selected:
  - Pane / Chrome MCP: `computer` (screenshot), `read_page`
  - Playwright: `browser_take_screenshot`, `browser_snapshot`
- All are DOM/protocol-based — no desktop takeover, no user interruption.
- Skip only for genuinely non-UI changes (pure config, scripts, docs, backend-only).

**4. Electron / Native UI — Dev-Browser + User-Final-Test**

See `deep-knowledge/test-strategy.md` § Electron / Native UI.
Renderer-level verification happens via rule 3 (mount renderer HTML in Edge, mock
main-process calls). Final integration test on the packaged app requires
`computer-use` — **only** if the user chose "Desktop übernehmen", otherwise QA
flags the completion card with `🔬 TESTE bitte noch:` plus concrete
steps. Never claim an Electron/Tauri change "verified" based on dev-browser mocks
alone.

**5. Third-Party Integrations — Mock-First + User-Final-Test**

See `deep-knowledge/test-strategy.md` § Third-Party Integrations.
Any code calling external services (OAuth, payments, social APIs, webhooks,
analytics, LLM APIs) follows two mandatory steps:
1. Automated mock test (MSW/nock/fixtures) — verifies integration shape.
2. Real test — flagged in completion card as
   `🔬 TESTE bitte noch:` + bullet with `— nach Deployment` suffix.

The mock step is **not** a substitute for step 2. Both are required.

**6. Computer-Use Restriction — HARD RULE**

**NEVER** use computer-use (`mcp__computer-use__*`) for testing unless the user
**explicitly** requested desktop takeover (e.g., "Desktop übernehmen", "use
computer-use", "nimm den Desktop", "desktop testing") — with the single exception
of the packaged-Electron final test (rule 4) when desktop mode is active.

Browser-based testing via the waterfall tools is always allowed and runs in the
background. Computer-use is the **only** testing method that requires explicit
user opt-in.

**QA Agent Prompt — Append These Instructions:**
```
Test the changes (follow deep-knowledge/test-strategy.md):
1. Run unit/integration tests for changed modules
2. Run the build to verify it succeeds
3. [If web tech] Use {$BROWSER_TOOL} to verify changed views — snapshots preferred,
   screenshots for layout/styling. Mocks for missing backends are expected.
4. [If 3rd-party integration] Mock the external calls in automated tests, THEN
   add a userFinalTest item with afterDeployment: true and a concrete action.
5. [If packaged Electron/Tauri without desktop takeover] Renderer tests via step 3;
   add a userFinalTest item (afterDeployment: false) with a concrete action.
6. Do NOT use computer-use unless desktop takeover is explicitly active.
7. Report results as:
   - tests: [{ method, result: "pass" | "fail — reason" }]
   - userFinalTest: [{ action, afterDeployment? }]  // forwarded to render_completion_card
```

**Orchestrator handoff:** When the QA agent returns `userFinalTest` items, pass
them through to `render_completion_card` as the `userFinalTest` input so the
completion card displays the unified `🔬 TESTE bitte noch:` block.
Never drop this field — it's the only signal the user sees about work that
automation couldn't cover.

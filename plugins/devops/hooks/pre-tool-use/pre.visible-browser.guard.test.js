// Holds the patterns the guard refuses: DEVOPS_ALLOW_VISIBLE_BROWSER
import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { main } = require("./pre.visible-browser.guard.js");
const dispatch = require("../dispatch/dispatch.js");

const HOOK = fileURLToPath(new URL("./pre.visible-browser.guard.js", import.meta.url));
const LAUNCH = "const b = await chromium.launch({ executablePath: CHROME, headless: false });";
const write = (content, file_path = "scratch/page.cjs") => ({ tool_name: "Write", tool_input: { file_path, content } });
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });

describe("main", () => {
  test("blocks a visible Chrome launch and names the ways out", () => {
    const r = main(write(LAUNCH));
    expect(r.block).toContain("executablePath: CHROME");
    expect(r.block).toContain("channel: 'msedge'");
    expect(r.block).toContain("headless");
    expect(r.block).toContain("browser-tool-strategy.md");
  });

  test("Edge and headless pass", () => {
    expect(main(write("chromium.launch({ channel: 'msedge', headless: false })"))).toBeNull();
    expect(main(write("chromium.launch({ executablePath: CHROME, headless: true })"))).toBeNull();
    expect(main(bash("npx playwright test"))).toBeNull();
  });

  test("the marker overrides", () => {
    expect(main(write(`// DEVOPS_ALLOW_VISIBLE_BROWSER: user asked\n${LAUNCH}`))).toBeNull();
    expect(main(bash("DEVOPS_ALLOW_VISIBLE_BROWSER=1 npx playwright test --headed"))).toBeNull();
  });

  test("other tools and empty payloads pass", () => {
    expect(main({ tool_name: "Read", tool_input: { file_path: "a.js" } })).toBeNull();
    expect(main({ tool_name: "Bash" })).toBeNull();
    expect(main(null)).toBeNull();
  });
});

describe("as a child process", () => {
  const run = (input) => spawnSync(process.execPath, [HOOK], { input, encoding: "utf8", env: { ...process.env, DEVOPS_ALLOW_VISIBLE_BROWSER: "" } });

  test("a block is exit 2 with the text on stderr", () => {
    const r = run(JSON.stringify(write(LAUNCH)));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("[visible-browser]");
  });

  test("fails open on unusable stdin", () => {
    for (const bad of ["", "null", "{nope", "[]"]) expect(run(bad).status).toBe(0);
  });
});

describe("dispatcher fast path", () => {
  const manifest = dispatch.loadManifest();
  const selected = (payload) => dispatch
    .selectModules(manifest, "PreToolUse", payload)
    .some((m) => m.name === "pre.visible-browser.guard");

  test("a shell command starts the module only when it names a browser trigger", () => {
    expect(selected(bash("ls -la"))).toBe(false);
    expect(selected(bash("npm run build && git status"))).toBe(false);
    expect(selected(bash("npx playwright test --headed"))).toBe(true);
    expect(selected(bash("playwright codegen http://x"))).toBe(true);
    expect(selected(bash("chrome.exe http://x"))).toBe(true);
    expect(selected(bash("node - <<'EOF'\nchromium.launch({ headless: false })\nEOF"))).toBe(true);
    expect(selected({ tool_name: "PowerShell", tool_input: { command: "Start-Process chrome" } })).toBe(true);
  });

  test("writes always reach the module", () => {
    expect(selected(write(LAUNCH))).toBe(true);
    expect(selected({ tool_name: "Edit", tool_input: { file_path: "a.js", new_string: LAUNCH } })).toBe(true);
  });
});

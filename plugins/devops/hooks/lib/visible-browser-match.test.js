// Holds the patterns the guard refuses: DEVOPS_ALLOW_VISIBLE_BROWSER
import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findInScript, findInCommand, findVisibleBrowser, hasBypass } = require("./visible-browser-match.js");

describe("findInScript", () => {
  test("the launch that started this: a browser path in a variable", () => {
    const found = findInScript("const b = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--enable-gpu'] });");
    expect(found).toHaveLength(1);
    expect(found[0].shown).toContain("executablePath: CHROME");
  });

  test.each([
    ["bundled Chromium", "await chromium.launch({ headless: false })"],
    ["Chrome channel", "await chromium.launch({ channel: 'chrome', headless: false })"],
    ["persistent context", "await chromium.launchPersistentContext(dir, { headless: false })"],
    ["puppeteer", "puppeteer.launch({ headless: false })"],
    ["python", "p.chromium.launch(headless=False)"],
    ["quoted key", 'chromium.launch({ "headless": false })'],
    ["firefox", "firefox.launch({ headless: false })"],
  ])("blocks %s", (_, text) => {
    expect(findInScript(text)).toHaveLength(1);
  });

  test.each([
    ["Edge channel", "chromium.launch({ channel: 'msedge', headless: false })"],
    ["Edge variable", "chromium.launch({ executablePath: EDGE, headless: false })"],
    ["Edge path", "puppeteer.launch({ executablePath: 'C:/x/msedge.exe', headless: false })"],
    ["python Edge", 'p.chromium.launch(channel="msedge", headless=False)'],
    ["headless Chrome", "chromium.launch({ executablePath: CHROME, headless: true })"],
    ["no option", "chromium.launch({ executablePath: CHROME })"],
    ["no browser library", "const config = { headless: false };"],
  ])("allows %s", (_, text) => {
    expect(findInScript(text)).toEqual([]);
  });

  test("a word ending in edge does not count as Edge", () => {
    expect(findInScript("chromium.launch({ headless: false, args: [knowledge, bridge] })")).toHaveLength(1);
  });

  test("Edge in an argument does not make the window Edge", () => {
    expect(findInScript("chromium.launch({ headless: false, args: ['--app=https://edge.example'] })")).toHaveLength(1);
    expect(findInScript("chromium.launch({ executablePath: knowledgePath, headless: false })")).toHaveLength(1);
  });

  test("Edge in another launch does not excuse this one", () => {
    const text = "chromium.launch({ channel: 'msedge', headless: false });\nchromium.launch({ headless: false });";
    expect(findInScript(text)).toHaveLength(1);
  });

  test("non-text input finds nothing", () => {
    expect(findInScript(undefined)).toEqual([]);
  });
});

describe("findInCommand", () => {
  test.each([
    ["headed test run", "npx playwright test --headed"],
    ["env prefix", "CI=1 npx playwright test --headed"],
    ["npm script", "npm run e2e -- --headed"],
    ["playwright open", "npx playwright open http://localhost:3000"],
    ["codegen", "playwright codegen http://localhost:3000"],
    ["after another command", "cd app && npx playwright test --headed"],
    ["start chrome", 'start "" chrome http://localhost:3000'],
    ["Start-Process", "Start-Process chrome http://localhost:3000"],
    ["Chrome for Testing path", "P:/packages/chrome-for-testing/chrome-win64/chrome.exe http://localhost:3000"],
    ["quoted path with a space", '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" http://x'],
    ["PowerShell call operator", '& "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" http://x'],
    ["debug port without headless", "chrome.exe --remote-debugging-port=9222"],
    ["Chrome with a URL naming Edge", 'start "" chrome https://edge.example'],
    ["headed run with a filter naming Edge", "npx playwright test --headed --grep edge"],
    ["heredoc script", "node - <<'EOF'\nchromium.launch({ headless: false })\nEOF"],
    ["node -e", 'node -e "chromium.launch({ headless: false })"'],
    ["written by heredoc", "cat > page.cjs <<'EOF'\nchromium.launch({ headless: false })\nEOF"],
  ])("blocks %s", (_, command) => {
    expect(findInCommand(command).length).toBeGreaterThan(0);
  });

  test.each([
    ["headless test run", "npx playwright test"],
    ["Edge test run", "npx playwright test --headed --browser=msedge"],
    ["Edge project", "npx playwright test --headed --project=edge"],
    ["Edge channel flag", "npx playwright open --channel msedge http://x"],
    ["Edge start", 'start "" msedge --new-window http://x'],
    ["headless Chrome", "chrome.exe --headless --dump-dom http://x"],
    ["version check", "chrome.exe --version"],
    ["browser path for a test run", 'CHROME_BIN="P:/packages/chrome-win64/chrome.exe" npx ng test --browsers=ChromeHeadless'],
    ["unquoted browser path for a test run", "CHROME_BIN=P:/packages/chrome.exe npx ng test --browsers=ChromeHeadless"],
    ["locating the binary", "find P:/packages -name chrome.exe | head -1"],
    ["listing the binary", "ls P:/packages/chrome-win64/chrome.exe"],
    ["searching for the option", 'grep -n "headless: false\\|chromium.launch" page.cjs'],
    ["searching for the flag", "grep -- --headed README.md"],
    ["a folder named chrome", "cd chrome"],
    ["running a script", "node page.cjs"],
  ])("allows %s", (_, command) => {
    expect(findInCommand(command)).toEqual([]);
  });
});

describe("findVisibleBrowser", () => {
  const launch = "chromium.launch({ headless: false })";

  test("reads what each tool writes", () => {
    expect(findVisibleBrowser("Write", { file_path: "a/page.cjs", content: launch })).toHaveLength(1);
    expect(findVisibleBrowser("Edit", { file_path: "a/page.ts", new_string: launch })).toHaveLength(1);
    expect(findVisibleBrowser("MultiEdit", { file_path: "a/p.py", edits: [{ new_string: "x" }, { new_string: launch }] })).toHaveLength(1);
    expect(findVisibleBrowser("PowerShell", { command: "npx playwright test --headed" })).toHaveLength(1);
  });

  test("docs may describe the option", () => {
    expect(findVisibleBrowser("Write", { file_path: "docs/rule.md", content: launch })).toEqual([]);
    expect(findVisibleBrowser("Edit", { file_path: "docs/rule.md", new_string: launch })).toEqual([]);
  });

  test("an edit that only removes the option passes", () => {
    expect(findVisibleBrowser("Edit", { file_path: "a.js", old_string: launch, new_string: "chromium.launch({})" })).toEqual([]);
  });

  test("missing input finds nothing", () => {
    expect(findVisibleBrowser("Write", undefined)).toEqual([]);
    expect(findVisibleBrowser("Write", { content: launch })).toEqual([]);
    expect(findVisibleBrowser("MultiEdit", { file_path: "a.js" })).toEqual([]);
    expect(findVisibleBrowser("Read", { file_path: "a.js" })).toEqual([]);
  });
});

describe("hasBypass", () => {
  test("finds the marker in commands and written code", () => {
    expect(hasBypass({ command: "DEVOPS_ALLOW_VISIBLE_BROWSER=1 npx playwright test --headed" })).toBe(true);
    expect(hasBypass({ content: "// DEVOPS_ALLOW_VISIBLE_BROWSER: user asked" })).toBe(true);
    expect(hasBypass({ new_string: "// DEVOPS_ALLOW_VISIBLE_BROWSER" })).toBe(true);
    expect(hasBypass({ edits: [{ new_string: "// DEVOPS_ALLOW_VISIBLE_BROWSER" }] })).toBe(true);
    expect(hasBypass({ command: "ls" })).toBe(false);
    expect(hasBypass(undefined)).toBe(false);
  });
});

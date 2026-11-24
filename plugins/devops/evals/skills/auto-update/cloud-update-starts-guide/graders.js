// "Cloud updaten" opens the guided path (#1233). The browser tools are denied, so
// the guide stops at its own "browser tool not available" step; what counts is that
// it was started, no browser tool was tried before it, and no click list was sent.
const isBrowser = (c) => /claude-in-chrome|Claude_Browser|Claude_Preview|playwright|computer-use/i.test(c.name);
const isGuide = (c) => c.name === "Skill" && /auto-guide/.test(JSON.stringify(c.input || {}));

module.exports = (g) => ({
  "guide-skill": g.skillInvoked("auto-guide"),
  "guide-before-browser": (ctx) => {
    const calls = ctx.parsed.toolCalls.filter((c) => !c.subagent);
    const guide = calls.findIndex(isGuide);
    const browser = calls.findIndex(isBrowser);
    return guide >= 0 && (browser < 0 || guide < browser);
  },
  "no-click-list": (ctx) => {
    const text = ctx.parsed.assistantText.join("\n");
    return !/Manage marketplaces[\s\S]{0,120}Check for updates/i.test(text);
  },
  "no-git-update": g.toolUsed("Bash", { inputMatch: /ss\.plugin\.update\.js/, min: 0, max: 0 }),
});

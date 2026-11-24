// Promotion of a scratch folder to a real project: the setup bundle of
// project-setup.md Step 8b is created in the same turn, no follow-up prompt.
// Judged from the tool calls, not the case root: Claude may work in its own
// worktree below it.
const calls = (ctx) => ctx.parsed.toolCalls.filter((c) => !c.subagent);
const wrote = (re) => (ctx) =>
  calls(ctx).some((c) => /^(Write|Edit|Bash)$/.test(c.name) && re.test(JSON.stringify(c.input || {})));
const file = (name) => (ctx) =>
  calls(ctx).some((c) => c.name === "Write" && String((c.input || {}).file_path || "").replace(/\\/g, "/").endsWith("/" + name));

module.exports = () => ({
  "version": file("VERSION"),
  "changelog": file("CHANGELOG.md"),
  "license": file("LICENSE"),
  "editorconfig": file(".editorconfig"),
  "gitattributes": file(".gitattributes"),
  "ignore-block": wrote(/claude-ignore\.js[^;&|]*migrate/),
  "build-zip": wrote(/zip|Compress-Archive|archiv/i),
  "ci-release": wrote(/\.github[\\/]+workflows[\s\S]*v\*/),
});

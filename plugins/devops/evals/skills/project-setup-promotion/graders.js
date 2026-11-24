// Promotion of a scratch folder to a real project: the setup bundle of
// project-setup.md Step 8b is created in the same turn, no follow-up prompt.
const wrote = (re) => (ctx) =>
  ctx.parsed.toolCalls.some((c) => !c.subagent && /^(Write|Edit|Bash)$/.test(c.name) && re.test(JSON.stringify(c.input || {})));

module.exports = (g) => ({
  "version": g.fileExists("VERSION"),
  "changelog": g.fileExists("CHANGELOG.md"),
  "license": g.fileExists("LICENSE"),
  "editorconfig": g.fileExists(".editorconfig"),
  "gitattributes": g.fileExists(".gitattributes"),
  "ignore-block": g.fileMatches(".gitignore", /claude \(managed\)/),
  "build-zip": wrote(/zip|Compress-Archive|archiv/i),
  "ci-release": wrote(/\.github[\\/]+workflows[\s\S]*v\*/),
});

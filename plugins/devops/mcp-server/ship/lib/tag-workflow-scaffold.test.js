import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scaffoldTagWorkflow, detectTagPrefix, findJsonVersionFile, isWorkflowScopeRefusal, workflowScopeHandoff, WORKFLOW_PATH,
} from "./tag-workflow-scaffold.js";

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tagwf-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const put = (rel, text) => { mkdirSync(join(dir, rel, ".."), { recursive: true }); writeFileSync(join(dir, rel), text); };
const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore", windowsHide: true });

describe("scaffoldTagWorkflow (#1232)", () => {
  test("a repo with ring tags gets the alpha/ prefix and its version file", () => {
    put("package.json", '{"version":"1.2.3"}');
    git("init", "-q");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "x");
    git("tag", "alpha/v1.2.3");
    const res = scaffoldTagWorkflow({ cwd: dir });
    expect(res).toMatchObject({ ok: true, prefix: "alpha/", versionFile: "package.json", path: WORKFLOW_PATH });
    const text = readFileSync(join(dir, WORKFLOW_PATH), "utf8");
    expect(text).toMatch(/^ {2}TAG_PREFIX: "alpha\/"$/m);
    expect(text).toMatch(/^ {2}VERSION_FILE: "package.json"$/m);
  });

  test("an origin that does not answer is refused, never guessed as no prefix", () => {
    put("package.json", '{"version":"1.2.3"}');
    git("init", "-q");
    git("remote", "add", "origin", join(dir, "gone.git"));
    expect(scaffoldTagWorkflow({ cwd: dir })).toMatchObject({ ok: false, reason: expect.stringContaining("did not answer") });
    expect(existsSync(join(dir, WORKFLOW_PATH))).toBe(false);
  });

  test("a repo without ring tags gets no prefix; the plugin manifest wins over package.json", () => {
    put("package.json", '{"version":"1.2.3"}');
    put(".claude-plugin/plugin.json", '{"version":"0.4.0"}');
    const res = scaffoldTagWorkflow({ cwd: dir, tags: ["v1.0.0", "beta/v1.0.1"] });
    expect(res).toMatchObject({ ok: true, prefix: "", versionFile: ".claude-plugin/plugin.json" });
    const text = readFileSync(join(dir, WORKFLOW_PATH), "utf8");
    expect(text).toMatch(/^ {2}TAG_PREFIX: ""$/m);
    expect(text).toMatch(/^ {2}VERSION_FILE: "\.claude-plugin\/plugin\.json"$/m);
  });

  test("an existing tag workflow is never overwritten, whatever its name", () => {
    put("package.json", '{"version":"1.2.3"}');
    put(".github/workflows/tag-on-version.yaml", "mine");
    const res = scaffoldTagWorkflow({ cwd: dir, tags: [] });
    expect(res.ok).toBe(false);
    expect(res.existing).toBe(".github/workflows/tag-on-version.yaml");
    expect(readFileSync(join(dir, ".github/workflows/tag-on-version.yaml"), "utf8")).toBe("mine");
    expect(existsSync(join(dir, WORKFLOW_PATH))).toBe(false);
  });

  test("without a JSON version file it refuses with the reason and writes nothing", () => {
    put("pyproject.toml", 'version = "1.0.0"');
    const res = scaffoldTagWorkflow({ cwd: dir, tags: [] });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/JSON version file/);
    expect(existsSync(join(dir, ".github"))).toBe(false);
  });

  test("a version that is not x.y.z does not count as a version file", () => {
    put("package.json", '{"version":"1.2"}');
    expect(findJsonVersionFile(dir)).toBeNull();
  });

  test("detectTagPrefix: only alpha/vX.Y.Z tags make a ring repo", () => {
    expect(detectTagPrefix(["alpha/v1.0.0"])).toBe("alpha/");
    expect(detectTagPrefix(["v1.0.0", "alpha/notes"])).toBe("");
    expect(detectTagPrefix(undefined)).toBe("");
  });
});

describe("workflow scope refusal", () => {
  test("detects the refusal git prints for a token without the scope", () => {
    for (const m of [
      "! [remote rejected] x -> x (refusing to allow an OAuth App to create or update workflow `.github/workflows/tag-on-version.yml` without `workflow` scope)",
      "remote: refusing to allow a Personal Access Token to create or update workflow `.github/workflows/a.yml` without `workflow` scope",
    ]) expect(isWorkflowScopeRefusal(new Error(m)), m).toBe(true);
    expect(isWorkflowScopeRefusal({ stderr: "refusing to allow an OAuth App to create or update workflow `x` without `workflow` scope" })).toBe(true);
  });

  test("other push errors are not it", () => {
    for (const m of ["Permission denied (publickey)", "remote: Write access to repository not granted", "proxy rejected the push: tags are not allowed", ""])
      expect(isWorkflowScopeRefusal(new Error(m)), m).toBe(false);
  });

  test("the hand-off names the scope and the exact commands", () => {
    const h = workflowScopeHandoff({ branch: "chore/tag-workflow" });
    expect(h.scope).toBe("workflow");
    expect(h.text).toMatch(/`workflow` scope/);
    expect(h.commands).toEqual(["gh auth refresh -h github.com -s workflow", "git push -u origin chore/tag-workflow"]);
  });
});

describe("CLI", () => {
  const cli = fileURLToPath(new URL("./tag-workflow-scaffold-cli.mjs", import.meta.url));
  test("scaffolds into --cwd and prints JSON", () => {
    put("package.json", '{"version":"1.2.3"}');
    const out = JSON.parse(execFileSync("node", [cli, "--cwd", dir], { encoding: "utf8", windowsHide: true }));
    expect(out).toMatchObject({ ok: true, prefix: "" });
    expect(existsSync(join(dir, WORKFLOW_PATH))).toBe(true);
  });

  test("--classify-push names the workflow scope", () => {
    const f = join(dir, "err.txt");
    writeFileSync(f, "refusing to allow an OAuth App to create or update workflow `x` without `workflow` scope");
    const out = JSON.parse(execFileSync("node", [cli, "--classify-push", f, "--branch", "b"], { encoding: "utf8", windowsHide: true }));
    expect(out.refused).toBe(true);
    expect(out.text).toMatch(/workflow/);
  });
});

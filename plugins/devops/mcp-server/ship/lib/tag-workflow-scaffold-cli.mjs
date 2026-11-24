#!/usr/bin/env node
/**
 * CLI for the do-ship reply "Tag-Workflow einrichten" (#1232).
 *   node tag-workflow-scaffold-cli.mjs [--cwd <repo>]
 * Writes .github/workflows/tag-on-version.yml into the working tree (no commit,
 * no push) and prints the result as JSON. Exit 1 when it refused.
 *   node tag-workflow-scaffold-cli.mjs --classify-push <stderr-file>
 * Prints the workflow-scope hand-off as JSON when that push error names it.
 */
import { readFileSync } from "node:fs";
import { scaffoldTagWorkflow, isWorkflowScopeRefusal, workflowScopeHandoff } from "./tag-workflow-scaffold.js";

const args = process.argv.slice(2);
const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };

try {
  const errFile = val("--classify-push");
  if (errFile) {
    const text = readFileSync(errFile, "utf8");
    const hit = isWorkflowScopeRefusal(text);
    process.stdout.write(JSON.stringify(hit ? { refused: true, ...workflowScopeHandoff({ branch: val("--branch") }) } : { refused: false }));
  } else {
    const res = scaffoldTagWorkflow({ cwd: val("--cwd") });
    process.stdout.write(JSON.stringify(res));
    if (!res.ok) process.exitCode = 1;
  }
} catch (e) {
  process.stderr.write(String(e.message || e));
  process.exitCode = 1;
}

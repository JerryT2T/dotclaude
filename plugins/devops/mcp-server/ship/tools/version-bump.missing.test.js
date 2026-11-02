import { describe, test, expect, vi } from "vitest";
vi.mock("zod", () => {
  const node = new Proxy(() => node, { get: () => () => node });
  return { z: { object: () => node, string: () => node, boolean: () => node, enum: () => node, number: () => node, array: () => node } };
});
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { handler } from "./version-bump.js";

function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "vbump1017-"));
  execFileSync("git", ["init", "-q"], { cwd: d });
  return d;
}

describe("ship_version_bump without a version file (#1017)", () => {
  test("bump != none returns needs version-file-missing", async () => {
    const d = repo();
    try {
      const r = await handler({ bump: "minor", cwd: d });
      expect(r.needs).toBe("version-file-missing");
      expect(r.success).toBe(false);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  test("a Home Assistant manifest is bumped", async () => {
    const d = repo();
    try {
      fs.mkdirSync(path.join(d, "custom_components/fin"), { recursive: true });
      fs.writeFileSync(path.join(d, "custom_components/fin/manifest.json"), JSON.stringify({ version: "0.26.0" }));
      fs.writeFileSync(path.join(d, "CHANGELOG.md"), "## [0.27.0]\n");
      const r = await handler({ bump: "minor", cwd: d });
      expect(r.vNew).toBe("0.27.0");
      expect(JSON.parse(fs.readFileSync(path.join(d, "custom_components/fin/manifest.json"), "utf8")).version).toBe("0.27.0");
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  test("declared versionFiles drive the bump", async () => {
    const d = repo();
    try {
      fs.writeFileSync(path.join(d, "const.py"), 'VERSION = "1.2.3"\n');
      fs.writeFileSync(path.join(d, "CHANGELOG.md"), "## [1.2.4]\n");
      const r = await handler({ bump: "patch", cwd: d, versionFiles: [{ path: "const.py", pattern: 'VERSION = "([^"]+)"' }] });
      expect(r.vNew).toBe("1.2.4");
      expect(fs.readFileSync(path.join(d, "const.py"), "utf8")).toBe('VERSION = "1.2.4"\n');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });
});

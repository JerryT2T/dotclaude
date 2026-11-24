import { isAbsolute, join, relative, sep } from "node:path";
import { gitTry } from "./git.js";

/** The version in `file` (a readVersion() result) as `origin/<base>` holds it; null when it cannot be told. */
export function baseVersionOf(cwd, base, file) {
  try {
    if (!file) return null;
    const root = gitTry(["rev-parse", "--show-toplevel"], { cwd }) || cwd;
    const rel = relative(root, isAbsolute(file) ? file : join(cwd, file)).split(sep).join("/");
    const text = gitTry(["show", `origin/${base}:${rel}`], { cwd });
    if (!text) return null;
    try {
      const j = JSON.parse(text);
      return (j && (j.version || (j.metadata && j.metadata.version))) || null;
    } catch {
      const m = text.match(/\bversion\b["']?\s*[:=]\s*["']([^"']+)["']/i);
      return m ? m[1] : null;
    }
  } catch { return null; }
}

/** Is semver `a` above `b`? */
export function semverAbove(a, b) {
  const pa = String(a).split(/[.-]/).slice(0, 3).map(Number);
  const pb = String(b).split(/[.-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(pa[i]) || !Number.isFinite(pb[i])) return true;
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return false;
}

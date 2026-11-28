/**
 * devops opt-out, band side (concept 20261120-1805-devops-optout; contract: docs/concepts/20261120-1805-devops-optout/briefs/contract.md).
 * Mirrors the reads and writes of hooks/lib/devops-optout.js (resolver) and scripts/devops-optout.js (writer) with `$.fs`
 * only, no Node. Keep the three in sync. The one thing `$.fs` cannot do is delete: switching ON runs the writer script.
 */
import type { EngineInterface } from 'claude-code'

import { BATCH_WRITER_TIMEOUT_MS } from './format'

export const DEVOPS_KEY = 'devops@dotclaude'

/** Same rule as isDevopsKey() in the resolver. */
export function isDevopsKey(k: string): boolean {
  return k === 'devops@dotclaude' || k === 'dotclaude-dev-ops@dotclaude-dev-ops' || k === 'dotclaude-dev-ops@Jerry0022' || (/^devops@/.test(k) && /dotclaude/.test(k.slice(7)))
}

export type OptState = {
  on: boolean
  /** Where the deciding answer came from (the chip only tells session or project). */
  scope: 'session' | 'local' | 'project' | 'user' | 'global' | 'none'
  sessionOff: boolean
  projectOff: boolean
  /** "Alle Projekte" off: the devops-own flag `~/.claude/devops-optout/global.json` exists. Hooks/skills/MCP rest; band and Home keep rendering. */
  globalOff: boolean
}

export type OptScope = 'session' | 'project' | 'global'

export function globalFlagPath(home: string): string {
  // Same as globalFlagPath() in hooks/lib/devops-optout.js — keep both in sync.
  return `${home}/.claude/devops-optout/global.json`
}

/** The explicit answer of one settings object: false when any devops key is false, true when only trues, null when no entry. */
export function decide(settings: unknown): boolean | null {
  const ep = settings && typeof settings === 'object' ? (settings as { enabledPlugins?: unknown }).enabledPlugins : null
  if (!ep || typeof ep !== 'object') return null
  const vals = Object.entries(ep as Record<string, unknown>)
    .filter(([k, v]) => isDevopsKey(k) && typeof v === 'boolean')
    .map(([, v]) => v as boolean)
  return vals.length ? !vals.includes(false) : null
}

export function sessionFlagPath(home: string, id: string): string {
  // Same sanitising as hooks/lib/devops-optout.js sessionFlagPath — keep both in sync.
  return `${home}/.claude/devops-optout/sessions/${String(id).replace(/[^\w.-]/g, '_')}.json`
}

/** The parsed object; undefined = file missing; null = unreadable / corrupt (skipped, never "off"). */
async function readObj($: EngineInterface, path: string): Promise<Record<string, unknown> | null | undefined> {
  let text: unknown
  try {
    text = await $.fs.read(path)
  } catch {
    return undefined
  }
  if (typeof text !== 'string') return undefined
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** The resolver's order: session flag, then settings.local.json, settings.json, user settings; the first explicit boolean decides. */
export async function readOptState($: EngineInterface, home: string, root: string, sessionId: string): Promise<OptState> {
  const sessionOff = !!sessionId && !!home && (await readObj($, sessionFlagPath(home, sessionId))) !== undefined
  const files: Array<['local' | 'project' | 'user', string]> = []
  if (root) files.push(['local', `${root}/.claude/settings.local.json`], ['project', `${root}/.claude/settings.json`])
  if (home) files.push(['user', `${home}/.claude/settings.json`])
  let scope: OptState['scope'] = 'none'
  let on = true
  let decided = false
  for (const [sc, path] of files) {
    const d = decide(await readObj($, path))
    if (d === null) continue
    decided = true
    on = d
    scope = sc
    break
  }
  const projectOff = decided && !on
  const globalOff = !!home && (await readObj($, globalFlagPath(home))) !== undefined
  // Resolver order: session, global, then the settings files. A read-only look, no locks.
  if (sessionOff) return { on: false, scope: 'session', sessionOff, projectOff, globalOff }
  if (globalOff) return { on: false, scope: 'global', sessionOff, projectOff, globalOff }
  return { on, scope, sessionOff, projectOff, globalOff }
}

async function writeJson($: EngineInterface, path: string, v: unknown): Promise<void> {
  await $.fs.write(path, `${JSON.stringify(v, null, 2)}\n`)
}

async function writerScript($: EngineInterface, args: string[], root: string): Promise<boolean> {
  try {
    const r = await $.process.run(['node', `${$.plugin.root}/scripts/devops-optout.js`, ...args], { cwd: root || undefined, timeoutMs: BATCH_WRITER_TIMEOUT_MS })
    return r.exitCode === 0
  } catch {
    return false
  }
}

/** Switch devops off for the session (flag file), the project (settings.local.json merge) or everywhere (global flag file). Never writes `outputStyle`. */
export async function switchOff($: EngineInterface, scope: OptScope, env: { home: string; root: string; sid: string; now: number }): Promise<boolean> {
  const { home, root, sid, now } = env
  const at = new Date(now).toISOString()
  const args = ['off', '--scope', scope, ...(sid ? ['--session', sid] : []), ...(root ? ['--cwd', root] : [])]
  try {
    if (scope === 'session') {
      if (!home || !sid) return false
      await writeJson($, sessionFlagPath(home, sid), { off: true, at, cwd: root })
      return true
    }
    if (scope === 'global') {
      if (!home) return false
      await writeJson($, globalFlagPath(home), { off: true, at })
      return true
    }
    if (!root) return false
    const cur = await readObj($, `${root}/.claude/settings.local.json`)
    if (cur === null) return false // corrupt: never clobber the person's file
    const local = cur ?? {}
    const ep = local.enabledPlugins && typeof local.enabledPlugins === 'object' ? (local.enabledPlugins as Record<string, unknown>) : {}
    await writeJson($, `${root}/.claude/settings.local.json`, { ...local, enabledPlugins: { ...ep, [DEVOPS_KEY]: false } })
    return true
  } catch {
    return await writerScript($, args, root)
  }
}

/** Switch devops back on: the writer script (it deletes the flag / memo, which `$.fs` cannot). */
export async function switchOn($: EngineInterface, scope: OptScope, env: { root: string; sid: string }): Promise<boolean> {
  return writerScript($, ['on', '--scope', scope, ...(env.sid ? ['--session', env.sid] : []), ...(env.root ? ['--cwd', env.root] : [])], env.root)
}

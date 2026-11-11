/**
 * Channel gate of the `claude-mods` feature, inside the mod's own
 * environment (no Node: every read goes through `$.fs`). Mirrors
 * hooks/lib/features.js `featureAllowed` with its fail-closed rules:
 * unknown feature or corrupt registry → closed, invalid `minChannel` →
 * alpha, missing or unreadable pin → stable. Never throws.
 */
import type { EngineInterface } from 'claude-code'

export const FEATURE = 'claude-mods'

const RANK: Record<string, number> = { stable: 0, beta: 1, alpha: 2 }

async function readJson($: EngineInterface, path: string): Promise<unknown> {
  try {
    const text = await $.fs.read(path)
    return typeof text === 'string' ? JSON.parse(text) : null
  } catch {
    return null
  }
}

/** The user's home folder, with forward slashes; '' when unknown. */
export async function homeDir($: EngineInterface): Promise<string> {
  let v: string | undefined
  try {
    v = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
  } catch {
    v = undefined
  }
  return v ? v.replace(/\\/g, '/').replace(/\/+$/, '') : ''
}

/** Marketplace name: `…/cache/<mp>/devops/…`, else the first `devops@<mp>` install, else dotclaude. */
export async function marketplaceName($: EngineInterface, home: string): Promise<string> {
  const root = String($.plugin.root || '').replace(/\\/g, '/')
  const m = /\/cache\/([^/]+)\/devops(\/|$)/.exec(root)
  if (m) return m[1]
  const installed = (await readJson($, `${home}/.claude/plugins/installed_plugins.json`)) as
    | { plugins?: Record<string, unknown> }
    | null
  const keys = installed && installed.plugins && typeof installed.plugins === 'object' ? Object.keys(installed.plugins) : []
  const hit = keys.find(k => k.startsWith('devops@'))
  return hit ? hit.slice('devops@'.length) : 'dotclaude'
}

/** Whether `claude-mods` is offered on this machine's channel pin. */
export async function featureAllowed($: EngineInterface, name: string = FEATURE): Promise<boolean> {
  try {
    const registry = (await readJson($, `${$.plugin.root}/features.json`)) as
      | { features?: Record<string, { minChannel?: string }> }
      | null
    const entry = registry && registry.features ? registry.features[name] : undefined
    if (!entry) return false
    const min = entry.minChannel === 'beta' ? 'beta' : 'alpha'
    const home = await homeDir($)
    if (!home) return false
    const mp = await marketplaceName($, home)
    const pins = (await readJson($, `${home}/.claude/plugins/.channels.json`)) as Record<string, unknown> | null
    const pin = pins && typeof pins[mp] === 'string' && RANK[pins[mp] as string] !== undefined ? (pins[mp] as string) : 'stable'
    return RANK[pin] >= RANK[min]
  } catch {
    return false
  }
}

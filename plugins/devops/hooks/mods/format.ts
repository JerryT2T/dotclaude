/**
 * Pure, deterministic text for the devops mods: no `$`, no clock, no model.
 * Every number shown comes from the arguments (engine events or files the
 * plugin's scripts already write), never from memory.
 */
import type { AgentRow, Budget, Hygiene, ShipView } from '../../types/index'

export const CONTEXT_HINT_PERCENT = 80
export const LONG_RUN_MS = 120_000

/** "42 s", "3 m 05 s", "1 h 02 m". */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} m ${String(s % 60).padStart(2, '0')} s`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`
}

/** One pane row: status, type, model, elapsed, description. */
export function agentRow(a: AgentRow, now: number): string {
  const end = typeof a.endedAt === 'number' ? a.endedAt : now
  const model = a.model ? ` · ${a.model}` : ''
  return `${a.status.padEnd(9)} ${a.type}${model} · ${elapsed(end - a.startedAt)} · ${a.description}`
}

/** The budget from one `session.measure` (or `$.session.usage()`) reading. */
export function budgetFrom(m: {
  context?: { percent?: number }
  rateLimits?: ReadonlyArray<{ kind: string; percentUsed: number }>
}): Budget {
  const limits = Array.isArray(m.rateLimits) ? m.rateLimits : []
  const pick = (kind: string) => {
    const r = limits.find(l => l && l.kind === kind)
    return r && Number.isFinite(r.percentUsed) ? Math.round(r.percentUsed) : null
  }
  const ctx = m.context && Number.isFinite(m.context.percent) ? Math.round(m.context.percent as number) : null
  return { fiveHour: pick('five_hour'), weekly: pick('seven_day'), context: ctx }
}

/** "5h 42 % · week 18 % · context 81 % → /compact"; null when nothing is known. */
export function budgetLine(b: Budget | null): string | null {
  if (!b) return null
  const parts: string[] = []
  if (b.fiveHour !== null) parts.push(`5h ${b.fiveHour} %`)
  if (b.weekly !== null) parts.push(`week ${b.weekly} %`)
  if (b.context !== null) parts.push(`context ${b.context} %`)
  if (!parts.length) return null
  const hint = b.context !== null && b.context >= CONTEXT_HINT_PERCENT ? ' → /compact recommended' : ''
  return parts.join(' · ') + hint
}

const ORPHAN_MAX_AGE_MS = 24 * 3_600_000

function norm(p: string): string {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * Open branches / dirty worktrees of the current repo from
 * ~/.claude/orphan-report.json, counted as ss.orphan.nudge.js `counts` does
 * (unlanded = atRisk − dirty + remoteOnly). null for a stale (> 24 h) or
 * missing report, or an unknown repo — the nudge is silent there too.
 */
export function hygieneFrom(report: unknown, cwd: string, now: number): Hygiene | null {
  const r = report as { generatedAt?: string; repos?: unknown[] } | null
  if (!r || !Array.isArray(r.repos)) return null
  const t = Date.parse(r.generatedAt || '')
  if (!Number.isFinite(t) || now - t > ORPHAN_MAX_AGE_MS) return null
  const here = norm(cwd)
  const entry = (r.repos as Array<{ path?: string; atRisk?: Array<{ dirty?: number }>; remoteOnly?: unknown[] }>)
    .filter(e => e && e.path && (here === norm(e.path) || here.startsWith(`${norm(e.path)}/`)))
    .sort((a, b) => norm(b.path as string).length - norm(a.path as string).length)[0]
  if (!entry) return null
  const risk = Array.isArray(entry.atRisk) ? entry.atRisk : []
  const dirty = risk.filter(x => x && (x.dirty || 0) > 0).length
  const remote = Array.isArray(entry.remoteOnly) ? entry.remoteOnly.length : 0
  return { branches: risk.length - dirty + remote, worktrees: dirty, ageHours: Math.floor((now - t) / 3_600_000) }
}

/** Status-line text; null when nothing is open. */
export function hygieneLine(h: Hygiene | null): string | null {
  if (!h || h.branches + h.worktrees === 0) return null
  return `devops: ${h.branches} open ${h.branches === 1 ? 'branch' : 'branches'} · ${h.worktrees} dirty ${h.worktrees === 1 ? 'worktree' : 'worktrees'}`
}

/** The fixed prompt the cleanup button submits (d2-branch = submit, d2-branch-model = opus medium). */
export const CLEANUP_PROMPT =
  'Branch cleanup: start the cleanup in a separate side session (a subagent or a new session) with model opus and effort medium, ' +
  'and do not clean up in this session. Use the devops cleanup flow ("branch cleanup"); it asks before deleting anything.'

const SHIP_STEPS = ['preflight', 'build', 'bump', 'release'] as const

/** Ship checkpoint (`<root>/.claude/.ship-checkpoint.json`) → done steps and the next one, for this branch only. */
export function shipFrom(cp: unknown, branch: string): Pick<ShipView, 'steps' | 'next'> | null {
  const c = cp as { branch?: string; steps?: Record<string, { merged?: boolean; tagVerified?: boolean } | undefined> } | null
  if (!c || !c.steps || typeof c.steps !== 'object') return null
  if (branch && c.branch && c.branch !== branch) return null
  const steps = c.steps
  const done = SHIP_STEPS.filter(s => (s === 'release' ? !!(steps.release && steps.release.merged) : !!steps[s]))
  let next: string = SHIP_STEPS.find(s => !done.includes(s)) || 'cleanup'
  if (steps.release && steps.release.merged && steps.release.tagVerified === false) next = 'release (tag)'
  return { steps: done.slice(), next }
}

/** `gh pr view --json number,state,statusCheckRollup` stdout → a summary; null when unparsable. */
export function checksFrom(stdout: string): ShipView['pr'] {
  try {
    const j = JSON.parse(stdout) as { number?: number; state?: string; statusCheckRollup?: Array<{ conclusion?: string; status?: string; state?: string }> }
    if (!j || typeof j.number !== 'number') return null
    const rollup = Array.isArray(j.statusCheckRollup) ? j.statusCheckRollup : []
    let pass = 0
    let fail = 0
    let pending = 0
    for (const c of rollup) {
      const v = String(c.conclusion || c.state || '').toUpperCase()
      if (v === 'SUCCESS' || v === 'NEUTRAL' || v === 'SKIPPED') pass++
      else if (v === 'FAILURE' || v === 'ERROR' || v === 'CANCELLED' || v === 'TIMED_OUT' || v === 'ACTION_REQUIRED') fail++
      else pending++
    }
    return { number: j.number, state: String(j.state || ''), pass, fail, pending }
  } catch {
    return null
  }
}

/**
 * The lines a devops SessionStart hook asked Claude to show verbatim, as
 * toast texts: the ss.orphan.nudge line (the line after its
 * "[ss.orphan.nudge] … verbatim" header), each ss.plugin.update upgrade row
 * (`- **name**: a → b (…)`) of a notice that asks for verbatim display, and a
 * one-line notice whose "… verbatim, once." instruction follows it. The hook
 * text itself stays untouched (red team #10): these only feed a toast.
 */
export function verbatimNotices(contexts: readonly string[] | undefined): string[] {
  const out: string[] = []
  for (const c of contexts || []) {
    if (typeof c !== 'string' || !/verbatim/i.test(c)) continue
    const lines = c.split(/\r?\n/).map(l => l.trim())
    lines.forEach((l, i) => {
      if (/^\[ss\.orphan\.nudge\].*verbatim/i.test(l)) {
        const next = lines.slice(i + 1).find(Boolean)
        if (next) out.push(next)
        return
      }
      const up = /^- \*\*([^*]+)\*\*: (\S+) → (\S+) \(/.exec(l)
      if (up) {
        out.push(`${up[1]} ${up[2]} → ${up[3]}: restart Claude to activate`)
        return
      }
      if (/verbatim/i.test(l) && /(once|einmal)/i.test(l) && !l.startsWith('[')) {
        const prev = lines.slice(0, i).reverse().find(Boolean)
        if (prev && !/verbatim/i.test(prev)) out.push(prev)
      }
    })
  }
  return out.map(t => t.slice(0, 200))
}

/**
 * Pure, deterministic text for the devops mods: no `$`, no clock, no model.
 * Every number shown comes from the arguments (engine events or files the
 * plugin's scripts already write), never from memory.
 */
import type { AgentRow, Budget, Hygiene, ShipView } from '../../types/index'

export const LONG_RUN_MS = 120_000

/** "42 s", "3 m 05 s", "1 h 02 m". */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} m ${String(s % 60).padStart(2, '0')} s`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`
}

/**
 * A background task's notification as the engine delivers it
 * (`<task-notification>` with `<tool-use-id>`, `<status>`, `<summary>`).
 * Null for any other text. Pure parsing, nothing inferred.
 */
export function taskNotice(text: string): { toolUseId: string; status: string; summary: string } | null {
  if (typeof text !== 'string' || !text.includes('<task-notification>')) return null
  const tag = (name: string) => {
    const m = text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
    return m ? m[1].trim() : ''
  }
  const toolUseId = tag('tool-use-id')
  if (!toolUseId) return null
  return { toolUseId, status: tag('status'), summary: tag('summary') }
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
  rateLimits?: ReadonlyArray<{ kind: string; percentUsed: number; resetsAt?: string }>
}): Budget {
  const limits = Array.isArray(m.rateLimits) ? m.rateLimits : []
  const find = (kind: string) => limits.find(l => l && l.kind === kind)
  const pct = (kind: string) => {
    const r = find(kind)
    return r && Number.isFinite(r.percentUsed) ? Math.round(r.percentUsed) : null
  }
  const reset = (kind: string) => {
    const r = find(kind)
    const t = r && r.resetsAt ? Date.parse(r.resetsAt) : NaN
    return Number.isFinite(t) ? t : null
  }
  const ctx = m.context && Number.isFinite(m.context.percent) ? Math.round(m.context.percent as number) : null
  return {
    fiveHour: pct('five_hour'),
    weekly: pct('seven_day'),
    context: ctx,
    fiveHourResetsAt: reset('five_hour'),
    weeklyResetsAt: reset('seven_day'),
  }
}

// --- Budget bars: the completion card's rules (mcp-server/index.js § 2.4), mirrored. ---
// Bar = time elapsed in the window, marker = usage, marker colour = usage ahead of time.
// 5h shows from 50 % used or 1 h before reset; Wk once usage is > 10 pp ahead of time
// or in the last 24 h before reset; context sits dim at the end from CONTEXT_SHOW_PERCENT.

const WINDOW_5H_MIN = 300
const WINDOW_WK_MIN = 7 * 1440
const WEEKLY_SHOW_BEFORE_RESET_MIN = 1440
export const CONTEXT_SHOW_PERCENT = 50
export const BUDGET_BAR_WIDTH = 14

export type BudgetBar = {
  label: '5h' | 'Wk'
  pct: number
  elapsedPct: number
  level: 'white' | 'yellow' | 'red'
  watermark: string
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, Number(v) || 0))
}

function elapsedOf(resetMinutes: number | null, windowMin: number): number {
  return resetMinutes != null ? ((windowMin - resetMinutes) / windowMin) * 100 : 0
}

export function markerLevel(pct: number, elapsedPct: number): BudgetBar['level'] {
  const diff = pct - elapsedPct
  if (diff <= 10) return 'white'
  if (diff <= 25) return 'yellow'
  return 'red'
}

/** "3 h 39 m" / "6 d 20 h" — the watermark inside a bar. */
export function formatResetSpaced(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—'
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`
}

/** The bars the card would draw for this budget at `now`; empty when every window is omitted. */
export function budgetBars(b: Budget | null, now: number): BudgetBar[] {
  if (!b) return []
  const minsTo = (t: number | null | undefined) => (typeof t === 'number' ? Math.max(0, Math.round((t - now) / 60_000)) : null)
  const bars: BudgetBar[] = []
  if (b.fiveHour !== null) {
    const r = minsTo(b.fiveHourResetsAt)
    const e = elapsedOf(r, WINDOW_5H_MIN)
    if (!(b.fiveHour < 50 && (r == null || r > 60))) {
      bars.push({ label: '5h', pct: b.fiveHour, elapsedPct: e, level: r == null ? 'white' : markerLevel(b.fiveHour, e), watermark: formatResetSpaced(r) })
    }
  }
  if (b.weekly !== null) {
    const r = minsTo(b.weeklyResetsAt)
    const e = elapsedOf(r, WINDOW_WK_MIN)
    const level = markerLevel(b.weekly, e)
    if (r != null && (level !== 'white' || r <= WEEKLY_SHOW_BEFORE_RESET_MIN)) {
      bars.push({ label: 'Wk', pct: b.weekly, elapsedPct: e, level, watermark: formatResetSpaced(r) })
    }
  }
  return bars
}

/** Terminal glyph bar: ▰ time elapsed · │ usage marker · ▱ time left (the card's terminal fallback). */
export function budgetGlyphBar(pct: number, elapsedPct: number, width = BUDGET_BAR_WIDTH): string {
  const usagePos = Math.min(width - 1, Math.round((clampPct(pct) / 100) * width))
  const elapsedEnd = Math.round((clampPct(elapsedPct) / 100) * width)
  let bar = ''
  for (let i = 0; i < width; i++) bar += i === usagePos ? '│' : i < elapsedEnd ? '▰' : '▱'
  return bar
}

const BAR = { w: 220, h: 12, track: '#2b2d3a', fill: '#4a5384', watermark: '#7d84a8', white: '#ffffff', yellow: '#e6c36a', red: '#e07a7a' }

/** The card's bar as SVG: lilac time fill with the moving sheen, usage marker, reset watermark. */
export function budgetBarSvg(bar: BudgetBar): string {
  const fillW = Math.round((clampPct(bar.elapsedPct) / 100) * BAR.w)
  const x = Math.min(BAR.w - 3, Math.round((clampPct(bar.pct) / 100) * BAR.w))
  const y = 6
  const h = BAR.h + 12
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR.w}" height="${h}" viewBox="0 0 ${BAR.w} ${h}">` +
    `<defs><clipPath id="f"><rect x="0" y="${y}" width="${fillW}" height="${BAR.h}" rx="5"/></clipPath></defs>` +
    `<rect x="0" y="${y}" width="${BAR.w}" height="${BAR.h}" rx="5" fill="${BAR.track}"/>` +
    `<rect x="0" y="${y}" width="${fillW}" height="${BAR.h}" rx="5" fill="${BAR.fill}"/>` +
    `<g clip-path="url(#f)"><rect x="-24" y="${y}" width="24" height="${BAR.h}" fill="#ffffff" fill-opacity="0.12">` +
    `<animate attributeName="x" from="-24" to="${BAR.w}" dur="4s" repeatCount="indefinite"/></rect></g>` +
    `<text x="${BAR.w - 6}" y="${y + 10}" text-anchor="end" font-size="11" font-family="system-ui,sans-serif" fill="${BAR.watermark}">${bar.watermark}</text>` +
    `<rect x="${x}" y="0" width="3" height="${h}" rx="2" fill="${BAR[bar.level]}"/>` +
    `</svg>`
  )
}

/** Screen-reader text of one bar, as the card's tooltip. */
export function budgetBarAlt(bar: BudgetBar): string {
  return `${bar.label}: ${Math.round(bar.pct)} % used · resets in ${bar.watermark}`
}

/** "🧠 context 72 %" from CONTEXT_SHOW_PERCENT on; null below. */
export function contextNote(b: Budget | null): string | null {
  if (!b || b.context === null || b.context < CONTEXT_SHOW_PERCENT) return null
  return `🧠 context ${b.context} %`
}

/** One terminal line for the band: the card's markdown budget line plus context; null when nothing shows. */
export function budgetLine(b: Budget | null, now: number): string | null {
  if (!b) return null
  const bars = budgetBars(b, now)
  const segs = bars.map(x => `${x.label} ${budgetGlyphBar(x.pct, x.elapsedPct)} ${x.watermark}`)
  const ctx = contextNote(b)
  if (ctx) segs.push(ctx)
  if (!segs.length) return null
  return (bars.some(x => x.level !== 'white') ? '⚠ ' : '') + segs.join('   ')
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
  // The worktree this session works in is never "open work" to clean up: it is in use.
  const risk = (Array.isArray(entry.atRisk) ? entry.atRisk : []).filter(
    x => x && !((x as { path?: string }).path && (here === norm((x as { path: string }).path) || here.startsWith(`${norm((x as { path: string }).path)}/`))),
  )
  const dirty = risk.filter(x => (x.dirty || 0) > 0).length
  const remote = Array.isArray(entry.remoteOnly) ? entry.remoteOnly.length : 0
  return { branches: risk.length - dirty + remote, worktrees: dirty, ageHours: Math.floor((now - t) / 3_600_000) }
}

/** Status-line text; null when nothing is open. */
export function hygieneLine(h: Hygiene | null): string | null {
  if (!h || h.branches + h.worktrees === 0) return null
  const parts: string[] = []
  if (h.branches > 0) parts.push(`${h.branches} open ${h.branches === 1 ? 'branch' : 'branches'}`)
  if (h.worktrees > 0) parts.push(`${h.worktrees} dirty ${h.worktrees === 1 ? 'worktree' : 'worktrees'}`)
  return `devops: ${parts.join(' · ')}`
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

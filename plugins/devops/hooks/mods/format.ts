/**
 * Pure, deterministic text for the devops mods: no `$`, no clock, no model.
 * Every number shown comes from the arguments (engine events or files the
 * plugin's scripts already write), never from memory.
 */
import type { AgentRow, Budget, CardButton, CardView, CleanupHistory, Hygiene, PlanStep, Progress, RunMarker, ShipView } from '../../types/index'

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

/** One pane row: status, type, model, elapsed, description; `count` = an optional "×n" column. */
export function agentRow(a: AgentRow, now: number, count = ''): string {
  const end = typeof a.endedAt === 'number' ? a.endedAt : now
  const model = a.model ? ` · ${a.model}` : ''
  return `${a.status.padEnd(9)} ${count}${a.type}${model} · ${elapsed(end - a.startedAt)} · ${a.description}`
}

/**
 * Pane rows with content-equal rows (same status, type, model and description) merged into
 * one, which carries the latest run's elapsed time and a "×n" marker. The marker is its own
 * fixed-width column after the status, present on every row once any row is merged, so the
 * columns stay aligned. Order: where each group first appeared.
 */
export function agentRows(list: readonly AgentRow[], now: number): Array<{ text: string; isDone: boolean }> {
  const groups: Array<{ key: string; row: AgentRow; count: number }> = []
  for (const a of list) {
    const key = [a.status, a.type, a.model, a.description].join('\u0000')
    const g = groups.find(x => x.key === key)
    if (g) {
      g.count++
      g.row = a
    } else groups.push({ key, row: a, count: 1 })
  }
  const width = Math.max(...groups.map(g => (g.count > 1 ? `×${g.count}`.length : 0)), 0)
  return groups.map(g => {
    const mark = width ? `${g.count > 1 ? `×${g.count}` : ''}`.padEnd(width) + ' ' : ''
    return { text: agentRow(g.row, now, mark), isDone: typeof g.row.endedAt === 'number' }
  })
}

/** A background Bash run that is one of the concept page's own watchers (waker, pulser, bridge server). */
export function isWatcherCommand(command: unknown): boolean {
  return typeof command === 'string' && /concept-(watch|tick)\.js|concept-server\.py/.test(command)
}

/** A task notification's status that means the run failed (a watcher toasts only then). */
export function isFailedStatus(status: string): boolean {
  return /fail|error|kill|crash/i.test(status || '')
}

/** Passive Spike 1: a main turn that starts after this long without one is measured. */
export const SPIKE_PAUSE_MS = 50 * 60_000

/**
 * One row of ~/.claude/devops-mods-spike.jsonl for the first request of a main turn that
 * followed a pause of `gapMs`: the share of its prompt the cache served (read / all input).
 * Pass = ≥ 0.95 (docs/dev/mods.md § Spike 1). No model call: the usage is the turn's own.
 */
export function passiveSpikeRow(
  gapMs: number,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; model?: string },
  budget: Budget | null,
  ts: number,
): Record<string, unknown> {
  const read = usage.cache_read_input_tokens || 0
  const write = usage.cache_creation_input_tokens || 0
  const input = usage.input_tokens || 0
  const all = read + write + input
  const share = all ? Math.round((read / all) * 1000) / 1000 : null
  return {
    ts: new Date(ts).toISOString(),
    mode: 'passive',
    pause_min: Math.round(gapMs / 60_000),
    model: usage.model || null,
    cache_read_input_tokens: read,
    cache_creation_input_tokens: write,
    input_tokens: input,
    output_tokens: usage.output_tokens || 0,
    cache_read_share: share,
    pass: share === null ? null : share >= 0.95,
    five_hour: budget ? budget.fiveHour : null,
    weekly: budget ? budget.weekly : null,
  }
}

/** The budget from one `session.measure` (or `$.session.usage()`) reading. */
export function budgetFrom(m: {
  context?: { percent?: number; tokens?: number; window?: number }
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
    contextTokens: m.context && Number.isFinite(m.context.tokens) ? (m.context.tokens as number) : null,
    contextWindow: m.context && Number.isFinite(m.context.window) ? (m.context.window as number) : null,
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

/** The bar's drawn size in CSS px: an interactive Svg sits in a frame that takes no size from the markup. */
export const BUDGET_BAR_SIZE = { width: BAR.w, height: BAR.h + 12 } as const

/** Screen-reader text of one bar, as the card's tooltip. */
export function budgetBarAlt(bar: BudgetBar, loc: Locale = 'en'): string {
  return tr(loc, 'barAlt', { label: bar.label, p: Math.round(bar.pct), w: bar.watermark })
}

/** One terminal line for the band's budget bars (the card's markdown line); null when no bar shows. The context has its own ring. */
export function budgetLine(b: Budget | null, now: number): string | null {
  if (!b) return null
  const bars = budgetBars(b, now)
  if (!bars.length) return null
  return (bars.some(x => x.level !== 'white') ? '⚠ ' : '') + bars.map(x => `${x.label} ${budgetGlyphBar(x.pct, x.elapsedPct)} ${x.watermark}`).join('   ')
}

// --- Completion card mirror: the card tool's own result, never rebuilt. ---

const CARD_POINTS_MAX = 3
const STATUS_HEAD = /^(?:🟩|👉|⏳|🟥|🟦)\s/u

function plain(s: unknown): string {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
}

/**
 * The card's template part from the text render_completion_card returned.
 * Desktop: the `#dc-card-data` JSON the widget mounts (title, heading, points,
 * buttons). Terminal: the markdown card's title and status heading, no buttons
 * (the markdown card has none either). Never the `answer`: it stays inline.
 * Null when the text holds no card (a refusal, a failed render).
 */
export function cardFromResult(text: unknown): CardView | null {
  if (typeof text !== 'string' || !text) return null
  const m = text.match(/<script type="application\/json" id="dc-card-data">([\s\S]*?)<\/script>/)
  if (m) {
    try {
      const d = JSON.parse(m[1] ?? '') as { ti?: string; at?: string; h?: string; pt?: unknown[]; bt?: Array<{ l?: string; p?: string; pr?: number }> }
      const heading = plain(d.h)
      if (!heading) return null
      const buttons: CardButton[] = (Array.isArray(d.bt) ? d.bt : [])
        .filter(b => b && plain(b.l) && typeof b.p === 'string' && b.p.trim())
        .map(b => ({ label: plain(b.l), prompt: String(b.p), primary: b.pr === 1 }))
      return {
        title: plain(d.ti),
        at: plain(d.at),
        heading,
        points: (Array.isArray(d.pt) ? d.pt : []).map(plain).filter(Boolean).slice(0, CARD_POINTS_MAX),
        buttons,
      }
    } catch {
      return null
    }
  }
  const lines = text.split(/\r?\n/).map(l => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim())
  const heading = lines.find(l => STATUS_HEAD.test(l) && l.includes(' — '))
  if (!heading) return null
  const titleLine = lines.find(l => l.startsWith('✨✨✨'))
  const title = titleLine ? titleLine.replace(/✨/g, '').trim() : ''
  const points = lines.filter(l => l.startsWith('› ')).map(l => l.slice(2).trim()).slice(0, CARD_POINTS_MAX)
  return { title, at: '', heading, points, buttons: [] }
}

/** A tool call is the card tool, whatever the server key the install gave it. */
export function isCardTool(tool: unknown): boolean {
  return typeof tool === 'string' && tool.startsWith('mcp__') && tool.endsWith('__render_completion_card')
}

type PlanInput = {
  items?: Array<{ content?: unknown; status?: unknown }>
  advance?: unknown
  done?: unknown
  start?: unknown
}

function stepStatus(s: unknown): PlanStep['status'] {
  return s === 'completed' || s === 'in_progress' ? s : 'pending'
}

/**
 * The task list after one `update_plan` call (the Desktop app's list):
 * `items` replaces it, `advance` completes the running step and starts the
 * next pending one, `done` / `start` (1-based) set steps out of order.
 */
export function applyPlan(steps: readonly PlanStep[], input: PlanInput): PlanStep[] {
  let next: PlanStep[] = Array.isArray(input.items)
    ? input.items.map(i => ({ text: plain(i && i.content), status: stepStatus(i && i.status) })).filter(s => s.text)
    : steps.map(s => ({ ...s }))
  const set = (i: number, status: PlanStep['status']) => {
    next = next.map((s, j) => (j === i ? { ...s, status } : s))
  }
  if (input.advance === true) {
    const cur = next.findIndex(s => s.status === 'in_progress')
    if (cur >= 0) set(cur, 'completed')
    const after = next.findIndex((s, i) => i > cur && s.status === 'pending')
    if (after >= 0) set(after, 'in_progress')
  }
  if (Array.isArray(input.done)) {
    for (const n of input.done) if (typeof n === 'number' && n >= 1 && n <= next.length) set(n - 1, 'completed')
  }
  const start = input.start
  if (typeof start === 'number' && start >= 1 && start <= next.length) {
    next = next.map(s => (s.status === 'in_progress' ? { ...s, status: 'pending' } : s))
    set(start - 1, 'in_progress')
  }
  return next
}

/** TodoWrite's list: the running step reads in its present-continuous form. */
export function todoSteps(todos: unknown): PlanStep[] {
  if (!Array.isArray(todos)) return []
  return todos
    .map((t: { content?: unknown; activeForm?: unknown; status?: unknown }) => {
      const status = stepStatus(t && t.status)
      const text = plain(status === 'in_progress' && t.activeForm ? t.activeForm : t && t.content)
      return { text, status }
    })
    .filter(s => s.text)
}

function baseName(p: unknown): string {
  const s = plain(p)
  return s ? s.replace(/\\/g, '/').split('/').filter(Boolean).pop() || s : ''
}

/** One short line for the tool call running now ("Bash · Run the tests"); '' for the task-list tools. */
export function activityOf(tool: string, input: Record<string, unknown>): string {
  if (tool.endsWith('__update_plan') || tool === 'TodoWrite' || isCardTool(tool)) return ''
  const name = tool.startsWith('mcp__') ? tool.split('__').slice(2).join('__') : tool
  const detail =
    plain(input.description) ||
    baseName(input.file_path) ||
    plain(input.pattern) ||
    plain(input.query) ||
    plain(input.url) ||
    plain(input.title)
  return (detail ? `${name} · ${detail}` : name).slice(0, 120)
}

/** "3/6 · Band neu layouten": the running step and where it stands; null without a list. */
export function stepLine(steps: readonly PlanStep[]): string | null {
  if (!steps.length) return null
  let i = steps.findIndex(s => s.status === 'in_progress')
  if (i < 0) {
    const done = steps.filter(s => s.status === 'completed').length
    if (done === steps.length) return `${done}/${steps.length} ✓`
    i = steps.findIndex(s => s.status === 'pending')
  }
  const step = steps[i]
  return step ? `${i + 1}/${steps.length} · ${step.text}` : null
}

/** The band's working line: the step, else the running tool, else a bare marker. */
export function workingLine(p: Progress | null): { head: string; detail: string } {
  const step = p ? stepLine(p.steps) : null
  const act = p ? p.activity : ''
  if (step) return { head: step, detail: act }
  return { head: act || '…', detail: '' }
}

/**
 * The hourglass that turns while Claude works: the ⏳ emoji of the card and its titles, drawn in
 * the interactive frame (SMIL does not run in a plain image) and turning all the time, one full
 * turn per 8 s (slower than a flip, so it reads as "something is happening", not as a nervous tic).
 */
export const HOURGLASS_SIZE = 18
export const HOURGLASS_TURN_SECONDS = 8
export function hourglassSvg(): string {
  const n = HOURGLASS_SIZE
  const c = n / 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}">` +
    `<g><text x="${c}" y="${n - 4}" text-anchor="middle" font-size="${n - 4}" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">⏳</text>` +
    `<animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="${HOURGLASS_TURN_SECONDS}s" repeatCount="indefinite"/>` +
    `</g></svg>`
  )
}

/** The line stays this long after the daily report (dimmed with its age from 24 h on), then it goes. */
const ORPHAN_MAX_AGE_MS = 72 * 3_600_000
const ORPHAN_FRESH_MS = 24 * 3_600_000
/** Safety copies count once they are this old, as ss.orphan.nudge.js does (a fresh one is the live session's net). */
const UNDECIDED_AFTER_DAYS = 3

function norm(p: string): string {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** park-register.js isUndecided, mirrored: an autosave copy, or a legacy / covered / nudged one not marked ARCHIVED. */
export function isUndecidedCopy(p: { branch?: string; reason?: string; legacy?: boolean; coveredBy?: unknown; nudge?: unknown }): boolean {
  const name = String((p && p.branch) || '').replace(/^origin\//, '')
  if (name.startsWith('parked/autosave/')) return true
  if (/ARCHIVED/.test(String((p && p.reason) || '')) && !(p && p.nudge)) return false
  return Boolean(p && (p.legacy || p.coveredBy || p.nudge))
}

const INACTIVE_AFTER_DAYS = 1
const AGENT_UNIT = /\/worktrees\/agent-|(^|\/)(worktree-)?agent-[0-9a-f]/i

type RiskEntry = {
  kind?: string
  branch?: string | null
  path?: string | null
  state?: string
  dirty?: number
  live?: boolean
  idleDays?: number
  broken?: boolean
}

function isBroken(x: RiskEntry): boolean {
  return x.broken === true || x.state === 'broken' || x.state === 'prunable'
}

function isAgentUnit(x: RiskEntry): boolean {
  return AGENT_UNIT.test(`${String(x.path || '').replace(/[\\]/g, '/')} ${x.branch || ''}`)
}

/** What kind of leftover an inactive unmerged entry is: the cause the learn offer counts. */
export function causeOf(x: RiskEntry): string {
  if (isAgentUnit(x)) return 'agent worktree'
  return x.kind === 'worktree' || x.path ? 'session worktree' : 'branch'
}

/**
 * B12: unlanded or uncommitted work that no live session uses and that has been idle for a day
 * or more (`idleDays` missing = inactive). Merged leftovers never count here.
 */
export function isInactiveUnmerged(x: RiskEntry): boolean {
  if (!x || x.live === true) return false
  const unmerged = x.state === 'unlanded' || x.state === 'partial' || (x.dirty || 0) > 0
  if (!unmerged) return false
  return typeof x.idleDays !== 'number' || x.idleDays >= INACTIVE_AFTER_DAYS
}

/**
 * Open branches, dirty worktrees and undecided safety copies of the current repo from
 * ~/.claude/orphan-report.json, counted as ss.orphan.nudge.js `counts` does
 * (unlanded = atRisk − dirty + remoteOnly; copies = parked ≥ 3 days and undecided), so
 * band, status line and nudge name the same numbers. null for a missing report, one older
 * than 72 h, or an unknown repo; from 24 h on `ageHours` makes the line say how old it is.
 * Also carries what the band needs: agent / broken carve-outs, landed leftovers, the inactive
 * unmerged entries and their causes, the report's time and the repo's path.
 */
export function hygieneFrom(report: unknown, cwd: string, now: number): Hygiene | null {
  const r = report as { generatedAt?: string; repos?: unknown[] } | null
  if (!r || !Array.isArray(r.repos)) return null
  const t = Date.parse(r.generatedAt || '')
  if (!Number.isFinite(t) || now - t > ORPHAN_MAX_AGE_MS) return null
  const here = norm(cwd)
  const entry = (r.repos as Array<{ path?: string; atRisk?: RiskEntry[]; remoteOnly?: unknown[]; parked?: Array<{ ageDays?: number }>; landedLeftovers?: number }>)
    .filter(e => e && e.path && (here === norm(e.path) || here.startsWith(`${norm(e.path)}/`)))
    .sort((a, b) => norm(b.path as string).length - norm(a.path as string).length)[0]
  if (!entry) return null
  // The worktree this session works in is never "open work" to clean up: it is in use.
  const risk = (Array.isArray(entry.atRisk) ? entry.atRisk : []).filter(
    x => x && x.live !== true && !(x.path && (here === norm(x.path) || here.startsWith(`${norm(x.path)}/`))),
  )
  const dirty = risk.filter(x => (x.dirty || 0) > 0).length
  const remote = Array.isArray(entry.remoteOnly) ? entry.remoteOnly.length : 0
  const parked = Array.isArray(entry.parked) ? entry.parked : []
  const copies = parked.filter(p => p && (p.ageDays || 0) >= UNDECIDED_AFTER_DAYS && isUndecidedCopy(p as never)).length
  const idle = risk.filter(isInactiveUnmerged)
  const causes: Record<string, number> = {}
  for (const x of idle) causes[causeOf(x)] = (causes[causeOf(x)] || 0) + 1
  const broken = risk.filter(isBroken).length
  return {
    branches: risk.length - dirty + remote,
    worktrees: dirty,
    copies,
    ageHours: Math.floor((now - t) / 3_600_000),
    agent: risk.filter(x => !isBroken(x) && isAgentUnit(x)).length,
    broken,
    landed: Number.isFinite(entry.landedLeftovers) ? Math.max(0, Math.floor(entry.landedLeftovers as number)) : 0,
    inactive: idle.length,
    causes,
    reportAt: t,
    repo: entry.path as string,
  }
}

/**
 * Status-line text, "devops: …"; prefix false for the band, which carries its own mark.
 * A report 24 h or older adds "as of N h". Null when nothing is open.
 */
export function hygieneLine(h: Hygiene | null, prefix = true, loc: Locale = 'en'): string | null {
  const copies = (h && h.copies) || 0
  if (!h || h.branches + h.worktrees + copies === 0) return null
  const parts: string[] = []
  const pick = (n: number, one: StrKey, many: StrKey) => tr(loc, n === 1 ? one : many, { n })
  if (h.branches > 0) parts.push(pick(h.branches, 'stBranch1', 'stBranchN'))
  if (h.worktrees > 0) parts.push(pick(h.worktrees, 'stDirty1', 'stDirtyN'))
  if (copies > 0) parts.push(pick(copies, 'stCopy1', 'stCopyN'))
  const aged = h.ageHours * 3_600_000 >= ORPHAN_FRESH_MS ? ` · ${tr(loc, 'asOf', { h: h.ageHours })}` : ''
  return `${prefix ? 'devops: ' : ''}${parts.join(' · ')}${aged}`
}

/** The plan subagent's brief: read only, a numbered plan, nothing changed. */
export function cleanupPlanPrompt(root: string, cwd: string): string {
  return [
    `You plan the branch and worktree cleanup of the git repository at ${root}. This run is READ-ONLY:`,
    'run only read commands (git status, git worktree list --porcelain, git branch -vv, git log, git cherry, gh pr list).',
    'Do not commit, delete, prune, push or change any file.',
    'Rules of the devops cleanup flow: a branch or worktree may go only when its work is landed in the default branch',
    '(merged, or the same tree) and it has no uncommitted or unpushed changes. Uncommitted changes are never discarded:',
    'list them for the user. Never touch the worktree ' + cwd + ' (this session) nor a worktree another running Claude',
    'session uses (its folder has a recent .claude/ session marker or is the cwd of a running claude process).',
    'Answer in German markdown, no preamble:',
    '## Plan — numbered actions, each: what, the exact command(s), and why it is safe.',
    '## Braucht deine Entscheidung — everything that is not safe, with the evidence (uncommitted files, unmerged commits).',
    'If nothing is safe to remove, say so in one line under Plan.',
  ].join('\n')
}

/** The apply subagent's brief: exactly the approved plan, re-verified per action. */
export function cleanupApplyPrompt(root: string, cwd: string, plan: string): string {
  return [
    `Execute the approved cleanup plan below for the git repository at ${root}, action by action, in order.`,
    'Before each removing command re-check its safety condition (landed in the default branch, no uncommitted or',
    'unpushed changes); if it no longer holds, skip that action and say why. Run no command that is not in the plan,',
    'never force-delete an unmerged branch, never discard uncommitted changes, never touch ' + cwd + '.',
    'Items under "Braucht deine Entscheidung" are NOT approved: skip them.',
    'Answer in German markdown, no preamble: one line per action, ✓ done or ⏭ skipped with the reason.',
    '',
    'APPROVED PLAN:',
    plan,
  ].join('\n')
}

/** Toast text when a cleanup subagent ends. */
export function cleanupToast(phase: 'planned' | 'done' | 'failed', loc: Locale = 'en'): string {
  return tr(loc, phase === 'planned' ? 'toastPlanned' : phase === 'done' ? 'toastDone' : 'toastFailed')
}

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
      // Header format: "[ss.orphan.nudge] … verbatim …", "[ss.version.notice] … verbatim …, once:" — the line after it.
      if (/^\[[a-z0-9_.-]+\].*verbatim/i.test(l)) {
        const next = lines.slice(i + 1).find(Boolean)
        if (next && !next.startsWith('[')) out.push(next)
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
  return [...new Set(out)].map(t => t.slice(0, 200))
}

// --- Locales (B15): one string table, seven languages, picked from the Claude Code `language` setting. ---

export const LOCALES = ['en', 'de', 'es', 'fr', 'pt', 'ja', 'zh'] as const
export type Locale = (typeof LOCALES)[number]

// Order: en, de, es, fr, pt, ja, zh. `{n}` etc. are filled by tr().
const TABLE = {
  ctx: ['Context', 'Kontext', 'Contexto', 'Contexte', 'Contexto', 'コンテキスト', '上下文'],
  compact: ['Compact', 'Kompaktieren', 'Compactar', 'Compacter', 'Compactar', 'コンパクト化', '压缩'],
  cleanupBtn: ['Clean up', 'Aufräumen', 'Limpiar', 'Nettoyer', 'Limpar', '整理する', '清理'],
  junk: ['{n} leftovers', '{n} Altlasten', '{n} restos', '{n} restes', '{n} restos', '残り {n} 件', '{n} 项遗留'],
  last: ['Last:', 'Zuletzt:', 'Último:', 'Dernier :', 'Último:', '直近:', '最近：'],
  rowAgent: ['Agent worktrees', 'Agent-Worktrees', 'Worktrees de agentes', "Worktrees d'agents", 'Worktrees de agentes', 'エージェントの worktree', '代理 worktree'],
  rowCopies: ['Safety copies', 'Sicherungskopien', 'Copias de seguridad', 'Copies de sauvegarde', 'Cópias de segurança', 'バックアップ', '备份副本'],
  rowBranches: ['Branches', 'Branches', 'Ramas', 'Branches', 'Branches', 'ブランチ', '分支'],
  rowBroken: ['Broken worktrees', 'defekte Worktrees', 'Worktrees dañados', 'Worktrees défectueux', 'Worktrees quebrados', '壊れた worktree', '损坏的 worktree'],
  ruleInactive: [
    'Trigger: {n} unmerged, inactive for over a day',
    'Auslöser: {n} ungemergt und seit über einem Tag inaktiv',
    'Motivo: {n} sin fusionar e inactivos desde hace más de un día',
    "Déclencheur : {n} non fusionnés, inactifs depuis plus d'un jour",
    'Motivo: {n} sem merge e inativos há mais de um dia',
    '理由: 未マージで1日以上動いていないもの {n} 件',
    '触发：{n} 项未合并且超过一天无活动',
  ],
  ruleCount: [
    'Trigger: {n} leftovers, more than {t}',
    'Auslöser: {n} Altlasten, mehr als {t}',
    'Motivo: {n} restos, más de {t}',
    'Déclencheur : {n} restes, plus de {t}',
    'Motivo: {n} restos, mais de {t}',
    '理由: 残骸 {n} 件（しきい値 {t} 超）',
    '触发：{n} 项遗留，超过 {t}',
  ],
  working: ['Claude is working', 'Claude arbeitet', 'Claude está trabajando', 'Claude travaille', 'Claude está trabalhando', 'Claude が作業中', 'Claude 正在工作'],
  ringAlt: [
    'Context: {p} % of the auto-compact limit',
    'Kontext: {p} % des Auto-Compact-Limits',
    'Contexto: {p} % del límite de compactación automática',
    'Contexte : {p} % de la limite de compactage automatique',
    'Contexto: {p} % do limite de compactação automática',
    'コンテキスト: 自動コンパクト上限の {p} %',
    '上下文：自动压缩上限的 {p} %',
  ],
  stBranch1: ['{n} open branch', '{n} offener Branch', '{n} rama abierta', '{n} branche ouverte', '{n} branch aberto', '未完了ブランチ {n}', '{n} 个未完成分支'],
  stBranchN: ['{n} open branches', '{n} offene Branches', '{n} ramas abiertas', '{n} branches ouvertes', '{n} branches abertos', '未完了ブランチ {n}', '{n} 个未完成分支'],
  stDirty1: ['{n} dirty worktree', '{n} unsauberer Worktree', '{n} worktree con cambios', '{n} worktree modifié', '{n} worktree sujo', '未コミット worktree {n}', '{n} 个有改动的 worktree'],
  stDirtyN: ['{n} dirty worktrees', '{n} unsaubere Worktrees', '{n} worktrees con cambios', '{n} worktrees modifiés', '{n} worktrees sujos', '未コミット worktree {n}', '{n} 个有改动的 worktree'],
  stCopy1: ['{n} undecided safety copy', '{n} offene Sicherungskopie', '{n} copia de seguridad sin decidir', '{n} copie de sauvegarde en attente', '{n} cópia de segurança pendente', '未判断のバックアップ {n}', '{n} 个待定备份副本'],
  stCopyN: ['{n} undecided safety copies', '{n} offene Sicherungskopien', '{n} copias de seguridad sin decidir', '{n} copies de sauvegarde en attente', '{n} cópias de segurança pendentes', '未判断のバックアップ {n}', '{n} 个待定备份副本'],
  asOf: ['as of {h} h', 'Stand vor {h} h', 'de hace {h} h', 'il y a {h} h', 'de {h} h atrás', '{h} 時間前の状態', '截至 {h} 小时前'],
  toastPlanned: [
    'devops cleanup: plan ready — review it in the Cleanup pane',
    'devops Aufräumen: Plan fertig — im Aufräumen-Bereich prüfen',
    'devops limpieza: plan listo — revísalo en el panel de limpieza',
    'devops nettoyage : plan prêt — à vérifier dans le volet Nettoyage',
    'devops limpeza: plano pronto — revise no painel de limpeza',
    'devops 整理: プランができました — 整理ペインで確認してください',
    'devops 清理：计划已就绪 — 请在清理面板中查看',
  ],
  toastDone: [
    'devops cleanup: done — result in the Cleanup pane',
    'devops Aufräumen: erledigt — Ergebnis im Aufräumen-Bereich',
    'devops limpieza: hecho — resultado en el panel de limpieza',
    'devops nettoyage : terminé — résultat dans le volet Nettoyage',
    'devops limpeza: concluída — resultado no painel de limpeza',
    'devops 整理: 完了 — 結果は整理ペインにあります',
    'devops 清理：完成 — 结果见清理面板',
  ],
  toastFailed: [
    'devops cleanup: the subagent stopped without a result',
    'devops Aufräumen: der Subagent hat ohne Ergebnis gestoppt',
    'devops limpieza: el subagente se detuvo sin resultado',
    "devops nettoyage : le sous-agent s'est arrêté sans résultat",
    'devops limpeza: o subagente parou sem resultado',
    'devops 整理: サブエージェントが結果なしで停止しました',
    'devops 清理：子代理未给出结果就停止了',
  ],
  toastLearn: [
    'devops learn: unmerged work keeps being left behind — offer in the Cleanup pane',
    'devops learn: ungemergte Arbeit bleibt wiederholt liegen — Angebot im Aufräumen-Bereich',
    'devops learn: el trabajo sin fusionar se queda atrás con frecuencia — oferta en el panel de limpieza',
    'devops learn : du travail non fusionné reste souvent en plan — proposition dans le volet Nettoyage',
    'devops learn: trabalho sem merge fica para trás com frequência — oferta no painel de limpeza',
    'devops learn: 未マージの作業が繰り返し残っています — 整理ペインに提案があります',
    'devops learn：未合并的工作反复被遗留 — 清理面板中有建议',
  ],
  permission: ['Permission request waiting', 'Berechtigungsanfrage wartet', 'Solicitud de permiso en espera', "Demande d'autorisation en attente", 'Pedido de permissão aguardando', '権限リクエストが待機中', '权限请求等待中'],
  finishedAfter: ['{what} finished after {t}', '{what} nach {t} fertig', '{what} terminó tras {t}', '{what} terminé après {t}', '{what} terminou após {t}', '{what} が {t} で完了', '{what} 用时 {t} 完成'],
  bgCommand: ['Background command {s}', 'Hintergrundbefehl {s}', 'Comando en segundo plano {s}', 'Commande en arrière-plan {s}', 'Comando em segundo plano {s}', 'バックグラウンドコマンド {s}', '后台命令 {s}'],
  paneIdle: ['No cleanup run yet.', 'Noch kein Aufräumlauf.', 'Aún no hay limpieza.', 'Aucun nettoyage pour le moment.', 'Nenhuma limpeza ainda.', '整理はまだ実行されていません。', '尚未运行清理。'],
  panePlanning: ['Opus is planning the cleanup (read-only)…', 'Opus plant das Aufräumen (nur lesend) …', 'Opus planifica la limpieza (solo lectura)…', 'Opus planifie le nettoyage (lecture seule)…', 'Opus planeja a limpeza (somente leitura)…', 'Opus が整理を計画中（読み取りのみ）…', 'Opus 正在规划清理（只读）…'],
  paneApplying: ['Opus is applying the approved plan…', 'Opus führt den freigegebenen Plan aus …', 'Opus aplica el plan aprobado…', 'Opus applique le plan approuvé…', 'Opus aplica o plano aprovado…', 'Opus が承認済みプランを実行中…', 'Opus 正在执行已批准的计划…'],
  panePlanned: ['Plan ready. Nothing has changed yet.', 'Plan fertig. Noch nichts verändert.', 'Plan listo. Aún no se ha cambiado nada.', "Plan prêt. Rien n'a encore changé.", 'Plano pronto. Nada foi alterado ainda.', 'プランができました。まだ何も変更していません。', '计划已就绪，尚未更改任何内容。'],
  paneDone: ['Cleanup applied.', 'Aufgeräumt.', 'Limpieza aplicada.', 'Nettoyage appliqué.', 'Limpeza aplicada.', '整理を実行しました。', '清理已完成。'],
  paneFailed: ['The cleanup stopped.', 'Das Aufräumen wurde abgebrochen.', 'La limpieza se detuvo.', "Le nettoyage s'est arrêté.", 'A limpeza parou.', '整理が停止しました。', '清理已停止。'],
  btnApply: ['Apply plan (deletes)', 'Plan ausführen (löscht)', 'Aplicar plan (borra)', 'Appliquer le plan (supprime)', 'Aplicar plano (apaga)', 'プランを実行（削除あり）', '执行计划（会删除）'],
  btnDiscard: ['Discard plan', 'Plan verwerfen', 'Descartar plan', 'Abandonner le plan', 'Descartar plano', 'プランを破棄', '放弃计划'],
  btnClose: ['Close', 'Schließen', 'Cerrar', 'Fermer', 'Fechar', '閉じる', '关闭'],
  btnPlan: ['Plan cleanup', 'Aufräumen planen', 'Planificar limpieza', 'Planifier le nettoyage', 'Planejar limpeza', '整理を計画', '规划清理'],
  btnReview: ['Review cleanup plan', 'Aufräum-Plan prüfen', 'Revisar el plan de limpieza', 'Vérifier le plan de nettoyage', 'Revisar o plano de limpeza', '整理プランを確認', '查看清理计划'],
  runPlanning: ['planning…', 'plant …', 'planificando…', 'planification…', 'planejando…', '計画中…', '规划中…'],
  runApplying: ['applying…', 'führt aus …', 'aplicando…', 'application…', 'aplicando…', '実行中…', '执行中…'],
  learnOffer: [
    'The same kind of unmerged work was left behind in {runs} cleanups: {cause}.',
    'Dieselbe Art ungemergter Arbeit blieb in {runs} Aufräumläufen liegen: {cause}.',
    'El mismo tipo de trabajo sin fusionar quedó atrás en {runs} limpiezas: {cause}.',
    'Le même type de travail non fusionné est resté en plan lors de {runs} nettoyages : {cause}.',
    'O mesmo tipo de trabalho sem merge ficou para trás em {runs} limpezas: {cause}.',
    '同じ種類の未マージ作業が {runs} 回の整理で残りました: {cause}。',
    '同一类未合并工作在 {runs} 次清理中被遗留：{cause}。',
  ],
  runBusy: [
    'A cleanup is already running in another session',
    'In einer anderen Session läuft schon ein Aufräumen',
    'Ya hay una limpieza en curso en otra sesión',
    'Un nettoyage est déjà en cours dans une autre session',
    'Já há uma limpeza em andamento em outra sessão',
    '別のセッションで整理がすでに実行中です',
    '另一个会话中已有清理在运行',
  ],
  barAlt: [
    '{label}: {p} % used · resets in {w}',
    '{label}: {p} % verbraucht · Reset in {w}',
    '{label}: {p} % usado · se restablece en {w}',
    '{label} : {p} % utilisé · réinitialisation dans {w}',
    '{label}: {p} % usado · reinicia em {w}',
    '{label}: {p} % 使用済み · {w} 後にリセット',
    '{label}：已用 {p} % · {w} 后重置',
  ],
  titleCleanup: ['Cleanup', 'Aufräumen', 'Limpieza', 'Nettoyage', 'Limpeza', '整理', '清理'],
  titleAgents: ['Agents', 'Agenten', 'Agentes', 'Agents', 'Agentes', 'エージェント', '代理'],
  titleShip: ['Ship / CI', 'Ship / CI', 'Ship / CI', 'Ship / CI', 'Ship / CI', 'Ship / CI', 'Ship / CI'],
  noAgents: ['No subagents in this session yet.', 'Noch keine Subagenten in dieser Session.', 'Aún no hay subagentes en esta sesión.', "Aucun sous-agent dans cette session pour l'instant.", 'Ainda não há subagentes nesta sessão.', 'このセッションにはまだサブエージェントがありません。', '此会话中还没有子代理。'],
  noShip: ['No ship data read yet.', 'Noch keine Ship-Daten gelesen.', 'Aún no se han leído datos de ship.', 'Aucune donnée de ship lue pour le moment.', 'Ainda não foram lidos dados de ship.', 'Ship のデータはまだ読み込まれていません。', '尚未读取 ship 数据。'],
  shipBranch: ['Branch: {b}', 'Branch: {b}', 'Rama: {b}', 'Branche : {b}', 'Branch: {b}', 'ブランチ: {b}', '分支：{b}'],
  unknown: ['unknown', 'unbekannt', 'desconocida', 'inconnue', 'desconhecido', '不明', '未知'],
  shipDone: ['Ship: {steps} done', 'Ship: {steps} erledigt', 'Ship: {steps} hecho', 'Ship : {steps} terminé', 'Ship: {steps} concluído', 'Ship: {steps} 完了', 'Ship：{steps} 已完成'],
  shipNone: ['Ship: no checkpoint', 'Ship: kein Checkpoint', 'Ship: sin punto de control', 'Ship : aucun point de contrôle', 'Ship: sem checkpoint', 'Ship: チェックポイントなし', 'Ship：无检查点'],
  shipNext: [' · next: {next}', ' · als Nächstes: {next}', ' · siguiente: {next}', ' · ensuite : {next}', ' · próximo: {next}', ' · 次: {next}', ' · 下一步：{next}'],
  prLine: [
    'PR #{n} {state}: {pass} passed, {fail} failed, {pending} pending',
    'PR #{n} {state}: {pass} bestanden, {fail} fehlgeschlagen, {pending} offen',
    'PR #{n} {state}: {pass} correctos, {fail} fallidos, {pending} pendientes',
    'PR #{n} {state} : {pass} réussis, {fail} échoués, {pending} en attente',
    'PR #{n} {state}: {pass} aprovados, {fail} falharam, {pending} pendentes',
    'PR #{n} {state}: 成功 {pass}、失敗 {fail}、保留 {pending}',
    'PR #{n} {state}：通过 {pass}，失败 {fail}，待定 {pending}',
  ],
  prNone: ['PR: none found (or gh unavailable)', 'PR: keiner gefunden (oder gh nicht verfügbar)', 'PR: ninguno (o gh no disponible)', 'PR : aucune trouvée (ou gh indisponible)', 'PR: nenhum encontrado (ou gh indisponível)', 'PR: 見つかりません（または gh が使えません）', 'PR：未找到（或 gh 不可用）'],
  refresh: ['Refresh', 'Aktualisieren', 'Actualizar', 'Actualiser', 'Atualizar', '更新', '刷新'],
  spawnFailed: ['Subagent not started: {why}', 'Subagent nicht gestartet: {why}', 'Subagente no iniciado: {why}', 'Sous-agent non démarré : {why}', 'Subagente não iniciado: {why}', 'サブエージェントを起動できませんでした: {why}', '子代理未启动：{why}'],
  finishedWord: ['finished', 'beendet', 'terminado', 'terminé', 'concluído', '完了', '已结束'],
  noAnswer: ['No answer.', 'Keine Antwort.', 'Sin respuesta.', 'Pas de réponse.', 'Sem resposta.', '回答がありません。', '没有回答。'],
  learnBtn: ['devops learn', 'devops learn', 'devops learn', 'devops learn', 'devops learn', 'devops learn', 'devops learn'],
} as const

export type StrKey = keyof typeof TABLE

/** The string `key` in `loc`, `{name}` placeholders filled; an unknown key or a gap falls back to English. */
export function tr(loc: Locale, key: StrKey, vars: Record<string, string | number> = {}): string {
  const row = TABLE[key] as readonly string[]
  const idx = LOCALES.indexOf(loc)
  const text = (idx >= 0 ? row[idx] : undefined) || row[0] || ''
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

const LOCALE_NAMES: Array<[Locale, RegExp]> = [
  ['de', /^(de\b|de[-_]|german|deutsch)/i],
  ['es', /^(es\b|es[-_]|spanish|espa[nñ]ol|castellano)/i],
  ['fr', /^(fr\b|fr[-_]|french|fran[cç]ais)/i],
  ['pt', /^(pt\b|pt[-_]|portuguese|portugu[eê]s)/i],
  ['ja', /^(ja\b|ja[-_]|japanese|日本語)/i],
  ['zh', /^(zh\b|zh[-_]|chinese|中文|简体|繁體|繁体)/i],
]

/** The band's language from the Claude Code `language` setting ("german", "de", "日本語" …); anything else is English. */
export function localeFrom(setting: unknown): Locale {
  const v = typeof setting === 'string' ? setting.trim() : ''
  if (!v) return 'en'
  const hit = LOCALE_NAMES.find(([, re]) => re.test(v))
  return hit ? hit[0] : 'en'
}

// --- Context ring (B5–B7): share of the effective auto-compact threshold. ---

/** Tokens Claude Code keeps free for the compaction summary below the window; only the default threshold uses it. */
export const COMPACT_BUFFER_TOKENS = 13_000
export const RING_AMBER_FROM = 80
export const RING_SIZE = 32
export const RING_CHIP_SIZE = 14

export type CompactEnv = {
  /** CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: compact at this share of the window. */
  pctOverride?: number | null
  /** The user's own auto-compact window in tokens (settings `autoCompactWindow` / CLAUDE_CODE_AUTO_COMPACT_WINDOW). */
  windowCap?: number | null
}

/** The token count where the session compacts, from the measured `window` and the user's own settings — never a model constant. */
export function compactThreshold(window: number, env: CompactEnv = {}): number {
  const cap = env.windowCap && env.windowCap > 0 ? Math.min(window, env.windowCap) : window
  const buffer = Math.min(COMPACT_BUFFER_TOKENS, cap * 0.1)
  let threshold = cap - buffer
  const pct = env.pctOverride
  if (typeof pct === 'number' && pct > 0 && pct <= 100) threshold = Math.min(threshold, (cap * pct) / 100)
  return Math.max(1, threshold)
}

/**
 * Ring percent: tokens in use ÷ the effective auto-compact threshold (100 = compacts now), capped at 100.
 * Without a measured window the plain context share stands in. Null when nothing was measured.
 */
export function ringPercent(b: Budget | null, env: CompactEnv = {}): number | null {
  if (!b) return null
  const window = typeof b.contextWindow === 'number' && b.contextWindow > 0 ? b.contextWindow : null
  const tokens =
    typeof b.contextTokens === 'number' ? b.contextTokens : window && b.context !== null ? (b.context / 100) * window : null
  if (window && tokens !== null) return Math.max(0, Math.min(100, Math.round((tokens / compactThreshold(window, env)) * 100)))
  return b.context === null ? null : Math.max(0, Math.min(100, b.context))
}

export type WorkState = { concept: boolean; changes: boolean; steps: boolean; settled?: boolean }

/**
 * B7: amber ring + Compact button from 80 % — only while work is open (an open concept page, unshipped
 * changes, open plan steps) and not right after a ship / released / finished card (🟩 heading), where a
 * compaction would only burn tokens.
 */
export function compactAdvised(pct: number | null, work: WorkState, card: CardView | null): boolean {
  if (pct === null || pct < RING_AMBER_FROM) return false
  if (card && /^🟩/u.test(card.heading)) return false
  // After a ship the branch stays "ahead" of main (squash merge) and the plan is done: only an open concept page still counts.
  if (work.settled) return work.concept
  return work.concept || work.changes || work.steps
}

const RING = { track: '#3a3a3a', neutral: '#9a9a9a', amber: '#e6c36a' }

/** The ring as SVG: grey track, arc from 12 o'clock; amber when advised. `size` in CSS px. */
export function ringSvg(pct: number, amber: boolean, size = RING_SIZE): string {
  const stroke = Math.max(2, Math.round(size / 7))
  const r = (size - stroke) / 2
  const c = size / 2
  const len = 2 * Math.PI * r
  const arc = (Math.max(0, Math.min(100, pct)) / 100) * len
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${RING.track}" stroke-width="${stroke}"/>` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${amber ? RING.amber : RING.neutral}" stroke-width="${stroke}" stroke-linecap="round" ` +
    `stroke-dasharray="${arc.toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>` +
    `</svg>`
  )
}

// --- Cleanup block (B11, B12): what shows, and why. ---

/** `cleanup.nudgeThreshold` default of devops-config.js. */
export const NUDGE_THRESHOLD_DEFAULT = 50

/** The nudge threshold from config files in order project > global; default 50. Same validity as devops-config.js (integer 1..100000). */
export function nudgeThresholdFrom(...layers: unknown[]): number {
  for (const l of layers) {
    const sec = l && typeof l === 'object' ? (l as { cleanup?: { nudgeThreshold?: unknown } }).cleanup : undefined
    const v = sec && typeof sec === 'object' ? sec.nudgeThreshold : undefined
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 100000) return v
  }
  return NUDGE_THRESHOLD_DEFAULT
}

export type CleanupView = {
  /** The number the band, the status line and ss.orphan.nudge.js name. */
  n: number
  rows: Array<{ key: 'rowAgent' | 'rowCopies' | 'rowBranches' | 'rowBroken'; n: number }>
  rule: { kind: 'inactive' | 'count'; n: number; t: number }
}

/**
 * B12: the cleanup block shows when inactive unmerged work exists (always), or when all leftovers
 * (open work, copies and landed leftovers hygiene would remove) exceed `threshold`; otherwise null.
 */
export function cleanupView(h: Hygiene | null, threshold: number): CleanupView | null {
  if (!h) return null
  const copies = h.copies || 0
  const n = h.branches + h.worktrees + copies
  const total = n + (h.landed || 0)
  const inactive = h.inactive || 0
  if (n === 0 && inactive === 0) return null
  if (inactive === 0 && total <= threshold) return null
  const agent = h.agent || 0
  const broken = h.broken || 0
  const rows = [
    { key: 'rowAgent' as const, n: agent },
    { key: 'rowCopies' as const, n: copies },
    { key: 'rowBranches' as const, n: Math.max(0, h.branches + h.worktrees - agent - broken) },
    { key: 'rowBroken' as const, n: broken },
  ].filter(r => r.n > 0)
  return { n, rows, rule: inactive > 0 ? { kind: 'inactive', n: inactive, t: threshold } : { kind: 'count', n: total, t: threshold } }
}

export function ruleText(v: CleanupView, loc: Locale): string {
  return tr(loc, v.rule.kind === 'inactive' ? 'ruleInactive' : 'ruleCount', { n: v.rule.n, t: v.rule.t })
}

// --- Cross-session run marker (B13) and learn history (B14). ---

export const RUN_STALE_MS = 2 * 3_600_000

export function sameRepo(a: string, b: string): boolean {
  return !!a && !!b && norm(a) === norm(b)
}

/** Parses ~/.claude/devops-cleanup-run.json; null for anything that is not a marker. */
export function markerFrom(raw: unknown): RunMarker | null {
  const m = raw as Partial<RunMarker> | null
  if (!m || typeof m.repo !== 'string' || typeof m.session !== 'string' || !Number.isFinite(m.startedAt)) return null
  return { repo: m.repo, session: m.session, startedAt: m.startedAt as number, ...(Number.isFinite(m.endedAt) ? { endedAt: m.endedAt as number } : {}) }
}

/** A run is on right now: not ended, not older than 2 h (a crashed session never blocks for good). */
export function markerActive(m: RunMarker | null, repo: string, now: number): boolean {
  return !!m && sameRepo(m.repo, repo) && m.endedAt === undefined && now - m.startedAt < RUN_STALE_MS
}

/**
 * Whether this session's band hides the cleanup block: a run of another session is on for this repo,
 * or a finished run's end is not yet followed by a newer orphan report. Stale after 2 h. The session
 * that started the run keeps its own run state visible while it runs.
 */
export function markerHides(m: RunMarker | null, repo: string, sid: string, reportAt: number, now: number): boolean {
  if (!m || !sameRepo(m.repo, repo) || now - m.startedAt >= RUN_STALE_MS) return false
  if (m.endedAt === undefined) return m.session !== sid
  return reportAt <= m.endedAt
}

export const HISTORY_KEEP = 40
export const LEARN_MIN_LEFTOVERS = 3
export const LEARN_MIN_RUNS = 2

export function historyFrom(raw: unknown): CleanupHistory {
  const runs = raw && typeof raw === 'object' ? (raw as { runs?: unknown }).runs : null
  return {
    runs: (Array.isArray(runs) ? runs : [])
      .filter(r => r && typeof r.repo === 'string' && Number.isFinite(r.at) && r.causes && typeof r.causes === 'object')
      .slice(-HISTORY_KEEP),
  }
}

export function addRun(h: CleanupHistory, run: { repo: string; at: number; causes: Record<string, number> }): CleanupHistory {
  return { runs: [...h.runs, run].slice(-HISTORY_KEEP) }
}

/**
 * B14: the cause the latest run of `repo` left ≥ 3 inactive UNMERGED leftovers of, when an earlier run
 * did too (≥ 2 runs). Merged leftovers and removals for age or count never reach `causes`, so they never count.
 */
export function learnCause(h: CleanupHistory, repo: string): { cause: string; runs: number } | null {
  const mine = h.runs.filter(r => sameRepo(r.repo, repo))
  const last = mine[mine.length - 1]
  if (!last) return null
  const hits = (c: string) => mine.filter(r => (r.causes[c] || 0) >= LEARN_MIN_LEFTOVERS).length
  const cause = Object.keys(last.causes)
    .filter(c => (last.causes[c] || 0) >= LEARN_MIN_LEFTOVERS && hits(c) >= LEARN_MIN_RUNS)
    .sort((a, b) => (last.causes[b] || 0) - (last.causes[a] || 0))[0]
  return cause ? { cause, runs: hits(cause) } : null
}

/** The prompt of the learn offer: the cause named, the trigger phrase the router knows. */
export function learnPrompt(cause: string, runs: number): string {
  return [
    'devops learn',
    `Cleanup runs keep finding unmerged work that nobody continues: ${runs} runs each left at least ${LEARN_MIN_LEFTOVERS} inactive, unmerged leftovers of the same cause: "${cause}".`,
    'Find out why this work is not landed (what the sessions skip or forget) and propose a rule or workflow fix that stops it.',
  ].join('\n')
}

/** B10: "Last: {title} · {time}", dim, left of the idle row; '' without a last card. */
export function lastLine(last: { title: string; at: string } | null, loc: Locale): string {
  if (!last || !last.title) return ''
  return `${tr(loc, 'last')} ${last.title}${last.at ? ` · ${last.at}` : ''}`
}

/** The cleanup-count label "42 Altlasten" in `loc`. */
export function junkLabel(n: number, loc: Locale): string {
  return tr(loc, 'junk', { n })
}

/**
 * B17: a pure mode-activation card (batch collect mode `👉 📚 Batch — sammelt …`) whose points are usage
 * hints, not decisions: the band folds them behind a `?`. Ship / decision / concept / test cards (their steps are the CTA) keep their CTA points open.
 */
export function isHintCard(c: { heading: string; points: readonly string[] } | null): boolean {
  return !!c && c.points.length > 0 && /^(?:👉|🟦)\s*📚\s*Batch/u.test(c.heading)
}

/** A ship / released / finished card (🟩 heading): the work it reports is shipped. */
export function isShippedCard(c: { heading: string } | null): boolean {
  return !!c && /^🟩/u.test(c.heading)
}

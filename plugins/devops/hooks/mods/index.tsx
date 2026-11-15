/**
 * devops mods, stage 1 (feature `claude-mods`, alpha): display only.
 *
 * Draws what the plugin already knows, changes nothing it does: every shell
 * hook in hooks.json runs exactly as without this module, the completion card
 * stays with stop.flow.guard, and every hook here passes its event on
 * unchanged (`return next(e)` / the result of `next(e)` as it came).
 *
 * Gate: each hook first asks `featureAllowed($)` (gate.ts, the same rules as
 * hooks/lib/features.js). Closed → the hook passes through and draws nothing;
 * the slash commands are only registered when open. A failing hook is skipped
 * by the engine, so the plugin works fully without this module.
 *
 * Surfaces:
 *   Pane `devops-agents`  /devops-agents   this session's subagents (type, model, elapsed, status)
 *   Pane `devops-ship`    /devops-ship     ship checkpoint of this branch + PR checks (gh, on open/refresh, 8 s cap)
 *   AbovePrompt band                       working: turning hourglass + running step (update_plan / TodoWrite) + tool;
 *                                          after a card: its template part (title, heading, points, buttons that
 *                                          send the card's own prompts) — copied from render_completion_card's
 *                                          result, the answer stays inline; 5-h / weekly bars + context fill
 *                                          (session.measure); branch-hygiene count with a cleanup button
 *                                          (opus subagent: plan, then apply)
 *   Pane `devops-cleanup`                 the cleanup plan / result, Apply and Discard buttons
 *   Status line                            branch-hygiene count (~/.claude/orphan-report.json)
 *   Toasts                                 permission request waiting, long subagent / background Bash finished, SessionStart notices
 *   /mods-spike-fork                       Spike 1: one $.model.fork, usage logged to ~/.claude/devops-mods-spike.jsonl
 *
 * Deterministic: no model call except the explicit, user-run spike command.
 * The only prompts it sends are a card button's own prompt, on the person's press.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, Budget, CardView, CleanupHistory, CleanupRun, Hygiene, Progress, RunMarker, SessionFlags, ShipView, SpikeWatch } from '../../types/index'
import type { CompactEnv, Locale, WorkState } from './format'
import {
  activityOf,
  addRun,
  agentRows,
  applyPlan,
  budgetBarAlt,
  cardTextSvg,
  isShippedCard,
  BUDGET_BAR_SIZE,
  budgetBars,
  budgetBarSvg,
  budgetFrom,
  budgetLine,
  cardFromResult,
  checksFrom,
  cleanupApplyPrompt,
  cleanupPlanPrompt,
  cleanupToast,
  cleanupView,
  compactAdvised,
  elapsed,
  historyFrom,
  hourglassSvg,
  HOURGLASS_SIZE,
  hygieneFrom,
  hygieneLine,
  isCardTool,
  isHintCard,
  isFailedStatus,
  isWatcherCommand,
  junkLabel,
  lastLine,
  learnCause,
  learnPrompt,
  localeFrom,
  LONG_RUN_MS,
  markerActive,
  markerFrom,
  markerHides,
  nudgeThresholdFrom,
  passiveSpikeRow,
  RING_CHIP_SIZE,
  RING_SIZE,
  ringPercent,
  ringSvg,
  ruleText,
  shipFrom,
  SPIKE_PAUSE_MS,
  taskNotice,
  todoSteps,
  tr,
  verbatimNotices,
  workingLine,
  CONTEXT_SHOW_PERCENT,
} from './format'
import { featureAllowed, homeDir } from './gate'

export const AGENTS_PANE = 'devops-agents'
export const SHIP_PANE = 'devops-ship'
export const CLEANUP_PANE = 'devops-cleanup'
export const SPIKE_COMMAND = 'mods-spike-fork'
export const SPIKE_PROMPT = 'Reply with the single word: ok'
const SPIKE_LOG = '/.claude/devops-mods-spike.jsonl'
const SPIKE_LOG_MAX_LINES = 500
const RUN_MARKER = '/.claude/devops-cleanup-run.json'
const HISTORY_FILE = '/.claude/devops-cleanup-history.json'
const LOAD_MARKER = '/.claude/devops-mods-loaded.json'
const LOAD_MARKER_MAX = 30
type LoadMark = { sid: string; surface: string | null; interactive: boolean; ts: string }

const agents = atom({ plugin: 'devops', key: 'agents' } as const, [] as AgentRow[], { shape: 'agents-1' })
const budget = atom({ plugin: 'devops', key: 'budget' } as const, null as Budget | null, { shape: 'budget-1' })
const hygiene = atom({ plugin: 'devops', key: 'hygiene' } as const, null as Hygiene | null, { shape: 'hygiene-1' })
const ship = atom({ plugin: 'devops', key: 'ship' } as const, null as ShipView | null, { shape: 'ship-1' })
// Background Bash runs by tool_use_id → start time, so their notification can say how long they ran.
const shells = atom({ plugin: 'devops', key: 'shells' } as const, {} as Record<string, number>, { shape: 'shells-1' })
// The cleanup run: plan subagent → pane with Apply → apply subagent. Survives a reload ($.state).
const IDLE: CleanupRun = { phase: 'idle', agentId: null, report: '', at: 0 }
const cleanup = atom({ plugin: 'devops', key: 'cleanup' } as const, IDLE, { shape: 'cleanup-2' })
// Background Bash runs that are the concept page's own watchers: a toast only when one fails.
const watchers = atom({ plugin: 'devops', key: 'watchers' } as const, {} as Record<string, true>, { shape: 'watchers-1' })
// Once per session: SessionStart notices as toasts (never again after a compaction or resume), the Agents pane opening itself.
const flags = atom({ plugin: 'devops', key: 'flags' } as const, { noticesShown: false, agentsPaneOpened: false } as SessionFlags, { shape: 'flags-1' })
// Redraw clock of the Agents pane while a subagent runs.
const tick = atom({ plugin: 'devops', key: 'tick' } as const, 0, { shape: 'tick-1' })
// Passive Spike 1 (docs/dev/mods.md): the first request of a main turn after a long pause.
const spike = atom({ plugin: 'devops', key: 'spike' } as const, { lastMainEnd: 0, armed: null } as SpikeWatch, { shape: 'spike-1' })
const TICK_MS = 5000
// Band look: the card's lilac › and amber, the divider and rail of the concept (rounds/02.html).
const AMBER = '#e6c36a'
const VIOLET = '#9d8cd6'
const AMBER_BG = '#3d3220'
const DIVIDER = '#353535'
const RAIL_WIDTH = 30
let ticker: { cancel: () => void } | null = null

/** Keeps the Agents pane's elapsed times live: a timer that bumps `tick` while any subagent runs, and stops itself after. */
function startTicker($: EngineInterface): void {
  if (ticker) return
  try {
    ticker = $.clock.every(TICK_MS, () => {
      void (async () => {
        let live: Record<string, string> = {}
        try {
          live = Object.fromEntries((await $.agent.list()).map(a => [a.id, a.status]))
        } catch {
          /* the recorded status stands */
        }
        const running = (await read($, agents)).some(a => typeof a.endedAt !== 'number' && (!live[a.id] || live[a.id] === 'running'))
        if (!running && ticker) {
          ticker.cancel()
          ticker = null
          return
        }
        await update($, tick, n => n + 1)
      })().catch(() => undefined)
    })
  } catch {
    ticker = null
  }
}
// The band's cleanup block is expanded (per session; B11).
const fold = atom({ plugin: 'devops', key: 'fold' } as const, false, { shape: 'fold-1' })
// A ship / released / finished card is on record: no open work until a new edit or an open plan (B7).
const settled = atom({ plugin: 'devops', key: 'settled' } as const, false, { shape: 'settled-1' })
const hintsOpen = atom({ plugin: 'devops', key: 'hintsOpen' } as const, false, { shape: 'hints-open-1' })
// The last card's title and time, kept after the card is spent: the idle row's "Last:".
const lastCard = atom({ plugin: 'devops', key: 'lastCard' } as const, null as { title: string; at: string } | null, { shape: 'last-card-1' })
// The last completion card of this prompt's turn (its template part, no answer) and what the turn is doing now.
const card = atom({ plugin: 'devops', key: 'card' } as const, null as CardView | null, { shape: 'card-1' })
const NO_PROGRESS: Progress = { steps: [], activity: '', startedAt: 0 }
const progress = atom({ plugin: 'devops', key: 'progress' } as const, NO_PROGRESS, { shape: 'progress-1' })

/** A card button: its prompt goes out as the person's own turn; the card leaves the band at once (one press = one prompt). */
async function pressCardButton($: EngineInterface, prompt: string): Promise<void> {
  let shown = false
  await update($, card, c => {
    shown = c !== null
    return null
  })
  if (shown) await $.prompt.submit({ text: prompt, asUser: true })
}
// The session's folder (session.start), for the subagents' briefs.
let sessionCwd = ''

async function repoRoot($: EngineInterface): Promise<string> {
  try {
    return (await $.session.root()) || sessionCwd
  } catch {
    return sessionCwd
  }
}

/** The machine-wide run marker (B13): one cleanup run per repo, seen by every session. */
async function readMarker($: EngineInterface): Promise<RunMarker | null> {
  const home = await homeDir($)
  return home ? markerFrom(await readJson($, home + RUN_MARKER)) : null
}

async function writeMarker($: EngineInterface, m: RunMarker): Promise<void> {
  const home = await homeDir($)
  if (home) await $.fs.write(home + RUN_MARKER, `${JSON.stringify(m, null, 1)}\n`).catch(() => undefined)
}

/** Ends this session's run in the marker (other sessions show the block again once the report is newer). */
async function endRun($: EngineInterface): Promise<void> {
  try {
    const m = await readMarker($)
    const sid = await $.session.id()
    if (m && m.session === sid && m.endedAt === undefined) await writeMarker($, { ...m, endedAt: await $.clock.now() })
  } catch {
    /* the marker is bookkeeping: a stale one expires after 2 h */
  }
}

/** Starts one cleanup subagent; a press while one runs does nothing (one press = one run, one run per repo machine-wide). */
async function startCleanup($: EngineInterface, kind: 'plan' | 'apply'): Promise<void> {
  const sh = await sharedNow($, true)
  const root = await repoRoot($)
  const repo = (sh.hyg && sh.hyg.repo) || root
  const sid = await $.session.id().catch(() => '')
  const now = await $.clock.now()
  if (kind === 'plan') {
    const other = await readMarker($)
    if (markerActive(other, repo, now) && other && other.session !== sid) {
      $.ui.toast(tr(sh.loc, 'runBusy'), { timeoutMs: 8000 })
      return
    }
  }
  let go = false
  let plan = ''
  await update($, cleanup, s => {
    go = false
    if (s.phase === 'planning' || s.phase === 'applying') return s
    if (kind === 'apply' && s.phase !== 'planned') return s
    go = true
    plan = s.report
    return {
      phase: kind === 'plan' ? 'planning' : 'applying',
      agentId: null,
      report: kind === 'plan' ? '' : s.report,
      at: 0,
      causes: kind === 'plan' ? { ...((sh.hyg && sh.hyg.causes) || {}) } : s.causes,
    }
  })
  if (!go) return
  // The apply refreshes the marker's start too, so the 2-h staleness counts from the latest step of the run.
  await writeMarker($, { repo, session: sid, startedAt: now })
  try {
    const description = kind === 'plan' ? 'Branch cleanup plan' : 'Branch cleanup apply'
    const r = await $.agent.spawn({
      prompt: kind === 'plan' ? cleanupPlanPrompt(root, sessionCwd) : cleanupApplyPrompt(root, sessionCwd, plan),
      description,
      subagentType: 'general-purpose',
      model: 'opus',
    })
    if (r.deny !== undefined) throw new Error(String(r.deny))
    // Core sets agentId; where a host leaves it out, the session's agent list names the run by its description.
    let agentId = r.agentId
    if (!agentId) {
      const listed = (await $.agent.list()).filter(a => a.description === description)
      agentId = listed.length ? listed[listed.length - 1].id : undefined
    }
    if (!agentId) throw new Error('no agent started')
    await update($, cleanup, s => ({ ...s, agentId: agentId as string }))
    await $.ui.open({ id: CLEANUP_PANE, title: await titleOf($, 'titleCleanup') })
  } catch (err) {
    const why = err instanceof Error ? err.message : 'spawn failed'
    await update($, cleanup, () => ({ phase: 'failed', agentId: null, report: tr(sh.loc, 'spawnFailed', { why }), at: 0 }))
    await endRun($)
  }
}

/** A finished apply run: its causes go to the history; the same unmerged cause in two runs offers `devops learn` (B14). */
async function recordRun($: EngineInterface, run: CleanupRun, now: number): Promise<{ cause: string; runs: number } | null> {
  const home = await homeDir($)
  if (!home) return null
  const sh = await sharedNow($)
  const repo = (sh.hyg && sh.hyg.repo) || (await repoRoot($))
  const history: CleanupHistory = addRun(historyFrom(await readJson($, home + HISTORY_FILE)), { repo, at: now, causes: run.causes || {} })
  await $.fs.write(home + HISTORY_FILE, `${JSON.stringify(history, null, 1)}\n`).catch(() => undefined)
  return learnCause(history, repo)
}

// One gate answer per session (reset at session.start); module vars reset on reload anyway.
let gate: Promise<boolean> | null = null
function open($: EngineInterface): Promise<boolean> {
  if (!gate) gate = featureAllowed($, 'claude-mods').catch(() => false)
  return gate
}

/** A pane title in the session's language. */
async function titleOf($: EngineInterface, key: 'titleCleanup' | 'titleAgents' | 'titleShip'): Promise<string> {
  return tr((await sharedNow($)).loc, key)
}

async function readJson($: EngineInterface, path: string): Promise<unknown> {
  try {
    const t = await $.fs.read(path)
    return typeof t === 'string' ? JSON.parse(t) : null
  } catch {
    return null
  }
}

async function usageNow($: EngineInterface): Promise<Budget | null> {
  try {
    return budgetFrom(await $.session.usage())
  } catch {
    return null
  }
}

type Shared = {
  at: number
  loc: Locale
  sid: string
  hyg: Hygiene | null
  marker: RunMarker | null
  threshold: number
  env: CompactEnv
  work: Pick<WorkState, 'concept' | 'changes'>
}
let shared: Shared | null = null
const SHARED_TTL_MS = 10_000

function positive(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

async function gitOut($: EngineInterface, cwd: string, args: string[]): Promise<string | null> {
  try {
    const r = await $.process.run(['git', ...args], { cwd: cwd || undefined, timeoutMs: 3000 })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

/** B7: is there open work: a concept page open here, or unshipped changes (dirty tree, commits ahead of the default branch). */
async function openWork($: EngineInterface, cwd: string): Promise<Pick<WorkState, 'concept' | 'changes'>> {
  const concept = cwd ? (await readJson($, `${cwd}/.claude/concept-active.json`)) !== null : false
  let changes = false
  const status = await gitOut($, cwd, ['status', '--porcelain'])
  if (status && status.trim()) changes = true
  else {
    for (const ref of ['origin/HEAD', 'origin/main', 'origin/master', 'main', 'master']) {
      const ahead = await gitOut($, cwd, ['rev-list', '--count', `${ref}..HEAD`])
      if (ahead !== null) {
        changes = Number.parseInt(ahead.trim(), 10) > 0
        break
      }
    }
  }
  return { concept, changes }
}

/**
 * Everything the band reads from the machine, cached 10 s: the orphan report, the run marker, the
 * cleanup threshold (project > global config, default 50), the language, the user's own auto-compact
 * settings and whether work is open. One place, so band and status line cannot disagree.
 */
async function sharedNow($: EngineInterface, force = false): Promise<Shared> {
  const now = await $.clock.now()
  if (!force && shared && now - shared.at < SHARED_TTL_MS) return shared
  const home = await homeDir($)
  const cwd = sessionCwd.replace(/[\\]/g, '/').replace(/[/]+$/, '')
  const hyg = home ? hygieneFrom(await readJson($, `${home}/.claude/orphan-report.json`), cwd, now) : null
  let language: unknown
  let windowCap: number | null = null
  let pctOverride: number | null = null
  const files = [home && `${home}/.claude/settings.json`, cwd && `${cwd}/.claude/settings.json`, cwd && `${cwd}/.claude/settings.local.json`]
  for (const f of files) {
    const j = f ? ((await readJson($, f)) as Record<string, unknown> | null) : null
    if (!j || typeof j !== 'object') continue
    if (typeof j.language === 'string' && j.language) language = j.language
    const env = (j.env && typeof j.env === 'object' ? j.env : {}) as Record<string, unknown>
    windowCap = positive(j.autoCompactWindow) ?? positive(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW) ?? windowCap
    pctOverride = positive(env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) ?? pctOverride
  }
  // The process environment wins over the settings' env block.
  pctOverride = positive(await $.env.get('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE').catch(() => undefined)) ?? pctOverride
  windowCap = positive(await $.env.get('CLAUDE_CODE_AUTO_COMPACT_WINDOW').catch(() => undefined)) ?? windowCap
  const main = (hyg && hyg.repo) || cwd
  const threshold = nudgeThresholdFrom(
    main ? await readJson($, `${main}/.claude/devops-config.json`) : null,
    home ? await readJson($, `${home}/.claude/devops-config.json`) : null,
  )
  const next: Shared = {
    at: now,
    loc: localeFrom(language),
    sid: await $.session.id().catch(() => ''),
    hyg,
    marker: await readMarker($),
    threshold,
    env: { pctOverride, windowCap },
    work: await openWork($, cwd),
  }
  shared = next
  return next
}

async function refreshHygiene($: EngineInterface): Promise<void> {
  const sh = await sharedNow($, true)
  await update($, hygiene, () => sh.hyg)
  $.ui.status(hygieneLine(sh.hyg, true, sh.loc) ?? undefined)
}

async function refreshShip($: EngineInterface): Promise<void> {
  let root = ''
  let branch = ''
  try {
    root = await $.session.root()
  } catch {
    /* none */
  }
  try {
    const b = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root || undefined, timeoutMs: 3000 })
    if (b.exitCode === 0) branch = b.stdout.trim()
  } catch {
    /* no git */
  }
  const cp = root ? shipFrom(await readJson($, `${root}/.claude/.ship-checkpoint.json`), branch) : null
  let pr: ShipView['pr'] = null
  try {
    const r = await $.process.run(['gh', 'pr', 'view', '--json', 'number,state,statusCheckRollup'], {
      cwd: root || undefined,
      timeoutMs: 8000,
    })
    if (r.exitCode === 0) pr = checksFrom(r.stdout)
  } catch {
    /* no gh, no PR, or over 8 s */
  }
  const view: ShipView = { branch, steps: cp ? cp.steps : [], next: cp ? cp.next : '', pr, checkedAt: await $.clock.now() }
  await update($, ship, () => view)
}

/**
 * The load marker: proof that the mod loaded in this session. ss.mods.load.js (SessionStart)
 * reports a session that ran without one, so a silent load failure (#105936) shows up.
 */
async function writeLoadMarker($: EngineInterface, surface: string | null, interactive: boolean): Promise<void> {
  const home = await homeDir($)
  if (!home) return
  const file = home + LOAD_MARKER
  const sid = await $.session.id()
  const prev = (await readJson($, file)) as { sessions?: LoadMark[] } | null
  const kept = (prev && Array.isArray(prev.sessions) ? prev.sessions : []).filter(s => s && s.sid !== sid).slice(-(LOAD_MARKER_MAX - 1))
  const row: LoadMark = { sid, surface, interactive, ts: new Date(await $.clock.now()).toISOString() }
  await $.fs.write(file, `${JSON.stringify({ sessions: [...kept, row] }, null, 1)}\n`)
}

async function appendSpikeLog($: EngineInterface, row: unknown): Promise<string> {
  const home = await homeDir($)
  if (!home) throw new Error('no home folder')
  const file = home + SPIKE_LOG
  let prev = ''
  try {
    const t = await $.fs.read(file)
    prev = typeof t === 'string' ? t : ''
  } catch {
    /* first row */
  }
  const lines = prev.split('\n').filter(Boolean).slice(-(SPIKE_LOG_MAX_LINES - 1))
  lines.push(JSON.stringify(row))
  await $.fs.write(file, `${lines.join('\n')}\n`)
  return file
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    gate = null
    shared = null
    const started = await next(e)
    if (!(await open($))) return started
    await $.command.register({ name: 'devops-agents', description: 'devops: show this session\'s subagents in a pane' })
    await $.command.register({ name: 'devops-ship', description: 'devops: show the ship checkpoint and PR checks of this branch' })
    await $.command.register({
      name: 'mods-spike-fork',
      description: 'devops spike: one fork of this thread, logs its cache read to ~/.claude/devops-mods-spike.jsonl',
    })
    sessionCwd = e.cwd || ''
    await writeLoadMarker($, e.surface || null, e.isInteractive === true).catch(() => undefined)
    await refreshHygiene($)
    return started
  })

  // C9: the SessionStart notices the hooks ask Claude to show verbatim also become toasts; the hook text stays as is.
  // Once per session: a compaction or resume re-runs SessionStart with the same notices, which stay in the band.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const source = (e as { source?: string }).source
    if (source !== 'compact' && source !== 'resume' && (await open($))) {
      const texts = verbatimNotices(result && result.additionalContext)
      if (texts.length && !(await read($, flags)).noticesShown) {
        await update($, flags, f => ({ ...f, noticesShown: true }))
        for (const text of texts) $.ui.toast(text, { timeoutMs: 8000 })
      }
    }
    return result
  }).catch(($, e, next) => next(e)) // display only: a failure never changes the engine's answer

  // C6: a permission request waits. Additive: perm.approval.watch.js runs as before.
  on('classic.Notification', async ($, e, next) => {
    const result = await next(e)
    if (e.notification_type === 'permission_prompt' && (await open($))) {
      const loc = (await sharedNow($)).loc
      $.ui.toast(`${tr(loc, 'permission')}${e.message ? `: ${e.message}` : ''}`.slice(0, 200), { timeoutMs: 8000 })
    }
    return result
  }).catch(($, e, next) => next(e)) // display only: a failure never changes the engine's answer

  // C4: record each subagent as it starts (the event's answer is passed on unchanged).
  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned && spawned.agentId && (await open($))) {
      const row: AgentRow = {
        id: spawned.agentId,
        type: e.subagentType,
        description: e.description,
        model: spawned.model || '',
        startedAt: await $.clock.now(),
        status: 'running',
      }
      await update($, agents, list => [...list.filter(a => a.id !== row.id), row].slice(-50))
      startTicker($)
      // The first background subagent of the session opens the pane once; closed by the person, it stays closed.
      if (e.background && !(await read($, flags)).agentsPaneOpened) {
        await update($, flags, f => ({ ...f, agentsPaneOpened: true }))
        await $.ui.open({ id: AGENTS_PANE, title: await titleOf($, 'titleAgents') })
      }
    }
    return spawned
  }).catch(($, e, next) => next(e)) // display only: a failure never changes the engine's answer

  // C4 + C6: a subagent ends; a long one gets a toast.
  on('classic.SubagentStop', async ($, e, next) => {
    const result = await next(e)
    if (await open($)) {
      const now = await $.clock.now()
      let done: AgentRow | undefined
      await update($, agents, list =>
        list.map(a => {
          if (a.id !== e.agent_id || typeof a.endedAt === 'number') return a
          done = { ...a, endedAt: now, status: 'completed' }
          return done
        }),
      )
      if (done && now - done.startedAt >= LONG_RUN_MS) {
        const loc = (await sharedNow($)).loc
        $.ui.toast(`${tr(loc, 'finishedAfter', { what: done.type, t: elapsed(now - done.startedAt) })}: ${done.description}`.slice(0, 200), { timeoutMs: 8000 })
      }
    }
    return result
  }).catch(($, e, next) => next(e)) // display only: a failure never changes the stop answer

  // C6 (close-out): a background Bash run starts; remember when. The call is passed on unchanged.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    const id = e.tool_use_id
    if (id && (e as { run_in_background?: boolean }).run_in_background === true && (await open($))) {
      const now = await $.clock.now()
      await update($, shells, map => {
        const keep = Object.entries(map).filter(([, t]) => now - t < 24 * 3600_000).slice(-49)
        return { ...Object.fromEntries(keep), [id]: now }
      })
      if (isWatcherCommand((e as { command?: unknown }).command)) {
        await update($, watchers, map => {
          const live = Object.keys(map).slice(-49)
          return { ...Object.fromEntries(live.map(k => [k, true as const])), [id]: true as const }
        })
      }
    }
    return result
  }).catch(($, e, next) => next(e)) // display only: a failure never changes the tool call

  // Card band: a prompt starts a new main turn → the last card is spent, the task list starts over.
  // A turn without text (a continuation, the app's no-output nudge after a card) keeps both.
  // Passive Spike 1: a main turn that starts after a long pause is armed; its first request's usage is logged.
  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    if (e.agentId === undefined && (await open($))) {
      const now = await $.clock.now()
      if ((e.text || '').trim()) {
        await update($, card, () => null)
        await update($, progress, () => ({ steps: [], activity: '', startedAt: now }))
      }
      await update($, spike, s => {
        const gapMs = s.lastMainEnd ? now - s.lastMainEnd : 0
        return { ...s, armed: gapMs >= SPIKE_PAUSE_MS ? { turnId: e.turnId, gapMs } : null }
      })
    }
    return started
  }).catch(($, e, next) => next(e)) // display and measuring only: never changes the turn

  // Card band: what the main turn is doing (task list, running tool), and the card the card tool rendered.
  // The call and its result pass through unchanged; the card itself stays with the tool and stop.flow.guard.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const main = (e as { agentId?: string }).agentId === undefined
    const gateOpen = main && (await open($))
    if (gateOpen) {
      const input = e as unknown as Record<string, unknown>
      // New work after a ship: an edit, or a plan with open steps, ends the "settled" state.
      if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) await update($, settled, () => false)
      const act = activityOf(tool, input)
      await update($, progress, p => {
        let steps = p.steps
        if (tool.endsWith('ccd_turn__update_plan')) steps = applyPlan(p.steps, input)
        else if (tool === 'TodoWrite') steps = todoSteps(input.todos)
        return { ...p, steps, activity: act || p.activity }
      })
      if ((tool.endsWith('ccd_turn__update_plan') || tool === 'TodoWrite') && (await read($, progress)).steps.some(st => st.status !== 'completed')) {
        await update($, settled, () => false)
      }
    }
    const result = await next(e)
    if (gateOpen && isCardTool(tool) && result && typeof result.text === 'string' && !result.isError) {
      const view = cardFromResult(result.text)
      if (view) {
        await update($, card, () => view)
        if (isShippedCard(view)) await update($, settled, () => true)
        if (view.title) await update($, lastCard, () => ({ title: view.title, at: view.at }))
      }
    }
    return result
  }).catch(($, e, next) => next(e)) // display only: a failure never changes the tool call

  // C6 (close-out): its notification arrives; a long one gets a toast. The prompt is passed on unchanged.
  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    const notice = taskNotice(e.text)
    if (notice && (await open($))) {
      const startedAt = (await read($, shells))[notice.toolUseId]
      if (typeof startedAt === 'number') {
        const now = await $.clock.now()
        const isWatcher = (await read($, watchers))[notice.toolUseId] === true
        await update($, shells, map => {
          const rest = { ...map }
          delete rest[notice.toolUseId]
          return rest
        })
        if (isWatcher) {
          await update($, watchers, map => {
            const rest = { ...map }
            delete rest[notice.toolUseId]
            return rest
          })
        }
        // A concept watcher ending normally is plumbing that wakes Claude anyway: a toast only when it failed, at any length.
        const failed = isFailedStatus(notice.status) || /\bfailed\b|exit code [1-9]/i.test(notice.summary)
        if (isWatcher ? failed : now - startedAt >= LONG_RUN_MS) {
          const what = notice.summary || tr((await sharedNow($)).loc, 'bgCommand', { s: notice.status || tr((await sharedNow($)).loc, 'finishedWord') })
          $.ui.toast(`${what} · ${elapsed(now - startedAt)}`.slice(0, 200), { timeoutMs: 8000 })
        }
      }
    }
    return result
  }).catch(($, e, next) => next(e)) // display only: a failure never changes the prompt

  // The step itself passes through unchanged (`yield* next(e)`); only its reported usage is read afterwards.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    try {
      if (e.agentId === undefined && e.index === 0 && result && result.usage && (await open($))) {
        const s = await read($, spike)
        if (s.armed && s.armed.turnId === e.turnId) {
          const gapMs = s.armed.gapMs
          await update($, spike, x => ({ ...x, armed: null }))
          await appendSpikeLog($, passiveSpikeRow(gapMs, result.usage, await read($, budget), await $.clock.now()))
        }
      }
    } catch {
      /* measuring only */
    }
    return result
  })

  // A cleanup subagent ended: its answer is the plan (or the apply result) the pane shows.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && (await open($))) {
      const now = await $.clock.now()
      await update($, spike, s => ({ ...s, lastMainEnd: now, armed: null }))
    }
    if (e.agentId !== undefined && (await open($))) {
      const run = await read($, cleanup)
      if (run.agentId === e.agentId && (run.phase === 'planning' || run.phase === 'applying')) {
        const answer = (e.answer || '').trim()
        const phase = e.isAborted || !answer ? 'failed' : run.phase === 'planning' ? 'planned' : 'done'
        const now = await $.clock.now()
        const loc = (await sharedNow($)).loc
        // B14: a finished run feeds the history; the same unmerged cause in two runs makes the pane offer `devops learn`.
        const offer = phase === 'done' ? await recordRun($, run, now).catch(() => null) : null
        await update($, cleanup, () => ({
          phase,
          agentId: null,
          report: answer || tr(loc, 'noAnswer'),
          at: now,
          causes: run.causes,
          ...(offer ? { learn: offer.cause, learnRuns: offer.runs } : {}),
        }))
        if (phase !== 'planned') await endRun($)
        $.ui.toast(cleanupToast(phase, loc), { timeoutMs: 8000 })
        if (offer) $.ui.toast(tr(loc, 'toastLearn'), { timeoutMs: 10000 })
        await $.ui.open({ id: CLEANUP_PANE, title: await titleOf($, 'titleCleanup') })
      }
    }
    return result
  }).catch(($, e, next) => next(e)) // display only

  // C5: the live budget, one source (session.measure); nothing is written.
  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    if (await open($)) {
      const b = budgetFrom(e)
      await update($, budget, prev => ({
        fiveHour: b.fiveHour ?? (prev ? prev.fiveHour : null),
        weekly: b.weekly ?? (prev ? prev.weekly : null),
        context: b.context ?? (prev ? prev.context : null),
        fiveHourResetsAt: b.fiveHourResetsAt ?? (prev ? prev.fiveHourResetsAt ?? null : null),
        weeklyResetsAt: b.weeklyResetsAt ?? (prev ? prev.weeklyResetsAt ?? null : null),
        contextTokens: b.contextTokens ?? (prev ? prev.contextTokens ?? null : null),
        contextWindow: b.contextWindow ?? (prev ? prev.contextWindow ?? null : null),
      }))
    }
    return measured
  })

  on('command.run', { command: 'devops-agents' }, async $ => {
    await $.ui.open({ id: AGENTS_PANE, title: await titleOf($, 'titleAgents') })
    return { text: 'Agents pane opened.' }
  })

  on('command.run', { command: 'devops-ship' }, async $ => {
    await $.ui.open({ id: SHIP_PANE, title: await titleOf($, 'titleShip') })
    await refreshShip($)
    return { text: 'Ship / CI pane opened.' }
  })

  // C10, Spike 1: ONE fork, no `effort` (an effort can force a full cache write).
  on('command.run', { command: 'mods-spike-fork' }, async $ => {
    const before = (await usageNow($)) || (await read($, budget))
    const t0 = await $.clock.now()
    const r = await $.model.fork({ prompt: SPIKE_PROMPT })
    const t1 = await $.clock.now()
    const after = await usageNow($)
    let contextTokens: number | null = null
    try {
      const u = await $.session.usage()
      contextTokens = typeof u.context.tokens === 'number' ? u.context.tokens : null
    } catch {
      /* unknown */
    }
    const usage = r.isAnswered ? r.usage : null
    const row = {
      ts: new Date(t0).toISOString(),
      ms: t1 - t0,
      isAnswered: r.isAnswered,
      reason: r.isAnswered ? undefined : r.reason,
      cache_read_input_tokens: usage ? usage.cache_read_input_tokens : null,
      cache_creation_input_tokens: usage ? usage.cache_creation_input_tokens : null,
      input_tokens: usage ? usage.input_tokens : null,
      output_tokens: usage ? usage.output_tokens : null,
      context_tokens: contextTokens,
      cache_read_share:
        usage && contextTokens ? Math.round((usage.cache_read_input_tokens / contextTokens) * 1000) / 1000 : null,
      five_hour_before: before ? before.fiveHour : null,
      five_hour_after: after ? after.fiveHour : null,
      weekly_before: before ? before.weekly : null,
      weekly_after: after ? after.weekly : null,
    }
    let where = ''
    try {
      where = await appendSpikeLog($, row)
    } catch (err) {
      where = `not written (${err instanceof Error ? err.message : 'error'})`
    }
    const share = row.cache_read_share === null ? 'n/a' : `${Math.round(row.cache_read_share * 100)} %`
    return {
      text: r.isAnswered
        ? `Spike fork: cache read ${row.cache_read_input_tokens}, cache write ${row.cache_creation_input_tokens}, output ${row.output_tokens} (cache read ${share} of the context). Log: ${where}`
        : `Spike fork not answered (${row.reason}). Log: ${where}`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: AGENTS_PANE }, async ($, e, next) => {
    if (!(await open($))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    await read($, tick) // the live clock: a bump redraws the elapsed times
    const now = await $.clock.now()
    let live: Record<string, string> = {}
    try {
      live = Object.fromEntries((await $.agent.list()).map(a => [a.id, a.status]))
    } catch {
      /* the recorded status stands */
    }
    const list = (await read($, agents)).map(a => (live[a.id] && typeof a.endedAt !== 'number' ? { ...a, status: live[a.id] } : a))
    if (list.some(a => typeof a.endedAt !== 'number' && a.status === 'running')) startTicker($) // after a reload
    const rows = agentRows(list, now)
    const loc = (await sharedNow($)).loc
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 2)
    return (
      <Box flexDirection="column">
        {rows.length === 0 && <Text dimColor>{tr(loc, 'noAgents')}</Text>}
        {rows.slice(-room).map(r => (
          <Text dimColor={r.isDone}>{r.text}</Text>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: SHIP_PANE }, async ($, e, next) => {
    if (!(await open($))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const v = await read($, ship)
    const pr = v && v.pr
    const loc = (await sharedNow($)).loc
    return (
      <Box flexDirection="column">
        {!v && <Text dimColor>{tr(loc, 'noShip')}</Text>}
        {v && <Text>{tr(loc, 'shipBranch', { b: v.branch || tr(loc, 'unknown') })}</Text>}
        {v && (
          <Text>
            {`${v.steps.length ? tr(loc, 'shipDone', { steps: v.steps.join(', ') }) : tr(loc, 'shipNone')}${v.next ? tr(loc, 'shipNext', { next: v.next }) : ''}`}
          </Text>
        )}
        {v && <Text>{pr ? tr(loc, 'prLine', { n: pr.number, state: pr.state, pass: pr.pass, fail: pr.fail, pending: pr.pending }) : tr(loc, 'prNone')}</Text>}
        <Button key="refresh" label={tr(loc, 'refresh')} onPress={() => refreshShip($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: CLEANUP_PANE }, async ($, e, next) => {
    if (!(await open($))) return next(e)
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const run = await read($, cleanup)
    const loc = (await sharedNow($)).loc
    const head =
      run.phase === 'planning' ? tr(loc, 'panePlanning')
      : run.phase === 'applying' ? tr(loc, 'paneApplying')
      : run.phase === 'planned' ? tr(loc, 'panePlanned')
      : run.phase === 'done' ? tr(loc, 'paneDone')
      : run.phase === 'failed' ? tr(loc, 'paneFailed')
      : tr(loc, 'paneIdle')
    const finish = async () => {
      await update($, cleanup, () => IDLE)
      await endRun($)
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{head}</Text>
        {run.report && <Markdown key="cleanup-report" text={run.report} />}
        {run.phase === 'done' && run.learn && (
          <Box key="cleanup-learn-offer" flexDirection="column" gap={1}>
            <Text>{tr(loc, 'learnOffer', { runs: run.learnRuns || 2, cause: run.learn })}</Text>
            <Box flexDirection="row">
              <Button
                key="cleanup-learn"
                variant="primary"
                label={tr(loc, 'learnBtn')}
                onPress={async () => {
                  const cause = run.learn as string
                  await update($, cleanup, s => ({ ...s, learn: undefined, learnRuns: undefined }))
                  await $.prompt.submit({ text: learnPrompt(cause, run.learnRuns || 2), asUser: true })
                }}
              />
            </Box>
          </Box>
        )}
        <Box flexDirection="row" gap={2}>
          {run.phase === 'planned' && <Button key="cleanup-apply" variant="primary" label={tr(loc, 'btnApply')} onPress={() => startCleanup($, 'apply')} />}
          {(run.phase === 'planned' || run.phase === 'done' || run.phase === 'failed') && (
            <Button key="cleanup-discard" label={run.phase === 'planned' ? tr(loc, 'btnDiscard') : tr(loc, 'btnClose')} onPress={finish} />
          )}
          {(run.phase === 'idle' || run.phase === 'done' || run.phase === 'failed') && (
            <Button key="cleanup-plan" label={tr(loc, 'btnPlan')} onPress={() => startCleanup($, 'plan')} />
          )}
        </Box>
      </Box>
    )
  })

  // The band above the prompt (concept 20261115-1417-band-redesign, design r2-d2):
  //   a card is shown: left the card part (title, heading, CTA points, buttons), a divider, right the status
  //     rail (context ring + Compact when advised, the cleanup block when due); the time sits in the band's
  //     top-right corner. The terminal has no columns: the same parts, one column.
  //   working: turning ⏳ + the running step (n/m · text) + the tool; the rail shows the ring only.
  //   idle: one slim row, "Last: {card title} · {time}" left, ring chip + 🧹 N ▸ right; hidden when nothing is due.
  // The card's answer and its result lines never show here: they stay inline in the transcript.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await open($))) return next(e)
    const sh = await sharedNow($)
    const loc = sh.loc
    const working = e.props.isWorking === true
    const prog = await read($, progress)
    const c = working ? null : await read($, card)
    const last = await read($, lastCard)
    const w = working ? workingLine(prog) : null
    const b = await read($, budget)
    const now = await $.clock.now()
    const bars = budgetBars(b, now)
    const ring = ringPercent(b, sh.env)
    const run = await read($, cleanup)
    const folded = await read($, fold)
    const hintsUp = await read($, hintsOpen)
    const hintCard = isHintCard(c)
    const hidden = markerHides(sh.marker, (sh.hyg && sh.hyg.repo) || '', sh.sid, (sh.hyg && sh.hyg.reportAt) || 0, now)
    const cv = working || hidden ? null : cleanupView(sh.hyg, sh.threshold)
    const isSettled = await read($, settled)
    const advised = compactAdvised(ring, { concept: sh.work.concept, changes: sh.work.changes, steps: prog.steps.some(s => s.status !== 'completed'), settled: isSettled }, c)
    const idle = !w && !c
    // Idle and nothing due (no cleanup, no context worth a glance, no budget bar): the band stays away.
    if (idle && !cv && !bars.length && !(ring !== null && ring >= CONTEXT_SHOW_PERCENT)) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    // Desktop: the card's animated SVG (bars, hourglass, ring) at a fixed size; the terminal has no Svg, so glyphs.
    const desktop = e.surface !== 'terminal'
    const Svg = desktop ? ($.ui.resolve(e) as { Svg?: any }).Svg : null
    // The card's type scale as far as the mod API has one: title/heading 16 px medium, points 14 px, time 12 px tabular.
    const S: Record<string, any> = desktop
      ? {
          title: { size: 'heading', weight: 'medium' },
          point: { size: 'body', dimColor: true },
          time: { size: 'caption', dimColor: true, tabular: true },
          small: { size: 'caption', dimColor: true },
        }
      : { title: { bold: true }, point: { dimColor: true }, time: { dimColor: true }, small: { dimColor: true } }
    // Card text: the card's own type scale as an image where it fits (the API's Text has no pixel sizes); else the wrapping Text.
    const cardText = (key: string, text: string, role: 'title' | 'heading' | 'time') => {
      const img = Svg ? cardTextSvg(text, role) : null
      return img ? (
        <Box key={key}>
          <Svg source={img.source} alt={img.alt} width={img.width} height={img.height} />
        </Box>
      ) : (
        <Text key={key} {...(role === 'time' ? S.time : S.title)}>{text}</Text>
      )
    }
    const toggle = () => update($, fold, v => !v)

    const cta = !cv ? null : run.phase === 'planning' || run.phase === 'applying' ? (
      <Text key="cleanup-run" dimColor>{`[ ${tr(loc, 'cleanupBtn')} · ${tr(loc, run.phase === 'planning' ? 'runPlanning' : 'runApplying')} ]`}</Text>
    ) : run.phase === 'planned' ? (
      <Button key="cleanup-review" label={tr(loc, 'btnReview')} onPress={async () => $.ui.open({ id: CLEANUP_PANE, title: tr(loc, 'titleCleanup') })} />
    ) : (
      <Button key="cleanup" label={tr(loc, 'cleanupBtn')} onPress={() => startCleanup($, 'plan')} />
    )
    const detail = cv && folded && (
      <Box key="cleanup-detail" flexDirection="column">
        {cv.rows.map(r => (
          <Box key={r.key} flexDirection="row" justifyContent="space-between" columnGap={2}>
            <Text {...S.small}>{tr(loc, r.key)}</Text>
            <Text>{r.n}</Text>
          </Box>
        ))}
        <Text key="cleanup-rule" {...S.small}>{ruleText(cv, loc)}</Text>
        {cta}
      </Box>
    )
    // Collapsed: one line "🧹 N leftovers ▸" + the button; expanded: the breakdown, the rule, the button.
    const cleanupBlock = cv && (
      <Box key="hygiene" flexDirection="column" rowGap={1}>
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          <Button key="cleanup-fold" plain label={`🧹 ${junkLabel(cv.n, loc)} ${folded ? '▾' : '▸'}`} onPress={toggle} />
          {!folded && cta}
        </Box>
        {detail}
      </Box>
    )
    const ringEl =
      ring === null ? null : Svg ? (
        <Box key="ring" flexDirection="row" alignItems="center" columnGap={1}>
          <Svg source={ringSvg(ring, advised)} alt={tr(loc, 'ringAlt', { p: ring })} width={RING_SIZE} height={RING_SIZE} isInteractive />
          <Box flexDirection="column">
            <Text bold {...(advised ? { color: AMBER } : {})}>{ring} %</Text>
            <Text {...S.small}>{tr(loc, 'ctx')}</Text>
          </Box>
        </Box>
      ) : (
        <Text key="ring" dimColor={!advised} {...(advised ? { color: AMBER } : {})}>{`🧠 ${tr(loc, 'ctx')} ${ring} %`}</Text>
      )
    // Desktop: the amber pill (#e6c36a on #3d3220) drawn as the Button's children, one pressable; the terminal keeps the label.
    const compactBtn =
      advised && !working ? (
        <Button key="compact" label={tr(loc, 'compact')} onPress={() => $.session.compact()}>
          {desktop ? <Text color={AMBER} backgroundColor={AMBER_BG}>{` ${tr(loc, 'compact')} `}</Text> : tr(loc, 'compact')}
        </Button>
      ) : null
    const budgetEl = !bars.length ? null : Svg ? (
      <Box key="budget" flexDirection="row" alignItems="center" columnGap={2} flexWrap="wrap">
        {bars.map(bar => (
          <Box key={`bar-${bar.label}`} flexDirection="row" alignItems="center" columnGap={1}>
            <Text dimColor>{bar.label}</Text>
            <Svg source={budgetBarSvg(bar)} alt={budgetBarAlt(bar, loc)} width={BUDGET_BAR_SIZE.width} height={BUDGET_BAR_SIZE.height} isInteractive />
          </Box>
        ))}
      </Box>
    ) : (
      <Text key="budget" dimColor>{budgetLine(b, now)}</Text>
    )

    // --- idle: one slim row ---
    if (idle) {
      const text = lastLine(last, loc)
      return (
        <Box key="band" flexDirection="column" rowGap={1}>
          <Box key="idle" flexDirection="row" alignItems="center" columnGap={2}>
            <Text key="idle-last" {...S.small}>{text}</Text>
            <Box flexGrow={1} />
            {ring !== null && (
              <Box key="idle-ring" flexDirection="row" alignItems="center" columnGap={1}>
                {Svg && <Svg source={ringSvg(ring, advised, RING_CHIP_SIZE)} alt={tr(loc, 'ringAlt', { p: ring })} width={RING_CHIP_SIZE} height={RING_CHIP_SIZE} isInteractive />}
                <Text {...S.small} {...(advised ? { color: AMBER } : {})}>{`${Svg ? '' : '🧠 '}${ring} %`}</Text>
              </Box>
            )}
            {cv && <Button key="cleanup-fold" plain label={`🧹 ${cv.n} ${folded ? '▾' : '▸'}`} onPress={toggle} />}
            {compactBtn}
          </Box>
          {cv && folded && detail}
          {budgetEl}
        </Box>
      )
    }

    // --- working: ⏳ + the step + the tool; the rail is the ring alone ---
    const workEl = w && (
      <Box key="working" flexDirection="row" alignItems="center" columnGap={1}>
        {Svg ? <Svg source={hourglassSvg()} alt={tr(loc, 'working')} width={HOURGLASS_SIZE} height={HOURGLASS_SIZE} isInteractive /> : <Text>⏳</Text>}
        <Text bold>{w.head}</Text>
        {w.detail && <Text dimColor>{w.detail}</Text>}
      </Box>
    )

    // --- the card part: title, heading, CTA points (never the result lines), the card's own buttons ---
    const buttons = c && c.buttons.length > 0 && (
      <Box key="card-buttons" flexDirection="row" columnGap={1} flexWrap="wrap">
        {c.buttons.map((bt, i) => (
          <Button key={`card-button-${i}`} label={bt.label} variant={bt.primary ? 'primary' : undefined} onPress={() => pressCardButton($, bt.prompt)} />
        ))}
      </Box>
    )
    const hintToggle = hintCard ? <Button key="hints-toggle" plain label={hintsUp ? '? ▾' : '?'} onPress={() => update($, hintsOpen, v => !v)} /> : null
    const points =
      c &&
      (!hintCard || hintsUp) &&
      c.points.map((p, i) =>
        desktop ? (
          <Box key={`card-point-${i}`} flexDirection="row" columnGap={1}>
            <Text color={VIOLET} weight="medium">›</Text>
            <Text {...S.point}>{p}</Text>
          </Box>
        ) : (
          <Text key={`card-point-${i}`} dimColor>
            › {p}
          </Text>
        ),
      )

    if (!desktop) {
      // Terminal: one column, same parts.
      return (
        <Box key="band" flexDirection="column" rowGap={1}>
          {workEl}
          {c && (c.title || c.at) && (
            <Box key="card-title" flexDirection="row" justifyContent="space-between" columnGap={2}>
              <Text {...S.title}>{c.title}</Text>
              {c.at && <Text {...S.time}>{c.at}</Text>}
            </Box>
          )}
          {c && (
            <Box key="card-heading-row" flexDirection="row" columnGap={1}>
              <Text key="card-heading" bold>{c.heading}</Text>
              {hintToggle}
            </Box>
          )}
          {points}
          {buttons}
          {budgetEl}
          {ringEl}
          {compactBtn}
          {cleanupBlock}
        </Box>
      )
    }
    return (
      <Box key="band" flexDirection="column" rowGap={1}>
        <Box key="zones" position="relative" flexDirection="row" columnGap={2}>
          <Box key="main" flexDirection="column" flexGrow={1} rowGap={1}>
            {workEl}
            {c && c.title && cardText('card-title', c.title, 'title')}
            {c && (
              <Box key="card-heading-row" flexDirection="row" alignItems="center" columnGap={1}>
                {cardText('card-heading', c.heading, 'heading')}
                {hintToggle}
              </Box>
            )}
            {points}
            {buttons}
          </Box>
          <Box key="rail-divider" width={1} backgroundColor={DIVIDER} />
          <Box key="rail" flexDirection="column" rowGap={1} width={RAIL_WIDTH}>
            {ringEl}
            {compactBtn}
            {cleanupBlock}
          </Box>
          {c && c.at && (
            <Box key="card-time" position="absolute" top={0} right={0}>
              {cardText('card-time-text', c.at, 'time')}
            </Box>
          )}
        </Box>
        {budgetEl}
      </Box>
    )
  })
}

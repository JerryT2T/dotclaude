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
 *   AbovePrompt band                       5-h / weekly percentUsed + context fill (session.measure), compact hint,
 *                                          branch-hygiene count with a cleanup button (opus subagent: plan, then apply)
 *   Pane `devops-cleanup`                 the cleanup plan / result, Apply and Discard buttons
 *   Status line                            branch-hygiene count (~/.claude/orphan-report.json)
 *   Toasts                                 permission request waiting, long subagent / background Bash finished, SessionStart notices
 *   /mods-spike-fork                       Spike 1: one $.model.fork, usage logged to ~/.claude/devops-mods-spike.jsonl
 *
 * Deterministic: no model call except the explicit, user-run spike command.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, Budget, CleanupRun, Hygiene, ShipView } from '../../types/index'
import {
  agentRow,
  budgetFrom,
  budgetBarAlt,
  budgetBars,
  budgetBarSvg,
  budgetLine,
  contextNote,
  checksFrom,
  cleanupApplyPrompt,
  cleanupPlanPrompt,
  cleanupToast,
  elapsed,
  hygieneFrom,
  hygieneLine,
  LONG_RUN_MS,
  shipFrom,
  taskNotice,
  verbatimNotices,
} from './format'
import { featureAllowed, homeDir } from './gate'

export const AGENTS_PANE = 'devops-agents'
export const SHIP_PANE = 'devops-ship'
export const CLEANUP_PANE = 'devops-cleanup'
export const SPIKE_COMMAND = 'mods-spike-fork'
export const SPIKE_PROMPT = 'Reply with the single word: ok'
const SPIKE_LOG = '/.claude/devops-mods-spike.jsonl'
const SPIKE_LOG_MAX_LINES = 500

const agents = atom({ plugin: 'devops', key: 'agents' } as const, [] as AgentRow[], { shape: 'agents-1' })
const budget = atom({ plugin: 'devops', key: 'budget' } as const, null as Budget | null, { shape: 'budget-1' })
const hygiene = atom({ plugin: 'devops', key: 'hygiene' } as const, null as Hygiene | null, { shape: 'hygiene-1' })
const ship = atom({ plugin: 'devops', key: 'ship' } as const, null as ShipView | null, { shape: 'ship-1' })
// Background Bash runs by tool_use_id → start time, so their notification can say how long they ran.
const shells = atom({ plugin: 'devops', key: 'shells' } as const, {} as Record<string, number>, { shape: 'shells-1' })
// The cleanup run: plan subagent → pane with Apply → apply subagent. Survives a reload ($.state).
const IDLE: CleanupRun = { phase: 'idle', agentId: null, report: '', at: 0 }
const cleanup = atom({ plugin: 'devops', key: 'cleanup' } as const, IDLE, { shape: 'cleanup-2' })
// The session's folder (session.start), for the subagents' briefs.
let sessionCwd = ''

async function repoRoot($: EngineInterface): Promise<string> {
  try {
    return (await $.session.root()) || sessionCwd
  } catch {
    return sessionCwd
  }
}

/** Starts one cleanup subagent; a press while one runs does nothing (one press = one run). */
async function startCleanup($: EngineInterface, kind: 'plan' | 'apply'): Promise<void> {
  let go = false
  let plan = ''
  await update($, cleanup, s => {
    go = false
    if (s.phase === 'planning' || s.phase === 'applying') return s
    if (kind === 'apply' && s.phase !== 'planned') return s
    go = true
    plan = s.report
    return { phase: kind === 'plan' ? 'planning' : 'applying', agentId: null, report: kind === 'plan' ? '' : s.report, at: 0 }
  })
  if (!go) return
  const root = await repoRoot($)
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
    await $.ui.open({ id: CLEANUP_PANE, title: 'Cleanup' })
  } catch (err) {
    const why = err instanceof Error ? err.message : 'spawn failed'
    await update($, cleanup, () => ({ phase: 'failed', agentId: null, report: `Subagent not started: ${why}`, at: 0 }))
  }
}

// One gate answer per session (reset at session.start); module vars reset on reload anyway.
let gate: Promise<boolean> | null = null
function open($: EngineInterface): Promise<boolean> {
  if (!gate) gate = featureAllowed($, 'claude-mods').catch(() => false)
  return gate
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

async function refreshHygiene($: EngineInterface, cwd: string): Promise<void> {
  const home = await homeDir($)
  const found = home ? hygieneFrom(await readJson($, `${home}/.claude/orphan-report.json`), cwd, await $.clock.now()) : null
  await update($, hygiene, () => found)
  $.ui.status(hygieneLine(found) ?? undefined)
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
    const started = await next(e)
    if (!(await open($))) return started
    await $.command.register({ name: 'devops-agents', description: 'devops: show this session\'s subagents in a pane' })
    await $.command.register({ name: 'devops-ship', description: 'devops: show the ship checkpoint and PR checks of this branch' })
    await $.command.register({
      name: 'mods-spike-fork',
      description: 'devops spike: one fork of this thread, logs its cache read to ~/.claude/devops-mods-spike.jsonl',
    })
    sessionCwd = e.cwd || ''
    await refreshHygiene($, e.cwd)
    return started
  })

  // C9: the SessionStart notices the hooks ask Claude to show verbatim also become toasts; the hook text stays as is.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (await open($)) {
      for (const text of verbatimNotices(result && result.additionalContext)) $.ui.toast(text, { timeoutMs: 8000 })
    }
    return result
  }).catch(($, e, next) => next(e)) // display only: a failure never changes the engine's answer

  // C6: a permission request waits. Additive: perm.approval.watch.js runs as before.
  on('classic.Notification', async ($, e, next) => {
    const result = await next(e)
    if (e.notification_type === 'permission_prompt' && (await open($))) {
      $.ui.toast(`Permission request waiting${e.message ? `: ${e.message}` : ''}`.slice(0, 200), { timeoutMs: 8000 })
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
        $.ui.toast(`${done.type} finished after ${elapsed(now - done.startedAt)}: ${done.description}`.slice(0, 200), { timeoutMs: 8000 })
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
        await update($, shells, map => {
          const rest = { ...map }
          delete rest[notice.toolUseId]
          return rest
        })
        if (now - startedAt >= LONG_RUN_MS) {
          const what = notice.summary || `Background command ${notice.status || 'finished'}`
          $.ui.toast(`${what} · ${elapsed(now - startedAt)}`.slice(0, 200), { timeoutMs: 8000 })
        }
      }
    }
    return result
  }).catch(($, e, next) => next(e)) // display only: a failure never changes the prompt

  // A cleanup subagent ended: its answer is the plan (or the apply result) the pane shows.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined && (await open($))) {
      const run = await read($, cleanup)
      if (run.agentId === e.agentId && (run.phase === 'planning' || run.phase === 'applying')) {
        const answer = (e.answer || '').trim()
        const phase = e.isAborted || !answer ? 'failed' : run.phase === 'planning' ? 'planned' : 'done'
        const now = await $.clock.now()
        await update($, cleanup, () => ({ phase, agentId: null, report: answer || 'No answer.', at: now }))
        $.ui.toast(cleanupToast(phase), { timeoutMs: 8000 })
        await $.ui.open({ id: CLEANUP_PANE, title: 'Cleanup' })
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
      }))
    }
    return measured
  })

  on('command.run', { command: 'devops-agents' }, async $ => {
    await $.ui.open({ id: AGENTS_PANE, title: 'Agents' })
    return { text: 'Agents pane opened.' }
  })

  on('command.run', { command: 'devops-ship' }, async $ => {
    await $.ui.open({ id: SHIP_PANE, title: 'Ship / CI' })
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
    const now = await $.clock.now()
    let live: Record<string, string> = {}
    try {
      live = Object.fromEntries((await $.agent.list()).map(a => [a.id, a.status]))
    } catch {
      /* the recorded status stands */
    }
    const list = (await read($, agents)).map(a => (live[a.id] && typeof a.endedAt !== 'number' ? { ...a, status: live[a.id] } : a))
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 2)
    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No subagents in this session yet.</Text>}
        {list.slice(-room).map(a => (
          <Text dimColor={typeof a.endedAt === 'number'}>{agentRow(a, now)}</Text>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: SHIP_PANE }, async ($, e, next) => {
    if (!(await open($))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const v = await read($, ship)
    const pr = v && v.pr
    return (
      <Box flexDirection="column">
        {!v && <Text dimColor>No ship data read yet.</Text>}
        {v && <Text>Branch: {v.branch || 'unknown'}</Text>}
        {v && (
          <Text>
            Ship: {v.steps.length ? `${v.steps.join(', ')} done` : 'no checkpoint'}
            {v.next ? ` · next: ${v.next}` : ''}
          </Text>
        )}
        {v && (
          <Text>
            {pr
              ? `PR #${pr.number} ${pr.state}: ${pr.pass} passed, ${pr.fail} failed, ${pr.pending} pending`
              : 'PR: none found (or gh unavailable)'}
          </Text>
        )}
        <Button key="refresh" label="Refresh" onPress={() => refreshShip($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: CLEANUP_PANE }, async ($, e, next) => {
    if (!(await open($))) return next(e)
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const run = await read($, cleanup)
    const head =
      run.phase === 'planning' ? 'Opus is planning the cleanup (read-only)…'
      : run.phase === 'applying' ? 'Opus is applying the approved plan…'
      : run.phase === 'planned' ? 'Plan ready. Nothing has changed yet.'
      : run.phase === 'done' ? 'Cleanup applied.'
      : run.phase === 'failed' ? 'The cleanup stopped.'
      : 'No cleanup run yet.'
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{head}</Text>
        {run.report && <Markdown key="cleanup-report" text={run.report} />}
        <Box flexDirection="row" gap={2}>
          {run.phase === 'planned' && (
            <Button key="cleanup-apply" variant="primary" label="Apply plan (deletes)" onPress={() => startCleanup($, 'apply')} />
          )}
          {(run.phase === 'planned' || run.phase === 'done' || run.phase === 'failed') && (
            <Button key="cleanup-discard" label={run.phase === 'planned' ? 'Discard plan' : 'Close'} onPress={() => update($, cleanup, () => IDLE)} />
          )}
          {(run.phase === 'idle' || run.phase === 'done' || run.phase === 'failed') && (
            <Button key="cleanup-plan" label="Plan cleanup (opus)" onPress={() => startCleanup($, 'plan')} />
          )}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await open($))) return next(e)
    const b = await read($, budget)
    const now = await $.clock.now()
    const line = budgetLine(b, now)
    const hyg = await read($, hygiene)
    const run = await read($, cleanup)
    const hl = hygieneLine(hyg, false)
    if (!line && !hl) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    // Desktop, VS Code, mobile: the card's animated SVG bars; the terminal has no Svg, so its glyph line.
    const Svg = e.surface === 'terminal' ? null : ($.ui.resolve(e) as { Svg?: any }).Svg
    const bars = budgetBars(b, now)
    const ctx = contextNote(b)
    return (
      <Box flexDirection="column">
        {line && !Svg && <Text dimColor>{line}</Text>}
        {line && Svg && (
          <Box flexDirection="row" gap={2}>
            {bars.map(bar => (
              <Box key={bar.label} flexDirection="row" gap={1}>
                <Text dimColor>{bar.label}</Text>
                <Svg source={budgetBarSvg(bar)} alt={budgetBarAlt(bar)} isInteractive />
              </Box>
            ))}
            {ctx && <Text dimColor>{ctx}</Text>}
          </Box>
        )}
        {hl && (
          <Box flexDirection="row" alignItems="center">
            {!Svg && <Text dimColor>devops · </Text>}
            <Text dimColor>{hl} </Text>
            {run.phase === 'planning' || run.phase === 'applying' ? (
              <Text dimColor>[ Clean up · {run.phase === 'planning' ? 'planning…' : 'applying…'} ]</Text>
            ) : run.phase === 'planned' ? (
              <Button key="cleanup-review" label="Review cleanup plan" onPress={() => $.ui.open({ id: CLEANUP_PANE, title: 'Cleanup' })} />
            ) : (
              <Button key="cleanup" label="Clean up (opus)" onPress={() => startCleanup($, 'plan')} />
            )}
            {Svg && (
              <Box flexGrow={1} justifyContent="center">
                <Text color="#5c6070" italic>
                  devops
                </Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  })
}

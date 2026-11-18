// Engine tests of the devops mods (feature `claude-mods`, alpha).
// Run: npm run test:mods  (= claude plugin test plugins/devops)
// The hooks `on` registers here stand for the engine: files, env, clock,
// gh/git, the model. Nothing reaches the real machine.
import { expect, test } from 'claude-code/testing'
import {
  addRun,
  archiveOffered,
  archiveRefusal,
  agentRows,
  batchDropReason,
  batchMaybeCollectable,
  batchPreviewLine,
  batchViewFrom,
  budgetFrom,
  budgetBars,
  fableFromLive,
  cleanupApplyPrompt,
  cleanupPlanPrompt,
  cleanupView,
  compactAdvised,
  compactThreshold,
  budgetBarAlt,
  cardTextSvg,
  causeOf,
  estimateTextWidth,
  hourglassSvg,
  isHintCard,
  hygieneFrom,
  hygieneLine,
  apiFrom,
  benefitFrom,
  benefitIsOfCall,
  mcpDown,
  compactTokens,
  echoText,
  hooksSeen,
  infoHeadline,
  infoRows,
  isActive,
  overheadFrom,
  parseJsonl,
  shipsFrom,
  statusText,
  isInactiveUnmerged,
  lastLine,
  learnCause,
  LOCALES,
  localeFrom,
  markerActive,
  markerHides,
  nudgeThresholdFrom,
  parseWriterOutput,
  passiveSpikeRow,
  ringPercent,
  tr,
  verbatimNotices,
  breakEvenRate,
  cardFromResult,
  claimWake,
  disablesAfter,
  keepalivePolicy,
  pendingWakes,
  readShare,
  scheduleWake,
  wakeDelayMs,
} from './format'
import type { KeepaliveInput, StrKey } from './format'

const HOME = 'C:/Users/tester'
const NOW = Date.parse('2026-11-10T20:00:00.000Z')
const SURFACES = ['terminal', 'desktop'] as const

type Files = Record<string, string>

/** The engine beneath the plugin: files by path suffix, env, clock, toasts, commands. */
function engine(on: any, opts: { pin?: string; files?: Files; agents?: unknown[] } = {}) {
  const files: Files = {
    '/features.json': JSON.stringify({ features: { 'claude-mods': { minChannel: 'alpha' } } }),
    '/.claude/plugins/.channels.json': JSON.stringify({ dotclaude: opts.pin ?? 'alpha' }),
    ...(opts.files || {}),
  }
  const seen = { toasts: [] as string[], commands: [] as string[], writes: [] as { path: string; text: string }[], prompts: [] as string[], status: [] as (string | undefined)[], opened: [] as string[], hints: [] as Array<{ tail?: string }> }
  let clock = NOW
  on('fs.read', (_: unknown, e: { path: string }) => {
    const p = String(e.path).replace(/\\/g, '/')
    const hit = Object.keys(files).find(k => p.endsWith(k))
    if (!hit) throw new Error(`ENOENT: ${p}`)
    return { value: files[hit] }
  })
  on('fs.write', (_: unknown, e: { path: string; text: string }) => {
    seen.writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('env.get', (_: unknown, e: { name: string }) => ({ value: e.name === 'USERPROFILE' ? HOME : undefined }))
  on('clock.now', () => ({ value: clock }))
  on('ui.toast', (_: unknown, e: { text: string }) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_: unknown, e: { text: string | undefined }) => {
    seen.status.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_: unknown, e: { id: string }) => {
    seen.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('command.register', (_: unknown, e: { name: string }) => {
    seen.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('agent.list', () => ({ value: opts.agents ?? [] }))
  // The engine's own drawing beneath the plugin.
  on('ui.render', ($: any, e: any) => {
    if (e.component === 'PromptHint') seen.hints.push(e.props)
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.measure', (_: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    seen.prompts.push(e.text)
    return { text: e.text }
  })
  return { seen, files, tick: (ms: number) => { clock += ms } }
}

/** A marker if the mounted band shows `word` anywhere (as Text, or as the alt of a card-text image), else undefined. */
async function has(band: any, word: string): Promise<string | undefined> {
  const root = await band.find({ key: 'band' })
  return root && JSON.stringify(root).includes(word) ? word : undefined
}

/** The Svg inside a found element: an Svg has no key of its own, its wrapping Box does. */
function svgIn(node: any): any {
  return node && Array.isArray(node.children) ? node.children.find((c: any) => c && c.type === 'Svg') : undefined
}

const PANE_PROPS = {
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const

function pane(requestId: string, title: string) {
  return { plugin: 'devops', component: 'Pane', requestId, props: { ...PANE_PROPS, title } } as const
}

const BAND = { plugin: 'devops', component: 'AbovePrompt', props: { hasSurvey: false, isCollapsed: false, isWorking: false, view: {} } } as const
const WORKING_BAND = { ...BAND, props: { ...BAND.props, isWorking: true } } as const

const CARD_TOOL = 'mcp__plugin_devops_dotclaude__render_completion_card'
const CARD_DATA = {
  v: 1,
  l: 'de',
  ti: 'Band zeigt die Card',
  at: '01:43',
  h: '👉 📦 Committed — fertig — shippen?',
  pt: ['Doku nachziehen'],
  bt: [
    { l: 'Ship', i: 'rocket', p: 'ship', pr: 1 },
    { l: 'Nachbessern', i: 'pencil', p: 'Ja, die Doku bitte auch nachziehen.' },
  ],
}
const CARD_RESULT =
  '[CARD WIDGET — DO NOT OUTPUT THIS BLOCK]\n----- widget_code -----\n' +
  '<div class="dc-answer"><p>THE ANSWER</p></div><div id="dc-card"></div>\n' +
  `<script type="application/json" id="dc-card-data">${JSON.stringify(CARD_DATA)}</script>\n` +
  '----- end widget_code -----'

const MEASURE = {
  context: { window: 200000, tokens: 170000, percent: 85 },
  rateLimits: [
    // 5h: 72 % used, 2 h to reset (60 % of the window gone) → 12 pp ahead → yellow; Wk: 3 d to reset, on pace → omitted.
    { kind: 'five_hour', percentUsed: 72, resetsAt: new Date(NOW + 2 * 3_600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 18, resetsAt: new Date(NOW + 3 * 86_400_000).toISOString() },
  ],
  changed: ['context', 'rateLimits'],
}

const ORPHAN_REPORT = JSON.stringify({
  generatedAt: new Date(NOW - 3_600_000).toISOString(),
  repos: [{ path: 'P:/Projects/demo', atRisk: [{ branch: 'a' }, { branch: 'b' }, { branch: 'c', dirty: 2 }], parked: [] }],
})

test('gate off (stable pin): no command, nothing drawn, events pass through', async ($, on) => {
  const { seen } = engine(on, { pin: 'stable', files: { '/.claude/orphan-report.json': ORPHAN_REPORT } })
  on('agent.spawn', () => ({ model: 'claude-sonnet', agentId: 'a1' }))
  await $.session.start({ cwd: 'P:/Projects/demo', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  const spawned = await $.agent.spawn({ prompt: 'p', description: 'look around', subagentType: 'Explore' })
  expect(spawned.agentId).toBe('a1')
  expect(seen.commands).toEqual([])
  expect(seen.status).toEqual([])
  for (const surface of SURFACES) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ type: 'Text', text: /5h/ })).toBeUndefined()
    expect(await band.find({ key: 'cleanup' })).toBeUndefined()
    await band.unmount()
    const ui = await $.ui.mount({ ...pane('devops-agents', 'Agents'), surface })
    expect(await ui.find({ type: 'Text', text: /look around|No subagents/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('gate on: the commands are registered; the status line carries the state, never the hygiene count', async ($, on) => {
  const { seen } = engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT } })
  await $.session.start({ cwd: 'P:/Projects/demo/.claude/worktrees/x', surface: 'desktop', isInteractive: true })
  expect(seen.commands).toEqual(['devops-agents', 'devops-ship', 'mods-spike-fork', 'mods-spike-wake', 'devops'])
  expect(seen.status.at(-1)).toBe('🟢 active')
  expect(seen.status.join('|')).not.toMatch(/branch|worktree/)
})

test('agent pane lists a subagent with type, model, elapsed and status, on every surface', async ($, on) => {
  const { tick } = engine(on, { agents: [{ id: 'a1', description: 'look around', type: 'Explore', status: 'running' }] })
  on('agent.spawn', () => ({ model: 'claude-sonnet', agentId: 'a1' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'p', description: 'look around', subagentType: 'Explore' })
  tick(65_000)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...pane('devops-agents', 'Agents'), surface })
    const row = await ui.find({ type: 'Text', text: /Explore/ })
    expect(row?.text).toBe('running   Explore · claude-sonnet · 1 m 05 s · look around')
    await ui.unmount()
  }
})

test('budget band draws the card bars (SVG on desktop, glyphs on the terminal) with the card rules', async ($, on) => {
  const { seen } = engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT } })
  await $.session.start({ cwd: 'P:/Projects/demo', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  for (const surface of SURFACES) {
    const band = await $.ui.mount({ ...BAND, surface })
    if (surface === 'terminal') {
      const line = await band.find({ type: 'Text', text: /5h/ })
      expect(line?.text).toBe('⚠ 5h ▰▰▰▰▰▰▰▰▱▱│▱▱▱ 2 h 0 m')
      // The context is the ring chip's text: 170000 of the 187000-token default threshold = 91 %.
      expect((await band.find({ type: 'Text', text: /91 %/ }))?.text).toBe('🧠 91 %')
    } else {
      const bar = await svgIn(await band.find({ key: 'bar-5h' }))
      expect(bar?.props.source).toMatch(/<animate attributeName="x"/)
      expect(bar?.props.source).toMatch(/fill="#e6c36a"/)
      expect((await svgIn(await band.find({ key: 'idle-ring' })))?.props.width).toBe(14)
    }
    await band.unmount()
  }
  expect(seen.prompts).toEqual([])
  expect(seen.writes).toEqual([])
})

test('cleanup button: one press = one read-only opus plan subagent; its answer lands in the pane with Apply; Apply runs that plan', async ($, on) => {
  const { seen } = engine(on, {
    files: { '/.claude/orphan-report.json': ORPHAN_REPORT },
    agents: [
      { id: 'c1', description: 'Branch cleanup plan', type: 'general-purpose', status: 'running' },
      { id: 'c2', description: 'Branch cleanup apply', type: 'general-purpose', status: 'running' },
    ],
  })
  const spawns: Array<{ prompt: string; model?: string }> = []
  on('agent.spawn', (_: unknown, e: { prompt: string; model?: string }) => {
    spawns.push({ prompt: e.prompt, model: e.model })
    return { model: 'claude-opus', agentId: `c${spawns.length}` }
  })
  on('session.root', () => ({ value: 'P:/Projects/demo' }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  await $.session.start({ cwd: 'P:/Projects/demo', surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'cleanup-fold' }) // the idle row: ▸ opens the block, its button starts the run
  await band.press({ key: 'cleanup' })
  expect(spawns.length).toBe(1)
  await band.unmount()
  // While the plan runs the button is a dim text: a second press cannot start another run.
  const busy = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await busy.find({ key: 'cleanup' })).toBeUndefined()
  expect((await busy.find({ type: 'Text', text: /planning/ }))?.text).toBe('[ Clean up · planning… ]')
  await busy.unmount()
  expect(spawns.length).toBe(1)
  expect(spawns[0].model).toBe('opus')
  expect(spawns[0].prompt).toMatch(/READ-ONLY/)
  expect(seen.prompts).toEqual([]) // nothing reaches the main conversation

  const planText = '## Plan\n1. git worktree remove P:/Projects/demo/.claude/worktrees/old (landed, clean)'
  await $.turn.complete({ answer: planText, durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'c1', reason: 'end' } as any)
  expect(seen.toasts.at(-1)).toMatch(/plan ready/)
  const pane = await $.ui.mount({ plugin: 'devops', component: 'Pane', requestId: 'devops-cleanup', props: { isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {}, title: 'Cleanup' }, surface: 'desktop' } as any)
  expect((await pane.find({ type: 'Markdown' }))?.props.text).toBe(planText)
  await pane.press({ key: 'cleanup-apply' })
  await pane.unmount()
  expect(spawns.length).toBe(2)
  expect(spawns[1].prompt).toMatch(/APPROVED PLAN:\n## Plan\n1\. git worktree remove/)
})

test('hygiene ignores the worktree this session works in; zero counts are left out of the line', async ($, on) => {
  const report = JSON.stringify({
    generatedAt: new Date(NOW - 3_600_000).toISOString(),
    repos: [{ path: 'P:/Projects/demo', atRisk: [{ branch: 'mine', path: 'P:/Projects/demo/.claude/worktrees/mine', dirty: 1 }, { branch: 'old' }] }],
  })
  const { seen } = engine(on, { files: { '/.claude/orphan-report.json': report } })
  await $.session.start({ cwd: 'P:/Projects/demo/.claude/worktrees/mine', surface: 'desktop', isInteractive: true })
  // The count feeds the band's cleanup block only; the status line never names it.
  expect(hygieneLine(hygieneFrom(JSON.parse(report), 'P:/Projects/demo/.claude/worktrees/mine', NOW), true)).toBe('devops: 1 open branch')
  expect(seen.status.at(-1)).toBe('🟢 active')
})

test('toasts: permission request, long subagent, SessionStart notices (hook text unchanged)', async ($, on) => {
  const { seen, tick } = engine(on)
  const nudge = '[ss.orphan.nudge] Show the user this line verbatim in your first reply, once:\n⚠ Hier: 3 Branches nicht in main gemergt'
  on('classic.SessionStart', () => ({ additionalContext: [nudge] }))
  on('classic.Notification', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('agent.spawn', () => ({ model: 'claude-opus', agentId: 'a2' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ss = await $.classic.SessionStart({ source: 'startup' } as any)
  expect(ss.additionalContext).toEqual([nudge])
  await $.classic.Notification({ notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' } as any)
  await $.agent.spawn({ prompt: 'p', description: 'build it', subagentType: 'general-purpose' })
  tick(130_000)
  await $.classic.SubagentStop({ agent_id: 'a2', agent_type: 'general-purpose', stop_hook_active: false, agent_transcript_path: '/t' } as any)
  expect(seen.toasts).toEqual([
    '⚠ Hier: 3 Branches nicht in main gemergt',
    'Permission request waiting: Claude needs your permission to use Bash',
    'general-purpose finished after 2 m 10 s: build it',
  ])
})

test('a long background Bash run gets a toast when its notification arrives (call and prompt unchanged)', async ($, on) => {
  const { seen, tick } = engine(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true, tool_use_id: 'toolu_long' } as any)
  await $.tool.call({ tool: 'Bash', command: 'npm run lint', run_in_background: true, tool_use_id: 'toolu_short' } as any)
  tick(30_000)
  const short = '<task-notification>\n<task-id>b1</task-id>\n<tool-use-id>toolu_short</tool-use-id>\n<status>completed</status>\n<summary>Background command "Lint" completed (exit code 0)</summary>\n</task-notification>'
  const shortOut = await $.prompt.submit({ text: short } as any)
  expect(shortOut.text).toBe(short)
  tick(100_000)
  const long = '<task-notification>\n<task-id>b2</task-id>\n<tool-use-id>toolu_long</tool-use-id>\n<status>completed</status>\n<summary>Background command "Run tests" completed (exit code 0)</summary>\n</task-notification>'
  const longOut = await $.prompt.submit({ text: long } as any)
  expect(longOut.text).toBe(long)
  await $.prompt.submit({ text: 'plain prompt mentioning toolu_long' } as any)
  expect(seen.toasts).toEqual(['Background command "Run tests" completed (exit code 0) · 2 m 10 s'])
})

test('ship pane shows the checkpoint of this branch and the PR checks', async ($, on) => {
  engine(on, {
    files: {
      '/repo/.claude/.ship-checkpoint.json': JSON.stringify({ branch: 'feat/x', root: '/repo', steps: { preflight: {}, build: {} } }),
    },
  })
  on('session.root', () => ({ value: '/repo' }))
  on('process.run', (_: unknown, e: { argv: string[] }) => ({
    value:
      e.argv[0] === 'git'
        ? { exitCode: 0, stdout: 'feat/x\n', stderr: '' }
        : {
            exitCode: 0,
            stdout: JSON.stringify({ number: 7, state: 'OPEN', statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }, { status: 'IN_PROGRESS' }] }),
            stderr: '',
          },
  }))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'devops-ship' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...pane('devops-ship', 'Ship / CI'), surface })
    expect((await ui.find({ type: 'Text', text: /^Ship:/ }))?.text).toBe('Ship: preflight, build done · next: bump')
    expect((await ui.find({ type: 'Text', text: /^PR/ }))?.text).toBe('PR #7 OPEN: 1 passed, 1 failed, 1 pending')
    await ui.unmount()
  }
})

test('spike command runs one fork without effort and logs the cache fields', async ($, on) => {
  const { seen } = engine(on)
  const forks: unknown[] = []
  on('model.fork', (_: unknown, e: unknown) => {
    forks.push(e)
    return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 3, output_tokens: 2, cache_read_input_tokens: 99000, cache_creation_input_tokens: 40 } } }
  })
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200000, tokens: 100000, percent: 50 }, rateLimits: MEASURE.rateLimits } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'mods-spike-fork' })
  expect(forks).toEqual([{ prompt: 'Reply with the single word: ok' }])
  expect(seen.writes.length).toBe(1)
  expect(seen.writes[0].path.replace(/\\/g, '/')).toBe(`${HOME}/.claude/devops-mods-spike.jsonl`)
  const row = JSON.parse(seen.writes[0].text.trim())
  expect(row).toMatchObject({
    isAnswered: true,
    cache_read_input_tokens: 99000,
    cache_creation_input_tokens: 40,
    output_tokens: 2,
    context_tokens: 100000,
    cache_read_share: 0.99,
    five_hour_before: 72,
    five_hour_after: 72,
    weekly_before: 18,
    weekly_after: 18,
  })
  expect(r.text).toMatch(/cache read 99000/)
})

test('card band: the card tool result puts the template part above the prompt; a button sends its prompt once', async ($, on) => {
  const { seen } = engine(on)
  on('tool.call', (_: unknown, e: { tool: string }) => ({ result: {}, text: e.tool === CARD_TOOL ? CARD_RESULT : 'ok' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.tool.call({ tool: CARD_TOOL, variant: 'ready', summary: 'x' } as any)
  expect(r.text).toBe(CARD_RESULT) // passed through unchanged
  for (const surface of SURFACES) {
    const band = await $.ui.mount({ ...BAND, surface })
    if (surface === 'terminal') {
      expect((await band.find({ type: 'Text', text: /^Band zeigt/ }))?.text).toBe('Band zeigt die Card')
      expect((await band.find({ type: 'Text', text: /^01:43$/ }))?.text).toBe('01:43')
      expect((await band.find({ type: 'Text', text: /Committed/ }))?.text).toBe('👉 📦 Committed — fertig — shippen?')
    }
    if (surface === 'terminal') expect((await band.find({ type: 'Text', text: /Doku/ }))?.text).toBe('› Doku nachziehen')
    else {
      // B2: the point is 14 px secondary with its own violet › (the card's marker), the title and heading 16 px medium, the time 12 px tabular.
      expect((await band.find({ type: 'Text', text: /^Doku/ }))?.props).toMatchObject({ size: 'body', dimColor: true })
      expect((await band.find({ type: 'Text', text: '›' }))?.props.color).toBe('#9d8cd6')
      // The title, heading and time are images at the card's exact scale (see the cardTextSvg test).
      expect(svgIn(await band.find({ key: 'card-title' }))?.props.alt).toBe('Band zeigt die Card')
      expect(svgIn(await band.find({ key: 'card-heading' }))?.props.alt).toBe('👉 📦 Committed — fertig — shippen?')
      expect(svgIn(await band.find({ key: 'card-time-text' }))?.props.alt).toBe('01:43')
    }
    expect(await band.find({ type: 'Text', text: /THE ANSWER/ })).toBeUndefined() // the answer stays inline
    expect((await band.find({ key: 'card-button-0' }))?.props.variant).toBe('primary')
    expect((await band.find({ key: 'card-button-1' }))?.props.label).toBe('Nachbessern')
    await band.unmount()
  }
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'card-button-1' })
  await band.unmount()
  expect(seen.prompts).toEqual(['Ja, die Doku bitte auch nachziehen.'])
  // The card left the band with the press: a second press has nothing to hit.
  const after = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await after.find({ key: 'card-button-0' })).toBeUndefined()
  await after.unmount()
  expect(seen.prompts.length).toBe(1)
})

test('card band: a typed prompt spends the card, a textless continuation keeps it; subagent calls and refusals never set it', async ($, on) => {
  engine(on)
  on('tool.call', (_: unknown, e: { tool: string; agentId?: string }) =>
    e.tool === CARD_TOOL && (e as any).summary === 'refused' ? { result: {}, text: 'Card refused: validation missing', isError: true } : { result: {}, text: CARD_RESULT },
  )
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId || 't' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x', agentId: 'sub1' } as any)
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await has(band, 'Committed')).toBeUndefined()
  await band.unmount()
  await $.tool.call({ tool: CARD_TOOL, summary: 'refused' } as any)
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await has(band, 'Committed')).toBeUndefined()
  await band.unmount()
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  await $.turn.start({ text: '', turnId: 't2' } as any)
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await has(band, 'Committed')).toBeDefined()
  await band.unmount()
  await $.turn.start({ text: 'next task', turnId: 't3' } as any)
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await has(band, 'Committed')).toBeUndefined()
  await band.unmount()
})

test('card band on the terminal: the markdown card gives title and heading, no buttons', async ($, on) => {
  engine(on)
  const md = '&nbsp;\n\n---\n\n### **✨✨✨ Fix gelandet ✨✨✨**\n› 2 Dateien geändert\n**🟩 🚀 Released Alpha — v0.1.0 — fertig.**\n---'
  on('tool.call', () => ({ result: {}, text: md }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text', text: /^Fix/ }))?.text).toBe('Fix gelandet')
  expect((await band.find({ type: 'Text', text: /Released/ }))?.text).toBe('🟩 🚀 Released Alpha — v0.1.0 — fertig.')
  expect((await band.find({ type: 'Text', text: /Dateien/ }))?.text).toBe('› 2 Dateien geändert')
  expect(await band.find({ key: 'card-button-0' })).toBeUndefined()
  await band.unmount()
})

test('working band: turning hourglass, the running step of the task list and the tool running now; no card while working', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: {}, text: CARD_RESULT }))
  on('turn.start', () => ({ turnId: 't' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  await $.turn.start({ text: 'build it', turnId: 't1' } as any)
  await $.tool.call({
    tool: 'mcp__ccd_turn__update_plan',
    items: [{ content: 'Lesen', status: 'in_progress' }, { content: 'Bauen', status: 'pending' }, { content: 'Testen', status: 'pending' }],
    scope: 'continuation',
  } as any)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', advance: true } as any)
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the mod tests' } as any)
  for (const surface of SURFACES) {
    const band = await $.ui.mount({ ...WORKING_BAND, surface })
    expect((await band.find({ type: 'Text', text: /^2\/3/ }))?.text).toBe('2/3 · Bauen')
    expect((await band.find({ type: 'Text', text: /^Bash/ }))?.text).toBe('Bash · Run the mod tests')
    expect(await has(band, 'Committed')).toBeUndefined()
    if (surface === 'desktop') {
      const glass = await svgIn(await band.find({ key: 'working' }))
      // B8: the ⏳ emoji itself, turning all the time (a full turn, repeatCount indefinite), slower than a flip.
      expect(glass?.props.source).toMatch(/>⏳<\/text>/)
      expect(glass?.props.source).toMatch(/<animateTransform attributeName="transform" type="rotate" from="0 9 9" to="360 9 9" dur="8s" repeatCount="indefinite"\/>/)
      expect(glass?.props.width).toBe(18)
      expect(glass?.props.height).toBe(18)
      expect(await band.find({ key: 'rail' })).toBeDefined()
      expect(await band.find({ key: 'hygiene' })).toBeUndefined() // B9: no cleanup block while working
    } else {
      expect((await band.find({ type: 'Text', text: '⏳' }))?.text).toBe('⏳')
    }
    await band.unmount()
  }
  // TodoWrite: the running step reads in its present-continuous form.
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Fix it', activeForm: 'Fixing it', status: 'in_progress' }] } as any)
  const band = await $.ui.mount({ ...WORKING_BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text', text: /^1\/1/ }))?.text).toBe('1/1 · Fixing it')
  await band.unmount()
})

test('budget bars carry a fixed size (an interactive Svg frame takes none from the markup); no devops watermark', async ($, on) => {
  engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT } })
  await $.session.start({ cwd: 'P:/Projects/demo', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const bar = await svgIn(await band.find({ key: 'bar-5h' }))
  expect(bar?.props.width).toBe(220)
  expect(bar?.props.height).toBe(24)
  expect(await band.find({ type: 'Text', text: /^devops$/ })).toBeUndefined()
  await band.unmount()
})

test('cleanup briefs keep the session worktree out and approve only the plan; the band row drops the devops prefix', async () => {
  const plan = cleanupPlanPrompt('P:/r', 'P:/r/.claude/worktrees/me')
  expect(plan).toMatch(/Never touch the worktree P:\/r\/\.claude\/worktrees\/me/)
  expect(plan).toMatch(/Do not commit, delete/)
  const apply = cleanupApplyPrompt('P:/r', 'P:/r/.claude/worktrees/me', 'PLAN X')
  expect(apply).toMatch(/Run no command that is not in the plan/)
  expect(apply.endsWith('APPROVED PLAN:\nPLAN X')).toBe(true)
  expect(hygieneLine({ branches: 0, worktrees: 2, ageHours: 1 }, false)).toBe('2 dirty worktrees')
  expect(hygieneLine({ branches: 0, worktrees: 2, ageHours: 1 }, false, 'de')).toBe('2 unsaubere Worktrees')
  expect(hygieneLine({ branches: 0, worktrees: 2, ageHours: 1 })).toBe('devops: 2 dirty worktrees')
})

test('SessionStart notices: header-format notices (version) become toasts; only once per session, never after a compaction', async ($, on) => {
  const { seen } = engine(on)
  const version = '[ss.version.notice] Show the user this line verbatim in your first reply, once:\nℹ devops: lokal 0.371.0 (alpha) · Cloud 0.368.0 updaten'
  const nudge = '[ss.orphan.nudge] Show the user this line verbatim in your first reply, once:\n⚠ Hier: 1 Worktree mit uncommitteter Arbeit'
  on('classic.SessionStart', () => ({ additionalContext: [version, nudge] }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.classic.SessionStart({ source: 'startup' } as any)
  await $.classic.SessionStart({ source: 'compact' } as any)
  await $.classic.SessionStart({ source: 'clear' } as any)
  expect(seen.toasts).toEqual(['ℹ devops: lokal 0.371.0 (alpha) · Cloud 0.368.0 updaten', '⚠ Hier: 1 Worktree mit uncommitteter Arbeit'])
})

test('concept watchers: a normal end gets no toast, a failed one does at any length; other runs keep the 2-minute rule', async ($, on) => {
  const { seen, tick } = engine(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const watch = 'node "C:/p/scripts/concept-watch.js" --mode watch --port 8960'
  await $.tool.call({ tool: 'Bash', command: watch, run_in_background: true, tool_use_id: 'toolu_w1' } as any)
  await $.tool.call({ tool: 'Bash', command: watch, run_in_background: true, tool_use_id: 'toolu_w2' } as any)
  tick(30_000)
  const note = (id: string, status: string, summary: string) =>
    `<task-notification>\n<task-id>x</task-id>\n<tool-use-id>${id}</tool-use-id>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`
  await $.prompt.submit({ text: note('toolu_w2', 'failed', 'Background command "Relaunch concept pickup waker" failed with exit code 4') } as any)
  tick(7 * 3_600_000)
  await $.prompt.submit({ text: note('toolu_w1', 'completed', 'Background command "Run concept pickup waker" completed (exit code 0)') } as any)
  expect(seen.toasts).toEqual(['Background command "Relaunch concept pickup waker" failed with exit code 4 · 30 s'])
})

test('agents pane: the first background subagent opens it once; content-equal rows merge with a ×n column', async ($, on) => {
  const { seen, tick } = engine(on)
  const opened = seen.opened
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-sonnet', agentId: `a${++n}` }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'p', description: 'quick look', subagentType: 'Explore', background: false } as any)
  expect(opened).toEqual([])
  await $.agent.spawn({ prompt: 'p', description: '[W1] B1', subagentType: 'devops:frontend', background: true } as any)
  await $.agent.spawn({ prompt: 'p', description: '[W1] B1', subagentType: 'devops:frontend', background: true } as any)
  expect(opened).toEqual(['devops-agents'])
  tick(10_000)
  const ui = await $.ui.mount({ ...pane('devops-agents', 'Agents'), surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /B1/ }))?.text).toBe('running   ×2 devops:frontend · claude-sonnet · 10 s · [W1] B1')
  expect((await ui.find({ type: 'Text', text: /Explore/ }))?.text).toBe('running      Explore · claude-sonnet · 10 s · quick look')
  await ui.unmount()
})

test('agentRows merges content-equal rows only; passiveSpikeRow computes the cache-read share of the first request', async () => {
  const base = { type: 'devops:qax', model: 'sonnet', description: 'QA', status: 'completed' }
  const rows = agentRows(
    [
      { ...base, id: '1', startedAt: 0, endedAt: 60_000 },
      { ...base, id: '2', startedAt: 100_000, endedAt: 220_000 },
      { ...base, id: '3', description: 'other', startedAt: 0, endedAt: 1000 },
    ],
    NOW,
  )
  expect(rows.map(r => r.text)).toEqual(['completed ×2 devops:qax · sonnet · 2 m 00 s · QA', 'completed    devops:qax · sonnet · 1 s · other'])
  expect(agentRows([{ ...base, id: '1', startedAt: 0, endedAt: 5000 }], NOW)[0].text).toBe('completed devops:qax · sonnet · 5 s · QA')
  const row = passiveSpikeRow(3_300_000, { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 980, cache_creation_input_tokens: 10, model: 'claude-opus' }, null, NOW)
  expect(row).toMatchObject({ mode: 'passive', pause_min: 55, cache_read_share: 0.98, pass: true })
  expect(verbatimNotices(['[ss.version.notice] … verbatim in your first reply, once:\nℹ v1 → v2'])).toEqual(['ℹ v1 → v2'])
})

test('branch line: undecided safety copies count like the nudge; a 24-72 h old report shows its age, older hides', async () => {
  const report = (hoursAgo: number) => ({
    generatedAt: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
    repos: [{
      path: 'P:/Projects/demo',
      atRisk: [{ branch: 'w', dirty: 1 }],
      parked: [
        { branch: 'parked/autosave/a', ageDays: 5 },
        { branch: 'parked/autosave/fresh', ageDays: 1 },
        { branch: 'backup/x', ageDays: 9, legacy: true },
        { branch: 'parked/old', ageDays: 40, reason: 'ARCHIVED' },
      ],
    }],
  })
  const h = hygieneFrom(report(2), 'P:/Projects/demo', NOW)
  expect(h).toMatchObject({ branches: 0, worktrees: 1, copies: 2 })
  expect(hygieneLine(h)).toBe('devops: 1 dirty worktree · 2 undecided safety copies')
  expect(hygieneLine(hygieneFrom(report(26), 'P:/Projects/demo', NOW), false)).toBe('1 dirty worktree · 2 undecided safety copies · as of 26 h')
  expect(hygieneFrom(report(73), 'P:/Projects/demo', NOW)).toBeNull()
})

test('load marker: session.start writes this session into ~/.claude/devops-mods-loaded.json, keeping earlier ones', async ($, on) => {
  const { seen } = engine(on, { files: { '/.claude/devops-mods-loaded.json': JSON.stringify({ sessions: [{ sid: 'old', surface: 'terminal', interactive: true, ts: 'x' }] }) } })
  on('session.id', () => ({ value: 'sid-123' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const w = seen.writes.find(x => x.path.replace(/\\/g, '/').endsWith('/.claude/devops-mods-loaded.json'))
  expect(w).toBeDefined()
  const rows = JSON.parse(String(w?.text)).sessions
  expect(rows.map((r: { sid: string }) => r.sid)).toEqual(['old', 'sid-123'])
  expect(rows[1]).toMatchObject({ surface: 'desktop', interactive: true })
})

// ---------------------------------------------------------------------------------------------
// Band redesign (concept 20261115-1417-band-redesign): rules B1-B16.
// ---------------------------------------------------------------------------------------------

const REPO = 'P:/Projects/demo'
const idleReport = (atRisk: unknown[], extra: Record<string, unknown> = {}, ageH = 1) =>
  JSON.stringify({ generatedAt: new Date(NOW - ageH * 3_600_000).toISOString(), repos: [{ path: REPO, atRisk, parked: [], ...extra }] })
const agentWt = (n: number, extra: Record<string, unknown> = {}) => ({
  kind: 'worktree',
  branch: `worktree-agent-ab${n}`,
  path: `${REPO}/.claude/worktrees/agent-ab${n}`,
  state: 'unlanded',
  idleDays: 5,
  ...extra,
})

test('B6 ring basis: share of the effective auto-compact threshold, from the measured window and the user own settings', () => {
  expect(compactThreshold(200_000)).toBe(187_000)
  expect(compactThreshold(1_000_000)).toBe(987_000) // a bigger window moves the basis, no model max is hard-coded
  expect(compactThreshold(200_000, { pctOverride: 50 })).toBe(100_000)
  expect(compactThreshold(200_000, { pctOverride: 99 })).toBe(187_000) // an override never raises the default
  expect(compactThreshold(1_000_000, { windowCap: 100_000 })).toBe(90_000) // the user own auto-compact window
  const at = (tokens: number, window: number, env = {}) => ringPercent({ fiveHour: null, weekly: null, context: null, contextTokens: tokens, contextWindow: window }, env)
  expect(at(93_500, 200_000)).toBe(50)
  expect(at(93_500, 200_000, { pctOverride: 50 })).toBe(94) // 100 % = the session compacts now
  expect(at(500_000, 1_000_000)).toBe(51)
  expect(at(900_000, 200_000)).toBe(100) // capped
  // Without a measured window the plain context share stands in; nothing measured = no ring.
  expect(ringPercent({ fiveHour: null, weekly: null, context: 42 })).toBe(42)
  expect(ringPercent({ fiveHour: null, weekly: null, context: null })).toBeNull()
  expect(ringPercent(null)).toBeNull()
  expect(budgetFrom({ context: { percent: 85, tokens: 170_000, window: 200_000 } })).toMatchObject({ context: 85, contextTokens: 170_000, contextWindow: 200_000 })
})

test('B7 compact gating: amber + button from 80 % only while work is open; neutral after a ship / released / finished card', () => {
  const none = { concept: false, changes: false, steps: false }
  const card = (heading: string) => ({ title: 't', at: '', heading, points: [], buttons: [] })
  expect(compactAdvised(84, { ...none, concept: true }, card('👉 🧭 Concept — wartet'))).toBe(true)
  expect(compactAdvised(84, { ...none, changes: true }, null)).toBe(true)
  expect(compactAdvised(84, { ...none, steps: true }, null)).toBe(true)
  expect(compactAdvised(79, { ...none, concept: true }, null)).toBe(false) // below 80 %
  expect(compactAdvised(84, none, null)).toBe(false) // nothing open: compacting would only burn tokens
  expect(compactAdvised(84, { ...none, changes: true }, card('🟩 🚀 Released Alpha — v1 — promoten?'))).toBe(false) // after a ship
  expect(compactAdvised(null, { ...none, concept: true }, null)).toBe(false)
})

test('B12 cleanup visibility: inactive unmerged work always, otherwise only above the nudge threshold; same counts as the nudge', () => {
  // inactive unmerged: unlanded / partial / dirty, no live session, idle >= 1 day or age unknown
  expect(isInactiveUnmerged({ state: 'unlanded', idleDays: 2 })).toBe(true)
  expect(isInactiveUnmerged({ state: 'partial' })).toBe(true) // idleDays missing = inactive
  expect(isInactiveUnmerged({ state: 'landed', dirty: 3, idleDays: 9 })).toBe(true) // uncommitted work counts
  expect(isInactiveUnmerged({ state: 'unlanded', idleDays: 0.2 })).toBe(false) // younger than a day
  expect(isInactiveUnmerged({ state: 'unlanded', idleDays: 9, live: true })).toBe(false) // a live session uses it
  expect(isInactiveUnmerged({ state: 'landed', idleDays: 9 })).toBe(false) // merged never counts
  const h = hygieneFrom(
    JSON.parse(idleReport([agentWt(1), agentWt(2, { live: true }), { branch: 'feat', state: 'unlanded', idleDays: 3 }, { kind: 'worktree', path: `${REPO}/.claude/worktrees/x`, state: 'broken' }], { landedLeftovers: 40 })),
    REPO,
    NOW,
  )
  // Same counting as ss.orphan.nudge.js: atRisk − dirty + remote branches, dirty worktrees, undecided copies.
  expect(h).toMatchObject({ branches: 3, worktrees: 0, copies: 0, agent: 1, broken: 1, landed: 40, inactive: 2, repo: REPO })
  expect(h?.causes).toEqual({ 'agent worktree': 1, branch: 1 })
  const v = cleanupView(h, 50)
  expect(v).toMatchObject({ n: 3, rule: { kind: 'inactive', n: 2 } })
  expect(v?.rows).toEqual([{ key: 'rowAgent', n: 1 }, { key: 'rowBranches', n: 1 }, { key: 'rowBroken', n: 1 }])
  // No inactive unmerged work: shown only when all leftovers (incl. landed ones) exceed the threshold.
  const quiet = { branches: 3, worktrees: 0, copies: 2, ageHours: 1, landed: 44, inactive: 0 }
  expect(cleanupView(quiet, 50)).toBeNull() // 5 open + 44 landed = 49, not above 50
  expect(cleanupView({ ...quiet, landed: 46 }, 50)).toMatchObject({ rule: { kind: 'count', n: 51 } })
  expect(cleanupView({ ...quiet, landed: 46 }, 80)).toBeNull() // a user threshold of 80 hides it
  expect(cleanupView({ branches: 0, worktrees: 0, copies: 0, ageHours: 1 }, 50)).toBeNull()
  // The threshold: project > global > default 50, valid integers only (devops-config.js).
  expect(nudgeThresholdFrom({ cleanup: { nudgeThreshold: 80 } }, { cleanup: { nudgeThreshold: 20 } })).toBe(80)
  expect(nudgeThresholdFrom(null, { cleanup: { nudgeThreshold: 20 } })).toBe(20)
  expect(nudgeThresholdFrom({ cleanup: { nudgeThreshold: 'x' } }, null)).toBe(50)
})

test('B13 run marker: one run per repo, hidden in other sessions until the report is newer than the run end, stale after 2 h', () => {
  const m = { repo: REPO, session: 'a', startedAt: NOW - 600_000 }
  expect(markerHides(m, REPO, 'b', 0, NOW)).toBe(true) // another session cleans up: this one hides the block
  expect(markerHides(m, REPO, 'a', 0, NOW)).toBe(false) // the starter keeps its own run state
  expect(markerHides(m, 'P:/Projects/other', 'b', 0, NOW)).toBe(false) // another repo
  const ended = { ...m, endedAt: NOW - 300_000 }
  expect(markerHides(ended, REPO, 'b', NOW - 400_000, NOW)).toBe(true) // report older than the end
  expect(markerHides(ended, REPO, 'b', NOW - 100_000, NOW)).toBe(false) // report newer: the block is back
  expect(markerHides({ ...m, startedAt: NOW - 2 * 3_600_000 - 1 }, REPO, 'b', 0, NOW)).toBe(false) // stale run never blocks
  expect(markerActive(m, REPO, NOW)).toBe(true)
  expect(markerActive(ended, REPO, NOW)).toBe(false)
  expect(markerActive({ ...m, startedAt: NOW - 3 * 3_600_000 }, REPO, NOW)).toBe(false)
})

test('B14 learn trigger: the same cause left >= 3 inactive unmerged leftovers in 2 runs; merged / age / count removals never count', () => {
  let h = addRun({ runs: [] }, { repo: REPO, at: 1, causes: { 'agent worktree': 4 } })
  expect(learnCause(h, REPO)).toBeNull() // one run is not a pattern
  h = addRun(h, { repo: REPO, at: 2, causes: { 'agent worktree': 2 } })
  expect(learnCause(h, REPO)).toBeNull() // fewer than 3 in the latest run
  h = addRun(h, { repo: REPO, at: 3, causes: { 'agent worktree': 3, branch: 1 } })
  expect(learnCause(h, REPO)).toEqual({ cause: 'agent worktree', runs: 2 })
  expect(learnCause(h, 'P:/Projects/other')).toBeNull() // per repo
  // A run that removed only merged / old leftovers has no causes at all: nothing to learn from.
  const merged = addRun(addRun({ runs: [] }, { repo: REPO, at: 1, causes: {} }), { repo: REPO, at: 2, causes: {} })
  expect(learnCause(merged, REPO)).toBeNull()
})

test('B15 locales: one table, en de es fr pt ja zh, chosen by the Claude Code language setting, fallback en', () => {
  expect([...LOCALES]).toEqual(['en', 'de', 'es', 'fr', 'pt', 'ja', 'zh'])
  expect(localeFrom('german')).toBe('de')
  expect(localeFrom('Deutsch')).toBe('de')
  expect(localeFrom('es')).toBe('es')
  expect(localeFrom('French')).toBe('fr')
  expect(localeFrom('português')).toBe('pt')
  expect(localeFrom('日本語')).toBe('ja')
  expect(localeFrom('zh-CN')).toBe('zh')
  expect(localeFrom('klingon')).toBe('en')
  expect(localeFrom(undefined)).toBe('en')
  expect(tr('de', 'junk', { n: 42 })).toBe('42 Altlasten')
  expect(tr('de', 'cleanupBtn')).toBe('Aufräumen')
  expect(tr('de', 'compact')).toBe('Kompaktieren')
  expect(tr('de', 'last')).toBe('Zuletzt:')
  expect(tr('de', 'ctx')).toBe('Kontext')
  expect(tr('en', 'ruleCount', { n: 62, t: 50 })).toBe('Trigger: 62 leftovers, more than 50')
  // Every string exists, non-empty and distinct from the placeholder, in all seven languages.
  const keys: StrKey[] = ['stActive', 'stInactive', 'stNoHooks', 'stNoMcp', 'echoNarrow1', 'echoNarrow2', 'echoLocal', 'infoHead', 'infoHeadNote', 'infoNarrowed', 'infoShipped', 'infoApi', 'infoGuards', 'infoOwn', 'noteMeasuredSince', 'noteMeasured7', 'noteCounted7', 'infoFoot', 'infoEmpty', 'ctx', 'compact', 'cleanupBtn', 'junk', 'last', 'rowAgent', 'rowCopies', 'rowBranches', 'rowBroken', 'ruleInactive', 'ruleCount', 'working', 'ringAlt', 'stBranch1', 'stBranchN', 'stDirty1', 'stDirtyN', 'stCopy1', 'stCopyN', 'asOf', 'toastPlanned', 'toastDone', 'toastFailed', 'toastLearn', 'permission', 'finishedAfter', 'bgCommand', 'paneIdle', 'panePlanning', 'paneApplying', 'panePlanned', 'paneDone', 'paneFailed', 'btnApply', 'btnDiscard', 'btnClose', 'btnPlan', 'btnReview', 'runPlanning', 'runApplying', 'learnOffer', 'learnBtn', 'runBusy']
  for (const loc of LOCALES) for (const k of keys) expect(tr(loc, k, { n: 1, t: 1, p: 1, h: 1, what: 'x', s: 'x', runs: 2, cause: 'c' })).toMatch(/\S/)
  // No placeholder is left unfilled in any language.
  for (const loc of LOCALES) for (const k of keys) expect(tr(loc, k, { n: 1, t: 1, p: 1, h: 1, what: 'x', s: 'x', runs: 2, cause: 'c' })).not.toMatch(/\{\w+\}/)
  // B10: "Last: title · time", empty without a card.
  expect(lastLine({ title: 'Offene Popup-Punkte erledigt', at: '14:10' }, 'de')).toBe('Zuletzt: Offene Popup-Punkte erledigt · 14:10')
  expect(lastLine(null, 'de')).toBe('')
  expect(hourglassSvg()).toMatch(/⏳/)
})

test('B1 B3 B4 B5 B7 band with a card: left card part, divider, right rail (ring + Compact), time in the top-right corner; CTA points only', async ($, on) => {
  const { seen } = engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT, '/.claude/concept-active.json': '{"port":8791}' } })
  on('tool.call', () => ({ result: {}, text: CARD_RESULT }))
  const compacts: unknown[] = []
  on('session.messages', () => ({ messages: [] }))
  on('session.compact', (_: unknown, e: unknown) => {
    compacts.push(e)
    return { messages: [] }
  })
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const main = await band.find({ key: 'main' })
  const rail = await band.find({ key: 'rail' })
  expect(main).toBeDefined()
  expect(rail).toBeDefined()
  expect(await band.find({ key: 'rail-divider' })).toBeDefined()
  // B1/B3: the time is its own absolutely placed box in the band's top-right corner, outside the left column.
  const time = await band.find({ key: 'card-time' })
  expect(time?.props).toMatchObject({ position: 'absolute', top: 0, right: 0 })
  expect(JSON.stringify(main)).not.toMatch(/01:43/)
  // B4: the CTA point of the card (pt), never a result line (r) or the answer.
  expect(JSON.stringify(main)).toMatch(/Doku nachziehen/)
  // B5: the ring is an interactive Svg with a fixed size and the percent + label next to it.
  const ring = svgIn(await band.find({ key: 'ring' }))
  expect(ring?.props).toMatchObject({ width: 32, height: 32, isInteractive: true })
  expect(ring?.props.source).toMatch(/#e6c36a/) // amber: 91 % of the compact threshold with an open concept page
  expect((await band.find({ type: 'Text', text: /^91 %$/ }))?.text).toBe('91 %')
  expect((await band.find({ type: 'Text', text: /^Context$/ }))?.text).toBe('Context')
  // B7: the button compacts through $.session.compact (a slash text via prompt.submit is refused by the engine).
  // (The harness cannot build the compact event's message list, so the press itself is not driven here.)
  expect((await band.find({ key: 'compact' }))?.props.label).toBe('Compact')
  expect(compacts.length).toBe(0)
  expect(seen.prompts).toEqual([])
  await band.unmount()
})

test('B7 neutral ring without a Compact button: nothing open, or after a ship / released card', async ($, on) => {
  engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT } })
  const released = { ...CARD_DATA, h: '🟩 🚀 Released Alpha — v0.270.1 — nach Beta promoten?' }
  on('tool.call', () => ({
    result: {},
    text: `<script type="application/json" id="dc-card-data">${JSON.stringify(released)}</script>`,
  }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: ' M file.txt\n', stderr: '' } })) // unshipped changes exist …
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'compact' })).toBeUndefined() // … but the card says shipped: grey, no button
  expect(svgIn(await band.find({ key: 'ring' }))?.props.source).not.toMatch(/#e6c36a/)
  await band.unmount()
  // Nothing open at all (clean tree, nothing ahead, no concept page, no plan): the same.
  const clean = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await clean.find({ key: 'compact' })).toBeUndefined()
  await clean.unmount()
})

test('B9 working: the rail shows the ring only; B8 plus the step and the tool', async ($, on) => {
  engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT } })
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  const band = await $.ui.mount({ ...WORKING_BAND, surface: 'desktop' })
  expect(await band.find({ key: 'ring' })).toBeDefined()
  expect(await band.find({ key: 'hygiene' })).toBeUndefined()
  expect(await band.find({ key: 'cleanup' })).toBeUndefined()
  expect(await band.find({ key: 'cleanup-fold' })).toBeUndefined()
  await band.unmount()
})

test('B10 idle: one slim row with "Last: title · time", ring chip and the cleanup chip; hidden when nothing is due', async ($, on) => {
  engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT } })
  on('tool.call', () => ({ result: {}, text: CARD_RESULT }))
  on('turn.start', () => ({ turnId: 't' }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  await $.turn.start({ text: 'next', turnId: 't2' } as any) // the card is spent, its title stays as "Last:"
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text', text: /^Last:/ }))?.text).toBe('Last: Band zeigt die Card · 01:43')
  expect(await band.find({ key: 'main' })).toBeUndefined() // no two-zone layout
  expect(await band.find({ key: 'idle-ring' })).toBeDefined()
  expect((await band.find({ key: 'cleanup-fold' }))?.props.label).toBe('🧹 3 ▸')
  await band.unmount()
  // Nothing due (context below the show threshold, no leftovers, no bar): the band stays away entirely.
  const quiet = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await $.session.measure({ context: { window: 200000, tokens: 20000, percent: 10 }, rateLimits: [], changed: ['context'] } as any)
  await quiet.unmount()
})

test('B10 idle band is hidden when nothing is due', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { window: 200000, tokens: 20000, percent: 10 }, rateLimits: [], changed: ['context'] } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: /engine/ })).toBeDefined() // the engine own drawing: the mod stepped aside
  expect(await band.find({ key: 'idle' })).toBeUndefined()
  await band.unmount()
})

test('B11 cleanup block: one collapsed line + button, expands to the breakdown and the rule, state per session', async ($, on) => {
  const report = idleReport([agentWt(1), agentWt(2), { branch: 'feat', state: 'unlanded', idleDays: 3 }, { kind: 'worktree', path: `${REPO}/.claude/worktrees/x`, state: 'broken' }], {
    parked: [{ branch: 'parked/autosave/a', ageDays: 5 }],
  })
  engine(on, { files: { '/.claude/orphan-report.json': report } })
  on('tool.call', () => ({ result: {}, text: CARD_RESULT }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ key: 'cleanup-fold' }))?.props.label).toBe('🧹 5 leftovers ▸')
  expect(await band.find({ key: 'cleanup' })).toBeDefined()
  expect(await band.find({ key: 'cleanup-detail' })).toBeUndefined()
  await band.press({ key: 'cleanup-fold' })
  await band.unmount()
  band = await $.ui.mount({ ...BAND, surface: 'desktop' }) // the state lives in the session, not in the mount
  expect((await band.find({ key: 'cleanup-fold' }))?.props.label).toBe('🧹 5 leftovers ▾')
  const detail = JSON.stringify(await band.find({ key: 'cleanup-detail' }))
  for (const t of ['Agent worktrees', 'Safety copies', 'Branches', 'Broken worktrees', 'Trigger: 3 unmerged, inactive for over a day']) expect(detail).toContain(t)
  await band.press({ key: 'cleanup-fold' })
  await band.unmount()
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ key: 'cleanup-fold' }))?.props.label).toBe('🧹 5 leftovers ▸')
  await band.unmount()
  // The terminal keeps one column of text.
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.find({ key: 'rail' })).toBeUndefined()
  expect(await term.find({ key: 'cleanup-fold' })).toBeDefined()
  await term.unmount()
})

test('B12 the band hides leftovers that are merged, young or in use; a big pile shows by count', async ($, on) => {
  const young = idleReport([agentWt(1, { idleDays: 0.3 }), agentWt(2, { live: true }), { branch: 'old', state: 'landed', idleDays: 20 }])
  engine(on, { files: { '/.claude/orphan-report.json': young } })
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'cleanup-fold' })).toBeUndefined() // 3 leftovers, none inactive unmerged, far below 50
  await band.unmount()
})

test('B12 a big pile of landed leftovers shows by count', async ($, on) => {
  const pile = JSON.stringify({
    generatedAt: new Date(NOW - 3_600_000).toISOString(),
    repos: [{ path: REPO, atRisk: [{ branch: 'a', state: 'landed' }], parked: [], landedLeftovers: 60 }],
  })
  engine(on, { files: { '/.claude/orphan-report.json': pile } })
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ key: 'cleanup-fold' }))?.props.label).toBe('🧹 1 ▸') // 61 > 50
  await band.unmount()
})

test('B13 cross-session: another session run hides the block; a press writes the marker; a second run is refused', async ($, on) => {
  const other = JSON.stringify({ repo: REPO, session: 'other', startedAt: NOW - 120_000 })
  const { seen } = engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT, '/.claude/devops-cleanup-run.json': other } })
  const spawns: string[] = []
  on('agent.spawn', (_: unknown, e: { prompt: string }) => {
    spawns.push(e.prompt)
    return { model: 'claude-opus', agentId: 'c1' }
  })
  on('session.id', () => ({ value: 'mine' }))
  on('session.root', () => ({ value: REPO }))
  on('tool.call', () => ({ result: {}, text: CARD_RESULT }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  const hidden = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await hidden.find({ key: 'cleanup-fold' })).toBeUndefined() // the card part stays, the cleanup block is gone
  expect(await hidden.find({ key: 'main' })).toBeDefined()
  await hidden.unmount()
  expect(seen.writes.some(w => w.path.replaceAll(String.fromCharCode(92), '/').endsWith('devops-cleanup-run.json'))).toBe(false)
})

test('B13 a press starts the run: marker written for this session, a run of another session is refused with a toast', async ($, on) => {
  const { seen } = engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT } })
  const spawns: string[] = []
  on('agent.spawn', (_: unknown, e: { prompt: string }) => {
    spawns.push(e.prompt)
    return { model: 'claude-opus', agentId: 'c1' }
  })
  on('session.id', () => ({ value: 'mine' }))
  on('session.root', () => ({ value: REPO }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'cleanup-fold' })
  await band.press({ key: 'cleanup' })
  await band.unmount()
  expect(spawns.length).toBe(1)
  const w = seen.writes.find(x => x.path.replaceAll(String.fromCharCode(92), '/').endsWith('/.claude/devops-cleanup-run.json'))
  expect(JSON.parse(String(w?.text))).toMatchObject({ repo: REPO, session: 'mine', startedAt: NOW })
})

test('B13 a run of another session blocks a second plan for the same repo', async ($, on) => {
  const other = JSON.stringify({ repo: REPO, session: 'other', startedAt: NOW - 60_000 })
  // The block is hidden for this session, but a plan started from the Cleanup pane would still be refused.
  const { seen } = engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT, '/.claude/devops-cleanup-run.json': other } })
  const spawns: string[] = []
  on('agent.spawn', (_: unknown, e: { prompt: string }) => {
    spawns.push(e.prompt)
    return { model: 'claude-opus', agentId: 'c1' }
  })
  on('session.id', () => ({ value: 'mine' }))
  on('session.root', () => ({ value: REPO }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'devops', component: 'Pane', requestId: 'devops-cleanup', props: { isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {}, title: 'Cleanup' }, surface: 'desktop' } as any)
  await ui.press({ key: 'cleanup-plan' })
  await ui.unmount()
  expect(spawns.length).toBe(0)
  expect(seen.toasts.at(-1)).toBe('A cleanup is already running in another session')
})

test('B14 learn offer: after a finished run when the same unmerged cause repeats; the offer sends the devops learn prompt', async ($, on) => {
  const report = idleReport([agentWt(1), agentWt(2), agentWt(3)])
  const prev = JSON.stringify({ runs: [{ repo: REPO, at: 1, causes: { 'agent worktree': 4 } }] })
  const { seen } = engine(on, { agents: [{ id: 'c1', description: 'Branch cleanup plan', type: 'general-purpose', status: 'running' }, { id: 'c2', description: 'Branch cleanup apply', type: 'general-purpose', status: 'running' }], files: { '/.claude/orphan-report.json': report, '/.claude/devops-cleanup-history.json': prev } })
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-opus', agentId: `c${++n}` }))
  on('session.id', () => ({ value: 'mine' }))
  on('session.root', () => ({ value: REPO }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'cleanup-fold' })
  await band.press({ key: 'cleanup' })
  await band.unmount()
  await $.turn.complete({ answer: '## Plan\n1. x', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'c1', reason: 'end' } as any)
  expect(seen.toasts.some(t => /learn/.test(t))).toBe(false) // a plan alone is no finished run
  const pane = await $.ui.mount({ plugin: 'devops', component: 'Pane', requestId: 'devops-cleanup', props: { isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {}, title: 'Cleanup' }, surface: 'desktop' } as any)
  await pane.press({ key: 'cleanup-apply' })
  await pane.unmount()
  await $.turn.complete({ answer: '✓ done', durationMs: 1, isAborted: false, turnId: 't2', agentId: 'c2', reason: 'end' } as any)
  const hist = seen.writes.find(x => x.path.replaceAll(String.fromCharCode(92), '/').endsWith('/.claude/devops-cleanup-history.json'))
  expect(JSON.parse(String(hist?.text)).runs.map((r: { causes: unknown }) => r.causes)).toEqual([{ 'agent worktree': 4 }, { 'agent worktree': 3 }])
  expect(seen.toasts.at(-2)).toMatch(/done/)
  expect(seen.toasts.at(-1)).toMatch(/devops learn/)
  const marker = seen.writes.filter(x => x.path.replaceAll(String.fromCharCode(92), '/').endsWith('/.claude/devops-cleanup-run.json')).map(x => JSON.parse(x.text))
  expect(marker.at(-1)).toMatchObject({ session: 'mine' })
  const done = await $.ui.mount({ plugin: 'devops', component: 'Pane', requestId: 'devops-cleanup', props: { isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {}, title: 'Cleanup' }, surface: 'desktop' } as any)
  expect(await done.find({ key: 'cleanup-learn' })).toBeDefined()
  await done.press({ key: 'cleanup-learn' })
  await done.unmount()
  expect(seen.prompts.length).toBe(1)
  expect(seen.prompts[0]).toMatch(/^devops learn\n/)
  expect(seen.prompts[0]).toMatch(/"agent worktree"/)
})

test('B14 no learn offer when the first run sees the cause, or the run held only merged leftovers', async ($, on) => {
  const report = idleReport([{ branch: 'old', state: 'landed', idleDays: 30 }], { landedLeftovers: 70 })
  const { seen } = engine(on, { agents: [{ id: 'c1', description: 'Branch cleanup plan', type: 'general-purpose', status: 'running' }, { id: 'c2', description: 'Branch cleanup apply', type: 'general-purpose', status: 'running' }], files: { '/.claude/orphan-report.json': report } })
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-opus', agentId: `c${++n}` }))
  on('session.id', () => ({ value: 'mine' }))
  on('session.root', () => ({ value: REPO }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'cleanup-fold' })
  await band.press({ key: 'cleanup' }) // shown by count (70 > 50), not by unmerged work
  await band.unmount()
  await $.turn.complete({ answer: '## Plan', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'c1', reason: 'end' } as any)
  const pane = await $.ui.mount({ plugin: 'devops', component: 'Pane', requestId: 'devops-cleanup', props: { isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {}, title: 'Cleanup' }, surface: 'desktop' } as any)
  await pane.press({ key: 'cleanup-apply' })
  await pane.unmount()
  await $.turn.complete({ answer: '✓ done', durationMs: 1, isAborted: false, turnId: 't2', agentId: 'c2', reason: 'end' } as any)
  expect(seen.toasts.some(t => /learn/.test(t))).toBe(false)
})

test('B15 the band follows the Claude Code language setting: German band, status line and toast', async ($, on) => {
  const { seen } = engine(on, {
    files: { '/.claude/orphan-report.json': ORPHAN_REPORT, '/.claude/settings.json': JSON.stringify({ language: 'german' }) },
  })
  on('classic.Notification', () => ({}))
  on('tool.call', () => ({ result: {}, text: CARD_RESULT }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  expect(seen.status.at(-1)).toBe('🟢 aktiv')
  await $.session.measure(MEASURE as any)
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ key: 'cleanup' }))?.props.label).toBe('Aufräumen') // not "Clean up (opus)"
  expect((await band.find({ key: 'cleanup-fold' }))?.props.label).toBe('🧹 3 Altlasten ▸')
  expect((await band.find({ type: 'Text', text: /^Kontext$/ }))?.text).toBe('Kontext')
  await band.unmount()
  await $.classic.Notification({ notification_type: 'permission_prompt', message: 'Bash' } as any)
  expect(seen.toasts.at(-1)).toBe('Berechtigungsanfrage wartet: Bash')
})

test('B15 the language falls back to English for an unknown setting', async ($, on) => {
  const { seen } = engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT, '/.claude/settings.json': JSON.stringify({ language: 'klingon' }) } })
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  expect(seen.status.at(-1)).toBe('🟢 active')
})

test('B12 the threshold is read from the devops config (project over global, default 50)', async ($, on) => {
  const pile = JSON.stringify({
    generatedAt: new Date(NOW - 3_600_000).toISOString(),
    repos: [{ path: REPO, atRisk: [{ branch: 'a', state: 'landed' }], parked: [], landedLeftovers: 60 }],
  })
  engine(on, { files: { '/.claude/orphan-report.json': pile, '/.claude/devops-config.json': JSON.stringify({ cleanup: { nudgeThreshold: 80 } }) } })
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'cleanup-fold' })).toBeUndefined() // 61 is not above 80
  await band.unmount()
})

test('B6 the user own auto-compact setting moves the ring (CLAUDE_AUTOCOMPACT_PCT_OVERRIDE from the settings env block)', async ($, on) => {
  engine(on, { files: { '/.claude/settings.json': JSON.stringify({ env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '50' } }) } })
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { window: 200000, tokens: 60000, percent: 30 }, rateLimits: [], changed: ['context'] } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text', text: /60 %/ }))?.text).toBe('🧠 60 %') // 60000 of 100000, not 32 %
  await band.unmount()
})

test('review 4: on Desktop the hints sit behind a round ? icon whose hover overlays them (hidden at rest, absolute, opaque)', async ($, on) => {
  engine(on)
  const batch = { ...CARD_DATA, ti: 'Batch', h: '👉 📚 Batch — sammelt Aufträge', pt: ['Aufträge einzeln senden', 'batch ship beendet den Modus'] }
  on('tool.call', () => ({ result: {}, text: `<script type="application/json" id="dc-card-data">${JSON.stringify(batch)}</script>` }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'hints-toggle' })).toBeUndefined()
  const trigger: any = await band.find({ key: 'hints' })
  expect(svgIn(trigger)?.props.source).toMatch(/<circle/)
  const pop: any = trigger.children.find((c: any) => c && c.type === 'Box') // unkeyed: the hover scope is the keyed "hints" Box
  expect(pop.props).toMatchObject({ position: 'absolute', display: 'none' })
  expect(pop.hover).toEqual({ display: 'flex' }) // the engine accepted the reveal (it refuses one scoped to a hidden keyed Box)
  expect(pop.props.backgroundColor).toBeTruthy()
  expect(JSON.stringify(pop)).toContain('Aufträge einzeln')
  expect(JSON.stringify(pop)).toContain('batch ship beendet')
  await band.unmount()
})

test('B17 hint cards (batch / test mode): heading plus a ? toggle, hints collapsed by default and per session; decision cards keep their points', async ($, on) => {
  engine(on)
  const batch = { ...CARD_DATA, ti: 'Batch', h: '👉 📚 Batch — sammelt Aufträge', pt: ['Aufträge einzeln senden', 'batch ship beendet den Modus'] }
  let data: unknown = batch
  on('tool.call', () => ({ result: {}, text: `<script type="application/json" id="dc-card-data">${JSON.stringify(data)}</script>` }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  for (const surface of ['terminal', 'mobile'] as const) {
    let band = await $.ui.mount({ ...BAND, surface })
    expect(await has(band, 'Batch — sammelt')).toBeDefined()
    expect((await band.find({ key: 'hints-toggle' }))?.props.label).toBe('?')
    expect(JSON.stringify(await band.find({ key: 'band' }))).not.toContain('Aufträge einzeln')
    await band.press({ key: 'hints-toggle' })
    await band.unmount()
    band = await $.ui.mount({ ...BAND, surface })
    expect(JSON.stringify(await band.find({ key: 'band' }))).toContain('Aufträge einzeln') // state lives in the session
    expect(JSON.stringify(await band.find({ key: 'band' }))).toContain('batch ship beendet')
    await band.press({ key: 'hints-toggle' })
    await band.unmount()
  }
  data = CARD_DATA // a decision card: points stay open, no toggle
  await $.tool.call({ tool: CARD_TOOL, summary: 'y' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(JSON.stringify(await band.find({ key: 'band' }))).toContain('Doku nachziehen')
  expect(await band.find({ key: 'hints-toggle' })).toBeUndefined()
  expect(await band.find({ key: 'hints' })).toBeUndefined()
  await band.unmount()
})

// ---------------------------------------------------------------------------------------------
// qax defects 1-6.
// ---------------------------------------------------------------------------------------------

const REL = { ...CARD_DATA, h: '🟩 🚀 Released Alpha — v0.270.1 — nach Beta promoten?' }
const cardText = (d: unknown) => `<script type="application/json" id="dc-card-data">${JSON.stringify(d)}</script>`

test('defect 1: after a ship the squash-merged branch (still "ahead" of main) keeps the ring grey until a new edit or open plan', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: {}, text: cardText(REL) }))
  on('turn.start', () => ({ turnId: 't' }))
  // Clean tree, but 3 commits ahead of origin/main: a squash merge never makes the branch "behind".
  on('process.run', (_: unknown, e: { argv: string[] }) => ({
    value: e.argv.includes('status') ? { exitCode: 0, stdout: '', stderr: '' } : { exitCode: 0, stdout: '3\n', stderr: '' },
  }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  // Before any ship: commits ahead = unshipped work, amber + button (the idle row shows it after a prompt).
  await $.turn.start({ text: 'go', turnId: 't1' } as any)
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'compact' })).toBeDefined()
  await band.unmount()
  await $.tool.call({ tool: CARD_TOOL, summary: 'ship' } as any) // 🟩 released card
  await $.turn.start({ text: 'next', turnId: 't2' } as any) // the card is spent, the idle row shows
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'compact' })).toBeUndefined()
  expect(svgIn(await band.find({ key: 'idle-ring' }))?.props.source).not.toMatch(/#e6c36a/)
  await band.unmount()
  // A new edit reopens the work.
  await $.tool.call({ tool: 'Edit', file_path: 'a.ts' } as any)
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'compact' })).toBeDefined()
  await band.unmount()
})

test('defect 1: an open concept page still counts after a ship', async ($, on) => {
  engine(on, { files: { '/.claude/concept-active.json': '{}' } })
  on('tool.call', () => ({ result: {}, text: cardText(REL) }))
  on('turn.start', () => ({ turnId: 't' }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  await $.tool.call({ tool: CARD_TOOL, summary: 'ship' } as any)
  await $.turn.start({ text: 'next', turnId: 't2' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'compact' })).toBeDefined() // concept-active stays open work
  await band.unmount()
})

test('defect 1: a plan with open steps ends the settled state', async ($, on) => {
  engine(on)
  on('tool.call', (_: unknown, e: { tool: string }) => ({ result: {}, text: e.tool === CARD_TOOL ? cardText(REL) : '' }))
  on('turn.start', () => ({ turnId: 't' }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  await $.tool.call({ tool: CARD_TOOL, summary: 'ship' } as any)
  await $.turn.start({ text: 'next', turnId: 't2' } as any)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Neu', status: 'in_progress' }], scope: 'continuation' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'compact' })).toBeDefined()
  await band.unmount()
})

test('defect 2: only the batch card folds its points; the test card (userTest steps = CTA) stays open', async ($, on) => {
  engine(on)
  const testCard = { ...CARD_DATA, ti: 'Test', h: '👉 🧪 Test — Erst testen, dann shippen?', pt: ['Seite öffnen und Popup prüfen'] }
  on('tool.call', () => ({ result: {}, text: cardText(testCard) }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'hints-toggle' })).toBeUndefined()
  expect(JSON.stringify(await band.find({ key: 'band' }))).toContain('Seite öffnen und Popup prüfen')
  await band.unmount()
  expect(isHintCard({ heading: testCard.h, points: testCard.pt })).toBe(false)
  expect(isHintCard({ heading: '🟦 🧪 Test — läuft', points: ['x'] })).toBe(false)
  expect(isHintCard({ heading: '👉 📚 Batch — sammelt Aufträge', points: ['x'] })).toBe(true)
  expect(isHintCard({ heading: '👉 📚 Batch — sammelt Aufträge', points: [] })).toBe(false)
})

test('defect 3: while working there is no Compact button (ring only), even with open work at 91 %', async ($, on) => {
  engine(on, { files: { '/.claude/concept-active.json': '{}' } })
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  for (const surface of SURFACES) {
    const band = await $.ui.mount({ ...WORKING_BAND, surface })
    expect(await band.find({ key: 'compact' })).toBeUndefined()
    await band.unmount()
  }
  const w = await $.ui.mount({ ...WORKING_BAND, surface: 'desktop' })
  expect(await w.find({ key: 'ring' })).toBeDefined()
  await w.unmount()
})

test('defect 4: bar alt, pane bodies, spawn failure and background labels follow the language', async ($, on) => {
  engine(on, { files: { '/.claude/settings.json': JSON.stringify({ language: 'de' }), '/.claude/orphan-report.json': ORPHAN_REPORT } })
  on('session.root', () => ({ value: REPO }))
  on('agent.spawn', () => ({ model: 'claude-opus' })) // no agentId, none listed: the run does not start
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  const bar = { label: '5h' as const, pct: 72, elapsedPct: 60, level: 'yellow' as const, watermark: '2 h 0 m' }
  expect(budgetBarAlt(bar, 'de')).toBe('5h: 72 % verbraucht · Reset in 2 h 0 m')
  expect(budgetBarAlt(bar)).toBe('5h: 72 % used · resets in 2 h 0 m')
  const agents = await $.ui.mount({ ...pane('devops-agents', 'Agents'), surface: 'desktop' })
  expect((await agents.find({ type: 'Text', text: /Subagenten/ }))?.text).toBe('Noch keine Subagenten in dieser Session.')
  await agents.unmount()
  const shipPane = await $.ui.mount({ ...pane('devops-ship', 'Ship'), surface: 'desktop' })
  expect((await shipPane.find({ type: 'Text', text: /Ship-Daten/ }))?.text).toBe('Noch keine Ship-Daten gelesen.')
  expect((await shipPane.find({ key: 'refresh' }))?.props.label).toBe('Aktualisieren')
  await shipPane.unmount()
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'cleanup-fold' })
  await band.press({ key: 'cleanup' })
  await band.unmount()
  const cp = await $.ui.mount({ ...pane('devops-cleanup', 'Aufräumen'), surface: 'desktop' })
  expect((await cp.find({ type: 'Markdown' }))?.props.text).toBe('Subagent nicht gestartet: no agent started')
  await cp.unmount()
  const keys: StrKey[] = ['barAlt', 'dropSaved', 'titleCleanup', 'titleAgents', 'titleShip', 'noAgents', 'noShip', 'shipBranch', 'unknown', 'shipDone', 'shipNone', 'shipNext', 'prLine', 'prNone', 'refresh', 'spawnFailed', 'finishedWord', 'noAnswer']
  for (const loc of LOCALES)
    for (const k of keys) {
      const text = tr(loc, k, { label: 'x', p: 1, w: 'x', b: 'x', steps: 'x', next: 'x', n: 1, state: 'x', pass: 1, fail: 1, pending: 1, why: 'x' })
      expect(text).toMatch(/\S/)
      expect(text).not.toMatch(/\{\w+\}/)
    }
  expect(tr('de', 'finishedWord')).toBe('beendet')
})

test('defect 5: hygieneFrom drops live sessions like the nudge does, so band, status line and nudge name the same numbers', () => {
  const h = hygieneFrom(JSON.parse(idleReport([agentWt(1), agentWt(2, { live: true }), { branch: 'feat', state: 'unlanded', live: true, dirty: 2 }])), REPO, NOW)
  expect(h).toMatchObject({ branches: 1, worktrees: 0, inactive: 1 })
  expect(hygieneLine(h)).toBe('devops: 1 open branch')
})

test('defect 6: the apply refreshes the run marker start, so a late apply keeps other sessions out', async ($, on) => {
  const { seen, tick } = engine(on, {
    agents: [
      { id: 'c1', description: 'Branch cleanup plan', type: 'general-purpose', status: 'running' },
      { id: 'c2', description: 'Branch cleanup apply', type: 'general-purpose', status: 'running' },
    ],
    files: { '/.claude/orphan-report.json': ORPHAN_REPORT },
  })
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-opus', agentId: `c${++n}` }))
  on('session.id', () => ({ value: 'mine' }))
  on('session.root', () => ({ value: REPO }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'cleanup-fold' })
  await band.press({ key: 'cleanup' })
  await band.unmount()
  await $.turn.complete({ answer: '## Plan', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'c1', reason: 'end' } as any)
  tick(90 * 60_000) // the person reviews the plan for 90 minutes
  const pane2 = await $.ui.mount({ ...pane('devops-cleanup', 'Cleanup'), surface: 'desktop' })
  await pane2.press({ key: 'cleanup-apply' })
  await pane2.unmount()
  const marks = seen.writes.filter(x => x.path.replaceAll(String.fromCharCode(92), '/').endsWith('/.claude/devops-cleanup-run.json')).map(x => JSON.parse(x.text))
  expect(marks.length).toBe(2)
  expect(marks[1].startedAt - marks[0].startedAt).toBe(90 * 60_000)
})

test('cardTextSvg: title and heading 16 px / 500, time 12 px tabular-nums, the card font stack, light and dark colours', () => {
  const title = cardTextSvg('Offene Popup-Punkte erledigt', 'title')
  expect(title?.source).toMatch(/font-size:16px;font-weight:500/)
  expect(title?.source).toMatch(/font-family:system-ui,/)
  expect(title?.source).toMatch(/fill:#ececec/)
  expect(title?.source).toMatch(/prefers-color-scheme: light\)\{text\{fill:#1f1f1f/)
  expect(title?.height).toBe(24)
  const heading = cardTextSvg('🟩 🚀 Released Alpha — v0.270.1 — nach Beta promoten?', 'heading')
  expect(heading?.source).toMatch(/font-size:16px;font-weight:500/)
  expect(heading?.source).toContain('🟩 🚀 Released')
  const time = cardTextSvg('14:10', 'time')
  expect(time?.source).toMatch(/font-size:12px;font-weight:400;font-variant-numeric:tabular-nums/)
  expect(time?.source).toMatch(/fill:#a9a9a9/) // secondary
  expect(time?.height).toBe(18)
  // The width is an estimate that grows with the text and leaves room; it must not clip a long title.
  expect(estimateTextWidth('iiii', 16)).toBeLessThan(estimateTextWidth('WWWW', 16))
  expect(estimateTextWidth('14:10', 12, true)).toBeGreaterThan(24)
  expect(cardTextSvg('<b>&', 'title')?.source).toContain('&lt;b&gt;&amp;')
  // Text that would not fit one line, and empty text, fall back to the wrapping Text element.
  expect(cardTextSvg('sehr lang '.repeat(30), 'heading')).toBeNull()
  expect(cardTextSvg('  ', 'title')).toBeNull()
})

test('a long card heading falls back to the wrapping Text element on Desktop', async ($, on) => {
  engine(on)
  const long = { ...CARD_DATA, h: `👉 📦 ${'Sehr langer Status '.repeat(8)}— shippen?` }
  on('tool.call', () => ({ result: {}, text: `<script type="application/json" id="dc-card-data">${JSON.stringify(long)}</script>` }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(svgIn(await band.find({ key: 'card-heading' }))).toBeUndefined()
  expect((await band.find({ type: 'Text', text: /Sehr langer/ }))?.props).toMatchObject({ size: 'heading', weight: 'medium' })
  await band.unmount()
})

test('review 4: the Compact button is the same native button as the cleanup one (no square pill), on Desktop and the terminal', async ($, on) => {
  engine(on, { files: { '/.claude/concept-active.json': '{}' } })
  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  const d = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const btn: any = await d.find({ key: 'compact' })
  expect(btn?.props.label).toBe('Compact')
  expect(btn.props.plain).toBeUndefined()
  expect(btn.props.variant).toBeUndefined()
  expect((btn.children || []).some((c: any) => c.type === 'Text')).toBe(false)
  await d.unmount()
  const t: any = await (await $.ui.mount({ ...BAND, surface: 'terminal' })).find({ key: 'compact' })
  expect(t?.props.label).toBe('Compact')
  expect(t.children.some((c: any) => c.type === 'Text' && c.props?.backgroundColor)).toBe(false)
})

test("review fix: a path-less worktree-agent branch counts as an agent leftover, not as a branch", () => {
  expect(causeOf({ kind: "branch", branch: "worktree-agent-a769ed106dfc8c7c1", path: null, state: "unlanded" })).toBe("agent worktree")
  expect(causeOf({ kind: "branch", branch: "tmp-gaps-main", path: null, state: "partial" })).toBe("branch")
  expect(causeOf({ kind: "worktree", branch: "kw/scene", path: "P:/x/.claude/worktrees/agent-a2d1db7a", state: "partial" })).toBe("agent worktree")
})

// --- Batch collect (B3): the mod files the note through scripts/batch-note.js; the classic hook stays the fallback. ---

const BATCH_MODE = JSON.stringify({ active: true, startedAt: '2026-11-10T19:00:00.000Z', expiresAt: '2026-11-11T03:00:00.000Z', maxNotes: 100, sessionId: 'sess-1' })
const BATCH_NOTES = '# do-batch notes\n\n<!-- 2026-11-10T19:30:00.000Z -->\nfirst\n\n<!-- 2026-11-10T19:40:00.000Z -->\nsecond\n'
const WRITER_OK = (n: number) => ({ value: { exitCode: 0, stdout: `${JSON.stringify({ ok: true, n, images: 0 })}\n`, stderr: '' } })

/** Armed collection in /repo; `writer` answers the node entry, every call is recorded. */
function batchEngine(on: any, writer: (argv: string[], stdin: string) => unknown, files: Files = {}) {
  const e = engine(on, { files: { '/repo/.claude/batch-mode.json': BATCH_MODE, '/repo/.claude/batch.md': BATCH_NOTES, ...files } })
  const calls: { argv: string[]; stdin: string }[] = []
  on('process.run', (_: unknown, ev: { argv: string[]; init?: { stdin?: string } }) => {
    if (ev.argv[0] !== 'node') return { value: { exitCode: 1, stdout: '', stderr: '' } } // git / gh of the other panes
    calls.push({ argv: ev.argv, stdin: ev.init?.stdin ?? '' })
    return writer(ev.argv, ev.init?.stdin ?? '')
  })
  on('session.id', () => ({ value: 'sess-1' }))
  return { ...e, calls }
}

test('batch: an armed collection files the note via the writer, drops the prompt, toasts and counts in the band', async ($, on) => {
  const { seen, calls } = batchEngine(on, () => WRITER_OK(3))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const out = await $.prompt.submit({ text: 'Mach den Button blau' } as any)
  expect(out).toEqual({ drop: '💾 Note #3 saved · "go" runs it' })
  expect(seen.prompts).toEqual([]) // never reached the hooks beneath: no double filing with the classic hook
  expect(seen.toasts).toEqual(['💾 Note #3 saved'])
  expect(calls.length).toBe(1)
  expect(calls[0].argv[0]).toBe('node')
  expect(calls[0].argv[1]).toMatch(/scripts\/batch-note\.js$/)
  const req = JSON.parse(calls[0].stdin)
  expect(req).toMatchObject({ cwd: '/repo', sessionId: 'sess-1', text: 'Mach den Button blau', attachments: [] })
  expect(req.key).toBeUndefined() // no dedupe: an identical repeat is a second note, never a silent drop
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await has(band, '📚 Batch · 3')).toBe('📚 Batch · 3')
  await band.unmount()
})

test('batch: the band shows the standing row while armed (count from batch.md)', async ($, on) => {
  batchEngine(on, () => WRITER_OK(1))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await has(band, '📚 Batch · 2')).toBe('📚 Batch · 2')
  await band.unmount()
})

test('batch row: the count folds the note list open (no prompt, no process); Go and Off sit beside it', async ($, on) => {
  const { seen, calls } = batchEngine(on, () => WRITER_OK(1))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ key: 'batch-go' }))?.props.label).toBe('Go')
  expect((await band.find({ key: 'batch-off' }))?.props.label).toBe('Off')
  expect(await band.find({ key: 'batch-notes' })).toBeUndefined()
  await band.press({ key: 'batch-fold' })
  await band.unmount()
  const open = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await has(open, '1. first')).toBe('1. first')
  expect(await has(open, '2. second')).toBe('2. second')
  await open.unmount()
  expect(seen.prompts).toEqual([])
  expect(calls).toEqual([])
})

test('batch row: Go queues the execute marker once, also while a turn runs; the row says it is queued', async ($, on) => {
  const { seen, calls } = batchEngine(on, () => WRITER_OK(1))
  on('turn.start', () => ({ turnId: 't' }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const working = { ...BAND, surface: 'desktop', props: { ...BAND.props, isWorking: true } }
  const band = await $.ui.mount(working)
  await band.press({ key: 'batch-go' })
  await band.unmount()
  expect(seen.prompts).toEqual(['go'])
  expect(calls).toEqual([]) // the marker is never filed as a note
  const after = await $.ui.mount(working)
  expect(await after.find({ key: 'batch-go' })).toBeUndefined() // a second press has nothing to hit
  expect(await has(after, 'go queued')).toBe('go queued')
  await after.unmount()
  expect(seen.prompts).toEqual(['go'])
  // The merge turn runs while the mode is still armed: no second Go until it ends (Codex review 2026-11-17).
  await $.turn.start({ text: 'go', turnId: 'tgo', origin: { kind: 'plugin' } } as any)
  const merging = await $.ui.mount(working)
  expect(await merging.find({ key: 'batch-go' })).toBeUndefined()
  expect(await has(merging, 'go running')).toBe('go running')
  await merging.unmount()
  await $.turn.complete({ answer: 'x', durationMs: 1000, isAborted: false, turnId: 'tgo', reason: 'end' } as any)
  const done = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await done.find({ key: 'batch-go' })).toBeDefined() // still armed here (the merge did not retire it): Go again
  await done.unmount()
})

test('batch row: Off ends the mode through scripts/batch-off.js without a prompt; failure leaves the mode and says to type it', async ($, on) => {
  let offOk = true
  const { seen, calls } = batchEngine(on, argv =>
    /batch-off\.js$/.test(argv[1]) ? { value: offOk ? { exitCode: 0, stdout: '{"ok":true,"notes":2}\n', stderr: '' } : { exitCode: 1, stdout: '{"ok":false,"reason":"foreign"}\n', stderr: '' } } : WRITER_OK(1),
  )
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  offOk = false
  await band.press({ key: 'batch-off' })
  expect(seen.toasts.pop()).toMatch(/could not be ended here/)
  offOk = true
  await band.press({ key: 'batch-off' })
  await band.unmount()
  expect(calls.map(c => c.argv[1].replace(/.*scripts\//, ''))).toEqual(['batch-off.js', 'batch-off.js'])
  expect(JSON.parse(calls[1].stdin)).toEqual({ cwd: '/repo', sessionId: 'sess-1' })
  expect(seen.toasts.pop()).toBe('📚 Batch off · 2 notes stay in .claude/batch.md')
  expect(seen.prompts).toEqual([]) // no model turn
})

test('batch row: with no notes yet there is no Go and no list, only Off', async ($, on) => {
  batchEngine(on, () => WRITER_OK(1), { '/repo/.claude/batch.md': '# do-batch notes\n' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await has(band, '📚 Batch · 0')).toBe('📚 Batch · 0')
  expect(await band.find({ key: 'batch-go' })).toBeUndefined()
  expect(await band.find({ key: 'batch-fold' })).toBeUndefined()
  expect(await band.find({ key: 'batch-off' })).toBeDefined()
  await band.unmount()
})

test('batch: no collection armed → the prompt passes unchanged and the writer is never started', async ($, on) => {
  const { seen, calls } = batchEngine(on, () => WRITER_OK(1), { '/repo/.claude/batch-mode.json': JSON.stringify({ active: false }) })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const out = await $.prompt.submit({ text: 'normal prompt' } as any)
  expect(out.text).toBe('normal prompt')
  expect(seen.prompts).toEqual(['normal prompt'])
  expect(calls.length).toBe(0)
})

test('batch: another session owns the notes → next(e), the writer is not asked', async ($, on) => {
  const { seen, calls } = batchEngine(on, () => WRITER_OK(1), { '/repo/.claude/batch-mode.json': JSON.stringify({ active: true, expiresAt: '2026-11-11T03:00:00.000Z', sessionId: 'other' }) })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect((await $.prompt.submit({ text: 'a note' } as any)).text).toBe('a note')
  expect(calls.length).toBe(0)
  expect(seen.prompts).toEqual(['a note'])
})

test('batch: writer failure, timeout, bad output, missing node → next(e), never a drop', async ($, on) => {
  const answers: Array<() => unknown> = [
    () => ({ value: { exitCode: 1, stdout: '{"ok":false,"reason":"foreign"}\n', stderr: '' } }), // refused
    () => { throw new Error('timeout: the child was killed') }, // timeout / missing node (the call rejects)
    () => ({ value: { exitCode: 0, stdout: 'not json', stderr: '' } }), // garbage
    () => ({ value: { exitCode: 0, stdout: '{"ok":true}\n', stderr: '' } }), // no note number
    () => ({ value: { exitCode: 0, stdout: '{"ok":true,"n":0}\n', stderr: '' } }), // no positive number
    () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }), // silent
  ]
  let i = 0
  const { seen, calls } = batchEngine(on, () => answers[i++ % answers.length]())
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  for (let k = 0; k < answers.length; k++) {
    const out = await $.prompt.submit({ text: `note ${k}` } as any)
    expect(out.text).toBe(`note ${k}`)
    expect((out as any).drop).toBeUndefined()
  }
  expect(seen.prompts.length).toBe(answers.length) // every one reached the classic hook path
  expect(seen.toasts).toEqual([])
  expect(calls.length).toBe(answers.length)
})

test('batch: prompts that are never notes (slash command, empty) → next(e), writer not asked', async ($, on) => {
  const { seen, calls } = batchEngine(on, () => WRITER_OK(9))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  for (const text of ['/do-batch go', '/do-batch off', '/compact', '   ']) {
    const out = await $.prompt.submit({ text } as any)
    expect((out as any).drop).toBeUndefined()
  }
  expect(calls.length).toBe(0)
  expect(seen.prompts.length).toBe(4)
})

test('batch: an @file mention and pasted text travel verbatim to the writer, which files them', async ($, on) => {
  const { calls } = batchEngine(on, () => WRITER_OK(4))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const text = 'siehe @docs/spec.md und\n```\nzeile 1\nzeile 2\n```'
  expect(await $.prompt.submit({ text } as any)).toEqual({ drop: '💾 Note #4 saved · "go" runs it' })
  expect(JSON.parse(calls[0].stdin).text).toBe(text)
})

test('batch: an image the engine cannot hand over whole → next(e) (the hook takes the whole prompt), writer not asked', async ($, on) => {
  const { seen, calls } = batchEngine(on, () => WRITER_OK(5))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const out = await $.prompt.submit({ text: 'siehe Bild', attachments: [{ type: 'image', mediaType: 'image/png', id: 'missing' }] } as any)
  expect((out as any).drop).toBeUndefined()
  expect(calls.length).toBe(0)
  expect(seen.prompts).toEqual(['siehe Bild'])
})

test('batch helpers: drop reason, writer output, mode view, pre-filter', () => {
  expect(batchDropReason(7)).toBe('💾 Note #7 saved · "go" runs it')
  expect(batchDropReason(7, 'de')).toBe('💾 Notiz #7 gemerkt · „go“ setzt um')
  expect(parseWriterOutput('{"ok":true,"n":2,"images":1}\n')).toEqual({ n: 2, images: 1 })
  expect(parseWriterOutput('warn\n{"ok":true,"n":2}\n')).toEqual({ n: 2, images: 0 })
  for (const bad of ['', 'x', '{"ok":false,"n":2}', '{"ok":true,"n":"2"}', '{"ok":true,"n":1.5}', undefined, 5]) expect(parseWriterOutput(bad)).toBeNull()
  expect(batchViewFrom(BATCH_MODE, BATCH_NOTES, 'sess-1', NOW)).toEqual({ count: 2, notes: ['first', 'second'] })
  expect(batchPreviewLine('\n  long ' + 'x'.repeat(200) + '\nsecond line')).toHaveLength(80)
  expect(batchPreviewLine('   ')).toBe('…')
  expect(batchViewFrom(BATCH_MODE, BATCH_NOTES, 'other', NOW)).toBeNull() // another session's collection
  expect(batchViewFrom(BATCH_MODE, BATCH_NOTES, 'sess-1', Date.parse('2026-11-12T00:00:00Z'))).toBeNull() // expired
  expect(batchViewFrom(JSON.stringify({ active: true, maxNotes: 2 }), BATCH_NOTES, '', NOW)).toBeNull() // full
  expect(batchViewFrom('{bad', BATCH_NOTES, '', NOW)).toBeNull()
  expect(batchMaybeCollectable({ text: 'hello' })).toBe(true)
  expect(batchMaybeCollectable({ text: '', attachments: [{}] })).toBe(true)
  expect(batchMaybeCollectable({ text: '/x' })).toBe(false)
  expect(batchMaybeCollectable({ text: 'hello', isMeta: true })).toBe(false)
  expect(batchMaybeCollectable({ text: 'hello', command: { name: 'x', args: '' } })).toBe(false)
  for (const loc of LOCALES) expect(tr(loc, 'toastNote', { n: 3 })).toMatch(/3/)
})

// --- Status element under the prompt + info card (concept 20261115-2350-devops-status) ---

const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()
const guardRow = (op: string, estTokens: number, at: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, ts: iso(at), source: 'token-guard', op, estimate: op !== 'narrowed', estTokens, tool: 'Grep', ...extra })
const SAVINGS = [
  guardRow('blocked', 50000, NOW - 30 * DAY), // older than a week: only the log's first day
  guardRow('blocked', 10000, NOW - 3 * DAY),
  guardRow('released', 10000, NOW - 3 * DAY + 100), // the identical call went ahead: saved nothing
  guardRow('blocked', 10000, NOW - 2 * DAY),
  guardRow('blocked', 10000, NOW - DAY),
  guardRow('narrowed', 78000, NOW - DAY + 500),
  '{ a cut line',
].join('\n')
const DAILY = JSON.stringify({
  v: 1,
  days: {
    '2026-10-01': { 'pre.tokens.guard|PreToolUse|Grep': { runs: 9, chars: 80000, out: { ok: 9, block: 9 } } },
    '2026-11-09': {
      'pre.tokens.guard|PreToolUse|Grep': { runs: 10, chars: 4000, out: { ok: 8, block: 2 } },
      'dispatch:PreToolUse|PreToolUse|Grep': { runs: 10, chars: 9999, out: { block: 2 } },
    },
    '2026-11-10': { 'ss.knowledge.index|SessionStart|': { runs: 1, chars: 4000, out: { output: 1 } } },
  },
})
const API_ROWS = [
  JSON.stringify({ ts: iso(NOW - DAY), tag: 'scout', usd: 1.5, rc: 0 }),
  JSON.stringify({ ts: iso(NOW - DAY), tag: 'scout', usd: 9, rc: 75 }),
  JSON.stringify({ ts: iso(NOW - 20 * DAY), tag: 'scout', usd: 9, rc: 0 }),
].join('\n')
const SHIP_ROWS = [
  JSON.stringify({ ts: iso(NOW - DAY), repo: 'r', branch: 'a', tool: 'ship_release', outcome: 'success', repeat: 1 }),
  JSON.stringify({ ts: iso(NOW - DAY), repo: 'r', branch: 'a', tool: 'ship_release', outcome: 'success', repeat: 2 }),
  JSON.stringify({ ts: iso(NOW - DAY), repo: 'r', branch: 'b', tool: 'ship_release', outcome: 'success' }),
  JSON.stringify({ ts: iso(NOW - DAY), repo: 'r', branch: 'c', tool: 'ship_release', outcome: 'error' }),
  JSON.stringify({ ts: iso(NOW - DAY), repo: 'r', branch: 'a', tool: 'ship_build', outcome: 'success', testsReused: true }),
].join('\n')
const LOG_FILES = {
  '/.claude/devops-savings.jsonl': SAVINGS,
  '/.claude/devops-hook-telemetry-daily.json': DAILY,
  '/.claude/api-credit-usage.jsonl': API_ROWS,
  '/.claude/ship-timings.jsonl': SHIP_ROWS,
  '/.claude-plugin/plugin.json': JSON.stringify({ name: 'devops', version: '9.9.9' }),
}
const HINT = { plugin: 'devops', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } } as const

test('status figures: net of released blocks, measured narrowing, own consumption, credit, ships (pure)', () => {
  const b = benefitFrom(parseJsonl(SAVINGS), NOW)
  expect(b).toMatchObject({ net7: 20000, blocks7: 3, released7: 1, narrowed: 1, narrowedTokens: 78000, since: NOW - 30 * DAY })
  expect(b.last).toEqual({ kind: 'narrowed', tokens: 78000, at: NOW - DAY + 500 })
  // More released than blocked inside the window (the block fell out of it): never a negative saving.
  expect(benefitFrom(parseJsonl(guardRow('released', 10000, NOW - DAY)), NOW).net7).toBe(0)
  expect(benefitFrom([], NOW)).toMatchObject({ net7: 0, since: null, last: null })
  // The rollup: 7 UTC days, the dispatcher's own rows left out, characters ÷ 4.
  expect(overheadFrom(JSON.parse(DAILY), NOW)).toEqual({ ownTokens7: 2000, guardBlocks7: 2 })
  expect(overheadFrom(null, NOW)).toBeNull()
  expect(apiFrom(parseJsonl(API_ROWS), NOW)).toEqual({ usd7: 1.5, runs7: 1 })
  expect(shipsFrom(parseJsonl(SHIP_ROWS), NOW)).toEqual({ branches7: 2, reused7: 1 })
  expect(compactTokens(541200, 'de')).toBe('541 k')
  expect(compactTokens(4967765, 'de')).toBe('5,0 M')
  expect(compactTokens(4967765, 'en')).toBe('5.0 M')
  expect(compactTokens(950)).toBe('950')
  const data = { benefit: b, overhead: overheadFrom(JSON.parse(DAILY), NOW), api: apiFrom(parseJsonl(API_ROWS), NOW), ships: shipsFrom(parseJsonl(SHIP_ROWS), NOW), version: '9.9.9', at: NOW }
  // The headline is the estimate and says so; the credit is a row, not the headline.
  expect(infoHeadline(data, 'de')).toMatchObject({ value: '≈ 20 k', label: 'Tokens aus deinem Kontext ferngehalten', note: 'geschätzt · netto · 7 Tage' })
  expect(infoRows(data, 'de').map(r => `${r.value} ${r.label} (${r.note})`)).toEqual([
    '1 Suchen eingegrenzt · bis zu 78 k Tokens (gemessen · seit 11.10.)',
    '2 Branches ausgeliefert · 1 Testläufe wiederverwendet (gemessen · 7 Tage)',
    '1,50 $ aufs API-Guthaben statt aufs Abo · 1 Läufe (gemessen · 7 Tage)',
    '2 Eingriffe der Schutz-Hooks (gezählt · 7 Tage)',
    '≈ 2 k Tokens Eigenverbrauch der Hooks (gemessen · 7 Tage)',
  ])
  // No credit runs, no ship log: those rows are simply absent.
  expect(infoRows({ ...data, api: { usd7: 0, runs7: 0 }, ships: null }, 'en').map(r => r.key)).toEqual(['info-narrowed', 'info-guards', 'info-own'])
})

test('status state: active unless the hooks or the MCP server are not running; the benefit reads for 90 s (pure)', () => {
  const ok = { hooks: true, mcp: true, misses: 0 }
  expect(isActive(ok)).toBe(true)
  expect(isActive(null)).toBe(true) // unknown is never "not active"
  expect(statusText(ok, null, NOW, 'de')).toBe('🟢 aktiv')
  expect(statusText({ ...ok, mcp: false }, null, NOW, 'de')).toBe('🔴 nicht aktiv · MCP-Server nicht verbunden')
  expect(statusText({ hooks: false, mcp: false, misses: 5 }, null, NOW, 'en')).toBe('🔴 not active · hooks are not running · MCP server not connected')
  // Without one fresh record a stale telemetry file says nothing (telemetry switched off): no miss is counted.
  expect(hooksSeen(ok, false)).toBe(ok)
  // Once proven: four missed records in a row are not enough, the fifth is; one fresh record clears it.
  const proven = hooksSeen(ok, true)
  expect(proven).toEqual({ hooks: true, mcp: true, misses: 0, proven: true })
  let h = proven
  for (let i = 0; i < 4; i++) h = hooksSeen(h, false)
  expect(h.hooks).toBe(true)
  h = hooksSeen(h, false)
  expect(h).toEqual({ hooks: false, mcp: true, misses: 5, proven: true })
  expect(hooksSeen(h, true)).toEqual({ hooks: true, mcp: true, misses: 0, proven: true })
  expect(hooksSeen(proven, true)).toBe(proven) // nothing changed: the same value, no redraw
  // A name the session does not know is no verdict on the server; every other refusal is.
  expect(mcpDown('unlisted')).toBe(false)
  expect(['unapproved', 'disabled', 'policy', 'auth', 'failed'].map(mcpDown)).toEqual([true, true, true, true, true])
  // Only a line written during the call that just ended is announced.
  expect(benefitIsOfCall(NOW, NOW)).toBe(true)
  expect(benefitIsOfCall(NOW - 1500, NOW)).toBe(true)
  expect(benefitIsOfCall(NOW - 600_000, NOW)).toBe(false)
  const e = { kind: 'narrowed' as const, tokens: 78000, at: 2000, shownAt: NOW }
  expect(echoText(e, NOW + 1000, 'de')).toBe('Zack: bis zu 78 k Tokens gespart, Suche eingegrenzt.')
  expect(echoText({ ...e, at: 3000 }, NOW + 1000, 'de')).toBe('Bis zu 78 k Tokens gar nicht erst geladen. Gern geschehen.')
  expect(echoText({ ...e, kind: 'delegated', tokens: 1200 }, NOW, 'en')).toBe('1 k tokens written by the local model, not on your plan.')
  expect(echoText(e, NOW + 90_000, 'de')).toBe('')
  expect(statusText(ok, e, NOW + 1000, 'de')).toBe('🟢 Zack: bis zu 78 k Tokens gespart, Suche eingegrenzt.')
  expect(statusText(ok, e, NOW + 90_000, 'de')).toBe('🟢 aktiv')
})

test('under the prompt: "● devops" beside the engine hint; a press opens the info card in the band, a second one closes it; no prompt, no write', async ($, on) => {
  const { seen } = engine(on, { files: LOG_FILES })
  const forks: unknown[] = []
  on('model.fork', (_: unknown, e: unknown) => {
    forks.push(e)
    return { value: { isAnswered: false } }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(seen.status.at(-1)).toBe('🟢 active') // until the line under the prompt is drawn
  const hint = await $.ui.mount({ ...HINT, surface: 'desktop' })
  const row = await hint.find({ key: 'devops-hint' })
  expect(JSON.stringify(row)).toMatch(/engine/) // the engine's own hint stays in the row
  const dot = await hint.find({ key: 'devops-status' })
  expect(JSON.stringify(dot)).toMatch(/#7bc98f/) // the green dot of the mock's chip
  expect(JSON.stringify(dot)).toMatch(/devops/)
  expect(await hint.find({ type: 'Text', text: /tokens|not active/ })).toBeUndefined() // quiet: no benefit is fresh
  // Closed: nothing of the card is in the band.
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'devops-info' })).toBeUndefined()
  await band.unmount()
  await hint.press({ key: 'devops-status' })
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const card = await band.find({ key: 'devops-info' })
  expect(card).toBeDefined()
  const text = JSON.stringify(card)
  expect(text).toMatch(/≈ 20 k/) // the headline: the net estimate
  expect(text).toMatch(/estimate · net · 7 days/)
  expect(text).toMatch(/searches narrowed · up to 78 k tokens/)
  expect(text).toMatch(/branches shipped · 1 test runs reused/)
  expect(text).toMatch(/on API credit instead of your plan · 1 runs/)
  expect(text).toMatch(/guard interventions/)
  expect(text).toMatch(/≈ 2 k/)
  expect(text).toMatch(/From local logs · no model call/)
  expect(text).toMatch(/v9\.9\.9/)
  expect(text).not.toMatch(/leftover|worktree|open branch/) // no cleanup figures in the card
  // The card is the band's first row, left: no chip in the band's right rail.
  expect(await band.find({ key: 'devops-info-row' })).toBeDefined()
  await band.unmount()
  await hint.press({ key: 'devops-status' })
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'devops-info' })).toBeUndefined()
  await band.unmount()
  await hint.unmount()
  // Opening costs nothing: no prompt, no model call, no file written.
  expect(seen.prompts).toEqual([])
  expect(forks).toEqual([])
  expect(seen.writes).toEqual([])
})

test('/devops opens and closes the same card with a one-line answer; the terminal hint carries the state as its tail', async ($, on) => {
  const { seen } = engine(on, { files: LOG_FILES })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const opened = await $.command.run({ command: 'devops' })
  expect(opened.text).toBe('devops info opened above the prompt.')
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(JSON.stringify(await band.find({ key: 'devops-info' }))).toMatch(/≈ 20 k/)
  await band.unmount()
  expect((await $.command.run({ command: 'devops' })).text).toBe('devops info closed.')
  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(seen.hints.at(-1)?.tail).toBe('● devops')
  await hint.unmount()
})

test('the fallback status line goes once the line under the prompt is drawn, at the next turn start at the latest', async ($, on) => {
  const { seen } = engine(on, { files: LOG_FILES })
  on('turn.start', () => ({ turnId: 't' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(seen.status.at(-1)).toBe('🟢 active')
  const hint = await $.ui.mount({ ...HINT, surface: 'desktop' })
  expect(await hint.find({ key: 'devops-status' })).toBeDefined()
  // Nothing changed in the plugin's state, so no other refresh would come: the turn start drops the repeat.
  await $.turn.start({ text: 'go', turnId: 't1' } as any)
  expect(seen.status.at(-1)).toBeUndefined()
  await hint.unmount()
  // A new session starts without the line: the fallback text is back until it is drawn again.
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(seen.status.at(-1)).toBe('🟢 active')
})

test('last benefit: a new narrowed line after a guarded tool call reads beside the dot, then the line goes quiet', async ($, on) => {
  const { seen, files, tick } = engine(on, { files: LOG_FILES })
  let savingsMtime = 1
  on('fs.stat', (_: unknown, e: { path: string }) => {
    const p = String(e.path).replace(/\\/g, '/')
    if (p.endsWith('/.claude/devops-savings.jsonl')) return { value: { kind: 'file', size: 1, mtimeMs: savingsMtime, isLink: false } }
    if (p.endsWith('/.claude/devops-hook-telemetry.jsonl')) return { value: { kind: 'file', size: 1, mtimeMs: NOW + 10 * DAY, isLink: false } }
    throw new Error(`ENOENT: ${p}`)
  })
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // What the log held at the start is old news: nothing is announced.
  await $.tool.call({ tool: 'Grep', pattern: 'x' } as any)
  expect(seen.status.at(-1)).toBe('🟢 active')
  // A line another session wrote ten minutes ago, found late: noted, never announced.
  files['/.claude/devops-savings.jsonl'] = `${SAVINGS}\n${guardRow('narrowed', 99000, NOW - 600_000)}`
  savingsMtime = 2
  await $.tool.call({ tool: 'Edit', file_path: 'a.txt' } as any)
  expect(seen.status.at(-1)).toBe('🟢 active')
  // The guard logs a narrowed search during this call: the grown file is noticed right after it.
  files['/.claude/devops-savings.jsonl'] += `\n${guardRow('narrowed', 42000, NOW)}`
  savingsMtime = 3
  await $.tool.call({ tool: 'Grep', pattern: 'x', path: 'src' } as any)
  expect(seen.status.at(-1)).toMatch(/^🟢 .*42 k tokens/)
  let hint = await $.ui.mount({ ...HINT, surface: 'desktop' })
  expect((await hint.find({ type: 'Text', text: /42 k tokens/ }))?.text).toMatch(/^(Boom: up to 42 k tokens saved, search narrowed.|Up to 42 k tokens never loaded. You are welcome.)$/)
  await hint.unmount()
  // 90 s later the next call clears it; the line under the prompt is drawn, so the plain status line is gone too.
  tick(91_000)
  await $.tool.call({ tool: 'Read', file_path: 'a.txt' } as any)
  hint = await $.ui.mount({ ...HINT, surface: 'desktop' })
  expect(await hint.find({ type: 'Text', text: /tokens|not active/ })).toBeUndefined()
  await hint.unmount()
  expect(seen.status.at(-1)).toBeUndefined()
  expect(seen.prompts).toEqual([])
})

test('not active: a disconnected MCP server turns the dot red and names the reason', async ($, on) => {
  const { seen } = engine(on, { files: LOG_FILES })
  on('mcp.connect', () => ({ value: { isConnected: false, reason: 'failed', message: 'The server failed to start.' } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(seen.status.at(-1)).toBe('🔴 not active · MCP server not connected')
  const hint = await $.ui.mount({ ...HINT, surface: 'desktop' })
  expect(JSON.stringify(await hint.find({ key: 'devops-status' }))).toMatch(/#e07a7a/)
  expect((await hint.find({ type: 'Text', text: /not active/ }))?.text).toBe('not active · MCP server not connected')
  await hint.unmount()
})

test('MCP check: an unknown server name is no verdict (stays green); a red dot is asked again after a tool call and recovers', async ($, on) => {
  const { seen } = engine(on, { files: LOG_FILES })
  let answer: Record<string, unknown> = { isConnected: false, reason: 'unlisted', message: 'No server of that name.' }
  on('mcp.connect', () => ({ value: answer }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(seen.status.at(-1)).toBe('🟢 active')
  // The server is still starting when the session begins: red, then connected a moment later.
  answer = { isConnected: false, reason: 'failed', message: 'Still starting.' }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(seen.status.at(-1)).toBe('🔴 not active · MCP server not connected')
  answer = { isConnected: true, server: 'plugin:devops:dotclaude' }
  await $.tool.call({ tool: 'Edit', file_path: 'a.txt' } as any)
  expect(seen.status.at(-1)).toBe('🟢 active')
})

test('hook telemetry switched off (the file is never fresh): no number of tool calls turns the dot red', async ($, on) => {
  const { seen } = engine(on, { files: LOG_FILES })
  on('fs.stat', (_: unknown, e: { path: string }) => {
    const p = String(e.path).replace(/\\/g, '/')
    if (p.endsWith('/.claude/devops-hook-telemetry.jsonl')) return { value: { kind: 'file', size: 1, mtimeMs: NOW - 30 * DAY, isLink: false } }
    throw new Error(`ENOENT: ${p}`)
  })
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (let i = 0; i < 8; i++) await $.tool.call({ tool: 'Edit', file_path: 'a.txt' } as any)
  expect(seen.status.join('|')).not.toMatch(/🔴/)
  expect(seen.status.at(-1)).toBe('🟢 active')
})

test('not active: five tool calls in a row without a hook telemetry record; a fresh record makes it active again', async ($, on) => {
  const { seen } = engine(on, { files: LOG_FILES })
  let telemetryMtime = NOW // the first call proves the hooks write telemetry …
  let calls = 0
  on('fs.stat', (_: unknown, e: { path: string }) => {
    const p = String(e.path).replace(/\\/g, '/')
    if (p.endsWith('/.claude/devops-hook-telemetry.jsonl')) return { value: { kind: 'file', size: 1, mtimeMs: telemetryMtime, isLink: false } }
    throw new Error(`ENOENT: ${p}`)
  })
  on('tool.call', () => {
    calls++
    return { result: {}, text: 'ok' }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: 'a.txt' } as any)
  telemetryMtime = NOW - 60_000 // … then they stop
  for (let i = 0; i < 4; i++) await $.tool.call({ tool: 'Edit', file_path: 'a.txt' } as any)
  expect(seen.status.at(-1)).toBe('🟢 active')
  await $.tool.call({ tool: 'Edit', file_path: 'a.txt' } as any)
  expect(seen.status.at(-1)).toBe('🔴 not active · hooks are not running')
  expect(calls).toBe(6) // every call still ran: the display never holds a tool call back
  telemetryMtime = NOW
  await $.tool.call({ tool: 'Edit', file_path: 'a.txt' } as any)
  expect(seen.status.at(-1)).toBe('🟢 active')
})

test('gate off: nothing under the prompt, no /devops, the engine hint untouched', async ($, on) => {
  const { seen } = engine(on, { pin: 'stable', files: LOG_FILES })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const hint = await $.ui.mount({ ...HINT, surface: 'desktop' })
  expect(await hint.find({ key: 'devops-status' })).toBeUndefined()
  await hint.unmount()
  expect(seen.commands).toEqual([])
  expect(seen.status).toEqual([])
})

// ── #1106 6b / 6c: deterministic paste and tool-output redirect ─────────────────────────────────────────────────────
const BIG = Array.from({ length: 900 }, (_, i) => `row ${i} ${'y'.repeat(40)}`).join(String.fromCharCode(10))
const EXCERPT = 'row 0 … [… 820 lines omitted here — full original: /repo/.claude/redirects/paste-abc.txt …] row 899'
const REDIRECT_OK = { value: { exitCode: 0, stdout: `${JSON.stringify({ ok: true, redirect: true, path: '/repo/.claude/redirects/paste-abc.txt', excerpt: EXCERPT })}\n`, stderr: '' } }

function redirectEngine(on: any, writer: (stdin: string) => unknown) {
  const e = engine(on)
  const calls: string[] = []
  on('process.run', (_: unknown, ev: { argv: string[]; init?: { stdin?: string } }) => {
    if (ev.argv[0] !== 'node' || !String(ev.argv[1]).endsWith('paste-redirect-write.js')) return { value: { exitCode: 1, stdout: '', stderr: '' } }
    calls.push(ev.init?.stdin ?? '')
    return writer(ev.init?.stdin ?? '')
  })
  on('session.id', () => ({ value: 'sess-1' }))
  return { ...e, calls }
}

test('redirect 6b: a large typed paste enters as the writer excerpt; the original goes to the writer whole', async ($, on) => {
  const { seen, calls } = redirectEngine(on, () => REDIRECT_OK)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const out = await $.prompt.submit({ text: BIG, origin: { kind: 'composer' } } as any)
  expect(calls.length).toBe(1)
  expect(JSON.parse(calls[0])).toMatchObject({ cwd: '/repo', kind: 'paste', text: BIG })
  expect(seen.prompts).toEqual([EXCERPT])
  expect(out.text).toBe(EXCERPT)
})

test('redirect 6b: refusal, no redirect, garbage, a throw → the prompt stays whole', async ($, on) => {
  const answers: Array<() => unknown> = [
    () => ({ value: { exitCode: 1, stdout: '{"ok":false,"reason":"write-failed"}\n', stderr: '' } }),
    () => ({ value: { exitCode: 0, stdout: '{"ok":true,"redirect":false,"reason":"exempt-prompt"}\n', stderr: '' } }),
    () => ({ value: { exitCode: 0, stdout: 'not json', stderr: '' } }),
    () => ({ value: { exitCode: 0, stdout: '{"ok":true,"redirect":true,"path":"/x","excerpt":"no path named"}\n', stderr: '' } }),
    () => { throw new Error('timeout') },
  ]
  let i = 0
  const { seen } = redirectEngine(on, () => answers[i++]())
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  for (let k = 0; k < answers.length; k++) {
    expect((await $.prompt.submit({ text: BIG } as any)).text).toBe(BIG)
  }
  expect(seen.prompts).toEqual(answers.map(() => BIG))
})

test('redirect 6b: small, slash-command, meta and plugin prompts never start the writer', async ($, on) => {
  const { calls } = redirectEngine(on, () => REDIRECT_OK)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'short' } as any)
  await $.prompt.submit({ text: `/do-run ${BIG}` } as any)
  await $.prompt.submit({ text: BIG, isMeta: true } as any)
  await $.prompt.submit({ text: BIG, origin: { kind: 'plugin', name: 'x' } } as any)
  expect(calls.length).toBe(0)
})

test('redirect 6b: closed gate (stable pin) → no writer, prompt unchanged', async ($, on) => {
  engine(on, { pin: 'stable' })
  const calls: unknown[] = []
  on('process.run', () => {
    calls.push(1)
    return REDIRECT_OK
  })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect((await $.prompt.submit({ text: BIG } as any)).text).toBe(BIG)
  expect(calls.length).toBe(0)
})

test('redirect 6c: a large Bash stdout is replaced by the excerpt; the command goes to the writer for its exemptions', async ($, on) => {
  const { calls } = redirectEngine(on, () => REDIRECT_OK)
  on('tool.call', () => ({ result: { stdout: BIG, stderr: '', interrupted: false }, text: BIG }))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const r = await $.tool.call({ tool: 'Bash', command: 'cat big.log' } as any)
  expect((r as any).result.stdout).toBe(EXCERPT)
  expect((r as any).result.stderr).toBe('')
  expect(JSON.parse(calls[0])).toMatchObject({ kind: 'output', command: 'cat big.log', text: BIG })
})

test('redirect 6c: writer keeps it (exempt / guard-released), small output, errors, background and subagent calls stay whole', async ($, on) => {
  let redirect = false
  const { calls } = redirectEngine(on, () => (redirect ? REDIRECT_OK : { value: { exitCode: 0, stdout: '{"ok":true,"redirect":false,"reason":"guard-released"}\n', stderr: '' } }))
  let answer: any = { result: { stdout: BIG, stderr: '', interrupted: false }, text: BIG }
  on('tool.call', () => answer)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect(((await $.tool.call({ tool: 'Bash', command: 'npm test' } as any)) as any).result.stdout).toBe(BIG)
  expect(calls.length).toBe(1)
  redirect = true
  answer = { result: { stdout: 'small', stderr: '', interrupted: false }, text: 'small' }
  expect(((await $.tool.call({ tool: 'Bash', command: 'ls' } as any)) as any).result.stdout).toBe('small')
  answer = { result: { stdout: BIG, stderr: '', interrupted: false, backgroundTaskId: 'b1' }, text: BIG }
  expect(((await $.tool.call({ tool: 'Bash', command: 'x' } as any)) as any).result.stdout).toBe(BIG)
  answer = { isError: true, result: { stdout: BIG, stderr: '', interrupted: false }, text: BIG }
  expect(((await $.tool.call({ tool: 'Bash', command: 'x' } as any)) as any).result.stdout).toBe(BIG)
  answer = { result: { stdout: BIG, stderr: '', interrupted: false }, text: BIG }
  expect(((await $.tool.call({ tool: 'Bash', command: 'x', agentId: 'sub1' } as any)) as any).result.stdout).toBe(BIG)
  expect(calls.length).toBe(1)
})

// ── #1105: recap on return ──────────────────────────────────────────────────────────────────────────────────────────
function recapEngine(on: any, fork: (e: unknown) => unknown) {
  const e = engine(on)
  const forks: unknown[] = []
  on('model.fork', (_: unknown, ev: unknown) => {
    forks.push(ev)
    return fork(ev)
  })
  on('tool.call', (_: unknown, ev: { tool: string }) => ({ result: {}, text: ev.tool === CARD_TOOL ? CARD_RESULT : 'ok' }))
  on('classic.SessionStart', () => ({}))
  on('turn.start', (_: unknown, ev: { turnId: string }) => ({ turnId: ev.turnId || 't' }))
  return { ...e, forks }
}
// showRecap runs detached from SessionStart: let its chain of engine calls finish.
const settle = async (_: unknown) => {
  for (let i = 0; i < 200; i++) await Promise.resolve()
}

test('recap: a cold return (2 h) shows the last card text once, no model call; the close button removes it', async ($, on) => {
  const { forks } = recapEngine(on, () => ({ value: { isAnswered: true, text: 'never' } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, variant: 'ready', summary: 'x' } as any)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 7200 } as any)
  await settle($)
  expect(forks).toEqual([])
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'devops-recap' })).toBeTruthy()
  await band.press({ key: 'recap-close' })
  expect(await band.find({ key: 'devops-recap' })).toBeFalsy()
  await band.unmount()
})

test('recap: a warm return (30 min) runs one fork with the fixed prompt and no effort; its text is shown', async ($, on) => {
  const { forks } = recapEngine(on, () => ({ value: { isAnswered: true, text: 'Stand: Spike 4 grün.', usage: {} } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 1800 } as any)
  await settle($)
  expect(forks.length).toBe(1)
  expect(Object.keys(forks[0] as object)).toEqual(['prompt'])
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await has(band, 'Stand: Spike 4 grün.')).toBe('Stand: Spike 4 grün.')
  await band.unmount()
  // The next typed prompt spends it.
  await $.turn.start({ text: 'weiter', turnId: 't9' } as any)
  const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await after.find({ key: 'devops-recap' })).toBeFalsy()
  await after.unmount()
})

test('recap: a failed warm fork falls back to the card text; a short gap or a compaction shows nothing', async ($, on) => {
  const { forks } = recapEngine(on, () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 60 } as any)
  await $.classic.SessionStart({ source: 'compact', seconds_since_last_response: 7200 } as any)
  await settle($)
  expect(forks).toEqual([])
  const none = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await none.find({ key: 'devops-recap' })).toBeFalsy()
  await none.unmount()
  await $.tool.call({ tool: CARD_TOOL, variant: 'ready', summary: 'x' } as any)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 1800 } as any)
  await settle($)
  expect(forks.length).toBe(1)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'devops-recap' })).toBeTruthy()
  await band.unmount()
})

// ── #1103: wake timers (due times in $.state, reload-safe, fire once) ───────────────────────────────────────────────
test('wake: schedule is idempotent per id, pending re-arms open entries, claim fires once', () => {
  let list = scheduleWake([], 'a', 1000, 'x')
  list = scheduleWake(list, 'a', 2000, 'x')
  expect(list).toEqual([{ id: 'a', at: 2000, tag: 'x', fired: false }])
  list = scheduleWake(list, 'b', 500, 'y')
  expect(pendingWakes(list, 1500)).toEqual([{ id: 'a', delayMs: 500 }, { id: 'b', delayMs: 0 }])
  const first = claimWake(list, 'a')
  expect(first.fire).toBe(true)
  expect(claimWake(first.list, 'a').fire).toBe(false) // a second timer after a reload
  expect(claimWake(first.list, 'nope').fire).toBe(false)
  expect(pendingWakes(first.list, 1500)).toEqual([{ id: 'b', delayMs: 0 }])
  expect(wakeDelayMs('')).toBe(90_000)
  expect(wakeDelayMs('2')).toBe(120_000)
  expect(wakeDelayMs('0,5')).toBe(30_000)
  expect(wakeDelayMs('0')).toBe(null)
  expect(wakeDelayMs('999')).toBe(null)
  expect(wakeDelayMs('soon')).toBe(null)
})

test('wake: /mods-spike-wake arms a timer whose firing submits one prompt and logs it', async ($, on) => {
  const { seen } = engine(on)
  // A clock.after dispatch runs the timer's fn when it resolves: each wait resolves when the test says so.
  const timers: Array<{ ms: number; fn: () => void }> = []
  on('clock.after', (_: unknown, e: { ms: number }) => new Promise(resolve => timers.push({ ms: e.ms, fn: () => resolve({ value: undefined }) })))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'mods-spike-wake', args: '0.5' } as any)
  expect(r.text).toMatch(/30 s/)
  expect(timers.map(t => t.ms)).toEqual([30_000])
  timers[0].fn()
  for (let i = 0; i < 5000 && !seen.prompts.length; i++) await Promise.resolve()
  expect(seen.prompts.length).toBe(1)
  expect(seen.prompts[0]).toMatch(/^SPIKE_WAKE after 30 s/)
  const logged = () => seen.writes.some(w => w.path.replace(/\\/g, '/').endsWith('devops-mods-spike.jsonl'))
  for (let i = 0; i < 5000 && !logged(); i++) await Promise.resolve()
  const row = JSON.parse(seen.writes.find(w => w.path.replace(/\\/g, '/').endsWith('devops-mods-spike.jsonl'))!.text.trim().split('\n').pop()!)
  expect(row).toMatchObject({ mode: 'wake', submitted: true })
  // A reload re-arms only open entries: the fired one is never armed (nor submitted) again.
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(timers.length).toBe(1)
  expect(seen.prompts.length).toBe(1)
})

// ── #1101: keep-alive policy, one test per limit ────────────────────────────────────────────────────────────────────
const H = 3_600_000
const KA: KeepaliveInput = {
  now: 10 * H,
  lastRequestAt: 10 * H - 56 * 60_000,
  pauseStartedAt: 10 * H - 56 * 60_000,
  inputSincePause: false,
  contextTokens: 150_000,
  ttl1h: true,
  finished: false,
  otherPingers: 0,
  fiveHourWindowOpen: true,
  returnRate: 0.5,
  disabled: false,
}

test('keepalive: due after ~55 min idle with every limit met', () => {
  expect(keepalivePolicy(KA)).toEqual({ ping: true, reason: 'due', dueInMs: 0 })
  expect(keepalivePolicy({ ...KA, lastRequestAt: KA.now - 10 * 60_000, pauseStartedAt: KA.now - 10 * 60_000 })).toMatchObject({ ping: false, reason: 'not-due', dueInMs: 45 * 60_000 })
})

test('keepalive: every limit refuses on its own', () => {
  const cases: Array<[Partial<KeepaliveInput>, string]> = [
    [{ disabled: true }, 'disabled-after-miss'],
    [{ finished: true }, 'session-finished'],
    [{ inputSincePause: true }, 'input-cancels'],
    [{ ttl1h: false }, 'no-1h-ttl'],
    [{ contextTokens: 79_999 }, 'context-small'],
    [{ contextTokens: null }, 'context-small'],
    [{ otherPingers: 2 }, 'machine-cap'],
    [{ fiveHourWindowOpen: false }, 'would-open-5h-window'],
    [{ pauseStartedAt: KA.now - 2 * H }, 'pause-cap'],
    [{ returnRate: null }, 'return-rate-below-break-even'],
    [{ returnRate: 0.01 }, 'return-rate-below-break-even'],
  ]
  for (const [patch, reason] of cases) expect(keepalivePolicy({ ...KA, ...patch }).reason).toBe(reason)
  expect(keepalivePolicy({ ...KA, otherPingers: 1 }).ping).toBe(true)
})

test('keepalive: break-even H/39, read share and the self-disable rule', () => {
  expect(Math.round(breakEvenRate(1) * 10000)).toBe(256)
  expect(Math.round(breakEvenRate(8) * 1000)).toBe(205)
  expect(readShare({ cache_read_input_tokens: 190_000, cache_creation_input_tokens: 3279, input_tokens: 2 })).toBe(0.983)
  expect(readShare(null)).toBe(null)
  expect(disablesAfter(0.983)).toBe(false)
  expect(disablesAfter(0.94)).toBe(true)
  expect(disablesAfter(null)).toBe(true)
})

// ── Codex review of the batch (2026-11-17): regressions ─────────────────────────────────────────────────────────────
test('redirect 6c: the context the hooks beneath attached rides along with the excerpt', async ($, on) => {
  redirectEngine(on, () => REDIRECT_OK)
  on('tool.call', () => ({ result: { stdout: BIG, stderr: '', interrupted: false }, text: BIG, context: ['reminder from a PostToolUse hook'] }))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const r = (await $.tool.call({ tool: 'Bash', command: 'cat big.log' } as any)) as any
  expect(r.result.stdout).toBe(EXCERPT)
  expect(r.context).toEqual(['reminder from a PostToolUse hook'])
})

test('recap: a second SessionStart of the same return makes no second fork and keeps the recap', async ($, on) => {
  let n = 0
  const { forks } = recapEngine(on, () => ({ value: { isAnswered: true, text: `Stand ${++n}`, usage: {} } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 1800 } as any)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 1800 } as any)
  await settle($)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 1800 } as any)
  await settle($)
  expect(forks.length).toBe(1)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await has(band, 'Stand 1')).toBe('Stand 1')
  await band.unmount()
})

test('wake: two commands in the same millisecond keep two entries and fire twice', async ($, on) => {
  const { seen } = engine(on)
  const timers: Array<{ ms: number; fn: () => void }> = []
  on('clock.after', (_: unknown, e: { ms: number }) => new Promise(resolve => timers.push({ ms: e.ms, fn: () => resolve({ value: undefined }) })))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'mods-spike-wake', args: '0.5' } as any)
  await $.command.run({ command: 'mods-spike-wake', args: '1' } as any)
  expect(timers.map(t => t.ms)).toEqual([30_000, 60_000])
  timers[0].fn()
  timers[1].fn()
  for (let i = 0; i < 5000 && seen.prompts.length < 2; i++) await Promise.resolve()
  expect(seen.prompts.length).toBe(2)
})

// 2026-11-17 (devops learn): the band's own cleanup block (Altlasten) covers the card's cleanup hints.
test('card band: cleanup hints (🧹) and the card’s Aufräumen button are left out of the band', () => {
  const d = {
    ...CARD_DATA,
    pt: ['👉 Remote-Branch konnte nicht gelöscht werden', '🧹 ⚠ Nicht gelandete Arbeit ohne PR: claude/x — pushen und mergen oder bewusst verwerfen'],
    bt: [
      { l: 'Promote beta', p: 'promote beta 0.384.0', pr: 1, i: 'arrow-up' },
      { l: 'Aufräumen', p: 'Sichere die nicht gelandete Arbeit: pushen, PR öffnen und mergen.', i: 'trash' },
    ],
  }
  const view = cardFromResult(cardText(d))!
  expect(view.points).toEqual(['👉 Remote-Branch konnte nicht gelöscht werden'])
  expect(view.buttons.map(b => b.label)).toEqual(['Promote beta'])
})

// --- B1 Mod-Band: one count source, the card surviving the app's nudge, idle collect layout, clamps, session marker. ---

const RELEASED_REAL = {
  v: 1,
  l: 'de',
  ti: 'Konten gelöscht, Ursache geklärt',
  at: '13:04',
  h: '👉 🚀 Released Alpha — v0.273.1 — nach Beta promoten +2 weitere?',
  pt: [
    'Übersetzungs-Tick (translate-orchestrator, alle 10 min) antwortet seit mindestens heute 07:00 Uhr durchgehend mit 546 WORKER_RESOURCE_LIMIT; vier Jobs hängen seit dem 11.11. in „estimating“ — bestand schon vor diesem Ship',
    '👉 verify-release-token hat im Repo keinen Aufrufer mehr — löschen?',
    '👉 PostHog: persönlichen API-Key anlegen',
  ],
  bt: [
    { l: 'Promote beta', i: 'up', p: 'promote beta 0.273.1', pr: 1 },
    { l: 'Promote stable', i: 'up', p: 'promote stable 0.273.1' },
    { l: 'Nachbessern', i: 'pencil', p: 'Ja, bitte noch alle offenen Punkte angehen.' },
    { l: 'App starten', i: 'play', p: 'App starten' },
    { l: 'Web-Guide starten', i: 'globe', p: 'Führ mich per Web-Guide durch PostHog' },
  ],
}
// The live template escapes "<" inside the JSON as \u003c (card-widget.js cardWidgetTemplate).
const REAL_RESULT =
  '[CARD WIDGET — DO NOT OUTPUT THIS BLOCK]\n----- widget_code -----\n<div id="dc-card"></div>\n' +
  `<script type="application/json" id="dc-card-data">${JSON.stringify(RELEASED_REAL).replace(/</g, '\\u003c')}</script>\n` +
  '----- end widget_code -----'

test("#5: the real Released card survives the app's no-output nudge (meta text) and still spends on a typed prompt", async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: {}, text: REAL_RESULT }))
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId || 't' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  // The app's nudge arrives as a meta user turn WITH text: it used to clear the card.
  await $.turn.start({ text: '[Your previous response had no visible output. Please continue.]', isMeta: true, turnId: 't2' } as any)
  await $.turn.start({ text: '[Your previous response had no visible output. Please continue.]', turnId: 't3' } as any)
  await $.turn.start({ text: '<task-notification><task-id>x</task-id></task-notification>', turnId: 't4' } as any)
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await has(band, 'Released Alpha')).toBeDefined()
  for (let i = 0; i < 5; i++) expect(await band.find({ key: `card-button-${i}` })).toBeDefined()
  expect(await has(band, 'Zuletzt')).toBeUndefined()
  await band.unmount()
  await $.turn.start({ text: 'Führ mich durch PostHog', turnId: 't5' } as any)
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await has(band, 'Released Alpha')).toBeUndefined()
  await band.unmount()
})

test('#1: the batch hint card heading shows the live note count, once (no second chip)', async ($, on) => {
  batchEngine(on, () => WRITER_OK(1))
  const hint = { ...CARD_DATA, ti: 'Sammelmodus aktiv', h: '👉 📚 Batch — sammelt — 0 Einträge', pt: ['noch keine Notiz'] }
  on('tool.call', () => ({ result: {}, text: cardText(hint) }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  if (!(await has(band, 'Batch — sammelt — 2 Einträge'))) throw new Error(JSON.stringify(await band.find({ key: 'band' })).slice(0, 700))
  expect(await has(band, 'Batch — sammelt — 2 Einträge')).toBeDefined() // batch.md holds 2 notes
  expect(await has(band, '0 Einträge')).toBeUndefined()
  expect(await has(band, '📚 Batch · ')).toBeUndefined() // one count source: no second chip
  await band.unmount()
})

test('#6: idle collect band: batch chip in the idle row, the expanded breakdown a right-aligned column of rail width', async ($, on) => {
  batchEngine(on, () => WRITER_OK(1), { '/.claude/orphan-report.json': ORPHAN_REPORT, '/demo/.claude/batch-mode.json': BATCH_MODE, '/demo/.claude/batch.md': BATCH_NOTES })
  on('session.root', () => ({ value: 'P:/Projects/demo' }))
  await $.session.start({ cwd: 'P:/Projects/demo', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const idle: any = await band.find({ key: 'idle' })
  expect(JSON.stringify(idle)).toContain('📚 Batch · 2') // the chip sits inside the idle row, not in a row of its own
  expect(await band.find({ key: 'cleanup-fold' })).toBeDefined()
  await band.press({ key: 'cleanup-fold' })
  await band.unmount()
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const pop: any = await band.find({ key: 'cleanup-popover' })
  expect(pop.props.width).toBe(30)
  expect(pop.props.backgroundColor).toBeTruthy()
  await band.unmount()
})

test('#3 band: a long point shows ≤ 120 characters with …, the full text in a hover overlay; a long title one line; terminal ▸ expands', async ($, on) => {
  engine(on)
  const long = { ...CARD_DATA, ti: 'T'.repeat(90), pt: ['x'.repeat(40) + ' ' + 'y'.repeat(200)] }
  on('tool.call', () => ({ result: {}, text: cardText(long) }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const point: any = await band.find({ key: 'card-point-0' })
  const shown = { text: String(point.children[1].children[0]) }
  expect(shown.text.endsWith('…')).toBe(true)
  expect(shown.text.length).toBeLessThanOrEqual(123)
  const pop = point.children.find((c: any) => c.type === 'Box')
  expect(pop.props).toMatchObject({ position: 'absolute', display: 'none' })
  expect(JSON.stringify(pop)).toContain('y'.repeat(200))
  const title: any = await band.find({ key: 'card-title-wrap' })
  expect(JSON.stringify(title)).toContain('…')
  expect(JSON.stringify(title)).toContain('T'.repeat(90)) // in the hover overlay
  await band.unmount()
  band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(JSON.stringify(await band.find({ key: 'band' }))).not.toContain('y'.repeat(200))
  await band.press({ key: 'card-point-more-0' })
  await band.unmount()
  band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(JSON.stringify(await band.find({ key: 'band' }))).toContain('y'.repeat(200))
  await band.unmount()
})

test('#2 marker: the drawing band writes the session marker (throttled to 60 s, merged, 24 h pruned, remoteControl null)', async ($, on) => {
  const { seen, tick } = engine(on, {
    files: { '/.claude/devops-band-active.json': JSON.stringify({ sessions: { old: { at: NOW - 25 * 3600_000, remoteControl: false }, other: { at: NOW - 1000, remoteControl: true } } }) },
  })
  on('session.id', () => ({ value: 'sess-9' }))
  on('tool.call', () => ({ result: {}, text: CARD_RESULT }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  const writes = () => seen.writes.filter(w => w.path.split(String.fromCharCode(92)).join('/').endsWith('/.claude/devops-band-active.json'))
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.unmount()
  const m = JSON.parse(writes()[0].text)
  expect(Object.keys(m.sessions).sort()).toEqual(['other', 'sess-9'])
  expect(m.sessions['sess-9']).toEqual({ at: NOW, remoteControl: null })
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.unmount()
  expect(writes().length).toBe(1) // throttled
  tick(61_000)
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.unmount()
  expect(writes().length).toBe(2)
})

test('archive helpers: offered only on a green card while idle; isError text becomes the reason', () => {
  expect(archiveOffered({ heading: '🟩 🚀 Released Alpha — v1 — fertig.' }, false)).toBe(true)
  expect(archiveOffered({ heading: '🟩 🖥️ System — erledigt — noch etwas?' }, false)).toBe(true)
  expect(archiveOffered({ heading: '🟩 🚀 Released Alpha — v1 — fertig.' }, true)).toBe(false)
  expect(archiveOffered({ heading: '👉 Ready — shippen?' }, false)).toBe(false)
  expect(archiveOffered(null, false)).toBe(false)
  expect(archiveRefusal({ isError: false, content: [] })).toBeNull()
  expect(archiveRefusal({ isError: true, content: [{ type: 'text', text: 'Session is pinned.\n' }] })).toBe('Session is pinned.')
  expect(archiveRefusal({ isError: true })).toBe('archive_session failed')
})

test('archive button: a green card offers it; a press calls the app archive_session on self, a refusal is a toast', async ($, on) => {
  const { seen } = engine(on)
  on('tool.call', () => ({ result: {}, text: cardText(REL) }))
  const calls: Array<{ server: string; tool: string; args: Record<string, unknown> }> = []
  on('mcp.call', (_: unknown, e: { server: string; tool: string; args: Record<string, unknown> }) => {
    calls.push(e)
    return { value: { isError: true, content: [{ type: 'text', text: 'Session is pinned' }] } }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'ship' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'card-archive' })).toBeDefined()
  await band.press({ key: 'card-archive' })
  expect(calls).toHaveLength(1)
  expect(calls[0].server).toBe('ccd_session_mgmt')
  expect(calls[0].tool).toBe('archive_session')
  expect(calls[0].args.session_id).toBe('self')
  expect(seen.toasts.at(-1)).toMatch(/Session is pinned/)
  expect(seen.prompts).toHaveLength(0)
  await band.unmount()
})

test('archive button: server unreachable → the request goes out as the person\'s prompt', async ($, on) => {
  const { seen } = engine(on)
  on('tool.call', () => ({ result: {}, text: cardText(REL) }))
  on('mcp.call', () => ({ deny: 'no such server' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'ship' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'card-archive' })
  expect(seen.prompts.at(-1)).toMatch(/archiv/i)
  await band.unmount()
})

test('archive button: no button on a card that is not green', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: {}, text: cardText({ ...CARD_DATA, h: '👉 Ready — shippen?' }) }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'card-archive' })).toBeUndefined()
  await band.unmount()
})

test('budget bars: Wk, Fb, 5h in that order; Fable follows the weekly show rule; fableFromLive never gives a false bar', () => {
  const b = { fiveHour: 80, weekly: 80, context: null, fiveHourResetsAt: NOW + 3_600_000, weeklyResetsAt: NOW + 3 * 86_400_000, fable: 70, fableResetsAt: NOW + 3 * 86_400_000 }
  expect(budgetBars(b, NOW).map(x => x.label)).toEqual(['Wk', 'Fb', '5h'])
  // Fable on pace and more than a day from the reset: omitted like Wk; zero or unknown: no bar.
  expect(budgetBars({ ...b, fable: 5, weekly: 5 }, NOW).map(x => x.label)).toEqual(['5h'])
  expect(budgetBars({ ...b, fable: 0 }, NOW).map(x => x.label)).toEqual(['Wk', '5h'])
  expect(budgetBars({ ...b, fable: null }, NOW).map(x => x.label)).toEqual(['Wk', '5h'])
  const live = (scoped: unknown, ts = new Date(NOW - 60_000).toISOString()) => ({ timestamp: ts, scoped })
  expect(fableFromLive(live([{ name: 'Fable', pct: 61.4, resetInMinutes: 3000 }]), NOW)).toEqual({ pct: 61, resetsAt: NOW - 60_000 + 3000 * 60_000 })
  for (const bad of [null, undefined, 'x', {}, live(null), live([]), live([{ name: 'Fable', pct: 'a' }]), live([{ name: 'Fable', pct: 0, resetInMinutes: 100 }]), live([{ name: 'Fable', pct: 50, resetInMinutes: 0 }], new Date(NOW - 3_600_000).toISOString()), { scoped: [{ name: 'Fable', pct: 50, resetInMinutes: 100 }] }, live([{ name: 'Fable', pct: 50 }], new Date(NOW - 4 * 3_600_000).toISOString())]) {
    expect(fableFromLive(bad, NOW)).toBeNull()
  }
})

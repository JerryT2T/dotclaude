// Engine tests of the devops mods (feature `claude-mods`, alpha).
// Run: npm run test:mods  (= claude plugin test plugins/devops)
// The hooks `on` registers here stand for the engine: files, env, clock,
// gh/git, the model. Nothing reaches the real machine.
import { expect, test } from 'claude-code/testing'
import {
  addRun,
  agentRows,
  budgetFrom,
  cleanupApplyPrompt,
  cleanupPlanPrompt,
  cleanupView,
  compactAdvised,
  compactThreshold,
  hourglassSvg,
  hygieneFrom,
  hygieneLine,
  isInactiveUnmerged,
  lastLine,
  learnCause,
  LOCALES,
  localeFrom,
  markerActive,
  markerHides,
  nudgeThresholdFrom,
  passiveSpikeRow,
  ringPercent,
  tr,
  verbatimNotices,
} from './format'
import type { StrKey } from './format'

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
  const seen = { toasts: [] as string[], commands: [] as string[], writes: [] as { path: string; text: string }[], prompts: [] as string[], status: [] as (string | undefined)[], opened: [] as string[] }
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
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.measure', (_: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    seen.prompts.push(e.text)
    return { text: e.text }
  })
  return { seen, tick: (ms: number) => { clock += ms } }
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

test('gate on: the commands are registered and the hygiene count is pinned in the status line', async ($, on) => {
  const { seen } = engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT } })
  await $.session.start({ cwd: 'P:/Projects/demo/.claude/worktrees/x', surface: 'desktop', isInteractive: true })
  expect(seen.commands).toEqual(['devops-agents', 'devops-ship', 'mods-spike-fork'])
  expect(seen.status.at(-1)).toBe('devops: 2 open branches · 1 dirty worktree')
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
  expect(seen.status.at(-1)).toBe('devops: 1 open branch')
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
    expect((await band.find({ type: 'Text', text: /^Band zeigt/ }))?.text).toBe('Band zeigt die Card')
    expect((await band.find({ type: 'Text', text: /^01:43$/ }))?.text).toBe('01:43')
    expect((await band.find({ type: 'Text', text: /Committed/ }))?.text).toBe('👉 📦 Committed — fertig — shippen?')
    if (surface === 'terminal') expect((await band.find({ type: 'Text', text: /Doku/ }))?.text).toBe('› Doku nachziehen')
    else {
      // B2: the point is 14 px secondary with its own violet › (the card's marker), the title and heading 16 px medium, the time 12 px tabular.
      expect((await band.find({ type: 'Text', text: /^Doku/ }))?.props).toMatchObject({ size: 'body', dimColor: true })
      expect((await band.find({ type: 'Text', text: '›' }))?.props.color).toBe('#9d8cd6')
      expect((await band.find({ type: 'Text', text: /^Band zeigt/ }))?.props).toMatchObject({ size: 'heading', weight: 'medium' })
      expect((await band.find({ type: 'Text', text: /Committed/ }))?.props).toMatchObject({ size: 'heading', weight: 'medium' })
      expect((await band.find({ type: 'Text', text: /^01:43$/ }))?.props).toMatchObject({ size: 'caption', tabular: true })
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
  expect(await band.find({ type: 'Text', text: /Committed/ })).toBeUndefined()
  await band.unmount()
  await $.tool.call({ tool: CARD_TOOL, summary: 'refused' } as any)
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: /Committed/ })).toBeUndefined()
  await band.unmount()
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  await $.turn.start({ text: '', turnId: 't2' } as any)
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: /Committed/ })).toBeDefined()
  await band.unmount()
  await $.turn.start({ text: 'next task', turnId: 't3' } as any)
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: /Committed/ })).toBeUndefined()
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
    expect(await band.find({ type: 'Text', text: /Committed/ })).toBeUndefined()
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
  expect(h).toMatchObject({ branches: 4, worktrees: 0, copies: 0, agent: 2, broken: 1, landed: 40, inactive: 2, repo: REPO })
  expect(h?.causes).toEqual({ 'agent worktree': 1, branch: 1 })
  const v = cleanupView(h, 50)
  expect(v).toMatchObject({ n: 4, rule: { kind: 'inactive', n: 2 } })
  expect(v?.rows).toEqual([{ key: 'rowAgent', n: 2 }, { key: 'rowBranches', n: 1 }, { key: 'rowBroken', n: 1 }])
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
  const keys: StrKey[] = ['ctx', 'compact', 'cleanupBtn', 'junk', 'last', 'rowAgent', 'rowCopies', 'rowBranches', 'rowBroken', 'ruleInactive', 'ruleCount', 'working', 'ringAlt', 'stBranch1', 'stBranchN', 'stDirty1', 'stDirtyN', 'stCopy1', 'stCopyN', 'asOf', 'toastPlanned', 'toastDone', 'toastFailed', 'toastLearn', 'permission', 'finishedAfter', 'bgCommand', 'paneIdle', 'panePlanning', 'paneApplying', 'panePlanned', 'paneDone', 'paneFailed', 'btnApply', 'btnDiscard', 'btnClose', 'btnPlan', 'btnReview', 'runPlanning', 'runApplying', 'learnOffer', 'learnBtn', 'runBusy']
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
  expect(seen.status.at(-1)).toBe('devops: 2 offene Branches · 1 unsauberer Worktree')
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
  expect(seen.status.at(-1)).toBe('devops: 2 open branches · 1 dirty worktree')
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

test('B17 hint cards (batch / test mode): heading plus a ? toggle, hints collapsed by default and per session; decision cards keep their points', async ($, on) => {
  engine(on)
  const batch = { ...CARD_DATA, ti: 'Batch', h: '👉 📚 Batch — sammelt Aufträge', pt: ['Aufträge einzeln senden', 'batch ship beendet den Modus'] }
  let data: unknown = batch
  on('tool.call', () => ({ result: {}, text: `<script type="application/json" id="dc-card-data">${JSON.stringify(data)}</script>` }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: CARD_TOOL, summary: 'x' } as any)
  for (const surface of SURFACES) {
    let band = await $.ui.mount({ ...BAND, surface })
    console.log('DBGB', surface, JSON.stringify(await band.find({ key: 'card-heading-row' })))
    expect(await band.find({ type: 'Text', text: /Batch — sammelt/ })).toBeDefined()
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
  await band.unmount()
})

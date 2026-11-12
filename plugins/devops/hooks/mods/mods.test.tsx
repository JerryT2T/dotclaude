// Engine tests of the devops mods (feature `claude-mods`, alpha).
// Run: npm run test:mods  (= claude plugin test plugins/devops)
// The hooks `on` registers here stand for the engine: files, env, clock,
// gh/git, the model. Nothing reaches the real machine.
import { expect, test } from 'claude-code/testing'
import { CACHE_WARM_MS, cleanupOffered, hygieneLine } from './format'

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
  const seen = { toasts: [] as string[], commands: [] as string[], writes: [] as { path: string; text: string }[], prompts: [] as string[], status: [] as (string | undefined)[] }
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
  on('ui.open', () => ({ value: { isPlaced: true } }))
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

const BAND = { plugin: 'devops', component: 'AbovePrompt', props: { hasSurvey: false, isCollapsed: false, view: {} } } as const

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

test('budget band draws the card bars (SVG on desktop, glyphs on the terminal) with the card rules; one cleanup press = one prompt', async ($, on) => {
  const { seen } = engine(on, { files: { '/.claude/orphan-report.json': ORPHAN_REPORT } })
  await $.session.start({ cwd: 'P:/Projects/demo', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE as any)
  for (const surface of SURFACES) {
    const band = await $.ui.mount({ ...BAND, surface })
    if (surface === 'terminal') {
      const line = await band.find({ type: 'Text', text: /5h/ })
      expect(line?.text).toBe('⚠ 5h ▰▰▰▰▰▰▰▰▱▱│▱▱▱ 2 h 0 m   🧠 context 85 %')
    } else {
      const bar = await band.find({ type: 'Svg' })
      expect(bar?.props.alt).toBe('5h: 72 % used · resets in 2 h 0 m')
      expect(bar?.props.source).toMatch(/<animate attributeName="x"/)
      expect(bar?.props.source).toMatch(/fill="#e6c36a"/)
      expect((await band.find({ type: 'Text', text: /context/ }))?.text).toBe('🧠 context 85 %')
    }
    if (surface === SURFACES[0]) await band.press({ key: 'cleanup' })
    await band.unmount()
  }
  // The first press sent the prompt; until the next main turn ends the button is a dim "waiting…" text.
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'cleanup' })).toBeUndefined()
  expect((await band.find({ type: 'Text', text: /waiting/ }))?.text).toBe('[ Clean up · waiting… ]')
  await band.unmount()
  expect(seen.prompts.length).toBe(1)
  expect(seen.prompts[0]).toMatch(/model opus and effort medium/)
  expect(seen.writes).toEqual([])
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

test('cleanup is offered only while the prompt cache is warm; the band row drops the devops prefix', async () => {
  expect(cleanupOffered(null, NOW)).toBe(true)
  expect(cleanupOffered({ idleSince: null }, NOW)).toBe(true)
  expect(cleanupOffered({ idleSince: NOW - CACHE_WARM_MS + 60_000 }, NOW)).toBe(true)
  expect(cleanupOffered({ idleSince: NOW - CACHE_WARM_MS }, NOW)).toBe(false)
  expect(cleanupOffered({ idleSince: NOW, cold: true }, NOW)).toBe(false)
  expect(hygieneLine({ branches: 0, worktrees: 2, ageHours: 1 }, false)).toBe('2 dirty worktrees')
  expect(hygieneLine({ branches: 0, worktrees: 2, ageHours: 1 })).toBe('devops: 2 dirty worktrees')
})

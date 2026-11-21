// devops Home pane (concept docs/concepts/20261121-1400-devops-home): the pure model behind the pane.
import { expect, test } from 'claude-code/testing'

import { agoText, cleanupFrom, homeModel, infoTiles, isBatchTitle, kindOf, needsConfirm, paceWord, projectOf, ringSvgSource, ringsFrom, resetText, sessionsFrom } from './home'

const rows = [
  { sessionId: 'local_a', title: '👉 ➜ 📥 Batch ┃ Feedback', cwd: 'P:\\Projects\\dotclaude\\.claude\\worktrees\\x', isRunning: false, lastActivityAt: '2026-11-21T09:00:00Z' },
  { sessionId: 'local_b', title: '👉 ➜ ❓ Question ┃ Y', cwd: 'P:\\Projects\\scc', isRunning: false, lastActivityAt: '2026-11-21T11:00:00Z' },
  { sessionId: 'local_c', title: '⏳ ➜ 🚀 Shipping ┃ Z', cwd: 'P:\\Projects\\scc\\.claude\\worktrees\\y', isRunning: true, lastActivityAt: '2026-11-21T12:00:00Z' },
  { sessionId: 'local_d', title: '🟩 ➜ 🚀 Released ┃ W', cwd: 'P:\\Projects\\scc', isRunning: false, lastActivityAt: '2026-11-20T12:00:00Z' },
  { sessionId: 'local_e', title: '👉 ➜ ❓ Question ┃ old', cwd: 'P:\\Projects\\scc', isArchived: true, lastActivityAt: '2026-11-01T12:00:00Z' },
]

test('home: worktree folders map to their repo, the title glyph decides the state', () => {
  expect(projectOf('P:\\Projects\\dotclaude\\.claude\\worktrees\\x-1')).toBe('P:/Projects/dotclaude')
  expect(kindOf('👉 ➜ ❓ Question ┃ X')).toBe('waiting')
  expect(kindOf('⏳ ➜ 🤖 Solo ┃ X')).toBe('running')
  expect(kindOf('🟩 ➜ 🚀 Released ┃ X')).toBe('done')
  expect(kindOf('Die data uploader logs')).toBe('other')
  expect(isBatchTitle('👉 ➜ 📥 Batch ┃ Feedback')).toBe(true)
  expect(isBatchTitle('⏳ ➜ 🤖 Solo ┃ Feedback')).toBe(false)
  expect(sessionsFrom('not json')).toEqual([])
})

test('home: tiles target the longest waiting, newest running and oldest finished session; archived ones count nowhere', () => {
  const m = homeModel(sessionsFrom(JSON.stringify(rows)), { 'P:/Projects/scc': 9, 'P:/Projects/dotclaude': 4 }, {})
  expect(m.waiting.map(s => s.id)).toEqual(['local_a', 'local_b'])
  expect(m.running[0]?.id).toBe('local_c')
  expect(m.done[0]?.id).toBe('local_d')
  expect(m.cleanup).toBe(13)
  expect(m.projects.map(p => [p.name, p.waiting, p.running, p.done, p.cleanup])).toEqual([
    ['scc', 1, 1, 1, 9],
    ['dotclaude', 1, 0, 0, 4],
  ])
})

test('home: "＋ Batch" comes back once the batch session is archived, gone or no longer a batch', () => {
  const list = sessionsFrom(JSON.stringify(rows))
  expect(homeModel(list, {}, { 'P:/Projects/dotclaude': 'local_a' }).projects.find(p => p.name === 'dotclaude')?.batch?.id).toBe('local_a')
  expect(homeModel(list, {}, { 'P:/Projects/scc': 'local_e' }).projects.find(p => p.name === 'scc')?.batch).toBe(null) // archived
  expect(homeModel(list, {}, { 'P:/Projects/scc': 'local_gone' }).projects.find(p => p.name === 'scc')?.batch).toBe(null) // deleted
  expect(homeModel(list, {}, { 'P:/Projects/scc': 'local_b' }).projects.find(p => p.name === 'scc')?.batch).toBe(null) // implemented: no batch title
})

test('home: budget rings carry the pace; past 85 % the batch start asks first', () => {
  const live = { weekly: { pct: 74, resetInMinutes: 1104 }, scoped: [{ name: 'Fable', pct: 47, resetInMinutes: 1104 }] }
  const rings = ringsFrom(live)
  expect(rings.map(r => [r.label, r.pct, r.elapsed])).toEqual([['Woche', 74, 89], ['Fable', 47, 89]])
  expect(paceWord(rings[0]!)).toBe('im Plan')
  expect(paceWord({ label: 'Woche', pct: 95, elapsed: 50 })).toBe('über Plan')
  expect(resetText(live)).toBe('Reset in 18 h')
  expect(needsConfirm(rings)).toBe(false)
  expect(needsConfirm([{ label: 'Woche', pct: 86, elapsed: 50 }])).toBe(true)
  const svg = ringSvgSource(rings[0]!, '#d29922')
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('<title>Woche: 74 % verbraucht, 89 % der Woche vorbei</title>')
  expect(svg).toContain('<line x1=')
})

test('home: cleanup counts per repo, age text', () => {
  expect(cleanupFrom({ repos: [{ path: 'P:/Projects/a', parked: [1, 2], atRisk: [1], remoteOnly: [], stashes: 1 }] })).toEqual({ 'P:/Projects/a': 4 })
  expect(cleanupFrom(null)).toEqual({})
  expect(agoText(12_000)).toBe('vor 12 s')
  expect(agoText(180_000)).toBe('vor 3 min')
})

test('home: without a token gain the headline gives way to measured facts', () => {
  const base = { overhead: null, api: null, ships: { branches7: 12, reused7: 2 }, version: '0.393.0', at: 0 }
  const gain = infoTiles({ ...base, benefit: { net7: 1_200_000, narrowed: 0, narrowedTokens: 0, since: 1 } } as never, 'de')
  expect(gain.noGain).toBe(false)
  expect(gain.tiles[0]?.key).toBe('info-head')
  const none = infoTiles({ ...base, benefit: { net7: -5000, narrowed: 0, narrowedTokens: 0, since: 1 } } as never, 'de')
  expect(none.noGain).toBe(true)
  expect(none.tiles.map(t => t.key)).toEqual(['info-shipped'])
  expect(infoTiles(null, 'de')).toEqual({ tiles: [], noGain: false })
})

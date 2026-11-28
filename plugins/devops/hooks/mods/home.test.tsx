// devops Home pane (concept docs/concepts/20261121-1400-devops-home): the pure model behind the pane.
import { expect, test } from 'claude-code/testing'

import { agoText, batchPrompt, bedFrom, bedText, cleanupFrom, prereqSummary, homeModel, infoTiles, isBatchTitle, kindOf, needsConfirm, paceWord, projectOf, ringSvgSource, ringsFrom, resetText, sessionsFrom } from './home'
import { apiCreditFrom, apiCreditLabel, barLabel, bedSvg, newestOf, offText, prereqWord, shareSvg, statTiles, styleFrom, styleLabel, tourDone, TOUR_STEPS } from './home'
import { browserNote, browsersFrom, prereqRows, THREAD_REQUEST_NOTE, threadCopyFrom, threadCopyNote, threadMeaning, threadProjectLabel, threadProjectName, threadsFrom, versionAtLeast, versionFrom } from './home'

const rows = [
  { sessionId: 'local_a', title: '👉 ➜ 📥 Batch ┃ Feedback', cwd: 'P:\\Projects\\dotclaude\\.claude\\worktrees\\x', isRunning: false, lastActivityAt: '2026-11-21T09:00:00Z' },
  { sessionId: 'local_b', title: '👉 ➜ ❓ Y', cwd: 'P:\\Projects\\scc', isRunning: false, lastActivityAt: '2026-11-21T11:00:00Z' },
  { sessionId: 'local_c', title: '⏳ ➜ 🚀 Z', cwd: 'P:\\Projects\\scc\\.claude\\worktrees\\y', isRunning: true, lastActivityAt: '2026-11-21T12:00:00Z' },
  { sessionId: 'local_d', title: '🟩 ➜ 🚀 Released ┃ W', cwd: 'P:\\Projects\\scc', isRunning: false, lastActivityAt: '2026-11-20T12:00:00Z' },
  { sessionId: 'local_e', title: '👉 ➜ ❓ old', cwd: 'P:\\Projects\\scc', isArchived: true, lastActivityAt: '2026-11-01T12:00:00Z' },
]

test('home: worktree folders map to their repo, the title glyph decides the state', () => {
  expect(projectOf('P:\\Projects\\dotclaude\\.claude\\worktrees\\x-1')).toBe('P:/Projects/dotclaude')
  expect(kindOf('👉 ➜ ❓ X')).toBe('waiting')
  expect(kindOf('⏳ ➜ 🤖 X')).toBe('running')
  expect(kindOf('🟩 ➜ 🚀 Released ┃ X')).toBe('done')
  expect(kindOf('Die data uploader logs')).toBe('other')
  expect(isBatchTitle('👉 ➜ 📥 Batch ┃ Feedback')).toBe(true)
  // title-scheme 3.0: the head names no "Batch" any more — the batch icon does.
  expect(isBatchTitle('👉 ➜ 📚 Feedback zu dotclaude')).toBe(true)
  expect(isBatchTitle('Batch dotclaude')).toBe(true)
  expect(isBatchTitle('🔗 👉 ➜ 📚 Feedback')).toBe(true)
  expect(isBatchTitle('🟩 ➜ 📦 📚 Doku überarbeiten')).toBe(false)
  expect(isBatchTitle('⏳ ➜ 🤖 Feedback')).toBe(false)
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
  // Claude starts the session on the person's Enter, so no id is stored: the live batch-titled session counts anyway.
  expect(homeModel(list, {}, {}).projects.find(p => p.name === 'dotclaude')?.batch?.id).toBe('local_a')
  expect(homeModel(list, {}, {}).projects.find(p => p.name === 'scc')?.batch).toBe(null)
})

test('home: "＋ Batch" puts a complete start request in the prompt box; the prerequisites fold into one line', () => {
  const t = batchPrompt({ name: 'jerry', path: 'P:/Projects/jerry' })
  expect(t).toMatch(/^📚 Neue Batch-Sitzung im Projekt „jerry“ starten\./)
  expect(t).toContain('initiation user_asked')
  expect(t).toContain('cwd `P:/Projects/jerry`')
  expect(t).toContain('prompt `/do-batch`')
  expect(t).toContain('„Started from the devops Home pane') // HOME_PANE_BACKGROUND: the plugin-scope hook lets it pass
  expect(prereqSummary(prereqRows('2.1.330'))).toBe('1 ✓ · 4 prüfen')
  expect(prereqSummary(prereqRows('2.1.1'))).toBe('1 ✗ · 4 prüfen')
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

test('home: the browser choice reads the script answer; the note says why the browser in effect is not the chosen one', () => {
  const options = [{ id: 'edge', label: 'Microsoft Edge' }, { id: 'in-app', label: 'In-App (Claude Desktop)' }]
  const b = browsersFrom(JSON.stringify({ effective: options[0], stored: 'auto', options }))
  expect(b).toEqual({ effective: options[0], stored: 'auto', options })
  expect(browserNote(b!)).toBe('')
  expect(browsersFrom('not json')).toBe(null)
  expect(browsersFrom(JSON.stringify({ effective: options[0], options: [] }))).toBe(null)
  expect(browserNote({ effective: options[1]!, stored: 'auto', options: [options[1]!] })).toBe('Kein Browser installiert – Seiten öffnen in der App.')
  expect(browserNote({ effective: { id: 'chrome', label: 'Google Chrome' }, stored: 'auto', options })).toBe('Edge ist nicht installiert.')
  expect(browserNote({ effective: options[0]!, stored: 'chrome', options })).toBe('Gewählt war „chrome“, ist aber nicht mehr installiert.')
  expect(browserNote({ effective: options[1]!, stored: 'in-app', options })).toBe('')
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

test('home: Thread-Ort data, labels and the project name fallback', () => {
  const list = {
    values: [{ id: 'local-first', label: 'Local first' }, { id: 'local-only', label: 'Local only' }, { id: 'cloud-first', label: 'Cloud first' }, { id: 'ask', label: 'Ask each time' }],
    global: 'local-first',
    projects: [
      { id: 'chan_0129rNu4z9cephHnRQU2Egyc', name: '', value: 'local-first', source: 'default' },
      { id: 'chan_short', name: ' Jerry ', value: 'ask', source: 'project' },
      { id: 'bad', value: 5 },
    ],
  }
  const s = threadsFrom(JSON.stringify(list))!
  expect(s.options.map(o => o.label)).toEqual(['Lokal zuerst', 'Nur lokal', 'Cloud zuerst', 'Jedes Mal fragen'])
  expect(s.projects).toHaveLength(2)
  expect(threadProjectName(s.projects[0])).toBe('chan_0129rN…Egyc')
  expect(threadProjectName(s.projects[1])).toBe('Jerry')
  expect(threadProjectLabel(s.projects[0])).toBe('wie global (Lokal zuerst)')
  expect(threadProjectLabel(s.projects[1])).toBe('Jedes Mal fragen')
  expect(threadsFrom('nope')).toBe(null)
  expect(threadsFrom(JSON.stringify({ ...list, values: [] }))).toBe(null)
  expect(threadsFrom(JSON.stringify({ ...list, projects: undefined }))!.projects).toEqual([])
  expect(threadMeaning('local-first')).toContain('auf diesem Computer')
  expect(THREAD_REQUEST_NOTE).toContain('kein erzwungener Schalter')
})

test('home: the copy button copies a block, and says to remove it for cloud-first', () => {
  const c = threadCopyFrom(JSON.stringify({ value: 'local-first', marker: 'm', block: 'text' }))!
  expect(c).toEqual({ kind: 'copy', text: 'text', value: 'local-first' })
  expect(threadCopyNote(c, true)).toContain('„Lokal zuerst“ kopiert')
  expect(threadCopyNote(c, false)).toBe('Kopieren fehlgeschlagen.')
  const r = threadCopyFrom(JSON.stringify({ value: 'cloud-first', marker: null, block: null }))!
  expect(r.kind).toBe('remove')
  expect(threadCopyNote(r, true)).toContain('Entferne den Block')
  expect(threadCopyFrom(JSON.stringify({ value: 'ask', block: null }))).toBe(null)
  expect(threadCopyFrom('x')).toBe(null)
})

test('home: prerequisites show only the Claude Code version as a real state', () => {
  expect(versionFrom('2.1.302 (Claude Code)')).toBe('2.1.302')
  expect(versionFrom('')).toBe('')
  expect(versionAtLeast('2.1.280', '2.1.280')).toBe(true)
  expect(versionAtLeast('2.1.279', '2.1.280')).toBe(false)
  expect(versionAtLeast('2.2.0', '2.1.280')).toBe(true)
  expect(versionAtLeast('1.9.999', '2.1.280')).toBe(false)
  const rows = prereqRows('2.1.302')
  expect(rows.map(r => r.key)).toEqual(['project', 'rc', 'awake', 'version', 'trusted'])
  expect(rows.filter(r => r.state === 'ok').map(r => r.key)).toEqual(['version'])
  expect(rows.filter(r => r.state === 'check')).toHaveLength(4)
  expect(prereqRows('2.1.100').find(r => r.key === 'version')!.state).toBe('bad')
  expect(prereqRows('').find(r => r.key === 'version')!.state).toBe('check')
  expect(rows.find(r => r.key === 'rc')!.text).toContain('Use this computer from your phone and claude.ai')
  expect(rows.find(r => r.key === 'project')!.text).toContain('„Dein Computer“')
})

test('home: the bedtime row shows only a watcher that is really armed', () => {
  const now = 1_000_000_000
  const waiting = { phase: 'waiting', updatedAt: now - 30_000, active: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: '' }], note: '', shutdownAt: 0 }
  const bed = bedFrom(waiting, now)
  expect(bed).toEqual({ phase: 'waiting', names: ['A', 'B', 'C'], more: 1, note: '', shutdownAt: 0 })
  expect(bedText(bed!, now)).toBe('🛏 PC fährt herunter, sobald fertig: A · B · C (+1)')
  expect(bedText(bedFrom({ ...waiting, active: [] }, now)!, now)).toBe('🛏 Keine Sitzung arbeitet mehr – PC fährt in wenigen Minuten herunter')
  expect(bedText(bedFrom({ ...waiting, phase: 'busy-job', note: 'ffmpeg.exe' }, now)!, now)).toBe('🛏 Wartet auf ffmpeg.exe')
  expect(bedText(bedFrom({ ...waiting, phase: 'person' }, now)!, now)).toContain('sobald du 5 min weg bist')
  expect(bedFrom({ ...waiting, active: [{ name: 'Ein sehr langer Sitzungstitel, der die Zeile sprengt' }] }, now)!.names).toEqual(['Ein sehr langer Sitzung…'])
  // a watcher that stopped updating its state, a final phase, a shutdown already past, no file
  expect(bedFrom({ ...waiting, updatedAt: now - 181_000 }, now)).toBe(null)
  expect(bedFrom({ ...waiting, phase: 'cancelled' }, now)).toBe(null)
  expect(bedFrom({ ...waiting, phase: 'expired' }, now)).toBe(null)
  expect(bedFrom({ phase: 'shutdown', shutdownAt: now - 1, active: [] }, now)).toBe(null)
  expect(bedFrom(null, now)).toBe(null)
  expect(bedText(bedFrom({ phase: 'shutdown', shutdownAt: now + 42_000, active: [] }, now)!, now)).toBe('🛏 PC fährt in 42 s herunter')
})

// Round 2 (concept 20261127-2035-devops-home-neu, mock r2d1).

test('home r2: the head says nothing while on; off names the level (C1)', () => {
  const on = { on: true, sessionOff: false, projectOff: false, globalOff: false }
  expect(offText(on, 'dotclaude')).toBe('')
  expect(offText({ ...on, on: false, projectOff: true }, 'dotclaude')).toBe('Aus · in dotclaude')
  expect(offText({ ...on, on: false, sessionOff: true, projectOff: true }, 'dotclaude')).toBe('Aus · diese Sitzung')
  expect(offText({ ...on, on: false, globalOff: true }, 'dotclaude')).toBe('Aus · überall')
  expect([barLabel('Wk'), barLabel('Fb'), barLabel('5h')]).toEqual(['Woche', 'Fable', '5 h'])
})

test('home r2: the bed is a stroked SVG, not the emoji; proportion bars split by share (C8, C15)', () => {
  const bed = bedSvg('#cfcfcf')
  expect(bed).toMatch(/^<svg /)
  expect(bed).toContain('stroke="#cfcfcf"')
  expect(bed).not.toContain('🛏')
  expect(shareSvg(1, 3, '#a', '#b', 100)).toContain('width="25"')
  expect(shareSvg(0, 0, '#a', '#b', 100)).not.toContain('fill="#a"')
})

test('home r2: Statistik draws only what InfoData measured (C15)', () => {
  const d = { benefit: { net7: 20_000, blocks7: 6, released7: 2, narrowed: 3, narrowedTokens: 9000, since: 1, last: null }, overhead: { ownTokens7: 4000, guardBlocks7: 0 }, api: null, ships: { branches7: 10, reused7: 4 }, version: '9.9.9', at: 1 }
  const { hero, tiles } = statTiles(d, 'de')
  expect(hero?.key).toBe('info-head')
  expect(hero?.share).toEqual({ a: 6, b: 2, aLabel: '6 gehalten', bLabel: '2 freigegeben' })
  expect(tiles.find(t => t.key === 'info-shipped')?.share).toMatchObject({ a: 4, b: 6 })
  expect(tiles.find(t => t.key === 'info-own')?.share).toMatchObject({ a: 20_000, b: 4000 })
  expect(statTiles({ ...d, benefit: { ...d.benefit, net7: 0 } }, 'de').hero).toBe(null)
  expect(statTiles(null, 'de')).toEqual({ hero: null, tiles: [] })
})

test('home r2: prerequisites as keywords, output style answer, tour marker, newest session per project (C12, C16, B1, D1, D2)', () => {
  const pre = prereqRows('2.1.302')
  expect(pre.map(r => prereqWord(r, '2.1.302'))).toEqual(['Projekt-Umgebung', 'Remote Control', 'Wach halten', 'Claude Code 2.1.302', 'Trusted devices aus'])
  expect(prereqWord(prereqRows('')[3]!, '')).toBe('Claude-Code-Version')
  expect(styleFrom('{"style":"Quiet"}')).toBe('Quiet')
  expect(styleFrom('{"style":"default"}')).toBe('default')
  expect(styleFrom('{"style":"Other"}')).toBe(null)
  expect(styleFrom('nope')).toBe(null)
  expect(styleLabel('default')).toBe('Standard')
  expect(tourDone({ done: true })).toBe(true)
  expect(tourDone(null)).toBe(false)
  expect(TOUR_STEPS.map(s => s.target)).toEqual(['head', 'power', 'chips', 'bed', 'batch'])
  const m = homeModel(sessionsFrom(JSON.stringify(rows)), {}, {})
  expect(newestOf(m.waiting, 'P:/Projects/scc')?.id).toBe('local_b')
  expect(newestOf(m.waiting, 'P:/Projects/none')).toBe(undefined)
})

test('home: the API-Guthaben row reads devops-config get output; unreadable stays null (default off is the config default)', () => {
  expect(apiCreditFrom('apiCredit.enabled = true  (global)
')).toBe(true)
  expect(apiCreditFrom('apiCredit.enabled = false  (default)
')).toBe(false)
  expect(apiCreditFrom('apiCredit.enabled = falsey')).toBe(null)
  expect(apiCreditFrom('')).toBe(null)
  expect(apiCreditLabel(true)).toBe('An')
  expect(apiCreditLabel(false)).toBe('Aus')
})

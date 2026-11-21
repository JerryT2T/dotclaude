/**
 * devops Home (concept docs/concepts/20261121-1400-devops-home): the pane the status element's "devops" opens.
 * The Desktop app's own New page runs no session, so no mod can draw there; this pane is the substitute.
 *
 * Übersicht: budget rings with a pace tick, four clickable state tiles (👉 opens the session waiting longest, ⏳ the
 * newest running one, 🟩 the oldest finished one, 🧹 starts a cleanup session), one row per project with its non-zero
 * state chips and "＋ Batch" (a new session in that project in collect mode; while that batch session is alive and
 * still a batch, the row links to it instead). Einstellungen: the devops switch for this session, the info card's
 * figures as tiles with an "i" toggle, measured facts in place of a token gain that is not there, the version.
 *
 * Pure helpers are exported for the tests; the engine side reaches the rest of the mod only through `HomeDeps`.
 */
import type { EngineInterface } from 'claude-code'

import type { InfoData } from '../../types/index'
import { infoHeadline, infoIsEmpty, infoRows } from './format'
import { homeDir } from './gate'
import type { InfoRow, Locale } from './format'

export const HOME_PANE = 'devops-home'
const STORE_BATCH = 'homeBatch'
const STALE_MS = 20_000
const WEEK_MIN = 7 * 24 * 60
const CONFIRM_PCT = 85

// ── pure ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type HomeSession = { id: string; title: string; project: string; link: string; running: boolean; archived: boolean; at: string }
export type HomeKind = 'waiting' | 'running' | 'done' | 'other'
export type HomeProject = { path: string; name: string; waiting: number; running: number; done: number; cleanup: number; batch: HomeSession | null; last: string }
export type HomeRing = { label: string; pct: number; elapsed: number | null }
export type HomeModel = {
  waiting: HomeSession[]
  running: HomeSession[]
  done: HomeSession[]
  cleanup: number
  projects: HomeProject[]
}

/** The repo root of a session folder: the part before `/.claude/worktrees/`. */
export function projectOf(cwd: string): string {
  const p = String(cwd || '').replace(/\\/g, '/').replace(/\/+$/, '')
  const i = p.indexOf('/.claude/worktrees/')
  return i >= 0 ? p.slice(0, i) : p
}

export function nameOf(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

/** The title scheme's state glyph comes first: 👉 / ❓ / 🟥 / 🔴 wait for the person, ⏳ runs, 🟩 is done. */
export function kindOf(title: string): HomeKind {
  const t = String(title || '').trim()
  if (/^(👉|❓|🟥|🔴)/u.test(t)) return 'waiting'
  if (/^⏳/u.test(t)) return 'running'
  if (/^🟩/u.test(t)) return 'done'
  return 'other'
}

/** A batch session stays a batch while its title still names the collect mode (the implement step renames it). */
export function isBatchTitle(title: string): boolean {
  return /\bBatch\b/u.test(String(title || ''))
}

export function sessionsFrom(text: string): HomeSession[] {
  let rows: unknown
  try {
    rows = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(rows)) return []
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(r => ({
      id: String(r.sessionId || ''),
      title: String(r.title || ''),
      project: projectOf(String(r.cwd || '')),
      link: String(r.link || ''),
      running: r.isRunning === true,
      archived: r.isArchived === true,
      at: String(r.lastActivityAt || ''),
    }))
    .filter(s => s.id)
}

/** Open branch-hygiene items per repo in orphan-report.json: parked, at risk, remote-only, stashes. */
export function cleanupFrom(report: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  const repos = report && typeof report === 'object' ? (report as { repos?: unknown }).repos : null
  if (!Array.isArray(repos)) return out
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0)
  for (const r of repos) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    out[projectOf(String(o.path || ''))] = len(o.parked) + len(o.atRisk) + len(o.remoteOnly) + (typeof o.stashes === 'number' ? o.stashes : 0)
  }
  return out
}

/** Week and the first scoped model from usage-live.json; `elapsed` = share of the week gone (the pace tick). */
export function ringsFrom(live: unknown): HomeRing[] {
  if (!live || typeof live !== 'object') return []
  const l = live as { weekly?: { pct?: unknown; resetInMinutes?: unknown }; scoped?: unknown }
  const elapsedOf = (m: unknown) => (typeof m === 'number' && m >= 0 && m <= WEEK_MIN ? Math.round(100 - (m / WEEK_MIN) * 100) : null)
  const rings: HomeRing[] = []
  if (typeof l.weekly?.pct === 'number') rings.push({ label: 'Woche', pct: l.weekly.pct, elapsed: elapsedOf(l.weekly.resetInMinutes) })
  const s = Array.isArray(l.scoped) ? (l.scoped[0] as { name?: unknown; pct?: unknown; resetInMinutes?: unknown } | undefined) : undefined
  if (s && typeof s.name === 'string' && typeof s.pct === 'number') rings.push({ label: s.name, pct: s.pct, elapsed: elapsedOf(s.resetInMinutes) })
  return rings
}

export function resetText(live: unknown): string {
  const m = live && typeof live === 'object' ? (live as { weekly?: { resetInMinutes?: unknown } }).weekly?.resetInMinutes : null
  if (typeof m !== 'number') return ''
  return m >= 120 ? `Reset in ${Math.round(m / 60)} h` : `Reset in ${Math.max(0, Math.round(m))} min`
}

/** The ring as SVG: the arc is the share used, the white tick the share of the week gone. */
export function ringSvgSource(r: HomeRing, color: string): string {
  const c = 2 * Math.PI * 26
  const pct = Math.max(0, Math.min(100, r.pct))
  let tick = ''
  if (r.elapsed !== null) {
    const a = (r.elapsed / 100) * 2 * Math.PI - Math.PI / 2
    const x = (rad: number) => (32 + rad * Math.cos(a)).toFixed(1)
    const y = (rad: number) => (32 + rad * Math.sin(a)).toFixed(1)
    tick = `<line x1="${x(21)}" y1="${y(21)}" x2="${x(31)}" y2="${y(31)}" stroke="#e8e6e3" stroke-width="2"/>`
  }
  const title = r.elapsed === null ? `${r.label}: ${pct} % verbraucht` : `${r.label}: ${pct} % verbraucht, ${r.elapsed} % der Woche vorbei`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><title>${title}</title>` +
    `<circle cx="32" cy="32" r="26" fill="none" stroke="#3a3a3a" stroke-width="7"/>` +
    `<circle cx="32" cy="32" r="26" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${((c * pct) / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/>` +
    tick +
    `<text x="32" y="36" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#e8e6e3">${pct}%</text></svg>`
  )
}

export function paceWord(r: HomeRing): string {
  if (r.elapsed === null) return ''
  return r.pct <= r.elapsed ? 'im Plan' : 'über Plan'
}

const byAtAsc = (a: HomeSession, b: HomeSession) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)

/**
 * The whole pane's model. `batches` maps a project to the batch session this pane started there; it counts only while
 * that session is listed, not archived and still titled a batch, so "＋ Batch" comes back once it was archived,
 * deleted or its notes went to implementation.
 */
export function homeModel(sessions: HomeSession[], cleanup: Record<string, number>, batches: Record<string, string>): HomeModel {
  const live = sessions.filter(s => !s.archived)
  const waiting = live.filter(s => kindOf(s.title) === 'waiting').sort(byAtAsc)
  const running = live.filter(s => kindOf(s.title) === 'running').sort(byAtAsc).reverse()
  const done = live.filter(s => kindOf(s.title) === 'done').sort(byAtAsc)
  const map = new Map<string, HomeProject>()
  for (const s of live) {
    if (!s.project) continue
    let p = map.get(s.project)
    if (!p) {
      p = { path: s.project, name: nameOf(s.project), waiting: 0, running: 0, done: 0, cleanup: cleanup[s.project] || 0, batch: null, last: '' }
      map.set(s.project, p)
    }
    const k = kindOf(s.title)
    if (k === 'waiting') p.waiting++
    else if (k === 'running') p.running++
    else if (k === 'done') p.done++
    if (s.at > p.last) p.last = s.at
  }
  for (const p of map.values()) {
    const id = batches[p.path]
    const s = id ? live.find(x => x.id === id) : undefined
    p.batch = s && isBatchTitle(s.title) ? s : null
  }
  const projects = [...map.values()].sort((a, b) => b.waiting - a.waiting || (b.last > a.last ? 1 : b.last < a.last ? -1 : 0))
  const total = Object.values(cleanup).reduce((n, v) => n + v, 0)
  return { waiting, running, done, cleanup: total, projects }
}

/** "＋ Batch" asks once before it spends budget past this mark. */
export function needsConfirm(rings: HomeRing[]): boolean {
  const week = rings.find(r => r.label === 'Woche')
  return !!week && week.pct >= CONFIRM_PCT
}

/** The info card's figures as tiles; no token gain → measured facts take the headline's place. */
export function infoTiles(d: InfoData | null, loc: Locale): { tiles: InfoRow[]; noGain: boolean } {
  if (!d || infoIsEmpty(d)) return { tiles: [], noGain: false }
  const noGain = !(d.benefit.net7 > 0)
  const rows = infoRows(d, loc)
  return { tiles: noGain ? rows : [infoHeadline(d, loc), ...rows], noGain }
}

export function agoText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `vor ${s} s` : `vor ${Math.round(s / 60)} min`
}

// ── engine ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the pane needs from the rest of the mod, resolved by index.tsx per call (no $ crosses a function value). */
export type HomeCtx = {
  loc: Locale
  /** devops on for this session (the band's popup switches the same). */
  isOn: boolean
  /** The repo root of this session: the cleanup session starts there. */
  root: string
  loadInfo: () => Promise<InfoData>
  switchDevops: (on: boolean) => Promise<void>
}

type Snap = { at: number; model: HomeModel; rings: HomeRing[]; reset: string; info: InfoData | null; error: string }

let snap: Snap | null = null
let loading = false
let tab: 'overview' | 'settings' = 'overview'
let openInfo = ''
let confirmFor = ''
const busy = new Map<string, 'starting' | 'started' | 'failed'>()
let paneOpen = false

async function readJson($: EngineInterface, path: string): Promise<unknown> {
  try {
    const t = await $.fs.read(path)
    return typeof t === 'string' ? JSON.parse(t) : null
  } catch {
    return null
  }
}

function textOf(res: { content: unknown[] }): string {
  return res.content.map(b => (b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text) : '')).join('')
}

async function batches($: EngineInterface): Promise<Record<string, string>> {
  try {
    const v = await $.store.get(STORE_BATCH)
    return v && typeof v === 'object' ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

async function load($: EngineInterface, ctx: HomeCtx): Promise<void> {
  const home = await homeDir($)
  let sessions: HomeSession[] = []
  let error = ''
  try {
    const res = await $.mcp.call('ccd_session_mgmt', 'list_sessions', { limit: 80 })
    if (res.isError) error = textOf(res).slice(0, 160) || 'list_sessions fehlgeschlagen'
    else sessions = sessionsFrom(textOf(res))
  } catch {
    error = 'Sitzungsliste nicht erreichbar (nur in der Desktop-App)'
  }
  const cleanup = home ? cleanupFrom(await readJson($, `${home}/.claude/orphan-report.json`)) : {}
  const live = home ? await readJson($, `${home}/.claude/usage-live.json`) : null
  const info = await ctx.loadInfo().catch(() => null)
  snap = { at: await $.clock.now(), model: homeModel(sessions, cleanup, await batches($)), rings: ringsFrom(live), reset: resetText(live), info, error }
}

export function refreshHome($: EngineInterface, ctx: HomeCtx, force = false): void {
  if (loading) return
  loading = true
  void (async () => {
    try {
      const now = await $.clock.now()
      if (force || !snap || now - snap.at >= STALE_MS) await load($, ctx)
    } catch {
      /* the last snapshot stands */
    } finally {
      loading = false
    }
    $.ui.invalidate('ui.render')
  })()
}

/** The status element's press: open the pane (fresh figures), or close it when it is open. */
export async function toggleHome($: EngineInterface, ctx: HomeCtx): Promise<boolean> {
  if (paneOpen) {
    paneOpen = false
    await $.ui.close({ id: HOME_PANE }).catch(() => undefined)
    return false
  }
  paneOpen = true
  await $.ui.open({ id: HOME_PANE, title: '🏠 devops Home', focus: true })
  refreshHome($, ctx, true)
  return true
}

/** A press answers inside its budget: the session call runs on, its outcome redraws the row. */
function startSession($: EngineInterface, ctx: HomeCtx, key: string, cwd: string, title: string, prompt: string, onStarted?: (id: string) => Promise<void>): void {
  busy.set(key, 'starting')
  $.ui.invalidate('ui.render')
  void (async () => {
    try {
      const res = await $.mcp.call('ccd_session', 'start_session', {
        initiation: 'user_asked',
        context: 'fresh',
        cwd,
        title,
        prompt,
        background: 'Started from the devops Home pane by the person pressing its button; no other context belongs to this session.',
      })
      if (res.isError) throw new Error(textOf(res).slice(0, 160))
      const id = (/\blocal_[0-9a-f-]{8,}/.exec(textOf(res)) || [''])[0]
      if (id && onStarted) await onStarted(id)
      busy.set(key, 'started')
      if (id) void $.mcp.call('ccd_window', 'open_session_in', { session_id: id, target: 'focus' }).catch(() => undefined)
    } catch (err) {
      busy.set(key, 'failed')
      $.ui.toast(`Start fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`, { timeoutMs: 8000 })
    }
    $.ui.invalidate('ui.render')
    try {
      $.clock.after(6000, () => {
        busy.delete(key)
        refreshHome($, ctx, true)
      })
    } catch {
      busy.delete(key)
    }
  })()
}

function pressBatch($: EngineInterface, ctx: HomeCtx, p: HomeProject): void {
  if (snap && needsConfirm(snap.rings) && confirmFor !== p.path) {
    confirmFor = p.path
    $.ui.invalidate('ui.render')
    return
  }
  confirmFor = ''
  startSession($, ctx, p.path, p.path, `Batch ┃ ${p.name}`, '/do-batch', async id => {
    const map = await batches($)
    map[p.path] = id
    await $.store.set(STORE_BATCH, map).catch(() => undefined)
  })
}

function pressCleanup($: EngineInterface, ctx: HomeCtx, cwd: string): void {
  startSession($, ctx, '__cleanup__', cwd, 'Branches aufräumen', 'Branches aufräumen')
}

const STATE_COLOR = { waiting: '#d29922', running: '#1f6feb', done: '#3fb950', cleanup: '#8b949e' } as const

/** The person closed the pane (its ✕): the next status press opens it again. */
export function homeClosed(): void {
  paneOpen = false
}

/** The pane's tree; index.tsx hooks `ui.render` for `{ component: 'Pane', requestId: HOME_PANE }` and calls this. */
export async function renderHome($: EngineInterface, e: any, ctx: HomeCtx): Promise<any> {
  {
    paneOpen = true
    const { Box, Button, Link, Svg, Text } = $.ui.resolve(e)
    refreshHome($, ctx)
    const loc = ctx.loc
    const now = await $.clock.now()
    const s = snap
    const cwd = projectOf(ctx.root)

    const tabs = (
      <Box key="home-top" flexDirection="row" alignItems="center" columnGap={1}>
        <Button key="home-tab-overview" variant={tab === 'overview' ? 'primary' : undefined} label="Übersicht" onPress={() => { tab = 'overview'; $.ui.invalidate('ui.render') }} />
        <Button key="home-tab-settings" variant={tab === 'settings' ? 'primary' : undefined} label="Einstellungen" onPress={() => { tab = 'settings'; $.ui.invalidate('ui.render') }} />
        <Box flexGrow={1} />
        {s && <Text key="home-age" dimColor>{agoText(now - s.at)}</Text>}
        <Button key="home-refresh" plain label="↻" onPress={() => refreshHome($, ctx, true)} />
      </Box>
    )
    if (!s) return <Box flexDirection="column" rowGap={1}>{tabs}<Text dimColor>Lädt …</Text></Box>

    if (tab === 'settings') {
      const isOn = ctx.isOn
      const { tiles, noGain } = infoTiles(s.info, loc)
      const facts = s.info ? infoRows(s.info, loc).filter(r => r.key !== 'info-own') : []
      const version = s.info ? s.info.version : ''
      return (
        <Box flexDirection="column" rowGap={1}>
          {tabs}
          <Box key="home-switch" flexDirection="row" alignItems="center" columnGap={1} borderStyle="round" paddingX={1}>
            <Text><Text bold>devops</Text> in dieser Sitzung</Text>
            <Box flexGrow={1} />
            <Button key="home-devops-switch" variant={isOn ? 'primary' : undefined} label={isOn ? '● an' : '○ aus'} onPress={() => ctx.switchDevops(!isOn)} />
          </Box>
          {noGain && (
            <Box key="home-quality" flexDirection="column" borderStyle="round" borderColor={STATE_COLOR.done} paddingX={1}>
              <Text bold color={STATE_COLOR.done}>✓ Nutzen diese Woche: Qualität statt Tokens</Text>
              {facts.length ? facts.map(f => <Text key={`q-${f.key}`} dimColor>{`${f.value} · ${f.label}`}</Text>) : <Text dimColor>Noch keine Messwerte für diese Woche.</Text>}
            </Box>
          )}
          {tiles.length === 0 && !noGain && <Text key="home-info-empty" dimColor>Noch keine devops-Messwerte.</Text>}
          {tiles.map(t => (
            <Box key={`tile-${t.key}`} flexDirection="column" borderStyle="round" paddingX={1}>
              <Box flexDirection="row" alignItems="center" columnGap={1}>
                <Text bold>{t.value}</Text>
                <Text>{t.label}</Text>
                <Box flexGrow={1} />
                <Button key={`i-${t.key}`} plain label={openInfo === t.key ? 'ⓘ' : 'i'} onPress={() => { openInfo = openInfo === t.key ? '' : t.key; $.ui.invalidate('ui.render') }} />
              </Box>
              {openInfo === t.key && <Text key={`note-${t.key}`} dimColor>{t.note}</Text>}
            </Box>
          ))}
          {version && <Text key="home-version" dimColor>{`Version ${version}`}</Text>}
        </Box>
      )
    }

    const m = s.model
    const tile = (key: string, n: number, label: string, color: string, target: HomeSession | undefined, action?: () => void) => (
      <Box key={key} flexDirection="column" flexGrow={1} borderStyle="round" borderColor={n ? color : undefined} paddingX={1}>
        <Text bold color={n ? color : undefined}>{String(n)}</Text>
        {target && target.link ? <Link key={`${key}-link`} href={target.link}>{label}</Link>
          : action && n ? <Button key={`${key}-btn`} plain label={label} onPress={action} />
          : <Text dimColor>{label}</Text>}
      </Box>
    )
    return (
      <Box flexDirection="column" rowGap={1}>
        {tabs}
        {s.error && <Text key="home-error" color="#f85149">{s.error}</Text>}
        {s.rings.length > 0 && (
          <Box key="home-rings" flexDirection="row" alignItems="center" columnGap={2}>
            {s.rings.map((r, i) => (
              <Box key={`ring-${r.label}`} flexDirection="row" alignItems="center" columnGap={1}>
                <Svg source={ringSvgSource(r, i === 0 ? STATE_COLOR.waiting : '#8957e5')} alt={`${r.label} ${r.pct} %`} width={56} height={56} isInteractive />
                <Box flexDirection="column">
                  <Text bold>{r.label}</Text>
                  <Text dimColor>{paceWord(r)}</Text>
                </Box>
              </Box>
            ))}
          </Box>
        )}
        {s.reset && <Text key="home-reset" dimColor>{`${s.reset} · Strich = verstrichene Woche`}</Text>}
        <Box key="home-tiles" flexDirection="row" columnGap={1}>
          {tile('t-wait', m.waiting.length, '👉 wartet', STATE_COLOR.waiting, m.waiting[0])}
          {tile('t-run', m.running.length, '⏳ läuft', STATE_COLOR.running, m.running[0])}
          {tile('t-done', m.done.length, '🟩 fertig', STATE_COLOR.done, m.done[0])}
          {tile('t-clean', m.cleanup, '🧹 aufräumen', STATE_COLOR.cleanup, undefined, () => pressCleanup($, ctx, cwd))}
        </Box>
        {m.waiting[0] && <Text key="home-oldest" dimColor>{`Am längsten offen: ${nameOf(m.waiting[0].project)} · ${m.waiting[0].title.replace(/^\S+\s+➜\s+/u, '')}`}</Text>}
        <Text key="home-projects-h" bold>Projekte</Text>
        {m.projects.length === 0 && <Text key="home-projects-empty" dimColor>Keine Sitzungen gefunden.</Text>}
        {m.projects.map(p => {
          const b = busy.get(p.path)
          const chips = [p.waiting ? `👉 ${p.waiting}` : '', p.running ? `⏳ ${p.running}` : '', p.done ? `🟩 ${p.done}` : '', p.cleanup ? `🧹 ${p.cleanup}` : ''].filter(Boolean).join('  ')
          return (
            <Box key={`p-${p.path}`} flexDirection="row" alignItems="center" columnGap={1}>
              <Text>{p.name}</Text>
              <Text dimColor>{chips}</Text>
              <Box flexGrow={1} />
              {b === 'starting' ? <Text key={`pb-${p.path}`} dimColor>⏳ startet …</Text>
                : b === 'started' ? <Text key={`pb-${p.path}`} color={STATE_COLOR.done}>✓ Batch gestartet</Text>
                : p.batch && p.batch.link ? <Link key={`pb-${p.path}`} href={p.batch.link}>→ Batch</Link>
                : <Button key={`pb-${p.path}`} variant="primary" label={confirmFor === p.path ? `Woche ${s.rings[0]?.pct ?? ''} % – trotzdem?` : '＋ Batch'} onPress={() => pressBatch($, ctx, p)} />}
            </Box>
          )
        })}
      </Box>
    )
  }
}

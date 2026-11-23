/**
 * devops Home (concept docs/concepts/20261121-1400-devops-home): the pane the status element's "devops" opens.
 * The Desktop app's own New page runs no session, so no mod can draw there; this pane is the substitute.
 *
 * Übersicht: budget rings with a pace tick, four clickable state tiles (👉 opens the session waiting longest, ⏳ the
 * newest running one, 🟩 the oldest finished one, 🧹 starts the branch cleanup run of the band), one row per project with its non-zero
 * state chips and "＋ Batch" (a new session in that project in collect mode; while that batch session is alive and
 * still a batch, the row links to it instead), and the bedtime row: "🛏 Ins Bett gehen" arms the shutdown watcher
 * (scripts/bedtime-shutdown.js — the PC powers off once no session works any more), shows whom it waits for and
 * cancels it. Einstellungen: the devops switch for this session, the info card's
 * figures as tiles with an "i" toggle, measured facts in place of a token gain that is not there, the version.
 * Einstellungen also holds the browser for pages devops opens: a dropdown of the installed ones plus In-App
 * (scripts/browser-choice.js), and, behind the `project-threads` channel feature, the row "Thread-Ort" (global value,
 * per-project exceptions, copy button for the text block; scripts/thread-location.js) with the prerequisites for a
 * thread on this computer (display only).
 *
 * Pure helpers are exported for the tests; the engine side reaches the rest of the mod only through `HomeDeps`.
 */
import type { EngineInterface } from 'claude-code'

import type { InfoData } from '../../types/index'
import { infoHeadline, infoIsEmpty, infoRows } from './format'
import { featureAllowed, homeDir } from './gate'
import type { InfoRow, Locale } from './format'

export const HOME_PANE = 'devops-home'
const STORE_BATCH = 'homeBatch'
const STALE_MS = 20_000
const WEEK_MIN = 7 * 24 * 60
const CONFIRM_PCT = 85
/** Twin of scripts/bedtime-shutdown.js STALE_MS: a waiting state not updated this long has no watcher behind it. */
const BED_STALE_MS = 3 * 60_000
const BED_NAMES = 3
const BED_NAME_MAX = 24

// ── pure ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type HomeSession = { id: string; title: string; project: string; link: string; running: boolean; archived: boolean; at: string }
export type HomeKind = 'waiting' | 'running' | 'done' | 'other'
export type HomeProject = { path: string; name: string; waiting: number; running: number; done: number; cleanup: number; batch: HomeSession | null; last: string }
export type HomeRing = { label: string; pct: number; elapsed: number | null }
/** The bedtime watcher as the pane shows it; `names` = the sessions it still waits for. */
export type HomeBed = { phase: 'waiting' | 'person' | 'busy-job' | 'shutdown'; names: string[]; more: number; note: string; shutdownAt: number }
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

/**
 * A batch session stays a batch while its title still names the collect mode (the implement step renames it):
 * the batch icon of its head (`👉 ➜ 📚 `, older 📥), or the word — the start title and the worded heads before 3.0.
 */
export function isBatchTitle(title: string): boolean {
  const t = String(title || '')
  // The icon counts only as the head's activity — a 📚 in the topic of another session is no batch.
  return /\bBatch\b/u.test(t) || /^(?:🔗\s*)?\S+\s*➜\s*(?:📚|📥)/u.test(t)
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

export type BrowserOption = { id: string; label: string }
export type BrowserState = { effective: BrowserOption; stored: string; options: BrowserOption[] }

/** `scripts/browser-choice.js list --json`: the browser in effect, the stored choice, installed browsers plus In-App. */
export function browsersFrom(text: string): BrowserState | null {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return null
  }
  const o = v && typeof v === 'object' ? (v as { effective?: unknown; stored?: unknown; options?: unknown }) : null
  const opt = (x: unknown): BrowserOption | null => {
    const r = x && typeof x === 'object' ? (x as { id?: unknown; label?: unknown }) : null
    return r && typeof r.id === 'string' && r.id && typeof r.label === 'string' ? { id: r.id, label: r.label || r.id } : null
  }
  const effective = o ? opt(o.effective) : null
  if (!o || !effective || !Array.isArray(o.options)) return null
  const options = o.options.map(opt).filter((x): x is BrowserOption => !!x)
  return options.length ? { effective, stored: typeof o.stored === 'string' ? o.stored : 'auto', options } : null
}

/** Why the browser in effect is not the stored choice; '' while it is (or nothing was chosen and Edge is there). */
export function browserNote(b: BrowserState): string {
  if (b.stored === b.effective.id) return ''
  if (b.stored === 'auto') return b.effective.id === 'edge' ? '' : b.effective.id === 'in-app' ? 'Kein Browser installiert – Seiten öffnen in der App.' : 'Edge ist nicht installiert.'
  return `Gewählt war „${b.stored}“, ist aber nicht mehr installiert.`
}

// Thread-Ort (scripts/thread-location.js): where Claude Project threads start.

export const INHERIT = 'inherit'
const THREAD_LABELS: Record<string, string> = { 'local-first': 'Lokal zuerst', 'local-only': 'Nur lokal', 'cloud-first': 'Cloud zuerst', ask: 'Jedes Mal fragen' }
const THREAD_MEANING: Record<string, string> = {
  'local-first': 'Threads starten auf diesem Computer. Die Cloud nur, wenn er nicht erreichbar ist.',
  'local-only': 'Threads starten nur auf diesem Computer. Ist er nicht erreichbar, startet nichts in der Cloud.',
  'cloud-first': 'Threads starten in der Cloud. Der Textblock gehört nicht in die Projektanweisungen.',
  ask: 'Der Koordinator fragt bei jedem neuen Thread, wo er laufen soll.',
}
export const THREAD_REQUEST_NOTE = 'Das ist eine Bitte an den Koordinator des Projekts (der Textblock in den Projektanweisungen), kein erzwungener Schalter. Allein die Einstellung ändert auf claude.ai nichts, solange der Block nicht in den Projektanweisungen steht.'

export type ThreadValueOption = { id: string; label: string }
export type ThreadProject = { id: string; name: string; value: string; source: 'project' | 'global' | 'default' }
export type ThreadState = { options: ThreadValueOption[]; global: string; projects: ThreadProject[] }

/** German label of a thread-location value; an unknown id is shown as it is. */
export function threadLabel(id: string): string {
  return THREAD_LABELS[id] || id
}

/** One plain sentence saying what a value means. */
export function threadMeaning(id: string): string {
  return THREAD_MEANING[id] || ''
}

/** `scripts/thread-location.js list|set --json` → the global value and the projects devops has seen. */
export function threadsFrom(text: string): ThreadState | null {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return null
  }
  const o = v && typeof v === 'object' ? (v as { values?: unknown; global?: unknown; projects?: unknown }) : null
  if (!o || typeof o.global !== 'string' || !o.global || !Array.isArray(o.values)) return null
  const options = o.values
    .map((x): ThreadValueOption | null => (x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string' && (x as { id: string }).id ? { id: (x as { id: string }).id, label: threadLabel((x as { id: string }).id) } : null))
    .filter((x): x is ThreadValueOption => !!x)
  if (!options.length) return null
  const projects = (Array.isArray(o.projects) ? o.projects : [])
    .map((x): ThreadProject | null => {
      const p = x && typeof x === 'object' ? (x as Record<string, unknown>) : null
      if (!p || typeof p.id !== 'string' || !p.id || typeof p.value !== 'string') return null
      const source = p.source === 'project' || p.source === 'global' ? p.source : 'default'
      return { id: p.id, name: typeof p.name === 'string' ? p.name : '', value: p.value, source }
    })
    .filter((x): x is ThreadProject => !!x)
  return { options, global: o.global, projects }
}

/** The project's name, or its id shortened so a line stays readable (`chan_0129rN…Egyc`). */
export function threadProjectName(p: { id: string; name: string }): string {
  if (p.name.trim()) return p.name.trim()
  return p.id.length > 16 ? `${p.id.slice(0, 11)}…${p.id.slice(-4)}` : p.id
}

/** What a project's dropdown shows: its own value, or that it follows the global one. */
export function threadProjectLabel(p: ThreadProject): string {
  return p.source === 'project' ? threadLabel(p.value) : `wie global (${threadLabel(p.value)})`
}

/** `scripts/thread-location.js block --json` → what the copy button does. */
export type ThreadCopy = { kind: 'copy'; text: string; value: string } | { kind: 'remove'; value: string }
export function threadCopyFrom(text: string): ThreadCopy | null {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return null
  }
  const o = v && typeof v === 'object' ? (v as { value?: unknown; block?: unknown }) : null
  if (!o || typeof o.value !== 'string') return null
  if (typeof o.block === 'string' && o.block.trim()) return { kind: 'copy', text: o.block, value: o.value }
  return o.value === 'cloud-first' ? { kind: 'remove', value: o.value } : null
}

/** The toast after the copy button ran. */
export function threadCopyNote(c: ThreadCopy, copied: boolean): string {
  if (c.kind === 'remove') return 'Cloud zuerst hat keinen Textblock. Entferne den Block „Where threads run“ aus den Projektanweisungen.'
  return copied ? `Textblock „${threadLabel(c.value)}“ kopiert. Füge ihn in die Projektanweisungen ein.` : 'Kopieren fehlgeschlagen.'
}

/** First `major.minor.patch` in `claude --version` output, or ''. */
export function versionFrom(text: string): string {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(text)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : ''
}

export function versionAtLeast(v: string, min: string): boolean {
  const a = v.split('.').map(Number)
  const b = min.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return true
}

export const MIN_CLAUDE_CODE = '2.1.280'

/**
 * The five prerequisites for a thread on this computer. Only the Claude Code version can be read honestly (the
 * command line's `claude --version`); the Desktop app keeps no setting for the rest that is readable without
 * guessing its meaning, so those are checks the user does. devops changes none of them.
 */
export type Prereq = { key: string; state: 'ok' | 'bad' | 'check'; text: string }
export function prereqRows(version: string): Prereq[] {
  const code: Prereq = !version
    ? { key: 'version', state: 'check', text: `Claude Code ab Version ${MIN_CLAUDE_CODE} auf diesem Computer (die Version war nicht lesbar).` }
    : versionAtLeast(version, MIN_CLAUDE_CODE)
      ? { key: 'version', state: 'ok', text: `Claude Code ${version} (Befehl claude), nötig ist ab ${MIN_CLAUDE_CODE}.` }
      : { key: 'version', state: 'bad', text: `Claude Code ${version} (Befehl claude) ist zu alt, nötig ist ab ${MIN_CLAUDE_CODE}.` }
  return [
    { key: 'project', state: 'check', text: 'Im Claude-Projekt „Dein Computer“ auf An, mit einem Standardordner (Projekteinstellungen, Umgebung).' },
    { key: 'rc', state: 'check', text: 'Remote Control für diesen Computer an: in den Einstellungen der Desktop-App unter Code der Schalter „Use this computer from your phone and claude.ai“, der Ordner steht in der Liste darunter.' },
    { key: 'awake', state: 'check', text: 'Computer wach halten: in denselben Einstellungen der Schalter „Keep this computer awake for Remote Control“.' },
    code,
    { key: 'trusted', state: 'check', text: 'In den Kontoeinstellungen „Require trusted devices“ aus. Ist es an, kann ein Projekt keinen Thread auf diesem Computer ausführen.' },
  ]
}

/**
 * `~/.claude/bedtime-shutdown.json` → what is armed right now, or null: a final phase (cancelled, expired, failed),
 * a waiting state whose watcher stopped updating it, and a shutdown whose time has passed all show the button again.
 */
export function bedFrom(state: unknown, now: number): HomeBed | null {
  if (!state || typeof state !== 'object') return null
  const o = state as Record<string, unknown>
  const phase = o.phase
  const shutdownAt = typeof o.shutdownAt === 'number' ? o.shutdownAt : 0
  if (phase === 'shutdown') {
    if (shutdownAt <= now) return null
  } else if (phase === 'waiting' || phase === 'person' || phase === 'busy-job') {
    if (typeof o.updatedAt !== 'number' || now - o.updatedAt > BED_STALE_MS) return null
  } else return null
  const all = (Array.isArray(o.active) ? o.active : [])
    .map(a => (a && typeof a === 'object' ? String((a as { name?: unknown }).name || '').trim() : ''))
    .filter(Boolean)
    // R8: three full titles would push the row's button out of a narrow pane.
    .map(n => (n.length > BED_NAME_MAX ? `${n.slice(0, BED_NAME_MAX - 1)}…` : n))
  return { phase, names: all.slice(0, BED_NAMES), more: Math.max(0, all.length - BED_NAMES), note: typeof o.note === 'string' ? o.note : '', shutdownAt }
}

export function bedText(b: HomeBed, now: number): string {
  if (b.phase === 'shutdown') return `🛏 PC fährt in ${Math.max(0, Math.round((b.shutdownAt - now) / 1000))} s herunter`
  if (b.phase === 'person') return '🛏 Alles fertig – PC fährt herunter, sobald du 5 min weg bist'
  if (b.phase === 'busy-job') return `🛏 Wartet auf ${b.note || 'einen laufenden Job'}`
  if (!b.names.length) return '🛏 Keine Sitzung arbeitet mehr – PC fährt in wenigen Minuten herunter'
  return `🛏 PC fährt herunter, sobald fertig: ${b.names.join(' · ')}${b.more ? ` (+${b.more})` : ''}`
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
  /**
   * The branch cleanup of this repo: the same run as the band's 🧹 button (an Opus subagent plans, the band shows the
   * plan with Apply). No session start: docs/dev/mods.md § Branch cleanup button, no mod API starts a session reliably.
   */
  startCleanup: () => Promise<void>
}

type Snap = { at: number; model: HomeModel; rings: HomeRing[]; reset: string; info: InfoData | null; error: string; bed: HomeBed | null }

let snap: Snap | null = null
let loading = false
let tab: 'overview' | 'settings' = 'overview'
let openInfo = ''
let confirmFor = ''
const CLEANUP_KEY = '__cleanup__'
const busy = new Map<string, 'starting' | 'started' | 'failed'>()
let paneOpen = false
let browsers: BrowserState | null = null
let browsersAt = 0
let browsersLoading = false
let browserOpen = false
let browserSaving = ''
const BROWSER_TIMEOUT_MS = 8000
const BROWSER_FRESH_MS = 300_000
let threads: ThreadState | null = null
let threadsAt = 0
let threadsLoading = false
let threadsVersion = ''
let threadsOpen = '' // '' | 'global' | a project id: the dropdown that is open
let threadsSaving = ''
let threadsGate: Promise<boolean> | null = null
let bedConfirm = false
let bedBusy = false

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
  const at = await $.clock.now()
  const bed = bedFrom(home ? await readJson($, `${home}/.claude/bedtime-shutdown.json`) : null, at)
  snap = { at, model: homeModel(sessions, cleanup, await batches($)), rings: ringsFrom(live), reset: resetText(live), info, error, bed }
}

/** Installed browsers and the choice, from the plugin's own script (the engine has no way to look for executables). */
async function browserScript($: EngineInterface, args: string[]): Promise<BrowserState | null> {
  try {
    const r = await $.process.run(['node', `${$.plugin.root}/scripts/browser-choice.js`, ...args, '--json'], { timeoutMs: BROWSER_TIMEOUT_MS })
    return r.exitCode === 0 ? browsersFrom(String(r.stdout || '')) : null
  } catch {
    return null
  }
}

/** The Einstellungen tab is the only reader: a good answer holds 5 min, a failed one is retried after 20 s, ↻ asks now. */
function loadBrowsers($: EngineInterface, now: number, force = false): void {
  if (browsersLoading || (!force && browsersAt && now - browsersAt < (browsers ? BROWSER_FRESH_MS : STALE_MS))) return
  browsersLoading = true
  browsersAt = now || 1
  void (async () => {
    const b = await browserScript($, ['list'])
    if (b) browsers = b
    browsersLoading = false
    $.ui.invalidate('ui.render')
  })()
}

/** A press answers inside its budget: the write runs on, its outcome redraws the row. */
function pickBrowser($: EngineInterface, id: string): void {
  browserOpen = false
  if (!browsers || browserSaving || id === browsers.stored) {
    $.ui.invalidate('ui.render')
    return
  }
  browserSaving = id
  $.ui.invalidate('ui.render')
  void (async () => {
    const b = await browserScript($, ['set', id])
    if (b) browsers = b
    else $.ui.toast('Browser konnte nicht gespeichert werden.', { timeoutMs: 8000 })
    browserSaving = ''
    $.ui.invalidate('ui.render')
  })()
}

/** The `project-threads` channel feature: the Thread-Ort row exists only where it is offered (asked once). */
function threadsOn($: EngineInterface): Promise<boolean> {
  if (!threadsGate) threadsGate = featureAllowed($, 'project-threads').catch(() => false)
  return threadsGate
}

async function threadScript($: EngineInterface, args: string[]): Promise<string | null> {
  try {
    const r = await $.process.run(['node', `${$.plugin.root}/scripts/thread-location.js`, ...args, '--json'], { timeoutMs: BROWSER_TIMEOUT_MS })
    return r.exitCode === 0 ? String(r.stdout || '') : null
  } catch {
    return null
  }
}

/** Same cache as the browser: a good answer holds 5 min, a failed one is retried after 20 s, ↻ asks now. */
function loadThreads($: EngineInterface, now: number, force = false): void {
  if (threadsLoading || (!force && threadsAt && now - threadsAt < (threads ? BROWSER_FRESH_MS : STALE_MS))) return
  threadsLoading = true
  threadsAt = now || 1
  void (async () => {
    const t = await threadScript($, ['list'])
    const s = t === null ? null : threadsFrom(t)
    if (s) threads = s
    try {
      const r = await $.process.run(['claude', '--version'], { timeoutMs: BROWSER_TIMEOUT_MS })
      threadsVersion = r.exitCode === 0 ? versionFrom(String(r.stdout || '')) : ''
    } catch {
      threadsVersion = ''
    }
    threadsLoading = false
    $.ui.invalidate('ui.render')
  })()
}

/** `value` is a global value, or for a project a value or `inherit`. */
function pickThread($: EngineInterface, value: string, project?: string): void {
  threadsOpen = ''
  const cur = threads ? (project ? threads.projects.find(p => p.id === project) : null) : null
  const same = project ? !!cur && (value === INHERIT ? cur.source !== 'project' : cur.source === 'project' && cur.value === value) : !!threads && threads.global === value
  if (!threads || threadsSaving || same) {
    $.ui.invalidate('ui.render')
    return
  }
  threadsSaving = project || 'global'
  $.ui.invalidate('ui.render')
  void (async () => {
    const t = await threadScript($, project ? ['set', value, '--project', project] : ['set', value])
    const s = t === null ? null : threadsFrom(t)
    if (s) threads = s
    else $.ui.toast('Thread-Ort konnte nicht gespeichert werden.', { timeoutMs: 8000 })
    threadsSaving = ''
    $.ui.invalidate('ui.render')
  })()
}

/**
 * The engine typings offer no clipboard call, so the platform's own command gets the text on stdin: Windows `clip`,
 * macOS `pbcopy`, Linux `wl-copy`, then `xclip`. First one that exits 0 wins.
 */
async function copyText($: EngineInterface, text: string): Promise<boolean> {
  let win = false
  try {
    win = (await $.env.get('OS')) === 'Windows_NT'
  } catch {
    win = false
  }
  const cmds = win ? [['clip']] : [['pbcopy'], ['wl-copy'], ['xclip', '-selection', 'clipboard']]
  for (const cmd of cmds) {
    try {
      const r = await $.process.run(cmd, { stdin: text, timeoutMs: BROWSER_TIMEOUT_MS })
      if (r.exitCode === 0) return true
    } catch {
      // command not there: try the next one
    }
  }
  return false
}

/** The copy button: the block for the value in effect (global, or a project with its own exception). */
function copyThreadBlock($: EngineInterface, project?: string): void {
  void (async () => {
    const t = await threadScript($, project ? ['block', '--project', project] : ['block'])
    const c = t === null ? null : threadCopyFrom(t)
    if (!c) {
      $.ui.toast('Textblock konnte nicht gelesen werden.', { timeoutMs: 8000 })
      return
    }
    const ok = c.kind === 'copy' ? await copyText($, c.text) : false
    $.ui.toast(threadCopyNote(c, ok), { timeoutMs: 8000 })
  })()
}

/**
 * Loads a fresh snapshot when it is due and redraws ONLY then. The pane's own draw calls this, so a redraw on every
 * call was a render loop: draw → refresh → invalidate → draw …, dozens of times a second, which reset every hover
 * state and made the pane flicker under the pointer. A fresh snapshot is all that warrants a redraw here.
 */
export function refreshHome($: EngineInterface, ctx: HomeCtx, force = false): void {
  if (loading) return
  loading = true
  void (async () => {
    let loaded = false
    try {
      const now = await $.clock.now()
      if (force || !snap || now - snap.at >= STALE_MS) {
        loaded = true
        await load($, ctx)
      }
    } catch {
      /* the last snapshot stands */
    } finally {
      loading = false
    }
    if (loaded) $.ui.invalidate('ui.render')
  })()
}

let tickArmed = false

/** While the pane is open, one timer at a time brings the figures (and the "vor … s") up to date every STALE_MS. */
function armTick($: EngineInterface, ctx: HomeCtx): void {
  if (tickArmed || !paneOpen) return
  tickArmed = true
  try {
    $.clock.after(STALE_MS, () => {
      tickArmed = false
      if (paneOpen) refreshHome($, ctx)
    })
  } catch {
    tickArmed = false
  }
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
      const args = {
        context: 'fresh',
        cwd,
        title,
        prompt,
        // Opening is HOME_PANE_BACKGROUND (hooks/lib/home-pane.js): the start hooks treat it as the person's own press.
        background: 'Started from the devops Home pane by the person pressing its button; no other context belongs to this session.',
      }
      // `user_asked` waits on the app's approval card, which a mod call outside any turn may not get: a refusal (an
      // isError answer or a denied call) is retried once as a proposal (`own_initiative`), a start card in the chat.
      const call = async (initiation: string): Promise<{ ok: boolean; text: string }> => {
        try {
          const r = await $.mcp.call('ccd_session', 'start_session', { initiation, ...args })
          return { ok: !r.isError, text: textOf(r) }
        } catch (err) {
          return { ok: false, text: err instanceof Error ? err.message : String(err) }
        }
      }
      let res = await call('user_asked')
      if (!res.ok) {
        const first = res.text.slice(0, 120) || 'abgelehnt'
        res = await call('own_initiative')
        if (!res.ok) throw new Error(`${first} / ${res.text.slice(0, 120) || 'abgelehnt'}`)
        if (!/\blocal_[0-9a-f-]{8,}/.test(res.text)) $.ui.toast('Start-Karte im Chat – ein Klick darauf startet die Sitzung', { timeoutMs: 8000 })
      }
      const id = (/\blocal_[0-9a-f-]{8,}/.exec(res.text) || [''])[0]
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
  startSession($, ctx, p.path, p.path, `Batch ${p.name}`, '/do-batch', async id => {
    const map = await batches($)
    map[p.path] = id
    await $.store.set(STORE_BATCH, map).catch(() => undefined)
  })
}

function pressCleanup($: EngineInterface, ctx: HomeCtx): void {
  if (busy.get(CLEANUP_KEY) === 'starting') return
  busy.set(CLEANUP_KEY, 'starting')
  $.ui.invalidate('ui.render')
  void (async () => {
    try {
      await ctx.startCleanup()
      busy.set(CLEANUP_KEY, 'started')
      $.ui.toast('🧹 Aufräumen gestartet – Plan und Fortschritt stehen über der Eingabe', { timeoutMs: 6000 })
    } catch (err) {
      busy.set(CLEANUP_KEY, 'failed')
      $.ui.toast(`🧹 Aufräumen fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`, { timeoutMs: 8000 })
    }
    $.ui.invalidate('ui.render')
    try {
      $.clock.after(6000, () => {
        busy.delete(CLEANUP_KEY)
        $.ui.invalidate('ui.render')
      })
    } catch {
      busy.delete(CLEANUP_KEY)
    }
  })()
}

/**
 * A state tile: bring that session to the front through the app's own window tool. The session's `link` as an
 * anchor hands the click to the OS instead of the app, so the press goes through the app's own tool.
 */
function pressOpen($: EngineInterface, s: HomeSession): void {
  void (async () => {
    try {
      const res = await $.mcp.call('ccd_window', 'open_session_in', { session_id: s.id, target: 'focus' })
      if (res.isError) throw new Error(textOf(res).slice(0, 160))
    } catch (err) {
      $.ui.toast(`Sitzung „${s.title.replace(/^\S+\s+➜\s+/u, '').slice(0, 40)}“ lässt sich nicht öffnen: ${err instanceof Error ? err.message : 'unbekannt'}`, { timeoutMs: 8000 })
    }
  })()
}

/**
 * The bedtime row. Arming asks once (it ends in a power-off), then starts the detached watcher; the same script
 * cancels it, a shutdown already counting down included. The watcher's own first look fills the row at once.
 */
function pressBed($: EngineInterface, ctx: HomeCtx, cmd: 'start' | 'cancel'): void {
  if (bedBusy) return
  if (cmd === 'start' && !bedConfirm) {
    bedConfirm = true
    $.ui.invalidate('ui.render')
    try {
      $.clock.after(8000, () => {
        bedConfirm = false
        $.ui.invalidate('ui.render')
      })
    } catch {
      /* the next press answers it */
    }
    return
  }
  bedConfirm = false
  bedBusy = true
  $.ui.invalidate('ui.render')
  void (async () => {
    try {
      const r = await $.process.run(['node', `${$.plugin.root}/scripts/bedtime-shutdown.js`, cmd], { timeoutMs: 20_000 })
      const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || ''
      const j = JSON.parse(line) as { ok?: unknown; skipped?: unknown; error?: unknown }
      if (j.ok !== true) throw new Error(j.skipped === true ? 'nur unter Windows' : typeof j.error === 'string' ? j.error.slice(0, 120) : 'unbekannt')
      if (snap) snap = { ...snap, bed: cmd === 'start' ? bedFrom(j, await $.clock.now()) : null }
      if (cmd === 'cancel') $.ui.toast('🛏 Abgebrochen – der PC bleibt an', { timeoutMs: 5000 })
    } catch (err) {
      $.ui.toast(`🛏 ${cmd === 'start' ? 'Start' : 'Abbrechen'} fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`, { timeoutMs: 8000 })
    }
    bedBusy = false
    $.ui.invalidate('ui.render')
  })()
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
    const { Box, Button, Svg, Text } = $.ui.resolve(e)
    refreshHome($, ctx)
    armTick($, ctx)
    const loc = ctx.loc
    const now = await $.clock.now()
    const s = snap

    const tabs = (
      <Box key="home-top" flexDirection="row" alignItems="center" columnGap={1}>
        <Button key="home-tab-overview" variant={tab === 'overview' ? 'primary' : undefined} label="Übersicht" onPress={() => { tab = 'overview'; $.ui.invalidate('ui.render') }} />
        <Button key="home-tab-settings" variant={tab === 'settings' ? 'primary' : undefined} label="Einstellungen" onPress={() => { tab = 'settings'; $.ui.invalidate('ui.render') }} />
        <Box flexGrow={1} />
        {s && <Text key="home-age" dimColor>{agoText(now - s.at)}</Text>}
        <Button key="home-refresh" plain label="↻" onPress={() => { if (tab === 'settings') { loadBrowsers($, now, true); void threadsOn($).then(on => { if (on) loadThreads($, now, true) }) } refreshHome($, ctx, true) }} />
      </Box>
    )
    if (!s) return <Box flexDirection="column" rowGap={1}>{tabs}<Text dimColor>Lädt …</Text></Box>

    if (tab === 'settings') {
      const isOn = ctx.isOn
      const { tiles, noGain } = infoTiles(s.info, loc)
      const facts = s.info ? infoRows(s.info, loc).filter(r => r.key !== 'info-own') : []
      const version = s.info ? s.info.version : ''
      loadBrowsers($, now)
      const br = browsers
      const note = br ? browserNote(br) : ''
      const threadsShown = await threadsOn($)
      if (threadsShown) loadThreads($, now)
      const th = threadsShown ? threads : null
      return (
        <Box flexDirection="column" rowGap={1}>
          {tabs}
          <Box key="home-switch" flexDirection="row" alignItems="center" columnGap={1} borderStyle="round" paddingX={1}>
            <Text><Text bold>devops</Text> in dieser Sitzung</Text>
            <Box flexGrow={1} />
            <Button key="home-devops-switch" variant={isOn ? 'primary' : undefined} label={isOn ? '● an' : '○ aus'} onPress={() => ctx.switchDevops(!isOn)} />
          </Box>
          {br && (
            <Box key="home-browser" flexDirection="column" borderStyle="round" paddingX={1}>
              <Box flexDirection="row" alignItems="center" columnGap={1}>
                <Text><Text bold>Browser</Text> für Seiten, die devops öffnet</Text>
                <Box flexGrow={1} />
                <Button key="home-browser-toggle" label={browserSaving ? '⏳ speichert …' : `${br.effective.label} ${browserOpen ? '▴' : '▾'}`} onPress={() => { browserOpen = !browserOpen; $.ui.invalidate('ui.render') }} />
              </Box>
              {browserOpen && br.options.map(o => (
                <Button key={`home-browser-${o.id}`} plain label={`${o.id === br.effective.id ? '●' : '○'} ${o.label}`} onPress={() => pickBrowser($, o.id)} />
              ))}
              {note && <Text key="home-browser-note" dimColor>{note}</Text>}
            </Box>
          )}
          {threadsShown && !th && <Text key="home-threads-loading" dimColor>Thread-Ort lädt …</Text>}
          {th && (
            <Box key="home-threads" flexDirection="column" borderStyle="round" paddingX={1}>
              <Box flexDirection="row" alignItems="center" columnGap={1}>
                <Text><Text bold>Thread-Ort</Text> für Claude-Projekte (global)</Text>
                <Box flexGrow={1} />
                <Button key="home-threads-copy" plain label="Textblock kopieren" onPress={() => copyThreadBlock($)} />
                <Button key="home-threads-toggle" label={threadsSaving === 'global' ? '⏳ speichert …' : `${threadLabel(th.global)} ${threadsOpen === 'global' ? '▴' : '▾'}`} onPress={() => { threadsOpen = threadsOpen === 'global' ? '' : 'global'; $.ui.invalidate('ui.render') }} />
              </Box>
              {threadsOpen === 'global' && th.options.map(o => (
                <Button key={`home-threads-${o.id}`} plain label={`${o.id === th.global ? '●' : '○'} ${o.label}`} onPress={() => pickThread($, o.id)} />
              ))}
              <Text key="home-threads-meaning" dimColor>{threadMeaning(th.global)}</Text>
              <Text key="home-threads-request" dimColor>{THREAD_REQUEST_NOTE}</Text>
              <Text bold>Ausnahmen pro Projekt</Text>
              {th.projects.length === 0 && <Text key="home-threads-none" dimColor>Noch kein Projekt gesehen. Sobald ein Thread in einem Claude-Projekt läuft, erscheint es hier.</Text>}
              {th.projects.map(p => (
                <Box key={`home-threads-p-${p.id}`} flexDirection="column">
                  <Box flexDirection="row" alignItems="center" columnGap={1}>
                    <Text>{threadProjectName(p)}</Text>
                    <Box flexGrow={1} />
                    {p.source === 'project' && <Button key={`home-threads-copy-${p.id}`} plain label="Textblock kopieren" onPress={() => copyThreadBlock($, p.id)} />}
                    <Button key={`home-threads-toggle-${p.id}`} label={threadsSaving === p.id ? '⏳ speichert …' : `${threadProjectLabel(p)} ${threadsOpen === p.id ? '▴' : '▾'}`} onPress={() => { threadsOpen = threadsOpen === p.id ? '' : p.id; $.ui.invalidate('ui.render') }} />
                  </Box>
                  {threadsOpen === p.id && (
                    <Button key={`home-threads-${p.id}-${INHERIT}`} plain label={`${p.source !== 'project' ? '●' : '○'} wie global`} onPress={() => pickThread($, INHERIT, p.id)} />
                  )}
                  {threadsOpen === p.id && th.options.map(o => (
                    <Button key={`home-threads-${p.id}-${o.id}`} plain label={`${p.source === 'project' && p.value === o.id ? '●' : '○'} ${o.label}`} onPress={() => pickThread($, o.id, p.id)} />
                  ))}
                </Box>
              ))}
              <Text bold>Voraussetzungen (devops ändert nichts davon)</Text>
              {prereqRows(threadsVersion).map(r => (
                <Text key={`home-prereq-${r.key}`} dimColor={r.state === 'check'} color={r.state === 'bad' ? STATE_COLOR.waiting : undefined}>{`${r.state === 'ok' ? '✓' : r.state === 'bad' ? '✗' : '–'} ${r.state === 'check' ? 'Prüfen: ' : ''}${r.text}`}</Text>
              ))}
            </Box>
          )}
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
    const cleanBusy = busy.get(CLEANUP_KEY)
    const tile = (key: string, n: number, label: string, color: string, action?: () => void) => (
      <Box key={key} flexDirection="column" flexGrow={1} borderStyle="round" borderColor={n ? color : undefined} paddingX={1}>
        <Text bold color={n ? color : undefined}>{String(n)}</Text>
        {action && n ? <Button key={`${key}-btn`} plain label={label} onPress={action} /> : <Text dimColor>{label}</Text>}
      </Box>
    )
    const opener = (target: HomeSession | undefined) => (target ? () => pressOpen($, target) : undefined)
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
          {tile('t-wait', m.waiting.length, '👉 wartet', STATE_COLOR.waiting, opener(m.waiting[0]))}
          {tile('t-run', m.running.length, '⏳ läuft', STATE_COLOR.running, opener(m.running[0]))}
          {tile('t-done', m.done.length, '🟩 fertig', STATE_COLOR.done, opener(m.done[0]))}
          {tile('t-clean', m.cleanup, cleanBusy === 'starting' ? '🧹 startet …' : cleanBusy === 'started' ? '🧹 Plan läuft' : '🧹 aufräumen', STATE_COLOR.cleanup, () => pressCleanup($, ctx))}
        </Box>
        {m.waiting[0] && <Text key="home-oldest" dimColor>{`Am längsten offen: ${nameOf(m.waiting[0].project)} · ${m.waiting[0].title.replace(/^\S+\s+➜\s+/u, '')}`}</Text>}
        <Box key="home-bed" flexDirection="row" alignItems="center" columnGap={1}>
          {s.bed ? <Text key="home-bed-text" color={STATE_COLOR.waiting}>{bedText(s.bed, now)}</Text>
            : <Text key="home-bed-text" dimColor>PC ausschalten, sobald keine Sitzung mehr arbeitet</Text>}
          <Box flexGrow={1} />
          {bedBusy ? <Text key="home-bed-btn" dimColor>⏳ …</Text>
            : s.bed ? <Button key="home-bed-btn" label="Abbrechen" onPress={() => pressBed($, ctx, 'cancel')} />
            : <Button key="home-bed-btn" variant={bedConfirm ? 'primary' : undefined} label={bedConfirm ? 'Sicher? PC fährt dann herunter' : '🛏 Ins Bett gehen'} onPress={() => pressBed($, ctx, 'start')} />}
        </Box>
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
                : p.batch ? <Button key={`pb-${p.path}`} plain label="→ Batch" onPress={() => pressOpen($, p.batch as HomeSession)} />
                : <Button key={`pb-${p.path}`} variant="primary" label={confirmFor === p.path ? `Woche ${s.rings[0]?.pct ?? ''} % – trotzdem?` : '＋ Batch'} onPress={() => pressBatch($, ctx, p)} />}
            </Box>
          )
        })}
      </Box>
    )
  }
}

/**
 * devops Home (concept docs/concepts/20261121-1400-devops-home): the pane the status element's "devops" opens.
 * The Desktop app's own New page runs no session, so no mod can draw there; this pane is the substitute.
 *
 * Layout = mock r2d1 "Budget-Kopf" (concept docs/concepts/20261127-2035-devops-home-neu, round 2). A head card: "devops"
 * with its state dot (no text while on; "Aus · …" names the off level), the band's budget bars for EVERY window the
 * account has (bandBars), and ⏻, whose menu (Diese Sitzung · Projekt · Alle Projekte · Einschalten) is an absolute
 * overlay that never pushes content; a press on the head or anywhere outside closes it. Tabs Übersicht · Einstellungen ·
 * Statistik, with the bed icon (arms / cancels scripts/bedtime-shutdown.js, confirm step kept) and ↻ on the right.
 * Übersicht: four neutral action chips (emoji + count + verb; 0 = dim info): 👉 opens the session waiting longest, ⏳
 * the newest running one, 🟩 archives the finished ones (confirm; falls back to opening the oldest), 🧹 the band's
 * branch cleanup of THIS repo; then Projekte, each state chip opening that project's newest session of the state, and
 * "＋ Batch" (fills the prompt box, see batchPrompt) or "→ Batch". Einstellungen is a grouped list (label left, value
 * right, › opens the choice): Allgemein (Browser, Ausgabestil = scripts/output-style.js, user level), Claude-Projekte
 * behind the `project-threads` feature (Threads starten, Ausnahmen, Voraussetzungen as keywords with ⓘ, the copy
 * button for the project-instructions block), Hilfe (restart the tour). Statistik shows the info card's figures as big
 * numbers with proportion bars, from InfoData only. A five-step first-run tour overlays the pane once per machine
 * (`~/.claude/devops-home-tour.json`).
 *
 * Pure helpers are exported for the tests; the engine side reaches the rest of the mod only through `HomeDeps`.
 */
import type { EngineInterface } from 'claude-code'

import type { Budget, InfoData } from '../../types/index'
import { bandBars, budgetBarAlt, budgetBarSvg, BUDGET_BAR_SIZE, infoHeadline, infoIsEmpty, infoRows } from './format'
import { featureAllowed, homeDir } from './gate'
import type { BudgetBar, InfoRow, Locale } from './format'

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
    // The press no longer learns the new session's id (Claude starts it on the person's Enter): the newest live
    // session of the project that still carries a batch title is the batch, whoever started it.
    const titled = live.filter(x => x.project === p.path && isBatchTitle(x.title)).sort(byAtAsc).pop() ?? null
    p.batch = s && isBatchTitle(s.title) ? s : titled
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

/**
 * What "＋ Batch" puts in the prompt box. The Desktop app starts a session only on a turn the person typed in it
 * (`assertCanStartSideSession`: a mod's own `start_session` call and a plugin's `prompt.submit` are refused, the
 * fallback proposal card cannot carry a folder), so the press fills the box and the person's Enter is the ask. The
 * line names every argument so the turn needs no further question; `background` opens with HOME_PANE_BACKGROUND
 * (hooks/lib/home-pane.js), which keeps the plugin-scope and title hooks out of a press.
 */
export function batchPrompt(p: { name: string; path: string }): string {
  return (
    `📚 Neue Batch-Sitzung im Projekt „${p.name}“ starten. ` +
    `start_session: initiation user_asked, context fresh, cwd \`${p.path}\`, title „Batch ${p.name}“, prompt \`/do-batch\`, ` +
    'background „Started from the devops Home pane by the person pressing its ＋ Batch button; the new session only collects notes with /do-batch.“ ' +
    'Danach nur eine Zeile, dass sie läuft.'
  )
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
  /** devops on/off for this session and which levels are off (read live, the same files the hooks' resolver reads). */
  opt: HomeOpt
  /** The band's budget (stored + usage-live.json): the head draws bandBars of it. */
  budget: Budget | null
  /** The repo root of this session: the cleanup session starts there. */
  root: string
  loadInfo: () => Promise<InfoData>
  /** ⏻ menu: switch one level off or on; `on` without a level lifts every level that is off. */
  switchOpt: (mode: 'off' | 'on', scope?: 'session' | 'project' | 'global') => Promise<void>
  /**
   * The branch cleanup of this repo: the same run as the band's 🧹 button (an Opus subagent plans, the band shows the
   * plan with Apply). No session start: docs/dev/mods.md § Branch cleanup button, no mod API starts a session reliably.
   */
  startCleanup: () => Promise<void>
}

type Snap = { at: number; model: HomeModel; rings: HomeRing[]; reset: string; info: InfoData | null; error: string; bed: HomeBed | null }

let snap: Snap | null = null
let loading = false
let tab: 'overview' | 'settings' | 'stats' = 'overview'
/** The ⏻ menu is open (an overlay; any press outside it closes it). */
let menuOpen = false
/** The tour step on screen, -1 = none; `tourSeen` null = the machine-wide marker was not read yet. */
let tourStep = -1
let tourSeen: boolean | null = null
let archiveConfirm = false
let archiving = false
let style: OutputStyle | null = null
let styleAt = 0
let styleLoading = false
let styleSaving = ''
let styleChanged = false
let openInfo = ''
let confirmFor = ''
const CLEANUP_KEY = '__cleanup__'
const busy = new Map<string, 'starting' | 'started' | 'failed'>()
let paneOpen = false
let browsers: BrowserState | null = null
let browsersAt = 0
let browsersLoading = false
/** Disclosures of the Einstellungen tab that are open (per process): exceptions, prerequisites, notes, all figures. */
const shown = new Set<string>()
let browserSaving = ''
const BROWSER_TIMEOUT_MS = 8000
const BROWSER_FRESH_MS = 300_000
let threads: ThreadState | null = null
let threadsAt = 0
let threadsLoading = false
let threadsFailed = false
let threadsVersion = ''
let threadsOpen = '' // '' or a project id: the exception picker that is open
let threadsSaving = ''
let threadsPick = '' // the value being written, for its ⏳
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
  // D1: the tour comes on the first open of this machine, until it was finished or skipped once.
  if (tourSeen === null) {
    tourSeen = !home || tourDone(await readJson($, `${home}${TOUR_FILE}`))
    if (!tourSeen && tourStep < 0) tourStep = 0
  }
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
    threadsFailed = !s
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
  threadsPick = value
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
/** Shows a passing state on a row for `ms`, then gives the row back (a lost timer leaves it for the next press). */
function holdBusy($: EngineInterface, key: string, state: 'starting' | 'started' | 'failed', ms: number): void {
  busy.set(key, state)
  $.ui.invalidate('ui.render')
  try {
    $.clock.after(ms, () => {
      if (busy.get(key) === state) busy.delete(key)
      $.ui.invalidate('ui.render')
    })
  } catch {
    /* the next press or refresh answers it */
  }
}

/**
 * "＋ Batch": the start request goes into the prompt box (batchPrompt says why no mod call can start the session);
 * the person's Enter sends it as a turn they typed, and Claude starts the session there. A draft already in the box
 * is never overwritten. Past 85 % of the week the first press only asks, for 8 s.
 */
function pressBatch($: EngineInterface, p: HomeProject): void {
  if (snap && needsConfirm(snap.rings) && confirmFor !== p.path) {
    confirmFor = p.path
    $.ui.invalidate('ui.render')
    try {
      $.clock.after(8000, () => {
        if (confirmFor === p.path) confirmFor = ''
        $.ui.invalidate('ui.render')
      })
    } catch {
      /* the next press answers it */
    }
    return
  }
  confirmFor = ''
  if (busy.get(p.path) === 'starting') return
  busy.set(p.path, 'starting')
  $.ui.invalidate('ui.render')
  void (async () => {
    const text = batchPrompt(p)
    try {
      const box = await $.prompt.read().catch(() => null)
      const draft = box && typeof box.text === 'string' ? box.text.trim() : ''
      if (draft && draft !== text) throw new Error('draft')
      const r = await $.prompt.fill({ text })
      if (!r.isFilled) throw new Error(r.refusal || 'refused')
      holdBusy($, p.path, 'started', 30_000)
      $.ui.toast(`Enter drücken: Claude startet die Batch-Sitzung in ${p.name}`, { timeoutMs: 8000 })
    } catch (err) {
      holdBusy($, p.path, 'failed', 8000)
      const why = err instanceof Error ? err.message : ''
      $.ui.toast(
        why === 'draft'
          ? 'In der Eingabe steht schon Text. Leere sie oder schick sie ab, dann noch einmal ＋ Batch.'
          : `Eingabe nicht erreichbar. Schreib Claude: „Starte eine Batch-Sitzung in ${p.path}“.`,
        { timeoutMs: 10_000 },
      )
    }
  })()
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

const STATE_COLOR = { waiting: '#d29922', done: '#3fb950' } as const
/** The head card's two looks (mock r2d1 `.r2-head` / `.r2-head.r2-off`). */
const HEAD = {
  on: { bg: '#1f2b22', border: '#2f3d33', dot: '#7ee787', ring: '#3fb950', ringBg: '#16301d' },
  off: { bg: '#222222', border: '#3a3a3a', dot: '#9a9a9a', ring: '#6a6a6a', ringBg: '#2a2a2a' },
} as const
/** The ring of the element a tour step points at (`.r2-spot`). */
const SPOT = '#f0efec'
const POPOVER_BG = '#2a2a2a'
const POPOVER_BORDER = '#3a3a3a'
const GROUP_BG = '#242424'
const GROUP_BORDER = '#2f2f2f'
const ICON_COLOR = '#cfcfcf'
const TIP_WIDTH = 40
/** C9: the pane's icons a step larger than the text glyphs they replaced. */
const ICON = 22
const SHARE_W = 180

// ── pure (round 2) ───────────────────────────────────────────────────────────────────────────────────────────────────

export type HomeOpt = { on: boolean; sessionOff: boolean; projectOff: boolean; globalOff: boolean }

/** C1: nothing while devops is on (the green dot says it); off names the level that switched it off. */
export function offText(o: HomeOpt, project: string): string {
  if (o.on) return ''
  if (o.sessionOff) return 'Aus · diese Sitzung'
  if (o.globalOff) return 'Aus · überall'
  return `Aus · in ${project}`
}

/** The bar's name in the head: the band's short labels spelled out. */
export function barLabel(l: BudgetBar['label']): string {
  return l === 'Wk' ? 'Woche' : l === 'Fb' ? 'Fable' : '5 h'
}

/** C8: a plain bed silhouette (headboard, mattress, a sleeper's head), stroked like the other line icons. */
export function bedSvg(color: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    '<path d="M3 5v14"/><path d="M3 15h18v4"/><path d="M21 15v-2.5a2.5 2.5 0 0 0-2.5-2.5H11v5"/><circle cx="7" cy="12" r="1.8"/></svg>'
  )
}

/** A two-part proportion bar: `a` in `ca` from the left, the rest `b` in `cb`. */
export function shareSvg(a: number, b: number, ca: string, cb: string, width = SHARE_W): string {
  const total = Math.max(0, a) + Math.max(0, b)
  const wa = total > 0 ? Math.round((Math.max(0, a) / total) * width) : 0
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="10" viewBox="0 0 ${width} 10">` +
    `<rect x="0" y="1" width="${width}" height="8" rx="4" fill="${cb}"/>` +
    (wa > 0 ? `<rect x="0" y="1" width="${wa}" height="8" rx="4" fill="${ca}"/>` : '') +
    '</svg>'
  )
}

export type StatShare = { a: number; b: number; aLabel: string; bLabel: string }
export type StatTile = InfoRow & { share?: StatShare }

/**
 * C15: the Statistik tab from InfoData only. The hero is the net estimate with blocked vs released searches; a tile
 * gets a proportion bar where the data carries two parts of one whole (reused of shipped branches, gain vs own cost).
 * InfoData keeps 7-day sums, no per-day series, so there is no sparkline: nothing is drawn that was not measured.
 */
export function statTiles(d: InfoData | null, loc: Locale): { hero: StatTile | null; tiles: StatTile[] } {
  if (!d || infoIsEmpty(d)) return { hero: null, tiles: [] }
  const b = d.benefit
  const hero: StatTile | null = b.net7 > 0
    ? { ...infoHeadline(d, loc), ...(b.blocks7 + b.released7 > 0 ? { share: { a: b.blocks7, b: b.released7, aLabel: `${b.blocks7} gehalten`, bLabel: `${b.released7} freigegeben` } } : {}) }
    : null
  const tiles = infoRows(d, loc).map((r): StatTile => {
    if (r.key === 'info-shipped' && d.ships && d.ships.reused7 > 0 && d.ships.reused7 <= d.ships.branches7) {
      const rest = d.ships.branches7 - d.ships.reused7
      return { ...r, share: { a: d.ships.reused7, b: rest, aLabel: `${d.ships.reused7} wiederverwendet`, bLabel: `${rest} neu` } }
    }
    if (r.key === 'info-own' && d.overhead && b.net7 > 0) return { ...r, share: { a: b.net7, b: d.overhead.ownTokens7, aLabel: 'Nutzen', bLabel: 'eigene Kosten' } }
    return r
  })
  return { hero, tiles }
}

/** C16: one keyword per prerequisite; the full sentence (the path) sits behind its ⓘ. */
const PREREQ_WORD: Record<string, string> = { project: 'Projekt-Umgebung', rc: 'Remote Control', awake: 'Wach halten', trusted: 'Trusted devices aus' }
export function prereqWord(r: Prereq, version: string): string {
  if (r.key === 'version') return version ? `Claude Code ${version}` : 'Claude-Code-Version'
  return PREREQ_WORD[r.key] || r.key
}

/** C14: what the copy button is for, one sentence behind its ⓘ. */
export const COPY_BLOCK_NOTE = 'claude.ai liest den Thread-Ort nur aus den Projektanweisungen: dieser Block gehört dort hinein.'

export type OutputStyle = 'Quiet' | 'default'
/** `scripts/output-style.js get|set --json` → `{ "style": "Quiet" | "default" }`. */
export function styleFrom(text: string): OutputStyle | null {
  try {
    const v = JSON.parse(text) as { style?: unknown }
    return v && (v.style === 'Quiet' || v.style === 'default') ? v.style : null
  } catch {
    return null
  }
}
export function styleLabel(s: OutputStyle): string {
  return s === 'Quiet' ? 'Quiet' : 'Standard'
}

/** D2: the five tour steps in the order of decision r2-d-tut-points; `target` names the element it rings. */
export const TOUR_STEPS = [
  { target: 'head', title: 'Wozu devops Home?', text: 'Dein Startpunkt für devops: was auf dich wartet, wie viel Budget bleibt, und alle devops-Einstellungen an einem Ort.' },
  { target: 'power', title: '⏻ An und aus', text: 'Schaltet devops aus: für diese Sitzung, für dieses Projekt oder für alle Projekte. Home bleibt da, ein Klick schaltet zurück.' },
  { target: 'chips', title: 'Ein Klick springt hinein', text: 'Chips mit Rahmen und Verb handeln: 👉 öffnet die Sitzung, die am längsten wartet, ⏳ die neueste laufende. Graue Zahlen sind nur Info.' },
  { target: 'bed', title: 'Ins Bett', text: 'Das Bett schaltet den PC aus, sobald keine Sitzung mehr arbeitet. Du bestätigst vorher, Abbrechen geht jederzeit.' },
  { target: 'batch', title: '＋ Batch sammelt Notizen', text: '＋ Batch startet pro Projekt eine Sitzung, die nur Notizen sammelt. Umgesetzt wird später in einem Rutsch.' },
] as const
export const TOUR_FILE = '/.claude/devops-home-tour.json'

/** The machine-wide marker: finished or skipped once = never again on its own. */
export function tourDone(v: unknown): boolean {
  return !!v && typeof v === 'object' && (v as { done?: unknown }).done === true
}

/** C12: the project's newest session of one state. */
export function newestOf(list: HomeSession[], project: string): HomeSession | undefined {
  return list.filter(x => x.project === project).sort(byAtAsc).pop()
}

// ── engine (round 2) ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The person closed the pane (its ✕): the next status press opens it again. */
export function homeClosed(): void {
  paneOpen = false
  menuOpen = false
}

/** "1 ✓ · 4 prüfen": the prerequisites' state in one line, for the closed disclosure. */
export function prereqSummary(rows: Prereq[]): string {
  const ok = rows.filter(r => r.state === 'ok').length
  const bad = rows.filter(r => r.state === 'bad').length
  const check = rows.filter(r => r.state === 'check').length
  return [ok ? `${ok} ✓` : '', bad ? `${bad} ✗` : '', check ? `${check} prüfen` : ''].filter(Boolean).join(' · ')
}

/** D1/D3: end the tour and remember it for this machine; a failed write only means it may come once more. */
function endTour($: EngineInterface, how: 'finished' | 'skipped'): void {
  tourStep = -1
  tourSeen = true
  $.ui.invalidate('ui.render')
  void (async () => {
    try {
      const home = await homeDir($)
      if (home) await $.fs.write(`${home}${TOUR_FILE}`, `${JSON.stringify({ done: true, how, at: new Date(await $.clock.now()).toISOString() }, null, 2)}\n`)
    } catch {
      /* not remembered: the next process shows it once more */
    }
  })()
}

async function styleScript($: EngineInterface, args: string[]): Promise<OutputStyle | null> {
  try {
    const r = await $.process.run(['node', `${$.plugin.root}/scripts/output-style.js`, ...args, '--json'], { timeoutMs: BROWSER_TIMEOUT_MS })
    return r.exitCode === 0 ? styleFrom(String(r.stdout || '')) : null
  } catch {
    return null
  }
}

/** Ausgabestil: same cache rule as the browser row (5 min good, 20 s after a failure, ↻ asks now). */
function loadStyle($: EngineInterface, now: number, force = false): void {
  if (styleLoading || (!force && styleAt && now - styleAt < (style ? BROWSER_FRESH_MS : STALE_MS))) return
  styleLoading = true
  styleAt = now || 1
  void (async () => {
    const v = await styleScript($, ['get'])
    if (v) style = v
    styleLoading = false
    $.ui.invalidate('ui.render')
  })()
}

/** B1: the user-level output style; it takes effect in a new session, said only once it changed. */
function pickStyle($: EngineInterface, id: string): void {
  if (styleSaving || id === style) return
  styleSaving = id
  $.ui.invalidate('ui.render')
  void (async () => {
    const v = await styleScript($, ['set', id === 'Quiet' ? 'quiet' : 'default'])
    if (v) {
      styleChanged = styleChanged || v !== style
      style = v
    } else $.ui.toast('Ausgabestil konnte nicht gespeichert werden.', { timeoutMs: 8000 })
    styleSaving = ''
    $.ui.invalidate('ui.render')
  })()
}

/**
 * 🟩 Archivieren: the first press asks for 8 s, the second archives every finished session through the app's
 * `ccd_session_mgmt` `archive_session`. If the app refuses the first one, the chip opens the oldest finished session
 * instead, so the press still leads somewhere.
 */
function pressArchive($: EngineInterface, ctx: HomeCtx, done: HomeSession[]): void {
  if (archiving || !done.length) return
  if (!archiveConfirm) {
    archiveConfirm = true
    $.ui.invalidate('ui.render')
    try {
      $.clock.after(8000, () => {
        archiveConfirm = false
        $.ui.invalidate('ui.render')
      })
    } catch {
      /* the next press answers it */
    }
    return
  }
  archiveConfirm = false
  archiving = true
  $.ui.invalidate('ui.render')
  void (async () => {
    let n = 0
    for (const x of done) {
      try {
        const r = await $.mcp.call('ccd_session_mgmt', 'archive_session', { session_id: x.id })
        if (r.isError) throw new Error(textOf(r).slice(0, 120))
        n++
      } catch (err) {
        if (n === 0) {
          $.ui.toast(`Archivieren nicht erreichbar (${err instanceof Error ? err.message : 'unbekannt'}) – öffne die älteste fertige Sitzung.`, { timeoutMs: 8000 })
          pressOpen($, x)
        }
        break
      }
    }
    if (n) $.ui.toast(`🟩 ${n} ${n === 1 ? 'Sitzung' : 'Sitzungen'} archiviert`, { timeoutMs: 5000 })
    archiving = false
    refreshHome($, ctx, true)
    $.ui.invalidate('ui.render')
  })()
}

/** The pane's tree; index.tsx hooks `ui.render` for `{ component: 'Pane', requestId: HOME_PANE }` and calls this. */
export async function renderHome($: EngineInterface, e: any, ctx: HomeCtx): Promise<any> {
  paneOpen = true
  const { Box, Button, Svg, Text } = $.ui.resolve(e)
  refreshHome($, ctx)
  armTick($, ctx)
  const loc = ctx.loc
  const now = await $.clock.now()
  const s = snap
  const redraw = () => $.ui.invalidate('ui.render')
  const opt = ctx.opt
  const off = !opt.on
  const here = projectOf(ctx.root)
  const hereName = nameOf(here) || 'diesem Projekt'
  const step = tourStep >= 0 && tab === 'overview' ? TOUR_STEPS[tourStep] : undefined
  /** The tour's ring on the element its step explains. */
  const spot = (t: string) => (step && step.target === t ? { borderStyle: 'round', borderColor: SPOT } : {})

  /** R1: the app-styled hover tooltip (the band's pattern), never a native title. */
  const tip = (key: string, text: string, child: any, side: 'left' | 'right' = 'left') => (
    <Box key={key} position="relative" flexDirection="row" alignItems="center">
      {child}
      {/* Unkeyed: the engine scopes hover to the nearest keyed Box, which must stay visible. */}
      <Box position="absolute" top={1} {...(side === 'right' ? { right: 0 } : { left: 0 })} width={TIP_WIDTH} display="none" hover={{ display: 'flex' }} paddingX={1} borderStyle="round" borderColor={POPOVER_BORDER} backgroundColor={POPOVER_BG}>
        <Text size="caption">{text}</Text>
      </Box>
    </Box>
  )
  /** ⓘ: the detail on hover, and on a press (the touch path) as a footnote via `iNote`. */
  const iBtn = (id: string, text: string) =>
    tip(`home-i-${id}-wrap`, text, <Button key={`home-i-${id}`} plain label="ⓘ" onPress={() => { openInfo = openInfo === id ? '' : id; redraw() }} />, 'right')
  const iNote = (id: string, text: string) => (openInfo === id ? <Text key={`home-i-${id}-note`} dimColor size="footnote">{text}</Text> : null)
  const toggle = (id: string) => { if (shown.has(id)) shown.delete(id); else shown.add(id); redraw() }
  /** A one-of-several choice as a row of buttons: every option visible, the chosen one filled and ticked. */
  const seg = (key: string, opts: { id: string; label: string }[], cur: string, saving: string, pick: (id: string) => void) => (
    <Box key={key} flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
      {opts.map(o => (
        <Button key={`${key}-${o.id}`} variant={o.id === cur ? 'primary' : undefined} label={saving === o.id ? `⏳ ${o.label}` : o.id === cur ? `✓ ${o.label}` : o.label} onPress={() => pick(o.id)} />
      ))}
    </Box>
  )

  // ── head card (C1, C2, C4–C6) ──
  const H = off ? HEAD.off : HEAD.on
  const bars = bandBars(ctx.budget, now)
  const stateLine = offText(opt, hereName)
  const closeMenu = () => { if (menuOpen) { menuOpen = false; redraw() } }
  const head = (
    <Box key="home-head" flexDirection="column" rowGap={1} borderStyle="round" borderColor={H.border} backgroundColor={H.bg} paddingX={2} paddingY={1} {...spot('head')}>
      <Box key="home-head-top" flexDirection="row" alignItems="center" columnGap={1}>
        {/* The engine's Button holds strings and Text only (no Box, no Svg). */}
        <Button key="home-head-name" plain onPress={closeMenu}>
          <Text bold size="heading">devops </Text>
          <Text key="home-state-dot" size="heading" color={H.dot}>{off ? '○' : '●'}</Text>
          {stateLine ? <Text key="home-state" color={H.dot}>{` ${stateLine}`}</Text> : null}
        </Button>
        <Box flexGrow={1} />
        {tip('home-power-wrap', 'devops ein- oder ausschalten', (
          <Box borderStyle="round" borderColor={H.ring} backgroundColor={H.ringBg} paddingX={1} {...spot('power')}>
            <Button key="home-power" plain onPress={() => { menuOpen = !menuOpen; redraw() }}>
              <Text size="heading" color={H.dot}>⏻</Text>
            </Button>
          </Box>
        ), 'right')}
      </Box>
      {bars.length > 0 ? (
        <Box key="home-bars" flexDirection="column" rowGap={1}>
          {bars.map(bar => (
            <Box key={`home-bar-${bar.label}`} flexDirection="row" alignItems="center" columnGap={1}>
              <Box width={7}><Text dimColor={off}>{barLabel(bar.label)}</Text></Box>
              <Svg source={budgetBarSvg(bar)} alt={budgetBarAlt(bar, loc)} width={BUDGET_BAR_SIZE.width} height={BUDGET_BAR_SIZE.height} isInteractive />
              <Text tabular dimColor={off}>{bar.empty ? '–' : `${Math.round(bar.pct)} %`}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  )
  const levels = [
    { id: 'session' as const, label: 'Diese Sitzung', isOff: opt.sessionOff },
    { id: 'project' as const, label: `Projekt ${hereName}`, isOff: opt.projectOff },
    { id: 'global' as const, label: 'Alle Projekte', isOff: opt.globalOff },
  ]
  // C4/C5: an overlay above the content (absolute, nothing moves). A Button cannot hold a Box, so no full-pane click
  // catcher exists: the head, ⏻ again, the tabs, the bed, ↻ and every action chip close it.
  const menu = !menuOpen ? null : [
    <Box key="home-menu" position="absolute" top={4} right={1} width={30} flexDirection="column" rowGap={0} paddingX={1} paddingY={1} borderStyle="round" borderColor={POPOVER_BORDER} backgroundColor={POPOVER_BG}>
      <Text dimColor size="footnote">Ausschalten für</Text>
      {levels.map(l => (
        <Button key={`home-menu-${l.id}`} plain onPress={() => { menuOpen = false; void ctx.switchOpt(l.isOff ? 'on' : 'off', l.id) }}>
          <Text>{l.label}</Text>
          {l.isOff ? <Text key={`home-menu-${l.id}-tick`}>  ✓</Text> : null}
        </Button>
      ))}
      {off ? <Text key="home-menu-sep" color={POPOVER_BORDER}>{'─'.repeat(24)}</Text> : null}
      {off ? <Button key="home-menu-on" plain onPress={() => { menuOpen = false; void ctx.switchOpt('on') }}><Text bold>Einschalten</Text></Button> : null}
    </Box>,
  ]

  // ── tab row (C7, C8) ──
  const tabBtn = (id: typeof tab, label: string) => (
    <Button key={`home-tab-${id}`} plain onPress={() => { tab = id; menuOpen = false; redraw() }}>
      <Text size="heading" bold={tab === id} dimColor={tab !== id}>{label}</Text>
    </Button>
  )
  const bedTip = s?.bed ? 'Abbrechen: der PC bleibt an' : bedConfirm ? 'Noch einmal drücken: der PC fährt herunter, sobald keine Sitzung mehr arbeitet' : 'Ins Bett gehen: PC ausschalten, sobald keine Sitzung mehr arbeitet'
  const bedColor = s?.bed ? STATE_COLOR.waiting : bedConfirm ? SPOT : ICON_COLOR
  const tabs = (
    <Box key="home-top" flexDirection="row" alignItems="center" columnGap={2}>
      {tabBtn('overview', 'Übersicht')}
      {tabBtn('settings', 'Einstellungen')}
      {tabBtn('stats', 'Statistik')}
      <Box flexGrow={1} />
      {tip('home-bed-wrap', bedTip, (
        <Box {...spot('bed')}>
          <Button key="home-bed-btn" plain onPress={() => { menuOpen = false; if (!bedBusy) pressBed($, ctx, s?.bed ? 'cancel' : 'start') }}>
            <Text size="heading" color={bedColor}>🛏</Text>
          </Button>
        </Box>
      ), 'right')}
      {tip('home-refresh-wrap', s ? `${agoText(now - s.at)} aktualisiert` : 'Lädt …', (
        <Button key="home-refresh" plain onPress={() => { menuOpen = false; if (tab === 'settings') { loadBrowsers($, now, true); loadStyle($, now, true); void threadsOn($).then(on => { if (on) loadThreads($, now, true) }) } refreshHome($, ctx, true) }}>
          <Text size="heading" color={ICON_COLOR}>↻</Text>
        </Button>
      ), 'right')}
    </Box>
  )
  const frame = (...children: any[]) => (
    <Box flexDirection="column" rowGap={1} position="relative">
      {head}
      {tabs}
      {children}
      {menu}
    </Box>
  )
  if (!s) return frame(<Text key="home-loading" dimColor>Lädt …</Text>)
  const version = s.info ? s.info.version : ''
  const foot = version ? <Text key="home-version" dimColor size="footnote">{`devops ${version}`}</Text> : null

  // ── Statistik (C15) ──
  if (tab === 'stats') {
    const { hero, tiles } = statTiles(s.info, loc)
    const share = (key: string, sh: StatShare, ca: string) => (
      <Box key={key} flexDirection="column">
        <Svg source={shareSvg(sh.a, sh.b, ca, '#3a3a3a')} alt={`${sh.aLabel} · ${sh.bLabel}`} width={SHARE_W} height={10} />
        <Text dimColor size="footnote">{`${sh.aLabel} · ${sh.bLabel}`}</Text>
      </Box>
    )
    return frame(
      <Box key="home-stats" flexDirection="column" rowGap={1}>
        <Text dimColor size="footnote">7 TAGE</Text>
        {hero ? (
          <Box key="home-stat-hero" flexDirection="column" rowGap={1} borderStyle="round" borderColor={HEAD.on.border} backgroundColor={HEAD.on.bg} paddingX={2} paddingY={1}>
            <Box flexDirection="row" alignItems="center" columnGap={1}>
              <Text bold size="heading" tabular color={HEAD.on.dot}>{hero.value}</Text>
              <Box flexGrow={1} />
              {iBtn('stat-hero', hero.note)}
            </Box>
            <Text>{hero.label}</Text>
            {hero.share ? share('home-stat-hero-share', hero.share, HEAD.on.ring) : null}
            {iNote('stat-hero', hero.note)}
          </Box>
        ) : tiles.length ? <Text key="home-quality" bold color={STATE_COLOR.done}>✓ Nutzen diese Woche: Qualität statt Tokens</Text> : null}
        {!hero && !tiles.length ? <Text key="home-info-empty" dimColor>Noch keine devops-Messwerte.</Text> : null}
        <Box key="home-stat-grid" flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
          {tiles.map(t => (
            <Box key={`tile-${t.key}`} flexDirection="column" rowGap={0} width={30} borderStyle="round" borderColor={GROUP_BORDER} backgroundColor={GROUP_BG} paddingX={1} paddingY={1}>
              <Box flexDirection="row" alignItems="center" columnGap={1}>
                <Text bold size="heading" tabular>{t.value}</Text>
                <Box flexGrow={1} />
                {t.note ? iBtn(`stat-${t.key}`, t.note) : null}
              </Box>
              <Text>{t.label}</Text>
              {t.share ? share(`tile-${t.key}-share`, t.share, '#8957e5') : null}
              {t.note ? iNote(`stat-${t.key}`, t.note) : null}
            </Box>
          ))}
        </Box>
        {foot}
      </Box>,
    )
  }

  // ── Einstellungen (C13, C14, C16, C17, D3) ──
  if (tab === 'settings') {
    loadBrowsers($, now)
    loadStyle($, now)
    const br = browsers
    const note = br ? browserNote(br) : ''
    const threadsShown = await threadsOn($)
    if (threadsShown) loadThreads($, now)
    const th = threadsShown ? threads : null
    const group = (key: string, title: string, ...rows: any[]) => (
      <Box key={key} flexDirection="column" rowGap={0}>
        <Text dimColor size="footnote">{title.toUpperCase()}</Text>
        <Box flexDirection="column" rowGap={1} borderStyle="round" borderColor={GROUP_BORDER} backgroundColor={GROUP_BG} paddingX={1} paddingY={1}>{rows}</Box>
      </Box>
    )
    /** One list row: label left, value right; the value with › is the press that opens the choice below. */
    const row = (id: string, label: string, value: string, info?: { id: string; text: string }) => (
      <Box key={`home-row-${id}-line`} flexDirection="row" alignItems="center" columnGap={1}>
        <Text>{label}</Text>
        {info ? iBtn(info.id, info.text) : null}
        <Box flexGrow={1} />
        <Button key={`home-row-${id}`} plain onPress={() => toggle(id)}>
          <Text dimColor>{`${value} ${shown.has(id) ? '⌄' : '›'}`}</Text>
        </Button>
      </Box>
    )
    const general = group(
      'home-general', 'Allgemein',
      row('browser', 'Browser', br ? br.effective.label : '…'),
      shown.has('browser') ? (
        br ? (
          <Box key="home-browser" flexDirection="column" rowGap={1} paddingLeft={2}>
            {seg('home-browser', br.options, br.effective.id, browserSaving, id => pickBrowser($, id))}
            {note ? <Text key="home-browser-note" dimColor>{note}</Text> : null}
          </Box>
        ) : <Text key="home-browser-loading" dimColor>Browser-Liste lädt …</Text>
      ) : null,
      row('style', 'Ausgabestil', style ? styleLabel(style) : styleLoading ? '…' : '–'),
      shown.has('style') ? (
        <Box key="home-style" flexDirection="column" rowGap={1} paddingLeft={2}>
          {style ? seg('home-style', [{ id: 'Quiet', label: 'Quiet' }, { id: 'default', label: 'Standard' }], style, styleSaving, id => pickStyle($, id))
            : <Text key="home-style-none" dimColor>{styleLoading ? 'Lädt …' : 'Ausgabestil nicht lesbar. ↻ versucht es noch einmal.'}</Text>}
          {styleChanged ? <Text key="home-style-note" dimColor size="footnote">Gilt ab der nächsten Sitzung.</Text> : null}
        </Box>
      ) : null,
    )

    let projects: any = null
    if (threadsShown && !th) {
      projects = group('home-threads', 'Claude-Projekte',
        <Text key="home-threads-loading" dimColor>{threadsFailed && !threadsLoading ? 'Thread-Ort nicht lesbar. ↻ versucht es noch einmal.' : 'Thread-Ort lädt …'}</Text>)
    } else if (th) {
      const own = th.projects.filter(p => p.source === 'project').length
      const pre = prereqRows(threadsVersion)
      projects = group(
        'home-threads', 'Claude-Projekte',
        row('threads', 'Threads starten', threadsSaving === 'global' ? `⏳ ${threadLabel(threadsPick)}` : threadLabel(th.global)),
        shown.has('threads') ? (
          <Box key="home-threads-global" flexDirection="column" rowGap={1} paddingLeft={2}>
            {seg('home-threads', th.options, th.global, threadsSaving === 'global' ? threadsPick : '', id => pickThread($, id))}
            <Text key="home-threads-meaning" dimColor size="footnote">{threadMeaning(th.global)}</Text>
          </Box>
        ) : null,
        row('exceptions', 'Ausnahmen', th.projects.length ? `${own} von ${th.projects.length}` : 'keine'),
        shown.has('exceptions') ? (
          <Box key="home-threads-list" flexDirection="column" rowGap={1} paddingLeft={2}>
            {th.projects.length === 0 && <Text key="home-threads-none" dimColor>Noch kein Projekt gesehen.</Text>}
            {th.projects.map(p => (
              <Box key={`home-threads-p-${p.id}`} flexDirection="column" rowGap={1}>
                <Box flexDirection="row" alignItems="center" columnGap={1}>
                  <Text>{threadProjectName(p)}</Text>
                  <Text dimColor>{threadProjectLabel(p)}</Text>
                  <Box flexGrow={1} />
                  <Button key={`home-threads-toggle-${p.id}`} plain label={threadsSaving === p.id ? '⏳ speichert …' : threadsOpen === p.id ? 'Fertig' : 'Ändern'} onPress={() => { threadsOpen = threadsOpen === p.id ? '' : p.id; redraw() }} />
                </Box>
                {threadsOpen === p.id && seg(`home-threads-${p.id}`, [{ id: INHERIT, label: 'Wie global' }, ...th.options], p.source === 'project' ? p.value : INHERIT, '', id => pickThread($, id, p.id))}
                {threadsOpen === p.id && p.source === 'project' && <Button key={`home-threads-copy-${p.id}`} plain label="⧉ Block dieses Projekts kopieren" onPress={() => copyThreadBlock($, p.id)} />}
              </Box>
            ))}
          </Box>
        ) : null,
        row('prereq', 'Voraussetzungen', prereqSummary(pre)),
        shown.has('prereq') ? (
          <Box key="home-prereq" flexDirection="column" rowGap={0} paddingLeft={2}>
            {pre.map(r => (
              <Box key={`home-prereq-${r.key}`} flexDirection="column">
                <Box flexDirection="row" alignItems="center" columnGap={1}>
                  <Text dimColor={r.state === 'check'} color={r.state === 'bad' ? STATE_COLOR.waiting : r.state === 'ok' ? STATE_COLOR.done : undefined}>{`${r.state === 'ok' ? '✓' : r.state === 'bad' ? '✗' : '○'} ${prereqWord(r, threadsVersion)}`}</Text>
                  {iBtn(`prereq-${r.key}`, r.text)}
                </Box>
                {iNote(`prereq-${r.key}`, r.text)}
              </Box>
            ))}
          </Box>
        ) : null,
        <Box key="home-threads-copy-line" flexDirection="row" alignItems="center" columnGap={1}>
          <Button key="home-threads-copy" plain label="⧉ Block für Projektanweisungen kopieren" onPress={() => copyThreadBlock($)} />
          {iBtn('copy', COPY_BLOCK_NOTE)}
        </Box>,
        iNote('copy', COPY_BLOCK_NOTE),
      )
    }
    const help = group(
      'home-help', 'Hilfe',
      <Button key="home-tour-restart" plain onPress={() => { tourStep = 0; tab = 'overview'; redraw() }}>
        <Text>Einführung erneut zeigen </Text>
        <Text dimColor>›</Text>
      </Button>,
    )
    return frame(general, projects, help, foot)
  }

  // ── Übersicht (C10–C12, D1/D2) ──
  const m = s.model
  const cleanBusy = busy.get(CLEANUP_KEY)
  // 🧹 cleans THIS session's repo only (the band's run), so it counts that repo, not the sum of all of them.
  const hereClean = m.projects.find(p => p.path === here)?.cleanup ?? 0
  /** C10: one neutral style; a count with a verb is a press, a 0 is dim info. */
  const chip = (key: string, emoji: string, n: number, verb: string, tipText: string, action: () => void) =>
    n ? tip(`${key}-wrap`, tipText, (
      <Button key={`${key}-btn`} onPress={() => { menuOpen = false; action() }}>
        <Text size="heading">{`${emoji} `}</Text>
        <Text bold tabular dimColor={off}>{`${n} `}</Text>
        <Text weight="medium" dimColor={off}>{verb}</Text>
      </Button>
    )) : (
      <Box key={`${key}-info`} flexDirection="row" alignItems="center" columnGap={1} paddingX={1}>
        <Text size="heading" dimColor>{emoji}</Text>
        <Text dimColor tabular>0</Text>
      </Box>
    )
  const open1 = (x: HomeSession | undefined) => () => { if (x) pressOpen($, x) }
  const doneVerb = archiving ? '⏳ archiviert …' : archiveConfirm ? `Sicher? ${m.done.length} archivieren` : 'Archivieren'
  const cleanVerb = cleanBusy === 'starting' ? 'startet …' : cleanBusy === 'started' ? 'Plan läuft' : 'Aufräumen'
  const acts = (
    <Box key="home-acts" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1} rowGap={1} {...spot('chips')}>
      {chip('t-wait', '👉', m.waiting.length, 'Öffnen', 'Öffnet die Sitzung, die am längsten wartet', open1(m.waiting[0]))}
      {chip('t-run', '⏳', m.running.length, 'Öffnen', 'Öffnet die zuletzt gestartete laufende Sitzung', open1(m.running[0]))}
      {chip('t-done', '🟩', m.done.length, doneVerb, 'Archiviert die fertigen Sitzungen', () => pressArchive($, ctx, m.done))}
      {chip('t-clean', '🧹', hereClean, cleanVerb, `Räumt erledigte Branches und Worktrees in ${hereName} auf`, () => pressCleanup($, ctx))}
    </Box>
  )
  const bedRow = bedBusy ? <Text key="home-bed-text" dimColor>🛏 ⏳ …</Text>
    : s.bed ? (
      <Box key="home-bed" flexDirection="row" alignItems="center" columnGap={1}>
        <Svg source={bedSvg(STATE_COLOR.waiting)} alt="Ins Bett" width={ICON} height={ICON} />
        <Text key="home-bed-text" color={STATE_COLOR.waiting}>{bedText(s.bed, now)}</Text>
        <Box flexGrow={1} />
        <Button key="home-bed-cancel" label="Abbrechen" onPress={() => pressBed($, ctx, 'cancel')} />
      </Box>
    ) : bedConfirm ? (
      <Box key="home-bed" flexDirection="row" alignItems="center" columnGap={1}>
        <Svg source={bedSvg(SPOT)} alt="Ins Bett" width={ICON} height={ICON} />
        <Text key="home-bed-text">Sicher? PC fährt dann herunter, sobald keine Sitzung mehr arbeitet.</Text>
        <Box flexGrow={1} />
        <Button key="home-bed-yes" variant="primary" label="Ja, ins Bett" onPress={() => pressBed($, ctx, 'start')} />
      </Box>
    ) : null
  const pchip = (key: string, emoji: string, n: number, tipText: string, action: (() => void) | null) =>
    !n ? null : action ? tip(`${key}-wrap`, tipText, <Button key={key} label={`${emoji} ${n}`} onPress={action} />) : <Text key={key} dimColor>{`${emoji} ${n}`}</Text>
  const projects = (
    <Box key="home-projects" flexDirection="column" rowGap={1} {...spot('batch')}>
      <Text dimColor size="footnote">PROJEKTE</Text>
      {m.projects.length === 0 ? <Text key="home-projects-empty" dimColor>Keine Sitzungen gefunden.</Text> : null}
      {m.projects.map(p => {
        const b = busy.get(p.path)
        return (
          <Box key={`p-${p.path}`} flexDirection="row" alignItems="center" columnGap={1}>
            <Text dimColor={off}>{p.name}</Text>
            {pchip(`pc-wait-${p.path}`, '👉', p.waiting, 'Neueste wartende Sitzung öffnen', open1(newestOf(m.waiting, p.path)))}
            {pchip(`pc-run-${p.path}`, '⏳', p.running, 'Neueste laufende Sitzung öffnen', open1(newestOf(m.running, p.path)))}
            {pchip(`pc-done-${p.path}`, '🟩', p.done, 'Neueste fertige Sitzung öffnen', open1(newestOf(m.done, p.path)))}
            {pchip(`pc-clean-${p.path}`, '🧹', p.cleanup, `Aufräumen in ${p.name} starten`, p.path === here ? () => pressCleanup($, ctx) : null)}
            <Box flexGrow={1} />
            {b === 'starting' ? <Text key={`pb-${p.path}`} dimColor>⏳ …</Text>
              : b === 'started' ? <Text key={`pb-${p.path}`} color={STATE_COLOR.done}>↵ Enter drücken</Text>
              : p.batch ? <Button key={`pb-${p.path}`} plain label="→ Batch" onPress={() => pressOpen($, p.batch as HomeSession)} />
              : <Button key={`pb-${p.path}`} variant="primary" label={confirmFor === p.path ? `Woche ${s.rings[0]?.pct ?? ''} % – trotzdem?` : '＋ Batch'} onPress={() => pressBatch($, p)} />}
          </Box>
        )
      })}
    </Box>
  )
  const last = tourStep === TOUR_STEPS.length - 1
  const tour = !step ? null : (
    <Box key="home-tour" position="absolute" left={1} right={1} bottom={1} flexDirection="column" rowGap={1} paddingX={2} paddingY={1} borderStyle="round" borderColor="#474747" backgroundColor={POPOVER_BG}>
      <Text dimColor size="footnote">{`${tourStep + 1} von ${TOUR_STEPS.length}`}</Text>
      <Text bold size="heading">{step.title}</Text>
      <Text>{step.text}</Text>
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        <Text key="home-tour-dots" dimColor>{TOUR_STEPS.map((_, i) => (i === tourStep ? '●' : '○')).join(' ')}</Text>
        <Box flexGrow={1} />
        <Button key="home-tour-skip" plain label="Überspringen" onPress={() => endTour($, 'skipped')} />
        <Button key="home-tour-next" variant="primary" label={last ? 'Fertig' : 'Weiter'} onPress={() => { if (last) endTour($, 'finished'); else { tourStep++; redraw() } }} />
      </Box>
    </Box>
  )
  return frame(
    s.error ? <Text key="home-error" color="#f85149">{s.error}</Text> : null,
    acts,
    bedRow,
    projects,
    tour,
  )
}

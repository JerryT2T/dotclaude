import { describe, test, expect } from 'vitest'

import { readOptState, switchOff, switchOn, globalFlagPath } from './optout.ts'

/** A tiny in-memory `$` — only what optout.ts touches (fs.read/write, process.run, plugin.root). */
function fake(files) {
  const writes = []
  const runs = []
  const $ = {
    fs: {
      read: async (p) => {
        if (!(p in files)) throw new Error('ENOENT')
        return files[p]
      },
      write: async (p, t) => {
        writes.push({ path: p, text: t })
        files[p] = t
      },
    },
    process: {
      run: async (argv) => {
        runs.push(argv)
        return { exitCode: 0 }
      },
    },
    plugin: { root: '/plug' },
  }
  return { $, writes, runs, files }
}

const HOME = '/home/u'
const ROOT = '/proj'

describe('optout.ts global level', () => {
  test('readOptState: global flag -> off, scope global, globalOff; session wins; nothing -> on', async () => {
    const f = fake({ [`${HOME}/.claude/settings.json`]: '{"enabledPlugins":{"devops@dotclaude":true}}' })
    expect(await readOptState(f.$, HOME, ROOT, 's1')).toMatchObject({ on: true, scope: 'user', globalOff: false, sessionOff: false })
    f.files[globalFlagPath(HOME)] = '{"off":true}'
    expect(await readOptState(f.$, HOME, ROOT, 's1')).toMatchObject({ on: false, scope: 'global', globalOff: true, projectOff: false })
    f.files[`${HOME}/.claude/devops-optout/sessions/s1.json`] = '{}'
    expect(await readOptState(f.$, HOME, ROOT, 's1')).toMatchObject({ on: false, scope: 'session', globalOff: true, sessionOff: true })
  })

  test('switchOff global writes only the flag file; switchOn global runs the writer script', async () => {
    const f = fake({ [`${ROOT}/.claude/settings.local.json`]: '{"outputStyle":"Quiet"}' })
    expect(await switchOff(f.$, 'global', { home: HOME, root: ROOT, sid: 's1', now: 0 })).toBe(true)
    expect(f.writes.map(w => w.path)).toEqual([globalFlagPath(HOME)])
    expect(JSON.parse(f.writes[0].text).off).toBe(true)
    expect(await switchOn(f.$, 'global', { root: ROOT, sid: 's1' })).toBe(true)
    expect(f.runs[0]).toEqual(expect.arrayContaining(['on', '--scope', 'global']))
  })

  test('switchOff project never writes outputStyle and leaves no memo', async () => {
    const f = fake({ [`${ROOT}/.claude/settings.local.json`]: '{"outputStyle":"Quiet"}' })
    expect(await switchOff(f.$, 'project', { home: HOME, root: ROOT, sid: 's1', now: 0 })).toBe(true)
    expect(f.writes).toHaveLength(1)
    expect(JSON.parse(f.writes[0].text)).toEqual({ outputStyle: 'Quiet', enabledPlugins: { 'devops@dotclaude': false } })
  })
})

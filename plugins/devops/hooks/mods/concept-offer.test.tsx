// #1239: the band's resume offer for an unfinished concept after a restart.
import { expect, test } from 'claude-code/testing'

import { conceptOfferFrom, conceptOfferLine, conceptOfferPrompt } from './format'

const NOW = new Date(2026, 10, 26, 22, 0).getTime()
const file = (o: Record<string, unknown>) => JSON.stringify({ written_at: new Date(NOW - 60_000).toISOString(), ...o })
const O = { slug: 'kat', title: 'Kategorien', round: 3, lastAt: new Date(2026, 10, 26, 21, 40).getTime(), paused: false }

test('conceptOfferFrom: a fresh offer is read with title, round, last activity and pause', () => {
  const o = conceptOfferFrom(file({ slug: 'kat', title: 'Kategorien  nach Einsatz', round: 3, last_at: new Date(NOW - 3600_000).toISOString(), paused: true }), NOW)
  expect(o).toEqual({ slug: 'kat', title: 'Kategorien nach Einsatz', round: 3, lastAt: NOW - 3600_000, paused: true })
})

test('conceptOfferFrom: missing, broken, unsafe or day-old offers show nothing; bad fields fall back', () => {
  expect(conceptOfferFrom('', NOW)).toBe(null)
  expect(conceptOfferFrom('{nope', NOW)).toBe(null)
  expect(conceptOfferFrom(file({ slug: 'a b; rm' }), NOW)).toBe(null)
  expect(conceptOfferFrom(JSON.stringify({ slug: 'x', written_at: new Date(NOW - 25 * 3600_000).toISOString() }), NOW)).toBe(null)
  expect(conceptOfferFrom(file({ slug: 'x', round: 'drei' }), NOW)).toEqual({ slug: 'x', title: 'x', round: null, lastAt: null, paused: false })
})

test('conceptOfferLine: round and time of today as the issue words it; an older day carries its date', () => {
  expect(conceptOfferLine(O, 'de', NOW)).toBe('Konzept *Kategorien* ist noch offen (Runde 3, zuletzt 21:40). Fortsetzen?')
  expect(conceptOfferLine({ ...O, lastAt: new Date(2026, 10, 24, 9, 5).getTime() }, 'en', NOW)).toBe('Concept *Kategorien* is still open (round 3, last 24.11. 09:05). Continue?')
  expect(conceptOfferLine({ ...O, round: null, lastAt: null }, 'de', NOW)).toBe('Konzept *Kategorien* ist noch offen. Fortsetzen?')
  expect(conceptOfferLine({ ...O, round: null }, 'de', NOW)).toBe('Konzept *Kategorien* ist noch offen (zuletzt 21:40). Fortsetzen?')
})

test('conceptOfferPrompt: the buttons send exactly the prompts ss.concept.resume names', () => {
  expect(conceptOfferPrompt(O, 'resume')).toBe('Konzept kat fortsetzen')
  expect(conceptOfferPrompt(O, 'close')).toBe('Konzept kat abschließen')
})

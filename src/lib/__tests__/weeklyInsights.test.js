import { describe, it, expect } from 'vitest'
import { buildWeeklyInsights } from '../weeklyInsights'

const HOUR = 3600000
// A base day at a known local hour is avoided (timezone-dependent); tests use
// createdAt values and read back getHours on the same machine, so assert on
// structure/relative values rather than a specific hour number.
function sess(overrides = {}, createdAt = 1_700_000_000_000) {
  return {
    createdAt,
    longestFocusedStretchSec: 600,
    focusedSeconds: 1200,
    driftCount: 1,
    drowsyCount: 0,
    awayCount: 0,
    firstDriftElapsed: 900, // 15 min
    durationSec: 1800,
    ...overrides,
  }
}

describe('buildWeeklyInsights', () => {
  it('returns null-ish insights for no sessions', () => {
    const i = buildWeeklyInsights([], 1_700_000_000_000)
    expect(i.sessionCount).toBe(0)
    expect(i.bestHour).toBeNull()
    expect(i.experiment).toBeNull()
  })

  it('picks the hour with the best average longest stretch', () => {
    const t = 1_700_000_000_000
    const sessions = [
      sess({ longestFocusedStretchSec: 300 }, t),               // hour A
      sess({ longestFocusedStretchSec: 1500 }, t + 5 * HOUR),   // hour B (better)
      sess({ longestFocusedStretchSec: 1400 }, t + 5 * HOUR + 60000),
    ]
    const i = buildWeeklyInsights(sessions, t + 6 * HOUR)
    expect(i.bestHour).not.toBeNull()
    expect(i.bestHour.avgLongestStretchSec).toBeGreaterThan(1000) // the good hour won
  })

  it('computes median time-to-first-drift across sessions that drifted', () => {
    const t = 1_700_000_000_000
    const sessions = [
      sess({ firstDriftElapsed: 600 }, t),   // 10 min
      sess({ firstDriftElapsed: 1200 }, t + HOUR), // 20 min
      sess({ firstDriftElapsed: null, driftCount: 0 }, t + 2 * HOUR), // no drift → excluded
    ]
    const i = buildWeeklyInsights(sessions, t + 3 * HOUR)
    expect(i.stamina.medianFirstDriftMin).toBe(15) // median of 10 and 20
  })

  it('produces a supportive experiment suggestion when there is data', () => {
    const i = buildWeeklyInsights([sess(), sess({}, 1_700_000_000_000 + HOUR)], 1_700_000_000_000 + 2 * HOUR)
    expect(typeof i.experiment).toBe('string')
    expect(i.experiment.length).toBeGreaterThan(0)
  })
})

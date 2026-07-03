import { describe, it, expect, beforeEach } from 'vitest'
import { recordCalibration, recordSessionSummary, getProfileStats } from '../profileHistory'

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 6, 3) // 2026-07-03

function fakeProfile(overrides = {}) {
  return {
    boundaries: { blinkRate: { min: 8, max: 19 }, gazeStability: { min: 0.002, max: 0.006 } },
    phaseMeans: { rest: {}, task: {} },
    floorW: 0.1, ceilingW: 0.9, k: 5, midpoint: 0.5, degenerate: false,
    quality: 0.95, createdAt: T0,
    ...overrides,
  }
}

describe('profileHistory', () => {
  beforeEach(() => localStorage.clear())

  it('returns null with no history', () => {
    expect(getProfileStats(T0)).toBeNull()
  })

  it('records calibrations keyed by date and aggregates stats', () => {
    recordCalibration(fakeProfile({ floorW: 0.1, ceilingW: 0.9, k: 5 }), T0)
    recordCalibration(fakeProfile({ floorW: 0.2, ceilingW: 0.8, k: 4 }), T0 + DAY)
    const stats = getProfileStats(T0 + DAY)
    expect(stats.calibrationCount).toBe(2)
    expect(stats.floorW.mean).toBeCloseTo(0.15)
    expect(stats.k.mean).toBeCloseTo(4.5)
    expect(stats.k.std).toBeCloseTo(0.5)
  })

  it('keeps one calibration per day (same-day overwrites)', () => {
    recordCalibration(fakeProfile({ k: 5 }), T0)
    recordCalibration(fakeProfile({ k: 7 }), T0 + 60_000)
    const stats = getProfileStats(T0 + 60_000)
    expect(stats.calibrationCount).toBe(1)
    expect(stats.k.mean).toBe(7)
  })

  it('prunes calibrations older than 30 days', () => {
    recordCalibration(fakeProfile(), T0 - 31 * DAY)
    recordCalibration(fakeProfile(), T0)
    const stats = getProfileStats(T0)
    expect(stats.calibrationCount).toBe(1)
  })

  it('records and prunes session summaries', () => {
    recordSessionSummary({ avgScore: 70, avgConfidence: 0.8, durationSec: 600, points: 60 }, T0 - 31 * DAY)
    recordSessionSummary({ avgScore: 76, avgConfidence: 0.9, durationSec: 1200, points: 120 }, T0)
    recordCalibration(fakeProfile(), T0)
    const stats = getProfileStats(T0)
    expect(stats.sessionCount).toBe(1)
  })

  it('survives corrupted storage', () => {
    localStorage.setItem('cogniflow_profile', '{not json')
    expect(() => recordCalibration(fakeProfile(), T0)).not.toThrow()
    expect(getProfileStats(T0).calibrationCount).toBe(1)
  })
})

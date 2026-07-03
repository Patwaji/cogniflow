import { describe, it, expect } from 'vitest'
import {
  clamp01,
  normalizeSignal,
  weightedIndex,
  deriveSigmoidParams,
  sigmoidScore,
  computeEngagementScore,
  expandCeiling,
  SIGNAL_DIRECTIONS,
} from '../engagementEngine'

describe('normalizeSignal', () => {
  it('maps value linearly between min and max', () => {
    expect(normalizeSignal(20, { min: 5, max: 25 }, 1)).toBeCloseTo(0.75)
  })

  it('inverts when direction is -1 (lower raw = more load)', () => {
    expect(normalizeSignal(20, { min: 5, max: 25 }, -1)).toBeCloseTo(0.25)
  })

  it('clamps outside bounds', () => {
    expect(normalizeSignal(100, { min: 5, max: 25 }, 1)).toBe(1)
    expect(normalizeSignal(-3, { min: 5, max: 25 }, 1)).toBe(0)
  })

  it('returns neutral 0.5 for degenerate bounds', () => {
    expect(normalizeSignal(10, { min: 7, max: 7 }, 1)).toBe(0.5)
    expect(normalizeSignal(10, null, 1)).toBe(0.5)
  })
})

describe('weightedIndex', () => {
  it('computes weighted average with percent weights', () => {
    expect(weightedIndex(
      { blinkRate: 0.8, gazeStability: 0.4 },
      { blinkRate: 50, gazeStability: 50 },
    )).toBeCloseTo(0.6)
  })

  it('renormalizes when a signal is missing', () => {
    expect(weightedIndex(
      { blinkRate: 0.8 },
      { blinkRate: 50, gazeStability: 50 },
    )).toBeCloseTo(0.8)
  })

  it('returns neutral 0.5 when nothing is usable', () => {
    expect(weightedIndex({}, { blinkRate: 50 })).toBe(0.5)
  })
})

describe('deriveSigmoidParams', () => {
  it('derives k = 4/span and midpoint between anchors', () => {
    const p = deriveSigmoidParams(0.2, 0.7)
    expect(p.k).toBeCloseTo(8)
    expect(p.midpoint).toBeCloseTo(0.45)
    expect(p.degenerate).toBe(false)
  })

  it('falls back when anchors are too close or inverted', () => {
    expect(deriveSigmoidParams(0.5, 0.52)).toEqual({ k: 4, midpoint: 0.5, degenerate: true })
    expect(deriveSigmoidParams(0.7, 0.2)).toEqual({ k: 4, midpoint: 0.5, degenerate: true })
  })
})

describe('sigmoidScore', () => {
  const params = deriveSigmoidParams(0.2, 0.7) // k=8, midpoint=0.45

  it('gives 50 at the midpoint', () => {
    expect(sigmoidScore(0.45, params)).toBeCloseTo(50)
  })

  it('maps floor anchor to ~12 and ceiling anchor to ~88', () => {
    // floor/ceiling sit at -2/+2 on the sigmoid: 100/(1+e^2) ≈ 11.92
    expect(sigmoidScore(0.2, params)).toBeCloseTo(11.92, 1)
    expect(sigmoidScore(0.7, params)).toBeCloseTo(88.08, 1)
  })

  it('is monotonic', () => {
    expect(sigmoidScore(0.9, params)).toBeGreaterThan(sigmoidScore(0.7, params))
    expect(sigmoidScore(0.0, params)).toBeLessThan(sigmoidScore(0.2, params))
  })
})

describe('computeEngagementScore', () => {
  const profile = {
    boundaries: {
      blinkRate: { min: 4, max: 20 },
      gazeStability: { min: 0.001, max: 0.01 },
    },
    k: 8,
    midpoint: 0.45,
  }
  const weights = { blinkRate: 50, gazeStability: 50 }

  it('scores high when blink is low and gaze is steady', () => {
    const r = computeEngagementScore({ blinkRate: 4, gazeStability: 0.001 }, profile, weights)
    expect(r.normalized.blinkRate).toBeCloseTo(1)
    expect(r.normalized.gazeStability).toBeCloseTo(1)
    expect(r.index).toBeCloseTo(1)
    expect(r.score).toBe(99)
  })

  it('scores low when blink is high and gaze is jittery', () => {
    const r = computeEngagementScore({ blinkRate: 20, gazeStability: 0.01 }, profile, weights)
    expect(r.index).toBeCloseTo(0)
    expect(r.score).toBe(3) // 100/(1+e^(8*0.45)) ≈ 2.66 → round 3
  })

  it('skips signals absent from raw and renormalizes', () => {
    const r = computeEngagementScore({ blinkRate: 4 }, profile, weights)
    expect(r.index).toBeCloseTo(1)
  })
})

describe('expandCeiling', () => {
  const profile = {
    floorW: 0.2, ceilingW: 0.7, k: 8, midpoint: 0.45, degenerate: false,
    boundaries: {},
  }

  it('raises ceiling and re-derives sigmoid when exceeded', () => {
    const p = expandCeiling(profile, 0.8)
    expect(p.ceilingW).toBeCloseTo(0.8)
    expect(p.k).toBeCloseTo(4 / 0.6)
    expect(p.midpoint).toBeCloseTo(0.5)
  })

  it('returns the same profile object when not exceeded', () => {
    expect(expandCeiling(profile, 0.6)).toBe(profile)
  })
})

describe('SIGNAL_DIRECTIONS', () => {
  it('locks the agreed directions', () => {
    expect(SIGNAL_DIRECTIONS.blinkRate).toBe(-1)
    expect(SIGNAL_DIRECTIONS.gazeStability).toBe(-1)
    expect(SIGNAL_DIRECTIONS.pupilRatio).toBe(1)
  })
})

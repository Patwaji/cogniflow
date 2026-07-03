import { describe, it, expect } from 'vitest'
import {
  CONFIDENCE_WEIGHTS,
  computeConfidence,
  irisStabilityFromResiduals,
  illuminationQuality,
  framerateQuality,
} from '../confidenceModel'

describe('CONFIDENCE_WEIGHTS', () => {
  it('sums to 1 with the locked split', () => {
    const total = Object.values(CONFIDENCE_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1)
    expect(CONFIDENCE_WEIGHTS.face).toBe(0.30)
    expect(CONFIDENCE_WEIGHTS.iris).toBe(0.25)
    expect(CONFIDENCE_WEIGHTS.illumination).toBe(0.20)
    expect(CONFIDENCE_WEIGHTS.calibration).toBe(0.15)
    expect(CONFIDENCE_WEIGHTS.framerate).toBe(0.10)
  })
})

describe('computeConfidence', () => {
  it('is 1 when every component is perfect', () => {
    expect(computeConfidence({
      face: 1, iris: 1, illumination: 1, calibration: 1, framerate: 1,
    })).toBeCloseTo(1)
  })

  it('treats missing components as 0', () => {
    expect(computeConfidence({ face: 1 })).toBeCloseTo(0.3)
  })

  it('clamps out-of-range components', () => {
    expect(computeConfidence({
      face: 5, iris: -2, illumination: 1, calibration: 1, framerate: 1,
    })).toBeCloseTo(0.3 + 0 + 0.2 + 0.15 + 0.1)
  })
})

describe('irisStabilityFromResiduals', () => {
  it('is 1 for perfectly stable iris (residuals <= 0)', () => {
    expect(irisStabilityFromResiduals([0, -0.001, 0])).toBe(1)
  })

  it('degrades as iris jitters beyond head motion', () => {
    const jittery = irisStabilityFromResiduals(Array(30).fill(0.003))
    const calm = irisStabilityFromResiduals(Array(30).fill(0.0005))
    expect(jittery).toBeLessThan(calm)
    expect(jittery).toBeGreaterThanOrEqual(0)
  })

  it('defaults to 1 with insufficient history', () => {
    expect(irisStabilityFromResiduals([])).toBe(1)
  })
})

describe('illuminationQuality', () => {
  it('is high for bright stable lighting', () => {
    expect(illuminationQuality(Array(20).fill(120))).toBeCloseTo(1)
  })

  it('penalizes flicker', () => {
    const flicker = illuminationQuality([120, 40, 120, 40, 120, 40, 120, 40])
    expect(flicker).toBeLessThan(0.5)
  })

  it('penalizes darkness even when stable', () => {
    expect(illuminationQuality(Array(20).fill(10))).toBeLessThan(0.5)
  })

  it('defaults to 1 with insufficient samples', () => {
    expect(illuminationQuality([])).toBe(1)
  })
})

describe('framerateQuality', () => {
  it('is 1 at or above target', () => {
    expect(framerateQuality(30, 30)).toBe(1)
    expect(framerateQuality(60, 30)).toBe(1)
  })

  it('degrades proportionally below target', () => {
    expect(framerateQuality(15, 30)).toBeCloseTo(0.5)
  })

  it('is 1 when no target is known', () => {
    expect(framerateQuality(10, 0)).toBe(1)
  })
})

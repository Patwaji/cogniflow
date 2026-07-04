import { describe, it, expect } from 'vitest'
import { percentile, buildCalibrationProfile, reweightProfile, deriveEarThreshold } from '../calibrationProfile'

const WEIGHTS = { blinkRate: 50, gazeStability: 50 }

// Rest: jittery gaze (~0.006), frequent blinks (18/min)
// Task: steady gaze (~0.002), suppressed blinks (9/min)
function makeInput(overrides = {}) {
  const restGaze = Array.from({ length: 200 }, (_, i) => 0.005 + (i % 10) * 0.0002)
  const taskGaze = Array.from({ length: 200 }, (_, i) => 0.0015 + (i % 10) * 0.0001)
  return {
    rest: { gazeSamples: restGaze, blinkRatePerMin: 18 },
    task: { gazeSamples: taskGaze, blinkRatePerMin: 9 },
    weights: WEIGHTS,
    faceDetectionRate: 1,
    now: 1234,
    blinkRateSamples: undefined,
    ...overrides,
  }
}

describe('percentile', () => {
  it('returns robust boundaries', () => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100] // 100 is an outlier
    expect(percentile(vals, 0.05)).toBe(1)
    expect(percentile(vals, 0.95)).toBeLessThan(100)
  })

  it('handles empty input', () => {
    expect(percentile([], 0.5)).toBe(0)
  })
})

describe('buildCalibrationProfile', () => {
  it('builds blink boundaries from the two phase anchors with padding', () => {
    const p = buildCalibrationProfile(makeInput())
    expect(p.boundaries.blinkRate.min).toBe(8)  // min(18,9) - 1
    expect(p.boundaries.blinkRate.max).toBe(19) // max(18,9) + 1
  })

  it('builds blink boundaries from the sample distribution (p5/p95), excluding outliers', () => {
    // 21 samples so floor-based percentile p5→idx floor(0.05*20)=1 (2nd smallest)
    // and p95→idx floor(0.95*20)=19 (2nd largest), trimming exactly the two
    // extreme outliers (2 and 60). Production collects hundreds of samples, where
    // p5/p95 trim even more robustly; this is the minimal array that exercises it.
    const blinkRateSamples = [
      2, 8, 8, 9, 9, 10, 17, 18, 18, 19, 20,
      8, 9, 9, 10, 8, 18, 19, 17, 20, 60,
    ]
    const p = buildCalibrationProfile(makeInput({ blinkRateSamples }))
    expect(p.boundaries.blinkRate.min).toBe(8)    // 2nd smallest — excludes the low outlier (2)
    expect(p.boundaries.blinkRate.max).toBe(20)   // 2nd largest — excludes the high outlier (60)
  })

  it('builds gaze boundaries from p5/p95 of combined samples', () => {
    const p = buildCalibrationProfile(makeInput())
    expect(p.boundaries.gazeStability.min).toBeGreaterThan(0.001)
    expect(p.boundaries.gazeStability.max).toBeLessThan(0.008)
    expect(p.boundaries.gazeStability.max).toBeGreaterThan(p.boundaries.gazeStability.min)
  })

  it('places rest near the floor and task near the ceiling', () => {
    const p = buildCalibrationProfile(makeInput())
    expect(p.floorW).toBeLessThan(0.3)
    expect(p.ceilingW).toBeGreaterThan(0.7)
    expect(p.degenerate).toBe(false)
    expect(p.k).toBeCloseTo(4 / (p.ceilingW - p.floorW))
    expect(p.midpoint).toBeCloseTo((p.floorW + p.ceilingW) / 2)
    expect(p.createdAt).toBe(1234)
  })

  it('gives high quality to a clean, well-separated calibration', () => {
    const p = buildCalibrationProfile(makeInput())
    expect(p.quality).toBeGreaterThan(0.9)
  })

  it('degrades to fallback sigmoid when phases are theory-inverted', () => {
    const p = buildCalibrationProfile(makeInput({
      rest: { gazeSamples: Array(200).fill(0.002), blinkRatePerMin: 9 },
      task: { gazeSamples: Array(200).fill(0.006), blinkRatePerMin: 18 },
    }))
    expect(p.degenerate).toBe(true)
    expect(p.k).toBe(4)
    expect(p.midpoint).toBe(0.5)
    expect(p.quality).toBeLessThan(0.7) // separation component is 0
  })

  it('penalizes quality for low sample coverage and poor face detection', () => {
    const p = buildCalibrationProfile(makeInput({
      rest: { gazeSamples: Array(30).fill(0.006), blinkRatePerMin: 18 },
      task: { gazeSamples: Array(30).fill(0.002), blinkRatePerMin: 9 },
      faceDetectionRate: 0.5,
    }))
    const clean = buildCalibrationProfile(makeInput())
    expect(p.quality).toBeLessThan(clean.quality)
  })
})

describe('buildCalibrationProfile with browSamples', () => {
  it('omits browFurrow boundaries/phaseMeans when browSamples are absent', () => {
    const p = buildCalibrationProfile(makeInput())
    expect(p.boundaries.browFurrow).toBeUndefined()
    expect(p.phaseMeans.rest.browFurrow).toBeUndefined()
    expect(p.phaseMeans.task.browFurrow).toBeUndefined()
  })

  it('omits browFurrow when samples are too sparse', () => {
    const p = buildCalibrationProfile(makeInput({
      browSamples: { rest: [0.3, 0.31], task: [0.25, 0.24] },
    }))
    expect(p.boundaries.browFurrow).toBeUndefined()
  })

  it('adds browFurrow boundaries/phaseMeans when task is more furrowed than rest', () => {
    // Brow ratio shrinks with furrowing; task (more load) is lower than rest.
    const restBrow = Array.from({ length: 20 }, (_, i) => 0.30 + (i % 5) * 0.002)
    const taskBrow = Array.from({ length: 20 }, (_, i) => 0.22 + (i % 5) * 0.002)
    const p = buildCalibrationProfile(makeInput({
      browSamples: { rest: restBrow, task: taskBrow },
    }))

    expect(p.boundaries.browFurrow).toBeDefined()
    expect(p.boundaries.browFurrow.max).toBeGreaterThan(p.boundaries.browFurrow.min)
    expect(p.phaseMeans.task.browFurrow).toBeGreaterThan(p.phaseMeans.rest.browFurrow)
  })
})

describe('deriveEarThreshold', () => {
  it('sets the cutoff below the open-eye baseline (fraction of the high percentile)', () => {
    // Mostly open-eye EAR ~0.30 with a few blink dips
    const samples = [0.30, 0.31, 0.29, 0.30, 0.32, 0.10, 0.30, 0.31, 0.08, 0.30]
    const th = deriveEarThreshold(samples)
    expect(th).toBeGreaterThan(0.15)
    expect(th).toBeLessThan(0.30)
    // 0.7 x p70(open); the shared `percentile` helper is floor-based (see its
    // own comment), so p70 of this array is 0.30, not the 0.31 a naive
    // nearest-rank read might suggest → 0.30 * 0.7 = 0.21
    expect(th).toBeCloseTo(0.21, 2)
  })

  it('clamps to the safe range for degenerate input', () => {
    expect(deriveEarThreshold([0.9, 0.9, 0.9])).toBe(0.28)   // absurdly high → capped
    expect(deriveEarThreshold([0.05, 0.05])).toBe(0.15)      // absurdly low → floored
    expect(deriveEarThreshold([])).toBe(0.20)                 // no data → legacy default
  })
})

describe('reweightProfile', () => {
  it('re-derives anchors and sigmoid from phase means under new weights', () => {
    const p = buildCalibrationProfile(makeInput())
    const rw = reweightProfile(p, { blinkRate: 100, gazeStability: 0 })
    expect(rw.floorW).toBeCloseTo(p.phaseMeans.rest.blinkRate)
    expect(rw.ceilingW).toBeCloseTo(p.phaseMeans.task.blinkRate)
    expect(rw.k).toBeCloseTo(4 / (rw.ceilingW - rw.floorW))
    expect(rw.boundaries).toEqual(p.boundaries)
  })
})

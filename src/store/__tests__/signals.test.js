import { describe, it, expect, beforeEach } from 'vitest'
import { buildCalibrationProfile } from '../../utils/calibrationProfile'

const WEIGHTS = { blinkRate: 50, gazeStability: 50 }

function makeProfile() {
  return buildCalibrationProfile({
    rest: { gazeSamples: Array.from({ length: 200 }, (_, i) => 0.005 + (i % 10) * 0.0002), blinkRatePerMin: 18 },
    task: { gazeSamples: Array.from({ length: 200 }, (_, i) => 0.0015 + (i % 10) * 0.0001), blinkRatePerMin: 9 },
    weights: WEIGHTS,
    faceDetectionRate: 1,
    now: 1,
  })
}

const FULL_CONFIDENCE = { face: 1, iris: 1, illumination: 1, framerate: 1 }

async function freshStore() {
  localStorage.clear()
  const mod = await import(/* @vite-ignore */ `../signals.js?bust=${Math.random()}`)
  return mod.default
}

function pump(store, payload, n = 1) {
  for (let i = 0; i < n; i++) store.getState().updateSignals(payload)
}

describe('signals store v2', () => {
  let store

  beforeEach(async () => {
    store = await freshStore()
    store.getState().setCalibrationProfile(makeProfile())
  })

  it('scores high for task-like raw signals', () => {
    pump(store, {
      raw: { blinkRate: 9, gazeStability: 0.0015 },
      display: { pupilDelta: 0.5, browFurrow: 0.5, headMovement: 0.2 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 30)
    expect(store.getState().cognitiveScore).toBeGreaterThan(75)
  })

  it('scores low for rest-like raw signals', () => {
    pump(store, {
      raw: { blinkRate: 18, gazeStability: 0.006 },
      display: { pupilDelta: 0.5, browFurrow: 0.5, headMovement: 0.2 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 30)
    expect(store.getState().cognitiveScore).toBeLessThan(25)
  })

  it('stores normalized display values under the panel keys', () => {
    pump(store, {
      raw: { blinkRate: 9, gazeStability: 0.0015 },
      display: { pupilDelta: 0.4, browFurrow: 0.6, headMovement: 0.1 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    })
    const s = store.getState()
    expect(s.blinkRate).toBeGreaterThan(0.8) // normalized load contribution
    expect(s.gazeStability).toBeGreaterThan(0.8)
    expect(s.pupilDelta).toBe(0.4)
    expect(s.browFurrow).toBe(0.6)
    expect(s.headMovement).toBe(0.1)
  })

  it('computes confidence including calibration quality', () => {
    pump(store, {
      raw: { blinkRate: 12, gazeStability: 0.003 },
      display: { pupilDelta: 0, browFurrow: 0, headMovement: 0 },
      confidenceInputs: { face: 1, iris: 1, illumination: 1, framerate: 1 },
      onScreen: true,
    })
    const { confidence, calibrationProfile } = store.getState()
    // face .3 + iris .25 + illum .2 + framerate .1 + calibration .15*quality
    expect(confidence).toBeCloseTo(0.85 + 0.15 * calibrationProfile.quality, 2)
  })

  it('expands the ceiling adaptively when live index exceeds it', () => {
    const before = store.getState().calibrationProfile.ceilingW
    // Push beyond the calibrated task anchor: blink below its boundary min,
    // gaze steadier than its boundary min → index 1.0
    pump(store, {
      raw: { blinkRate: 4, gazeStability: 0.0001 },
      display: { pupilDelta: 0, browFurrow: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 120)
    const after = store.getState().calibrationProfile.ceilingW
    expect(after).toBeGreaterThan(before)
  })

  it('does not expand the ceiling when confidence is low', () => {
    // profile set via setCalibrationProfile; push a high index under LOW confidence
    const before = store.getState().calibrationProfile.ceilingW
    pump(store, {
      raw: { blinkRate: 4, gazeStability: 0.0001 },
      display: { pupilDelta: 0, browFurrow: 0, headMovement: 0 },
      confidenceInputs: { face: 0.2, iris: 0.2, illumination: 0.2, framerate: 0.2 }, // low
      onScreen: true,
    }, 120)
    expect(store.getState().calibrationProfile.ceilingW).toBeCloseTo(before, 5)
  })

  it('caps ceiling expansion even under sustained high index + high confidence', () => {
    const before = store.getState().calibrationProfile.ceilingW
    pump(store, {
      raw: { blinkRate: 4, gazeStability: 0.0001 },
      display: { pupilDelta: 0, browFurrow: 0, headMovement: 0 },
      confidenceInputs: { face: 1, iris: 1, illumination: 1, framerate: 1 },
      onScreen: true,
    }, 300)
    const after = store.getState().calibrationProfile.ceilingW
    expect(after).toBeGreaterThan(before)
    expect(after).toBeLessThanOrEqual(before + 0.15 + 1e-6)
  })

  it('does not score before a profile exists', async () => {
    const virgin = await freshStore()
    virgin.getState().updateSignals({
      raw: { blinkRate: 9, gazeStability: 0.001 },
      display: { pupilDelta: 0, browFurrow: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    })
    expect(virgin.getState().cognitiveScore).toBe(0)
  })

  it('defaults calibrationArmed to false and arms it via armCalibration()', async () => {
    const virgin = await freshStore()
    expect(virgin.getState().calibrationArmed).toBe(false)
    virgin.getState().armCalibration()
    expect(virgin.getState().calibrationArmed).toBe(true)
  })

  it('converges cognitiveScore toward the steady-state raw score via EMA', () => {
    pump(store, {
      raw: { blinkRate: 9, gazeStability: 0.0015 },
      display: { pupilDelta: 0, browFurrow: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 200)
    const { cognitiveScore, rawScore } = store.getState()
    expect(cognitiveScore).toBeCloseTo(rawScore, 0)
  })

  it('exposes the unsmoothed rawScore alongside the EMA-smoothed cognitiveScore', () => {
    pump(store, {
      raw: { blinkRate: 12, gazeStability: 0.003 },
      display: { pupilDelta: 0, browFurrow: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 1)
    const { cognitiveScore, rawScore } = store.getState()
    // first frame seeds the EMA from the raw score, so they match exactly
    expect(cognitiveScore).toBe(Math.round(rawScore))
  })

  it('resets the EMA on recalibration so the next frame seeds from raw, not blended history', () => {
    // Drive the score toward the task end.
    pump(store, {
      raw: { blinkRate: 9, gazeStability: 0.0015 },
      display: { pupilDelta: 0, browFurrow: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 60)
    const beforeReset = store.getState().cognitiveScore
    expect(beforeReset).toBeGreaterThan(75)

    store.getState().requestRecalibration()
    store.getState().setCalibrationProfile(makeProfile())

    // First post-reset frame is a rest-like reading; if the EMA still carried
    // the pre-reset high score forward, this frame would land far above 25.
    pump(store, {
      raw: { blinkRate: 18, gazeStability: 0.006 },
      display: { pupilDelta: 0, browFurrow: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 1)
    expect(store.getState().cognitiveScore).toBeLessThan(25)
  })

  it('includes confidence and raw values in session data points', () => {
    pump(store, {
      raw: { blinkRate: 9, gazeStability: 0.0015 },
      display: { pupilDelta: 0, browFurrow: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 5)
    store.getState().startSession()
    store.getState().recordDataPoint()
    const point = store.getState().sessionDataPoints[0]
    expect(point.confidence).toBeGreaterThan(0)
    expect(point.rawBlinkRate).toBe(9)
    expect(point.rawGazeJitter).toBe(0.0015)
    expect(point.rawScore).toBe(store.getState().rawScore)
    expect(typeof point.cognitiveScore).toBe('number')
  })
})

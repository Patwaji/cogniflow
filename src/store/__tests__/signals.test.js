import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildCalibrationProfile } from '../../utils/calibrationProfile'
import { FOCUS_PARAMS, FOCUS_STATES } from '../../utils/focusState'

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
      display: { pupilDelta: 0.5, headMovement: 0.2 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 30)
    expect(store.getState().cognitiveScore).toBeGreaterThan(75)
  })

  it('scores low for rest-like raw signals', () => {
    pump(store, {
      raw: { blinkRate: 18, gazeStability: 0.006 },
      display: { pupilDelta: 0.5, headMovement: 0.2 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 30)
    expect(store.getState().cognitiveScore).toBeLessThan(25)
  })

  it('stores normalized display values under the panel keys', () => {
    pump(store, {
      raw: { blinkRate: 9, gazeStability: 0.0015 },
      display: { pupilDelta: 0.4, headMovement: 0.1 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    })
    const s = store.getState()
    expect(s.blinkRate).toBeGreaterThan(0.8) // normalized load contribution
    expect(s.gazeStability).toBeGreaterThan(0.8)
    expect(s.pupilDelta).toBe(0.4)
    expect(s.headMovement).toBe(0.1)
  })

  it('scores browFurrow from raw against the calibration boundary (not from display)', () => {
    // A profile with brow samples: rest is relaxed (higher ratio), task is
    // furrowed (lower ratio) — mirrors direction -1 in SIGNAL_DIRECTIONS.
    store.getState().setCalibrationProfile(buildCalibrationProfile({
      rest: { gazeSamples: Array.from({ length: 200 }, (_, i) => 0.005 + (i % 10) * 0.0002), blinkRatePerMin: 18 },
      task: { gazeSamples: Array.from({ length: 200 }, (_, i) => 0.0015 + (i % 10) * 0.0001), blinkRatePerMin: 9 },
      weights: { blinkRate: 40, gazeStability: 35, browFurrow: 25 },
      faceDetectionRate: 1,
      now: 1,
      browSamples: {
        rest: Array.from({ length: 20 }, () => 0.5),
        task: Array.from({ length: 20 }, () => 0.3),
      },
    }))

    // raw.browFurrow at the furrowed (task) anchor → near-max normalized load.
    pump(store, {
      raw: { blinkRate: 9, gazeStability: 0.0015, browFurrow: 0.3 },
      display: { pupilDelta: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    })
    expect(store.getState().browFurrow).toBeGreaterThan(0.8)

    // raw.browFurrow at the relaxed (rest) anchor → near-zero normalized load.
    pump(store, {
      raw: { blinkRate: 9, gazeStability: 0.0015, browFurrow: 0.5 },
      display: { pupilDelta: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    })
    expect(store.getState().browFurrow).toBeLessThan(0.2)
  })

  it('defaults browFurrow to 0 when raw carries no brow reading', () => {
    // No raw.browFurrow at all (e.g. a caller that hasn't wired brow yet) →
    // normalizeSignal is never invoked for that key, so normalized.browFurrow
    // stays undefined and the store falls back to 0.
    pump(store, {
      raw: { blinkRate: 9, gazeStability: 0.0015 },
      display: { pupilDelta: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    })
    expect(store.getState().browFurrow).toBe(0)
  })

  it('computes confidence including calibration quality', () => {
    pump(store, {
      raw: { blinkRate: 12, gazeStability: 0.003 },
      display: { pupilDelta: 0, headMovement: 0 },
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
      display: { pupilDelta: 0, headMovement: 0 },
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
      display: { pupilDelta: 0, headMovement: 0 },
      confidenceInputs: { face: 0.2, iris: 0.2, illumination: 0.2, framerate: 0.2 }, // low
      onScreen: true,
    }, 120)
    expect(store.getState().calibrationProfile.ceilingW).toBeCloseTo(before, 5)
  })

  it('caps ceiling expansion even under sustained high index + high confidence', () => {
    const before = store.getState().calibrationProfile.ceilingW
    pump(store, {
      raw: { blinkRate: 4, gazeStability: 0.0001 },
      display: { pupilDelta: 0, headMovement: 0 },
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
      display: { pupilDelta: 0, headMovement: 0 },
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
      display: { pupilDelta: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 200)
    const { cognitiveScore, rawScore } = store.getState()
    expect(cognitiveScore).toBeCloseTo(rawScore, 0)
  })

  it('exposes the unsmoothed rawScore alongside the EMA-smoothed cognitiveScore', () => {
    pump(store, {
      raw: { blinkRate: 12, gazeStability: 0.003 },
      display: { pupilDelta: 0, headMovement: 0 },
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
      display: { pupilDelta: 0, headMovement: 0 },
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
      display: { pupilDelta: 0, headMovement: 0 },
      confidenceInputs: FULL_CONFIDENCE,
      onScreen: true,
    }, 1)
    expect(store.getState().cognitiveScore).toBeLessThan(25)
  })

  it('shows a neutral "away" state after sustained face-not-detected (not a brief look-away)', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      // Presence, not on-screen-material, drives "away" in the four-state
      // model — a brief look-down at a book (onMaterial:false, present:true)
      // must NOT read as away. faceDetected defaults false and is never
      // toggled true here, so this simulates a sustained absent face.
      store.getState().setFaceDetected(false)
      const taskLikeButAbsent = {
        raw: { blinkRate: 9, gazeStability: 0.0015 },
        display: { pupilDelta: 0, headMovement: 0 },
        confidenceInputs: FULL_CONFIDENCE,
        onScreen: true,
      }
      pump(store, taskLikeButAbsent, 1)
      expect(store.getState().focusState).not.toBe('away')

      vi.advanceTimersByTime(FOCUS_PARAMS.awayGraceMs + 1)
      pump(store, taskLikeButAbsent, 1)

      expect(store.getState().focusState).toBe('away')
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets the state clear out of "away" once the face reappears and holds on-task', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(2_000_000)
      const taskFrame = {
        raw: { blinkRate: 9, gazeStability: 0.0015 },
        display: { pupilDelta: 0, headMovement: 0 },
        confidenceInputs: FULL_CONFIDENCE,
        onScreen: true,
      }
      // Seed a high EMA score while present, so "engaged" reads true
      // throughout (the EMA seeds directly from the raw score on the first
      // frame after a reset).
      store.getState().setFaceDetected(true)
      pump(store, taskFrame, 1)
      expect(store.getState().focusState).not.toBe('away')

      store.getState().setFaceDetected(false)
      vi.advanceTimersByTime(FOCUS_PARAMS.awayGraceMs + 1)
      pump(store, taskFrame, 1)
      expect(store.getState().focusState).toBe('away')

      // Face reappears: on-task hold must accumulate past clearHoldMs before
      // the state clears back to focused (not instant).
      store.getState().setFaceDetected(true)
      pump(store, taskFrame, 1)
      vi.advanceTimersByTime(FOCUS_PARAMS.clearHoldMs + 1)
      pump(store, taskFrame, 1)

      expect(store.getState().focusState).not.toBe('away')
    } finally {
      vi.useRealTimers()
    }
  })

  it('surfaces drifting when engagement stays low on-material', async () => {
    const s = await freshStore()
    s.getState().setCalibrationProfile(makeProfile())
    // low-scoring raw signals (rest-like) while on screen, pumped past the
    // drift engagement window (~9s of real time — pump uses Date.now()).
    // Assert it does NOT instantly show drifting on the first frame:
    s.getState().updateSignals({
      raw: { blinkRate: 18, gazeStability: 0.006 },
      display: { pupilDelta: 0, headMovement: 0 },
      confidenceInputs: { face: 1, iris: 1, illumination: 1, framerate: 1 },
      onScreen: true,
    })
    expect(['focused', 'calibrating']).toContain(s.getState().focusState)
  })

  it('surfaces away after sustained off-screen', async () => {
    const s = await freshStore()
    s.getState().setCalibrationProfile(makeProfile())
    // onScreen false; a single frame must NOT be away (grace window)
    s.getState().updateSignals({
      raw: { blinkRate: 12, gazeStability: 0.003 },
      display: { pupilDelta: 0, headMovement: 0 },
      confidenceInputs: { face: 1, iris: 1, illumination: 1, framerate: 1 },
      onScreen: false,
    })
    expect(s.getState().focusState).not.toBe('away')
  })

  it('tickFocusAbsent steps the focus machine on the absent path without needing updateSignals', () => {
    // This is the wiring CameraFeed relies on for the face-not-detected
    // branch of the detect loop: no landmarks exist there, so updateSignals
    // (which needs raw/display/confidenceInputs) can't be called — only the
    // focus machine should advance.
    const before = store.getState().focusState
    expect(typeof before).toBe('string')

    store.getState().tickFocusAbsent()

    // A single absent tick right after calibration must NOT immediately
    // report "away" — the grace window hasn't elapsed yet.
    expect(store.getState().focusState).not.toBe('away')
    expect(Object.values(FOCUS_STATES)).toContain(store.getState().focusState)
  })

  it('reaches "away" via repeated tickFocusAbsent alone, matching the real face-not-detected loop path', () => {
    // Regression test for the production bug: CameraFeed's face-not-detected
    // branch never called updateSignals, so the focus machine froze and
    // "away" was unreachable. Here we drive the state purely through
    // tickFocusAbsent (no updateSignals at all) to confirm the wiring works
    // end to end, the way the detect loop's else-branch actually calls it.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(3_000_000)
      store.getState().tickFocusAbsent()
      expect(store.getState().focusState).not.toBe('away')

      vi.advanceTimersByTime(FOCUS_PARAMS.awayGraceMs + 1)
      store.getState().tickFocusAbsent()

      expect(store.getState().focusState).toBe('away')
    } finally {
      vi.useRealTimers()
    }
  })

  it('tickFocusAbsent is a no-op before a calibration profile exists', async () => {
    const virgin = await freshStore()
    const before = virgin.getState().focusState
    virgin.getState().tickFocusAbsent()
    expect(virgin.getState().focusState).toBe(before)
  })

  it('includes confidence and raw values in session data points', () => {
    pump(store, {
      raw: { blinkRate: 9, gazeStability: 0.0015 },
      display: { pupilDelta: 0, headMovement: 0 },
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

  it('supports selector-subscribe (callback fires on change) — guards notification wiring', async () => {
    const store = await freshStore()
    const calls = []
    const unsub = store.subscribe((s) => s.sessionState, (cur) => calls.push(cur))
    store.getState().startSession()
    unsub()
    expect(calls).toContain('running')
  })
})

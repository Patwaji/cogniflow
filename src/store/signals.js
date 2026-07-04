import { create } from 'zustand'
import { computeEngagementScore, expandCeiling, emaNext } from '../utils/engagementEngine'
import { reweightProfile } from '../utils/calibrationProfile'
import { computeConfidence } from '../utils/confidenceModel'
import { recordSessionSummary } from '../utils/profileHistory'
import { createFocusMachine, stepFocusMachine, FOCUS_STATES } from '../utils/focusState'
import useSettingsStore from './settings'

const ROLLING_FRAMES = 90
const CEILING_CONFIDENCE_GATE = 0.6
const CEILING_MAX_EXPANSION = 0.15
// EMA smoothing constant tuned to match the responsiveness of the prior
// 90-frame flat moving average (standard EMA/SMA equivalence: alpha = 2/(N+1)),
// but with less lag and without blunting real dips/spikes.
const EMA_ALPHA = 2 / (ROLLING_FRAMES + 1)

const useSignalsStore = create((set, get) => ({
  blinkRate: 0,
  pupilDelta: 0,
  browFurrow: 0,
  gazeStability: 0,
  headMovement: 0,
  lastUpdated: null,
  faceDetected: false,

  calibrationProfile: null,
  calibrationPhase: null,
  confidence: 0,
  rawSignals: { blinkRate: 0, gazeStability: 0 },
  indexHistory: [],
  _profileWeightsKey: '',
  _originalCeilingW: null,

  isCalibrating: false,
  calibrationProgress: 0,
  calibrationArmed: false,

  cognitiveScore: 0,
  focusState: FOCUS_STATES.CALIBRATING,
  focusStateEntryTime: Date.now(),
  onScreen: true,
  drowsy: false,

  _emaScore: null,
  rawScore: 0,
  _focusMachine: null,

  sessionState: 'idle',
  sessionElapsed: 0,
  sessionStartTime: null,
  sessionDataPoints: [],
  sessionEndTime: null,

  updateSignals: ({ raw, display, confidenceInputs, onScreen = true }) => {
    const state = get()
    let profile = state.calibrationProfile
    if (!profile) return

    const now = Date.now()
    const settings = useSettingsStore.getState()

    // Re-derive sigmoid anchors if the user changed weights since calibration.
    const weightsKey = JSON.stringify(settings.weights)
    if (weightsKey !== state._profileWeightsKey) {
      profile = reweightProfile(profile, settings.weights)
    }

    const { score, index, normalized } = computeEngagementScore(raw, profile, settings.weights)

    // EMA smoothing: less lag than the old 90-frame flat average and it
    // preserves real dips/spikes instead of blunting them (important for
    // retrospective validation), while `rawScore` keeps the unsmoothed
    // per-frame value around for a later raw/smoothed toggle.
    const rawScore = score
    const nextEmaScore = state._emaScore == null ? rawScore : emaNext(state._emaScore, rawScore, EMA_ALPHA)
    const smoothedScore = Math.round(nextEmaScore)

    const confidence = computeConfidence({
      ...confidenceInputs,
      calibration: profile.quality,
    })

    // Adaptive ceiling driven by the smoothed weighted index, not raw spikes.
    // Only when the reading is trustworthy, and never runaway.
    const indexHistory = [...state.indexHistory, index]
    while (indexHistory.length > ROLLING_FRAMES) indexHistory.shift()
    const smoothedIndex = indexHistory.reduce((a, b) => a + b, 0) / indexHistory.length
    const originalCeilingW = state._originalCeilingW ?? profile.ceilingW
    if (
      indexHistory.length >= ROLLING_FRAMES &&
      confidence >= CEILING_CONFIDENCE_GATE
    ) {
      const cap = originalCeilingW + CEILING_MAX_EXPANSION
      const target = Math.min(smoothedIndex, cap)
      profile = expandCeiling(profile, target)
    }

    // Drive the formal four-state focus model. Inputs are plain booleans
    // derived from the reliable signals; the reducer owns all hysteresis.
    const focusedTh = settings.thresholds.focused ?? 55
    const machine = state._focusMachine ?? createFocusMachine(now)
    const { state: focusState, since: focusStateEntryTime } = stepFocusMachine(
      machine,
      {
        present: state.faceDetected,
        onMaterial: onScreen,
        drowsy: state.drowsy,
        engaged: smoothedScore >= focusedTh,
        confidence,
        calibrating: state.isCalibrating,
      },
      now,
    )

    set({
      blinkRate: normalized.blinkRate ?? 0,
      gazeStability: normalized.gazeStability ?? 0,
      pupilDelta: display.pupilDelta,
      browFurrow: normalized.browFurrow ?? 0,
      headMovement: display.headMovement,
      onScreen,
      rawSignals: raw,
      confidence,
      calibrationProfile: profile,
      _profileWeightsKey: weightsKey,
      _originalCeilingW: originalCeilingW,
      indexHistory,
      lastUpdated: now,
      cognitiveScore: smoothedScore,
      focusState,
      focusStateEntryTime,
      _emaScore: nextEmaScore,
      rawScore,
      _focusMachine: machine,
    })
  },

  setCalibration: (val) => set({
    isCalibrating: val,
    calibrationProgress: val ? 0 : 100,
    calibrationPhase: val ? 'rest' : null,
    ...(val ? { focusState: FOCUS_STATES.CALIBRATING, focusStateEntryTime: Date.now() } : {}),
    _emaScore: null,
    indexHistory: [],
    _focusMachine: null,
  }),

  setCalibrationProgress: (progress) => set({
    calibrationProgress: progress,
  }),

  setCalibrationPhase: (phase) => set({ calibrationPhase: phase }),

  armCalibration: () => set({ calibrationArmed: true }),

  setCalibrationProfile: (profile) => set({
    calibrationProfile: profile,
    _originalCeilingW: profile.ceilingW,
    _profileWeightsKey: JSON.stringify(useSettingsStore.getState().weights),
    isCalibrating: false,
    calibrationProgress: 100,
    calibrationPhase: null,
    _emaScore: null,
    indexHistory: [],
    _focusMachine: null,
  }),

  setFaceDetected: (detected) => set({
    faceDetected: detected,
  }),

  // Steps ONLY the focus machine with an absent frame (no landmarks, so no
  // scoring input exists). Called from the face-not-detected branch of the
  // detect loop — without this, `stepFocusMachine` is never fed a
  // `present:false` frame and `lastPresentAt` never ages past the away-grace
  // window, so AWAY is unreachable once the user actually leaves the frame.
  tickFocusAbsent: () => set((state) => {
    if (!state.calibrationProfile) return {}
    const now = Date.now()
    const machine = state._focusMachine ?? createFocusMachine(now)
    const { state: focusState, since: focusStateEntryTime } = stepFocusMachine(
      machine,
      { present: false, onMaterial: false, drowsy: state.drowsy, engaged: false, confidence: 0, calibrating: state.isCalibrating },
      now,
    )
    return { focusState, focusStateEntryTime, _focusMachine: machine }
  }),

  setDrowsy: (val) => set((state) => {
    if (val && !state.drowsy) {
      return {
        drowsy: true,
        _focusMachine: null,
      }
    }
    if (!val && state.drowsy) {
      return {
        drowsy: false,
        _emaScore: null,
        _focusMachine: null,
      }
    }
    return {}
  }),

  _recalibrateTick: 0,

  requestRecalibration: () => set((state) => ({
    _recalibrateTick: state._recalibrateTick + 1,
    isCalibrating: true,
    calibrationProgress: 0,
    calibrationPhase: 'rest',
    calibrationProfile: null,
    _originalCeilingW: null,
    focusState: FOCUS_STATES.CALIBRATING,
    focusStateEntryTime: Date.now(),
    _emaScore: null,
    indexHistory: [],
    _focusMachine: null,
  })),

  startSession: () => set({
    sessionState: 'running',
    sessionElapsed: 0,
    sessionStartTime: Date.now(),
    sessionDataPoints: [],
    sessionEndTime: null,
  }),

  recordDataPoint: () => set((state) => {
    if (state.sessionState !== 'running') return {}
    const point = {
      timestamp: Date.now(),
      cognitiveScore: state.cognitiveScore,
      rawScore: state.rawScore,
      confidence: state.confidence,
      blinkRate: state.blinkRate,
      pupilDelta: state.pupilDelta,
      browFurrow: state.browFurrow,
      gazeStability: state.gazeStability,
      headMovement: state.headMovement,
      rawBlinkRate: state.rawSignals.blinkRate,
      rawGazeJitter: state.rawSignals.gazeStability,
      focusState: state.focusState,
      drowsy: state.drowsy,
    }
    return { sessionDataPoints: [...state.sessionDataPoints, point] }
  }),

  pauseSession: () => set((state) => ({
    sessionState: 'paused',
    sessionPausedAt: Date.now(),
  })),

  resumeSession: () => set((state) => {
    const pausedDuration = Date.now() - (state.sessionPausedAt || Date.now())
    return {
      sessionState: 'running',
      sessionStartTime: (state.sessionStartTime || 0) + pausedDuration,
    }
  }),

  stopSession: () => set((state) => {
    const points = state.sessionDataPoints
    if (points.length > 0) {
      const avg = (key) => points.reduce((a, p) => a + (p[key] ?? 0), 0) / points.length
      recordSessionSummary({
        avgScore: Math.round(avg('cognitiveScore')),
        avgConfidence: Number(avg('confidence').toFixed(2)),
        durationSec: state.sessionElapsed,
        points: points.length,
      })
    }
    return {
      sessionState: 'idle',
      sessionEndTime: Date.now(),
    }
  }),

  discardSession: () => set({
    sessionDataPoints: [],
    sessionElapsed: 0,
    sessionStartTime: null,
    sessionEndTime: null,
  }),

  tickSession: () => set((state) => {
    if (state.sessionState !== 'running' || !state.sessionStartTime) return {}
    const elapsed = Math.floor((Date.now() - state.sessionStartTime) / 1000)
    return { sessionElapsed: elapsed }
  }),
}))

export function useCognitiveScore() {
  const cognitiveScore = useSignalsStore((s) => s.cognitiveScore)
  const focusState = useSignalsStore((s) => s.focusState)
  return { cognitiveScore, focusState }
}

export default useSignalsStore

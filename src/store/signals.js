import { create } from 'zustand'
import { computeEngagementScore, expandCeiling } from '../utils/engagementEngine'
import { reweightProfile } from '../utils/calibrationProfile'
import { computeConfidence } from '../utils/confidenceModel'
import { recordSessionSummary } from '../utils/profileHistory'
import useSettingsStore from './settings'

const ROLLING_FRAMES = 90
const DISTRACTED_HOLD_MS = 10000
const FLOW_HOLD_MS = 30000

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

  isCalibrating: false,
  calibrationProgress: 0,

  cognitiveScore: 0,
  focusState: 'calibrating',
  focusStateEntryTime: Date.now(),
  onScreen: true,
  drowsy: false,

  scoreHistory: [],
  distractedSince: null,
  flowSince: null,

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

    const history = [...state.scoreHistory, score]
    while (history.length > ROLLING_FRAMES) history.shift()
    const smoothedScore = Math.round(history.reduce((a, b) => a + b, 0) / history.length)

    // Adaptive ceiling driven by the smoothed weighted index, not raw spikes.
    const indexHistory = [...state.indexHistory, index]
    while (indexHistory.length > ROLLING_FRAMES) indexHistory.shift()
    const smoothedIndex = indexHistory.reduce((a, b) => a + b, 0) / indexHistory.length
    if (indexHistory.length >= ROLLING_FRAMES) {
      profile = expandCeiling(profile, smoothedIndex)
    }

    const confidence = computeConfidence({
      ...confidenceInputs,
      calibration: profile.quality,
    })

    const t = settings.thresholds
    const distractedTh = t.distracted ?? 20
    const focusedTh = t.focused
    const flowTh = t.flow

    let focusState = state.focusState
    let focusStateEntryTime = state.focusStateEntryTime
    let distractedSince = state.distractedSince
    let flowSince = state.flowSince

    if (focusState !== 'calibrating' && !state.drowsy) {
      if (smoothedScore < distractedTh) {
        if (distractedSince === null) {
          distractedSince = now
          if (focusState !== 'normal') {
            focusState = 'normal'
            focusStateEntryTime = now
          }
        }
        const newState = (now - distractedSince >= DISTRACTED_HOLD_MS) ? 'distracted' : 'normal'
        if (newState !== focusState) {
          focusState = newState
          focusStateEntryTime = now
        }
        flowSince = null
      } else if (smoothedScore < focusedTh) {
        if (focusState !== 'normal') {
          focusState = 'normal'
          focusStateEntryTime = now
        }
        distractedSince = null
        flowSince = null
      } else if (smoothedScore < flowTh) {
        if (focusState !== 'focused') {
          focusState = 'focused'
          focusStateEntryTime = now
        }
        distractedSince = null
        flowSince = null
      } else {
        if (flowSince === null) {
          flowSince = now
          if (focusState !== 'focused') {
            focusState = 'focused'
            focusStateEntryTime = now
          }
        }
        const newState = (now - flowSince >= FLOW_HOLD_MS) ? 'flow' : 'focused'
        if (newState !== focusState) {
          focusState = newState
          focusStateEntryTime = now
        }
        distractedSince = null
      }
    }

    set({
      blinkRate: normalized.blinkRate ?? 0,
      gazeStability: normalized.gazeStability ?? 0,
      pupilDelta: display.pupilDelta,
      browFurrow: display.browFurrow,
      headMovement: display.headMovement,
      onScreen,
      rawSignals: raw,
      confidence,
      calibrationProfile: profile,
      _profileWeightsKey: weightsKey,
      indexHistory,
      lastUpdated: now,
      cognitiveScore: smoothedScore,
      focusState,
      focusStateEntryTime,
      scoreHistory: history,
      distractedSince,
      flowSince,
    })
  },

  setCalibration: (val) => set({
    isCalibrating: val,
    calibrationProgress: val ? 0 : 100,
    calibrationPhase: val ? 'rest' : null,
    focusState: val ? 'calibrating' : 'normal',
    focusStateEntryTime: Date.now(),
    scoreHistory: [],
    indexHistory: [],
    distractedSince: null,
    flowSince: null,
  }),

  setCalibrationProgress: (progress) => set({
    calibrationProgress: progress,
  }),

  setCalibrationPhase: (phase) => set({ calibrationPhase: phase }),

  setCalibrationProfile: (profile) => set({
    calibrationProfile: profile,
    _profileWeightsKey: JSON.stringify(useSettingsStore.getState().weights),
    isCalibrating: false,
    calibrationProgress: 100,
    calibrationPhase: null,
    focusState: 'normal',
    focusStateEntryTime: Date.now(),
    scoreHistory: [],
    indexHistory: [],
    distractedSince: null,
    flowSince: null,
  }),

  setFaceDetected: (detected) => set({
    faceDetected: detected,
  }),

  setDrowsy: (val) => set((state) => {
    if (val && !state.drowsy) {
      return {
        drowsy: true,
        focusState: 'drowsy',
        focusStateEntryTime: Date.now(),
      }
    }
    if (!val && state.drowsy) {
      return {
        drowsy: false,
        focusState: 'normal',
        focusStateEntryTime: Date.now(),
        scoreHistory: [],
        distractedSince: null,
        flowSince: null,
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
    focusState: 'calibrating',
    focusStateEntryTime: Date.now(),
    scoreHistory: [],
    indexHistory: [],
    distractedSince: null,
    flowSince: null,
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

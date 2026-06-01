import { create } from 'zustand'
import { computeCognitiveScore } from '../utils/scoreEngine'
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

  isCalibrating: false,
  calibrationProgress: 0,

  cognitiveScore: 0,
  focusState: 'calibrating',
  focusStateEntryTime: Date.now(),
  onScreen: true,

  scoreHistory: [],
  distractedSince: null,
  flowSince: null,

  sessionState: 'idle',
  sessionElapsed: 0,
  sessionStartTime: null,
  sessionDataPoints: [],
  sessionEndTime: null,

  updateSignals: (signals) => {
    const state = get()
    const now = Date.now()
    const { onScreen = true, ...signalValues } = signals
    const settings = useSettingsStore.getState()
    const rawScore = computeCognitiveScore(signalValues, settings.weights)
    const history = [...state.scoreHistory, rawScore]
    while (history.length > ROLLING_FRAMES) history.shift()
    const len = history.length
    const smoothedScore = len > 0
      ? Math.round(history.reduce((a, b) => a + b, 0) / len)
      : 0

    const t = settings.thresholds
    const distractedTh = t.distracted ?? 20
    const focusedTh = t.focused
    const flowTh = t.flow

    let focusState = state.focusState
    let focusStateEntryTime = state.focusStateEntryTime
    let distractedSince = state.distractedSince
    let flowSince = state.flowSince

    if (focusState !== 'calibrating') {
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
      ...signals,
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
    focusState: val ? 'calibrating' : 'normal',
    focusStateEntryTime: Date.now(),
    scoreHistory: [],
    distractedSince: null,
    flowSince: null,
  }),

  setCalibrationProgress: (progress) => set({
    calibrationProgress: progress,
  }),

  setFaceDetected: (detected) => set({
    faceDetected: detected,
  }),

  _recalibrateTick: 0,

  requestRecalibration: () => set((state) => ({
    _recalibrateTick: state._recalibrateTick + 1,
    isCalibrating: true,
    calibrationProgress: 0,
    focusState: 'calibrating',
    focusStateEntryTime: Date.now(),
    scoreHistory: [],
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
      blinkRate: state.blinkRate,
      pupilDelta: state.pupilDelta,
      browFurrow: state.browFurrow,
      gazeStability: state.gazeStability,
      headMovement: state.headMovement,
      focusState: state.focusState,
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

  stopSession: () => set((state) => ({
    sessionState: 'idle',
    sessionEndTime: Date.now(),
  })),

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

import { useRef, useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import useSignalsStore from '../store/signals'
import useSettingsStore from '../store/settings'
import { setLatestLandmarks } from '../utils/latestLandmarks'
import {
  calculateEAR,
  calculateIrisRadius,
  calculateBrowRatio,
  calculateIrisCentroid,
  calculateGazeRatio,
  getNoseTip,
  clamp01,
  LEFT_IRIS_IDS,
  RIGHT_IRIS_IDS,
  estimateOnMaterial,
} from '../utils/signalExtractor'
import { buildCalibrationProfile } from '../utils/calibrationProfile'
import {
  irisStabilityFromResiduals,
  illuminationQuality,
  framerateQuality,
} from '../utils/confidenceModel'
import { recordCalibration } from '../utils/profileHistory'
import './CameraFeed.css'

const BLINK_THRESHOLD = 0.2
const DROWSY_EAR_THRESHOLD = 0.22
const DROWSY_DURATION_MS = 500
const BLINK_WINDOW_MS = 15000
const BLINK_RATE_SCALE = 60000 / BLINK_WINDOW_MS // window count → blinks/min
const GAZE_HISTORY_LENGTH = 30
const HEAD_HISTORY_LENGTH = 30
const NORMAL_FPS = 33
const LOW_FPS = 66
const CALIB_SETTLE_MS = 3000
const MIN_PHASE_SAMPLES = 60
const FACE_HISTORY_LENGTH = 90
const LUMA_SAMPLE_EVERY = 30
const LUMA_HISTORY_LENGTH = 20
const RESIDUAL_HISTORY_LENGTH = 30
const FPS_HISTORY_LENGTH = 30

function makeCalibState() {
  return {
    phase: 'rest',
    phaseStart: null,
    rest: { gazeSamples: [], earSamples: [], blinks: 0, irisRadiusSum: 0, frames: 0, browSamples: [] },
    task: { gazeSamples: [], blinks: 0, browSamples: [] },
    blinkRateSamples: [], // rolling blinks/min sampled across both phases, for percentile boundaries
    framesTotal: 0,
    framesWithFace: 0,
  }
}

export default function CameraFeed() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [modelLoading, setModelLoading] = useState(true)
  const [lowPower, setLowPower] = useState(false)
  const frameIntervalRef = useRef(NORMAL_FPS)

  const performanceMode = useSettingsStore((s) => s.performanceMode)
  const updateSignals = useSignalsStore((s) => s.updateSignals)
  const setCalibration = useSignalsStore((s) => s.setCalibration)
  const setCalibrationProgress = useSignalsStore((s) => s.setCalibrationProgress)
  const setCalibrationPhase = useSignalsStore((s) => s.setCalibrationPhase)
  const setCalibrationProfile = useSignalsStore((s) => s.setCalibrationProfile)
  const setFaceDetected = useSignalsStore((s) => s.setFaceDetected)
  const tickFocusAbsent = useSignalsStore((s) => s.tickFocusAbsent)
  const setDrowsy = useSignalsStore((s) => s.setDrowsy)
  const recalibrateTick = useSignalsStore((s) => s._recalibrateTick)
  const cameraOff = useSignalsStore((s) => s.cameraOff)

  const animFrameRef = useRef(null)
  const streamRef = useRef(null)
  const faceLandmarkerRef = useRef(null)
  const cameraOffRef = useRef(cameraOff)

  const blinkTimestamps = useRef([])
  const gazeHistory = useRef([])
  const headHistory = useRef([])
  const lastEAR = useRef(1.0)
  const drowsyClosedAt = useRef(null)
  const isDrowsy = useRef(false)

  const calib = useRef(null) // null → not started; see makeCalibState()
  const calibrationDone = useRef(false)

  // Display-only baseline (pupilDelta panel), captured during rest. browFurrow
  // is now scored against the calibration profile's boundaries instead.
  const displayBaseline = useRef({ avgIrisRadius: null })

  // Confidence inputs
  const faceHistory = useRef([])      // 1|0 per processed frame
  const lumaSamples = useRef([])      // mean luma 0..255, sampled every LUMA_SAMPLE_EVERY frames
  const irisResiduals = useRef([])    // per-frame max(0, |irisΔ| - |noseΔ|)
  const frameTimes = useRef([])       // processed-frame timestamps for fps
  const frameCounter = useRef(0)
  const prevIris = useRef(null)
  const prevNose = useRef(null)
  const lumaCanvas = useRef(null)

  useEffect(() => {
    cameraOffRef.current = cameraOff
  }, [cameraOff])

  // Single source of truth for stream acquisition. Runs on mount (cameraOff
  // starts false) and again whenever cameraOff toggles. When switching to
  // off, the cleanup below stops the previous run's tracks and clears the
  // video element; the "off" branch then does no new acquisition, so there
  // is never more than one live stream and never a double-acquire on mount.
  useEffect(() => {
    if (cameraOff) {
      setFaceDetected(false)
      return undefined
    }

    // Captured once per effect run (not re-read in cleanup) so the
    // react-hooks/exhaustive-deps ref-in-cleanup check is satisfied — the
    // node itself doesn't change across the lifetime of a single run.
    const videoEl = videoRef.current
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoEl) {
          videoEl.srcObject = stream
        }
      } catch {
        if (!cancelled) setPermissionDenied(true)
      }
    }
    startCamera()

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (videoEl) {
        videoEl.srcObject = null
      }
    }
  }, [cameraOff, setFaceDetected])

  useEffect(() => {
    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks('/wasm')
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        })
        faceLandmarkerRef.current = faceLandmarker
        setModelLoading(false)
      } catch (err) {
        console.error('Failed to load MediaPipe:', err)
      }
    }
    initMediaPipe()
    return () => {
      faceLandmarkerRef.current?.close()
    }
  }, [])

  useEffect(() => {
    // Only available inside the Tauri shell — in a plain browser
    // getCurrentWindow() throws and would crash the whole tree.
    if (!('__TAURI_INTERNALS__' in window)) return undefined
    let cancelled = false
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!cancelled) setLowPower(!focused)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    frameIntervalRef.current = (lowPower || performanceMode) ? LOW_FPS : NORMAL_FPS
  }, [lowPower, performanceMode])

  useEffect(() => {
    calib.current = null
    calibrationDone.current = false
    displayBaseline.current = { avgIrisRadius: null }
  }, [recalibrateTick])

  useEffect(() => {
    if (modelLoading) return

    let lastTimestamp = -1

    function detectLoop() {
      const video = videoRef.current
      const canvas = canvasRef.current
      const faceLandmarker = faceLandmarkerRef.current

      if (cameraOffRef.current || !video || !canvas || !faceLandmarker || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(detectLoop)
        return
      }

      const now = performance.now()
      if (now - lastTimestamp < frameIntervalRef.current) {
        animFrameRef.current = requestAnimationFrame(detectLoop)
        return
      }
      lastTimestamp = now

      frameTimes.current.push(now)
      if (frameTimes.current.length > FPS_HISTORY_LENGTH) frameTimes.current.shift()

      frameCounter.current++
      if (frameCounter.current % LUMA_SAMPLE_EVERY === 0) {
        sampleLuma(video)
      }

      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      const result = faceLandmarker.detectForVideo(video, now)

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        setFaceDetected(true)
        pushFace(1)
        const landmarks = result.faceLandmarks[0]
        drawLandmarks(ctx, landmarks, canvas.width, canvas.height)
        setLatestLandmarks(landmarks)
        processFrame(landmarks)
      } else {
        setFaceDetected(false)
        pushFace(0)
        tickFocusAbsent()
      }

      animFrameRef.current = requestAnimationFrame(detectLoop)
    }

    animFrameRef.current = requestAnimationFrame(detectLoop)

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [modelLoading])

  function pushFace(v) {
    faceHistory.current.push(v)
    if (faceHistory.current.length > FACE_HISTORY_LENGTH) faceHistory.current.shift()
    if (calib.current && !calibrationDone.current) {
      calib.current.framesTotal++
      if (v) calib.current.framesWithFace++
    }
  }

  function sampleLuma(video) {
    if (!lumaCanvas.current) {
      lumaCanvas.current = document.createElement('canvas')
      lumaCanvas.current.width = 32
      lumaCanvas.current.height = 24
    }
    const c = lumaCanvas.current
    const ctx = c.getContext('2d', { willReadFrequently: true })
    try {
      ctx.drawImage(video, 0, 0, c.width, c.height)
      const { data } = ctx.getImageData(0, 0, c.width, c.height)
      let sum = 0
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      }
      lumaSamples.current.push(sum / (data.length / 4))
      if (lumaSamples.current.length > LUMA_HISTORY_LENGTH) lumaSamples.current.shift()
    } catch {}
  }

  function processFrame(landmarks) {
    const ear = calculateEAR(landmarks)
    const irisRadiusL = calculateIrisRadius(landmarks, LEFT_IRIS_IDS)
    const irisRadiusR = calculateIrisRadius(landmarks, RIGHT_IRIS_IDS)
    const avgIrisRadius = (irisRadiusL + irisRadiusR) / 2
    const browRatio = calculateBrowRatio(landmarks)
    const irisCentroid = calculateIrisCentroid(landmarks)
    const noseTip = getNoseTip(landmarks)

    // Per-user blink threshold (same derivation blink detection uses below),
    // computed here so the gaze push can skip blink frames: closed/closing
    // eyes make the vertical gaze ratio unreliable (see calculateGazeRatio),
    // and letting those frames into gazeHistory would inject spikes into
    // gaze-jitter variance.
    const earTh = calibrationDone.current
      ? (useSignalsStore.getState().calibrationProfile?.earThreshold ?? BLINK_THRESHOLD)
      : BLINK_THRESHOLD

    const gazePoint = calculateGazeRatio(landmarks)
    if (ear >= earTh) {
      gazeHistory.current.push(gazePoint)
      if (gazeHistory.current.length > GAZE_HISTORY_LENGTH) {
        gazeHistory.current.shift()
      }
    }

    headHistory.current.push({ x: noseTip.x, y: noseTip.y })
    if (headHistory.current.length > HEAD_HISTORY_LENGTH) {
      headHistory.current.shift()
    }

    // Iris temporal-stability residual: iris motion beyond head motion is
    // tracker jitter (MediaPipe exposes no landmark error, so temporal
    // stability is the proxy).
    if (prevIris.current && prevNose.current) {
      const irisD = Math.hypot(irisCentroid.x - prevIris.current.x, irisCentroid.y - prevIris.current.y)
      const noseD = Math.hypot(noseTip.x - prevNose.current.x, noseTip.y - prevNose.current.y)
      irisResiduals.current.push(Math.max(0, irisD - noseD))
      if (irisResiduals.current.length > RESIDUAL_HISTORY_LENGTH) irisResiduals.current.shift()
    }
    prevIris.current = irisCentroid
    prevNose.current = { x: noseTip.x, y: noseTip.y }

    const now = Date.now()

    // Blink edge detection over a 15s window, scaled to blinks/min. Once
    // calibration is done, use the per-user threshold derived from rest-phase
    // EAR (falls back to the fixed constant pre-calibration / if missing).
    // earTh is computed above, alongside the gaze-history push.
    let blinked = false
    if (ear < earTh && lastEAR.current >= earTh) {
      blinked = true
      blinkTimestamps.current.push(now)
    }
    lastEAR.current = ear
    blinkTimestamps.current = blinkTimestamps.current.filter((t) => t > now - BLINK_WINDOW_MS)
    const blinkRatePerMin = blinkTimestamps.current.length * BLINK_RATE_SCALE

    // Drowsiness detection (unchanged) — skipped while calibration is still
    // in progress so a drowsy blink mid-calibration can't desync focusState
    // from isCalibrating or fire a drowsy notification during the flow.
    if (calibrationDone.current) {
      if (ear < DROWSY_EAR_THRESHOLD) {
        if (!drowsyClosedAt.current) {
          drowsyClosedAt.current = now
        } else if (now - drowsyClosedAt.current >= DROWSY_DURATION_MS && !isDrowsy.current) {
          isDrowsy.current = true
          setDrowsy(true)
        }
      } else {
        drowsyClosedAt.current = null
        if (isDrowsy.current) {
          isDrowsy.current = false
          setDrowsy(false)
        }
      }
    }

    const gazeJitter = pointVariance(gazeHistory.current)

    if (!calibrationDone.current) {
      const armed = useSettingsStore.getState().onboardingDone || useSignalsStore.getState().calibrationArmed
      if (!armed) return
      runCalibration({ now, gazeJitter, blinked, avgIrisRadius, browRatio, ear, blinkRatePerMin })
      return
    }

    const baseline = displayBaseline.current
    const display = {
      pupilDelta: clamp01((avgIrisRadius / baseline.avgIrisRadius - 0.95) / 0.1),
      headMovement: clamp01(Math.min(pointVariance(headHistory.current) / 0.005, 1)),
    }

    const ft = frameTimes.current
    const actualFps = ft.length > 1 ? ((ft.length - 1) / (ft[ft.length - 1] - ft[0])) * 1000 : 0
    const confidenceInputs = {
      face: faceHistory.current.length
        ? faceHistory.current.reduce((a, b) => a + b, 0) / faceHistory.current.length
        : 0,
      iris: irisStabilityFromResiduals(irisResiduals.current),
      illumination: illuminationQuality(lumaSamples.current),
      framerate: framerateQuality(actualFps, 1000 / frameIntervalRef.current),
    }

    // "On material" = looking at the screen OR down at paper/notebook on the
    // desk (head forward). Head-direction based, so pen-and-paper work reads as
    // on-task; only a head-turn / far side-glance counts as drifting.
    const onMaterial = estimateOnMaterial(landmarks)

    updateSignals({
      raw: { blinkRate: blinkRatePerMin, gazeStability: gazeJitter, browFurrow: browRatio },
      display,
      confidenceInputs,
      onScreen: onMaterial,
    })
  }

  function runCalibration({ now, gazeJitter, blinked, avgIrisRadius, browRatio, ear, blinkRatePerMin }) {
    if (!calib.current) {
      calib.current = makeCalibState()
      setCalibration(true)
    }
    const c = calib.current
    if (!c.phaseStart) {
      c.phaseStart = now
      setCalibrationPhase(c.phase)
    }

    const totalMs = useSettingsStore.getState().calibrationDuration * 1000
    const phaseMs = totalMs / 2
    const phaseElapsed = now - c.phaseStart
    const overall = c.phase === 'rest' ? phaseElapsed : phaseMs + phaseElapsed
    setCalibrationProgress(Math.round(Math.min(overall / totalMs, 1) * 100))

    // Collect after the settle window
    if (phaseElapsed > CALIB_SETTLE_MS) {
      const bucket = c[c.phase]
      bucket.gazeSamples.push(gazeJitter)
      bucket.browSamples.push(browRatio)
      if (blinked) bucket.blinks++
      c.blinkRateSamples.push(blinkRatePerMin)
      if (c.phase === 'rest') {
        bucket.irisRadiusSum += avgIrisRadius
        bucket.frames++
        bucket.earSamples.push(ear)
      }
    }

    if (phaseElapsed < phaseMs) return

    if (c.phase === 'rest') {
      c.phase = 'task'
      c.phaseStart = now
      setCalibrationPhase('task')
      return
    }

    // Task phase finished → validate and build the profile
    const usableMin = (phaseMs - CALIB_SETTLE_MS) / 60000
    if (
      c.rest.gazeSamples.length < MIN_PHASE_SAMPLES ||
      c.task.gazeSamples.length < MIN_PHASE_SAMPLES ||
      c.rest.frames < 10
    ) {
      calib.current = null // restart calibration from the rest phase
      return
    }

    displayBaseline.current = {
      avgIrisRadius: c.rest.irisRadiusSum / c.rest.frames,
    }

    const profile = buildCalibrationProfile({
      rest: { gazeSamples: c.rest.gazeSamples, blinkRatePerMin: c.rest.blinks / usableMin },
      task: { gazeSamples: c.task.gazeSamples, blinkRatePerMin: c.task.blinks / usableMin },
      weights: useSettingsStore.getState().weights,
      faceDetectionRate: c.framesTotal ? c.framesWithFace / c.framesTotal : 0,
      now,
      restEarSamples: c.rest.earSamples,
      blinkRateSamples: c.blinkRateSamples,
      browSamples: { rest: c.rest.browSamples, task: c.task.browSamples },
    })

    calibrationDone.current = true
    setCalibrationProfile(profile)
    recordCalibration(profile, now)
  }

  if (permissionDenied) {
    return (
      <div className="camera-permission-denied">
        <div className="permission-icon"><Camera size={40} /></div>
        <h2>Camera Access Required</h2>
        <p>CogniFlow needs webcam access to be your focus companion.</p>
        <p>Please grant camera permission and restart.</p>
      </div>
    )
  }

  return (
    <div className="camera-feed">
      {modelLoading && (
        <div className="camera-loading">
          <div className="loading-spinner" />
          <p>Loading face tracking model...</p>
        </div>
      )}
      <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
      <canvas ref={canvasRef} className="camera-canvas" />
    </div>
  )
}

function pointVariance(points) {
  if (points.length < 2) return 0
  const n = points.length
  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  const cx = sx / n
  const cy = sy / n
  let sum = 0
  for (const p of points) {
    const dx = p.x - cx
    const dy = p.y - cy
    sum += dx * dx + dy * dy
  }
  return sum / n
}

function drawLandmarks(ctx, landmarks, w, h) {
  ctx.fillStyle = 'rgba(94, 92, 230, 0.5)'
  for (let i = 0; i < landmarks.length; i++) {
    const x = landmarks[i].x * w
    const y = landmarks[i].y * h
    ctx.beginPath()
    ctx.arc(x, y, 1.5, 0, 2 * Math.PI)
    ctx.fill()
  }
}

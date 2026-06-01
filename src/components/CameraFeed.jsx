import { useRef, useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import useSignalsStore from '../store/signals'
import useSettingsStore from '../store/settings'
import { setLatestLandmarks } from '../utils/latestLandmarks'
import {
  calculateEAR,
  calculateIrisRadius,
  calculateBrowDistance,
  calculateIrisCentroid,
  getNoseTip,
  clamp01,
  LEFT_IRIS_IDS,
  RIGHT_IRIS_IDS,
  estimateScreenEngagement,
} from '../utils/signalExtractor'
import './CameraFeed.css'

const BLINK_THRESHOLD = 0.2
const ROLLING_WINDOW_MS = 60000
const GAZE_HISTORY_LENGTH = 30
const HEAD_HISTORY_LENGTH = 30
const NORMAL_FPS = 33
const LOW_FPS = 66

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
  const setFaceDetected = useSignalsStore((s) => s.setFaceDetected)
  const recalibrateTick = useSignalsStore((s) => s._recalibrateTick)

  const animFrameRef = useRef(null)
  const streamRef = useRef(null)
  const faceLandmarkerRef = useRef(null)

  const blinkTimestamps = useRef([])
  const gazeHistory = useRef([])
  const headHistory = useRef([])
  const lastEAR = useRef(1.0)

  const calibrationStart = useRef(null)
  const calibrationData = useRef({
    earSum: 0, earCount: 0,
    irisRadiusSum: 0, irisRadiusCount: 0,
    browDistSum: 0, browDistCount: 0,
  })
  const baselineRef = useRef({
    avgEAR: null,
    avgIrisRadius: null,
    avgBrowDist: null,
  })
  const calibrationDone = useRef(false)

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch {
        setPermissionDenied(true)
      }
    }
    startCamera()
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

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
    calibrationStart.current = null
    calibrationData.current = {
      earSum: 0, earCount: 0,
      irisRadiusSum: 0, irisRadiusCount: 0,
      browDistSum: 0, browDistCount: 0,
    }
    calibrationDone.current = false
  }, [recalibrateTick])

  useEffect(() => {
    if (modelLoading) return

    let lastTimestamp = -1

    function detectLoop() {
      const video = videoRef.current
      const canvas = canvasRef.current
      const faceLandmarker = faceLandmarkerRef.current

      if (!video || !canvas || !faceLandmarker || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(detectLoop)
        return
      }

      const now = performance.now()
      if (now - lastTimestamp < frameIntervalRef.current) {
        animFrameRef.current = requestAnimationFrame(detectLoop)
        return
      }
      lastTimestamp = now

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
        const landmarks = result.faceLandmarks[0]
        drawLandmarks(ctx, landmarks, canvas.width, canvas.height)
        setLatestLandmarks(landmarks)
        processFrame(landmarks)
      } else {
        setFaceDetected(false)
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

  function processFrame(landmarks) {
    const ear = calculateEAR(landmarks)
    const irisRadiusL = calculateIrisRadius(landmarks, LEFT_IRIS_IDS)
    const irisRadiusR = calculateIrisRadius(landmarks, RIGHT_IRIS_IDS)
    const avgIrisRadius = (irisRadiusL + irisRadiusR) / 2
    const browDist = calculateBrowDistance(landmarks)
    const irisCentroid = calculateIrisCentroid(landmarks)
    const noseTip = getNoseTip(landmarks)

    gazeHistory.current.push(irisCentroid)
    if (gazeHistory.current.length > GAZE_HISTORY_LENGTH) {
      gazeHistory.current.shift()
    }

    headHistory.current.push({ x: noseTip.x, y: noseTip.y })
    if (headHistory.current.length > HEAD_HISTORY_LENGTH) {
      headHistory.current.shift()
    }

    if (ear < BLINK_THRESHOLD && lastEAR.current >= BLINK_THRESHOLD) {
      blinkTimestamps.current.push(Date.now())
      const cutoff = Date.now() - ROLLING_WINDOW_MS
      blinkTimestamps.current = blinkTimestamps.current.filter((t) => t > cutoff)
    }
    lastEAR.current = ear
    const blinkRate = blinkTimestamps.current.length

    const now = Date.now()

    if (!calibrationDone.current) {
      if (!calibrationStart.current) {
        calibrationStart.current = now
        setCalibration(true)
      }

      const elapsed = now - calibrationStart.current
      const calMs = useSettingsStore.getState().calibrationDuration * 1000
      const progress = Math.min(elapsed / calMs, 1)
      setCalibrationProgress(Math.round(progress * 100))

      const cd = calibrationData.current
      cd.earSum += ear
      cd.earCount++
      cd.irisRadiusSum += avgIrisRadius
      cd.irisRadiusCount++
      cd.browDistSum += browDist
      cd.browDistCount++

      if (elapsed >= calMs) {
        if (cd.earCount < 10) {
          calibrationStart.current = null
          calibrationData.current = {
            earSum: 0, earCount: 0,
            irisRadiusSum: 0, irisRadiusCount: 0,
            browDistSum: 0, browDistCount: 0,
          }
          return
        }
        baselineRef.current = {
          avgEAR: cd.earSum / cd.earCount,
          avgIrisRadius: cd.irisRadiusSum / cd.irisRadiusCount,
          avgBrowDist: cd.browDistSum / cd.browDistCount,
        }
        calibrationDone.current = true
        setCalibration(false)
      }

      return
    }

    const baseline = baselineRef.current

    const blinkRaw = clamp01(Math.min(blinkRate / 30, 1))
    const pupilRaw = clamp01((avgIrisRadius / baseline.avgIrisRadius - 0.95) / 0.1)
    const browRaw = clamp01((baseline.avgBrowDist - browDist) / (baseline.avgBrowDist * 0.15 + 0.001))

    const gv = pointVariance(gazeHistory.current)
    const gazeRaw = clamp01(Math.min(gv / 0.005, 1))

    const hv = pointVariance(headHistory.current)
    const headRaw = clamp01(Math.min(hv / 0.005, 1))

    const engagement = estimateScreenEngagement(landmarks)

    updateSignals({
      blinkRate: blinkRaw,
      pupilDelta: pupilRaw,
      browFurrow: browRaw,
      gazeStability: gazeRaw,
      headMovement: headRaw,
      onScreen: engagement > 0.3,
    })
  }

  if (permissionDenied) {
    return (
      <div className="camera-permission-denied">
        <div className="permission-icon">📷</div>
        <h2>Camera Access Required</h2>
        <p>CogniFlow needs webcam access to track your cognitive load.</p>
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

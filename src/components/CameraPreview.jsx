import { useRef, useEffect, useState } from 'react'
import { X, Camera } from 'lucide-react'
import { getLatestLandmarks } from '../utils/latestLandmarks'
import useSignalsStore from '../store/signals'
import './CameraPreview.css'

export default function CameraPreview() {
  const [visible, setVisible] = useState(true)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const frameRef = useRef(null)
  const cameraOff = useSignalsStore((s) => s.cameraOff)

  // Single source of truth for the preview's own stream acquisition, mirroring
  // CameraFeed's pattern: runs on mount and again whenever cameraOff toggles.
  // When cameraOff is true, no stream is acquired and the cleanup below stops
  // whatever the previous run had, so the OS camera light never stays on
  // after the user turns the camera off — even though the preview has its
  // own independent getUserMedia call.
  useEffect(() => {
    if (cameraOff) {
      return undefined
    }

    // Captured once per effect run (not re-read in cleanup) so the
    // react-hooks/exhaustive-deps ref-in-cleanup check is satisfied.
    const videoEl = videoRef.current
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
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
        // silently fail — preview is optional
      }
    }
    start()
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
  }, [cameraOff])

  useEffect(() => {
    if (!visible || cameraOff) {
      // Clear any landmark overlay drawn before the camera was turned off so
      // no stale frame lingers behind the placeholder.
      const canvas = canvasRef.current
      if (canvas) {
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      }
      return undefined
    }

    function draw() {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (canvas && video && video.readyState >= 2) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const landmarks = getLatestLandmarks()
        if (landmarks) {
          ctx.fillStyle = 'rgba(94, 92, 230, 0.6)'
          for (let i = 0; i < landmarks.length; i++) {
            const x = landmarks[i].x * canvas.width
            const y = landmarks[i].y * canvas.height
            ctx.beginPath()
            ctx.arc(x, y, 1.5, 0, 2 * Math.PI)
            ctx.fill()
          }
        }
      }
      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [visible, cameraOff])

  return (
    <div className={`camera-preview ${visible ? '' : 'camera-preview-hidden'}`}>
      <button
        className="camera-preview-toggle"
        onClick={() => setVisible((v) => !v)}
        title="Toggle camera preview"
      >
        {visible ? <X size={14} /> : <Camera size={14} />}
      </button>
      {visible && (
        <div className="camera-preview-feed">
          {cameraOff ? (
            <div className="camera-preview-off">
              <Camera size={14} />
              <span>Camera off</span>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-preview-video"
              />
              <canvas ref={canvasRef} className="camera-preview-canvas" />
            </>
          )}
        </div>
      )}
    </div>
  )
}

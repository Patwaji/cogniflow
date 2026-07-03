import { useRef, useEffect, useState } from 'react'
import { X, Camera } from 'lucide-react'
import { getLatestLandmarks } from '../utils/latestLandmarks'
import './CameraPreview.css'

export default function CameraPreview() {
  const [visible, setVisible] = useState(true)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const frameRef = useRef(null)

  useEffect(() => {
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch {
        // silently fail — preview is optional
      }
    }
    start()
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  useEffect(() => {
    if (!visible) return

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
  }, [visible])

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
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="camera-preview-video"
          />
          <canvas ref={canvasRef} className="camera-preview-canvas" />
        </div>
      )}
    </div>
  )
}

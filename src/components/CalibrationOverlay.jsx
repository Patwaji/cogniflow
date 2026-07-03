import { useState, useEffect } from 'react'
import useSignalsStore from '../store/signals'
import useSettingsStore from '../store/settings'
import './CalibrationOverlay.css'

const MATH_INTERVAL_MS = 2500

function makeProblem() {
  const a = 12 + Math.floor(Math.random() * 78)
  const b = 12 + Math.floor(Math.random() * 78)
  return Math.random() < 0.5 ? `${a} + ${b} = ?` : `${a + b} − ${a} = ?`
}

export default function CalibrationOverlay() {
  const isCalibrating = useSignalsStore((s) => s.isCalibrating)
  const progress = useSignalsStore((s) => s.calibrationProgress)
  const phase = useSignalsStore((s) => s.calibrationPhase)
  const faceDetected = useSignalsStore((s) => s.faceDetected)
  const totalSeconds = useSettingsStore((s) => s.calibrationDuration)

  const [problem, setProblem] = useState(makeProblem)

  useEffect(() => {
    if (phase !== 'task') return
    setProblem(makeProblem())
    const id = setInterval(() => setProblem(makeProblem()), MATH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [phase])

  if (!isCalibrating) return null

  const remaining = Math.max(0, Math.ceil((totalSeconds * (100 - progress)) / 100))
  const isTask = phase === 'task'

  return (
    <div className="calibration-overlay">
      <div className="calibration-card">
        {isTask ? (
          <>
            <div className="calibration-math">{problem}</div>
            <h2>Quick math</h2>
            <p className="calibration-instruction">
              Solve each problem in your head as fast as you can.
              <br />
              No need to type — just think hard.
            </p>
          </>
        ) : (
          <>
            <div className="calibration-cross" aria-hidden="true">+</div>
            <h2>Relax</h2>
            <p className="calibration-instruction">
              Stare at the cross and let your mind rest.
              <br />
              We are recording your resting baseline.
            </p>
          </>
        )}

        <div className="calibration-timer">{remaining}s</div>

        <div className="calibration-bar-track">
          <div
            className="calibration-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="calibration-status">
          {faceDetected ? (
            <span className="calibration-ok">Face detected</span>
          ) : (
            <span className="calibration-warn">
              No face detected — make sure you are visible
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

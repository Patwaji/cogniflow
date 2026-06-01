import useSignalsStore from '../store/signals'
import './CalibrationOverlay.css'

export default function CalibrationOverlay() {
  const isCalibrating = useSignalsStore((s) => s.isCalibrating)
  const progress = useSignalsStore((s) => s.calibrationProgress)
  const faceDetected = useSignalsStore((s) => s.faceDetected)

  if (!isCalibrating) return null

  const remaining = Math.max(0, Math.ceil((30 * (100 - progress)) / 100))

  return (
    <div className="calibration-overlay">
      <div className="calibration-card">
        <div className="calibration-icon">🧘</div>
        <h2>Calibrating</h2>
        <p className="calibration-instruction">
          Sit naturally, look at the screen, and relax.
          <br />
          We will record your baseline for 30 seconds.
        </p>

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

import { useState } from 'react'
import useSignalsStore from '../store/signals'
import { SIGNALS } from '../lib/signalMeta'
import './DebugOverlay.css'

const FOCUS_COLORS = {
  calibrating: 'var(--color-warning)',
  drifting: 'var(--color-warning)',
  away: 'var(--color-text-secondary)',
  focused: 'var(--color-success)',
  drowsy: 'var(--color-danger)',
}

export default function DebugOverlay() {
  const [visible, setVisible] = useState(false)
  const signals = useSignalsStore()
  const {
    faceDetected, isCalibrating, calibrationProgress,
    cognitiveScore, focusState,
    blinkRate, pupilDelta, browFurrow, gazeStability, headMovement,
    confidence, calibrationProfile,
  } = signals

  const values = { blinkRate, pupilDelta, browFurrow, gazeStability, headMovement }

  return (
    <>
      <button className="debug-toggle" onClick={() => setVisible(v => !v)}>
        {visible ? 'Hide Debug' : 'Debug'}
      </button>

      {visible && (
        <div className="debug-overlay">
          <div className="debug-score-row">
            <span className="debug-score-label">Score</span>
            <span
              className="debug-score-value"
              style={{ color: FOCUS_COLORS[focusState] || 'var(--color-text-primary)' }}
            >
              {cognitiveScore}
            </span>
            <span
              className="debug-state-badge"
              style={{ background: FOCUS_COLORS[focusState] || 'var(--color-text-muted)' }}
            >
              {focusState}
            </span>
          </div>

          <h3>Signals</h3>
          {SIGNALS.map(({ key, label, color }) => {
            const val = values[key] ?? 0
            return (
              <div className="debug-signal" key={key}>
                <span className="debug-signal-label">{label}</span>
                <div className="debug-signal-bar">
                  <div
                    className="debug-signal-fill"
                    style={{
                      width: `${Math.round(val * 100)}%`,
                      background: color,
                    }}
                  />
                </div>
                <span className="debug-signal-value">
                  {(val * 100).toFixed(0)}
                </span>
              </div>
            )
          })}

          <h3>Quality</h3>
          <div className="debug-signal">
            <span className="debug-signal-label">Confidence</span>
            <div className="debug-signal-bar">
              <div
                className="debug-signal-fill"
                style={{ width: `${Math.round(confidence * 100)}%`, background: 'var(--color-accent)' }}
              />
            </div>
            <span className="debug-signal-value">{(confidence * 100).toFixed(0)}</span>
          </div>
          <div className="debug-signal">
            <span className="debug-signal-label">Calib quality</span>
            <div className="debug-signal-bar">
              <div
                className="debug-signal-fill"
                style={{
                  width: `${Math.round((calibrationProfile?.quality ?? 0) * 100)}%`,
                  background: 'var(--color-warning)',
                }}
              />
            </div>
            <span className="debug-signal-value">
              {calibrationProfile ? ((calibrationProfile.quality * 100).toFixed(0)) : '-'}
            </span>
          </div>

          <div className="debug-status">
            <span>
              <span className={`status-dot ${isCalibrating ? 'calibrating' : faceDetected ? 'on' : 'off'}`} />
              {isCalibrating ? `Calibrating ${calibrationProgress}%` : faceDetected ? 'Face OK' : 'No face'}
            </span>
          </div>
        </div>
      )}
    </>
  )
}

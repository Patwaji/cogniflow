import useSignalsStore, { useCognitiveScore } from '../store/signals'
import './CognitiveMeter.css'

const SIZE = 240
const RADIUS = 104
const STROKE = 10
const CENTER = SIZE / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const STATE_LABELS = {
  focused: 'Focused',
  drifting: 'Drifting',
  drowsy: 'Drowsy',
  away: 'Away',
  calibrating: 'Calibrating',
  noface: 'No face',
}

const STATE_COLORS = {
  focused: 'var(--color-focused)',
  drifting: 'var(--color-warning)',
  drowsy: 'var(--color-danger)',
  away: 'var(--color-text-secondary)',
  calibrating: 'var(--color-warning)',
  noface: 'var(--color-text-secondary)',
}

const STATE_SUB = {
  focused: 'Locked in',
  drifting: 'Attention wandering',
  drowsy: 'You seem tired',
  away: 'Not at your desk',
  calibrating: 'Learning your baseline',
  noface: 'Move into the camera view',
}

export default function CognitiveMeter() {
  const { focusState } = useCognitiveScore()
  const confidence = useSignalsStore((s) => s.confidence)
  const faceDetected = useSignalsStore((s) => s.faceDetected)
  const isCalibrating = useSignalsStore((s) => s.isCalibrating)

  // Be honest in real time: if the camera can't see a face, say so rather than
  // holding a stale "Focused". The session state machine keeps a grace window
  // before it records "Away" (so a glance down at a book isn't counted as
  // leaving), but the live view should reflect what the camera sees right now.
  const effectiveState = !isCalibrating && !faceDetected ? 'noface' : (focusState || 'calibrating')

  // The ring reflects tracking confidence (how sure the read is), not a score.
  // With no face there is nothing to be confident about — empty the ring.
  const ringFill = effectiveState === 'noface' ? 0 : Math.max(0, Math.min(1, confidence))
  const offset = CIRCUMFERENCE - CIRCUMFERENCE * ringFill
  const stateColor = STATE_COLORS[effectiveState] || 'var(--color-warning)'
  const label = STATE_LABELS[effectiveState] || 'Calibrating'

  return (
    <div className="cognitive-meter">
      <svg
        className="meter-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={`Focus state: ${label}`}
      >
        <circle className="meter-track" cx={CENTER} cy={CENTER} r={RADIUS} fill="none" strokeWidth={STROKE} />
        <circle
          className="meter-arc"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          stroke={stateColor}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
      </svg>
      <div className="meter-center">
        <span className="meter-state" style={{ color: stateColor }}>{label}</span>
        <span className="meter-state-sub">{STATE_SUB[effectiveState] || ''}</span>
      </div>
      <div className="meter-footer">
        {effectiveState !== 'noface' && confidence > 0 && (
          <span className="meter-confidence">
            Signal <span className="meter-confidence-value">{Math.round(confidence * 100)}%</span>
          </span>
        )}
      </div>
    </div>
  )
}

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
}

const STATE_COLORS = {
  focused: 'var(--color-focused)',
  drifting: 'var(--color-warning)',
  drowsy: 'var(--color-danger)',
  away: 'var(--color-text-secondary)',
  calibrating: 'var(--color-warning)',
}

const STATE_SUB = {
  focused: 'Locked in',
  drifting: 'Attention wandering',
  drowsy: 'You seem tired',
  away: 'Not at your desk',
  calibrating: 'Learning your baseline',
}

export default function CognitiveMeter() {
  const { focusState } = useCognitiveScore()
  const confidence = useSignalsStore((s) => s.confidence)
  // The ring reflects tracking confidence (how sure the read is), not a score.
  const ringFill = Math.max(0, Math.min(1, confidence))
  const offset = CIRCUMFERENCE - CIRCUMFERENCE * ringFill
  const stateColor = STATE_COLORS[focusState] || 'var(--color-warning)'
  const label = STATE_LABELS[focusState] || 'Calibrating'

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
        <span className="meter-state-sub">{STATE_SUB[focusState] || ''}</span>
      </div>
      <div className="meter-footer">
        {confidence > 0 && (
          <span className="meter-confidence">
            Signal <span className="meter-confidence-value">{Math.round(confidence * 100)}%</span>
          </span>
        )}
      </div>
    </div>
  )
}

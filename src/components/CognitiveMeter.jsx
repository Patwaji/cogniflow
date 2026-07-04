import useSignalsStore, { useCognitiveScore } from '../store/signals'
import './CognitiveMeter.css'

const SIZE = 240
const RADIUS = 104
const STROKE = 10
const CENTER = SIZE / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const STATE_LABELS = {
  flow: 'Flow',
  focused: 'Focused',
  normal: 'Normal',
  distracted: 'Distracted',
  away: 'Away',
  calibrating: 'Calibrating',
  drowsy: 'Drowsy',
}

const STATE_COLORS = {
  flow: 'var(--color-flow)',
  focused: 'var(--color-focused)',
  normal: 'var(--color-text-secondary)',
  distracted: 'var(--color-distracted)',
  away: 'var(--color-text-secondary)',
  calibrating: 'var(--color-warning)',
  drowsy: 'var(--color-danger)',
}

function getScoreColor(score) {
  if (score < 30) return 'var(--color-distracted)'
  if (score < 60) return 'var(--color-warning)'
  return 'var(--color-focused)'
}

export default function CognitiveMeter() {
  const { cognitiveScore, focusState } = useCognitiveScore()
  const confidence = useSignalsStore((s) => s.confidence)
  const score = cognitiveScore ?? 0
  const offset = CIRCUMFERENCE - (CIRCUMFERENCE * score) / 100
  const color = getScoreColor(score)
  const stateColor = STATE_COLORS[focusState] || STATE_COLORS.normal

  return (
    <div className="cognitive-meter">
      <svg
        className="meter-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={`Cognitive load ${score} out of 100, state ${STATE_LABELS[focusState] || 'Calibrating'}`}
      >
        <circle
          className="meter-track"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
        />
        <circle
          className="meter-arc"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
      </svg>
      <div className="meter-center">
        <span className="meter-score">{score}</span>
        <span className="meter-score-unit">load</span>
      </div>
      <div className="meter-footer">
        <span
          className="meter-badge"
          style={{
            color: stateColor,
            background: `color-mix(in srgb, ${stateColor} 12%, transparent)`,
            borderColor: `color-mix(in srgb, ${stateColor} 28%, transparent)`,
          }}
        >
          {STATE_LABELS[focusState] || 'Calibrating'}
        </span>
        {confidence > 0 && (
          <span className="meter-confidence">
            Confidence <span className="meter-confidence-value">{Math.round(confidence * 100)}%</span>
          </span>
        )}
      </div>
    </div>
  )
}

import { useCognitiveScore } from '../store/signals'
import './CognitiveMeter.css'

const SIZE = 200
const RADIUS = 80
const STROKE = 12
const CENTER = SIZE / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const STATE_LABELS = {
  flow: 'Flow',
  focused: 'Focused',
  normal: 'Normal',
  distracted: 'Distracted',
  calibrating: 'Calibrating',
}

function getScoreColor(score) {
  if (score < 30) return '#ff453a'
  if (score < 60) return '#ff9f0a'
  return '#34c759'
}

export default function CognitiveMeter() {
  const { cognitiveScore, focusState } = useCognitiveScore()
  const score = cognitiveScore ?? 0
  const offset = CIRCUMFERENCE - (CIRCUMFERENCE * score) / 100
  const color = getScoreColor(score)

  return (
    <div className="cognitive-meter">
      <svg
        className="meter-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
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
          style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className="meter-center">
        <span className="meter-score">{score}</span>
      </div>
      <span
        className="meter-badge"
        style={{
          background: focusState === 'flow'
            ? 'var(--color-flow)'
            : focusState === 'focused'
              ? 'var(--color-success)'
              : focusState === 'distracted'
                ? 'var(--color-distracted)'
                : 'var(--color-text-muted)',
        }}
      >
        {STATE_LABELS[focusState] || 'Calibrating'}
      </span>
    </div>
  )
}

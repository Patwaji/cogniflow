import useSignalsStore from '../store/signals'
import './SignalPanel.css'

const SIGNALS = [
  { key: 'blinkRate', label: 'Blink rate', color: '#5e5ce6' },
  { key: 'pupilDelta', label: 'Pupil dilation', color: '#34c759' },
  { key: 'browFurrow', label: 'Brow tension', color: '#ff9f0a' },
  { key: 'gazeStability', label: 'Gaze stability', color: '#5ac8fa' },
  { key: 'headMovement', label: 'Head stillness', color: '#ff453a' },
]

export default function SignalPanel() {
  const signals = useSignalsStore()

  return (
    <div className="signal-panel">
      {SIGNALS.map(({ key, label, color }) => {
        const val = signals[key] ?? 0
        return (
          <div className="signal-row" key={key}>
            <span className="signal-label">{label}</span>
            <div className="signal-bar-track">
              <div
                className="signal-bar-fill"
                style={{
                  width: `${Math.round(val * 100)}%`,
                  background: color,
                }}
              />
            </div>
            <span className="signal-value">{(val * 100).toFixed(0)}</span>
          </div>
        )
      })}
    </div>
  )
}

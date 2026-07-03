import useSignalsStore from '../store/signals'
import { SIGNALS } from '../lib/signalMeta'
import './SignalPanel.css'

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

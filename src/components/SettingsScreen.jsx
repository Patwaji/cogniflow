import useSettingsStore from '../store/settings'
import useSignalsStore from '../store/signals'
import { SIGNAL_LABELS as WEIGHT_LABELS, SIGNAL_COLORS as WEIGHT_COLORS } from '../lib/signalMeta'
import './SettingsScreen.css'

export default function SettingsScreen({ onBack }) {
  const settings = useSettingsStore()
  const requestRecalibration = useSignalsStore((s) => s.requestRecalibration)
  const {
    weights, thresholds, notifications,
    calibrationDuration, performanceMode,
    updateWeight, updateThreshold, toggleNotification,
    setCalibrationDuration, togglePerformanceMode, resetSettings,
  } = settings

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button className="settings-back" onClick={onBack}>&larr; Back</button>
        <h2 className="settings-title">Settings</h2>
      </div>

      <div className="settings-body">
        <section className="settings-section">
          <h3>Signal Weights</h3>
          <p className="settings-hint">Total: {totalWeight} / 100</p>
          {Object.entries(weights).map(([key, value]) => (
            <div className="settings-slider-row" key={key}>
              <span className="settings-slider-label">{WEIGHT_LABELS[key]}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={value}
                onChange={(e) => updateWeight(key, Number(e.target.value))}
                className="settings-slider"
                style={{ accentColor: WEIGHT_COLORS[key] }}
              />
              <span className="settings-slider-value">{value}</span>
            </div>
          ))}
        </section>

        <section className="settings-section">
          <h3>Focus Thresholds</h3>
          <div className="settings-number-row">
            <span className="settings-number-label">Distracted</span>
            <input
              type="number"
              min="0"
              max="100"
              value={thresholds.distracted}
              onChange={(e) => updateThreshold('distracted', Number(e.target.value))}
              className="settings-number-input"
            />
            <span className="settings-number-hint">score &lt; this</span>
          </div>
          <div className="settings-number-row">
            <span className="settings-number-label">Focused</span>
            <input
              type="number"
              min="0"
              max="100"
              value={thresholds.focused}
              onChange={(e) => updateThreshold('focused', Number(e.target.value))}
              className="settings-number-input"
            />
            <span className="settings-number-hint">score &ge; this</span>
          </div>
          <div className="settings-number-row">
            <span className="settings-number-label">Flow</span>
            <input
              type="number"
              min="0"
              max="100"
              value={thresholds.flow}
              onChange={(e) => updateThreshold('flow', Number(e.target.value))}
              className="settings-number-input"
            />
            <span className="settings-number-hint">score &ge; this</span>
          </div>
        </section>

        <section className="settings-section">
          <h3>Notifications</h3>
          {Object.entries(notifications).map(([key, value]) => (
            <div className="settings-toggle-row" key={key}>
              <span className="settings-toggle-label">
                {key === 'flow'
                  ? 'Flow alerts'
                  : key === 'distracted'
                    ? 'Distraction alerts'
                    : key === 'drowsy'
                      ? 'Drowsiness alerts'
                      : 'Session end alerts'}
              </span>
              <button
                className={`settings-toggle ${value ? 'settings-toggle-on' : ''}`}
                onClick={() => toggleNotification(key)}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
          ))}
        </section>

        <section className="settings-section">
          <h3>Calibration</h3>
          <div className="settings-select-row">
            <span className="settings-select-label">Duration</span>
            <select
              className="settings-select"
              value={calibrationDuration}
              onChange={(e) => setCalibrationDuration(Number(e.target.value))}
            >
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
            </select>
          </div>
          <button
            className="settings-btn settings-btn-secondary"
            style={{ marginTop: 12 }}
            onClick={requestRecalibration}
          >
            Recalibrate now
          </button>
        </section>

        <section className="settings-section">
          <h3>Performance</h3>
          <div className="settings-toggle-row">
            <span className="settings-toggle-label">Low-power mode (15 fps)</span>
            <button
              className={`settings-toggle ${performanceMode ? 'settings-toggle-on' : ''}`}
              onClick={togglePerformanceMode}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </section>

        <div className="settings-actions">
          <button className="settings-btn settings-btn-secondary" onClick={resetSettings}>
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  )
}

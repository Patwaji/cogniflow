import { useState } from 'react'
import useSettingsStore from '../store/settings'
import useSignalsStore from '../store/signals'
import './Onboarding.css'

const STEPS = ['welcome', 'camera', 'guide', 'calibrating', 'done']

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0)
  const [camError, setCamError] = useState(null)
  const [camGranted, setCamGranted] = useState(false)
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding)
  const isCalibrating = useSignalsStore((s) => s.isCalibrating)
  const calibrationProgress = useSignalsStore((s) => s.calibrationProgress)

  function next() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
    }
  }

  function finish() {
    completeOnboarding()
    onDone()
  }

  async function requestCamera() {
    setCamError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      })
      stream.getTracks().forEach((t) => t.stop())
      setCamGranted(true)
      next()
    } catch {
      setCamError('Camera access denied. Please allow camera access in your browser/device settings and try again.')
    }
  }

  const current = STEPS[step]

  return (
    <div className="onboarding-overlay">
      {current === 'welcome' && (
        <div className="onboarding-card">
          <div className="onboarding-icon">🧠</div>
          <h2>Welcome to CogniFlow</h2>
          <p className="onboarding-text">
            CogniFlow uses your webcam to monitor your cognitive load in real time.
            It tracks blink rate, pupil dilation, brow tension, gaze stability, and
            head movement to give you a live focus score.
          </p>
          <p className="onboarding-text">All processing is 100% local and offline.</p>
          <button className="onboarding-btn" onClick={next}>Get started</button>
          <div className="onboarding-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
            ))}
          </div>
        </div>
      )}

      {current === 'camera' && (
        <div className="onboarding-card">
          <div className="onboarding-icon">📷</div>
          <h2>Camera Access</h2>
          <p className="onboarding-text">
            CogniFlow needs camera access to track your facial signals.
            When prompted, click <strong>Allow</strong>.
          </p>
          <p className="onboarding-text">
            Your video feed never leaves your computer.
          </p>
          {camError && <p className="onboarding-error">{camError}</p>}
          {camGranted ? (
            <p className="onboarding-success">Camera access granted!</p>
          ) : (
            <button className="onboarding-btn" onClick={requestCamera} disabled={camGranted}>
              Allow camera
            </button>
          )}
          {camGranted && (
            <button className="onboarding-btn onboarding-btn-secondary" onClick={next} style={{ marginTop: 8 }}>
              Continue
            </button>
          )}
          <div className="onboarding-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
            ))}
          </div>
        </div>
      )}

      {current === 'guide' && (
        <div className="onboarding-card">
          <div className="onboarding-icon">🧘</div>
          <h2>Calibration</h2>
          <p className="onboarding-text">
            We will record your personal baseline.
          </p>
          <p className="onboarding-text" style={{ marginTop: 0 }}>
            Sit naturally, look at the screen, and relax for 30 seconds.
          </p>
          <button className="onboarding-btn" onClick={next}>Start calibration</button>
          <div className="onboarding-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
            ))}
          </div>
        </div>
      )}

      {current === 'calibrating' && (
        <div className="onboarding-card">
          <div className="onboarding-icon">⏳</div>
          <h2>Calibrating...</h2>
          <p className="onboarding-text">Stay relaxed and look at the screen.</p>
          <div className="onboarding-progress-track">
            <div
              className="onboarding-progress-fill"
              style={{ width: `${calibrationProgress}%` }}
            />
          </div>
          <p className="onboarding-percent">{calibrationProgress}%</p>
          {!isCalibrating && calibrationProgress >= 100 && (
            <button className="onboarding-btn" onClick={next}>Continue</button>
          )}
          <div className="onboarding-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
            ))}
          </div>
        </div>
      )}

      {current === 'done' && (
        <div className="onboarding-card">
          <div className="onboarding-icon">✨</div>
          <h2>You are all set!</h2>
          <p className="onboarding-text">
            Your baseline has been recorded. You can now start using the dashboard
            to track your cognitive load during any session.
          </p>
          <button className="onboarding-btn" onClick={finish}>Go to dashboard</button>
          <div className="onboarding-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

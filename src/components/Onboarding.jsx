import { useState } from 'react'
import { Brain, Camera, Crosshair, Hourglass, CircleCheck, Sparkles, Calculator, Eye } from 'lucide-react'
import useSettingsStore from '../store/settings'
import useSignalsStore from '../store/signals'
import './Onboarding.css'

const ICON_SIZE = 28

const STEPS = ['welcome', 'camera', 'guide', 'calibrating', 'done']

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0)
  const [camError, setCamError] = useState(null)
  const [camGranted, setCamGranted] = useState(false)
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding)
  const isCalibrating = useSignalsStore((s) => s.isCalibrating)
  const calibrationProgress = useSignalsStore((s) => s.calibrationProgress)
  const calibrationPhase = useSignalsStore((s) => s.calibrationPhase)
  const armCalibration = useSignalsStore((s) => s.armCalibration)

  function next() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
    }
  }

  function startCalibration() {
    armCalibration()
    next()
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

  // While the two-phase calibration (rest, then quick-math) is actively running,
  // step aside and let CalibrationOverlay's fixation cross / math task be fully
  // visible instead of covering it with the onboarding card. Otherwise a
  // first-run user would never see the phase prompts and would calibrate into
  // a degenerate (unpersonalized) profile.
  if (current === 'calibrating' && isCalibrating) {
    return (
      <div className="onboarding-banner">
        <span className="onboarding-banner-icon">
          {calibrationPhase === 'task' ? <Calculator size={16} /> : <Eye size={16} />}
        </span>
        <span className="onboarding-banner-text">
          {calibrationPhase === 'task'
            ? 'Phase 2 of 2: Solve the math problems in your head to record your task baseline.'
            : 'Phase 1 of 2: Relax and stare at the cross to record your resting baseline.'}
        </span>
        <span className="onboarding-banner-percent">{calibrationProgress}%</span>
      </div>
    )
  }

  return (
    <div className="onboarding-overlay">
      {current === 'welcome' && (
        <div className="onboarding-card">
          <div className="onboarding-icon"><Brain size={ICON_SIZE} /></div>
          <h2>Your quiet study companion</h2>
          <p className="onboarding-text">
            A gentle body-double that watches for when your focus slips, and nudges you only then.
            We read your facial signals in real time - blink rate, gaze stability, pupil dilation,
            and subtle cues like brow tension and head movement - to sense when your attention drifts.
          </p>
          <p className="onboarding-promise">
            Everything stays on this device. Your camera feed is never recorded, never uploaded,
            never leaves your computer.
          </p>
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
          <div className="onboarding-icon"><Camera size={ICON_SIZE} /></div>
          <h2>Camera Access</h2>
          <p className="onboarding-text">
            CogniFlow needs camera access to track your facial signals.
            When prompted, click <strong>Allow</strong>.
          </p>
          <p className="onboarding-promise">
            Your video feed never leaves your computer. No recordings, no uploads, no storage.
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
          <div className="onboarding-icon"><Crosshair size={ICON_SIZE} /></div>
          <h2>Calibration</h2>
          <p className="onboarding-text">
            We will record your personal baseline in two short phases.
          </p>
          <p className="onboarding-text" style={{ marginTop: 0 }}>
            First, relax and stare at a fixation cross. Then you will solve
            quick math problems in your head. Follow the on-screen prompts
            for each phase; they are what make your baseline personal.
          </p>
          <button className="onboarding-btn" onClick={startCalibration}>Start calibration</button>
          <div className="onboarding-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
            ))}
          </div>
        </div>
      )}

      {current === 'calibrating' && calibrationProgress < 100 && (
        <div className="onboarding-card">
          <div className="onboarding-icon"><Hourglass size={ICON_SIZE} /></div>
          <h2>Preparing calibration...</h2>
          <p className="onboarding-text">
            Make sure your face is visible to the camera. Calibration will
            start automatically: rest first, then a quick math task.
          </p>
          <div className="onboarding-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
            ))}
          </div>
        </div>
      )}

      {current === 'calibrating' && calibrationProgress >= 100 && (
        <div className="onboarding-card">
          <div className="onboarding-icon onboarding-icon-success"><CircleCheck size={ICON_SIZE} /></div>
          <h2>Calibration complete</h2>
          <p className="onboarding-text">
            We recorded your resting and task baselines to personalize your
            focus score.
          </p>
          <button className="onboarding-btn" onClick={next}>Continue</button>
          <div className="onboarding-dots">
            {STEPS.map((_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
            ))}
          </div>
        </div>
      )}

      {current === 'done' && (
        <div className="onboarding-card">
          <div className="onboarding-icon"><Sparkles size={ICON_SIZE} /></div>
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

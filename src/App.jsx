import { useState } from 'react'
import './styles/global.css'
import CameraFeed from './components/CameraFeed'
import Dashboard from './components/Dashboard'
import SessionHistory from './components/SessionHistory'
import SessionReplay from './components/SessionReplay'
import SessionReview from './components/SessionReview'
import SettingsScreen from './components/SettingsScreen'
import TrendsScreen from './components/TrendsScreen'
import Onboarding from './components/Onboarding'
import FocusStateBanner from './components/FocusStateBanner'
import CameraPreview from './components/CameraPreview'
import DebugOverlay from './components/DebugOverlay'
import CalibrationOverlay from './components/CalibrationOverlay'
import useSettingsStore from './store/settings'
import useSignalsStore from './store/signals'
import useNotificationWatcher from './hooks/useNotificationWatcher'
import useNudgeWatcher from './hooks/useNudgeWatcher'

function App() {
  const [view, setView] = useState('dashboard')
  const [selectedSession, setSelectedSession] = useState(null)
  const onboardingDone = useSettingsStore((s) => s.onboardingDone)
  const [showOnboarding, setShowOnboarding] = useState(!onboardingDone)
  useNotificationWatcher()
  useNudgeWatcher()

  // A finished-but-unsaved session takes over the dashboard with its review.
  const sessionState = useSignalsStore((s) => s.sessionState)
  const pendingReview = useSignalsStore((s) => s.sessionDataPoints.length > 0)
  const showReview = view === 'dashboard' && sessionState === 'idle' && pendingReview

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--color-bg)', position: 'relative', overflow: 'hidden' }}>
      <CameraFeed />
      <FocusStateBanner />

      {view === 'dashboard' && !showReview && (
        <Dashboard
          onHistory={() => setView('history')}
          onSettings={() => setView('settings')}
          onTrends={() => setView('trends')}
        />
      )}
      {showReview && (
        <SessionReview onDone={() => setView('dashboard')} />
      )}
      {view === 'history' && (
        <SessionHistory
          onBack={() => setView('dashboard')}
          onSelect={(session) => {
            setSelectedSession(session)
            setView('replay')
          }}
        />
      )}
      {view === 'replay' && selectedSession && (
        <SessionReplay
          session={selectedSession}
          onBack={() => setView('history')}
        />
      )}
      {view === 'trends' && (
        <TrendsScreen onBack={() => setView('dashboard')} />
      )}
      {view === 'settings' && (
        <SettingsScreen onBack={() => setView('dashboard')} />
      )}

      <CameraPreview />
      <CalibrationOverlay />
      <DebugOverlay />

      {showOnboarding && (
        <Onboarding onDone={() => setShowOnboarding(false)} />
      )}
    </div>
  )
}

export default App

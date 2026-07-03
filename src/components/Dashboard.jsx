import CognitiveMeter from './CognitiveMeter'
import SignalPanel from './SignalPanel'
import SessionControls from './SessionControls'
import './Dashboard.css'

export default function Dashboard({ onHistory, onSettings, onTrends }) {
  return (
    <div className="dashboard">
      <div className="dashboard-center">
        <CognitiveMeter />
      </div>
      <div className="dashboard-signals">
        <SignalPanel />
      </div>
      <div className="dashboard-controls">
        <SessionControls onHistory={onHistory} onSettings={onSettings} onTrends={onTrends} />
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import useSignalsStore from '../store/signals'
import { notify, updateTrayScore, canFire } from '../utils/notifications'

const NOTIFY_FLOW_MS = 120000
const NOTIFY_DISTRACTED_MS = 120000

export default function useNotificationWatcher() {
  useEffect(() => {
    return useSignalsStore.subscribe(
      (s) => ({
        score: s.cognitiveScore,
        focus: s.focusState,
        session: s.sessionState,
        dataPoints: s.sessionDataPoints.length,
      }),
      ({ score, focus, session, dataPoints }, prev) => {
        if (score !== prev.score) {
          updateTrayScore(score)
        }

        if (focus === 'flow' && focus !== prev.focus) {
          setTimeout(() => {
            const state = useSignalsStore.getState()
            if (state.focusState === 'flow' && canFire('flow')) {
              notify('Flow state 🔥', "You've been in flow for 2 minutes.")
            }
          }, NOTIFY_FLOW_MS)
        }

        if (focus === 'distracted' && focus !== prev.focus) {
          setTimeout(() => {
            const state = useSignalsStore.getState()
            if (state.focusState === 'distracted' && canFire('distracted')) {
              notify('Focus check', 'You seem distracted. Take a breath.')
            }
          }, NOTIFY_DISTRACTED_MS)
        }

        if (focus === 'drowsy' && focus !== prev.focus) {
          if (canFire('drowsy')) {
            notify('Drowsiness Alert', 'Your eyes have been closed for too long. Take a break.')
          }
        }

        if (
          (prev.session === 'running' || prev.session === 'paused') &&
          session === 'idle' &&
          dataPoints > 0 &&
          canFire('sessionEnd')
        ) {
          const state = useSignalsStore.getState()
          notify('Session complete', `Avg score: ${state.cognitiveScore}.`)
        }
      },
    )
  }, [])
}

import { useEffect } from 'react'
import useSignalsStore from '../store/signals'
import { notify, updateTrayScore, canFire } from '../utils/notifications'

export default function useNotificationWatcher() {
  useEffect(() => {
    return useSignalsStore.subscribe(
      (s) => ({
        score: s.cognitiveScore,
        session: s.sessionState,
        dataPoints: s.sessionDataPoints.length,
      }),
      ({ score, session, dataPoints }, prev) => {
        if (score !== prev.score) {
          updateTrayScore(score)
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

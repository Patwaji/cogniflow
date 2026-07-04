import { describe, it, expect } from 'vitest'
import {
  NUDGE_PARAMS,
  NUDGE_COPY,
  createNudgeState,
  stepNudge,
} from '../nudgeEngine'

function driver(startNow = 0) {
  let now = startNow
  let s = createNudgeState(now)
  return {
    step(input, dtMs = 1000) {
      now += dtMs
      const r = stepNudge(s, { sessionRunning: true, sessionElapsedMs: now, ...input }, now)
      s = r.nudgeState
      return r.nudge
    },
    hold(input, totalMs, dtMs = 1000) {
      let last = null
      for (let t = 0; t < totalMs; t += dtMs) { const n = this.step(input, dtMs); if (n) last = n }
      return last
    },
    get now() { return now },
  }
}

describe('nudgeEngine', () => {
  it('fires a drift nudge when entering drifting', () => {
    const d = driver()
    d.step({ focusState: 'focused' })
    const n = d.step({ focusState: 'drifting' })
    expect(n).toEqual({ type: 'drift', ...NUDGE_COPY.drift })
  })

  it('does not nudge on focused', () => {
    const d = driver()
    expect(d.hold({ focusState: 'focused' }, 5000)).toBeNull()
  })

  it('never nudges when the session is not running', () => {
    const d = driver()
    expect(d.step({ focusState: 'drifting', sessionRunning: false })).toBeNull()
  })

  it('fires a drowsy nudge when entering drowsy', () => {
    const d = driver()
    d.step({ focusState: 'focused' })
    expect(d.step({ focusState: 'drowsy' })).toEqual({ type: 'drowsy', ...NUDGE_COPY.drowsy })
  })

  it('fires away only after the away nudge delay (generous grace, no punishing self-breaks)', () => {
    const d = driver()
    d.step({ focusState: 'focused' })
    d.step({ focusState: 'away' })
    // under 60s away → no nudge yet
    expect(d.hold({ focusState: 'away' }, 30000)).toBeNull()
    // past 60s total → away nudge
    expect(d.hold({ focusState: 'away' }, 35000)).toEqual({ type: 'away', ...NUDGE_COPY.away })
  })

  it('respects the per-type cooldown', () => {
    const d = driver()
    d.step({ focusState: 'focused' })
    expect(d.step({ focusState: 'drifting' })).not.toBeNull() // fires
    d.step({ focusState: 'focused' })
    // re-enter drifting within cooldown → suppressed
    expect(d.step({ focusState: 'drifting' })).toBeNull()
    // after cooldown → fires again
    d.hold({ focusState: 'focused' }, NUDGE_PARAMS.perTypeCooldownMs)
    expect(d.step({ focusState: 'drifting' })).not.toBeNull()
  })

  it('enforces the hourly cap across types', () => {
    const d = driver()
    // Fire 4 distinct nudges within the hour by alternating states past cooldowns
    let fired = 0
    for (let i = 0; i < 6; i++) {
      d.step({ focusState: 'focused' })
      const n = d.step({ focusState: 'drifting' })
      if (n) fired++
      d.hold({ focusState: 'focused' }, NUDGE_PARAMS.perTypeCooldownMs)
    }
    // hourlyCap caps total within the rolling hour
    expect(fired).toBeLessThanOrEqual(NUDGE_PARAMS.hourlyCap)
  })

  it('fires the ultradian backstop once past ~90 min while focused', () => {
    const d = driver()
    const n = d.step({ focusState: 'focused', sessionElapsedMs: NUDGE_PARAMS.backstopMs + 1000 })
    expect(n).toEqual({ type: 'backstop', ...NUDGE_COPY.backstop })
    // does not repeat
    expect(d.step({ focusState: 'focused', sessionElapsedMs: NUDGE_PARAMS.backstopMs + 5000 })).toBeNull()
  })
})

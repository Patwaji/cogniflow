import { describe, it, expect } from 'vitest'
import {
  FOCUS_STATES,
  FOCUS_PARAMS,
  createFocusMachine,
  stepFocusMachine,
} from '../focusState'

// Drive the machine with synthetic time. Each `feed` advances `now` by dtMs
// and steps once with the given input, returning the resulting state.
function driver(startNow = 0) {
  let now = startNow
  let m = createFocusMachine(now)
  return {
    feed(input, dtMs = 100) {
      now += dtMs
      const r = stepFocusMachine(m, { confidence: 1, calibrating: false, ...input }, now)
      m = r.machine
      return r.state
    },
    hold(input, totalMs, dtMs = 100) {
      let last
      for (let t = 0; t < totalMs; t += dtMs) last = this.feed(input, dtMs)
      return last
    },
    get now() { return now },
  }
}

const ON_TASK = { present: true, onMaterial: true, drowsy: false, engaged: true }
const OFF_MATERIAL = { present: true, onMaterial: false, drowsy: false, engaged: true }
const LOW_ENGAGED = { present: true, onMaterial: true, drowsy: false, engaged: false }
const ABSENT = { present: false, onMaterial: false, drowsy: false, engaged: false }

describe('focusState machine', () => {
  it('starts calibrating and enters focused once calibration ends and on-task holds', () => {
    const d = driver()
    expect(d.feed({ ...ON_TASK, calibrating: true })).toBe(FOCUS_STATES.CALIBRATING)
    // calibration ends; from calibrating, on-task with no active drift → focused
    expect(d.feed(ON_TASK)).toBe(FOCUS_STATES.FOCUSED)
  })

  it('a brief look-away does NOT trip drifting', () => {
    const d = driver()
    d.feed(ON_TASK)
    d.hold(ON_TASK, 2000)
    // 3s off-material — under the 10s cumulative threshold
    expect(d.hold(OFF_MATERIAL, 3000)).toBe(FOCUS_STATES.FOCUSED)
  })

  it('cumulative look-away past 10s within the window → drifting', () => {
    const d = driver()
    d.feed(ON_TASK); d.hold(ON_TASK, 2000)
    expect(d.hold(OFF_MATERIAL, 10500)).toBe(FOCUS_STATES.DRIFTING)
  })

  it('low engagement while eyes stay on the material does NOT trip drifting', () => {
    // Calmly reading/staring is low cognitive load but still on-task — a low
    // engagement score must never, on its own, accuse the user of drifting.
    const d = driver()
    d.feed(ON_TASK); d.hold(ON_TASK, 2000)
    expect(d.hold(LOW_ENGAGED, 15000)).toBe(FOCUS_STATES.FOCUSED)
  })

  it('returning from drifting requires a sustained on-task hold (not instant)', () => {
    const d = driver()
    d.feed(ON_TASK); d.hold(ON_TASK, 2000); d.hold(OFF_MATERIAL, 10500)
    expect(d.hold(ON_TASK, 1500)).toBe(FOCUS_STATES.DRIFTING) // < 3s hold → still drifting
    expect(d.hold(ON_TASK, 2000)).toBe(FOCUS_STATES.FOCUSED)  // total > 3s → cleared
  })

  it('no face under the grace window stays; past 20s → away', () => {
    const d = driver()
    d.feed(ON_TASK); d.hold(ON_TASK, 2000)
    expect(d.hold(ABSENT, 15000)).toBe(FOCUS_STATES.FOCUSED) // < 20s grace
    expect(d.hold(ABSENT, 6000)).toBe(FOCUS_STATES.AWAY)     // now > 20s total
  })

  it('drowsy input maps to drowsy and clears with an on-task hold', () => {
    const d = driver()
    d.feed(ON_TASK); d.hold(ON_TASK, 2000)
    expect(d.feed({ ...ON_TASK, drowsy: true })).toBe(FOCUS_STATES.DROWSY)
    expect(d.hold(ON_TASK, 3500)).toBe(FOCUS_STATES.FOCUSED)
  })

  it('low confidence freezes the drift/focused decision instead of flipping on noise', () => {
    const d = driver()
    d.feed(ON_TASK); d.hold(ON_TASK, 2000) // in focused
    // 10s+ off-material BUT low confidence → stays focused (frozen), not drifting
    expect(d.hold({ ...OFF_MATERIAL, confidence: 0.2 }, 11000)).toBe(FOCUS_STATES.FOCUSED)
  })

  it('priority: away beats drowsy beats drifting', () => {
    const d = driver()
    d.feed(ON_TASK); d.hold(ON_TASK, 2000)
    // absent + drowsy + off-material at once, past away grace → away wins
    expect(d.hold({ present: false, onMaterial: false, drowsy: true, engaged: false }, 21000))
      .toBe(FOCUS_STATES.AWAY)
  })

  it('returning on-task after AWAY still requires a full fresh clearHoldMs hold', () => {
    // Establish a long-running on-task hold well past clearHoldMs while
    // FOCUSED, then go absent long enough to trip AWAY. Presence itself
    // naturally clears onTaskHoldSince (onTask requires present:true), so
    // this mainly guards against a regression in that natural reset.
    const d = driver()
    d.feed(ON_TASK)
    d.hold(ON_TASK, 5000)
    expect(d.hold(ABSENT, 20500)).toBe(FOCUS_STATES.AWAY)

    // Return on-task: must take a full clearHoldMs from here, not ~1 tick.
    expect(d.feed(ON_TASK)).toBe(FOCUS_STATES.AWAY) // first tick: hold just started
    expect(d.hold(ON_TASK, 1500)).toBe(FOCUS_STATES.AWAY) // < 3s hold → still away
    expect(d.hold(ON_TASK, 2000)).toBe(FOCUS_STATES.FOCUSED) // total > 3s → cleared
  })

  it('returning on-task after DROWSY requires a fresh clearHoldMs hold, not a stale pre-drowsy one', () => {
    // The bug this guards: onTask (present+onMaterial+engaged) does NOT
    // depend on the drowsy flag, so a long-held onTaskHoldSince from before
    // drowsiness started survives the FOCUSED→DROWSY transition unless the
    // reducer explicitly clears it. Without the fix, the very next on-task
    // tick after DROWSY would see a stale timestamp already older than
    // clearHoldMs and clear back to FOCUSED in ~1 tick instead of 3s.
    const d = driver()
    d.feed(ON_TASK)
    d.hold(ON_TASK, 5000) // onTaskHoldSince set long before drowsy starts
    expect(d.feed({ ...ON_TASK, drowsy: true })).toBe(FOCUS_STATES.DROWSY)
    expect(d.feed(ON_TASK)).toBe(FOCUS_STATES.DROWSY) // hold just (re)started, not stale
    expect(d.hold(ON_TASK, 1500)).toBe(FOCUS_STATES.DROWSY) // < 3s → still drowsy
    expect(d.hold(ON_TASK, 2000)).toBe(FOCUS_STATES.FOCUSED) // total > 3s → cleared
  })

  it('exposes tunable params', () => {
    expect(FOCUS_PARAMS.awayGraceMs).toBe(20000)
    expect(FOCUS_PARAMS.driftLookAwayMs).toBe(10000)
    expect(FOCUS_PARAMS.clearHoldMs).toBe(3000)
  })
})

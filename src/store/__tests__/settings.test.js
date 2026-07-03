import { describe, it, expect, beforeEach, vi } from 'vitest'

const STORAGE_KEY = 'cogniflow_settings'

async function freshStore() {
  // re-import module fresh so load() reruns against current localStorage
  vi.resetModules()
  const mod = await import('../settings.js')
  return mod.default
}

describe('settings v2', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults weights to blink 50 / gaze 50 only', async () => {
    const store = await freshStore()
    expect(store.getState().weights).toEqual({ blinkRate: 50, gazeStability: 50 })
  })

  it('discards persisted settings from previous schema versions', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      weights: { blinkRate: 30, pupilDelta: 25, browFurrow: 20, gazeStability: 15, headMovement: 10 },
    }))
    const store = await freshStore()
    expect(store.getState().weights).toEqual({ blinkRate: 50, gazeStability: 50 })
  })

  it('keeps v2-persisted settings', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      _v: 2,
      weights: { blinkRate: 70, gazeStability: 30 },
    }))
    const store = await freshStore()
    expect(store.getState().weights).toEqual({ blinkRate: 70, gazeStability: 30 })
  })

  it('stamps _v on persist', async () => {
    const store = await freshStore()
    store.getState().updateThreshold('flow', 85)
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(raw._v).toBe(2)
  })

  it('updateWeight keeps the two weights summing to 100', async () => {
    const store = await freshStore()
    store.getState().updateWeight('blinkRate', 70)
    const w = store.getState().weights
    expect(w.blinkRate).toBe(70)
    expect(w.gazeStability).toBe(30)
  })
})

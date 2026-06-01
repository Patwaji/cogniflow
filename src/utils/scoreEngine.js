const DEFAULT_WEIGHTS = {
  blinkRate: 30,
  pupilDelta: 25,
  browFurrow: 20,
  gazeStability: 15,
  headMovement: 10,
}

export function computeCognitiveScore(signals, weights) {
  const { blinkRate = 0, pupilDelta = 0, browFurrow = 0, gazeStability = 0, headMovement = 0 } = signals
  const w = weights || DEFAULT_WEIGHTS

  const inv = (v) => 1 - v

  const score =
    inv(blinkRate) * (w.blinkRate / 100) +
    pupilDelta * (w.pupilDelta / 100) +
    browFurrow * (w.browFurrow / 100) +
    inv(gazeStability) * (w.gazeStability / 100) +
    inv(headMovement) * (w.headMovement / 100)

  return Math.round(Math.max(0, Math.min(100, score * 100)))
}

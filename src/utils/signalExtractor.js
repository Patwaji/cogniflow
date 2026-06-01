function dist(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function centroid(points) {
  const n = points.length
  let cx = 0, cy = 0, cz = 0
  for (const p of points) {
    cx += p.x
    cy += p.y
    cz += p.z ?? 0
  }
  return { x: cx / n, y: cy / n, z: cz / n }
}

function variance(points) {
  if (points.length < 2) return 0
  const c = centroid(points)
  let sum = 0
  for (const p of points) {
    sum += dist(p, c) ** 2
  }
  return sum / points.length
}

const LEFT_EYE_IDS = [33, 160, 159, 133, 144, 145]
const RIGHT_EYE_IDS = [263, 387, 386, 362, 373, 374]
const LEFT_IRIS_IDS = [468, 469, 470, 471, 472]
const RIGHT_IRIS_IDS = [473, 474, 475, 476, 477]
const LEFT_EYE_INNER = 33
const LEFT_EYE_OUTER = 133
const LEFT_EYE_TOP = 159
const LEFT_EYE_BOTTOM = 145
const RIGHT_EYE_INNER = 263
const RIGHT_EYE_OUTER = 362
const RIGHT_EYE_TOP = 386
const RIGHT_EYE_BOTTOM = 374
const NOSE_TIP = 1
const LEFT_CHEEK = 234
const RIGHT_CHEEK = 454

function calculateEAR(landmarks) {
  const le = LEFT_EYE_IDS.map(i => landmarks[i])
  const re = RIGHT_EYE_IDS.map(i => landmarks[i])
  const leAR = (dist(le[1], le[5]) + dist(le[2], le[4])) / (2 * dist(le[0], le[3]))
  const reAR = (dist(re[1], re[5]) + dist(re[2], re[4])) / (2 * dist(re[0], re[3]))
  return (leAR + reAR) / 2
}

function calculateIrisRadius(landmarks, irisIds) {
  const pts = irisIds.map(i => landmarks[i])
  const c = centroid(pts)
  let sum = 0
  for (const p of pts) {
    sum += dist(p, c)
  }
  return sum / pts.length
}

function calculateBrowDistance(landmarks) {
  const leftBrow = landmarks[70]
  const rightBrow = landmarks[300]
  return dist(leftBrow, rightBrow)
}

function calculateIrisCentroid(landmarks) {
  const leftPts = LEFT_IRIS_IDS.map(i => landmarks[i])
  const rightPts = RIGHT_IRIS_IDS.map(i => landmarks[i])
  const leftC = centroid(leftPts)
  const rightC = centroid(rightPts)
  return {
    x: (leftC.x + rightC.x) / 2,
    y: (leftC.y + rightC.y) / 2,
  }
}

function getNoseTip(landmarks) {
  return landmarks[NOSE_TIP]
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

function estimateScreenEngagement(landmarks) {
  const li = centroid(LEFT_IRIS_IDS.map(i => landmarks[i]))
  const ri = centroid(RIGHT_IRIS_IDS.map(i => landmarks[i]))

  const lInner = landmarks[LEFT_EYE_INNER]
  const lOuter = landmarks[LEFT_EYE_OUTER]
  const lTop = landmarks[LEFT_EYE_TOP]
  const lBot = landmarks[LEFT_EYE_BOTTOM]

  const rInner = landmarks[RIGHT_EYE_INNER]
  const rOuter = landmarks[RIGHT_EYE_OUTER]
  const rTop = landmarks[RIGHT_EYE_TOP]
  const rBot = landmarks[RIGHT_EYE_BOTTOM]

  const hRatioL = (li.x - lInner.x) / (lOuter.x - lInner.x + 0.001)
  const hRatioR = (ri.x - rInner.x) / (rOuter.x - rInner.x + 0.001)
  const hRatio = (hRatioL + hRatioR) / 2

  const vRatioL = (li.y - lBot.y) / (lTop.y - lBot.y + 0.001)
  const vRatioR = (ri.y - rBot.y) / (rTop.y - rBot.y + 0.001)
  const vRatio = (vRatioL + vRatioR) / 2

  const hScore = 1 - Math.min(Math.abs(hRatio - 0.5) * 4, 1)
  const vScore = 1 - Math.min(Math.abs(vRatio - 0.5) * 4, 1)

  const nose = landmarks[NOSE_TIP]
  const leftCheek = landmarks[LEFT_CHEEK]
  const rightCheek = landmarks[RIGHT_CHEEK]
  const faceWidth = dist(leftCheek, rightCheek)
  const noseOffset = dist(nose, { x: (leftCheek.x + rightCheek.x) / 2, y: (leftCheek.y + rightCheek.y) / 2 })
  const headFacing = 1 - Math.min(noseOffset / (faceWidth * 0.3 + 0.001), 1)

  return clamp01(hScore * 0.35 + vScore * 0.35 + headFacing * 0.3)
}

export {
  calculateEAR,
  calculateIrisRadius,
  calculateBrowDistance,
  calculateIrisCentroid,
  getNoseTip,
  centroid,
  variance,
  dist,
  LEFT_IRIS_IDS,
  RIGHT_IRIS_IDS,
  clamp01,
  estimateScreenEngagement,
}

// Single source of truth for signal display metadata.
// Colors are a muted categorical set tuned for the dark instrument palette —
// harmonized saturation/lightness so no series shouts over the others.
export const SIGNALS = [
  { key: 'blinkRate', label: 'Blink rate', color: '#8583f2' },
  { key: 'pupilDelta', label: 'Pupil dilation', color: '#5fb8a5' },
  { key: 'browFurrow', label: 'Brow tension', color: '#d9a05b' },
  { key: 'gazeStability', label: 'Gaze stability', color: '#6aaed9' },
  { key: 'headMovement', label: 'Head movement', color: '#c98a9b' },
]

export const SIGNAL_COLORS = Object.fromEntries(
  SIGNALS.map(({ key, color }) => [key, color]),
)

export const SIGNAL_LABELS = Object.fromEntries(
  SIGNALS.map(({ key, label }) => [key, label]),
)

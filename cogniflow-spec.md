# CogniFlow — Product Spec & Build Roadmap

> A desktop app that monitors your cognitive load in real time using only your webcam.
> Tracks blink rate, pupil dilation, gaze patterns, and facial tension to give you a live focus score — and replays your mental effort over any session.

---

## Platform Compatibility

**Linux: fully supported.** Tauri v2 outputs `.deb` and `.AppImage` natively. MediaPipe runs inside the Tauri webview (WebKitGTK on Linux) without any issues. On Arch, you just need `webkit2gtk` installed — everything else works out of the box. Windows and macOS are also supported by the same codebase with no changes.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Desktop framework | Tauri v2 |
| Frontend | React 19 + JavaScript |
| Build tool | Vite + Bun |
| Styling | Vanilla CSS |
| Face tracking | MediaPipe Face Mesh |
| State management | Zustand |
| UI components | shadcn/ui + Tremor |
| Charts | Recharts |
| Storage | Tauri FS plugin + tauri-plugin-store |
| Notifications | tauri-plugin-notification |
| Package manager | Bun |
| Rust code | Written by AI agent |

---

## Webcam Signals

All signals extracted from webcam only — no hardware, no APIs, no internet.

| Signal | What it measures |
|---|---|
| Blink rate | Drops from ~15/min to ~4/min under focus |
| Pupil dilation | Pupils dilate under cognitive load |
| Gaze stability | Erratic movement = distracted, locked = focused |
| Brow furrow | Tension correlates with difficulty |
| Head movement | Restlessness vs stillness |
| Micro-expressions | Confusion, frustration, aha moments |

---

## Phase 1 — Project Scaffold

**Timeline: Days 1–2**

### Tasks
- Init Tauri v2 project with Bun + Vite + React
- Set up folder structure and vanilla CSS base with global variables
- Configure Tauri window (frameless, tray skeleton)
- Install and verify shadcn/ui + Tremor working

### AI Agent Prompt

```
You are helping me build a desktop app called CogniFlow using Tauri v2, React 19 (JavaScript, not TypeScript), Vite, and Bun as the package manager.

Do the following:
1. Scaffold a new Tauri v2 project using Bun. The frontend should use Vite + React (JavaScript, no TypeScript).
2. Set up the folder structure: src/components/, src/screens/, src/store/, src/styles/
3. Create a global CSS file (src/styles/global.css) with CSS custom properties for colors, spacing, and typography. Use a dark theme. Do not use Tailwind.
4. Configure the Tauri window in tauri.conf.json: decorations off (frameless), width 1100, height 720, centered on launch, resizable.
5. Add a basic system tray skeleton — just an icon and a quit option for now.
6. Install shadcn/ui and Tremor and verify they load without errors.
7. Create a placeholder App.jsx that renders a single centered text "CogniFlow" to confirm the stack works.

Use Bun for all package installation commands, not npm or pnpm.
All Rust code in src-tauri/ should be written by you.
```

---

## Phase 2 — Webcam + MediaPipe Setup

**Timeline: Days 3–5 (this is the hardest phase)**

### Tasks
- Camera permission flow + live feed rendering in React
- MediaPipe Face Mesh initialized, 468 landmarks rendering on canvas
- Extract eye landmarks → blink detection algorithm
- Extract pupil landmarks → dilation delta calculation
- Extract brow landmarks → furrow score
- Gaze vector from iris landmarks
- All signals emitting at 30fps into Zustand store

### AI Agent Prompt

```
I am building CogniFlow, a cognitive load monitoring desktop app. The stack is Tauri v2, React 19 (JavaScript), Vite, Bun. No TypeScript.

Phase 2 goal: get webcam feed running and extract cognitive signals from MediaPipe Face Mesh.

Do the following:

1. Create a React component CameraFeed.jsx that:
   - Requests webcam access
   - Shows a live video feed
   - Overlays a canvas on the video for landmark rendering
   - Handles permission denied gracefully with a UI message

2. Initialize MediaPipe Face Mesh using @mediapipe/face_mesh and @mediapipe/camera_utils.
   Install them with Bun.

3. From the 468 landmarks, extract the following signals every frame:
   - Blink rate: use eye aspect ratio (EAR) from landmarks 159, 145, 33, 133, 160, 144 (left eye) and 386, 374, 263, 362, 387, 373 (right eye). EAR < 0.2 = blink. Count blinks per minute using a rolling 60s window.
   - Pupil dilation: track distance between iris landmarks 468–472 (left iris) and 473–477 (right iris). Output a normalized delta relative to calibration baseline.
   - Brow furrow: distance between landmarks 70 and 300 (inner brow corners). Smaller = more furrowed.
   - Gaze stability: calculate the variance of iris centroid position across the last 30 frames. Higher variance = more erratic.
   - Head movement: track nose tip (landmark 1) position variance across last 30 frames.

4. Create a Zustand store (src/store/signals.js) with these fields:
   - blinkRate (number, blinks/min)
   - pupilDelta (number, normalized 0–1)
   - browFurrow (number, normalized 0–1)
   - gazeStability (number, normalized 0–1)
   - headMovement (number, normalized 0–1)
   - lastUpdated (timestamp)

5. Every frame, write calculated signal values into the Zustand store.

6. Render a debug overlay panel (can be toggled) that shows all 5 raw signal values live.

Write all code. Do not leave TODOs or placeholders.
```

---

## Phase 3 — Cognitive Load Score

**Timeline: Days 6–7**

### Tasks
- Weighted formula combining all signals into a 0–100 score
- Calibration baseline (30s idle scan on session start)
- Smoothing and noise reduction via rolling average
- Flow state detection threshold logic
- Distraction detection logic

### AI Agent Prompt

```
CogniFlow, Tauri v2 + React 19 JS. Phase 3: cognitive load scoring.

I now have 5 signals in my Zustand store (blinkRate, pupilDelta, browFurrow, gazeStability, headMovement) updating at ~30fps. I need a cognitive load score from 0–100.

Do the following:

1. Create src/utils/scoreEngine.js that:
   - Takes all 5 signals as input
   - Returns a cognitive load score 0–100 using this weighted formula:
       score = (blinkRate_inv * 0.30) + (pupilDelta * 0.25) + (browFurrow * 0.20) + (gazeStability_inv * 0.15) + (headMovement_inv * 0.10)
     where _inv means inverted (1 - value), since high blink rate = low focus.
   - All inputs should already be normalized 0–1 before entering the formula.

2. Add a calibration phase to the Zustand store:
   - On session start, record 30 seconds of signal data as the personal baseline.
   - Normalize all subsequent signal values relative to this baseline.
   - Show a calibration countdown UI (just a full-screen overlay with a timer and "stay relaxed" instruction).

3. Apply a rolling average smoother over the last 90 frames (~3 seconds) to reduce noise spikes.

4. Add derived states to the Zustand store:
   - cognitiveScore (0–100, smoothed)
   - focusState: "calibrating" | "distracted" | "normal" | "focused" | "flow"
     - distracted: score < 20 for 10+ consecutive seconds
     - normal: score 20–55
     - focused: score 55–80
     - flow: score > 80 for 30+ consecutive seconds

5. Export a useCognitiveScore() React hook that returns { cognitiveScore, focusState }.

Write all code. No TODOs.
```

---

## Phase 4 — Live Dashboard UI

**Timeline: Days 8–10**

### Tasks
- Live cognitive load meter (Tremor gauge or custom SVG ring)
- Webcam preview panel (small, toggleable)
- Individual signal readouts (blink/min, gaze stability, etc.)
- Session timer with start/stop/pause controls
- Flow state / distraction status badge

### AI Agent Prompt

```
CogniFlow, Tauri v2 + React 19 JS, vanilla CSS (no Tailwind). Phase 4: build the main live dashboard screen.

The dashboard is the primary screen the user sees during a session. Design should feel like a professional productivity tool — dark theme, minimal, clean.

Build the following:

1. CognitiveMeter component:
   - A circular ring gauge (SVG, not canvas) showing cognitiveScore 0–100.
   - Ring color transitions: red (0–30) → amber (30–60) → green (60–100).
   - Score number displayed in the center, large.
   - Label below it showing focusState as a badge ("Flow", "Focused", "Normal", "Distracted").

2. SignalPanel component:
   - Shows all 5 raw signal values as small horizontal bar readouts.
   - Labels: "Blink rate", "Pupil dilation", "Brow tension", "Gaze stability", "Head stillness".
   - Each bar fills left to right 0–100% based on signal value.

3. SessionControls component:
   - Start session / Pause / Stop buttons.
   - Session timer (MM:SS) that counts up when session is running.
   - When stopped, prompt to save session with a name input.

4. CameraPreview component:
   - Small webcam feed in a corner panel (bottom right), toggleable with a button.
   - Shows landmark overlay (dots only, not the full mesh).

5. FocusStateBanner component:
   - A thin banner at the top that subtly changes color based on focusState.
   - Shows a message like "You've been in flow for 4 minutes 🔥" or "You seem distracted".

Wire everything to the Zustand store. All state comes from useCognitiveScore() and the signals store.
Use vanilla CSS for all styling. No inline styles unless necessary. Create separate .css files per component.
```

---

## Phase 5 — Session Save & Replay

**Timeline: Days 11–13**

### Tasks
- Tauri FS Rust commands (AI agent writes all Rust) to save session JSON
- Session history list screen
- Session replay — Recharts timeline with annotated peaks
- End-of-session summary card

### AI Agent Prompt — Rust side

```
I am building CogniFlow in Tauri v2. I need Rust commands to save and load session data.

In src-tauri/src/main.rs (or a separate sessions.rs module), write the following Tauri commands:

1. save_session(session_json: String) -> Result<String, String>
   - Saves session_json to ~/.cogniflow/sessions/<timestamp>.json
   - Creates the directory if it does not exist
   - Returns the file path on success

2. list_sessions() -> Result<Vec<String>, String>
   - Lists all session JSON file paths in ~/.cogniflow/sessions/
   - Returns them sorted newest first

3. load_session(path: String) -> Result<String, String>
   - Reads and returns the contents of the session file at path

Register all three commands in main.rs.
Write idiomatic, clean Rust. Add error handling for file IO.
```

### AI Agent Prompt — Frontend side

```
CogniFlow, Tauri v2 + React 19 JS. Phase 5 frontend: session save and replay.

1. During a session, record a data point every 5 seconds into a local array:
   { timestamp, cognitiveScore, blinkRate, pupilDelta, browFurrow, gazeStability, headMovement, focusState }

2. When the user stops a session, collect:
   - Session name (user input)
   - Start time, end time, duration
   - Full data point array
   - Summary stats: avgScore, peakScore (value + timestamp), lowestScore (value + timestamp), totalFlowSeconds, totalDistractedSeconds
   Save as JSON and call the Tauri save_session command.

3. Build a SessionHistory screen:
   - Lists all past sessions (load from list_sessions Tauri command).
   - Each row shows: session name, date, duration, avg score, peak score.
   - Click a row to open the replay view.

4. Build a SessionReplay screen:
   - Recharts LineChart showing cognitiveScore over time (x = elapsed seconds, y = 0–100).
   - Annotated reference lines at peak and lowest points.
   - Color-coded background zones (red/amber/green) behind the chart based on score ranges.
   - Summary stats card at the top (avg, peak, flow time, distracted time).
   - A "signal breakdown" section showing individual signal trends as smaller charts below.

Use vanilla CSS. Wire to Tauri FS commands via invoke().
```

---

## Phase 6 — System Tray & Notifications

**Timeline: Days 14–15**

### Tasks
- Tauri system tray with live status icon
- tauri-plugin-notification for flow state alerts
- "You've been distracted for 2 minutes" nudges
- App runs silently in background when minimized to tray

### AI Agent Prompt

```
CogniFlow, Tauri v2. Phase 6: system tray and notifications.

1. System tray (Rust side):
   - Set up a system tray icon in src-tauri/.
   - Tray menu: "Open CogniFlow", "Current Score: --", separator, "Quit".
   - The "Current Score" menu item should be updatable from the frontend via a Tauri command update_tray_score(score: u32).
   - When the user clicks "Open CogniFlow", bring the window to focus.
   - Closing the main window should minimize to tray, not quit. Quitting only from tray menu.

2. Notifications (use tauri-plugin-notification):
   - Expose a Tauri command trigger_notification(title: String, body: String) from Rust.
   - From the frontend, call this command when:
     a. focusState changes to "flow" and has been flow for 2 minutes → notify "Flow state 🔥" / "You've been in flow for 2 minutes."
     b. focusState changes to "distracted" and has been distracted for 2 minutes → notify "Focus check" / "You seem distracted. Take a breath."
     c. Session ends → notify "Session complete" / "Avg score: X. Peak: Y."
   - Debounce: never fire the same notification type more than once per 5 minutes.

Write all Rust code. Register all commands in main.rs.
```

---

## Phase 7 — Polish & Settings

**Timeline: Days 16–18**

### Tasks
- Settings panel: signal weights, thresholds, notification toggles
- Onboarding screen (first-launch calibration guide)
- Performance audit (MediaPipe memory, idle CPU)
- App icon, about screen, Tauri build config
- First distributable `.deb` / `.AppImage` for Linux

### AI Agent Prompt

```
CogniFlow, Tauri v2 + React 19 JS. Phase 7: settings, onboarding, and build.

1. Settings screen (saved to tauri-plugin-store):
   - Signal weights: 5 sliders (one per signal), each 0–100, that control how much that signal contributes to the final score. Weights auto-normalize to sum to 100.
   - Focus thresholds: number inputs for what score counts as "focused" and "flow".
   - Notification toggles: on/off for flow alerts, distraction alerts, session end alerts.
   - Calibration duration: dropdown (15s / 30s / 60s).
   - Save/reset buttons.
   Load settings on app start and apply them to scoreEngine.js.

2. Onboarding screen (shown once on first launch, flag stored in tauri-plugin-store):
   - Step 1: welcome screen, brief explanation of what CogniFlow does.
   - Step 2: camera permission request.
   - Step 3: calibration guide — "Sit naturally, look at the screen, relax. We'll record your baseline for 30 seconds."
   - Step 4: calibration running (countdown).
   - Step 5: done — show their baseline scores, take them to the dashboard.

3. Performance:
   - Run MediaPipe at 15fps when the window is minimized to tray (not 30fps).
   - Restore to 30fps when window is focused.
   - Add a performance mode toggle in settings (15fps always) for low-end machines.

4. Build config:
   - Set app name, identifier (com.zerothpower.cogniflow), version 0.1.0 in tauri.conf.json.
   - Configure Linux targets: deb and appimage.
   - Add a placeholder app icon (512x512 PNG).
   - Write the command to produce the build: bun tauri build

Write all code. All Rust by you.
```

---

## Build Order Summary

| Phase | What you're building | Timeline |
|---|---|---|
| 1 | Tauri + React scaffold, tray skeleton | Days 1–2 |
| 2 | Webcam feed, MediaPipe, all 5 signals | Days 3–5 |
| 3 | Cognitive score formula, calibration, focus states | Days 6–7 |
| 4 | Live dashboard UI | Days 8–10 |
| 5 | Session save, history, replay | Days 11–13 |
| 6 | System tray, background mode, notifications | Days 14–15 |
| 7 | Settings, onboarding, build + distribution | Days 16–18 |

---

## Demo Target

Working demo in **~3 weeks** if you push it consistently.

Phase 2 is the real bottleneck — once MediaPipe signals are flowing cleanly into Zustand, everything after is React UI work. The AI agent handles 100% of the Rust.

---

## Notes

- All processing is 100% local and offline. No data leaves the machine.
- Brand: ZerothPower / CogniFlow
- Target platform for v1: Linux (Arch). Windows and macOS require no code changes.
- Rust package manager: Cargo (managed by Tauri CLI, you don't touch it directly).

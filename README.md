# CogniFlow

**A local, webcam-only study companion that reflects your focus back to you — privately, on your own machine.**

CogniFlow is a desktop app that uses your webcam to estimate coarse **attention states** while you study — *Focused, Drifting, Drowsy, Away* — and helps you course-correct with gentle, well-timed nudges and an honest after-session review. It runs entirely on your device: **no video ever leaves your computer, nothing is uploaded, and there are no accounts.**

It is built for real deep-work study sessions (including pen-and-paper work), and it is deliberately honest about what a webcam can and cannot see. It does **not** claim to measure "cognitive load" or put a productivity score on you — see the [research paper](#-research-paper) for the full reasoning.

<!-- Add a screenshot or short demo GIF here once you have one:
![CogniFlow](screenshot.png)
-->

---

## Features

- **Four attention states**, not a score — *Focused / Drifting / Drowsy / Away*, driven by reliable signals (head direction, eye-closure, presence) with anti-flicker hysteresis adapted from automotive driver-monitoring.
- **Works with paper, not just screens** — looking *down* at a notebook counts as on-task; only turning away or a far side-glance reads as drifting.
- **Just-in-time nudges** — supportive OS notifications *only* when you are off-task (drift / drowsy / away), never while you are focused. Each type is individually toggleable.
- **After-session review** — a timeline of your session headlined by your **longest unbroken focused stretch**, with one concrete "try this next" suggestion. No streaks, no guilt.
- **Weekly patterns** — your best time of day, focus stamina trend, and when distractions cluster.
- **Per-user calibration** — a short rest + effort calibration tunes the signals to *you* rather than a population average.
- **Private by construction** — all face-mesh processing happens in memory via a local WebAssembly runtime; only small, non-reconstructive session summaries are stored locally.

## How it works (in brief)

CogniFlow runs Google's MediaPipe Face Landmarker locally to extract facial landmarks each frame, derives a few behavioural signals (eye-aspect-ratio for blinks/drowsiness, head-relative gaze, head yaw for "on the work surface"), and feeds them into a small state machine with debouncing so states don't flicker. A per-user two-anchor calibration adapts the thresholds to your face and baseline. Nudges fire only in off-task states; the reflective review and weekly insights are computed from local session summaries. The full design, the evidence behind each choice, and the honest limitations are documented in the paper below.

## Privacy

- No video frames or facial coordinates are written to disk or sent over the network.
- No accounts, no analytics, no cloud.
- The camera can be released at any time from within the app.
- Only derived session summaries (durations, state counts, calibration anchors) are stored locally and pruned to a rolling 30-day window.

## Tech stack

- **Frontend:** React 19 + Vite
- **Desktop shell:** Tauri 2 (Rust)
- **State:** Zustand
- **Vision:** MediaPipe Face Landmarker (WebAssembly, in-browser)
- **Tests:** Vitest
- **Package manager:** [Bun](https://bun.sh)

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh)
- [Rust toolchain](https://www.rust-lang.org/tools/install) + the [Tauri 2 system dependencies](https://tauri.app/start/prerequisites/) for your OS (needed only for the desktop build)
- A webcam

### Install

```bash
git clone https://github.com/Patwaji/cogniflow.git
cd cogniflow
bun install
```

### Run

```bash
bun run dev            # web dev server (browser)
bun run tauri dev      # full desktop app (Tauri window)
```

### Test

```bash
bun run test           # Vitest unit tests
```

### Build

```bash
bun run build          # web assets
bun run tauri build    # native desktop app (.dmg / .deb / .AppImage / .exe)
```

Prebuilt installers are produced by CI on tagged releases (`v*`) for macOS (arm64 + Intel), Linux, and Windows.

---

## 📄 Research paper

CogniFlow's design, the signal-validity evidence behind every decision, and its limitations are written up as a full research paper (with a pre-registered validation protocol).

<!-- Uncomment when the paper is published (arXiv / venue): -->
<!-- **Read the paper:** [CogniFlow: A Local, Webcam-Only System for Estimating Study Attention from Reliable Behavioural States](https://doi.org/REPLACE-WITH-DOI-OR-ARXIV-LINK) -->

The paper is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — you may share and adapt it with attribution.

## A note on what this is (and isn't)

CogniFlow is a personal reflection aid, not a measurement instrument. A webcam sees *where* your face points, not *why* — it cannot tell a notebook from a phone in your lap, and the underlying ocular signals are noisy. Accuracy also varies with lighting, glasses, and skin tone. CogniFlow surfaces a confidence level rather than pretending to be certain, and leads with the coarse behaviours it *can* see reliably. Treat it as a supportive study companion, not a verdict.

## License

- **Code:** [MIT](LICENSE) © 2026 Suryansh Patwa.
- **Paper:** CC BY 4.0 (see above).



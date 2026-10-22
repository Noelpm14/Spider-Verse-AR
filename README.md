# Spider-Verse AR - Web-Based Motion Tracking System

> *"Anyone can wear the mask."*

A fully browser-native augmented reality experience featuring real-time **face tracking**, **pose tracking**, and **comic-book visual effects** - no installation required.

---

## Features

| Feature | Technology |
|---|---|
| Comic-book halftone filter | WebGL custom GLSL shaders |
| Face landmark detection | MediaPipe FaceLandmarker (478 pts) |
| Body pose tracking | MediaPipe PoseLandmarker |
| Spider mask overlay | SVG asset + canvas 2D transform |
| Spider logo on chest | Pose-driven 2D overlay |
| Action speed lines | Canvas 2D procedural animation |
| RGB glitch effect | WebGL fragment shader |
| Adaptive quality | Auto-disables pose if FPS < 24 |
| Screenshot | `outputCanvas.toDataURL()` |
| Zero data leakage | All ML runs client-side via WASM |

---

## Project Structure

```
Cam/
├── index.html                  <- Landing page + Loading screen + AR section
├── css/
│   └── styles.css              <- Spider-Verse comic-book theme
├── js/
│   ├── main.js                 <- App orchestrator + RAF loop
│   ├── tracker.js              <- MediaPipe FaceLandmarker & PoseLandmarker
│   ├── shaders.js              <- WebGL renderer + GLSL shaders
│   ├── renderer.js             <- 2D canvas overlay renderer
│   └── assetLoader.js          <- SVG -> Image utility
└── assets/
    └── masks/
        ├── spider_mask.svg     <- Miles Morales mask
        └── spider_logo.svg     <- Spider chest logo
```

---

## Quick Start

**Option A - VS Code Live Server** *(recommended)*
1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
2. Right-click `index.html` -> **Open with Live Server**
3. Allow camera access when prompted

**Option B - Python**
```bash
cd G:\Projects\Cam
python -m http.server 8080
# Open http://localhost:8080
```

**Option C - Node.js `serve`**
```bash
npx serve G:\Projects\Cam
```

> **Must be served over HTTP/HTTPS** - `file://` URLs block WebRTC camera access and ES module imports.

---

## Multiverse Characters & Expressive Masks

Each universe has its own custom vector mask and **real-time expressive eye tracking** (blinking, squinting, winking):

| Universe / Character | Mask Design | Expressive Eye Animation |
|---|---|---|
| **Miles Morales** | Classic crimson cowl & black radial web grid | Sharp comic lenses that narrow into slits when squinting |
| **Spider-Gwen** | White hood cowl with magenta/cyan inner web lining | Cat-eye teal-tinted lenses that blink with elegance |
| **Spider-Punk** | Crimson distressed mask with metallic mohawk spikes | Asymmetric risograph punk comic eyes with dual tinting |
| **Spider-Man Noir** | 1930s charcoal stitched leather mask & fedora brim | Twin brass aviator goggles with mechanical shutter squint |
| **Spider-Man 2099** | Midnight navy cowl with neon crimson skull fangs | Razor-sharp angular laser visor slits with red neon glow |
| **Peni Parker** | Mecha pilot helmet with ear modules & visor bar | Large anime eyes with sparkle highlights; winks & blinks (`^ ^`) |

---

## Controls & Gestures

| Control | Action |
|---|---|
| **Pinch Gesture** | Bring your index finger & thumb of the same hand together to cycle Multiverse filters |
| **`Tab` Key** | Cycle through Multiverse filters (with interdimensional glitch transition) |
| **`S` Key** | Save screenshot |
| **`Esc` Key** | Exit AR / return to landing |

You can also click the **`FILTER: [NAME] [TAB / PINCH]`** HUD button directly.

---

## System Architecture

```
Landing Page
    │ [SUIT UP button]
    ▼
Loading Screen
    ├─ MediaPipe WASM download (face + pose models)
    └─ WebGL shader compilation
    │ [100% complete]
    ▼
AR Experience (requestAnimationFrame loop)
    │
    ├─ WebRTC -> <video> element
    │
    ├─ MediaPipe FaceLandmarker.detectForVideo()
    │       └─ 478 3D landmark points
    │
    ├─ MediaPipe PoseLandmarker.detectForVideo()
    │       └─ 33 3D body landmark points
    │
    ├─ WebGL pass (offscreen <canvas>)
    │       ├─ Color quantization (5 levels)
    │       ├─ Halftone dot pattern
    │       └─ Edge detection (ink outlines)
    │
    └─ 2D Canvas composite pass
            ├─ Blit WebGL output
            ├─ Speed lines (procedural)
            ├─ Spider mask (face-driven transform)
            ├─ Spider logo (pose-driven)
            └─ Pose skeleton (red lines + joints)
```

---

## Adaptive Quality

If FPS drops below **24**, the system automatically:
1. Disables `PoseLandmarker` inference (saves ~40% GPU time)
2. Switches HUD mode label to `PERFORMANCE`
3. The face tracking + mask overlay remain unaffected

---

## Tech Stack

- **HTML5 / CSS3** - Grid, Flexbox, CSS Animations
- **JavaScript ES6+** - ES modules, async/await
- **WebRTC** - `navigator.mediaDevices.getUserMedia`
- **MediaPipe Tasks Vision 0.10.3** - WASM + GPU delegate
- **WebGL** - Custom GLSL shaders (halftone, glitch)
- **Canvas 2D API** - Overlay compositing

---

## Future Scope

- [ ] **Multi-face support** - Track multiple users simultaneously
- [ ] **Character switcher** - Gwen, Peter B., Spot, Prowler suits
- [ ] **AR portal** - WebGL environment/background replacement
- [ ] **Web Share API** - Share screenshots directly from mobile
- [ ] **PWA** - Offline capability via Service Worker + cache
- [ ] **WebXR** - Full AR mode on supported mobile browsers

---

*Built as part of the Spider-Verse Web-Based Motion Tracking System project report.*

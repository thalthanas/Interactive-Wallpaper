# LiveWP - Interactive Live Wallpaper App

A lightweight, cross-platform interactive live wallpaper application powered by **Electron** and [`patch-gg/pixelfx`](https://github.com/patch-gg/pixelfx).

---

## Features

- **Desktop Live Wallpaper Mode**: Runs silently in the background pinned directly behind your desktop icons (`WorkerW` on Windows, native desktop window on macOS/Linux).
- **Background App**: Hidden from the taskbar (`skipTaskbar: true`), managed via a System Tray icon with quick actions.
- **Windowed Preview Mode**: Switch between live wallpaper mode and a testable window at any time from the tray menu or HUD.
- **PixelFX Snow Weather Scene**:
  - **3 Depth Layers**: Far specks swaying in the breeze, mid drifting flakes, and large near 6-arm spinning snowflake crystals with glowing cores.
  - **Dynamic Snow Piling**: Flakes land and accumulate into a physical snow drift at the bottom of your screen that naturally settles and twinkles.
  - **Atmospheric Dusk Sky**: Dithered winter sky gradient with twinkling stars and cold haze.
- **Interactive Controls & Mouse Reaction**:
  - **Mouse Trails**: Moving your cursor across the desktop spawns glowing frost sparkles and sweeps snowflakes.
  - **Click Bursts**: Clicking anywhere triggers an explosive flurry burst of spinning crystal snowflakes.
  - **Snow Carving**: Dragging your cursor through the snow drift at the bottom carves trenches into the snow mound.
- **Resolution Responsive & Pixel Scale Slider**:
  - Full support for 1920×1080, 1440p, 4K, and ultrawide resolutions.
  - Pixel Scale slider (1× to 8×): Switch between crisp native resolution (1×) and classic chunky pixel art (6×, which matches `pixelfx`'s native 320×180).
- **In-App Control HUD**:
  - Press <kbd>H</kbd> or click the ⚙ icon in the top right to toggle the control panel.
  - Real-time sliders for Pixel Scale, Snow Density, Piling Speed, and Wind Speed.
  - Reset Drift button and Pause/Resume toggle.

---

## Quick Start

### 1. Start LiveWP
Run the start command in terminal:
```bash
npm start
```
*LiveWP will automatically launch in the background, attach behind your desktop icons, and show a snowflake icon in your Windows System Tray (notification area).*

---

## Controls & Usage

| Action | How to Trigger |
| :--- | :--- |
| **Toggle Control HUD** | Press <kbd>H</kbd> or click the ⚙ icon in top-right |
| **Toggle Wallpaper / Windowed** | Right-click the **System Tray icon** or click button in HUD |
| **Change Pixel Scale** | Use the **Pixel Scale slider** in HUD (or Tray submenu) |
| **Clear Snow Drift** | Click **Reset Drift** in HUD or Tray menu |
| **Pause / Resume** | Click **Pause** in HUD or Tray menu |
| **Quit App** | Right-click System Tray icon and select **Quit LiveWP** |

---

## Architecture & Code Structure

```
LiveWP/
├── package.json
├── run.js                      # Clean launcher ensuring standard Electron environment
├── assets/
│   └── icon.png                # System tray snowflake icon
└── src/
    ├── main/
    │   ├── main.js             # Electron main process (lifecycle & IPC)
    │   ├── wallpaper.js        # Cross-platform wallpaper manager abstraction
    │   ├── wallpaper-win32.js  # Win32 WorkerW pinning & background cursor tracking (koffi FFI)
    │   └── tray.js             # System Tray icon & context menu controller
    ├── preload/
    │   └── preload.js          # Safe IPC bridge for renderer
    ├── renderer/
    │   ├── index.html          # Fullscreen canvas & glassmorphism HUD panel
    │   ├── style.css           # Pixelated rendering & sleek UI styling
    │   ├── app.js              # Application controller & animation loop
    │   └── snow-engine.js      # Multi-depth snow simulation, piling drift & mouse VFX
    └── pixelfx/                # Embedded pixelfx engine & effects library (240+ effects)
        ├── core/               # Math, painter, color ramps, shapes, actor, sim
        └── fx/                 # Weather, fire, ice, projectiles, magic, etc.
```

---

## Future Roadmap

- [ ] **Scene Creator UI**: Visual scene editor with drag-and-drop layer management and palette selection.
- [ ] **Custom Mouse Trails**: Selectable trail effects (sparkles, stardust, flame trail, magic runes) from `pixelfx`.
- [ ] **Multi-Monitor Support**: Span or per-monitor independent scenes.
- [ ] **macOS & Linux Packaging**: Native app bundles for Mac (.dmg / .app) and Linux (.AppImage / .deb).


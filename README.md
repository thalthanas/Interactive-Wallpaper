# LiveWP - Interactive Live Wallpaper App

A lightweight, cross-platform interactive live wallpaper application powered by **Electron** and [`patch-gg/pixelfx`](https://github.com/patch-gg/pixelfx).

---

## What's New & Features

- **Desktop Live Wallpaper Mode**: Runs silently in the background pinned directly behind your desktop icons (`WorkerW` on Windows, native desktop window on macOS/Linux).
- **Automatic Taskbar Detection**:
  - Automatically checks if your Windows taskbar is at the bottom, auto-hidden, or on the sides.
  - When the taskbar is visible at the bottom, the snow pile sits **directly on top of the taskbar**, keeping the snow bank visible at any resolution.
  - If the taskbar is auto-hidden or moved, the snow pile automatically expands to the bottom edge.
- **Symmetric Avalanche Snow Piling Physics**:
  - Re-engineered with symmetric slope-limiting relaxation (avalanche physics).
  - Eliminates directional drift skew — snow falls evenly across the screen and forms natural drifts and mounds.
  - **Adjustable Max Pile Height**: Configure max drift depth (15%, 25%, 35%, 50% of screen).
  - **Adjustable Piling Speed**: Off (0x), Slow (0.5x), Normal (1.0x), Fast (2.0x), Blizzard (3.5x).
  - **Clear / Reset Drift**: Completely clears the accumulated snow bank down to 0 at any time.
- **Children Building a Snowman**:
  - Once snow accumulates on the drift, two children in festive winter coats, scarves, and pom-pom beanies walk in from the left and right.
  - They roll snowballs in a 3-step building animation (base snowball, torso snowball, head with carrot nose and top hat).
  - Triggers a **Pixelfx Snowflake Burst** (`ice/snowflake-burst`) upon completion, cheers, and walks off-screen.
  - **Interactive Snowman**: Clicking the completed snowman detonates it in a spectacular `snowflake-burst` explosion and ice motes!
- **🎅 Flying Santa Sleigh**:
  - Flying Santa with a tandem of galloping reindeer, including **Rudolph** with a glowing red pixel nose casting an additive light glow.
  - Shimmering magical golden stardust trail.
  - Configurable occurrence frequency (every 30s, 1m, 2m, or 3m), toggleable, and includes a "Fly Santa Now" button.
- **🎵 Free Christmas Music Playlist from YouTube**:
  - Embedded non-copyrighted Christmas music playlist: [YouTube Playlist](https://www.youtube.com/watch?v=S6ZCv6RwbNU&list=PLfP6i5T0-DkKnS-uYUXoFollNjUPMRzWJ).
  - Starts **stopped initially** so you decide when to play it.
  - Full player controls (Play/Pause, Next Track, Previous Track, Volume slider, Mute) in both the on-screen HUD and the System Tray context menu.
- **Taskbar Tray Context Menu**:
  - Complete control directly from the notification area:
    - Mode toggle (Wallpaper / Windowed)
    - Pixel Art Scale (8x, 6x, 4x, 2x, 1x)
    - Snowfall Density (Light, Medium, Heavy, Blizzard)
    - Drift Piling Speed & Max Pile Height
    - Wind Speed & Drift Clearing
    - Santa Sleigh toggles & immediate flight trigger
    - Christmas Music controls (Play/Pause, Next, Prev, Volume)
    - Pause / Resume animation
- **In-App Control HUD**:
  - Clean glassmorphism design. The top-right gear icon has been removed as requested; simply press <kbd>H</kbd> to toggle controls!

---

## Quick Start

```bash
npm start
```
*LiveWP will automatically launch in the background, attach behind your desktop icons, and show a snowflake icon in your Windows System Tray (notification area).*

---

## Controls & Shortcuts

| Action | Shortcut / Trigger |
| :--- | :--- |
| **Toggle Control HUD** | Press <kbd>H</kbd> |
| **Destroy Snowman** | Left-click on the completed snowman |
| **Carve Snow Drift** | Drag cursor through the bottom snow mound |
| **Click Flurry Burst** | Left-click anywhere on the desktop |
| **Toggle Wallpaper / Windowed** | Right-click the **System Tray icon** or click button in HUD |
| **Adjust Settings** | Right-click System Tray icon or open HUD (<kbd>H</kbd>) |
| **Play / Pause Music** | Click Play in HUD or right-click Tray icon -> Christmas Music |
| **Pause Animation** | Right-click Tray icon -> Pause Animation (disables trails & clicks) |
| **Quit App** | Right-click System Tray icon -> **Quit LiveWP** |

---

## How to Upload to Your GitHub Repository

When you are ready to upload this project to your GitHub account:

### 1. Create a repository on GitHub
- Go to [GitHub](https://github.com/new) and create a new repository (e.g. `LiveWP`).
- Leave "Initialize this repository with a README" **unchecked** (we already have one).

### 2. Connect the remote and push
Open PowerShell or Terminal in `e:\LiveWP`:

```bash
# Link your GitHub repository (replace with your repo URL)
git remote add origin https://github.com/<your-username>/LiveWP.git

# Set default branch to main (or master)
git branch -M main

# Push all commits to GitHub
git push -u origin main
```

### What You Will Need for Authentication:
- If you use **HTTPS**: GitHub will prompt you for your GitHub username and a **Personal Access Token (PAT)** with `repo` permissions (passwords are no longer accepted by GitHub). You can generate a PAT in *GitHub Settings -> Developer Settings -> Personal Access Tokens*.
- Alternatively, if you have **GitHub CLI** installed (`gh auth login`) or **SSH keys** set up (`git@github.com:...`), it will push with a single command!

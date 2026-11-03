import { SnowEngine } from './snow-engine.js';

// DOM Elements
const canvas = document.getElementById('wallpaper-canvas');
const ytIframe = document.getElementById('yt-player');
const hudPanel = document.getElementById('hud-panel');
const btnCloseHud = document.getElementById('btn-close-hud');

// Settings inputs
const sliderScale = document.getElementById('slider-scale');
const labelScale = document.getElementById('label-scale');
const sliderDensity = document.getElementById('slider-density');
const labelDensity = document.getElementById('label-density');
const sliderPile = document.getElementById('slider-pile');
const labelPile = document.getElementById('label-pile');
const sliderMaxHeight = document.getElementById('slider-max-height');
const labelMaxHeight = document.getElementById('label-max-height');
const sliderWind = document.getElementById('slider-wind');
const labelWind = document.getElementById('label-wind');

// Santa controls
const checkSanta = document.getElementById('check-santa');
const selectSantaFreq = document.getElementById('select-santa-freq');
const btnFlySanta = document.getElementById('btn-fly-santa');

// Music controls
const musicStatus = document.getElementById('music-status');
const btnMusicPrev = document.getElementById('btn-music-prev');
const btnMusicPlay = document.getElementById('btn-music-play');
const btnMusicNext = document.getElementById('btn-music-next');
const sliderVolume = document.getElementById('slider-volume');
const labelVolume = document.getElementById('label-volume');

// Action buttons
const btnSpawnSnowman = document.getElementById('btn-spawn-snowman');
const btnResetDrift = document.getElementById('btn-reset-drift');
const btnToggleMode = document.getElementById('btn-toggle-mode');
const modeText = document.getElementById('mode-text');
const btnTogglePause = document.getElementById('btn-toggle-pause');
const pauseText = document.getElementById('pause-text');
const fpsCounter = document.getElementById('fps-counter');
const resDisplay = document.getElementById('res-display');
const toastEl = document.getElementById('toast');

// Initialize Snow Engine
const engine = new SnowEngine(canvas);

let currentMode = 'wallpaper';
let currentScale = 6;
let toastTimeout = null;
let isMusicPlaying = false;
let currentVolume = 75;

// FPS calculation
let lastFrameTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = performance.now();

function showToast(msg) {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2400);
}

function updateScaleLabel(scale) {
  const vw = Math.floor(window.innerWidth / scale);
  const vh = Math.floor(window.innerHeight / scale);
  labelScale.textContent = `${scale}x (${vw}×${vh})`;
  resDisplay.textContent = `${window.innerWidth} × ${window.innerHeight}`;
}

function handleResize() {
  engine.init(window.innerWidth, window.innerHeight, currentScale);
  updateScaleLabel(currentScale);
}

function applyScale(scale) {
  currentScale = scale;
  sliderScale.value = scale;
  engine.init(window.innerWidth, window.innerHeight, scale);
  updateScaleLabel(scale);
}

function updateModeUI(mode) {
  currentMode = mode;
  if (mode === 'wallpaper') {
    modeText.textContent = 'Switch to Windowed';
    showToast('Wallpaper Mode: Pinned behind desktop icons');
  } else {
    modeText.textContent = 'Switch to Wallpaper';
    showToast('Windowed Preview Mode: Active');
  }
}

// YouTube Player State
let ytPlayer = null;
let isPlayerReady = false;
let pendingPlay = false;

function initYtPlayer() {
  if (ytPlayer) return;
  ytPlayer = new YT.Player('yt-player-container', {
    height: '150',
    width: '100%',
    videoId: 'S6ZCv6RwbNU',
    playerVars: {
      listType: 'playlist',
      list: 'PLfP6i5T0-DkKnS-uYUXoFollNjUPMRzWJ',
      autoplay: 0,
      controls: 1,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: () => {
        isPlayerReady = true;
        ytPlayer.setVolume(currentVolume);
        ytPlayer.unMute();
        if (pendingPlay) {
          pendingPlay = false;
          ytPlayer.playVideo();
        }
      },
      onStateChange: (event) => {
        if (event.data === 1) {
          isMusicPlaying = true;
          btnMusicPlay.textContent = '⏸ Pause';
          musicStatus.textContent = 'Playing 🎵';
        } else if (event.data === 2) {
          isMusicPlaying = false;
          btnMusicPlay.textContent = '▶ Play';
          musicStatus.textContent = 'Paused';
        }
        if (window.livewp) {
          window.livewp.notifySetting('musicPlaying', isMusicPlaying);
        }
      },
      onError: (event) => {
        console.error('YouTube player error:', event.data);
      },
    },
  });
}

window.__initYtPlayer = initYtPlayer;
if (window.__ytReady || (window.YT && window.YT.Player)) {
  initYtPlayer();
}

function toggleMusicPlay() {
  if (!isPlayerReady || !ytPlayer) {
    pendingPlay = !pendingPlay;
    showToast('Connecting to Christmas playlist...');
    return;
  }
  if (!isMusicPlaying) {
    ytPlayer.unMute();
    ytPlayer.setVolume(currentVolume);
    ytPlayer.playVideo();
    showToast('Christmas Music: Playing');
  } else {
    ytPlayer.pauseVideo();
    showToast('Christmas Music: Paused');
  }
}

function setVolume(vol) {
  currentVolume = vol;
  sliderVolume.value = vol;
  labelVolume.textContent = `${vol}%`;
  if (ytPlayer && isPlayerReady) {
    ytPlayer.setVolume(vol);
    if (vol === 0) ytPlayer.mute();
    else ytPlayer.unMute();
  }
}

// Setup Event Listeners
function setupEvents() {
  window.addEventListener('resize', handleResize);

  // Keyboard shortcut 'H' to toggle HUD
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
      hudPanel.classList.toggle('hidden');
    }
  });

  btnCloseHud.addEventListener('click', () => {
    hudPanel.classList.add('hidden');
  });

  // Scale Slider
  sliderScale.addEventListener('input', (e) => {
    const scale = parseInt(e.target.value, 10);
    applyScale(scale);
    if (window.livewp) {
      window.livewp.requestScale(scale);
    }
  });

  // Density Slider
  sliderDensity.addEventListener('input', (e) => {
    const d = parseFloat(e.target.value);
    engine.density = d;
    engine.initSnowflakes();
    labelDensity.textContent = d < 0.6 ? `Light (${d.toFixed(1)}x)` : d < 1.4 ? `Medium (${d.toFixed(1)}x)` : d < 2.2 ? `Heavy (${d.toFixed(1)}x)` : `Blizzard (${d.toFixed(1)}x)`;
    if (window.livewp) window.livewp.notifySetting('density', d);
  });

  // Piling Speed Slider
  sliderPile.addEventListener('input', (e) => {
    const p = parseFloat(e.target.value);
    engine.pileSpeed = p;
    labelPile.textContent = p === 0 ? 'Off (0x)' : `${p.toFixed(1)}x`;
    if (window.livewp) window.livewp.notifySetting('pileSpeed', p);
  });

  // Max Pile Height Slider
  sliderMaxHeight.addEventListener('input', (e) => {
    const mh = parseFloat(e.target.value);
    engine.maxPileHeightRatio = mh;
    labelMaxHeight.textContent = `${Math.round(mh * 100)}% Screen`;
    if (window.livewp) window.livewp.notifySetting('maxHeight', mh);
  });

  // Wind Speed Slider
  sliderWind.addEventListener('input', (e) => {
    const w = parseFloat(e.target.value);
    engine.windBase = w;
    labelWind.textContent = w < 2 ? 'Calm' : w < 6 ? 'Gentle' : w < 10 ? 'Brisk' : 'Gale';
    if (window.livewp) window.livewp.notifySetting('wind', w);
  });

  // Santa Controls
  checkSanta.addEventListener('change', (e) => {
    engine.santaEnabled = e.target.checked;
    if (window.livewp) window.livewp.notifySetting('santaEnabled', engine.santaEnabled);
    showToast(engine.santaEnabled ? 'Flying Santa Enabled' : 'Flying Santa Disabled');
  });

  selectSantaFreq.addEventListener('change', (e) => {
    const freq = parseInt(e.target.value, 10);
    engine.santaFrequency = freq;
    engine.santaTimer = freq;
    if (window.livewp) window.livewp.notifySetting('santaFreq', freq);
  });

  btnFlySanta.addEventListener('click', () => {
    engine.triggerSantaNow();
    showToast('🎅 Santa is taking flight!');
  });

  // Snowman Builder Action
  btnSpawnSnowman.addEventListener('click', () => {
    engine.triggerBuildSnowmanNow();
    showToast('⛄ Children are coming to build a snowman!');
  });

  // Music Player Controls
  btnMusicPlay.addEventListener('click', toggleMusicPlay);
  btnMusicNext.addEventListener('click', () => {
    if (ytPlayer && isPlayerReady) {
      ytPlayer.nextVideo();
      ytPlayer.unMute();
      ytPlayer.setVolume(currentVolume);
      showToast('Playing next song 🎵');
    }
  });
  btnMusicPrev.addEventListener('click', () => {
    if (ytPlayer && isPlayerReady) {
      ytPlayer.previousVideo();
      ytPlayer.unMute();
      ytPlayer.setVolume(currentVolume);
      showToast('Playing previous song 🎵');
    }
  });
  sliderVolume.addEventListener('input', (e) => {
    setVolume(parseInt(e.target.value, 10));
  });

  // Reset Drift
  btnResetDrift.addEventListener('click', () => {
    engine.clearDrift();
    showToast('Snow drift cleared!');
  });

  // Toggle Mode
  btnToggleMode.addEventListener('click', () => {
    const nextMode = currentMode === 'wallpaper' ? 'windowed' : 'wallpaper';
    if (window.livewp) {
      window.livewp.requestMode(nextMode);
    }
    updateModeUI(nextMode);
  });

  // Toggle Pause
  btnTogglePause.addEventListener('click', () => {
    engine.isPaused = !engine.isPaused;
    pauseText.textContent = engine.isPaused ? '▶ Resume' : '⏸ Pause';
    showToast(engine.isPaused ? 'Animation Paused' : 'Animation Resumed');
    if (engine.isPaused) {
      engine.interactiveParticles = [];
    }
  });

  // Windowed Mouse Events (respects isPaused)
  window.addEventListener('pointermove', (e) => {
    if (engine.isPaused) return;
    engine.onMouseMove(e.clientX, e.clientY);
  });

  window.addEventListener('pointerdown', (e) => {
    if (engine.isPaused) return;
    engine.onMouseClick(e.clientX, e.clientY);
  });

  // Electron IPC Listeners
  if (window.livewp) {
    // Desktop mouse tracker from global Win32 hook
    window.livewp.onDesktopMouse((data) => {
      if (engine.isPaused) return;
      engine.onMouseMove(data.x, data.y);
      if (data.leftDown && !engine.mouseLeftDown) {
        engine.onMouseClick(data.x, data.y);
      }
      engine.mouseLeftDown = data.leftDown;
    });

    // Taskbar Insets update
    window.livewp.onTaskbarInsets((insets) => {
      engine.setTaskbarInsets(insets);
    });

    window.livewp.onScaleChange((scale) => {
      applyScale(scale);
    });

    window.livewp.onModeChange((mode) => {
      updateModeUI(mode);
    });

    window.livewp.onToggleHud(() => {
      hudPanel.classList.toggle('hidden');
    });

    window.livewp.onTogglePause((paused) => {
      engine.isPaused = paused;
      pauseText.textContent = paused ? '▶ Resume' : '⏸ Pause';
      if (paused) {
        engine.interactiveParticles = [];
      }
    });

    window.livewp.onResetSnow(() => {
      engine.clearDrift();
      showToast('Snow drift cleared!');
    });

    // Tray Settings synchronization
    window.livewp.onSettingChanged((data) => {
      if (!data) return;
      if (data.key === 'density') {
        engine.density = data.value;
        engine.initSnowflakes();
        sliderDensity.value = data.value;
        labelDensity.textContent = `${data.value.toFixed(1)}x`;
      } else if (data.key === 'pileSpeed') {
        engine.pileSpeed = data.value;
        sliderPile.value = data.value;
        labelPile.textContent = `${data.value.toFixed(1)}x`;
      } else if (data.key === 'maxHeight') {
        engine.maxPileHeightRatio = data.value;
        sliderMaxHeight.value = data.value;
        labelMaxHeight.textContent = `${Math.round(data.value * 100)}% Screen`;
      } else if (data.key === 'wind') {
        engine.windBase = data.value;
        sliderWind.value = data.value;
      } else if (data.key === 'santaEnabled') {
        engine.santaEnabled = data.value;
        checkSanta.checked = data.value;
      } else if (data.key === 'santaFreq') {
        engine.santaFrequency = data.value;
        selectSantaFreq.value = String(data.value);
      } else if (data.key === 'flySantaNow') {
        engine.triggerSantaNow();
        showToast('🎅 Santa taking flight!');
      } else if (data.key === 'buildSnowmanNow') {
        engine.triggerBuildSnowmanNow();
        showToast('⛄ Children are coming to build a snowman!');
      } else if (data.key === 'musicCommand') {
        if (data.value === 'play') {
          if (!isMusicPlaying) toggleMusicPlay();
        } else if (data.value === 'pause') {
          if (isMusicPlaying) toggleMusicPlay();
        } else if (data.value === 'next') {
          if (ytPlayer && isPlayerReady) {
            ytPlayer.nextVideo();
            ytPlayer.unMute();
            ytPlayer.setVolume(currentVolume);
          }
        } else if (data.value === 'prev') {
          if (ytPlayer && isPlayerReady) {
            ytPlayer.previousVideo();
            ytPlayer.unMute();
            ytPlayer.setVolume(currentVolume);
          }
        } else if (typeof data.value === 'number') {
          setVolume(data.value);
        }
      }
    });

    // Query initial state
    window.livewp.getInitialState().then((state) => {
      if (state) {
        currentMode = state.mode;
        currentScale = state.scale || 6;
        engine.isPaused = state.isPaused;
        pauseText.textContent = engine.isPaused ? '▶ Resume' : '⏸ Pause';
        if (state.insets) {
          engine.setTaskbarInsets(state.insets);
        }
        applyScale(currentScale);
        updateModeUI(currentMode);
      }
    });
  }
}

// Main Animation Loop
function loop(now) {
  requestAnimationFrame(loop);

  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  engine.update(dt);
  engine.render();

  // FPS Counter
  frameCount++;
  if (now - lastFpsUpdate >= 500) {
    const fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
    fpsCounter.textContent = `${fps} FPS`;
    frameCount = 0;
    lastFpsUpdate = now;
  }
}

// Start Application
handleResize();
setupEvents();
requestAnimationFrame(loop);
showToast('LiveWP Ready - Press H for Controls');

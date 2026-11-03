import { SnowEngine } from './snow-engine.js';

// DOM Elements
const canvas = document.getElementById('wallpaper-canvas');
const hudPanel = document.getElementById('hud-panel');
const hudTrigger = document.getElementById('hud-trigger');
const btnCloseHud = document.getElementById('btn-close-hud');
const sliderScale = document.getElementById('slider-scale');
const labelScale = document.getElementById('label-scale');
const sliderDensity = document.getElementById('slider-density');
const labelDensity = document.getElementById('label-density');
const sliderPile = document.getElementById('slider-pile');
const labelPile = document.getElementById('label-pile');
const sliderWind = document.getElementById('slider-wind');
const labelWind = document.getElementById('label-wind');
const btnToggleMode = document.getElementById('btn-toggle-mode');
const modeText = document.getElementById('mode-text');
const btnResetDrift = document.getElementById('btn-reset-drift');
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

// Setup Event Listeners
function setupEvents() {
  window.addEventListener('resize', handleResize);

  // Keyboard shortcut 'H' to toggle HUD
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
      hudPanel.classList.toggle('hidden');
    }
  });

  hudTrigger.addEventListener('click', () => {
    hudPanel.classList.toggle('hidden');
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
    labelDensity.textContent = d < 0.6 ? 'Light' : d < 1.4 ? 'Medium' : d < 2.2 ? 'Heavy' : 'Blizzard';
  });

  // Piling Speed Slider
  sliderPile.addEventListener('input', (e) => {
    const p = parseFloat(e.target.value);
    engine.pileSpeed = p;
    labelPile.textContent = p === 0 ? 'Off' : `${p.toFixed(1)}x`;
  });

  // Wind Speed Slider
  sliderWind.addEventListener('input', (e) => {
    const w = parseFloat(e.target.value);
    engine.windBase = w;
    labelWind.textContent = w < 2 ? 'Calm' : w < 6 ? 'Gentle' : w < 10 ? 'Brisk' : 'Gale';
  });

  // Reset Drift
  btnResetDrift.addEventListener('click', () => {
    engine.resetDrift();
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
  });

  // Windowed Mouse Events
  window.addEventListener('pointermove', (e) => {
    engine.onMouseMove(e.clientX, e.clientY);
  });

  window.addEventListener('pointerdown', (e) => {
    engine.onMouseClick(e.clientX, e.clientY);
  });

  // Electron IPC Listeners
  if (window.livewp) {
    // Global desktop mouse tracker
    window.livewp.onDesktopMouse((data) => {
      engine.onMouseMove(data.x, data.y);
      if (data.leftDown && !engine.mouseLeftDown) {
        engine.onMouseClick(data.x, data.y);
      }
      engine.mouseLeftDown = data.leftDown;
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
    });

    window.livewp.onResetSnow(() => {
      engine.resetDrift();
      showToast('Snow drift cleared!');
    });

    // Query initial state
    window.livewp.getInitialState().then((state) => {
      if (state) {
        currentMode = state.mode;
        currentScale = state.scale || 6;
        engine.isPaused = state.isPaused;
        pauseText.textContent = engine.isPaused ? '▶ Resume' : '⏸ Pause';
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
showToast('LiveWP Started - Pinned to Desktop');


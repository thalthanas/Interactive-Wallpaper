import {
  createFrame,
  clearFrame,
  painterFor,
  composite,
  createFx,
} from '../pixelfx/core/fx.js';
import * as snowflakeBurst from '../pixelfx/fx/ice/snowflake-burst.js';
import {
  hex,
  mix,
  fit,
  WHITE,
} from '../pixelfx/core/index.js';
import { TAU, rand } from '../pixelfx/core/math.js';

// Default winter palette (dark sky to pure snow white)
const DEFAULT_PALETTE = [
  '#090d1a', // 0: deep night sky
  '#131a30', // 1: cold midnight blue
  '#1f2b47', // 2: dark slate blue
  '#324367', // 3: mountain blue
  '#526c9c', // 4: winter dusk blue
  '#87a2cf', // 5: soft ice blue
  '#c7dbf8', // 6: glistening pale snow
  '#ffffff', // 7: pure snowflake white
];

const AXIS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [-1, -1], [1, -1], [-1, 1]];

// Hat colors for snowmen
const HAT_COLORS = [
  { hat: '#0f172a', ribbon: '#ef4444' }, // Classic Stovepipe Black + Red Ribbon
  { hat: '#dc2626', ribbon: '#ffffff' }, // Santa Red + White Ribbon
  { hat: '#15803d', ribbon: '#f59e0b' }, // Winter Emerald + Gold Ribbon
  { hat: '#1d4ed8', ribbon: '#38bdf8' }, // Midnight Blue + Cyan Ribbon
  { hat: '#78350f', ribbon: '#fbbf24' }, // Chestnut Brown + Yellow Ribbon
  { hat: '#7e22ce', ribbon: '#f472b6' }, // Royal Purple + Pink Ribbon
];

const CHILD_OUTFITS = [
  { coat: '#dc2626', hat: '#15803d', scarf: '#f59e0b' },
  { coat: '#2563eb', hat: '#e11d48', scarf: '#10b981' },
  { coat: '#059669', hat: '#d97706', scarf: '#ec4899' },
  { coat: '#7c3aed', hat: '#0284c7', scarf: '#facc15' },
  { coat: '#ea580c', hat: '#4f46e5', scarf: '#22c55e' },
];

export class SnowEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 6;
    this.density = 1.0;
    this.windBase = 4;
    this.pileSpeed = 1.0;
    this.maxPileHeightRatio = 0.25; // 25% screen height
    this.isPaused = false;

    // Taskbar insets (in screen pixels)
    this.insets = { bottom: 0, top: 0, left: 0, right: 0 };

    this.virtualW = 320;
    this.virtualH = 180;
    this.frame = null;
    this.imgData = null;

    // Palette colors
    this.colors = fit(DEFAULT_PALETTE, 8);

    // Simulation state
    this.time = 0;
    this.seed = 42;

    // Snow height map for piling at the bottom
    this.driftHeights = null;

    // Interactive particles (mouse trail / click bursts / snow carve spray)
    this.interactiveParticles = [];

    // Active Pixelfx FX instances (e.g. snowflake bursts)
    this.activeFx = [];

    // Mouse state
    this.mouseX = -9999;
    this.mouseY = -9999;
    this.prevMouseX = -9999;
    this.prevMouseY = -9999;
    this.mouseLeftDown = false;
    this.mouseSpeed = 0;

    // Continuous snowflakes simulation
    this.snowflakes = [];

    // Multi-Snowman Collection
    this.snowmen = []; // Array of { id, x, scale, hatColor, ribbonColor, scarfColor, bounds }
    this.nextSnowmanId = 1;

    // Children Builder Team State
    this.builderState = 'WAITING'; // 'WAITING' | 'WALKING_IN' | 'BUILDING' | 'ADMIRING' | 'WALKING_OUT'
    this.builderTargetX = 160;
    this.builderTimer = 0;
    this.builderStage = 0; // 1 = base, 2 = torso, 3 = head & details
    this.builderCooldown = 12; // time until first attempt (12s)
    this.pendingSnowmanConfig = null;

    this.child1 = { x: -20, y: 0, legPhase: 0, outfit: CHILD_OUTFITS[0] };
    this.child2 = { x: 340, y: 0, legPhase: 0, outfit: CHILD_OUTFITS[1] };

    // Santa Sleigh State
    this.santaEnabled = true;
    this.santaFrequency = 60; // target seconds (30s to 180s)
    this.santaTimer = 15;     // first flight in 15 seconds
    this.santaActive = false;
    this.santaX = -80;
    this.santaY = 30;
    this.santaDir = 1; // 1: left-to-right, -1: right-to-left
    this.santaSpeed = 45;
    this.santaTrail = [];

    // Background Village & Holiday Star Tree
    this.starTreeEnabled = true;
    this.villageHouses = [];
    this.villageTrees = [];
    this.villageSmoke = [];

    // Yellow Snowplow / "Snowpillar" Machine
    this.plowActive = false;
    this.plowX = -60;
    this.plowSpeed = 85;
  }

  setTaskbarInsets(insets) {
    this.insets = insets || { bottom: 0, top: 0, left: 0, right: 0 };
  }

  init(width, height, scale = 6) {
    this.scale = Math.max(1, Math.min(10, scale));
    this.virtualW = Math.max(160, Math.floor(width / this.scale));
    this.virtualH = Math.max(90, Math.floor(height / this.scale));

    this.canvas.width = this.virtualW;
    this.canvas.height = this.virtualH;

    this.frame = createFrame(this.virtualW, this.virtualH, 0, 0);
    this.imgData = this.ctx.createImageData(this.virtualW, this.virtualH);

    // Initialize snow pile height map along the bottom
    this.initDrift(false);

    // Populate snowflakes based on density
    this.initSnowflakes();

    // Initialize background village & trees
    this.initVillage();

    this.builderTargetX = Math.floor(this.virtualW * 0.5);
    this.child1.x = -20;
    this.child2.x = this.virtualW + 20;

    // Cleanly reset active build on scale change so new children spawn within new visible bounds
    if (this.builderState !== 'WAITING') {
      this.builderState = 'WAITING';
      this.builderCooldown = 4;
      this.pendingSnowmanConfig = null;
    }
  }

  initDrift(clearOnly = false) {
    this.driftHeights = new Float32Array(this.virtualW);
    if (!clearOnly) {
      for (let x = 0; x < this.virtualW; x++) {
        this.driftHeights[x] = 2;
      }
    }
  }

  clearDrift(instant = false) {
    if (instant) {
      if (this.driftHeights) {
        this.driftHeights.fill(0);
      }
      return;
    }
    // Trigger yellow snowplow clearing animation across the scene!
    this.startSnowPlow();
  }

  startSnowPlow() {
    this.plowActive = true;
    this.plowX = -50;
    this.plowSpeed = 85;
  }

  initSnowflakes() {
    this.snowflakes = [];
    const baseCount = Math.floor(this.virtualW * 0.9 * this.density);

    for (let i = 0; i < baseCount; i++) {
      this.snowflakes.push(this.createFlake(true));
    }
  }

  createFlake(randomY = false) {
    const layerRand = Math.random();
    let layer = 0;
    if (layerRand > 0.85) layer = 2; // Near (spinning crystal)
    else if (layerRand > 0.5) layer = 1; // Mid (plus/flake)

    const x = Math.random() * this.virtualW;
    const y = randomY ? Math.random() * this.virtualH : -10 - Math.random() * 20;

    const fallSpeed =
      layer === 0
        ? 18 + Math.random() * 12
        : layer === 1
          ? 28 + Math.random() * 20
          : 38 + Math.random() * 24;

    const swaySpeed = 1.0 + Math.random() * 2.2;
    const swayAmp = layer === 0 ? 0.6 : layer === 1 ? 1.4 : 2.5;

    return {
      x,
      y,
      layer,
      fallSpeed,
      swaySpeed,
      swayAmp,
      swayOffset: Math.random() * TAU,
      crystalRadius: layer === 2 ? (Math.random() < 0.5 ? 3 : 4) : 1,
      spinSpeed: 1.5 + Math.random() * 3,
      spin: Math.random() * TAU,
    };
  }

  onMouseMove(clientX, clientY) {
    if (this.isPaused) return;

    const vx = clientX / this.scale;
    const vy = clientY / this.scale;

    this.mouseSpeed = Math.hypot(vx - this.mouseX, vy - this.mouseY);
    this.prevMouseX = this.mouseX;
    this.prevMouseY = this.mouseY;
    this.mouseX = vx;
    this.mouseY = vy;

    // Spawn mouse trail frost particles
    if (this.mouseSpeed > 0.8) {
      const trailCount = Math.min(3, Math.floor(this.mouseSpeed * 0.4));
      for (let i = 0; i < trailCount; i++) {
        this.interactiveParticles.push({
          x: this.mouseX + (Math.random() - 0.5) * 4,
          y: this.mouseY + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 10 + (this.mouseX - this.prevMouseX) * 0.15,
          vy: (Math.random() - 0.5) * 10 + (this.mouseY - this.prevMouseY) * 0.15,
          life: 0.5 + Math.random() * 0.35,
          maxLife: 0.7,
          size: Math.random() < 0.3 ? 2 : 1,
          glow: true,
        });
      }
    }

    // Carve snow drift if cursor sweeps through the snow pile
    this.carveDrift(vx, vy);
  }

  onMouseClick(clientX, clientY) {
    if (this.isPaused) return;

    const vx = clientX / this.scale;
    const vy = clientY / this.scale;

    // Check if clicked ANY of the active Snowmen!
    for (let i = this.snowmen.length - 1; i >= 0; i--) {
      const s = this.snowmen[i];
      if (s.bounds && vx >= s.bounds.x1 && vx <= s.bounds.x2 && vy >= s.bounds.y1 && vy <= s.bounds.y2) {
        this.destroySnowman(i);
        return;
      }
    }

    // Normal Click burst: explosion of 16 glowing snowflake crystals
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (TAU * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 25 + Math.random() * 45;
      this.interactiveParticles.push({
        x: vx,
        y: vy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 10,
        life: 0.9 + Math.random() * 0.6,
        maxLife: 1.4,
        size: Math.random() < 0.4 ? 3 : 2,
        crystal: true,
        spin: Math.random() * TAU,
        spinSpeed: (Math.random() - 0.5) * 8,
        glow: true,
      });
    }
  }

  carveDrift(vx, vy) {
    if (!this.driftHeights) return;
    const taskbarBottom = Math.floor((this.insets.bottom || 0) / this.scale);
    const baseY = this.virtualH - taskbarBottom;

    const radius = 14;
    const minX = Math.max(0, Math.floor(vx - radius));
    const maxX = Math.min(this.virtualW - 1, Math.ceil(vx + radius));

    for (let x = minX; x <= maxX; x++) {
      const driftTop = baseY - this.driftHeights[x];
      if (vy >= driftTop - 6 && vy <= baseY + 6) {
        const dist = Math.abs(x - vx);
        if (dist < radius) {
          const power = Math.max(0, 1 - dist / radius);
          this.driftHeights[x] = Math.max(0, this.driftHeights[x] - power * 1.6);

          if (Math.random() < 0.2) {
            this.interactiveParticles.push({
              x: x,
              y: driftTop,
              vx: (x - vx) * 1.8 + (Math.random() - 0.5) * 10,
              vy: -Math.random() * 14 - 4,
              life: 0.35 + Math.random() * 0.3,
              maxLife: 0.6,
              size: 1,
              glow: false,
            });
          }
        }
      }
    }
  }

  triggerSantaNow() {
    this.santaActive = true;
    this.santaDir = Math.random() < 0.5 ? 1 : -1;
    this.santaX = this.santaDir === 1 ? -90 : this.virtualW + 90;
    this.santaY = 20 + Math.random() * 25;
    this.santaSpeed = 42 + Math.random() * 16;
  }

  triggerBuildSnowmanNow() {
    const spot = this.findEmptySpot();
    if (spot !== null) {
      this.startBuildingAt(spot);
    } else {
      // If full, rebuild at center
      this.startBuildingAt(Math.floor(this.virtualW * 0.5));
    }
  }

  findEmptySpot() {
    const W = this.virtualW;
    const taskbarLeft = Math.floor((this.insets.left || 0) / this.scale);
    const taskbarRight = Math.floor((this.insets.right || 0) / this.scale);
    const minX = taskbarLeft + 28;
    const maxX = W - taskbarRight - 28;

    if (minX >= maxX) return Math.floor(W * 0.5);

    // Only consider existing snowmen that are VISIBLE within the current screen bounds!
    // (Snowmen built at a previous scale that are now offscreen will not block visible spots)
    const visibleSnowmen = this.snowmen
      .filter((s) => s.x >= minX - 10 && s.x <= maxX + 10)
      .map((s) => s.x)
      .sort((a, b) => a - b);

    const minClearance = 36; // clearance between snowmen

    // 1. If center is within visible bounds and vacant, build at center first!
    const center = Math.floor(W * 0.5);
    const hasCenter = visibleSnowmen.some((sx) => Math.abs(sx - center) < minClearance);
    if (!hasCenter && center >= minX && center <= maxX) {
      return center;
    }

    // 2. Dynamically sample spots across the entire visible width
    const step = 22;
    const validSpots = [];

    for (let x = minX; x <= maxX; x += step) {
      const isClear = !visibleSnowmen.some((sx) => Math.abs(sx - x) < minClearance);
      if (isClear) {
        const drift = this.driftHeights ? this.driftHeights[x] || 0 : 0;
        validSpots.push({ x, drift });
      }
    }

    if (validSpots.length > 0) {
      // Prefer spots with some snow pile, else any clear spot
      const withSnow = validSpots.filter((s) => s.drift >= 2);
      const pool = withSnow.length > 0 ? withSnow : validSpots;
      return pool[Math.floor(Math.random() * pool.length)].x;
    }

    // 3. Fallback: widest gap between visible snowmen
    if (visibleSnowmen.length > 0) {
      let maxGap = 0;
      let bestX = null;

      const leftGap = visibleSnowmen[0] - minX;
      if (leftGap > maxGap) {
        maxGap = leftGap;
        bestX = Math.floor((minX + visibleSnowmen[0]) * 0.5);
      }

      for (let i = 0; i < visibleSnowmen.length - 1; i++) {
        const gap = visibleSnowmen[i + 1] - visibleSnowmen[i];
        if (gap > maxGap) {
          maxGap = gap;
          bestX = Math.floor((visibleSnowmen[i] + visibleSnowmen[i + 1]) * 0.5);
        }
      }

      const rightGap = maxX - visibleSnowmen[visibleSnowmen.length - 1];
      if (rightGap > maxGap) {
        maxGap = rightGap;
        bestX = Math.floor((visibleSnowmen[visibleSnowmen.length - 1] + maxX) * 0.5);
      }

      if (bestX !== null && maxGap >= minClearance) {
        return bestX;
      }
    }

    return null;
  }

  startBuildingAt(targetX) {
    this.builderState = 'WALKING_IN';
    this.builderTargetX = targetX;
    this.builderTimer = 0;
    this.builderStage = 0;

    const taskbarLeft = Math.floor((this.insets.left || 0) / this.scale);
    const taskbarRight = Math.floor((this.insets.right || 0) / this.scale);

    this.child1.x = taskbarLeft - 18;
    this.child2.x = this.virtualW - taskbarRight + 18;

    // Guarantee that Child 1 and Child 2 wear distinctly different colored clothing!
    const idx1 = Math.floor(Math.random() * CHILD_OUTFITS.length);
    let idx2 = Math.floor(Math.random() * (CHILD_OUTFITS.length - 1));
    if (idx2 >= idx1) idx2++;

    this.child1.outfit = CHILD_OUTFITS[idx1];
    this.child2.outfit = CHILD_OUTFITS[idx2];

    // Randomize snowman appearance: scale (0.8x to 1.25x), hat style, scarf
    const hatChoice = HAT_COLORS[Math.floor(Math.random() * HAT_COLORS.length)];
    const scales = [0.8, 0.95, 1.0, 1.15, 1.25];
    const chosenScale = scales[Math.floor(Math.random() * scales.length)];

    this.pendingSnowmanConfig = {
      id: this.nextSnowmanId++,
      x: targetX,
      scale: chosenScale,
      hatColor: hatChoice.hat,
      ribbonColor: hatChoice.ribbon,
      scarfColor: this.child1.outfit.scarf,
    };
  }

  destroySnowman(index) {
    if (index < 0 || index >= this.snowmen.length) return;
    const s = this.snowmen[index];
    this.snowmen.splice(index, 1);

    const taskbarBottom = Math.floor((this.insets.bottom || 0) / this.scale);
    const baseY = this.virtualH - taskbarBottom;
    const sx = Math.floor(s.x);
    const groundY = Math.floor(baseY - (this.driftHeights ? this.driftHeights[sx] || 0 : 0));
    const bodyCenterY = groundY - Math.round(9 * s.scale);

    // FIX: snowflake-burst has internal CY = -48 offset!
    // Passing (bodyCenterY + 48) makes the burst land directly on the snowman's body!
    const fx = createFx(snowflakeBurst, {
      x: s.x,
      y: bodyCenterY + 48,
      count: Math.round(14 * s.scale),
    });
    this.activeFx.push(fx);

    // Additional ice shatter motes directly at the body
    const moteCount = Math.round(22 * s.scale);
    for (let i = 0; i < moteCount; i++) {
      const a = Math.random() * TAU;
      const sp = 20 + Math.random() * 50;
      this.interactiveParticles.push({
        x: s.x + (Math.random() - 0.5) * (10 * s.scale),
        y: bodyCenterY + (Math.random() - 0.5) * (8 * s.scale),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 12,
        life: 0.7 + Math.random() * 0.6,
        maxLife: 1.3,
        size: Math.random() < 0.5 ? 2 : 1,
        crystal: Math.random() < 0.35,
        glow: true,
      });
    }

    // Add fallen snow mound underneath
    if (this.driftHeights) {
      for (let dx = -8; dx <= 8; dx++) {
        const x = sx + dx;
        if (x >= 0 && x < this.virtualW) {
          this.driftHeights[x] += (1 - Math.abs(dx) / 9) * 2.8;
        }
      }
    }
  }

  update(dt) {
    if (this.isPaused) return;
    this.time += dt;

    const W = this.virtualW;
    const H = this.virtualH;

    const taskbarBottom = Math.floor((this.insets.bottom || 0) / this.scale);
    const taskbarLeft = Math.floor((this.insets.left || 0) / this.scale);
    const taskbarRight = Math.floor((this.insets.right || 0) / this.scale);
    const baseY = H - taskbarBottom;

    // Smooth periodic gusty wind
    const wind =
      this.windBase +
      5 * Math.sin((TAU * this.time) / 16 + 0.6) +
      2.5 * Math.sin((TAU * 2 * this.time) / 16 + 2.1);

    // 1. Update continuous snowflakes
    for (let i = 0; i < this.snowflakes.length; i++) {
      const f = this.snowflakes[i];

      const sway = Math.sin(this.time * f.swaySpeed + f.swayOffset) * f.swayAmp;
      f.x += (wind * (f.layer === 0 ? 0.35 : f.layer === 1 ? 0.65 : 1.0) + sway) * dt;
      f.y += f.fallSpeed * dt;
      f.spin += f.spinSpeed * dt;

      if (f.x < taskbarLeft - 10) f.x += (W - taskbarLeft - taskbarRight) + 20;
      else if (f.x > W - taskbarRight + 10) f.x -= (W - taskbarLeft - taskbarRight) + 20;

      const ix = Math.floor(f.x);
      let hitBottom = false;
      if (ix >= taskbarLeft && ix < W - taskbarRight && this.driftHeights) {
        const driftTop = baseY - this.driftHeights[ix];
        if (f.y >= driftTop) {
          hitBottom = true;
          if (f.layer > 0) {
            this.accumulateSnow(ix, f.layer === 2 ? 0.35 : 0.18);
          }
        }
      }

      if (f.y >= baseY || hitBottom) {
        this.snowflakes[i] = this.createFlake(false);
      }
    }

    // 2. Symmetric Drift Physics (avalanche slope limit & diffusion)
    this.smoothDrift(dt, taskbarLeft, W - taskbarRight);

    // 3. Update interactive particles
    for (let i = this.interactiveParticles.length - 1; i >= 0; i--) {
      const p = this.interactiveParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.interactiveParticles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 26 * dt;
      p.vx *= 0.96;
      if (p.spin !== undefined) p.spin += p.spinSpeed * dt;

      const px = Math.floor(p.x);
      if (px >= taskbarLeft && px < W - taskbarRight && this.driftHeights) {
        const driftTop = baseY - this.driftHeights[px];
        if (p.y >= driftTop) {
          this.accumulateSnow(px, 0.2);
          this.interactiveParticles.splice(i, 1);
        }
      }
    }

    // 4. Update active Pixelfx FX instances
    for (let i = this.activeFx.length - 1; i >= 0; i--) {
      const fx = this.activeFx[i];
      fx.update(dt);
      if (fx.done()) {
        this.activeFx.splice(i, 1);
      }
    }

    // 5. Update Multi-Snowman & Children Builder Lifecycle
    this.updateChildrenAndSnowman(dt, baseY, taskbarLeft, W - taskbarRight);

    // 6. Update Santa Sleigh Flight
    this.updateSanta(dt, W);

    // 7. Update Background Village (blinking window lights & smoke wisps)
    this.updateVillage(dt, baseY);

    // 8. Update Yellow Snowplow Clearing Machine
    this.updateSnowPlow(dt, baseY);
  }

  accumulateSnow(x, amount) {
    if (x < 0 || x >= this.virtualW || this.pileSpeed <= 0 || !this.driftHeights) return;
    const maxDrift = Math.floor(this.virtualH * this.maxPileHeightRatio);
    if (this.driftHeights[x] < maxDrift) {
      this.driftHeights[x] += amount * this.pileSpeed;
    }
  }

  smoothDrift(dt, minX, maxX) {
    if (!this.driftHeights) return;
    const heights = this.driftHeights;
    const maxSlope = 1.0;

    for (let x = minX; x < maxX - 1; x++) {
      const diff = heights[x] - heights[x + 1];
      if (diff > maxSlope) {
        const slide = (diff - maxSlope) * 0.35;
        heights[x] -= slide;
        heights[x + 1] += slide;
      } else if (diff < -maxSlope) {
        const slide = (-diff - maxSlope) * 0.35;
        heights[x] += slide;
        heights[x + 1] += slide;
      }
    }

    const blend = Math.min(0.25, 6 * dt);
    const temp = new Float32Array(heights);
    for (let x = minX + 1; x < maxX - 1; x++) {
      const avg = (temp[x - 1] + temp[x + 1]) * 0.5;
      heights[x] += (avg - temp[x]) * blend;
    }
    if (minX < maxX) {
      heights[minX] = heights[minX + 1] || heights[minX];
      heights[maxX - 1] = heights[maxX - 2] || heights[maxX - 1];
    }
  }

  updateChildrenAndSnowman(dt, baseY, minX, maxX) {
    // Check if ready to spawn children to build a snowman
    if (this.builderState === 'WAITING') {
      this.builderCooldown -= dt;
      if (this.builderCooldown <= 0 && this.snowmen.length < 5) {
        const spot = this.findEmptySpot();
        if (spot !== null) {
          const driftAtSpot = this.driftHeights ? this.driftHeights[spot] || 0 : 0;
          if (driftAtSpot >= 3 || this.snowmen.length === 0) {
            this.startBuildingAt(spot);
          }
        }
        this.builderCooldown = 18 + Math.random() * 15;
      }
    } else if (this.builderState === 'WALKING_IN') {
      const sp = 19 * dt;
      const target1 = this.builderTargetX - 14;
      const target2 = this.builderTargetX + 14;

      if (this.child1.x < target1) {
        this.child1.x = Math.min(target1, this.child1.x + sp);
        this.child1.legPhase += dt * 8;
      }
      if (this.child2.x > target2) {
        this.child2.x = Math.max(target2, this.child2.x - sp);
        this.child2.legPhase += dt * 8;
      }

      if (this.child1.x >= target1 && this.child2.x <= target2) {
        this.builderState = 'BUILDING';
        this.builderTimer = 0;
        this.builderStage = 1;
      }
    } else if (this.builderState === 'BUILDING') {
      this.builderTimer += dt;
      if (this.builderTimer > 2.0 && this.builderStage === 1) {
        this.builderStage = 2; // Middle ball
      } else if (this.builderTimer > 4.0 && this.builderStage === 2) {
        this.builderStage = 3; // Head & hat
      } else if (this.builderTimer > 5.8 && this.builderStage === 3) {
        // Complete build WITHOUT particle burst!
        this.builderState = 'ADMIRING';
        this.builderTimer = 0;

        // Add to permanent snowmen collection!
        if (this.pendingSnowmanConfig) {
          this.snowmen.push({ ...this.pendingSnowmanConfig, bounds: null });
        }
      }
    } else if (this.builderState === 'ADMIRING') {
      this.builderTimer += dt;
      if (this.builderTimer >= 1.0) {
        // Turn around and leave!
        this.builderState = 'WALKING_OUT';
      }
    } else if (this.builderState === 'WALKING_OUT') {
      const sp = 20 * dt;
      // Child 1 walks out to left (turns around to face left)
      this.child1.x -= sp;
      this.child1.legPhase += dt * 8;

      // Child 2 walks out to right (turns around to face right)
      this.child2.x += sp;
      this.child2.legPhase += dt * 8;

      if (this.child1.x < minX - 25 && this.child2.x > maxX + 25) {
        this.builderState = 'WAITING';
        this.builderCooldown = 18 + Math.random() * 15; // cooldown before next snowman
        this.pendingSnowmanConfig = null;
      }
    }
  }

  updateSanta(dt, W) {
    if (!this.santaEnabled) return;

    if (!this.santaActive) {
      this.santaTimer -= dt;
      if (this.santaTimer <= 0) {
        this.triggerSantaNow();
        const jitter = (Math.random() - 0.5) * 20;
        this.santaTimer = Math.max(25, this.santaFrequency + jitter);
      }
    } else {
      this.santaX += this.santaSpeed * this.santaDir * dt;
      this.santaY += Math.sin(this.time * 2.5) * 0.4;

      // Yellow sparkling stardust starts directly from the rear tip of the yellow runner under the sleigh
      const runnerEndX = this.santaX - this.santaDir * 8;
      const runnerEndY = this.santaY + 4;

      if (Math.random() < 0.75) {
        this.santaTrail.push({
          x: runnerEndX + (Math.random() - 0.5) * 1.5,
          y: runnerEndY + (Math.random() - 0.5) * 1.2,
          vx: -this.santaDir * (Math.random() * 8 + 4),
          vy: Math.random() * 4 + 1,
          life: 0.8 + Math.random() * 0.5,
          maxLife: 1.3,
          color: Math.random() < 0.75 ? '#fbbf24' : '#ffffff',
        });
      }

      if (
        (this.santaDir === 1 && this.santaX > W + 90) ||
        (this.santaDir === -1 && this.santaX < -90)
      ) {
        this.santaActive = false;
      }
    }

    for (let i = this.santaTrail.length - 1; i >= 0; i--) {
      const pt = this.santaTrail[i];
      pt.life -= dt;
      pt.x += (pt.vx || 0) * dt;
      pt.y += pt.vy * dt;
      if (pt.life <= 0) {
        this.santaTrail.splice(i, 1);
      }
    }
  }

  render() {
    clearFrame(this.frame);
    const p = painterFor(this.frame);
    const W = this.virtualW;
    const H = this.virtualH;
    const C = this.colors;

    const taskbarBottom = Math.floor((this.insets.bottom || 0) / this.scale);
    const taskbarLeft = Math.floor((this.insets.left || 0) / this.scale);
    const taskbarRight = Math.floor((this.insets.right || 0) / this.scale);
    const baseY = H - taskbarBottom;

    // 1. Night Sky Gradient & Stars
    this.renderSky(p, W, H, C);

    // 2. Santa Sleigh in Upper Sky
    if (this.santaActive || this.santaTrail.length > 0) {
      this.renderSanta(p);
    }

    // 3. Layer 0 (Far Snow Specks)
    for (let i = 0; i < this.snowflakes.length; i++) {
      const f = this.snowflakes[i];
      if (f.layer === 0) {
        p.put(Math.round(f.x), Math.round(f.y), C[4], 0.7);
      }
    }

    // 3.5 Background Village & Pine Trees (Houses, snowy roofs, blinking lights, star tree)
    this.renderBackgroundVillage(p, W, baseY, C);

    // 4. Snow Drift (Bottom Snow Bank on top of taskbar - covers village as snow accumulates!)
    this.renderDrift(p, W, baseY, taskbarLeft, W - taskbarRight, C);

    // 5. Render All Completed Snowmen
    this.renderCompletedSnowmen(p, baseY, C);

    // 6. Render Children & In-Progress Snowman
    this.renderChildrenAndBuildingSnowman(p, baseY, C);

    // 6.5 Yellow Snowplow Clearing Machine
    if (this.plowActive) {
      this.renderSnowPlow(p, baseY, C);
    }

    // 7. Layer 1 (Mid Drifting Flakes)
    for (let i = 0; i < this.snowflakes.length; i++) {
      const f = this.snowflakes[i];
      if (f.layer === 1) {
        const rx = Math.round(f.x);
        const ry = Math.round(f.y);
        p.put(rx, ry, WHITE);
        p.put(rx + 1, ry, C[6]);
        p.put(rx - 1, ry, C[6]);
        p.put(rx, ry + 1, C[6]);
        p.put(rx, ry - 1, C[6]);
      }
    }

    // 8. Layer 2 (Near Large 6-Arm Spinning Crystals)
    for (let i = 0; i < this.snowflakes.length; i++) {
      const f = this.snowflakes[i];
      if (f.layer === 2) {
        this.renderCrystal(p, f.x, f.y, f.crystalRadius, f.spin, C);
      }
    }

    // 9. Active Pixelfx FX (e.g. Snowflake Bursts)
    for (let i = 0; i < this.activeFx.length; i++) {
      this.activeFx[i].draw(this.frame);
    }

    // 10. Interactive Particles (mouse trails & bursts)
    for (let i = 0; i < this.interactiveParticles.length; i++) {
      const pt = this.interactiveParticles[i];
      const alpha = pt.life / pt.maxLife;
      if (pt.crystal) {
        this.renderCrystal(p, pt.x, pt.y, pt.size, pt.spin, C, alpha);
      } else {
        const px = Math.round(pt.x);
        const py = Math.round(pt.y);
        p.put(px, py, WHITE, alpha);
        if (pt.glow) {
          p.add(px, py, C[5], 0.4 * alpha);
        }
      }
    }

    // 11. Composite into Canvas ImageData
    composite(this.frame, this.imgData.data, null);
    this.ctx.putImageData(this.imgData, 0, 0);
  }

  renderSky(p, W, H, C) {
    const topColor = C[0];
    const lowColor = mix(C[0], C[1], 0.8);

    for (let y = 0; y < H; y++) {
      const t = y / H;
      const c = mix(topColor, lowColor, t);
      for (let x = 0; x < W; x += 2) {
        p.put(x, y, c);
        p.put(x + 1, y, c);
      }
    }

    const starCount = Math.floor(W * 0.15);
    for (let i = 0; i < starCount; i++) {
      const sx = Math.floor(rand(this.seed, i, 11) * W);
      const sy = Math.floor(rand(this.seed, i, 22) * (H * 0.65));
      const twinkle = Math.sin(this.time * 1.5 + rand(this.seed, i, 33) * TAU);
      if (twinkle > 0.4) {
        p.put(sx, sy, C[3], 0.35 + twinkle * 0.3);
      }
    }
  }

  renderDrift(p, W, baseY, minX, maxX, C) {
    if (!this.driftHeights) return;

    for (let x = minX; x < maxX; x++) {
      const h = this.driftHeights[x];
      const topY = Math.floor(baseY - h);

      for (let y = topY; y < baseY; y++) {
        const depth = y - topY;
        let color = WHITE;
        if (depth === 0) {
          color = WHITE;
          p.add(x, y, C[6], 0.2);
        } else if (depth < 2) {
          color = C[7];
        } else if (depth < 5) {
          color = C[6];
        } else if (depth < 9) {
          color = C[5];
        } else {
          color = C[4];
        }
        p.put(x, y, color);
      }
    }

    const glintCount = Math.floor((maxX - minX) * 0.08);
    for (let i = 0; i < glintCount; i++) {
      const gx = minX + Math.floor(rand(this.seed, i, 91) * (maxX - minX));
      const gy = Math.floor(baseY - (this.driftHeights[gx] || 0)) + Math.floor(rand(this.seed, i, 92) * 2);
      const tw = Math.sin(this.time * 2.2 + rand(this.seed, i, 93) * TAU);
      if (tw > 0.6) {
        const k = (tw - 0.6) / 0.4;
        p.put(gx, gy, WHITE, k);
        p.add(gx, gy, C[6], 0.4 * k);
      }
    }
  }

  renderCompletedSnowmen(p, baseY, C) {
    for (let i = 0; i < this.snowmen.length; i++) {
      const s = this.snowmen[i];
      const sx = Math.floor(s.x);
      const groundY = Math.floor(baseY - (this.driftHeights ? this.driftHeights[Math.max(0, Math.min(this.virtualW - 1, sx))] || 0 : 0));
      s.bounds = this.drawSnowman(p, sx, groundY, s.scale, s.hatColor, s.ribbonColor, s.scarfColor, C);

      // Hover highlight
      if (
        s.bounds &&
        this.mouseX >= s.bounds.x1 &&
        this.mouseX <= s.bounds.x2 &&
        this.mouseY >= s.bounds.y1 &&
        this.mouseY <= s.bounds.y2
      ) {
        p.add(sx, groundY - Math.round(10 * s.scale), C[6], 0.4);
      }
    }
  }

  drawSnowman(p, sx, groundY, scale, hatColor, ribbonColor, scarfColor, C) {
    const rBase = Math.round(4 * scale);
    const rMid = Math.round(3 * scale);
    const rHead = Math.max(2, Math.round(2 * scale));

    const by = groundY - rBase;
    const my = by - rBase - rMid + 1;
    const hy = my - rMid - rHead + 1;

    // 1. Bottom Snowball
    for (let dy = -rBase; dy <= rBase; dy++) {
      const w = Math.round(Math.sqrt(Math.max(0, rBase * rBase - dy * dy)));
      for (let dx = -w; dx <= w; dx++) {
        const c = dy > rBase * 0.3 ? C[6] : dy > rBase * 0.6 ? C[5] : WHITE;
        p.put(sx + dx, by + dy, c);
      }
    }

    // 2. Middle Snowball
    for (let dy = -rMid; dy <= rMid; dy++) {
      const w = Math.round(Math.sqrt(Math.max(0, rMid * rMid - dy * dy)));
      for (let dx = -w; dx <= w; dx++) {
        const c = dy > rMid * 0.4 ? C[6] : WHITE;
        p.put(sx + dx, my + dy, c);
      }
    }
    // Coal buttons
    p.put(sx, my - 1, hex('#0f172a'));
    p.put(sx, my + 1, hex('#0f172a'));

    // Stick arms
    const armLen = Math.round(3 * scale);
    p.put(sx - rMid - 1, my, hex('#78350f'));
    p.put(sx - rMid - 2, my - 1, hex('#78350f'));
    p.put(sx + rMid + 1, my, hex('#78350f'));
    p.put(sx + rMid + 2, my - 1, hex('#78350f'));

    // 3. Head & Details
    for (let dy = -rHead; dy <= rHead; dy++) {
      const w = Math.round(Math.sqrt(Math.max(0, rHead * rHead - dy * dy)));
      for (let dx = -w; dx <= w; dx++) {
        p.put(sx + dx, hy + dy, WHITE);
      }
    }
    // Coal Eyes
    p.put(sx - 1, hy - 1, hex('#0f172a'));
    p.put(sx + 1, hy - 1, hex('#0f172a'));
    // Carrot Nose
    p.put(sx, hy, hex('#ea580c'));
    p.put(sx + 1, hy, hex('#ea580c'));

    // Festive Scarf
    if (scarfColor) {
      for (let dx = -rHead; dx <= rHead; dx++) {
        p.put(sx + dx, hy + rHead, hex(scarfColor));
      }
      p.put(sx - 1, hy + rHead + 1, hex(scarfColor)); // tail
    }

    // Top Hat
    const brimW = Math.round(rHead * 1.5);
    const hatH = Math.round(3 * scale);
    for (let dx = -brimW; dx <= brimW; dx++) p.put(sx + dx, hy - rHead, hex(hatColor));
    for (let dy = -rHead - hatH; dy < -rHead; dy++) {
      for (let dx = -rHead; dx <= rHead; dx++) p.put(sx + dx, hy + dy, hex(hatColor));
    }
    // Hat Ribbon
    for (let dx = -rHead; dx <= rHead; dx++) p.put(sx + dx, hy - rHead - 1, hex(ribbonColor));

    return {
      x1: sx - rBase - 2,
      x2: sx + rBase + 2,
      y1: hy - rHead - hatH - 2,
      y2: groundY,
    };
  }

  renderChildrenAndBuildingSnowman(p, baseY, C) {
    // 1. In-progress snowman being built
    if (this.builderState === 'BUILDING' && this.pendingSnowmanConfig) {
      const s = this.pendingSnowmanConfig;
      const sx = Math.floor(s.x);
      const groundY = Math.floor(baseY - (this.driftHeights ? this.driftHeights[sx] || 0 : 0));
      const stage = this.builderStage;

      const rBase = Math.round(4 * s.scale);
      const rMid = Math.round(3 * s.scale);
      const rHead = Math.max(2, Math.round(2 * s.scale));

      const by = groundY - rBase;
      const my = by - rBase - rMid + 1;
      const hy = my - rMid - rHead + 1;

      // Base snowball (stage >= 1)
      if (stage >= 1) {
        for (let dy = -rBase; dy <= rBase; dy++) {
          const w = Math.round(Math.sqrt(Math.max(0, rBase * rBase - dy * dy)));
          for (let dx = -w; dx <= w; dx++) {
            p.put(sx + dx, by + dy, dy > 1 ? C[6] : WHITE);
          }
        }
      }
      // Torso snowball (stage >= 2)
      if (stage >= 2) {
        for (let dy = -rMid; dy <= rMid; dy++) {
          const w = Math.round(Math.sqrt(Math.max(0, rMid * rMid - dy * dy)));
          for (let dx = -w; dx <= w; dx++) {
            p.put(sx + dx, my + dy, dy > 1 ? C[6] : WHITE);
          }
        }
        p.put(sx - rMid - 1, my, hex('#78350f'));
        p.put(sx + rMid + 1, my, hex('#78350f'));
      }
      // Head & Hat (stage >= 3)
      if (stage >= 3) {
        for (let dy = -rHead; dy <= rHead; dy++) {
          const w = Math.round(Math.sqrt(Math.max(0, rHead * rHead - dy * dy)));
          for (let dx = -w; dx <= w; dx++) {
            p.put(sx + dx, hy + dy, WHITE);
          }
        }
        p.put(sx, hy, hex('#ea580c'));
        for (let dx = -Math.round(rHead * 1.4); dx <= Math.round(rHead * 1.4); dx++) {
          p.put(sx + dx, hy - rHead, hex(s.hatColor));
        }
      }
    }

    // 2. Children
    if (this.builderState === 'WALKING_IN' || this.builderState === 'BUILDING' || this.builderState === 'ADMIRING' || this.builderState === 'WALKING_OUT') {
      const c1x = Math.floor(this.child1.x);
      const c1y = Math.floor(baseY - (this.driftHeights ? this.driftHeights[Math.max(0, Math.min(this.virtualW - 1, c1x))] || 0 : 0));
      const c2x = Math.floor(this.child2.x);
      const c2y = Math.floor(baseY - (this.driftHeights ? this.driftHeights[Math.max(0, Math.min(this.virtualW - 1, c2x))] || 0 : 0));

      // Direction facing:
      // When walking in or building or admiring: Child 1 faces RIGHT (dir = 1), Child 2 faces LEFT (dir = -1)
      // When walking out: Child 1 faces LEFT (dir = -1), Child 2 faces RIGHT (dir = 1)!
      const c1Dir = this.builderState === 'WALKING_OUT' ? -1 : 1;
      const c2Dir = this.builderState === 'WALKING_OUT' ? 1 : -1;

      // Child 1
      this.drawChild(
        p,
        c1x,
        c1y,
        hex(this.child1.outfit.coat),
        hex(this.child1.outfit.hat),
        hex(this.child1.outfit.scarf),
        this.child1.legPhase,
        c1Dir,
        false
      );

      // Child 2
      this.drawChild(
        p,
        c2x,
        c2y,
        hex(this.child2.outfit.coat),
        hex(this.child2.outfit.hat),
        hex(this.child2.outfit.scarf),
        this.child2.legPhase,
        c2Dir,
        false
      );
    }
  }

  drawChild(p, x, y, coatColor, hatColor, scarfColor, legPhase, dir, cheering = false) {
    const step = Math.sin(legPhase);
    const leg1 = step > 0.2 ? -1 : 0;
    const leg2 = step < -0.2 ? -1 : 0;

    // Boots
    p.put(x - 1, y + leg1, hex('#1e293b'));
    p.put(x + 1, y + leg2, hex('#1e293b'));

    // Pants
    p.put(x - 1, y - 1, hex('#334155'));
    p.put(x + 1, y - 1, hex('#334155'));
    p.put(x, y - 2, hex('#334155'));

    // Coat / Torso
    for (let dy = -5; dy <= -3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        p.put(x + dx, y + dy, coatColor);
      }
    }

    // Arms
    if (cheering) {
      p.put(x - 3, y - 6, coatColor);
      p.put(x + 3, y - 6, coatColor);
      p.put(x - 3, y - 7, hex('#fed7aa'));
      p.put(x + 3, y - 7, hex('#fed7aa'));
    } else {
      p.put(x - 3, y - 4, coatColor);
      p.put(x + 3, y - 4, coatColor);
    }

    // Scarf
    p.put(x - 1, y - 6, scarfColor);
    p.put(x, y - 6, scarfColor);
    p.put(x + 1, y - 6, scarfColor);
    p.put(x - dir * 2, y - 5, scarfColor); // Trailing tail opposite to walking direction!

    // Face
    for (let dy = -9; dy <= -7; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        p.put(x + dx, y + dy, hex('#fed7aa'));
      }
    }
    // Eye dot facing walking direction
    p.put(x + dir, y - 8, hex('#0f172a'));

    // Beanie
    for (let dx = -2; dx <= 2; dx++) p.put(x + dx, y - 10, hatColor);
    p.put(x, y - 11, hatColor);
    p.put(x, y - 12, WHITE); // Pom-pom!
  }

  renderSanta(p) {
    for (let i = 0; i < this.santaTrail.length; i++) {
      const pt = this.santaTrail[i];
      const a = pt.life / pt.maxLife;
      const rx = Math.round(pt.x);
      const ry = Math.round(pt.y);
      p.put(rx, ry, hex(pt.color), a);
      p.add(rx, ry, hex('#fbbf24'), 0.3 * a);
    }

    if (!this.santaActive) return;

    const sx = Math.round(this.santaX);
    const sy = Math.round(this.santaY);
    const d = this.santaDir;

    this.drawReindeer(p, sx + d * 34, sy, d, true);
    this.drawReindeer(p, sx + d * 18, sy + 1, d, false);

    p.put(sx + d * 12, sy, hex('#fbbf24'), 0.7);
    p.put(sx + d * 7, sy + 1, hex('#fbbf24'), 0.7);

    this.drawSleigh(p, sx, sy, d);
  }

  drawReindeer(p, x, y, dir, isRudolph = false) {
    const leg = Math.sin(this.time * 14);

    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -2; dy <= 1; dy++) {
        p.put(x + dx * dir, y + dy, hex('#78350f'));
      }
    }
    p.put(x + dir * 5, y - 2, hex('#78350f'));
    p.put(x + dir * 6, y - 3, hex('#9a3412'));
    p.put(x + dir * 7, y - 3, hex('#9a3412'));

    p.put(x + dir * 5, y - 4, hex('#451a03'));
    p.put(x + dir * 4, y - 5, hex('#451a03'));
    p.put(x + dir * 6, y - 5, hex('#451a03'));

    if (isRudolph) {
      p.put(x + dir * 8, y - 3, hex('#ef4444'));
      p.add(x + dir * 8, y - 3, hex('#ef4444'), 0.85);
    }

    p.put(x - dir * 3, y + (leg > 0 ? 3 : 2), hex('#451a03'));
    p.put(x + dir * 3, y + (leg < 0 ? 3 : 2), hex('#451a03'));
  }

  drawSleigh(p, x, y, dir) {
    for (let dx = -8; dx <= 8; dx++) {
      p.put(x + dx * dir, y + 4, hex('#fbbf24'));
    }
    p.put(x + dir * 9, y + 3, hex('#fbbf24'));
    p.put(x + dir * 9, y + 2, hex('#fbbf24'));

    for (let dx = -7; dx <= 6; dx++) {
      for (let dy = 0; dy <= 3; dy++) {
        p.put(x + dx * dir, y + dy, hex('#dc2626'));
      }
    }
    p.put(x - dir * 8, y - 1, hex('#dc2626'));

    for (let dx = -6; dx <= -2; dx++) {
      for (let dy = -4; dy <= -1; dy++) {
        p.put(x + dx * dir, y + dy, hex('#15803d'));
      }
    }
    p.put(x - dir * 4, y - 5, hex('#f59e0b'));

    const hx = x + dir * 1;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -3; dy <= -1; dy++) {
        p.put(hx + dx * dir, y + dy, hex('#dc2626'));
      }
    }
    p.put(hx, y - 2, WHITE);
    p.put(hx + dir * 1, y - 2, WHITE);
    p.put(hx + dir * 2, y - 3, WHITE);

    p.put(hx + dir * 1, y - 4, hex('#fed7aa'));

    p.put(hx, y - 5, hex('#dc2626'));
    p.put(hx + dir * 1, y - 5, hex('#dc2626'));
    p.put(hx - dir * 1, y - 6, WHITE);
  }

  renderCrystal(p, x, y, r, angle, C, alpha = 1) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const turn = (Math.floor(angle * 2) % 2) === 1;
    const long = turn ? DIAG : AXIS;
    const short = turn ? AXIS : DIAG;

    p.put(rx, ry, WHITE, alpha);

    for (const [dx, dy] of long) {
      for (let d = 1; d <= r; d++) {
        p.put(rx + dx * d, ry + dy * d, d === r ? WHITE : C[6], alpha);
      }
    }
    for (const [dx, dy] of short) {
      for (let d = 1; d <= Math.max(1, Math.floor(r * 0.6)); d++) {
        p.put(rx + dx * d, ry + dy * d, C[5], alpha);
      }
    }

    p.add(rx, ry, C[5], 0.35 * alpha);
  }

  /* -------------------------------------------------------------
   * Background Village & Holiday Star Tree
   * ----------------------------------------------------------- */
  initVillage() {
    this.villageHouses = [];
    this.villageTrees = [];
    this.villageSmoke = [];

    const W = this.virtualW;

    // Distribute cottages across width, leaving a central corridor for the Holiday Star Tree
    const houseConfigs = [
      { relX: 0.11, w: 15, h: 10, roofH: 6, hasChimney: true, chimneySide: -1, wallColor: '#3d1d11', winCount: 2 },
      { relX: 0.27, w: 13, h: 9,  roofH: 5, hasChimney: true, chimneySide: 1,  wallColor: '#2b231f', winCount: 1 },
      { relX: 0.73, w: 14, h: 10, roofH: 6, hasChimney: true, chimneySide: 1,  wallColor: '#362218', winCount: 2 },
      { relX: 0.89, w: 16, h: 11, roofH: 7, hasChimney: true, chimneySide: -1, wallColor: '#301c13', winCount: 2 },
    ];

    if (W > 400) {
      houseConfigs.push(
        { relX: 0.38, w: 13, h: 9, roofH: 5, hasChimney: false, chimneySide: 1, wallColor: '#292524', winCount: 1 },
        { relX: 0.62, w: 14, h: 10, roofH: 6, hasChimney: true, chimneySide: -1, wallColor: '#3b1d11', winCount: 2 }
      );
    }

    this.villageHouses = houseConfigs.map((cfg, i) => ({
      ...cfg,
      lightOn: i % 2 === 0, // initially some on, some off
      lightTimer: 8 + (i * 6) % 14 + Math.random() * 8,
      smokeTimer: Math.random() * 2,
    }));

    // Distribute small snow-covered pine trees along the village ridge
    const treeRelPositions = [0.04, 0.18, 0.22, 0.34, 0.43, 0.57, 0.66, 0.80, 0.84, 0.96];
    if (W > 400) {
      treeRelPositions.push(0.31, 0.47, 0.53, 0.69);
    }

    this.villageTrees = treeRelPositions.map((relX, i) => ({
      relX,
      height: 12 + (i % 4) * 2, // 12px to 18px tall
      width: 7 + (i % 3) * 2,   // 7px to 11px wide
    }));
  }

  updateVillage(dt, baseY) {
    const W = this.virtualW;
    const villageGroundY = baseY - 6;

    for (let i = 0; i < this.villageHouses.length; i++) {
      const h = this.villageHouses[i];
      h.lightTimer -= dt;
      if (h.lightTimer <= 0) {
        // Toggle house window light!
        h.lightOn = !h.lightOn;
        h.lightTimer = 10 + Math.random() * 22;
      }

      // Cozy chimney smoke wisp if chimney exists and light is on
      if (h.hasChimney && h.lightOn) {
        h.smokeTimer -= dt;
        if (h.smokeTimer <= 0) {
          h.smokeTimer = 1.4 + Math.random() * 1.6;
          const hx = Math.round(h.relX * W);
          const cx = hx + h.chimneySide * Math.floor(h.w * 0.3);
          const cy = villageGroundY - (h.h + h.roofH + 2);
          this.villageSmoke.push({
            x: cx,
            y: cy,
            vx: (Math.random() - 0.5) * 2 + this.windBase * 0.18,
            vy: -(Math.random() * 4 + 3),
            life: 1.8 + Math.random() * 0.8,
            maxLife: 2.6,
          });
        }
      }
    }

    // Update chimney smoke wisps
    for (let i = this.villageSmoke.length - 1; i >= 0; i--) {
      const sm = this.villageSmoke[i];
      sm.life -= dt;
      sm.x += sm.vx * dt;
      sm.y += sm.vy * dt;
      if (sm.life <= 0) {
        this.villageSmoke.splice(i, 1);
      }
    }
  }

  renderBackgroundVillage(p, W, baseY, C) {
    const villageGroundY = baseY - 6;

    // 1. Gentle distant snowy ridge / ground horizon behind the foreground snow drift
    for (let x = 0; x < W; x++) {
      const ridgeY = Math.round(villageGroundY + Math.sin(x * 0.04 + 1.2) * 1.5);
      p.put(x, ridgeY, hex('#334155'), 0.85);
      p.put(x, ridgeY + 1, hex('#1e293b'), 0.95);
      for (let y = ridgeY + 2; y <= baseY + 2; y++) {
        p.put(x, y, hex('#0f172a'));
      }
    }

    // 2. Chimney smoke wisps drifting into sky
    for (let i = 0; i < this.villageSmoke.length; i++) {
      const sm = this.villageSmoke[i];
      const a = (sm.life / sm.maxLife) * 0.45;
      const rx = Math.round(sm.x);
      const ry = Math.round(sm.y);
      p.put(rx, ry, hex('#94a3b8'), a);
      if (sm.life < sm.maxLife * 0.7) {
        p.put(rx + 1, ry, hex('#cbd5e1'), a * 0.6);
      }
    }

    // 3. Small Background Pine Trees
    for (let i = 0; i < this.villageTrees.length; i++) {
      const t = this.villageTrees[i];
      const tx = Math.round(t.relX * W);
      const ty = Math.round(villageGroundY + Math.sin(tx * 0.04 + 1.2) * 1.5);
      this.drawPineTree(p, tx, ty, t.height, t.width);
    }

    // 4. Background Cottages
    for (let i = 0; i < this.villageHouses.length; i++) {
      const h = this.villageHouses[i];
      const hx = Math.round(h.relX * W);
      const hy = Math.round(villageGroundY + Math.sin(hx * 0.04 + 1.2) * 1.5);
      this.drawCottage(p, hx, hy, h);
    }

    // 5. Big Holiday Pine Tree with Star (in the middle, toggleable from settings)
    if (this.starTreeEnabled) {
      const centerX = Math.floor(W * 0.5);
      const centerY = Math.round(villageGroundY + Math.sin(centerX * 0.04 + 1.2) * 1.5);
      this.drawBigStarTree(p, centerX, centerY, C);
    }
  }

  drawCottage(p, x, groundY, h) {
    const halfW = Math.floor(h.w * 0.5);
    const wallTop = groundY - h.h;
    const roofTop = wallTop - h.roofH;

    // Chimney (behind roof)
    if (h.hasChimney) {
      const cx = x + h.chimneySide * Math.floor(h.w * 0.3);
      for (let cy = roofTop - 3; cy <= wallTop; cy++) {
        p.put(cx - 1, cy, hex('#475569'));
        p.put(cx, cy, hex('#334155'));
      }
      p.put(cx - 1, roofTop - 4, WHITE);
      p.put(cx, roofTop - 4, WHITE);
      p.put(cx + 1, roofTop - 4, hex('#cbd5e1'));
    }

    // Walls (timber logs)
    for (let y = wallTop; y <= groundY; y++) {
      const isShadowRow = (y - wallTop) % 3 === 0;
      const wallColor = isShadowRow ? hex('#1e293b') : hex(h.wallColor);
      for (let dx = -halfW; dx <= halfW; dx++) {
        p.put(x + dx, y, wallColor);
      }
    }

    // Door in center or side
    const doorW = 3;
    const doorH = 5;
    const doorX = x - (h.winCount === 1 ? halfW - 4 : 1);
    for (let dy = 0; dy < doorH; dy++) {
      for (let dx = 0; dx < doorW; dx++) {
        p.put(doorX + dx, groundY - dy, hex('#1e293b'));
      }
    }

    // Windows with dynamic warm amber light
    const windowY = wallTop + 3;
    const winColor = h.lightOn ? hex('#fef08a') : hex('#0f172a');
    const winFrame = hex('#1e293b');

    if (h.winCount === 1) {
      const wx = x + halfW - 4;
      p.put(wx, windowY, winColor);
      p.put(wx + 1, windowY, winColor);
      p.put(wx, windowY + 1, winColor);
      p.put(wx + 1, windowY + 1, winColor);
      p.put(wx - 1, windowY + 2, winFrame);
      p.put(wx, windowY + 2, winFrame);
      p.put(wx + 1, windowY + 2, winFrame);
      p.put(wx + 2, windowY + 2, winFrame);

      if (h.lightOn) {
        p.add(wx, windowY, hex('#f59e0b'), 0.4);
        p.add(wx + 1, windowY, hex('#f59e0b'), 0.4);
      }
    } else {
      const leftWx = x - halfW + 2;
      const rightWx = x + halfW - 3;
      // Left window
      p.put(leftWx, windowY, winColor);
      p.put(leftWx + 1, windowY, winColor);
      p.put(leftWx, windowY + 1, winColor);
      p.put(leftWx + 1, windowY + 1, winColor);
      // Right window
      p.put(rightWx, windowY, winColor);
      p.put(rightWx + 1, windowY, winColor);
      p.put(rightWx, windowY + 1, winColor);
      p.put(rightWx + 1, windowY + 1, winColor);

      if (h.lightOn) {
        p.add(leftWx, windowY, hex('#f59e0b'), 0.35);
        p.add(rightWx, windowY, hex('#f59e0b'), 0.35);
      }
    }

    // Gabled Roof with thick snow covering
    const roofHalfW = halfW + 2;
    for (let r = 0; r <= h.roofH; r++) {
      const curY = wallTop - r;
      const span = Math.round(roofHalfW * (1 - r / (h.roofH + 1)));
      p.put(x - span - 1, curY, hex('#1e293b'));
      p.put(x + span + 1, curY, hex('#1e293b'));

      for (let dx = -span; dx <= span; dx++) {
        if (r >= h.roofH - 1) {
          p.put(x + dx, curY, WHITE);
        } else if (r >= h.roofH - 2) {
          p.put(x + dx, curY, hex('#e2e8f0'));
        } else {
          p.put(x + dx, curY, hex('#334155'));
        }
      }
    }
    // Snow overhang along the eaves
    for (let dx = -roofHalfW; dx <= roofHalfW; dx++) {
      p.put(x + dx, wallTop, hex('#e2e8f0'));
    }
  }

  drawPineTree(p, x, groundY, height, width) {
    const trunkH = Math.max(2, Math.floor(height * 0.2));
    for (let y = groundY - trunkH; y <= groundY; y++) {
      p.put(x, y, hex('#3b1d11'));
    }

    const foliageH = height - trunkH;
    const tiers = 3;
    const tierH = Math.floor(foliageH / tiers);

    for (let t = 0; t < tiers; t++) {
      const tierBaseY = groundY - trunkH - t * tierH;
      const tierTopY = tierBaseY - tierH;
      const tierMaxW = Math.max(2, Math.floor(width * (1 - t * 0.28)));

      for (let y = tierBaseY; y >= tierTopY; y--) {
        const progress = (tierBaseY - y) / (tierH || 1);
        const curW = Math.max(1, Math.round(tierMaxW * (1 - progress * 0.7)));

        for (let dx = -curW; dx <= curW; dx++) {
          const isSnowTop = (y === tierTopY || (progress > 0.6 && Math.abs(dx) <= 1));
          if (isSnowTop) {
            p.put(x + dx, y, WHITE);
          } else if (progress > 0.4) {
            p.put(x + dx, y, hex('#cbd5e1'));
          } else {
            p.put(x + dx, y, hex('#14532d'));
          }
        }
      }
    }
    p.put(x, groundY - height, WHITE);
  }

  drawBigStarTree(p, x, groundY, C) {
    // Trunk
    for (let dy = 0; dy <= 3; dy++) {
      p.put(x - 1, groundY - dy, hex('#451a03'));
      p.put(x, groundY - dy, hex('#3b1d11'));
      p.put(x + 1, groundY - dy, hex('#451a03'));
    }

    // 4 Distinct Tiers of lush pine foliage
    const tiers = [
      { baseY: groundY - 3,  topY: groundY - 9,  w: 10 },
      { baseY: groundY - 8,  topY: groundY - 15, w: 8  },
      { baseY: groundY - 14, topY: groundY - 21, w: 6  },
      { baseY: groundY - 20, topY: groundY - 26, w: 3  },
    ];

    for (let t = 0; t < tiers.length; t++) {
      const { baseY: bY, topY: tY, w } = tiers[t];
      for (let y = bY; y >= tY; y--) {
        const k = (bY - y) / (bY - tY || 1);
        const curW = Math.max(1, Math.round(w * (1 - k * 0.65)));

        for (let dx = -curW; dx <= curW; dx++) {
          if (y === tY || (k > 0.65 && Math.abs(dx) <= curW - 1)) {
            p.put(x + dx, y, WHITE);
          } else if (k > 0.45) {
            p.put(x + dx, y, hex('#cbd5e1'));
          } else {
            const green = dx % 2 === 0 ? '#15803d' : '#14532d';
            p.put(x + dx, y, hex(green));
          }
        }
      }
    }

    // Festive Twinkling Fairy Lights scattered across the tree
    const fairyLights = [
      { dx: -7, dy: -5,  color: '#ef4444', phase: 0 },
      { dx:  6, dy: -6,  color: '#fbbf24', phase: 1.2 },
      { dx: -1, dy: -7,  color: '#38bdf8', phase: 2.1 },
      { dx: -5, dy: -11, color: '#4ade80', phase: 3.0 },
      { dx:  4, dy: -12, color: '#f43f5e', phase: 4.2 },
      { dx:  0, dy: -13, color: '#fbbf24', phase: 0.8 },
      { dx: -3, dy: -17, color: '#38bdf8', phase: 1.7 },
      { dx:  3, dy: -18, color: '#ef4444', phase: 2.9 },
      { dx:  0, dy: -23, color: '#4ade80', phase: 3.8 },
    ];

    for (let i = 0; i < fairyLights.length; i++) {
      const fl = fairyLights[i];
      const brightness = 0.5 + 0.5 * Math.sin(this.time * 3 + fl.phase);
      if (brightness > 0.25) {
        p.put(x + fl.dx, groundY + fl.dy, hex(fl.color), brightness);
        p.add(x + fl.dx, groundY + fl.dy, hex(fl.color), 0.3 * brightness);
      }
    }

    // THE BIG GOLDEN STAR ON TOP!
    const starY = groundY - 27;
    const pulse = 0.65 + 0.35 * Math.sin(this.time * 4);

    // Radiant core & points
    p.put(x, starY, WHITE);
    p.put(x - 1, starY, hex('#fef08a'));
    p.put(x + 1, starY, hex('#fef08a'));
    p.put(x, starY - 1, hex('#fef08a'));
    p.put(x, starY + 1, hex('#fef08a'));

    // Star 4 Ray Tips
    p.put(x - 2, starY, hex('#facc15'));
    p.put(x + 2, starY, hex('#facc15'));
    p.put(x, starY - 2, hex('#facc15'));
    p.put(x, starY + 2, hex('#facc15'));

    // Diagonal accents
    p.put(x - 1, starY - 1, hex('#fbbf24'));
    p.put(x + 1, starY - 1, hex('#fbbf24'));
    p.put(x - 1, starY + 1, hex('#fbbf24'));
    p.put(x + 1, starY + 1, hex('#fbbf24'));

    // Star Golden Glowing Halo
    p.add(x, starY, hex('#fbbf24'), 0.7 * pulse);
    p.add(x, starY - 1, hex('#f59e0b'), 0.4 * pulse);
    p.add(x, starY + 1, hex('#f59e0b'), 0.4 * pulse);
    p.add(x - 1, starY, hex('#f59e0b'), 0.4 * pulse);
    p.add(x + 1, starY, hex('#f59e0b'), 0.4 * pulse);
  }

  /* -------------------------------------------------------------
   * Yellow Snowplow / "Snowpillar" Machine
   * ----------------------------------------------------------- */
  updateSnowPlow(dt, baseY) {
    if (!this.plowActive) return;

    this.plowX += this.plowSpeed * dt;
    const bladeFrontX = Math.floor(this.plowX + 24);

    // Smoothly clear snow behind the plow's blade
    if (this.driftHeights) {
      const clearMax = Math.min(this.virtualW - 1, bladeFrontX);
      for (let x = 0; x <= clearMax; x++) {
        if (this.driftHeights[x] > 0) {
          // Spray snow particles from blade curl!
          if (x >= bladeFrontX - 5 && Math.random() < 0.45) {
            this.interactiveParticles.push({
              x: bladeFrontX + (Math.random() - 0.5) * 2,
              y: baseY - Math.min(this.driftHeights[x], 10) - Math.random() * 6,
              vx: Math.random() * 28 + 14,
              vy: -(Math.random() * 22 + 8),
              life: 0.5 + Math.random() * 0.4,
              maxLife: 0.8,
              color: Math.random() < 0.75 ? '#ffffff' : '#cbd5e1',
            });
          }
          this.driftHeights[x] = 0; // snow cleared!
        }
      }
    }

    // When the plow has fully driven across the screen to the right:
    if (this.plowX > this.virtualW + 35) {
      this.plowActive = false;
      this.clearDrift(true); // guarantee complete cleanup
    }
  }

  renderSnowPlow(p, baseY, C) {
    const px = Math.round(this.plowX);
    const py = baseY;

    // 1. Caterpillar Treads / Tracks along ground
    for (let x = px - 6; x <= px + 14; x++) {
      p.put(x, py, hex('#0f172a'));      // ground contact rubber
      p.put(x, py - 3, hex('#0f172a'));  // top tread return
    }
    // Tread end caps
    p.put(px - 7, py - 1, hex('#0f172a'));
    p.put(px - 7, py - 2, hex('#0f172a'));
    p.put(px + 15, py - 1, hex('#0f172a'));
    p.put(px + 15, py - 2, hex('#0f172a'));

    // Track rollers / wheels (4 bogies)
    const wheelXs = [px - 4, px + 1, px + 6, px + 11];
    for (let i = 0; i < wheelXs.length; i++) {
      const wx = wheelXs[i];
      p.put(wx, py - 1, hex('#64748b'));
      p.put(wx + 1, py - 1, hex('#64748b'));
      p.put(wx, py - 2, hex('#475569'));
      p.put(wx + 1, py - 2, hex('#475569'));
    }

    // 2. Heavy Yellow Chassis & Engine Hood
    for (let y = py - 8; y <= py - 4; y++) {
      for (let x = px - 6; x <= px + 5; x++) {
        const isHighlight = y === py - 8;
        const isShadow = y === py - 4;
        const color = isHighlight ? '#facc15' : isShadow ? '#ca8a04' : '#eab308';
        p.put(x, y, hex(color));
      }
    }
    // Engine cooling vents at rear
    p.put(px - 5, py - 6, hex('#854d0e'));
    p.put(px - 5, py - 5, hex('#854d0e'));

    // Exhaust pipe
    for (let y = py - 12; y <= py - 9; y++) {
      p.put(px - 3, y, hex('#1e293b'));
    }
    p.put(px - 4, py - 13, hex('#334155'));
    p.put(px - 3, py - 13, hex('#334155'));
    if (Math.sin(this.time * 8) > 0.2) {
      p.put(px - 5, py - 14, hex('#94a3b8'), 0.5);
    }

    // 3. Driver Cab
    for (let y = py - 14; y <= py - 9; y++) {
      for (let x = px + 1; x <= px + 11; x++) {
        p.put(x, y, hex('#eab308'));
      }
    }
    // Cab Roof
    for (let x = px; x <= px + 12; x++) {
      p.put(x, py - 15, hex('#facc15'));
    }

    // Windows
    for (let y = py - 13; y <= py - 10; y++) {
      for (let x = px + 3; x <= px + 7; x++) {
        p.put(x, y, hex('#7dd3fc'));
      }
    }
    for (let y = py - 13; y <= py - 10; y++) {
      p.put(px + 9, y, hex('#38bdf8'));
      p.put(px + 10, y, hex('#0284c7'));
    }
    p.put(px + 5, py - 11, hex('#0f172a'));
    p.put(px + 5, py - 12, hex('#0f172a'));

    // 4. Amber Hazard Warning Light (Roof beacon)
    const hazardOn = Math.sin(this.time * 22) > 0;
    p.put(px + 6, py - 16, hex('#475569')); // mount stem
    if (hazardOn) {
      p.put(px + 6, py - 17, WHITE); // bright flash core
      p.put(px + 5, py - 17, hex('#fbbf24'));
      p.put(px + 7, py - 17, hex('#fbbf24'));
      p.put(px + 6, py - 18, hex('#f59e0b'));

      // Ambient hazard glow halo
      p.add(px + 6, py - 17, hex('#f59e0b'), 0.85);
      p.add(px + 6, py - 18, hex('#fbbf24'), 0.5);
      p.add(px + 6, py - 16, hex('#f59e0b'), 0.4);
    } else {
      p.put(px + 6, py - 17, hex('#b45309')); // dark amber bulb
      p.put(px + 5, py - 17, hex('#78350f'));
      p.put(px + 7, py - 17, hex('#78350f'));
    }

    // 5. Heavy Steel Front Snowplow Blade
    for (let x = px + 12; x <= px + 16; x++) {
      p.put(x, py - 5, hex('#ca8a04'));
      p.put(x, py - 4, hex('#1e293b'));
    }

    // Scraper edge along ground
    for (let x = px + 17; x <= px + 24; x++) {
      p.put(x, py, hex('#334155'));
      p.put(x, py - 1, hex('#475569'));
    }
    // Curved blade scoop
    for (let y = py - 8; y <= py - 2; y++) {
      const progress = (py - 2 - y) / 6;
      const bx = px + 18 + Math.round(progress * 5);
      p.put(bx - 1, y, hex('#64748b'));
      p.put(bx, y, hex('#94a3b8'));
      p.put(bx + 1, y, hex('#cbd5e1')); // steel blade front lip
    }
    p.put(px + 23, py - 9, hex('#cbd5e1'));
    p.put(px + 24, py - 9, WHITE); // snow curling over top
    p.put(px + 23, py - 8, WHITE);

    // 6. Front Headlight & Beam
    p.put(px + 15, py - 7, WHITE);
    p.add(px + 17, py - 7, hex('#fef08a'), 0.6);
    p.add(px + 19, py - 6, hex('#fef08a'), 0.4);
    p.add(px + 21, py - 5, hex('#fef08a'), 0.25);
  }
}

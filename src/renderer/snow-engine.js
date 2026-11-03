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

    // Children & Snowman State Machine
    this.snowmanState = 'WAITING'; // 'WAITING' | 'WALKING_IN' | 'BUILDING' | 'CELEBRATING' | 'WALKING_OUT' | 'BUILT' | 'DESTROYED'
    this.snowmanX = 160;
    this.snowmanBuildTimer = 0;
    this.snowmanBuildStage = 0; // 1 = base, 2 = torso, 3 = head & details
    this.snowmanTimer = 0;
    this.child1 = { x: -20, y: 0, targetX: 145, legPhase: 0, anim: 'walk' };
    this.child2 = { x: 340, y: 0, targetX: 175, legPhase: 0, anim: 'walk' };
    this.snowmanBounds = null; // for click detection

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

    // Default snowman position near center
    this.snowmanX = Math.floor(this.virtualW * 0.5);
    this.child1.x = -20;
    this.child1.targetX = this.snowmanX - 14;
    this.child2.x = this.virtualW + 20;
    this.child2.targetX = this.snowmanX + 14;
  }

  initDrift(clearOnly = false) {
    this.driftHeights = new Float32Array(this.virtualW);
    if (!clearOnly) {
      // Very gentle 2px baseline
      for (let x = 0; x < this.virtualW; x++) {
        this.driftHeights[x] = 2;
      }
    }
  }

  clearDrift() {
    if (this.driftHeights) {
      this.driftHeights.fill(0);
    }
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

    // Check if clicked the Snowman!
    if (this.snowmanState === 'BUILT' && this.snowmanBounds) {
      const b = this.snowmanBounds;
      if (vx >= b.x1 && vx <= b.x2 && vy >= b.y1 && vy <= b.y2) {
        this.destroySnowman();
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
      // If cursor is near or inside the snow pile
      if (vy >= driftTop - 6 && vy <= baseY + 6) {
        const dist = Math.abs(x - vx);
        if (dist < radius) {
          const power = Math.max(0, 1 - dist / radius);
          this.driftHeights[x] = Math.max(0, this.driftHeights[x] - power * 1.6);

          // Snow spray particles when carving
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

  destroySnowman() {
    if (this.snowmanState !== 'BUILT') return;
    this.snowmanState = 'DESTROYED';
    this.snowmanTimer = 0;

    // Trigger official pixelfx Snowflake Burst effect at snowman location!
    const fx = createFx(snowflakeBurst, {
      x: this.snowmanX,
      y: this.snowmanBounds ? Math.floor((this.snowmanBounds.y1 + this.snowmanBounds.y2) * 0.5) : 140,
      count: 14,
    });
    this.activeFx.push(fx);

    // Additional ice shatter explosion motes
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * TAU;
      const sp = 20 + Math.random() * 55;
      this.interactiveParticles.push({
        x: this.snowmanX + (Math.random() - 0.5) * 10,
        y: this.snowmanBounds ? this.snowmanBounds.y1 + 8 : 140,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 15,
        life: 0.8 + Math.random() * 0.7,
        maxLife: 1.5,
        size: Math.random() < 0.5 ? 2 : 1,
        crystal: Math.random() < 0.3,
        glow: true,
      });
    }

    // Add fallen snow mound underneath
    if (this.driftHeights) {
      const sx = Math.floor(this.snowmanX);
      for (let dx = -8; dx <= 8; dx++) {
        const x = sx + dx;
        if (x >= 0 && x < this.virtualW) {
          this.driftHeights[x] += (1 - Math.abs(dx) / 9) * 3;
        }
      }
    }
  }

  update(dt) {
    if (this.isPaused) return;
    this.time += dt;

    const W = this.virtualW;
    const H = this.virtualH;

    // Taskbar insets scaled to virtual resolution
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

      // Wrap horizontally within visible bounds
      if (f.x < taskbarLeft - 10) f.x += (W - taskbarLeft - taskbarRight) + 20;
      else if (f.x > W - taskbarRight + 10) f.x -= (W - taskbarLeft - taskbarRight) + 20;

      // Check collision with the snow drift on top of the taskbar
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
      p.vy += 26 * dt; // Gravity
      p.vx *= 0.96;    // Drag
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

    // 5. Update Children & Snowman Lifecycle
    this.updateChildrenAndSnowman(dt, baseY, taskbarLeft, W - taskbarRight);

    // 6. Update Santa Sleigh Flight
    this.updateSanta(dt, W);
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
    const maxSlope = 1.0; // angle of repose: max height step before sliding

    // Avalanche pass: symmetric left and right
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

    // Symmetric smoothing diffusion
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
    this.snowmanTimer += dt;

    // Check drift readiness to start building a snowman
    if (this.snowmanState === 'WAITING') {
      const midDrift = this.driftHeights ? this.driftHeights[this.snowmanX] || 0 : 0;
      // Start when snow pile is at least 6px or after 25 seconds
      if (midDrift >= 5 || this.snowmanTimer >= 25) {
        this.snowmanState = 'WALKING_IN';
        this.child1.x = minX - 15;
        this.child2.x = maxX + 15;
        this.child1.targetX = this.snowmanX - 14;
        this.child2.targetX = this.snowmanX + 14;
        this.snowmanBuildStage = 0;
      }
    } else if (this.snowmanState === 'WALKING_IN') {
      const sp = 18 * dt;
      // Child 1 walks to right
      if (this.child1.x < this.child1.targetX) {
        this.child1.x = Math.min(this.child1.targetX, this.child1.x + sp);
        this.child1.legPhase += dt * 8;
      }
      // Child 2 walks to left
      if (this.child2.x > this.child2.targetX) {
        this.child2.x = Math.max(this.child2.targetX, this.child2.x - sp);
        this.child2.legPhase += dt * 8;
      }

      if (this.child1.x >= this.child1.targetX && this.child2.x <= this.child2.targetX) {
        this.snowmanState = 'BUILDING';
        this.snowmanBuildTimer = 0;
        this.snowmanBuildStage = 1; // Start rolling bottom snowball
      }
    } else if (this.snowmanState === 'BUILDING') {
      this.snowmanBuildTimer += dt;
      if (this.snowmanBuildTimer > 2.2 && this.snowmanBuildStage === 1) {
        this.snowmanBuildStage = 2; // Middle ball
      } else if (this.snowmanBuildTimer > 4.4 && this.snowmanBuildStage === 2) {
        this.snowmanBuildStage = 3; // Head & details
      } else if (this.snowmanBuildTimer > 6.2 && this.snowmanBuildStage === 3) {
        this.snowmanState = 'CELEBRATING';
        this.snowmanBuildTimer = 0;

        // Snowflake burst celebration pop!
        const fx = createFx(snowflakeBurst, {
          x: this.snowmanX,
          y: baseY - (this.driftHeights[this.snowmanX] || 0) - 10,
          count: 10,
        });
        this.activeFx.push(fx);
      }
    } else if (this.snowmanState === 'CELEBRATING') {
      this.snowmanBuildTimer += dt;
      // Cheer jumps for 2 seconds
      if (this.snowmanBuildTimer >= 2.2) {
        this.snowmanState = 'WALKING_OUT';
        this.child1.targetX = minX - 25;
        this.child2.targetX = maxX + 25;
      }
    } else if (this.snowmanState === 'WALKING_OUT') {
      const sp = 20 * dt;
      this.child1.x -= sp;
      this.child1.legPhase += dt * 8;
      this.child2.x += sp;
      this.child2.legPhase += dt * 8;

      if (this.child1.x < minX - 20 && this.child2.x > maxX + 20) {
        this.snowmanState = 'BUILT';
      }
    } else if (this.snowmanState === 'DESTROYED') {
      // Cooldown before next snowman can be built (70s)
      if (this.snowmanTimer > 70) {
        this.snowmanState = 'WAITING';
        this.snowmanTimer = 0;
      }
    }
  }

  updateSanta(dt, W) {
    if (!this.santaEnabled) return;

    if (!this.santaActive) {
      this.santaTimer -= dt;
      if (this.santaTimer <= 0) {
        this.triggerSantaNow();
        // Reset timer to randomized interval around frequency (e.g. 30s to 180s)
        const jitter = (Math.random() - 0.5) * 20;
        this.santaTimer = Math.max(25, this.santaFrequency + jitter);
      }
    } else {
      // Santa moves across sky with slight sine wave flight
      this.santaX += this.santaSpeed * this.santaDir * dt;
      this.santaY += Math.sin(this.time * 2.5) * 0.4;

      // Spawn magical stardust trail
      if (Math.random() < 0.6) {
        this.santaTrail.push({
          x: this.santaX - this.santaDir * 18 + (Math.random() - 0.5) * 4,
          y: this.santaY + (Math.random() - 0.5) * 4,
          vy: Math.random() * 8 + 3,
          life: 0.8 + Math.random() * 0.5,
          maxLife: 1.2,
          color: Math.random() < 0.6 ? '#fbbf24' : '#ffffff',
        });
      }

      // Check if finished flying across screen
      if (
        (this.santaDir === 1 && this.santaX > W + 90) ||
        (this.santaDir === -1 && this.santaX < -90)
      ) {
        this.santaActive = false;
      }
    }

    // Update trail particles
    for (let i = this.santaTrail.length - 1; i >= 0; i--) {
      const pt = this.santaTrail[i];
      pt.life -= dt;
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

    // 1. Draw Night Sky Gradient & Stars
    this.renderSky(p, W, H, C);

    // 2. Draw Santa Sleigh in Upper Sky
    if (this.santaActive || this.santaTrail.length > 0) {
      this.renderSanta(p);
    }

    // 3. Draw Layer 0 (Far Snow Specks)
    for (let i = 0; i < this.snowflakes.length; i++) {
      const f = this.snowflakes[i];
      if (f.layer === 0) {
        p.put(Math.round(f.x), Math.round(f.y), C[4], 0.7);
      }
    }

    // 4. Draw Snow Drift (Bottom Snow Bank on top of taskbar)
    this.renderDrift(p, W, baseY, taskbarLeft, W - taskbarRight, C);

    // 5. Draw Snowman & Children (walking/building atop snow drift)
    this.renderSnowmanAndChildren(p, baseY, C);

    // 6. Draw Layer 1 (Mid Drifting Flakes)
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

    // 7. Draw Layer 2 (Near Large 6-Arm Spinning Crystals)
    for (let i = 0; i < this.snowflakes.length; i++) {
      const f = this.snowflakes[i];
      if (f.layer === 2) {
        this.renderCrystal(p, f.x, f.y, f.crystalRadius, f.spin, C);
      }
    }

    // 8. Draw Active Pixelfx FX (e.g. Snowflake Bursts)
    for (let i = 0; i < this.activeFx.length; i++) {
      this.activeFx[i].draw(this.frame);
    }

    // 9. Draw Interactive Particles (mouse trails & bursts)
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

    // 10. Composite into Canvas ImageData
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

    // Drift glints
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

  renderSnowmanAndChildren(p, baseY, C) {
    const sx = Math.floor(this.snowmanX);
    const groundY = Math.floor(baseY - (this.driftHeights ? this.driftHeights[sx] || 0 : 0));

    // 1. Draw Snowman
    if (this.snowmanState === 'BUILDING' || this.snowmanState === 'CELEBRATING' || this.snowmanState === 'WALKING_OUT' || this.snowmanState === 'BUILT') {
      const stage = this.snowmanState === 'BUILDING' ? this.snowmanBuildStage : 3;

      // Base Snowball (stage >= 1)
      if (stage >= 1) {
        const by = groundY - 4;
        for (let dy = -4; dy <= 4; dy++) {
          const w = Math.round(Math.sqrt(Math.max(0, 16 - dy * dy)));
          for (let dx = -w; dx <= w; dx++) {
            const c = dy > 1 ? C[6] : dy > 2 ? C[5] : WHITE;
            p.put(sx + dx, by + dy, c);
          }
        }
      }

      // Middle Snowball (stage >= 2)
      if (stage >= 2) {
        const my = groundY - 11;
        for (let dy = -3; dy <= 3; dy++) {
          const w = Math.round(Math.sqrt(Math.max(0, 9 - dy * dy)));
          for (let dx = -w; dx <= w; dx++) {
            const c = dy > 1 ? C[6] : WHITE;
            p.put(sx + dx, my + dy, c);
          }
        }
        // Stick Arms
        p.put(sx - 4, my, hex('#78350f'));
        p.put(sx - 5, my - 1, hex('#78350f'));
        p.put(sx + 4, my, hex('#78350f'));
        p.put(sx + 5, my - 1, hex('#78350f'));
        // Coal buttons
        p.put(sx, my - 1, hex('#0f172a'));
        p.put(sx, my + 1, hex('#0f172a'));
      }

      // Head & Details (stage >= 3)
      if (stage >= 3) {
        const hy = groundY - 16;
        for (let dy = -2; dy <= 2; dy++) {
          const w = Math.round(Math.sqrt(Math.max(0, 4 - dy * dy)));
          for (let dx = -w; dx <= w; dx++) {
            p.put(sx + dx, hy + dy, WHITE);
          }
        }
        // Coal Eyes
        p.put(sx - 1, hy - 1, hex('#0f172a'));
        p.put(sx + 1, hy - 1, hex('#0f172a'));
        // Orange Carrot Nose
        p.put(sx, hy, hex('#ea580c'));
        p.put(sx + 1, hy, hex('#ea580c'));
        // Top Hat
        for (let dx = -3; dx <= 3; dx++) p.put(sx + dx, hy - 3, hex('#1e293b')); // Brim
        for (let dy = -6; dy <= -4; dy++) {
          for (let dx = -2; dx <= 2; dx++) p.put(sx + dx, hy + dy, hex('#0f172a'));
        }
        // Red Hat Ribbon
        for (let dx = -2; dx <= 2; dx++) p.put(sx + dx, hy - 4, hex('#ef4444'));

        // Save bounds for interactive clicking
        this.snowmanBounds = {
          x1: sx - 7,
          x2: sx + 7,
          y1: hy - 7,
          y2: groundY,
        };

        // Hover highlight
        if (
          this.snowmanState === 'BUILT' &&
          this.mouseX >= this.snowmanBounds.x1 &&
          this.mouseX <= this.snowmanBounds.x2 &&
          this.mouseY >= this.snowmanBounds.y1 &&
          this.mouseY <= this.snowmanBounds.y2
        ) {
          p.add(sx, hy, C[6], 0.4);
        }
      }
    }

    // 2. Draw Children
    if (this.snowmanState === 'WALKING_IN' || this.snowmanState === 'BUILDING' || this.snowmanState === 'CELEBRATING' || this.snowmanState === 'WALKING_OUT') {
      const c1x = Math.floor(this.child1.x);
      const c1y = Math.floor(baseY - (this.driftHeights ? this.driftHeights[Math.max(0, Math.min(this.virtualW - 1, c1x))] || 0 : 0));
      const c2x = Math.floor(this.child2.x);
      const c2y = Math.floor(baseY - (this.driftHeights ? this.driftHeights[Math.max(0, Math.min(this.virtualW - 1, c2x))] || 0 : 0));

      const isCheering = this.snowmanState === 'CELEBRATING';
      const cheerBob1 = isCheering ? Math.abs(Math.sin(this.time * 12)) * 3 : 0;
      const cheerBob2 = isCheering ? Math.abs(Math.sin(this.time * 12 + 0.8)) * 3 : 0;

      // Child 1 (Red Parka, Green Beanie, Gold Scarf)
      this.drawChild(p, c1x, c1y - cheerBob1, hex('#dc2626'), hex('#15803d'), hex('#f59e0b'), this.child1.legPhase, 1, isCheering);

      // Child 2 (Blue Coat, Red Beanie, Green Scarf)
      this.drawChild(p, c2x, c2y - cheerBob2, hex('#2563eb'), hex('#e11d48'), hex('#10b981'), this.child2.legPhase, -1, isCheering);
    }
  }

  drawChild(p, x, y, coatColor, hatColor, scarfColor, legPhase, dir, cheering = false) {
    // Height: ~13px
    const step = Math.sin(legPhase);
    const leg1 = step > 0.2 ? -1 : 0;
    const leg2 = step < -0.2 ? -1 : 0;

    // Boots / Feet
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
      // Arms raised up celebrating
      p.put(x - 3, y - 6, coatColor);
      p.put(x + 3, y - 6, coatColor);
      p.put(x - 3, y - 7, hex('#fed7aa')); // Mittens
      p.put(x + 3, y - 7, hex('#fed7aa'));
    } else {
      p.put(x - 3, y - 4, coatColor);
      p.put(x + 3, y - 4, coatColor);
    }

    // Scarf
    p.put(x - 1, y - 6, scarfColor);
    p.put(x, y - 6, scarfColor);
    p.put(x + 1, y - 6, scarfColor);
    p.put(x - dir * 2, y - 5, scarfColor); // Trailing tail

    // Face / Head
    for (let dy = -9; dy <= -7; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        p.put(x + dx, y + dy, hex('#fed7aa'));
      }
    }
    // Eye dot
    p.put(x + dir, y - 8, hex('#0f172a'));

    // Hat / Beanie
    for (let dx = -2; dx <= 2; dx++) p.put(x + dx, y - 10, hatColor);
    p.put(x, y - 11, hatColor);
    p.put(x, y - 12, WHITE); // White Pom-pom!
  }

  renderSanta(p) {
    // 1. Draw Stardust Trail
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
    const d = this.santaDir; // 1 = flying right, -1 = flying left

    // 2. Reindeer 1 (Lead Rudolph with glowing red nose!)
    this.drawReindeer(p, sx + d * 34, sy, d, true);

    // 3. Reindeer 2 (Second in tandem)
    this.drawReindeer(p, sx + d * 18, sy + 1, d, false);

    // Reins connecting to Sleigh
    p.put(sx + d * 12, sy, hex('#fbbf24'), 0.7);
    p.put(sx + d * 7, sy + 1, hex('#fbbf24'), 0.7);

    // 4. Sleigh & Santa
    this.drawSleigh(p, sx, sy, d);
  }

  drawReindeer(p, x, y, dir, isRudolph = false) {
    const leg = Math.sin(this.time * 14);

    // Body
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -2; dy <= 1; dy++) {
        p.put(x + dx * dir, y + dy, hex('#78350f'));
      }
    }
    // Neck & Head
    p.put(x + dir * 5, y - 2, hex('#78350f'));
    p.put(x + dir * 6, y - 3, hex('#9a3412'));
    p.put(x + dir * 7, y - 3, hex('#9a3412'));

    // Antlers
    p.put(x + dir * 5, y - 4, hex('#451a03'));
    p.put(x + dir * 4, y - 5, hex('#451a03'));
    p.put(x + dir * 6, y - 5, hex('#451a03'));

    // Rudolph glowing red nose!
    if (isRudolph) {
      p.put(x + dir * 8, y - 3, hex('#ef4444'));
      p.add(x + dir * 8, y - 3, hex('#ef4444'), 0.85); // glowing halo
    }

    // Galloping legs
    p.put(x - dir * 3, y + (leg > 0 ? 3 : 2), hex('#451a03'));
    p.put(x + dir * 3, y + (leg < 0 ? 3 : 2), hex('#451a03'));
  }

  drawSleigh(p, x, y, dir) {
    // Gold runners
    for (let dx = -8; dx <= 8; dx++) {
      p.put(x + dx * dir, y + 4, hex('#fbbf24'));
    }
    p.put(x + dir * 9, y + 3, hex('#fbbf24')); // Curled front
    p.put(x + dir * 9, y + 2, hex('#fbbf24'));

    // Red sleigh body
    for (let dx = -7; dx <= 6; dx++) {
      for (let dy = 0; dy <= 3; dy++) {
        p.put(x + dx * dir, y + dy, hex('#dc2626'));
      }
    }
    p.put(x - dir * 8, y - 1, hex('#dc2626'));

    // Sack of Gifts
    for (let dx = -6; dx <= -2; dx++) {
      for (let dy = -4; dy <= -1; dy++) {
        p.put(x + dx * dir, y + dy, hex('#15803d'));
      }
    }
    p.put(x - dir * 4, y - 5, hex('#f59e0b')); // Gift parcel

    // Santa!
    const hx = x + dir * 1;
    // Red coat
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -3; dy <= -1; dy++) {
        p.put(hx + dx * dir, y + dy, hex('#dc2626'));
      }
    }
    // White fur trim & beard
    p.put(hx, y - 2, WHITE);
    p.put(hx + dir * 1, y - 2, WHITE);
    p.put(hx + dir * 2, y - 3, WHITE);

    // Face
    p.put(hx + dir * 1, y - 4, hex('#fed7aa'));

    // Red hat with white pom-pom
    p.put(hx, y - 5, hex('#dc2626'));
    p.put(hx + dir * 1, y - 5, hex('#dc2626'));
    p.put(hx - dir * 1, y - 6, WHITE); // Pom-pom
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
}

import {
  createFrame,
  clearFrame,
  painterFor,
  composite,
} from '../pixelfx/core/fx.js';
import {
  hex,
  mix,
  fit,
  rgb,
  WHITE,
} from '../pixelfx/core/index.js';
import { TAU, rand, wrap, smooth } from '../pixelfx/core/math.js';

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
    this.isPaused = false;

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
    this.driftHeights = null; // Float32Array
    this.driftVelocities = null;

    // Interactive particles (mouse trail / click bursts)
    this.interactiveParticles = [];

    // Mouse state
    this.mouseX = -9999;
    this.mouseY = -9999;
    this.prevMouseX = -9999;
    this.prevMouseY = -9999;
    this.mouseLeftDown = false;
    this.mouseSpeed = 0;

    // Continuous snowflakes simulation
    this.snowflakes = [];
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
    this.initDrift();

    // Populate snowflakes based on density
    this.initSnowflakes();
  }

  initDrift() {
    this.driftHeights = new Float32Array(this.virtualW);
    this.driftVelocities = new Float32Array(this.virtualW);

    // Baseline wave pattern for snow bank
    for (let x = 0; x < this.virtualW; x++) {
      const nx = x / this.virtualW;
      const baseWave =
        6 +
        2.5 * Math.sin(nx * 12 + 1.2) +
        1.8 * Math.sin(nx * 26 + 3.4) +
        0.8 * Math.sin(nx * 60 + 0.5);
      this.driftHeights[x] = Math.max(3, baseWave);
    }
  }

  resetDrift() {
    this.initDrift();
  }

  initSnowflakes() {
    this.snowflakes = [];
    const baseCount = Math.floor(this.virtualW * 0.85 * this.density);

    for (let i = 0; i < baseCount; i++) {
      this.snowflakes.push(this.createFlake(true));
    }
  }

  createFlake(randomY = false) {
    // 3 layers: 0 = Far (speck), 1 = Mid (plus/flake), 2 = Near (spinning crystal)
    const layerRand = Math.random();
    let layer = 0;
    if (layerRand > 0.85) layer = 2; // Near
    else if (layerRand > 0.5) layer = 1; // Mid

    const x = Math.random() * this.virtualW;
    const y = randomY ? Math.random() * this.virtualH : -10 - Math.random() * 20;

    const fallSpeed =
      layer === 0
        ? 18 + Math.random() * 12
        : layer === 1
        ? 28 + Math.random() * 20
        : 40 + Math.random() * 26;

    const swaySpeed = 1.2 + Math.random() * 2.5;
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
    const vx = clientX / this.scale;
    const vy = clientY / this.scale;

    this.mouseSpeed = Math.hypot(vx - this.mouseX, vy - this.mouseY);
    this.prevMouseX = this.mouseX;
    this.prevMouseY = this.mouseY;
    this.mouseX = vx;
    this.mouseY = vy;

    // Spawn mouse trail frost particles
    if (this.mouseSpeed > 0.8) {
      const trailCount = Math.min(3, Math.floor(this.mouseSpeed * 0.5));
      for (let i = 0; i < trailCount; i++) {
        this.interactiveParticles.push({
          x: this.mouseX + (Math.random() - 0.5) * 4,
          y: this.mouseY + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 12 + (this.mouseX - this.prevMouseX) * 0.2,
          vy: (Math.random() - 0.5) * 12 + (this.mouseY - this.prevMouseY) * 0.2,
          life: 0.6 + Math.random() * 0.4,
          maxLife: 0.8,
          size: Math.random() < 0.3 ? 2 : 1,
          glow: true,
        });
      }
    }

    // Carve snow drift if cursor touches bottom snow pile
    if (this.driftHeights && vy >= this.virtualH - 25) {
      const radius = 10;
      const minX = Math.max(0, Math.floor(vx - radius));
      const maxX = Math.min(this.virtualW - 1, Math.ceil(vx + radius));
      for (let x = minX; x <= maxX; x++) {
        const dist = Math.abs(x - vx);
        if (dist < radius) {
          const carve = (1 - dist / radius) * 0.8;
          this.driftHeights[x] = Math.max(2, this.driftHeights[x] - carve);
        }
      }
    }
  }

  onMouseClick(clientX, clientY) {
    const vx = clientX / this.scale;
    const vy = clientY / this.scale;

    // Click burst: explosion of 16 glowing snowflake crystals
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (TAU * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 25 + Math.random() * 45;
      this.interactiveParticles.push({
        x: vx,
        y: vy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 10,
        life: 1.0 + Math.random() * 0.8,
        maxLife: 1.5,
        size: Math.random() < 0.4 ? 3 : 2,
        crystal: true,
        spin: Math.random() * TAU,
        spinSpeed: (Math.random() - 0.5) * 8,
        glow: true,
      });
    }
  }

  update(dt) {
    if (this.isPaused) return;
    this.time += dt;

    // Wind gust simulation (smooth periodic breeze with gusts)
    const wind =
      this.windBase +
      6 * Math.sin((TAU * this.time) / 14 + 0.6) +
      3 * Math.sin((TAU * 2 * this.time) / 14 + 2.1);

    // Update continuous snowflakes
    const W = this.virtualW;
    const H = this.virtualH;

    for (let i = 0; i < this.snowflakes.length; i++) {
      const f = this.snowflakes[i];

      // Update position with sway & wind
      const sway = Math.sin(this.time * f.swaySpeed + f.swayOffset) * f.swayAmp;
      f.x += (wind * (f.layer === 0 ? 0.35 : f.layer === 1 ? 0.65 : 1.0) + sway) * dt;
      f.y += f.fallSpeed * dt;
      f.spin += f.spinSpeed * dt;

      // Wrap around screen horizontally
      if (f.x < -10) f.x += W + 20;
      else if (f.x > W + 10) f.x -= W + 20;

      // Check collision with the bottom snow drift
      const ix = Math.floor(f.x);
      let hitBottom = false;
      if (ix >= 0 && ix < W) {
        const driftTop = H - this.driftHeights[ix];
        if (f.y >= driftTop) {
          hitBottom = true;
          // Piling accumulation!
          if (f.layer > 0) {
            this.accumulateSnow(ix, f.layer === 2 ? 0.45 : 0.2);
          }
        }
      }

      if (f.y >= H + 10 || hitBottom) {
        // Recycle snowflake to the top
        this.snowflakes[i] = this.createFlake(false);
      }
    }

    // Snow pile physics: gentle diffusion/smoothing
    this.smoothDrift(dt);

    // Update interactive particles
    for (let i = this.interactiveParticles.length - 1; i >= 0; i--) {
      const p = this.interactiveParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.interactiveParticles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 28 * dt; // Gravity
      p.vx *= 0.96;    // Drag
      if (p.spin !== undefined) p.spin += p.spinSpeed * dt;

      // Collide with snow drift
      const px = Math.floor(p.x);
      if (px >= 0 && px < W) {
        const driftTop = H - this.driftHeights[px];
        if (p.y >= driftTop) {
          this.accumulateSnow(px, 0.3);
          this.interactiveParticles.splice(i, 1);
        }
      }
    }
  }

  accumulateSnow(x, amount) {
    if (x < 0 || x >= this.virtualW) return;
    const maxDrift = Math.floor(this.virtualH * 0.28); // Cap drift to 28% screen height
    if (this.driftHeights[x] < maxDrift) {
      this.driftHeights[x] += amount * this.pileSpeed;
    }
  }

  smoothDrift(dt) {
    const W = this.virtualW;
    const factor = 12 * dt;
    for (let x = 1; x < W - 1; x++) {
      const avg = (this.driftHeights[x - 1] + this.driftHeights[x + 1]) * 0.5;
      this.driftHeights[x] += (avg - this.driftHeights[x]) * Math.min(0.5, factor);
    }
  }

  render() {
    clearFrame(this.frame);
    const p = painterFor(this.frame);
    const W = this.virtualW;
    const H = this.virtualH;
    const C = this.colors;

    // 1. Draw atmospheric background night sky & stars
    this.renderSky(p, W, H, C);

    // 2. Draw Layer 0 (Far specks)
    for (let i = 0; i < this.snowflakes.length; i++) {
      const f = this.snowflakes[i];
      if (f.layer === 0) {
        p.put(Math.round(f.x), Math.round(f.y), C[4], 0.7);
      }
    }

    // 3. Draw Snow Drift (Bottom Snow Bank)
    this.renderDrift(p, W, H, C);

    // 4. Draw Layer 1 (Mid drifting flakes & crosses)
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

    // 5. Draw Layer 2 (Near large 6-arm spinning crystals with glowing cores)
    for (let i = 0; i < this.snowflakes.length; i++) {
      const f = this.snowflakes[i];
      if (f.layer === 2) {
        this.renderCrystal(p, f.x, f.y, f.crystalRadius, f.spin, C);
      }
    }

    // 6. Draw interactive particles (mouse trails & bursts)
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

    // 7. Composite frame (color + additive light) into canvas ImageData
    composite(this.frame, this.imgData.data, null);
    this.ctx.putImageData(this.imgData, 0, 0);
  }

  renderSky(p, W, H, C) {
    // Cold dusk gradient
    const topColor = C[0];
    const lowColor = mix(C[0], C[1], 0.8);

    // Dithered gradient sky
    for (let y = 0; y < H; y++) {
      const t = y / H;
      const c = mix(topColor, lowColor, t);
      for (let x = 0; x < W; x += 2) {
        p.put(x, y, c);
        p.put(x + 1, y, c);
      }
    }

    // Subtle twinkling stars
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

  renderCrystal(p, x, y, r, angle, C, alpha = 1) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const turn = (Math.floor(angle * 2) % 2) === 1;
    const long = turn ? DIAG : AXIS;
    const short = turn ? AXIS : DIAG;

    // Core
    p.put(rx, ry, WHITE, alpha);

    // Arms
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

    // Halo glow
    p.add(rx, ry, C[5], 0.35 * alpha);
  }

  renderDrift(p, W, H, C) {
    // Fill snow drift from bottom up
    for (let x = 0; x < W; x++) {
      const h = this.driftHeights[x];
      const topY = Math.floor(H - h);

      for (let y = topY; y < H; y++) {
        const depth = y - topY;
        let color = WHITE;
        if (depth === 0) {
          color = WHITE;
          p.add(x, y, C[6], 0.2); // slight glistening light on top crest
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

    // Twinkling drift glints along the surface
    const glintCount = Math.floor(W * 0.08);
    for (let i = 0; i < glintCount; i++) {
      const gx = Math.floor(rand(this.seed, i, 91) * W);
      const gy = Math.floor(H - this.driftHeights[gx]) + Math.floor(rand(this.seed, i, 92) * 2);
      const tw = Math.sin(this.time * 2.2 + rand(this.seed, i, 93) * TAU);
      if (tw > 0.6) {
        const k = (tw - 0.6) / 0.4;
        p.put(gx, gy, WHITE, k);
        p.add(gx, gy, C[6], 0.4 * k);
      }
    }
  }
}


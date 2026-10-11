import type { Environment } from '../env/environment.ts';
import type { Sky } from '../env/sky.ts';
import { Raster } from '../sprites/raster.ts';
import { C } from './palette.ts';
import { hash } from './sea.ts';

/**
 * The sky and the sea behind everything, with the time of day and the
 * weather: stepped and dithered sky bands, sun and moon on their arcs (the
 * moon in its real phase), stars, clouds in two parallax layers, the
 * glitter path of the sun or moon on the water, rain, lightning and fog.
 * Shared by every screen through Renderer.backdrop.
 */

/** Colors of the sky and the sea for a time of day. */
export interface SkyColors {
  bands: readonly [number, number, number, number];
  horizon: number;
  far: number;
  farDash: readonly [number, number, number, number];
  sea: number;
  seaTop: number;
  seaDash: readonly [number, number, number];
  mid: number;
  deep: number;
  stars: boolean;
  /** Haze over the horizon, a thin last band of the sky. */
  haze: number;
  /** Dithered glow around the sun. */
  halo: number;
  /** Sunlight on the cloud edges facing a low sun (0: none). */
  cloudRim: number;
  /** Sun or moon. */
  orb: number;
  /** The sun's or moon's light on the water. */
  glitter: number;
  /** Cloud tones: top, middle, underside. */
  clouds: readonly [number, number, number];
}

export const SKIES: Record<Sky, SkyColors> = {
  dawn: {
    bands: [C.indigo, C.mauve, C.rose, C.sun],
    horizon: C.deep,
    far: C.teal,
    farDash: [C.mauve, C.rose, C.sea, C.rose],
    sea: C.sea,
    seaTop: C.turquoise,
    seaDash: [C.rose, C.turquoise, C.aqua],
    mid: C.teal,
    deep: C.deep,
    stars: false,
    orb: C.gold,
    glitter: C.sun,
    haze: C.white,
    halo: C.sun,
    cloudRim: C.gold,
    clouds: [C.sun, C.rose, C.mauve],
  },
  day: {
    bands: [C.blue, C.sky, C.skyLight, C.skyPale],
    horizon: C.deep,
    far: C.teal,
    farDash: [C.teal, C.sea, C.sea, C.turquoise],
    sea: C.sea,
    seaTop: C.turquoise,
    seaDash: [C.turquoise, C.turquoise, C.aqua],
    mid: C.teal,
    deep: C.deep,
    stars: false,
    orb: C.sun,
    glitter: C.white,
    haze: C.mist,
    halo: C.skyPale,
    cloudRim: 0,
    clouds: [C.white, C.mist, C.skyLight],
  },
  sunset: {
    bands: [C.indigo, C.violet, C.coral, C.orange],
    horizon: C.abyss,
    far: C.deep,
    farDash: [C.violet, C.coral, C.orange, C.gold],
    sea: C.teal,
    seaTop: C.sea,
    seaDash: [C.orange, C.gold, C.coral],
    mid: C.deep,
    deep: C.abyss,
    stars: false,
    orb: C.gold,
    glitter: C.gold,
    haze: C.gold,
    halo: C.gold,
    cloudRim: C.gold,
    clouds: [C.mauve, C.violet, C.orange],
  },
  night: {
    bands: [C.ink, C.navy, C.indigo, C.indigo],
    horizon: C.ink,
    far: C.abyss,
    farDash: [C.navy, C.deep, C.deep, C.teal],
    sea: C.deep,
    seaTop: C.teal,
    seaDash: [C.teal, C.silver, C.teal],
    mid: C.abyss,
    deep: C.navy,
    stars: true,
    orb: C.mist,
    glitter: C.silver,
    haze: C.indigo,
    halo: C.indigo,
    cloudRim: 0,
    clouds: [C.slate, C.indigo, C.navy],
  },
};

/** The same skies under rain clouds: greys, a darker sea, no sun. */
const GREY_BANDS: Record<Sky, readonly [number, number, number, number]> = {
  dawn: [C.indigo, C.mauve, C.grey, C.silver],
  day: [C.slate, C.grey, C.silver, C.mist],
  sunset: [C.indigo, C.slate, C.mauve, C.grey],
  night: [C.ink, C.navy, C.indigo, C.slate],
};
const GREY_CLOUDS: Record<Sky, readonly [number, number, number]> = {
  dawn: [C.silver, C.grey, C.slate],
  day: [C.mist, C.silver, C.grey],
  sunset: [C.grey, C.slate, C.mauve],
  night: [C.slate, C.indigo, C.navy],
};

/** Height of the background sea between the horizon and the surface line. */
export const HORIZON_ABOVE_SEA = 34;

const SHAPES = 6;

/** A cloud of round puffs with a flat underside, in three tones (1 top, 2 middle, 3 underside). */
export function cloudRaster(shape: number): Raster {
  const w = 26 + (shape % 3) * 16;
  const h = 11 + (shape % 2) * 6;
  const r = new Raster(w + 4, h + 4);
  const base = h + 1;
  const puffs = 3 + (shape % 3);
  for (let i = 0; i < puffs; i++) {
    const k = (i + 0.5) / puffs;
    const rad = Math.round((h * 0.55) * (0.6 + 0.4 * Math.sin(k * Math.PI)) * (0.85 + 0.3 * ((hash(shape * 7 + i) % 100) / 100)));
    const cx = Math.round(2 + k * w);
    const cy = base - rad;
    r.circle(cx, cy, rad, 2);
  }
  // flat bottom
  r.rect(4, base - 3, w - 4, 3, 2);
  for (let y = base + 1; y < r.h; y++) for (let x = 0; x < r.w; x++) r.px[y * r.w + x] = 0;
  // light on the top edge, shade along the underside
  const src = Uint8Array.from(r.px);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? 0 : src[y * r.w + x]);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (!src[y * r.w + x]) continue;
      if (!at(x, y - 1) || !at(x, y - 2)) r.px[y * r.w + x] = 1;
      else if (y >= base - 2 || !at(x, y + 2)) r.px[y * r.w + x] = 3;
    }
  }
  return r;
}

/** Cloud canvases per shape and tones, built on first use. */
export class CloudArt {
  private readonly cache = new Map<number, HTMLCanvasElement>();
  private readonly shapes: Raster[] = [];
  private readonly toCanvas: (r: Raster) => HTMLCanvasElement;

  constructor(toCanvas: (r: Raster) => HTMLCanvasElement) {
    this.toCanvas = toCanvas;
  }

  /** `rim` (a palette index, or 0) lights the edge on `side` (-1 left, 1 right). */
  get(shape: number, tones: readonly [number, number, number], rim = 0, side = 0): HTMLCanvasElement {
    const key = (((shape * 64 + tones[0]) * 64 + tones[1]) * 64 + tones[2]) * 192 + rim * 3 + side + 1;
    let c = this.cache.get(key);
    if (!c) {
      if (this.shapes.length === 0) for (let s = 0; s < SHAPES; s++) this.shapes.push(cloudRaster(s));
      const src = this.shapes[shape % SHAPES];
      const out = new Raster(src.w, src.h);
      for (let i = 0; i < src.px.length; i++) if (src.px[i]) out.px[i] = tones[src.px[i] - 1];
      if (rim !== 0 && side !== 0) {
        // two pixels of sunlight on the edge facing the sun, above the underside
        for (let y = 0; y < src.h; y++) {
          for (let x = 0; x < src.w; x++) {
            if (!src.px[y * src.w + x] || src.px[y * src.w + x] === 3) continue;
            const n1 = x + side;
            const n2 = x + 2 * side;
            const empty1 = n1 < 0 || n1 >= src.w || !src.px[y * src.w + n1];
            const empty2 = n2 < 0 || n2 >= src.w || !src.px[y * src.w + n2];
            if (empty1 || empty2) out.px[y * src.w + x] = rim;
          }
        }
      }
      c = this.toCanvas(out);
      this.cache.set(key, c);
    }
    return c;
  }
}

/** Something that can fill rectangles and draw images: the renderer. */
export interface Painter {
  readonly W: number;
  readonly H: number;
  readonly seaY: number;
  readonly ctx: CanvasRenderingContext2D;
  readonly env: Environment;
  fill(c: number, x: number, y: number, w: number, h: number): void;
  line(x0: number, y0: number, x1: number, y1: number, c: number): void;
  dashes(y: number, spacing: number, len: number, offset: number, c: number): void;
}

export function skyColors(sky: Sky): SkyColors {
  return SKIES[sky];
}

/** The pre-rendered sky gradient for a sky, a weather and a size. */
export class SkyCanvas {
  private canvas: HTMLCanvasElement | null = null;
  private sky: Sky | null = null;
  private grey = false;
  private w = 0;
  private h = 0;
  private readonly toCanvas: (r: Raster) => HTMLCanvasElement;

  constructor(toCanvas: (r: Raster) => HTMLCanvasElement) {
    this.toCanvas = toCanvas;
  }

  get(sky: Sky, grey: boolean, w: number, h: number): HTMLCanvasElement {
    if (this.canvas && sky === this.sky && grey === this.grey && w === this.w && h === this.h) return this.canvas;
    const r = new Raster(Math.max(1, w), Math.max(1, h));
    // long ordered-dither seams between the bands, and a thin haze on the horizon in clear weather
    if (grey) r.bands(0, h, GREY_BANDS[sky], 8, [1.1, 1.2, 1.1, 0.9]);
    else r.bands(0, h, [...SKIES[sky].bands, SKIES[sky].haze], 8, [1.1, 1.2, 1.1, 0.9, 0.28]);
    this.canvas = this.toCanvas(r);
    this.sky = sky;
    this.grey = grey;
    this.w = w;
    this.h = h;
    return this.canvas;
  }
}

/** The fog over the horizon: an ordered-dither veil, pre-rendered per width. */
export class FogCanvas {
  private canvas: HTMLCanvasElement | null = null;
  private key = -1;
  private readonly toCanvas: (r: Raster) => HTMLCanvasElement;

  constructor(toCanvas: (r: Raster) => HTMLCanvasElement) {
    this.toCanvas = toCanvas;
  }

  /**
   * Mist from the top of the screen down to FOG_BELOW rows under the
   * horizon, densest on the horizon. Light mist (rain) stays near the
   * horizon; thick fog veils the whole sky and hides the far sea.
   */
  get(w: number, horizon: number, thick: boolean, color: number): HTMLCanvasElement {
    const key = ((w * 1024 + horizon) * 2 + (thick ? 1 : 0)) * 64 + color;
    if (this.canvas && key === this.key) return this.canvas;
    const r = new Raster(w, horizon + FOG_BELOW);
    const top = thick ? 13 : 7;
    for (let y = 0; y < horizon + FOG_BELOW; y++) {
      let level: number;
      if (y <= horizon) {
        const k = y / Math.max(1, horizon);
        level = thick ? top * Math.pow(k, 1.6) : Math.max(0, top - (horizon - y) / 4);
      } else {
        const k = (y - horizon) / FOG_BELOW;
        level = thick ? top - 6 * k : top * (1 - k);
      }
      r.dither(0, y, w, 1, 0, color, Math.round(level));
    }
    this.canvas = this.toCanvas(r);
    this.key = key;
    return this.canvas;
  }
}

/** Rows of mist below the horizon, over the far sea. */
export const FOG_BELOW = 30;

/** The glow around the sun: ordered dither thinning out from the center, per sky and radius. */
export class GlowCanvas {
  private readonly cache = new Map<number, HTMLCanvasElement>();
  private readonly toCanvas: (r: Raster) => HTMLCanvasElement;

  constructor(toCanvas: (r: Raster) => HTMLCanvasElement) {
    this.toCanvas = toCanvas;
  }

  get(sky: Sky, radius: number): HTMLCanvasElement {
    const key = radius * 8 + SKY_INDEX[sky];
    let c = this.cache.get(key);
    if (!c) {
      const size = radius * 2 + 1;
      const r = new Raster(size, size);
      const color = SKIES[sky].halo;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const d = Math.hypot(x - radius, y - radius) / radius;
          if (d >= 1) continue;
          r.dither(x, y, 1, 1, 0, color, Math.round(12 * Math.pow(1 - d, 1.7)));
        }
      }
      c = this.toCanvas(r);
      this.cache.set(key, c);
    }
    return c;
  }
}

const SKY_INDEX: Record<Sky, number> = { dawn: 0, day: 1, sunset: 2, night: 3 };

/** Sun with a stepped halo, or the moon in its phase with a faint glow. */
export function drawOrb(p: Painter, sky: Sky, x: number, y: number, phase: number, glow?: GlowCanvas): void {
  if (sky === 'night') {
    // at new moon there is nothing to see
    if (moonLight(phase) < 0.04) return;
    const rad = 7;
    // glow: a dithered ring
    for (let dy = -rad - 3; dy <= rad + 3; dy++) {
      const half = Math.round(Math.sqrt(Math.max(0, (rad + 3) * (rad + 3) - dy * dy)));
      for (let dx = -half; dx <= half; dx += 2) p.fill(C.indigo, x + dx + ((dy & 1) ? 1 : 0), y + dy, 1, 1);
    }
    for (let dy = -rad; dy <= rad; dy++) {
      const half = Math.sqrt(rad * rad - dy * dy);
      const w = Math.round(half);
      // the dark side, just visible
      p.fill(C.navy, x - w, y + dy, 2 * w + 1, 1);
      // the lit part between the terminator and the rim
      const t = Math.cos(phase * Math.PI * 2) * half;
      const a = phase < 0.5 ? Math.round(t) : -w;
      const b = phase < 0.5 ? w : Math.round(-t);
      if (b > a) p.fill(C.mist, x + a, y + dy, b - a + 1, 1);
      if (b > a + 2 && dy > -rad + 2) p.fill(C.silver, x + a + Math.round((b - a) * 0.6), y + dy, 1, 1);
    }
    return;
  }
  const low = sky !== 'day';
  const rad = low ? 13 : 9;
  const k = SKIES[sky];
  // a wide dithered glow, a thin bright ring, then the disc with a bright core
  if (glow) {
    const g = glow.get(sky, low ? 46 : 30);
    p.ctx.drawImage(g, x - (g.width >> 1), y - (g.height >> 1));
  }
  const ring = rad + 2;
  for (let dy = -ring; dy <= ring; dy++) {
    const half = Math.round(Math.sqrt(ring * ring - dy * dy));
    p.fill(sky === 'dawn' ? C.orange : low ? C.gold : C.sun, x - half, y + dy, 2 * half + 1, 1);
  }
  for (let dy = -rad; dy <= rad; dy++) {
    const half = Math.round(Math.sqrt(rad * rad - dy * dy));
    p.fill(k.orb, x - half, y + dy, 2 * half + 1, 1);
  }
  const core = Math.round(rad * 0.55);
  for (let dy = -core; dy <= core; dy++) {
    const half = Math.round(Math.sqrt(core * core - dy * dy));
    p.fill(low ? C.sun : C.white, x - half - 1, y + dy - 1, 2 * half + 1, 1);
  }
}

/** How much of the moon is lit, 0 at new moon to 1 at full moon. */
export function moonLight(phase: number): number {
  return (1 - Math.cos(phase * Math.PI * 2)) / 2;
}

/** Stars that twinkle, and now and then a shooting star. */
export function drawStars(p: Painter, bottom: number, clock: number): void {
  for (let i = 0; i < 46; i++) {
    const h = hash(i * 13 + 5);
    const x = h % p.W;
    const y = (h >>> 12) % Math.max(1, bottom);
    const tw = (Math.floor(clock * 2 + i * 0.7) + i) % 9;
    if (tw === 0) continue;
    const big = i % 11 === 0;
    p.fill(i % 5 === 0 ? C.sun : C.white, x, y, 1, 1);
    if (big && tw > 4) {
      p.fill(C.silver, x - 1, y, 1, 1);
      p.fill(C.silver, x + 1, y, 1, 1);
      p.fill(C.silver, x, y - 1, 1, 1);
      p.fill(C.silver, x, y + 1, 1, 1);
    }
  }
  const t = clock % 11;
  if (t < 0.6) {
    const sx = Math.round(p.W * 0.7 - t * 120);
    const sy = Math.round(bottom * 0.2 + t * 50);
    p.line(sx, sy, sx + 6, sy - 3, C.white);
  }
}

/** Where the sun or moon is in the sky. */
export function orbPosition(p: Painter, arc: number, horizon: number, out: { x: number; y: number }): void {
  out.x = Math.round(p.W * (0.08 + 0.84 * arc));
  out.y = Math.round(horizon - 8 - Math.sin(arc * Math.PI) * (horizon - 34) * 0.85);
}

/** Clouds in two layers: low, small and slow near the horizon; big and higher up, a little faster. */
export function drawClouds(p: Painter, art: CloudArt, sky: Sky, grey: boolean, count: number, horizon: number, distance: number, clock: number, sunX: number): void {
  const tones = grey ? GREY_CLOUDS[sky] : SKIES[sky].clouds;
  // a low sun lights the side of each cloud that faces it
  const rim = grey ? 0 : SKIES[sky].cloudRim;
  const span = p.W + 140;
  for (let i = 0; i < count; i++) {
    const h = hash(i * 31 + 7);
    const far = i % 2 === 0;
    const speed = far ? 0.04 : 0.1;
    const x = Math.round(((((h % 997) * 3 - distance * speed - clock * (far ? 1.5 : 3)) % span) + span) % span) - 70;
    const y = far ? horizon - 14 - ((h >>> 10) % 22) : Math.round(horizon * (0.12 + ((h >>> 14) % 40) / 100));
    const shape = far ? (h >>> 4) % 2 : 2 + ((h >>> 4) % 4);
    const side = rim === 0 ? 0 : x + 30 < sunX ? 1 : -1;
    const c = art.get(shape, tones, rim, side);
    p.ctx.drawImage(c, x, y - c.height);
  }
}

/** The sun's or moon's light on the water: short dashes in a column, flickering. */
export function drawGlitter(p: Painter, x: number, top: number, bottom: number, color: number, clock: number, w0 = 3, w1 = 17): void {
  const t = Math.floor(clock * 6);
  for (let y = top; y < bottom; y += 2) {
    const k = (y - top) / Math.max(1, bottom - top);
    const half = Math.round(w0 + k * (w1 - w0));
    const row = (y >> 1) + t;
    for (let i = -half; i < half; i += 5) {
      if (((row + i) & 3) !== 0) continue;
      p.fill(color, x + i + ((row * 3) % 4), y, 2 + ((row + i) & 1), 1);
    }
  }
}

/** Rain streaks over the scene and drops landing on the sea; lightning flashes. */
export function drawWeatherFront(p: Painter, distance: number): void {
  const env = p.env;
  const look = env.look;
  const clock = env.clock;
  if (look.rain > 0) {
    const drop = env.night ? C.slate : C.mist;
    const bottom = p.seaY;
    for (let i = 0; i < look.rain; i++) {
      const h = hash(i * 17 + 3);
      const speed = 220 + (h % 80);
      const span = bottom + 20;
      const y = ((((h >>> 8) % 1000) / 1000) * span + clock * speed) % span - 10;
      const x = Math.round(((((h % 1009) / 1009) * (p.W + 40) - clock * speed * 0.35 - distance * 0.6) % (p.W + 40) + p.W + 40) % (p.W + 40)) - 20;
      p.fill(drop, x, Math.round(y), 1, 3);
      p.fill(drop, x - 1, Math.round(y) + 3, 1, 2);
      if (y > bottom - 6) p.fill(C.white, x - 2, bottom - 1, 3, 1);
    }
  }
  if (env.flash > 0) {
    // the bolt, then the whole sky lights up for a moment
    const horizon = p.seaY - HORIZON_ABOVE_SEA;
    let x = Math.round(env.boltX * p.W);
    let y = 0;
    for (let s = 0; s < 7; s++) {
      const nx = x + ((hash(env.boltSeed + s) % 17) - 8);
      const ny = Math.round(((s + 1) / 7) * horizon);
      p.line(x, y, nx, ny, C.white);
      p.line(x + 1, y, nx + 1, ny, C.sun);
      x = nx;
      y = ny;
    }
    if (env.flash > 0.12) {
      for (let yy = 0; yy < p.H; yy += 2) p.fill(C.white, 0, yy + ((Math.floor(env.clock * 60) & 1) ? 1 : 0), p.W, 1);
    }
  }
}

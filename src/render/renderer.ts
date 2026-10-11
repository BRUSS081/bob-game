import type { Display } from '../core/display.ts';
import type { AthleteState } from '../game/athletes.ts';
import { KITE } from '../game/config.ts';
import { DOLPHIN_COUNT, type Dolphins } from '../game/dolphins.ts';
import type { Obstacle, ObstacleName } from '../game/obstacles.ts';
import type { SportId } from '../game/sport.ts';
import { ANCHOR_X, ANCHOR_Y, FRAME_H, FRAME_W, type FrameName } from '../sprites/compose.ts';
import { treasureRaster } from '../games/treasures.ts';
import { CreatureCache } from '../sprites/fish.ts';
import { ICON, iconRaster, type IconName } from '../sprites/icons.ts';
import { dolphinRasters, powerRaster, propRasters } from '../sprites/props.ts';
import type { Ramp } from '../sprites/ramps.ts';
import type { Raster } from '../sprites/raster.ts';
import { SPIN_STEPS, type AthleteSprites } from '../sprites/sheet.ts';
import { ADVANCE, BitmapFont, GLYPH_H, digitCount, splitPoint } from './font.ts';
import { t } from '../i18n/strings.ts';
import { C, PALETTE, PALETTE_CSS } from './palette.ts';
import { ARC, Environment } from '../env/environment.ts';
import type { Sky } from '../env/sky.ts';
import { DAYLIGHT, LIGHTNING, lightFor, lightPixels, type Light } from './light.ts';
import { WAVE_BANDS, WaveTiles, waterStep } from './waves.ts';
import { CloudArt, FogCanvas, GlowCanvas, HORIZON_ABOVE_SEA, SKIES, SkyCanvas, drawClouds, drawGlitter, drawOrb, drawStars, drawWeatherFront, moonLight, orbPosition } from './sky.ts';

export type { Sky } from '../env/sky.ts';
export { SKIES, HORIZON_ABOVE_SEA } from './sky.ts';

const STAR_ROWS = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'];

const RIDE: readonly FrameName[] = ['ride0', 'ride1', 'ride2', 'ride3'];

export function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function newRect(): Rect {
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function setRect(r: Rect, x: number, y: number, w: number, h: number): Rect {
  r.x = Math.round(x);
  r.y = Math.round(y);
  r.w = Math.round(w);
  r.h = Math.round(h);
  return r;
}

export function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

/** What the renderer needs to know about an athlete to pick its frame. */
export interface PoseView {
  readonly state: AthleteState;
  readonly y: number;
  readonly prevY: number;
  readonly rotation: number;
  readonly prevRotation: number;
  readonly stateTime: number;
  readonly touching?: boolean;
}

export type ButtonStyle = 'primary' | 'normal' | 'selected' | 'ghost';

/** A canvas with a raster's palette colors (palette indices only, no customization slots). */
export function rasterCanvas(r: Raster, light: Light = DAYLIGHT): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(r.w, r.h);
    for (let i = 0; i < r.px.length; i++) {
      const v = r.px[i];
      if (!v) continue;
      const rgb = PALETTE[v];
      img.data[i * 4] = (rgb >> 16) & 0xff;
      img.data[i * 4 + 1] = (rgb >> 8) & 0xff;
      img.data[i * 4 + 2] = rgb & 0xff;
      img.data[i * 4 + 3] = 255;
    }
    lightPixels(img.data, r.w, r.h, light);
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}

/** Rows of reflection under the surface. */
const REFLECT_DEPTH = 36;

/** A sprite in two tones of the water around `sea`: darker where it is dark, lighter where it is bright. */
function mirrorCanvas(src: HTMLCanvasElement, sea: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d');
  const sctx = src.getContext('2d');
  if (!ctx || !sctx) return canvas;
  // a reflection takes the tones next to the water's own
  const dark = PALETTE[waterStep(sea, -1)];
  const light = PALETTE[waterStep(sea, 1)];
  const img = sctx.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const c = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] > 140 ? light : dark;
    d[i] = (c >> 16) & 0xff;
    d[i + 1] = (c >> 8) & 0xff;
    d[i + 2] = c & 0xff;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function rampCss(r: Ramp): [string, string, string] {
  return r.map((rgb) => '#' + rgb.toString(16).padStart(6, '0')) as [string, string, string];
}

/**
 * Draws the world, the athletes and the UI into the low-resolution buffer,
 * always on whole pixels.
 */
export class Renderer {
  readonly font = new BitmapFont();
  readonly touch: boolean;
  ctx: CanvasRenderingContext2D;
  W = 0;
  H = 0;
  seaY = 0;
  /** UI scale: text and buttons double on phones so they stay readable. */
  u = 1;
  private readonly display: Display;
  /** Obstacle art per name and light. */
  private readonly props = new Map<string, HTMLCanvasElement[]>();
  private readonly powers: Record<'wave' | 'gust', HTMLCanvasElement | null> = { wave: null, gust: null };
  private readonly swatches = new Map<Ramp, [string, string, string]>();
  private dolphinCanvases: HTMLCanvasElement[] | null = null;
  private dolphinLight: Light = DAYLIGHT;
  /**
   * Light on the sprites of the world, set by backdrop() from the sky it
   * paints; daylight on screens without one (underwater, seen from above).
   */
  light: Light = DAYLIGHT;
  /** Reflections on the water, per sprite canvas, in the tones of the sea they were built for. */
  private readonly mirrors = new WeakMap<HTMLCanvasElement, { tone: number; canvas: HTMLCanvasElement }>();
  /** The color of the near sea painted by the last backdrop(). */
  private waterTone: number = C.sea;
  private readonly icons = new Map<IconName, HTMLCanvasElement>();
  private readonly ghosts = new WeakMap<AthleteSprites, AthleteSprites>();
  /** Fish and the other sea creatures, built on first use. */
  readonly creatures = new CreatureCache(rasterCanvas);
  private readonly treasureCanvases = new Map<string, HTMLCanvasElement>();
  /** Time of day and weather, shared by every screen. */
  readonly env = new Environment();
  private readonly cloudArt = new CloudArt(rasterCanvas);
  private readonly skyCanvas = new SkyCanvas(rasterCanvas);
  private readonly fogCanvas = new FogCanvas(rasterCanvas);
  private readonly waveTiles = new WaveTiles(rasterCanvas);
  private readonly glowCanvas = new GlowCanvas(rasterCanvas);
  private readonly orb = { x: 0, y: 0 };

  constructor(display: Display) {
    this.display = display;
    this.ctx = display.ctx;
    this.touch = window.matchMedia('(pointer: coarse)').matches;
  }

  /** Starts a frame with the current layout. */
  begin(surface: (height: number) => number): void {
    this.ctx = this.display.ctx;
    const l = this.display.layout;
    this.W = l.width;
    this.H = l.height;
    this.seaY = surface(l.height);
    this.u = l.cssWidth / l.width < 2 ? 2 : 1;
    this.light = DAYLIGHT;
  }

  present(): void {
    this.display.present();
  }

  // ------------------------------------------------------------ primitives

  fill(c: number, x: number, y: number, w: number, h: number): void {
    this.ctx.fillStyle = PALETTE_CSS[c];
    this.ctx.fillRect(x, y, w, h);
  }

  dashes(y: number, spacing: number, len: number, offset: number, c: number): void {
    const start = -Math.floor(((offset % spacing) + spacing) % spacing);
    this.ctx.fillStyle = PALETTE_CSS[c];
    for (let x = start; x < this.W; x += spacing) this.ctx.fillRect(x, y, len, 1);
  }

  /** One-pixel line (Bresenham), no allocations. */
  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    this.ctx.fillStyle = PALETTE_CSS[c];
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 2000; i++) {
      this.ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  // ------------------------------------------------------------ world

  /**
   * Sky, sun or moon, clouds and the sea down to the bottom of the screen,
   * for the real time of day and the run's weather. A game may ask for a
   * sky of its own (a day passing, a tour spot); the weather stays the run's.
   */
  backdrop(distance: number, sky: Sky = this.env.sky): void {
    const { W, H, seaY } = this;
    const env = this.env;
    const look = env.look;
    const grey = look.grey;
    const k = SKIES[sky];
    const horizon = seaY - HORIZON_ABOVE_SEA;
    // a lightning strike washes everything out for an instant
    const flash = env.flash > 0.06;
    this.light = flash ? LIGHTNING : lightFor(sky, grey);
    if (horizon > 0) this.ctx.drawImage(this.skyCanvas.get(sky, grey, W, horizon), 0, 0);
    if (k.stars && !grey) drawStars(this, horizon - 6, env.clock);
    if (!grey) {
      // the real arc when this is the real sky; a fixed place for a sky chosen by a game
      orbPosition(this, sky === env.sky ? env.arc : ARC[sky], horizon, this.orb);
      drawOrb(this, sky, this.orb.x, this.orb.y, env.moon, this.glowCanvas);
    }
    drawClouds(this, this.cloudArt, sky, grey, look.clouds, horizon, distance, env.clock, this.orb.x);
    // the far sea at the horizon, darker under rain clouds and darker still in a storm
    const dark = grey && sky !== 'night';
    const storm = dark && look.lightning;
    const far = dark ? C.deep : k.far;
    const lit = flash ? 1 : 0;
    const sea = waterStep(storm ? C.deep : dark ? C.teal : k.sea, lit);
    const seaTop = waterStep(storm ? C.teal : dark ? C.sea : k.seaTop, lit);
    const mid = dark ? C.deep : k.mid;
    const deep = dark ? C.abyss : k.deep;
    this.fill(k.horizon, 0, horizon, W, 4);
    this.fill(far, 0, horizon + 4, W, seaY - horizon - 4);
    this.dashes(horizon + 2, 41, 4, distance * 0.1, k.farDash[0]);
    this.dashes(horizon + 9, 53, 6, distance * 0.2 + 17, k.farDash[1]);
    this.dashes(horizon + 17, 37, 5, distance * 0.3 + 5, k.farDash[2]);
    this.dashes(horizon + 26, 47, 8, distance * 0.45 + 29, k.farDash[3]);
    if (look.swell > 1.3) {
      // whitecaps on a rough sea
      this.dashes(horizon + 12, 29, 3, distance * 0.25 + env.clock * 9, C.white);
      this.dashes(horizon + 22, 23, 4, distance * 0.4 + env.clock * 13, C.foamShadow);
    }
    // the path of the sun or moon on the water (none under clouds, or without a moon)
    const glitter = !grey && (sky !== 'night' || moonLight(env.moon) > 0.15);
    if (glitter) drawGlitter(this, this.orb.x, horizon + 5, seaY - 2, k.glitter, env.clock);
    this.waterTone = sea;
    this.fill(sea, 0, seaY, W, H - seaY);
    this.fill(seaTop, 0, seaY, W, 4);
    this.dashes(seaY + 8, 61, 10, distance + 11, k.seaDash[0]);
    const depth = H - seaY;
    // rolling swells in the foreground, taller when the sea is rough
    const waveBottom = depth > 90 ? seaY + 80 : H;
    const foam = sky === 'night' ? C.silver : dark ? C.mist : C.white;
    for (let b = 0; b < WAVE_BANDS.length; b++) {
      const band = WAVE_BANDS[b];
      const top = seaY + band.top + Math.round(Math.sin(env.clock * 1.2 + b * 2.1));
      if (top + 4 >= waveBottom) break;
      const fill = b % 2 === 0 ? seaTop : sea;
      const tile = this.waveTiles.get(b, Math.max(2, Math.round(band.amp * look.swell)), fill, waterStep(fill, 1), foam);
      let x = -Math.floor((distance * band.speed) % band.length);
      if (x > 0) x -= band.length;
      for (; x < W; x += band.length) this.ctx.drawImage(tile, x, top);
      const body = top + tile.height;
      if (body < waveBottom) {
        this.fill(fill, 0, body, W, waveBottom - body);
        if (body + 3 < waveBottom) this.dashes(body + 2, 43 + b * 14, 6 + b * 3, distance * band.speed + b * 29, k.seaDash[Math.min(2, b + 1)]);
      }
    }
    // the path goes on, wider, over the near swells
    if (glitter) drawGlitter(this, this.orb.x, seaY + 6, waveBottom, k.glitter, env.clock, 17, 40);
    if (depth > 90) {
      this.fill(mid, 0, seaY + 80, W, depth - 80);
      this.dashes(seaY + 80, 29, 14, distance * 1.4 + 7, sea);
      this.dashes(seaY + 112, 53, 9, distance * 1.6 + 21, sea);
    }
    if (depth > 180) {
      this.fill(deep, 0, seaY + 170, W, depth - 170);
      this.dashes(seaY + 170, 37, 18, distance * 1.6 + 13, mid);
      this.dashes(seaY + 214, 67, 10, distance * 1.8 + 41, mid);
    }
    if (look.fog > 0 && horizon > 0) {
      // mist over the horizon; thick fog veils the sky and hides the far sea
      // (grey mist in the dark, white by day)
      this.ctx.drawImage(this.fogCanvas.get(W, horizon, look.fog >= 1, sky === 'night' ? C.slate : C.mist), 0, 0);
    }
  }

  /** Rain and lightning, over everything in the scene but under the UI. */
  weatherFront(distance: number): void {
    drawWeatherFront(this, distance);
  }

  /** Crest line drawn over the athletes' boards and the obstacles' bases. */
  surfaceFront(distance: number): void {
    this.fill(C.aqua, 0, this.seaY, this.W, 1);
    this.dashes(this.seaY, 23, 5, distance, C.white);
    this.dashes(this.seaY + 1, 31, 3, distance + 9, C.foamShadow);
  }

  /** Fast white streaks for the wind gust. */
  windLines(clock: number): void {
    const { W, seaY } = this;
    for (let i = 0; i < 9; i++) {
      const y = Math.round(((i * 37) % (seaY - 20)) + 10);
      const x = Math.round(W - ((clock * 700 + i * 131) % (W + 60)));
      this.fill(C.white, x, y, 18 + (i % 3) * 8, 1);
    }
  }

  /** The tube of the perfect wave, behind the rider. */
  perfectWave(playerX: number, blinking: boolean): void {
    if (blinking) return;
    const { seaY } = this;
    const right = playerX + 30;
    this.fill(C.turquoise, 0, seaY - 64, right, 64);
    this.fill(C.aqua, 0, seaY - 64, right, 6);
    this.fill(C.white, 0, seaY - 67, right + 6, 3);
    this.fill(C.foamShadow, right, seaY - 64, 6, 4);
    this.fill(C.sea, 0, seaY - 40, right - 12, 40);
  }

  private propCanvases(name: ObstacleName): HTMLCanvasElement[] {
    const key = name + this.light.id;
    let list = this.props.get(key);
    if (!list) {
      const light = this.light;
      list = propRasters(name).map((r) => rasterCanvas(r, light));
      this.props.set(key, list);
    }
    return list;
  }

  obstacles(items: readonly Obstacle[], alpha: number, clock: number, rivals: readonly AthleteSprites[]): void {
    const { seaY } = this;
    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      if (!o.active) continue;
      const k = o.kind;
      const x = Math.round(lerp(o.prevX, o.x, alpha));
      if ((k.name === 'rival' || k.name === 'kiter') && rivals.length > 0) {
        // rivals hop once far ahead: their altitude is the obstacle's
        const set = rivals[i % rivals.length];
        const alt = Math.round(o.y);
        const frame = alt > 0 ? set.frames.air : set.frames[RIDE[(Math.floor(clock * 7) + i) % 4]];
        const dx = x + Math.round(k.w / 2) - ANCHOR_X;
        const dy = seaY - alt - ANCHOR_Y;
        if (k.name === 'kiter' && set.kite.length > 0) this.kite(set, x, alt, seaY, clock + i * 0.37, dx, dy, false);
        this.reflect(frame, dx, dy, clock + i);
        this.ctx.drawImage(frame, dx, dy);
        continue;
      }
      const list = this.propCanvases(k.name);
      if (list.length === 0) {
        this.fill(k.color, x, seaY - Math.round(o.y) - k.h, k.w, k.h);
        continue;
      }
      const img = list.length > 1 ? list[(Math.floor(clock * 6) + i) % list.length] : list[0];
      const y = seaY - Math.round(o.y) - k.h;
      this.reflect(img, x, y, clock + i);
      this.ctx.drawImage(img, x, y);
    }
  }

  /** The dolphin pod, drawn around the athlete (positions are relative to it). */
  dolphins(d: Dolphins, playerX: number): void {
    if (!d.active) return;
    let list = this.dolphinCanvases;
    if (!list || this.dolphinLight !== this.light) {
      const light = this.light;
      list = dolphinRasters().map((r) => rasterCanvas(r, light));
      this.dolphinCanvases = list;
      this.dolphinLight = light;
    }
    const size = list[0].width;
    for (let i = 0; i < DOLPHIN_COUNT; i++) {
      const x = Math.round(playerX + d.offset(i));
      if (x < -size || x > this.W) continue;
      const pose = d.pose(i);
      if (pose < 0) {
        this.ctx.drawImage(list[3], x + 8, this.seaY - 3);
      } else {
        const alt = Math.round(d.altitude(i));
        this.ctx.drawImage(list[pose], x, this.seaY - alt - Math.round(size * 0.7));
      }
    }
  }

  /**
   * The giant wave of the big wave mode, a wall of water curling forward;
   * `front` is the x of its face at sea level.
   */
  giantWave(front: number, clock: number): void {
    const { seaY } = this;
    const height = Math.min(110, seaY - 24);
    const crest = seaY - height;
    // the face rises steeply from the front, then the wall runs back off screen
    for (let x = front - 220; x <= front; x++) {
      const d = front - x;
      const top = Math.round(seaY - height * Math.min(1, Math.sqrt(d / 22)));
      const h = seaY - top;
      if (h <= 0) continue;
      this.fill(C.white, x, top, 1, Math.min(3, h));
      if (h > 3) this.fill(C.aqua, x, top + 3, 1, Math.min(4, h - 3));
      if (h > 7) this.fill(d < 14 ? C.turquoise : C.sea, x, top + 7, 1, Math.min(Math.round(h * 0.35), h - 7));
      const mid = 7 + Math.round(h * 0.35);
      if (h > mid) this.fill(d < 14 ? C.sea : C.teal, x, top + mid, 1, Math.min(Math.round(h * 0.3), h - mid));
      const low = mid + Math.round(h * 0.3);
      if (h > low) this.fill(d < 14 ? C.teal : C.deep, x, top + low, 1, h - low);
    }
    // streaks running up the face
    for (let i = 0; i < 6; i++) {
      const sy = seaY - 6 - ((i * 19 + Math.floor(clock * 50)) % (height - 10));
      const sx = front - 4 - ((i * 23) % 30);
      this.fill(C.aqua, sx, sy, 4, 1);
    }
    // the lip curling over in front of the face, the shadowed barrel under it and the curtain falling from its tip
    const lip = 22;
    for (let i = -16; i <= lip; i++) {
      const x = front + i;
      const drop = i > 0 ? Math.round((i * i) / 18) : 0;
      const thick = Math.max(3, 9 - Math.round(Math.max(0, i) / 4));
      const under = crest + drop + thick;
      const floor = i < 0 ? Math.round(seaY - height * Math.min(1, Math.sqrt(-i / 22))) : seaY;
      if (floor > under) this.fill(i < lip - 4 ? C.deep : C.teal, x, under, 1, floor - under);
      if (i < 0) continue;
      this.fill(C.white, x, crest + drop, 1, 2);
      this.fill(C.aqua, x, crest + drop + 2, 1, thick - 2);
      if (i >= lip - 4) {
        for (let y = under; y < seaY; y += 2) this.fill((y + i) % 4 === 0 ? C.white : C.aqua, x, y + ((i + Math.floor(clock * 20)) & 1), 1, 1);
      }
    }
    // foam at the foot and spray off the lip
    for (let i = 0; i < 12; i++) {
      const fx = Math.round(front - 10 + ((i * 13 + clock * 90) % 48) - 12);
      this.fill(C.white, fx, seaY - 2 - (i % 3), 3, 1);
      const sx = Math.round(front + lip - 2 + ((i * 7 + clock * 40) % 16));
      const sy = Math.round(crest + Math.round((lip * lip) / 18) - 4 - ((i * 5 + clock * 30) % 12));
      this.fill(C.white, sx, sy, 1, 1);
    }
  }

  /** Three stars, earned ones in gold, centered on cx. */
  stars(cx: number, y: number, earned: number, scale: number): void {
    const rows = STAR_ROWS;
    const w = rows[0].length * scale;
    const gap = 3 * scale;
    const x0 = Math.round(cx - (3 * w + 2 * gap) / 2);
    for (let i = 0; i < 3; i++) {
      const color = i < earned ? C.gold : C.slate;
      for (let ry = 0; ry < rows.length; ry++) {
        for (let rx = 0; rx < rows[ry].length; rx++) {
          if (rows[ry][rx] === '#') this.fill(color, x0 + i * (w + gap) + rx * scale, y + ry * scale, scale, scale);
        }
      }
    }
  }

  powerUp(kind: 'wave' | 'gust', x: number, y: number, clock: number): void {
    let img = this.powers[kind];
    if (!img) {
      img = rasterCanvas(powerRaster(kind));
      this.powers[kind] = img;
    }
    this.ctx.drawImage(img, Math.round(x), Math.round(this.seaY - y - 12 + (Math.floor(clock * 4) % 2)));
  }

  /** Picks the frame for the athlete's state. */
  frameFor(set: AthleteSprites, a: PoseView, alpha: number, clock: number): HTMLCanvasElement {
    if (a.state === 'crash') return set.frames.fall;
    if (a.state === 'air') {
      const rot = lerp(a.prevRotation, a.rotation, alpha);
      if (rot > 0.001 && set.spins.length > 0) {
        const k = Math.round((rot % 1) * SPIN_STEPS) % SPIN_STEPS;
        return k === 0 ? set.frames.air : set.spins[k];
      }
      return a.stateTime < 0.1 ? set.frames.takeoff : set.frames.air;
    }
    if (a.touching) return set.frames.land;
    if (a.stateTime < 0.14 && clock > 0.5) return set.frames.land;
    return set.frames[RIDE[Math.floor(clock * 7) % 4]];
  }

  /**
   * Draws an athlete whose hitbox's left edge is at `x` and whose board's
   * underside is at altitude a.y. `scale` > 1 is for previews.
   */
  athlete(set: AthleteSprites, sport: SportId, a: PoseView, x: number, alpha: number, clock: number, scale = 1, surface = this.seaY, playerW = 16): void {
    const frame = this.frameFor(set, a, alpha, clock);
    const alt = Math.round(lerp(a.prevY, a.y, alpha));
    const sink = a.state === 'crash' ? Math.min(12, Math.round(a.stateTime * 30)) : 0;
    const dx = Math.round(x + (playerW / 2 - ANCHOR_X) * scale);
    const dy = Math.round(surface - (alt - sink) * scale - ANCHOR_Y * scale);
    if (sport === 'kite' && set.kite.length > 0) {
      const spinning = a.state === 'air' && a.rotation > 0;
      this.kite(set, x, alt - sink * 3, surface, clock, dx, dy, spinning, scale);
    }
    if (scale === 1 && surface === this.seaY) this.reflect(frame, dx, dy, clock);
    if (scale === 1) this.ctx.drawImage(frame, dx, dy);
    else this.ctx.drawImage(frame, dx, dy, FRAME_W * scale, FRAME_H * scale);
  }

  /**
   * The reflection of a sprite drawn at (dx, dy) on the sea below it: the
   * rows above the surface mirrored under it in two tones of the water, one
   * row in two (one in four further down) and rippling sideways, so it
   * fades and breaks up like a reflection on moving water.
   */
  private reflect(img: HTMLCanvasElement, dx: number, dy: number, clock: number): void {
    const { seaY, H } = this;
    const m = this.mirrorOf(img);
    const swell = this.env.look.swell;
    for (let sy = img.height - 1; sy >= 0; sy--) {
      const depth = seaY - 1 - (dy + sy);
      if (depth < 0) continue;
      if (depth > REFLECT_DEPTH) break;
      if (depth % (depth < REFLECT_DEPTH / 2 ? 2 : 4) !== 0) continue;
      const ry = seaY + 2 + depth;
      if (ry >= H) break;
      const off = Math.round(Math.sin(clock * 3 + depth * 0.8) * (0.6 + depth / 14) * swell);
      this.ctx.drawImage(m, 0, sy, m.width, 1, dx + off, ry, m.width, 1);
    }
  }

  private mirrorOf(img: HTMLCanvasElement): HTMLCanvasElement {
    const tone = this.waterTone;
    const hit = this.mirrors.get(img);
    if (hit && hit.tone === tone) return hit.canvas;
    const canvas = mirrorCanvas(img, tone);
    this.mirrors.set(img, { tone, canvas });
    return canvas;
  }

  /** A white silhouette of a sprite set, built once per set. */
  private ghostSet(set: AthleteSprites): AthleteSprites {
    let g = this.ghosts.get(set);
    if (!g) {
      const white = (src: HTMLCanvasElement): HTMLCanvasElement => {
        const c = document.createElement('canvas');
        c.width = src.width;
        c.height = src.height;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(src, 0, 0);
          ctx.globalCompositeOperation = 'source-in';
          ctx.fillStyle = PALETTE_CSS[C.white];
          ctx.fillRect(0, 0, c.width, c.height);
        }
        return c;
      };
      const frames = {} as Record<FrameName, HTMLCanvasElement>;
      for (const k of Object.keys(set.frames) as FrameName[]) frames[k] = white(set.frames[k]);
      g = { ...set, frames, spins: set.spins.map(white), kite: set.kite.map(white) };
      this.ghosts.set(set, g);
    }
    return g;
  }

  /** The ghost of a recorded run: the athlete as a translucent white silhouette. */
  ghostAthlete(set: AthleteSprites, sport: SportId, a: PoseView, x: number, clock: number, playerW: number): void {
    this.ctx.globalAlpha = 0.45;
    this.athlete(this.ghostSet(set), sport, a, x, 1, clock, 1, this.seaY, playerW);
    this.ctx.globalAlpha = 1;
  }

  /** A small flag on the water where the best run ended. */
  bestFlag(x: number, label: string): void {
    x = Math.round(x);
    const top = this.seaY - 30;
    const w = this.font.width(label, 1) + 4;
    this.fill(C.ink, x - 1, top - 1, 3, 31);
    this.fill(C.white, x, top, 1, 30);
    this.fill(C.ink, x + 1, top - 1, w + 2, 11);
    this.fill(C.gold, x + 2, top, w, 9);
    this.font.draw(this.ctx, label, x + 4, top + 1, C.navy, 1);
  }

  /** Kite canopy above the rider and its two lines down to the bar. */
  private kite(set: AthleteSprites, x: number, alt: number, surface: number, clock: number, fx: number, fy: number, spinning: boolean, scale = 1): void {
    const img = set.kite[Math.floor(clock * 3) % set.kite.length];
    // previews keep the kite closer above the rider so it fits on screen
    const lift = scale === 1 ? KITE.kiteY + KITE.kiteH : 66;
    const kx = Math.round(x + (KITE.kiteX - 11) * scale);
    const ky = Math.round(surface - (alt + lift) * scale - scale);
    const barX = fx + set.barTop[0] * scale;
    const barY = fy + set.barTop[1] * scale;
    const attachX = spinning ? fx + ANCHOR_X * scale : barX;
    const attachY = spinning ? fy + (ANCHOR_Y - 26) * scale : barY;
    this.line(kx + set.kiteTipL[0] * scale, ky + set.kiteTipL[1] * scale, attachX, attachY, C.slate);
    this.line(kx + set.kiteTipR[0] * scale, ky + set.kiteTipR[1] * scale, attachX, attachY + 7 * scale, C.slate);
    if (scale === 1) this.ctx.drawImage(img, kx, ky);
    else this.ctx.drawImage(img, kx, ky, img.width * scale, img.height * scale);
  }

  // ------------------------------------------------------------ UI

  text(text: string, x: number, y: number, color: number, scale: number, start = 0, end = text.length): void {
    this.font.drawShadowed(this.ctx, text, x, y, color, C.navy, scale, start, end);
  }

  lineHeight(text: string, scale: number, maxW = this.W - 8): number {
    const lineH = (GLYPH_H + 3) * scale;
    return this.font.width(text, scale) <= maxW || splitPoint(text) < 0 ? lineH : 2 * lineH;
  }

  /** Centered on cx, wrapped on two lines when wider than maxW. Returns the height used. */
  centered(text: string, cx: number, y: number, color: number, scale: number, maxW = this.W - 8): number {
    const lineH = (GLYPH_H + 3) * scale;
    const w = this.font.width(text, scale);
    if (w <= maxW) {
      this.text(text, Math.round(cx - w / 2), y, color, scale);
      return lineH;
    }
    const cut = splitPoint(text);
    if (cut < 0) {
      this.text(text, Math.round(cx - w / 2), y, color, scale);
      return lineH;
    }
    const w1 = this.font.widthOf(cut, scale);
    const w2 = this.font.widthOf(text.length - cut - 1, scale);
    this.text(text, Math.round(cx - w1 / 2), y, color, scale, 0, cut);
    this.text(text, Math.round(cx - w2 / 2), y + lineH, color, scale, cut + 1);
    return 2 * lineH;
  }

  number(value: number, digits: number, x: number, y: number, color: number, scale: number): void {
    this.font.drawNumber(this.ctx, value, digits, x + scale, y + scale, C.navy, scale);
    this.font.drawNumber(this.ctx, value, digits, x, y, color, scale);
  }

  /** Pixel-art button: dark outline, flat fill, a lighter top edge, centered label. */
  button(r: Rect, label: string, style: ButtonStyle, scale: number, focused = false): void {
    const fill = style === 'primary' ? C.coral : style === 'selected' ? C.gold : style === 'ghost' ? C.skyPale : C.navy;
    const top = style === 'primary' ? C.rose : style === 'selected' ? C.sun : style === 'ghost' ? C.white : C.indigo;
    const ink = style === 'normal' ? C.white : C.navy;
    this.fill(focused ? C.white : C.ink, r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    if (focused) this.fill(C.ink, r.x - 2, r.y + r.h + 1, r.w + 4, 1);
    this.fill(fill, r.x, r.y, r.w, r.h);
    this.fill(top, r.x, r.y, r.w, scale);
    const w = this.font.width(label, scale);
    this.font.draw(this.ctx, label, Math.round(r.x + (r.w - w) / 2), Math.round(r.y + (r.h - GLYPH_H * scale) / 2), ink, scale);
  }

  /** Button with a pixel arrow pointing left (-1) or right (1); the font has no < >. */
  arrowButton(r: Rect, dir: -1 | 1, scale: number, focused = false): void {
    this.button(r, '', 'normal', scale, focused);
    const top = Math.round(r.y + (r.h - 7 * scale) / 2);
    const left = Math.round(r.x + (r.w - 4 * scale) / 2);
    this.ctx.fillStyle = PALETTE_CSS[C.white];
    for (let i = 0; i < 4; i++) {
      const col = dir > 0 ? i : 3 - i;
      this.ctx.fillRect(left + col * scale, top + i * scale, scale, (7 - 2 * i) * scale);
    }
  }

  /** Square pause button: two bars. */
  pauseButton(r: Rect, scale: number): void {
    this.button(r, '', 'normal', scale);
    const h = 7 * scale;
    const top = Math.round(r.y + (r.h - h) / 2);
    const left = Math.round(r.x + (r.w - 5 * scale) / 2);
    this.fill(C.white, left, top, 2 * scale, h);
    this.fill(C.white, left + 3 * scale, top, 2 * scale, h);
  }

  /** A treasure (or junk) centered on (x, y). */
  treasure(id: string, x: number, y: number, scale = 1): void {
    let c = this.treasureCanvases.get(id);
    if (!c) {
      c = rasterCanvas(treasureRaster(id));
      this.treasureCanvases.set(id, c);
    }
    this.ctx.drawImage(c, Math.round(x - (c.width * scale) / 2), Math.round(y - (c.height * scale) / 2), c.width * scale, c.height * scale);
  }

  /** A sea creature centered on (x, y); `frame` 0 or 1, `left` mirrors it. */
  creature(id: string, x: number, y: number, frame: number, left: boolean, scale = 1): void {
    const art = this.creatures.get(id);
    const c = art.canvases[(left ? 2 : 0) + (frame & 1)];
    this.ctx.drawImage(c, Math.round(x - (art.w * scale) / 2), Math.round(y - (art.h * scale) / 2), art.w * scale, art.h * scale);
  }

  /** A 16×16 icon, scaled by whole pixels. */
  icon(name: IconName, x: number, y: number, scale: number): void {
    let c = this.icons.get(name);
    if (!c) {
      c = rasterCanvas(iconRaster(name));
      this.icons.set(name, c);
    }
    this.ctx.drawImage(c, Math.round(x), Math.round(y), ICON * scale, ICON * scale);
  }

  /** A square button with an icon. */
  iconButton(r: Rect, name: IconName, scale: number, focused = false): void {
    this.button(r, '', 'normal', scale, focused);
    const s = Math.max(1, Math.floor(Math.min(r.w, r.h) / (ICON + 4)));
    this.icon(name, r.x + (r.w - ICON * s) / 2, r.y + (r.h - ICON * s) / 2, s);
  }

  /** Three-tone swatch of a customization ramp. */
  swatch(ramp: Ramp, x: number, y: number, w: number, h: number): void {
    let css = this.swatches.get(ramp);
    if (!css) {
      css = rampCss(ramp);
      this.swatches.set(ramp, css);
    }
    this.fill(C.ink, x - 1, y - 1, w + 2, h + 2);
    const third = Math.floor(w / 3);
    for (let i = 0; i < 3; i++) {
      this.ctx.fillStyle = css[i];
      this.ctx.fillRect(x + i * third, y, i === 2 ? w - 2 * third : third, h);
    }
  }

  /** Panel behind menus: solid and outlined, readable over any background. */
  panel(r: Rect, color: number = C.navy): void {
    this.fill(C.ink, r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    this.fill(color, r.x, r.y, r.w, r.h);
  }

  /** Score in the top-right corner with the best score to its left. */
  scoreLine(points: number, best: number, showPoints: boolean): void {
    const u = this.u;
    const adv = ADVANCE * u;
    const margin = 6;
    const digits = Math.max(5, digitCount(points));
    const scoreX = this.W - margin - digits * adv + u;
    if (showPoints) this.number(points, digits, scoreX, margin, C.white, u);
    if (best > 0) {
      const bestDigits = Math.max(5, digitCount(best));
      const bestX = (showPoints ? scoreX - 2 * adv : this.W - margin + u) - bestDigits * adv;
      this.number(best, bestDigits, bestX, margin, C.skyPale, u);
      this.font.drawShadowed(this.ctx, t.hi, bestX - (t.hi.length + 1) * adv, margin, C.skyPale, C.navy, u);
    }
  }
}

import type { Display } from '../core/display.ts';
import type { AthleteState } from '../game/athletes.ts';
import { KITE } from '../game/config.ts';
import { DOLPHIN_COUNT, type Dolphins } from '../game/dolphins.ts';
import type { Obstacle, ObstacleName } from '../game/obstacles.ts';
import type { SportId } from '../game/sport.ts';
import { ANCHOR_X, ANCHOR_Y, FRAME_H, FRAME_W, type FrameName } from '../sprites/compose.ts';
import { dolphinRasters, powerRaster, propRasters } from '../sprites/props.ts';
import type { Ramp } from '../sprites/ramps.ts';
import type { Raster } from '../sprites/raster.ts';
import { SPIN_STEPS, type AthleteSprites } from '../sprites/sheet.ts';
import { ADVANCE, BitmapFont, GLYPH_H, digitCount, splitPoint } from './font.ts';
import { t } from '../i18n/strings.ts';
import { C, PALETTE, PALETTE_CSS } from './palette.ts';

/** Height of the background sea between the horizon and the surface line. */
export const HORIZON_ABOVE_SEA = 34;
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

function rasterCanvas(r: Raster): HTMLCanvasElement {
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
    ctx.putImageData(img, 0, 0);
  }
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
  private readonly props = new Map<ObstacleName, HTMLCanvasElement[]>();
  private readonly powers: Record<'wave' | 'gust', HTMLCanvasElement | null> = { wave: null, gust: null };
  private readonly swatches = new Map<Ramp, [string, string, string]>();
  private dolphinCanvases: HTMLCanvasElement[] | null = null;

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
  }

  present(): void {
    this.display.present();
  }

  // ------------------------------------------------------------ primitives

  fill(c: number, x: number, y: number, w: number, h: number): void {
    this.ctx.fillStyle = PALETTE_CSS[c];
    this.ctx.fillRect(x, y, w, h);
  }

  private dashes(y: number, spacing: number, len: number, offset: number, c: number): void {
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

  backdrop(distance: number): void {
    const { W, H, seaY } = this;
    const horizon = seaY - HORIZON_ABOVE_SEA;
    const b1 = Math.round(horizon * 0.28);
    const b2 = Math.round(horizon * 0.55);
    const b3 = Math.round(horizon * 0.8);
    this.fill(C.blue, 0, 0, W, b1);
    this.fill(C.sky, 0, b1, W, b2 - b1);
    this.fill(C.skyLight, 0, b2, W, b3 - b2);
    this.fill(C.skyPale, 0, b3, W, horizon - b3);
    this.fill(C.deep, 0, horizon, W, 4);
    this.fill(C.teal, 0, horizon + 4, W, seaY - horizon - 4);
    this.dashes(horizon + 2, 41, 4, distance * 0.1, C.teal);
    this.dashes(horizon + 9, 53, 6, distance * 0.2 + 17, C.sea);
    this.dashes(horizon + 17, 37, 5, distance * 0.3 + 5, C.sea);
    this.dashes(horizon + 26, 47, 8, distance * 0.45 + 29, C.turquoise);
    this.fill(C.sea, 0, seaY, W, H - seaY);
    this.fill(C.turquoise, 0, seaY, W, 4);
    this.dashes(seaY + 14, 61, 10, distance + 11, C.turquoise);
    this.dashes(seaY + 27, 43, 6, distance * 1.2 + 3, C.turquoise);
    this.dashes(seaY + 41, 71, 12, distance * 1.4 + 37, C.aqua);
    const depth = H - seaY;
    if (depth > 90) {
      this.fill(C.teal, 0, seaY + 80, W, depth - 80);
      this.dashes(seaY + 80, 29, 14, distance * 1.4 + 7, C.sea);
      this.dashes(seaY + 112, 53, 9, distance * 1.6 + 21, C.sea);
    }
    if (depth > 180) {
      this.fill(C.deep, 0, seaY + 170, W, depth - 170);
      this.dashes(seaY + 170, 37, 18, distance * 1.6 + 13, C.teal);
      this.dashes(seaY + 214, 67, 10, distance * 1.8 + 41, C.teal);
    }
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
    let list = this.props.get(name);
    if (!list) {
      list = propRasters(name).map(rasterCanvas);
      this.props.set(name, list);
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
        this.ctx.drawImage(frame, dx, dy);
        continue;
      }
      const list = this.propCanvases(k.name);
      if (list.length === 0) {
        this.fill(k.color, x, seaY - Math.round(o.y) - k.h, k.w, k.h);
        continue;
      }
      const img = list.length > 1 ? list[(Math.floor(clock * 6) + i) % list.length] : list[0];
      this.ctx.drawImage(img, x, seaY - Math.round(o.y) - k.h);
    }
  }

  /** The dolphin pod, drawn around the athlete (positions are relative to it). */
  dolphins(d: Dolphins, playerX: number): void {
    if (!d.active) return;
    let list = this.dolphinCanvases;
    if (!list) {
      list = dolphinRasters().map(rasterCanvas);
      this.dolphinCanvases = list;
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
    if (scale === 1) this.ctx.drawImage(frame, dx, dy);
    else this.ctx.drawImage(frame, dx, dy, FRAME_W * scale, FRAME_H * scale);
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
      this.font.drawShadowed(this.ctx, t.hi, bestX - 3 * adv, margin, C.skyPale, C.navy, u);
    }
  }
}

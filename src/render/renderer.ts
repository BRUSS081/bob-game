import type { Display } from '../core/display.ts';
import { SURF, surfaceY } from '../game/config.ts';
import type { Game } from '../game/game.ts';
import type { Obstacle } from '../game/obstacles.ts';
import { nextMultiplier } from '../game/score.ts';
import { t } from '../i18n/strings.ts';
import { ADVANCE, BitmapFont, GLYPH_H, digitCount, splitPoint } from './font.ts';
import { C, PALETTE_CSS } from './palette.ts';

/** Height of the background sea between the horizon and the surface line. */
const HORIZON_ABOVE_SEA = 34;
const TAU = Math.PI * 2;

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/**
 * Phase 2 renderer: flat placeholder shapes in the master palette. Draws
 * into the low-resolution buffer with integer coordinates only.
 */
export class Renderer {
  private readonly display: Display;
  private readonly font = new BitmapFont();
  private readonly touch: boolean;
  private ctx: CanvasRenderingContext2D;

  constructor(display: Display) {
    this.display = display;
    this.ctx = display.ctx;
    this.touch = window.matchMedia('(pointer: coarse)').matches;
  }

  render(g: Game, alpha: number): void {
    this.ctx = this.display.ctx;
    const { width: W, height: H } = this.display.layout;
    const seaY = surfaceY(H);
    const distance = lerp(g.prevDistance, g.distance, alpha);

    this.backdrop(W, H, seaY, distance);
    if (g.perfectWave > 0) this.perfectWave(g, seaY);
    const items = g.obstacles.items;
    for (let i = 0; i < items.length; i++) if (items[i].active) this.obstacle(items[i], alpha, seaY);
    if (g.power.active) this.powerUp(g, alpha, seaY);
    this.surfer(g, alpha, seaY);
    this.surfaceFront(W, seaY, distance);
    this.hud(g, W, seaY);
    this.display.present();
  }

  // ------------------------------------------------------------ primitives

  private fill(c: number, x: number, y: number, w: number, h: number): void {
    this.ctx.fillStyle = PALETTE_CSS[c];
    this.ctx.fillRect(x, y, w, h);
  }

  /** Repeating horizontal dashes scrolled by `offset`. */
  private dashes(W: number, y: number, spacing: number, len: number, offset: number, c: number): void {
    const start = -Math.floor(((offset % spacing) + spacing) % spacing);
    this.ctx.fillStyle = PALETTE_CSS[c];
    for (let x = start; x < W; x += spacing) this.ctx.fillRect(x, y, len, 1);
  }

  /**
   * Rectangle rotated about (ox, oy). (rx, ry) is the rectangle center
   * relative to that pivot before rotation. Rasterized in hard-edged spans.
   */
  private rotRect(ox: number, oy: number, rx: number, ry: number, w: number, h: number, cos: number, sin: number, c: number): void {
    const cx = ox + rx * cos - ry * sin;
    const cy = oy + rx * sin + ry * cos;
    const r = Math.ceil(Math.sqrt(w * w + h * h) / 2) + 1;
    const hw = w / 2;
    const hh = h / 2;
    const x0 = Math.floor(cx - r);
    const x1 = Math.ceil(cx + r);
    this.ctx.fillStyle = PALETTE_CSS[c];
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      let run = -1;
      for (let x = x0; x <= x1 + 1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        const inside = x <= x1 && lx >= -hw && lx < hw && ly >= -hh && ly < hh;
        if (inside && run < 0) run = x;
        else if (!inside && run >= 0) {
          this.ctx.fillRect(run, y, x - run, 1);
          run = -1;
        }
      }
    }
  }

  // ------------------------------------------------------------ world

  private backdrop(W: number, H: number, seaY: number, distance: number): void {
    const horizon = seaY - HORIZON_ABOVE_SEA;
    // sky in stepped bands
    const b1 = Math.round(horizon * 0.28);
    const b2 = Math.round(horizon * 0.55);
    const b3 = Math.round(horizon * 0.8);
    this.fill(C.blue, 0, 0, W, b1);
    this.fill(C.sky, 0, b1, W, b2 - b1);
    this.fill(C.skyLight, 0, b2, W, b3 - b2);
    this.fill(C.skyPale, 0, b3, W, horizon - b3);
    // background sea, slow parallax
    this.fill(C.deep, 0, horizon, W, 4);
    this.fill(C.teal, 0, horizon + 4, W, seaY - horizon - 4);
    this.dashes(W, horizon + 2, 41, 4, distance * 0.1, C.teal);
    this.dashes(W, horizon + 9, 53, 6, distance * 0.2 + 17, C.sea);
    this.dashes(W, horizon + 17, 37, 5, distance * 0.3 + 5, C.sea);
    this.dashes(W, horizon + 26, 47, 8, distance * 0.45 + 29, C.turquoise);
    // foreground water; tall portrait views get deeper stepped bands
    this.fill(C.sea, 0, seaY, W, H - seaY);
    this.fill(C.turquoise, 0, seaY, W, 4);
    this.dashes(W, seaY + 14, 61, 10, distance + 11, C.turquoise);
    this.dashes(W, seaY + 27, 43, 6, distance * 1.2 + 3, C.turquoise);
    this.dashes(W, seaY + 41, 71, 12, distance * 1.4 + 37, C.aqua);
    const depth = H - seaY;
    if (depth > 90) {
      this.fill(C.teal, 0, seaY + 80, W, depth - 80);
      this.dashes(W, seaY + 80, 29, 14, distance * 1.4 + 7, C.sea);
      this.dashes(W, seaY + 112, 53, 9, distance * 1.6 + 21, C.sea);
    }
    if (depth > 180) {
      this.fill(C.deep, 0, seaY + 170, W, depth - 170);
      this.dashes(W, seaY + 170, 37, 18, distance * 1.6 + 13, C.teal);
      this.dashes(W, seaY + 214, 67, 10, distance * 1.8 + 41, C.teal);
    }
  }

  /** Crest line drawn over the athlete's feet and the obstacles' bases. */
  private surfaceFront(W: number, seaY: number, distance: number): void {
    this.fill(C.aqua, 0, seaY, W, 1);
    this.dashes(W, seaY, 23, 5, distance, C.white);
    this.dashes(W, seaY + 1, 31, 3, distance + 9, C.foamShadow);
  }

  private perfectWave(g: Game, seaY: number): void {
    if (g.perfectWave < 1.5 && Math.floor(g.clock * 8) % 2 === 0) return;
    const right = SURF.playerX + 30;
    this.fill(C.turquoise, 0, seaY - 64, right, 64);
    this.fill(C.aqua, 0, seaY - 64, right, 6);
    this.fill(C.white, 0, seaY - 67, right + 6, 3);
    this.fill(C.foamShadow, right, seaY - 64, 6, 4);
    this.fill(C.sea, 0, seaY - 40, right - 12, 40);
  }

  private obstacle(o: Obstacle, alpha: number, seaY: number): void {
    const x = Math.round(lerp(o.prevX, o.x, alpha));
    const { w, h } = o.kind;
    const top = seaY - h;
    switch (o.kind.name) {
      case 'rock':
        this.fill(C.grey, x, top, w, h);
        this.fill(C.silver, x + 2, top, w - 10, 2);
        this.fill(C.slate, x + w - 8, top + 2, 8, h - 2);
        break;
      case 'buoy':
        this.fill(C.red, x, top + 4, w, h - 4);
        this.fill(C.white, x, top + 12, w, 4);
        this.fill(C.wine, x + w - 3, top + 4, 3, h - 4);
        this.fill(C.ink, x + 4, top, 2, 4);
        this.fill(C.gold, x + 4, top, 2, 2);
        break;
      case 'rival':
        this.fill(C.white, x - 4, seaY - 3, w + 8, 3);
        this.fill(C.navy, x + 3, top + 9, 12, h - 12);
        this.fill(C.tan, x + 5, top, 8, 8);
        this.fill(C.ink, x + 5, top, 8, 3);
        break;
      case 'seaweed':
        this.fill(C.green, x, top, w, h);
        this.fill(C.forest, x + 3, top + 2, 2, h - 2);
        this.fill(C.forest, x + 11, top + 3, 2, h - 3);
        this.fill(C.forest, x + 17, top + 1, 2, h - 1);
        break;
      case 'jellyfish':
        this.fill(C.rose, x + 1, top, w - 2, 5);
        this.fill(C.rose, x, top + 2, w, 3);
        this.fill(C.mauve, x + 2, top + 5, 2, 3);
        this.fill(C.mauve, x + 6, top + 5, 2, 3);
        this.fill(C.white, x + 3, top + 1, 2, 1);
        break;
    }
  }

  private powerUp(g: Game, alpha: number, seaY: number): void {
    const p = g.power;
    const size = SURF.powerUpSize;
    const x = Math.round(lerp(p.prevX, p.x, alpha));
    const y = seaY - Math.round(p.y) - size + (Math.floor(g.clock * 4) % 2);
    this.fill(C.gold, x, y, size, size);
    this.fill(C.sun, x + 3, y + 3, size - 6, size - 6);
    this.fill(C.white, x + 4, y + 4, 2, 2);
    this.fill(C.orange, x, y + size - 2, size, 2);
  }

  private surfer(g: Game, alpha: number, seaY: number): void {
    const s = g.surfer;
    // blink during the grace period after the perfect wave
    if (g.grace > 0 && Math.floor(g.clock * 12) % 2 === 0) return;
    let bottom = seaY - Math.round(lerp(s.prevY, s.y, alpha));
    if (g.phase === 'ready') bottom += Math.round(Math.sin(g.clock * 3));
    const cx = SURF.playerX + SURF.playerW / 2;
    let angle = lerp(s.prevRotation, s.rotation, alpha) * TAU;
    if (s.state === 'crash') {
      angle = Math.PI / 2;
      bottom += 8;
    }
    const pivotY = bottom - 19;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // parts as (center offset from pivot, size): board, body, head, hair
    this.rotRect(cx, pivotY, 0, 17.5, 26, 3, cos, sin, C.white);
    this.rotRect(cx, pivotY, 0, 3, 12, 24, cos, sin, C.coral);
    this.rotRect(cx, pivotY, 1, -13, 8, 8, cos, sin, C.tan);
    this.rotRect(cx, pivotY, 0, -16, 8, 3, cos, sin, C.brown);
  }

  // ------------------------------------------------------------ HUD

  /** Text with a drop shadow; `start`/`end` select a range without allocating. */
  private text(text: string, x: number, y: number, color: number, scale: number, start = 0, end = text.length): void {
    this.font.drawShadowed(this.ctx, text, x, y, color, C.navy, scale, start, end);
  }

  /** Height that centered() will use for this text. */
  private lineHeight(text: string, W: number, scale: number): number {
    const lineH = (GLYPH_H + 3) * scale;
    return this.font.width(text, scale) <= W - 8 || splitPoint(text) < 0 ? lineH : 2 * lineH;
  }

  /** Centered text, wrapped on two lines when it does not fit. Returns the height used. */
  private centered(text: string, W: number, y: number, color: number, scale: number): number {
    const lineH = (GLYPH_H + 3) * scale;
    if (this.font.width(text, scale) <= W - 8) {
      this.text(text, Math.floor((W - this.font.width(text, scale)) / 2), y, color, scale);
      return lineH;
    }
    const cut = splitPoint(text);
    if (cut < 0) {
      this.text(text, 4, y, color, scale);
      return lineH;
    }
    const w1 = this.font.widthOf(cut, scale);
    const w2 = this.font.widthOf(text.length - cut - 1, scale);
    this.text(text, Math.floor((W - w1) / 2), y, color, scale, 0, cut);
    this.text(text, Math.floor((W - w2) / 2), y + lineH, color, scale, cut + 1);
    return 2 * lineH;
  }

  private number(value: number, digits: number, x: number, y: number, color: number, scale: number): void {
    this.font.drawNumber(this.ctx, value, digits, x + scale, y + scale, C.navy, scale);
    this.font.drawNumber(this.ctx, value, digits, x, y, color, scale);
  }

  private hud(g: Game, W: number, seaY: number): void {
    const layout = this.display.layout;
    // text at least about 2 CSS px per font pixel, so it stays readable on phones
    const u = layout.cssWidth / layout.width < 2 ? 2 : 1;
    const adv = ADVANCE * u;
    const margin = 6;

    const points = g.points;
    const digits = Math.max(5, digitCount(points));
    const scoreX = W - margin - digits * adv + u;
    if (g.phase !== 'ready') this.number(points, digits, scoreX, margin, C.white, u);
    if (g.best > 0) {
      // "HI 00000  00000"
      const bestDigits = Math.max(5, digitCount(g.best));
      const bestX = scoreX - 2 * adv - bestDigits * adv;
      this.number(g.best, bestDigits, bestX, margin, C.skyPale, u);
      this.text(t.hi, bestX - 3 * adv, margin, C.skyPale, u);
    }
    const row2 = margin + (GLYPH_H + 4) * u;
    if (g.phase === 'running' && g.score.combo > 0) {
      this.text('x', W - margin - 2 * adv + u, row2, C.gold, u);
      this.number(nextMultiplier(g.score), 1, W - margin - adv + u, row2, C.gold, u);
    }
    if (g.popupTime > 0) {
      const rise = Math.round((0.9 - g.popupTime) * 20);
      const y = seaY - SURF.playerH - 12 - GLYPH_H * u - rise;
      this.text('+', SURF.playerX, y, C.gold, u);
      this.number(g.popupPoints, digitCount(g.popupPoints), SURF.playerX + adv, y, C.gold, u);
    }
    if (g.perfectWave > 0) {
      const y = row2 + (GLYPH_H + 4) * u;
      this.centered(t.perfectWave, W, y, C.sun, u);
      const full = 60 * u;
      const x = Math.floor((W - full) / 2);
      const barY = y + (GLYPH_H + 3) * u;
      this.fill(C.navy, x, barY, full, 2 * u + 1);
      this.fill(C.sun, x, barY, Math.ceil((g.perfectWave / SURF.perfectWaveTime) * full), 2 * u);
    }

    const horizon = seaY - HORIZON_ABOVE_SEA;
    const mid = Math.floor(horizon / 2);
    let y: number;
    switch (g.phase) {
      case 'ready': {
        const start = this.touch ? t.startTouch : t.startDesktop;
        // title block centered in the sky, smaller when the sky is short
        let title = 4 * u;
        let sport = 2 * u;
        const block = () =>
          this.lineHeight(t.title, W, title) +
          this.lineHeight(t.sport, W, sport) +
          this.lineHeight(start, W, u) +
          this.lineHeight(t.hintHold, W, u) +
          this.lineHeight(t.hintTrick, W, u) +
          4 * u;
        if (block() > horizon - 24 * u) {
          title = 3 * u;
          sport = u + 1;
        }
        y = Math.max(margin + (GLYPH_H + 4) * u, Math.floor((horizon - block()) / 2));
        y += this.centered(t.title, W, y, C.white, title);
        y += this.centered(t.sport, W, y, C.sun, sport) + 2 * u;
        y += this.centered(start, W, y, C.white, u) + 2 * u;
        y += this.centered(t.hintHold, W, y, C.skyPale, u);
        this.centered(t.hintTrick, W, y, C.skyPale, u);
        break;
      }
      case 'paused':
        y = mid - 12 * u;
        y += this.centered(t.paused, W, y, C.white, 2 * u) + 2 * u;
        this.centered(this.touch ? t.resumeTouch : t.resumeDesktop, W, y, C.skyPale, u);
        break;
      case 'over': {
        y = mid - 24 * u;
        y += this.centered(t.wipeout, W, y, C.white, 2 * u);
        const scoreDigits = digitCount(points);
        this.number(points, scoreDigits, Math.floor((W - this.font.widthOf(scoreDigits, 2 * u)) / 2), y, C.sun, 2 * u);
        y += (GLYPH_H + 4) * 2 * u;
        if (g.newBest) y += this.centered(t.newBest, W, y, C.gold, u);
        if (g.overTime >= SURF.restartDelay) this.centered(this.touch ? t.restartTouch : t.restartDesktop, W, y + 2 * u, C.white, u);
        break;
      }
      case 'running':
        break;
    }
  }
}

import { TOUR_SPOTS } from '../game/tour.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect, SKIES } from '../render/renderer.ts';
import type { Context, Screen } from './screen.ts';

/**
 * World tour map: twelve spots as cards with their stars. A spot opens
 * once the one before has at least a star.
 */
export class TourScreen implements Screen {
  private focus = 0;
  private clock = 0;
  private readonly cells = TOUR_SPOTS.map(newRect);
  private readonly back = newRect();
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  enter(): void {
    // start on the first spot without three stars
    this.focus = 0;
    for (let i = 0; i < TOUR_SPOTS.length; i++) {
      if (!this.unlocked(i)) break;
      this.focus = i;
      if (this.ctx.profile.spotStars(TOUR_SPOTS[i].id) < 3) break;
    }
  }

  blur(): void {}

  private unlocked(i: number): boolean {
    return i === 0 || this.ctx.profile.spotStars(TOUR_SPOTS[i - 1].id) > 0;
  }

  private open(i: number): void {
    if (this.unlocked(i)) this.ctx.playRunner('tour', i);
  }

  key(code: string): void {
    const cols = this.cols();
    const n = TOUR_SPOTS.length;
    switch (code) {
      case 'ArrowLeft':
        this.focus = (this.focus + n - 1) % n;
        break;
      case 'ArrowRight':
      case 'Tab':
        this.focus = (this.focus + 1) % n;
        break;
      case 'ArrowUp':
        this.focus = (this.focus - cols + n) % n;
        break;
      case 'ArrowDown':
        this.focus = (this.focus + cols) % n;
        break;
      case 'Space':
      case 'Enter':
        this.open(this.focus);
        break;
      case 'Escape':
        this.ctx.go('setup');
        break;
    }
  }

  tap(x: number, y: number): boolean {
    for (let i = 0; i < this.cells.length; i++) {
      if (inside(this.cells[i], x, y)) {
        this.focus = i;
        this.open(i);
        return true;
      }
    }
    if (inside(this.back, x, y)) {
      this.ctx.go('setup');
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.clock += dt;
  }

  private cols(): number {
    const r = this.ctx.r;
    return r.W >= r.H * 1.25 ? 4 : 3;
  }

  render(): void {
    const { r, profile } = this.ctx;
    const { W, H } = r;
    const margin = 6;
    r.backdrop(this.clock * 20);
    r.surfaceFront(this.clock * 20);
    const cols = this.cols();
    const rows = Math.ceil(TOUR_SPOTS.length / cols);
    // the biggest UI scale that fits
    let u = r.u;
    let cellW = 0;
    let cellH = 0;
    const titleH = (GLYPH_H + 4) * 2;
    const buttonH = GLYPH_H + 7;
    for (;;) {
      cellH = (GLYPH_H + 3) * 2 * u + 13 * u + 4 * u;
      cellW = Math.floor((W - 2 * margin - (cols - 1) * 3 * u) / cols);
      const need = titleH * u + rows * (cellH + 3 * u) + buttonH * u + 4 * u + 2 * margin;
      if (need <= H || u === 1) break;
      u = 1;
    }
    let y = margin;
    y += r.centered(t.modes.tour.name, W / 2, y, C.white, 2 * u) + u;
    const gridW = cols * cellW + (cols - 1) * 3 * u;
    const x0 = Math.round((W - gridW) / 2);
    for (let i = 0; i < TOUR_SPOTS.length; i++) {
      const spot = TOUR_SPOTS[i];
      const cx = x0 + (i % cols) * (cellW + 3 * u);
      const cy = y + Math.floor(i / cols) * (cellH + 3 * u);
      const rect = setRect(this.cells[i], cx, cy, cellW, cellH);
      const open = this.unlocked(i);
      // the card shows the spot's sky
      r.panel(rect, open ? SKIES[spot.sky].bands[1] : C.slate);
      r.fill(open ? SKIES[spot.sky].sea : C.grey, rect.x, rect.y + rect.h - 4 * u, rect.w, 4 * u);
      if (i === this.focus) {
        r.fill(C.white, rect.x - 1, rect.y - 1, rect.w + 2, 1);
        r.fill(C.white, rect.x - 1, rect.y + rect.h, rect.w + 2, 1);
      }
      const ty = rect.y + 2 * u;
      r.centered(open ? spot.name : t.locked, rect.x + rect.w / 2, ty, open ? C.white : C.silver, u, rect.w - 2 * u);
      if (open) {
        r.centered(t.sports[spot.sport], rect.x + rect.w / 2, ty + (GLYPH_H + 3) * u, C.sun, u, rect.w - 2 * u);
        r.stars(rect.x + rect.w / 2, rect.y + rect.h - 4 * u - 10 * u, profile.spotStars(spot.id), u);
      }
    }
    y += rows * (cellH + 3 * u) + u;
    const bw = r.font.width(t.back, u) + 16 * u;
    r.button(setRect(this.back, (W - bw) / 2, y, bw, buttonH * u), t.back, 'normal', u);
  }
}

import { MISSIONS } from '../custom/missions.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect } from '../render/renderer.ts';
import { GEAR_COLORS } from '../sprites/ramps.ts';
import type { Context, Screen } from './screen.ts';

/**
 * The three open missions with the color each one unlocks, and the whole
 * collection of special colors: unlocked ones in color, the rest dark.
 */
export class MissionsScreen implements Screen {
  private clock = 0;
  private count = '';
  private readonly done = newRect();
  private readonly panel = newRect();
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  enter(): void {
    this.count = `${this.ctx.missions.done.size}/${MISSIONS.length}`;
  }

  blur(): void {}

  key(code: string): void {
    if (code === 'Escape' || code === 'Enter' || code === 'Space') this.ctx.go('home');
  }

  tap(x: number, y: number): boolean {
    if (inside(this.done, x, y)) {
      this.ctx.go('home');
      return true;
    }
    return inside(this.panel, x, y);
  }

  update(dt: number): void {
    this.clock += dt;
  }

  render(): void {
    const { r, missions } = this.ctx;
    const { W, H } = r;
    const margin = 6;
    r.backdrop(this.clock * 30);
    r.surfaceFront(this.clock * 30);

    // full UI scale when it fits, smaller on short screens
    let u = r.u;
    let lineH = 0;
    let w = 0;
    let cell = 0;
    let h = 0;
    let buttonH = 0;
    for (;;) {
      lineH = (GLYPH_H + 5) * u;
      w = Math.min(W - 2 * margin, r.font.widthOf(23, u) + 26 * u);
      // three missions, the collection (two rows of six swatches), the title and the button
      cell = Math.min(Math.floor((w - 8 * u) / 6), 18 * u);
      h = lineH * 2 + 3 * (lineH + 2 * u) + 2 * cell + 10 * u;
      buttonH = (GLYPH_H + 7) * u;
      if (u === 1 || h + buttonH + 4 * u + 2 * margin <= H) break;
      u = 1;
    }
    const sw = 12 * u;
    const x = Math.round((W - w) / 2);
    let y = Math.max(margin, Math.round((H - h - buttonH - 4 * u) / 2));
    r.panel(setRect(this.panel, x, y, w, h));

    // title and count
    y += 3 * u;
    const count = this.count;
    r.text(t.missions, x + 4 * u, y, C.sun, u);
    r.text(count, x + w - 4 * u - r.font.width(count, u), y, C.white, u);
    y += lineH + u;

    // open missions, each with the color it unlocks
    for (let i = 0; i < missions.active.length; i++) {
      const m = missions.active[i];
      r.fill(C.indigo, x + 2 * u, y - u, w - 4 * u, lineH + u);
      r.text(t.missionText[m.id], x + 4 * u, y + u, C.white, u);
      r.swatch(GEAR_COLORS[m.reward], x + w - 4 * u - sw, y + u, sw, GLYPH_H * u);
      y += lineH + 2 * u;
    }
    if (missions.active.length === 0) {
      r.centered(t.missionComplete, x + w / 2, y + u, C.gold, u);
      y += 3 * (lineH + 2 * u);
    } else {
      y += (3 - missions.active.length) * (lineH + 2 * u);
    }

    // the collection
    y += 2 * u;
    const gridX = x + Math.round((w - 6 * cell) / 2);
    for (let i = 0; i < MISSIONS.length; i++) {
      const cx = gridX + (i % 6) * cell;
      const cy = y + Math.floor(i / 6) * cell;
      const reward = MISSIONS[i].reward;
      if (missions.unlocked.has(reward)) {
        r.swatch(GEAR_COLORS[reward], cx + 2 * u, cy + 2 * u, cell - 4 * u, cell - 4 * u);
      } else {
        r.fill(C.ink, cx + 2 * u - 1, cy + 2 * u - 1, cell - 4 * u + 2, cell - 4 * u + 2);
        r.fill(C.slate, cx + 2 * u, cy + 2 * u, cell - 4 * u, cell - 4 * u);
        r.centered('?', cx + cell / 2, cy + Math.round((cell - GLYPH_H * u) / 2), C.grey, u);
      }
    }

    const bw = r.font.width(t.done, u) + 16 * u;
    r.button(setRect(this.done, (W - bw) / 2, this.panel.y + h + 4 * u, bw, buttonH), t.done, 'primary', u, true);
  }
}

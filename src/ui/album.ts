import { t } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect } from '../render/renderer.ts';
import type { Context, Screen } from './screen.ts';

/** The shared collection of every game (filled in by fishing, freedive, snap and the wreck hook). */
export class AlbumScreen implements Screen {
  private clock = 0;
  private readonly done = newRect();
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  enter(): void {}
  blur(): void {}

  key(code: string): void {
    if (code === 'Escape' || code === 'Enter' || code === 'Space') this.ctx.go('home');
  }

  tap(x: number, y: number): boolean {
    if (inside(this.done, x, y)) {
      this.ctx.go('home');
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.clock += dt;
  }

  render(): void {
    const r = this.ctx.r;
    const u = r.u;
    r.backdrop(this.clock * 20);
    r.surfaceFront(this.clock * 20);
    let y = Math.round(r.H * 0.3);
    y += r.centered(t.album, r.W / 2, y, C.white, 2 * u) + 4 * u;
    const bw = r.font.width(t.done, u) + 16 * u;
    r.button(setRect(this.done, (r.W - bw) / 2, y, bw, (GLYPH_H + 7) * u), t.done, 'primary', u, true);
  }
}

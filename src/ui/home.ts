import { CHARACTERS } from '../custom/athlete.ts';
import { cycleSport } from '../game/sport.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect } from '../render/renderer.ts';
import { DemoPilot, type Context, type Screen } from './screen.ts';

/** Focusable rows, top to bottom. */
const SPORT = 0;
const RIDER = 1;
const PLAY = 2;
const CUSTOMIZE = 3;
const ROWS = 4;

/**
 * Title screen: pick the sport and BOB or BOBBA, then play or customize.
 * The chosen athlete rides by in the background.
 */
export class HomeScreen implements Screen {
  private focus = PLAY;
  private clock = 0;
  private distance = 0;
  private readonly pilot = new DemoPilot();
  private readonly prev = newRect();
  private readonly next = newRect();
  private readonly riders = [newRect(), newRect()];
  private readonly play = newRect();
  private readonly custom = newRect();
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  enter(): void {
    this.focus = PLAY;
    this.pilot.reset();
    this.ctx.demo(this.ctx.profile.sport).reset();
  }

  blur(): void {}

  private changeSport(step: number): void {
    const p = this.ctx.profile;
    p.setSport(cycleSport(p.sport, step));
    this.ctx.demo(p.sport).reset();
    this.pilot.reset();
    this.ctx.changed();
  }

  private changeRider(index: number): void {
    const p = this.ctx.profile;
    p.setRider(CHARACTERS[(index + CHARACTERS.length) % CHARACTERS.length]);
    this.ctx.changed();
  }

  private activate(): void {
    const p = this.ctx.profile;
    if (this.focus === SPORT) this.changeSport(1);
    else if (this.focus === RIDER) this.changeRider(CHARACTERS.indexOf(p.rider) + 1);
    else if (this.focus === PLAY) this.ctx.go('game');
    else this.ctx.go('customize');
  }

  key(code: string): void {
    const p = this.ctx.profile;
    switch (code) {
      case 'ArrowUp':
        this.focus = (this.focus + ROWS - 1) % ROWS;
        break;
      case 'ArrowDown':
      case 'Tab':
        this.focus = (this.focus + 1) % ROWS;
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const step = code === 'ArrowLeft' ? -1 : 1;
        if (this.focus === SPORT) this.changeSport(step);
        else if (this.focus === RIDER) this.changeRider(CHARACTERS.indexOf(p.rider) + step);
        else this.focus = this.focus === PLAY ? CUSTOMIZE : PLAY;
        break;
      }
      case 'Space':
      case 'Enter':
        this.activate();
        break;
    }
  }

  tap(x: number, y: number): boolean {
    if (inside(this.prev, x, y)) this.changeSport(-1);
    else if (inside(this.next, x, y)) this.changeSport(1);
    else if (inside(this.riders[0], x, y)) this.changeRider(0);
    else if (inside(this.riders[1], x, y)) this.changeRider(1);
    else if (inside(this.play, x, y)) this.ctx.go('game');
    else if (inside(this.custom, x, y)) this.ctx.go('customize');
    else return false;
    return true;
  }

  update(dt: number): void {
    this.clock += dt;
    this.distance += 60 * dt;
    this.pilot.update(this.ctx.demo(this.ctx.profile.sport), dt);
  }

  render(alpha: number): void {
    const { r, profile } = this.ctx;
    const { W, H, u, seaY } = r;
    const sport = profile.sport;
    const landscape = W >= H * 1.25;

    r.backdrop(this.distance);
    const demo = this.ctx.demo(sport);
    const athleteX = landscape ? Math.round(W * 0.2) : Math.round(W / 2 - 8);
    r.athlete(this.ctx.player(), sport, demo, athleteX, alpha, this.clock);
    r.surfaceFront(this.distance);
    r.scoreLine(0, profile.best[sport], false);

    // menu block: title, sport, rider, play, customize
    const rowH = (GLYPH_H + 7) * u;
    const gap = 4 * u;
    const margin = 6;
    const top = margin + (GLYPH_H + 4) * u;
    let title = 4 * u;
    let block = GLYPH_H * title + 3 * gap + ROWS * (rowH + gap);
    if (block > seaY - top - 4) {
      title = 3 * u;
      block = GLYPH_H * title + 3 * gap + ROWS * (rowH + gap);
    }
    const cx = landscape ? Math.round(W * 0.64) : Math.round(W / 2);
    let y = Math.max(top, Math.min(Math.round((seaY - block) / 2), H - block - margin));

    r.centered(t.title, cx, y, C.white, title);
    y += GLYPH_H * title + 3 * gap;

    // < SPORT >
    const arrowW = 12 * u;
    const nameW = r.font.width(t.sports.wing, u) + 8 * u;
    setRect(this.prev, cx - nameW / 2 - arrowW - u, y, arrowW, rowH);
    setRect(this.next, cx + nameW / 2 + u, y, arrowW, rowH);
    r.panel(setRect(scratch, cx - nameW / 2, y, nameW, rowH), this.focus === SPORT ? C.indigo : C.navy);
    if (this.focus === SPORT) r.fill(C.white, scratch.x, scratch.y + scratch.h, scratch.w, 1);
    r.centered(t.sports[sport], cx, y + Math.round((rowH - GLYPH_H * u) / 2), C.sun, u);
    r.arrowButton(this.prev, -1, u);
    r.arrowButton(this.next, 1, u);
    y += rowH + gap;

    // [BOB] [BOBBA]
    const riderW = r.font.width(t.characters.bobba, u) + 10 * u;
    const rider = profile.rider;
    for (let i = 0; i < CHARACTERS.length; i++) {
      const rect = setRect(this.riders[i], i === 0 ? cx - riderW - u : cx + u, y, riderW, rowH);
      r.button(rect, t.characters[CHARACTERS[i]], CHARACTERS[i] === rider ? 'selected' : 'normal', u, this.focus === RIDER && CHARACTERS[i] === rider);
    }
    y += rowH + gap;

    const wide = Math.max(r.font.width(t.customize, u) + 12 * u, 2 * riderW + 2 * u);
    r.button(setRect(this.play, cx - wide / 2, y, wide, rowH), t.play, 'primary', u, this.focus === PLAY);
    y += rowH + gap;
    r.button(setRect(this.custom, cx - wide / 2, y, wide, rowH), t.customize, 'normal', u, this.focus === CUSTOMIZE);
  }
}

const scratch = newRect();

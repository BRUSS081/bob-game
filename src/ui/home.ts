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
/** DAILY and MISSIONS, side by side. */
const EXTRA = 3;
const CUSTOMIZE = 4;
const ROWS = 5;

/**
 * Title screen: pick the sport and BOB or BOBBA, then play or customize.
 * The chosen athlete rides by in the background.
 */
export class HomeScreen implements Screen {
  private focus = PLAY;
  /** Column in the EXTRA row: 0 daily, 1 missions. */
  private col = 0;
  private clock = 0;
  private distance = 0;
  private readonly pilot = new DemoPilot();
  private readonly prev = newRect();
  private readonly next = newRect();
  private readonly riders = [newRect(), newRect()];
  private readonly play = newRect();
  private readonly daily = newRect();
  private readonly missions = newRect();
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
    else if (this.focus === PLAY) this.ctx.play(false);
    else if (this.focus === EXTRA) {
      if (this.col === 0) this.ctx.play(true);
      else this.ctx.go('missions');
    } else this.ctx.go('customize');
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
        else if (this.focus === EXTRA) this.col = 1 - this.col;
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
    else if (inside(this.play, x, y)) this.ctx.play(false);
    else if (inside(this.daily, x, y)) this.ctx.play(true);
    else if (inside(this.missions, x, y)) this.ctx.go('missions');
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

    // menu block: title, sport, rider, play, daily + missions, customize
    const rowH = (GLYPH_H + 7) * u;
    const margin = 6;
    const top = margin + (GLYPH_H + 4) * u;
    let title = 4 * u;
    let gap = 4 * u;
    // shrink the title, then the gaps, until the menu fits above the sea (or at least on screen)
    if (menuHeight(title, gap, rowH) > seaY - top - 4) title = 3 * u;
    if (menuHeight(title, gap, rowH) > H - top - margin) title = 2 * u;
    if (menuHeight(title, gap, rowH) > H - top - margin) gap = 2 * u;
    const block = menuHeight(title, gap, rowH);
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

    // [BOB] [BOBBA], then the other rows on the same two-column grid
    const riderW = Math.max(r.font.width(t.characters.bobba, u), r.font.width(t.missions, u), r.font.width(t.daily, u)) + 8 * u;
    const rider = profile.rider;
    for (let i = 0; i < CHARACTERS.length; i++) {
      const rect = setRect(this.riders[i], i === 0 ? cx - riderW - u : cx + u, y, riderW, rowH);
      r.button(rect, t.characters[CHARACTERS[i]], CHARACTERS[i] === rider ? 'selected' : 'normal', u, this.focus === RIDER && CHARACTERS[i] === rider);
    }
    y += rowH + gap;

    const wide = Math.max(r.font.width(t.customize, u) + 12 * u, 2 * riderW + 2 * u);
    r.button(setRect(this.play, cx - wide / 2, y, wide, rowH), t.play, 'primary', u, this.focus === PLAY);
    y += rowH + gap;
    r.button(setRect(this.daily, cx - riderW - u, y, riderW, rowH), t.daily, 'normal', u, this.focus === EXTRA && this.col === 0);
    r.button(setRect(this.missions, cx + u, y, riderW, rowH), t.missions, 'normal', u, this.focus === EXTRA && this.col === 1);
    y += rowH + gap;
    r.button(setRect(this.custom, cx - wide / 2, y, wide, rowH), t.customize, 'normal', u, this.focus === CUSTOMIZE);
  }
}

const scratch = newRect();

function menuHeight(title: number, gap: number, rowH: number): number {
  return GLYPH_H * title + 3 * gap + ROWS * (rowH + gap);
}

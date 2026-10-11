import { RUN_MODES, modeBestKey, modeHasSport, type RunMode } from '../game/modes.ts';
import { cycleSport } from '../game/sport.ts';
import { TOUR_SPOTS } from '../game/tour.ts';
import { t } from '../i18n/strings.ts';
import { ADVANCE, GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect, type Rect } from '../render/renderer.ts';
import { DemoPilot, type Context, type Screen } from './screen.ts';

const SPORT = 0;
const MODE = 1;
const BUTTONS = 2;
const ROWS = 3;

/**
 * Before a runner game: the sport (when the mode has one) and the mode,
 * with what it is about and the best score. PLAY or BACK.
 */
export class SetupScreen implements Screen {
  private focus = BUTTONS;
  private col = 0;
  private clock = 0;
  private distance = 0;
  private readonly pilot = new DemoPilot();
  private readonly sportPrev = newRect();
  private readonly sportNext = newRect();
  private readonly modePrev = newRect();
  private readonly modeNext = newRect();
  private readonly play = newRect();
  private readonly back = newRect();
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  enter(): void {
    this.focus = BUTTONS;
    this.col = 0;
    this.pilot.reset();
    this.ctx.demo(this.ctx.profile.sport).reset();
  }

  blur(): void {}

  private get mode(): RunMode {
    return this.ctx.profile.mode;
  }

  private changeSport(step: number): void {
    const p = this.ctx.profile;
    if (!modeHasSport(this.mode)) return;
    p.setSport(cycleSport(p.sport, step));
    this.ctx.demo(p.sport).reset();
    this.pilot.reset();
    this.ctx.changed();
  }

  private changeMode(step: number): void {
    const i = RUN_MODES.indexOf(this.mode);
    this.ctx.profile.setMode(RUN_MODES[(i + step + RUN_MODES.length) % RUN_MODES.length]);
  }

  private start(): void {
    if (this.mode === 'tour') this.ctx.go('tour');
    else this.ctx.playRunner(this.mode);
  }

  key(code: string): void {
    switch (code) {
      case 'ArrowUp':
        this.focus = (this.focus + ROWS - 1) % ROWS;
        if (this.focus === SPORT && !modeHasSport(this.mode)) this.focus = BUTTONS;
        break;
      case 'ArrowDown':
      case 'Tab':
        this.focus = (this.focus + 1) % ROWS;
        if (this.focus === SPORT && !modeHasSport(this.mode)) this.focus = MODE;
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const step = code === 'ArrowLeft' ? -1 : 1;
        if (this.focus === SPORT) this.changeSport(step);
        else if (this.focus === MODE) this.changeMode(step);
        else this.col = 1 - this.col;
        break;
      }
      case 'Space':
      case 'Enter':
        if (this.focus === BUTTONS && this.col === 1) this.ctx.go('home');
        else this.start();
        break;
      case 'Escape':
        this.ctx.go('home');
        break;
    }
  }

  tap(x: number, y: number): boolean {
    if (inside(this.sportPrev, x, y)) this.changeSport(-1);
    else if (inside(this.sportNext, x, y)) this.changeSport(1);
    else if (inside(this.modePrev, x, y)) this.changeMode(-1);
    else if (inside(this.modeNext, x, y)) this.changeMode(1);
    else if (inside(this.play, x, y)) this.start();
    else if (inside(this.back, x, y)) this.ctx.go('home');
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
    const margin = 6;
    r.backdrop(this.distance);
    const demo = this.ctx.demo(sport);
    r.athlete(this.ctx.player(), sport, demo, landscape ? Math.round(W * 0.16) : Math.round(W / 2 - 8), alpha, this.clock);
    r.surfaceFront(this.distance);

    const rowH = (GLYPH_H + 7) * u;
    const gap = 4 * u;
    const arrowW = 12 * u;
    const nameW = r.font.width(t.modes.freeride.name, u) + 10 * u;
    const lineH = (GLYPH_H + 3) * u;
    const block = (GLYPH_H + 3) * 2 * u + gap + 2 * (lineH + rowH + gap) + 2 * lineH + lineH + gap + rowH;
    const cx = landscape ? Math.round(W * 0.62) : Math.round(W / 2);
    let y = Math.max(margin, Math.min(Math.round((seaY - block) / 2), H - block - margin));

    y += r.centered(t.games.runner.name, cx, y, C.white, 2 * u) + gap;

    const hasSport = modeHasSport(this.mode);
    y = this.selector(t.sport, hasSport ? t.sports[sport] : t.allSports, this.sportPrev, this.sportNext, this.focus === SPORT, hasSport, cx, y, nameW);
    y = this.selector(t.mode, t.modes[this.mode].name, this.modePrev, this.modeNext, this.focus === MODE, true, cx, y, nameW);

    // what the mode is about, and the best so far
    const desc = t.modes[this.mode].desc;
    const used = r.centered(desc, cx, y, C.white, u, Math.min(W - 2 * margin, 2 * nameW + 4 * arrowW));
    y += Math.max(used, 2 * lineH);
    this.drawBest(cx, y);
    y += lineH + gap;

    const bw = Math.max(r.font.width(t.play, u), r.font.width(t.back, u)) + 16 * u;
    r.button(setRect(this.play, cx - gap / 2 - bw, y, bw, rowH), t.play, 'primary', u, this.focus === BUTTONS && this.col === 0);
    r.button(setRect(this.back, cx + gap / 2, y, bw, rowH), t.back, 'normal', u, this.focus === BUTTONS && this.col === 1);
  }

  /** A label and a "< VALUE >" selector; returns the y below it. */
  private selector(label: string, value: string, prev: Rect, next: Rect, focused: boolean, enabled: boolean, cx: number, y: number, nameW: number): number {
    const r = this.ctx.r;
    const u = r.u;
    const rowH = (GLYPH_H + 7) * u;
    const arrowW = 12 * u;
    r.centered(label, cx, y, C.skyPale, u);
    y += (GLYPH_H + 3) * u;
    if (enabled) {
      setRect(prev, cx - nameW / 2 - arrowW - u, y, arrowW, rowH);
      setRect(next, cx + nameW / 2 + u, y, arrowW, rowH);
      r.arrowButton(prev, -1, u);
      r.arrowButton(next, 1, u);
    } else {
      setRect(prev, 0, 0, 0, 0);
      setRect(next, 0, 0, 0, 0);
    }
    const box = setRect(scratch, cx - nameW / 2, y, nameW, rowH);
    r.panel(box, focused ? C.indigo : C.navy);
    if (focused) r.fill(C.white, box.x, box.y + box.h, box.w, 1);
    r.centered(value, cx, y + Math.round((rowH - GLYPH_H * u) / 2), enabled ? C.sun : C.grey, u);
    return y + rowH + 4 * u;
  }

  private drawBest(cx: number, y: number): void {
    const { r, profile } = this.ctx;
    const u = r.u;
    const adv = ADVANCE * u;
    if (this.mode === 'tour') {
      // "STARS 07/36"
      const stars = profile.tourStars();
      const total = TOUR_SPOTS.length * 3;
      const w = r.font.width(t.stars, u) + 6 * adv;
      const x = Math.round(cx - w / 2);
      r.text(t.stars, x, y, C.gold, u);
      r.number(stars, 2, x + w - 5 * adv, y, C.gold, u);
      r.text('/', x + w - 3 * adv, y, C.gold, u);
      r.number(total, 2, x + w - 2 * adv, y, C.gold, u);
      return;
    }
    const key = this.mode === 'daily' ? null : modeBestKey(this.mode, profile.sport);
    const best = this.mode === 'endless' ? profile.best[profile.sport] : key ? profile.gameBest(`run.${key}`) : 0;
    if (best <= 0) return;
    const digits = Math.max(5, digitCount(best));
    const w = r.font.width(t.best, u) + (digits + 1) * adv;
    const x = Math.round(cx - w / 2);
    r.text(t.best, x, y, C.skyPale, u);
    r.number(best, digits, x + w - digits * adv, y, C.skyPale, u);
  }
}

const scratch = newRect();

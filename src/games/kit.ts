import { isGameKey } from '../core/input.ts';
import type { Rng } from '../core/rng.ts';
import { CHARACTERS, defaultConfig, randomize, type AthleteConfig } from '../custom/athlete.ts';
import { t } from '../i18n/strings.ts';
import { ADVANCE, GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect, type Rect } from '../render/renderer.ts';
import type { Context, Screen } from '../ui/screen.ts';
import { LOWER_IS_BETTER, type MiniGameId } from './registry.ts';

export type MiniPhase = 'ready' | 'running' | 'paused' | 'over';

export interface OverLine {
  text: string;
  color: number;
}

/** Seconds before AGAIN works after the end, so a late tap does not restart at once. */
const RESTART_DELAY = 0.6;
/** How long a floating text stays up. */
export const POPUP_TIME = 0.9;
const POPUPS = 8;

interface Popup {
  text: string;
  x: number;
  y: number;
  color: number;
  age: number;
}

/** Random looks for rivals and crew, BOB and BOBBA alternating. */
export function rivalLooks(n: number, rng: Rng): AthleteConfig[] {
  const out: AthleteConfig[] = [];
  for (let i = 0; i < n; i++) {
    const c = defaultConfig(CHARACTERS[i % 2], 'surf');
    randomize(c, 'surf', rng);
    out.push(c);
  }
  return out;
}

/**
 * Everything the small games share: a start card with the controls, the
 * pause button and menu, the end screen with best score, AGAIN and HOME.
 * A game implements reset, step and draw; the single button arrives as
 * `pressed` (this step) and `held`.
 */
export abstract class MiniGame implements Screen {
  abstract readonly id: MiniGameId;
  protected phase: MiniPhase = 'ready';
  /** Always running, for idle animations. */
  protected clock = 0;
  /** Seconds of play. */
  protected time = 0;
  protected score = 0;
  protected best = 0;
  protected newBest = false;
  protected overTime = 0;
  protected overTitle: string = t.gameOver;
  /** Extra lines on the end screen. */
  protected readonly overLines: OverLine[] = [];
  protected readonly ctx: Context;
  private pressed = false;
  private readonly pauseRect = newRect();
  private readonly leftRect = newRect();
  private readonly rightRect = newRect();
  private readonly panelRect = newRect();
  private readonly popups: Popup[] = [];

  constructor(ctx: Context) {
    this.ctx = ctx;
    for (let i = 0; i < POPUPS; i++) this.popups.push({ text: '', x: 0, y: 0, color: C.white, age: POPUP_TIME });
  }

  /** A short text that floats up from (x, y) and fades: points, PERFECT!, NEW!... */
  protected popup(text: string, x: number, y: number, color: number = C.white): void {
    let slot = this.popups[0];
    for (const p of this.popups) if (p.age > slot.age) slot = p;
    slot.text = text;
    slot.x = x;
    slot.y = y;
    slot.color = color;
    slot.age = 0;
  }

  /** Race times: lower is better, and the score shows as seconds. */
  protected get timed(): boolean {
    return LOWER_IS_BETTER.has(this.id);
  }

  /** Games without a score (the aquarium) skip the start card and the score. */
  protected get scored(): boolean {
    return true;
  }

  enter(): void {
    this.best = this.ctx.profile.gameBest(this.id);
    this.overLines.length = 0;
    this.time = 0;
    this.score = 0;
    for (const p of this.popups) p.age = POPUP_TIME;
    this.reset();
    this.phase = this.scored ? 'ready' : 'running';
    this.pressed = false;
  }

  blur(): void {
    if (this.phase === 'running' && this.scored) this.phase = 'paused';
  }

  key(code: string): void {
    if (code === 'Escape') {
      if (this.phase === 'running' && this.scored) this.phase = 'paused';
      else this.ctx.go('home');
      return;
    }
    if (isGameKey(code) || code === 'Enter') {
      this.pressed = true;
      return;
    }
    this.onKey(code);
  }

  tap(x: number, y: number): boolean {
    if (this.phase === 'running' && inside(this.pauseRect, x, y)) {
      if (this.scored) this.phase = 'paused';
      else this.ctx.go('home');
      return true;
    }
    if (this.phase === 'paused' || (this.phase === 'over' && this.overTime >= RESTART_DELAY)) {
      if (inside(this.rightRect, x, y)) {
        this.ctx.go('home');
        return true;
      }
      if (inside(this.leftRect, x, y)) {
        this.pressed = true;
        return true;
      }
    }
    if (this.phase === 'running' && this.onTap(x, y)) return true;
    this.pressed = true;
    return false;
  }

  update(dt: number): void {
    this.clock += dt;
    const pressed = this.pressed;
    this.pressed = false;
    switch (this.phase) {
      case 'ready':
        this.idle(dt);
        if (pressed) {
          this.phase = 'running';
          this.start();
        }
        return;
      case 'paused':
        if (pressed) this.phase = 'running';
        return;
      case 'over':
        this.overTime += dt;
        this.idle(dt);
        if (pressed && this.overTime >= RESTART_DELAY) {
          this.overLines.length = 0;
          this.time = 0;
          this.score = 0;
          for (const p of this.popups) p.age = POPUP_TIME;
          this.reset();
          this.phase = 'running';
          this.start();
        }
        return;
      case 'running':
        this.time += dt;
        for (const p of this.popups) if (p.age < POPUP_TIME) p.age += dt;
        this.step(dt, pressed, this.ctx.input.held);
    }
  }

  /** Ends the run with a final score; keeps the best. */
  protected finish(title: string = t.gameOver): void {
    this.phase = 'over';
    this.overTime = 0;
    this.overTitle = title;
    this.newBest = false;
    const better = this.timed ? this.score > 0 && (this.best === 0 || this.score < this.best) : this.score > this.best;
    if (better) {
      this.best = this.score;
      this.newBest = true;
      this.ctx.profile.setGameBest(this.id, this.score);
    }
  }

  // ------------------------------------------------------------ for the games

  /** Fresh state for a new run (also before the start card). */
  protected abstract reset(): void;
  /** One fixed step of play. */
  protected abstract step(dt: number, pressed: boolean, held: boolean): void;
  /** The scene, below the shared HUD and menus. */
  protected abstract draw(alpha: number): void;
  /** Called once when play starts. */
  protected start(): void {}
  /** Background motion on the start card and the end screen. */
  protected idle(_dt: number): void {}
  protected onKey(_code: string): void {}
  /** Taps on the game's own controls; true when used. */
  protected onTap(_x: number, _y: number): boolean {
    return false;
  }
  /** Extra HUD of the game, drawn after the score. */
  protected hud(): void {}

  // ------------------------------------------------------------ shared drawing

  render(alpha: number): void {
    const r = this.ctx.r;
    this.draw(this.phase === 'running' ? alpha : 1);
    const u = r.u;
    for (const p of this.popups) {
      if (p.age >= POPUP_TIME || (p.age > POPUP_TIME * 0.7 && Math.floor(p.age * 20) % 2 === 0)) continue;
      r.centered(p.text, p.x, Math.round(p.y - p.age * 14 * u), p.color, u);
    }
    const margin = 6;
    const size = (GLYPH_H + 7) * u;
    if (this.phase === 'running') r.pauseButton(setRect(this.pauseRect, margin, margin, size, size), u);
    else setRect(this.pauseRect, 0, 0, 0, 0);
    if (this.scored && this.phase !== 'ready') this.drawScore();
    if (this.phase === 'running') this.hud();
    if (this.phase === 'ready') this.startCard();
    else if (this.phase === 'paused') this.menu(t.paused, t.resume);
    else if (this.phase === 'over') this.endCard();
  }

  /** Score in the top-right corner (a time for races), the best to its left. */
  private drawScore(): void {
    const r = this.ctx.r;
    const u = r.u;
    const adv = ADVANCE * u;
    const right = r.W - 6;
    const x = this.drawValue(this.score, right, 6, C.white, u);
    if (this.best > 0) {
      const bx = this.drawValue(this.best, x - 2 * adv, 6, C.skyPale, u);
      r.text(t.hi, bx - 3 * adv, 6, C.skyPale, u);
    }
  }

  /** Draws a score (or a time) right-aligned at `right`; returns its left edge. */
  protected drawValue(value: number, right: number, y: number, color: number, scale: number): number {
    const r = this.ctx.r;
    const adv = ADVANCE * scale;
    if (this.timed) {
      // seconds and hundredths: "83.47"
      const cents = Math.round(value * 100);
      const whole = Math.floor(cents / 100);
      const wd = Math.max(2, digitCount(whole));
      const x = right - (wd + 3) * adv + scale;
      r.number(whole, wd, x, y, color, scale);
      r.text('.', x + wd * adv, y, color, scale);
      r.number(cents % 100, 2, x + (wd + 1) * adv, y, color, scale);
      return x;
    }
    const digits = Math.max(5, digitCount(value));
    const x = right - digits * adv + scale;
    r.number(Math.floor(value), digits, x, y, color, scale);
    return x;
  }

  private startCard(): void {
    const r = this.ctx.r;
    const u = r.u;
    const info = t.games[this.id];
    const lineH = (GLYPH_H + 4) * u;
    const w = Math.min(r.W - 16, Math.max(r.font.width(info.hints[0], u), r.font.width(info.hints[1], u), r.font.width(info.name, 2 * u)) + 16 * u);
    const h = (GLYPH_H + 4) * 2 * u + 2 * r.lineHeight(info.hints[0], u, w - 8 * u) + lineH + 10 * u;
    const x = Math.round((r.W - w) / 2);
    const y = Math.max(6 + lineH, Math.round(r.H * 0.38 - h / 2));
    r.panel(setRect(this.panelRect, x, y, w, h));
    let cy = y + 4 * u;
    cy += r.centered(info.name, r.W / 2, cy, C.sun, 2 * u) + 2 * u;
    cy += r.centered(info.hints[0], r.W / 2, cy, C.white, u, w - 8 * u);
    cy += r.centered(info.hints[1], r.W / 2, cy, C.skyPale, u, w - 8 * u) + 2 * u;
    if (Math.floor(this.clock * 2) % 2 === 0) r.centered(r.touch ? t.tapToStart : t.spaceToStart, r.W / 2, cy, C.gold, u);
  }

  private endCard(): void {
    const r = this.ctx.r;
    const u = r.u;
    const lineH = (GLYPH_H + 3) * u;
    let y = Math.max(6 + (GLYPH_H + 4) * u * 2, Math.round(r.H * 0.2));
    y += r.centered(this.overTitle, r.W / 2, y, C.white, 2 * u);
    const big = 2 * u;
    const valueW = this.timed ? (Math.max(2, digitCount(Math.floor(this.score))) + 3) * ADVANCE * big : digitCount(Math.floor(this.score)) * ADVANCE * big;
    this.drawValue(this.score, Math.round((r.W + valueW) / 2), y, C.sun, big);
    y += (GLYPH_H + 4) * big;
    if (this.newBest) y += r.centered(t.newBest, r.W / 2, y, C.gold, u);
    for (const line of this.overLines) y += r.centered(line.text, r.W / 2, y, line.color, u);
    y += u;
    if (this.overTime >= RESTART_DELAY) {
      this.buttons(y + lineH / 2, t.again);
    } else {
      setRect(this.leftRect, 0, 0, 0, 0);
      setRect(this.rightRect, 0, 0, 0, 0);
    }
  }

  private menu(title: string, primary: string): void {
    const r = this.ctx.r;
    const u = r.u;
    const info = t.games[this.id];
    let y = Math.round(r.H * 0.25);
    y += r.centered(title, r.W / 2, y, C.white, 2 * u) + 2 * u;
    y += r.centered(info.hints[0], r.W / 2, y, C.white, u);
    y += r.centered(info.hints[1], r.W / 2, y, C.skyPale, u) + 3 * u;
    this.buttons(y, primary);
  }

  private buttons(y: number, primary: string): void {
    const r = this.ctx.r;
    const u = r.u;
    const h = (GLYPH_H + 7) * u;
    const w = Math.max(r.font.width(primary, u), r.font.width(t.home, u)) + 14 * u;
    const gap = 4 * u;
    r.button(setRect(this.leftRect, r.W / 2 - gap / 2 - w, y, w, h), primary, 'primary', u);
    r.button(setRect(this.rightRect, r.W / 2 + gap / 2, y, w, h), t.home, 'normal', u);
  }

  /** Is a tap inside one of the shared controls? (For games that read raw pointer positions.) */
  protected onShared(x: number, y: number): boolean {
    return inside(this.pauseRect as Rect, x, y);
  }
}

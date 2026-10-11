import type { SkyChoice, WeatherChoice } from '../env/environment.ts';
import { SKY_NAMES } from '../env/sky.ts';
import { WEATHER_NAMES } from '../env/weather.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect, type Rect } from '../render/renderer.ts';
import { DemoPilot, type Context, type Screen } from './screen.ts';

const SKY_CHOICES: readonly SkyChoice[] = ['auto', ...SKY_NAMES];
const WEATHER_CHOICES: readonly WeatherChoice[] = ['auto', ...WEATHER_NAMES];

const SKY = 0;
const WEATHER = 1;
const DONE = 2;
const ROWS = 3;

/**
 * Time of day and weather: automatic (the real clock, a random weather for
 * each run) or forced. The sea behind shows the choice right away.
 */
export class SettingsScreen implements Screen {
  private focus = SKY;
  private clock = 0;
  private distance = 0;
  private readonly pilot = new DemoPilot();
  private readonly skyPrev = newRect();
  private readonly skyNext = newRect();
  private readonly weatherPrev = newRect();
  private readonly weatherNext = newRect();
  private readonly done = newRect();
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  enter(): void {
    this.focus = SKY;
    this.pilot.reset();
    this.ctx.demo(this.ctx.profile.sport).reset();
  }

  blur(): void {}

  private change(row: number, step: number): void {
    const p = this.ctx.profile;
    let sky = p.sky;
    let weather = p.weather;
    if (row === SKY) sky = SKY_CHOICES[(SKY_CHOICES.indexOf(sky) + step + SKY_CHOICES.length) % SKY_CHOICES.length];
    else weather = WEATHER_CHOICES[(WEATHER_CHOICES.indexOf(weather) + step + WEATHER_CHOICES.length) % WEATHER_CHOICES.length];
    p.setSettings(sky, weather);
    this.ctx.r.env.apply(sky, weather);
  }

  key(code: string): void {
    switch (code) {
      case 'ArrowUp':
        this.focus = (this.focus + ROWS - 1) % ROWS;
        break;
      case 'ArrowDown':
      case 'Tab':
        this.focus = (this.focus + 1) % ROWS;
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (this.focus !== DONE) this.change(this.focus, code === 'ArrowLeft' ? -1 : 1);
        break;
      case 'Space':
      case 'Enter':
        if (this.focus === DONE) this.ctx.go('home');
        else this.change(this.focus, 1);
        break;
      case 'Escape':
        this.ctx.go('home');
        break;
    }
  }

  tap(x: number, y: number): boolean {
    if (inside(this.skyPrev, x, y)) this.change(SKY, -1);
    else if (inside(this.skyNext, x, y)) this.change(SKY, 1);
    else if (inside(this.weatherPrev, x, y)) this.change(WEATHER, -1);
    else if (inside(this.weatherNext, x, y)) this.change(WEATHER, 1);
    else if (inside(this.done, x, y)) this.ctx.go('home');
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
    r.athlete(this.ctx.player(), sport, this.ctx.demo(sport), landscape ? Math.round(W * 0.16) : Math.round(W / 2 - 8), alpha, this.clock);
    r.surfaceFront(this.distance);
    r.weatherFront(this.distance);

    const words = t.settings;
    const rowH = (GLYPH_H + 7) * u;
    const gap = 4 * u;
    const lineH = (GLYPH_H + 3) * u;
    const nameW = this.valueWidth() + 10 * u;
    const rows = 2 * (lineH + rowH + gap) + rowH;
    // a big title when there is room above the sea
    const titleScale = (GLYPH_H + 3) * 2 * u + gap + rows <= seaY - 12 ? 2 * u : u;
    const block = (GLYPH_H + 3) * titleScale + gap + rows;
    const cx = landscape ? Math.round(W * 0.62) : Math.round(W / 2);
    let y = Math.max(6, Math.min(Math.round((seaY - block) / 2), H - block - 6));
    y += r.centered(words.title, cx, y, C.white, titleScale) + gap;
    const sky = profile.sky === 'auto' ? words.autoSky : words.skies[profile.sky];
    const weather = profile.weather === 'auto' ? words.autoWeather : words.weathers[profile.weather];
    // one panel behind both selectors, so the labels read over any sky
    const panelW = nameW + 2 * (13 * u + 4 * u);
    r.panel(setRect(scratch, cx - panelW / 2, y - 3 * u, panelW, 2 * (lineH + rowH + 4 * u) + 2 * u), C.navy);
    y = this.selector(words.time, sky, this.skyPrev, this.skyNext, this.focus === SKY, cx, y, nameW);
    y = this.selector(words.weather, weather, this.weatherPrev, this.weatherNext, this.focus === WEATHER, cx, y, nameW);
    const bw = r.font.width(t.done, u) + 16 * u;
    r.button(setRect(this.done, cx - bw / 2, y + gap, bw, rowH), t.done, 'primary', u, this.focus === DONE);
  }

  /** The widest value a selector can show, so the box never changes size. */
  private valueWidth(): number {
    const { r } = this.ctx;
    const words = t.settings;
    let w = Math.max(r.font.width(words.autoSky, r.u), r.font.width(words.autoWeather, r.u));
    for (const sky of SKY_NAMES) w = Math.max(w, r.font.width(words.skies[sky], r.u));
    for (const weather of WEATHER_NAMES) w = Math.max(w, r.font.width(words.weathers[weather], r.u));
    return w;
  }

  /** A label and a "< VALUE >" selector; returns the y below it. */
  private selector(label: string, value: string, prev: Rect, next: Rect, focused: boolean, cx: number, y: number, nameW: number): number {
    const r = this.ctx.r;
    const u = r.u;
    const rowH = (GLYPH_H + 7) * u;
    const arrowW = 12 * u;
    r.centered(label, cx, y, C.skyPale, u);
    y += (GLYPH_H + 3) * u;
    r.arrowButton(setRect(prev, cx - nameW / 2 - arrowW - u, y, arrowW, rowH), -1, u);
    r.arrowButton(setRect(next, cx + nameW / 2 + u, y, arrowW, rowH), 1, u);
    const box = setRect(scratch, cx - nameW / 2, y, nameW, rowH);
    r.panel(box, focused ? C.indigo : C.ink);
    if (focused) r.fill(C.white, box.x, box.y + box.h, box.w, 1);
    r.centered(value, cx, y + Math.round((rowH - GLYPH_H * u) / 2), C.sun, u);
    return y + rowH + 4 * u;
  }
}

const scratch = newRect();

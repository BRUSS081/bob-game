import type { SkyChoice, WeatherChoice } from '../env/environment.ts';
import { SKY_NAMES } from '../env/sky.ts';
import { WEATHER_NAMES } from '../env/weather.ts';
import { LANGS, LANG_NAMES, deviceLang, setLang, t, type Lang } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect, type Rect } from '../render/renderer.ts';
import { DemoPilot, type Context, type Screen } from './screen.ts';

const LANG_CHOICES: readonly (Lang | 'auto')[] = ['auto', ...LANGS];
const SKY_CHOICES: readonly SkyChoice[] = ['auto', ...SKY_NAMES];
const WEATHER_CHOICES: readonly WeatherChoice[] = ['auto', ...WEATHER_NAMES];

const LANGUAGE = 0;
const SKY = 1;
const WEATHER = 2;
const VIBRATION = 3;
/** Selectors, then the DONE button. */
const SELECTORS = 4;
const DONE = SELECTORS;
const ROWS = SELECTORS + 1;

function step<T>(list: readonly T[], value: T, by: number): T {
  return list[(list.indexOf(value) + by + list.length) % list.length];
}

/**
 * Settings: language (the device's or a chosen one), time of day and
 * weather (automatic or forced, the sea behind shows the choice at once)
 * and the vibration on phones.
 */
export class SettingsScreen implements Screen {
  private focus = LANGUAGE;
  /** UI unit of the last frame: the screen's, or 1 when it does not fit. */
  private u = 1;
  private clock = 0;
  private distance = 0;
  private readonly pilot = new DemoPilot();
  private readonly prev: Rect[] = [];
  private readonly next: Rect[] = [];
  private readonly done = newRect();
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
    for (let i = 0; i < SELECTORS; i++) {
      this.prev.push(newRect());
      this.next.push(newRect());
    }
  }

  enter(): void {
    this.focus = LANGUAGE;
    this.pilot.reset();
    this.ctx.demo(this.ctx.profile.sport).reset();
  }

  blur(): void {}

  private change(row: number, by: number): void {
    const p = this.ctx.profile;
    let { sky, weather, lang } = p;
    if (row === LANGUAGE) {
      lang = step(LANG_CHOICES, lang, by);
      setLang(lang === 'auto' ? deviceLang() : lang);
    } else if (row === SKY) sky = step(SKY_CHOICES, sky, by);
    else if (row === WEATHER) weather = step(WEATHER_CHOICES, weather, by);
    else if (row === VIBRATION) {
      p.setVibration(!p.vibration);
      if (p.vibration) this.ctx.vibrate(30);
      return;
    }
    p.setSettings(sky, weather, lang);
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
    for (let i = 0; i < SELECTORS; i++) {
      if (inside(this.prev[i], x, y)) {
        this.change(i, -1);
        return true;
      }
      if (inside(this.next[i], x, y)) {
        this.change(i, 1);
        return true;
      }
    }
    if (inside(this.done, x, y)) {
      this.ctx.go('home');
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.clock += dt;
    this.distance += 60 * dt;
    this.pilot.update(this.ctx.demo(this.ctx.profile.sport), dt);
  }

  private label(row: number): string {
    const w = t.settings;
    return row === LANGUAGE ? w.language : row === SKY ? w.time : row === WEATHER ? w.weather : t.vibration;
  }

  private value(row: number): string {
    const p = this.ctx.profile;
    const w = t.settings;
    if (row === LANGUAGE) return p.lang === 'auto' ? w.autoLang : LANG_NAMES[p.lang];
    if (row === SKY) return p.sky === 'auto' ? w.autoSky : w.skies[p.sky];
    if (row === WEATHER) return p.weather === 'auto' ? w.autoWeather : w.weathers[p.weather];
    return p.vibration ? t.on : t.off;
  }

  render(alpha: number): void {
    const { r, profile } = this.ctx;
    const { W, H, seaY } = r;
    const sport = profile.sport;
    const landscape = W >= H * 1.25;
    r.backdrop(this.distance);
    r.athlete(this.ctx.player(), sport, this.ctx.demo(sport), landscape ? Math.round(W * 0.12) : Math.round(W / 2 - 8), alpha, this.clock);
    r.surfaceFront(this.distance);
    r.weatherFront(this.distance);

    // one column; two when the screen is short; small text when neither fits
    let u = r.u;
    let rowH = 0;
    let gap = 0;
    let nameW = 0;
    let cellW = 0;
    let cellH = 0;
    let cols = 1;
    for (;;) {
      rowH = (GLYPH_H + 7) * u;
      gap = 4 * u;
      nameW = this.valueWidth(u) + 10 * u;
      cellW = nameW + 2 * (13 * u);
      cellH = (GLYPH_H + 3) * u + rowH + gap;
      const tall = SELECTORS * cellH + rowH + 2 * gap + 12 <= H;
      cols = tall ? 1 : 2;
      if (u === 1 || tall || (2 * cellW + 3 * gap <= W - 12 && 2 * cellH + rowH + 2 * gap + 12 <= H)) break;
      u = 1;
    }
    this.u = u;
    const rows = Math.ceil(SELECTORS / cols);
    const gridW = cols * cellW + (cols - 1) * 3 * gap;
    const gridH = rows * cellH;
    const titleH = (GLYPH_H + 3) * 2 * u;
    const showTitle = titleH + gap + gridH + gap + rowH + 12 <= H;
    const block = (showTitle ? titleH + gap : 0) + gridH + gap + rowH;
    const cx = landscape && cols === 1 ? Math.round(W * 0.62) : Math.round(W / 2);
    let y = Math.max(6, Math.min(Math.round((seaY - block) / 2), H - block - 6));
    if (showTitle) y += r.centered(t.settings.title, cx, y, C.white, 2 * u) + gap;
    // one panel behind the selectors, so the labels read over any sky
    r.panel(setRect(scratch, cx - gridW / 2 - 4 * u, y - 3 * u, gridW + 8 * u, gridH + 2 * u), C.navy);
    for (let i = 0; i < SELECTORS; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const ccx = cx - gridW / 2 + col * (cellW + 3 * gap) + cellW / 2;
      this.selector(i, ccx, y + row * cellH, nameW);
    }
    y += gridH + gap;
    const bw = r.font.width(t.done, u) + 16 * u;
    r.button(setRect(this.done, cx - bw / 2, y, bw, rowH), t.done, 'primary', u, this.focus === DONE);
  }

  /** The widest value a selector can show, so the boxes never change size. */
  private valueWidth(u: number): number {
    const { r } = this.ctx;
    const w = t.settings;
    let max = Math.max(r.font.width(w.autoSky, u), r.font.width(w.autoWeather, u), r.font.width(w.autoLang, u), r.font.width(t.on, u), r.font.width(t.off, u));
    for (const l of LANGS) max = Math.max(max, r.font.width(LANG_NAMES[l], u));
    for (const sky of SKY_NAMES) max = Math.max(max, r.font.width(w.skies[sky], u));
    for (const weather of WEATHER_NAMES) max = Math.max(max, r.font.width(w.weathers[weather], u));
    return max;
  }

  /** A label and a "< VALUE >" selector centered on cx. */
  private selector(row: number, cx: number, y: number, nameW: number): void {
    const r = this.ctx.r;
    const u = this.u;
    const rowH = (GLYPH_H + 7) * u;
    const arrowW = 12 * u;
    const focused = this.focus === row;
    r.centered(this.label(row), cx, y, C.skyPale, u);
    y += (GLYPH_H + 3) * u;
    r.arrowButton(setRect(this.prev[row], cx - nameW / 2 - arrowW - u, y, arrowW, rowH), -1, u);
    r.arrowButton(setRect(this.next[row], cx + nameW / 2 + u, y, arrowW, rowH), 1, u);
    const box = setRect(scratch, cx - nameW / 2, y, nameW, rowH);
    r.panel(box, focused ? C.indigo : C.ink);
    if (focused) r.fill(C.white, box.x, box.y + box.h, box.w, 1);
    r.centered(this.value(row), cx, y + Math.round((rowH - GLYPH_H * u) / 2), C.sun, u);
  }
}

const scratch = newRect();

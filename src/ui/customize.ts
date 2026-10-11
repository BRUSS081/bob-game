import { Rng } from '../core/rng.ts';
import { CHARACTERS, OPTIONS, TABS, optionValue, randomize, stepOption, type OptionSpec, type Tab } from '../custom/athlete.ts';
import type { AthleteState } from '../game/athletes.ts';
import type { SportId } from '../game/sport.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect, type PoseView, type Rect } from '../render/renderer.ts';
import { GEAR_COLORS, HAIR_COLORS, LENS_COLORS, SKIN_TONES, type Ramp } from '../sprites/ramps.ts';
import type { Context, Screen } from './screen.ts';

/** Most option rows a tab can have (wing foil gear). */
const MAX_ROWS = 8;
/** Widest value label, so rows do not jump around while stepping. */
const VALUE_CHARS = 9;

/** Layouts tried in order until the list fits: [UI scale (0 = full, 1 = small), row padding, gap]. */
const FITS: readonly (readonly [number, number, number])[] = [
  [0, 7, 3],
  [0, 5, 2],
  [0, 4, 2],
  [1, 7, 3],
  [1, 5, 2],
];

const STYLE_NAMES = t.styles as unknown as Record<string, Record<string, string>>;

function rampsFor(spec: OptionSpec): readonly Ramp[] {
  switch (spec.kind) {
    case 'skin':
      return SKIN_TONES;
    case 'hair':
      return HAIR_COLORS;
    case 'lens':
      return LENS_COLORS;
    default:
      return GEAR_COLORS;
  }
}

function labelFor(spec: OptionSpec, sport: SportId): string {
  const label = t.labels[spec.key];
  return typeof label === 'string' ? label : label[sport];
}

/** A rider standing still on the water, for the live preview. */
class StillPose implements PoseView {
  readonly state: AthleteState = 'ride';
  readonly y = 0;
  readonly prevY = 0;
  readonly rotation = 0;
  readonly prevRotation = 0;
  readonly stateTime = 1;
}

/**
 * Customization: three tabs of options with a live preview. Every change
 * is a palette swap or a part swap, saved right away for this sport and
 * this rider (BOB and BOBBA keep separate looks).
 */
export class CustomizeScreen implements Screen {
  private tab: Tab = 'athlete';
  private rows: OptionSpec[] = [];
  /** 0 = tabs, 1..rows = options, rows+1 = buttons. */
  private focus = 1;
  private button = 1;
  /** Layout sizes that only change with the sport, measured on enter. */
  private maxRows = 0;
  private maxLabel = 0;
  private clock = 0;
  private readonly rng = new Rng((Date.now() & 0x7fffffff) || 1);
  private readonly pose = new StillPose();
  private readonly tabRects = TABS.map(newRect);
  private readonly prevRects: Rect[] = [];
  private readonly nextRects: Rect[] = [];
  private readonly valueRects: Rect[] = [];
  private readonly random = newRect();
  private readonly done = newRect();
  private readonly preview = newRect();
  private readonly list = newRect();
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
    for (let i = 0; i < MAX_ROWS; i++) {
      this.prevRects.push(newRect());
      this.nextRects.push(newRect());
      this.valueRects.push(newRect());
    }
  }

  enter(): void {
    const sport = this.ctx.profile.sport;
    this.maxRows = 0;
    this.maxLabel = 0;
    for (const tab of TABS) {
      const rows = this.rowsFor(tab);
      this.maxRows = Math.max(this.maxRows, rows.length);
      for (const o of rows) this.maxLabel = Math.max(this.maxLabel, labelFor(o, sport).length);
    }
    this.setTab('athlete');
    this.focus = 1;
  }

  blur(): void {}

  private rowsFor(tab: Tab): OptionSpec[] {
    const sport = this.ctx.profile.sport;
    return OPTIONS.filter((o) => o.tab === tab && o.sports.includes(sport));
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.rows = this.rowsFor(tab);
    for (let i = 0; i < this.tabRects.length; i++) if (TABS[i] !== tab) setRect(this.tabRects[i], 0, 0, 0, 0);
    for (let i = this.rows.length; i < MAX_ROWS; i++) {
      setRect(this.prevRects[i], 0, 0, 0, 0);
      setRect(this.nextRects[i], 0, 0, 0, 0);
      setRect(this.valueRects[i], 0, 0, 0, 0);
    }
    this.focus = Math.min(this.focus, this.rows.length + 1);
  }

  private step(row: number, dir: number): void {
    const spec = this.rows[row];
    const p = this.ctx.profile;
    if (spec.key === 'character') {
      p.setRider(CHARACTERS[(CHARACTERS.indexOf(p.rider) + dir + CHARACTERS.length) % CHARACTERS.length]);
    } else {
      stepOption(p.look(), spec, dir, this.ctx.missions.unlocked);
      p.saveLook();
    }
    this.ctx.changed();
  }

  private shuffle(): void {
    const p = this.ctx.profile;
    randomize(p.look(), p.sport, this.rng, this.ctx.missions.unlocked);
    p.saveLook();
    this.ctx.changed();
  }

  private close(): void {
    this.ctx.profile.saveLook();
    this.ctx.go('home');
  }

  key(code: string): void {
    const last = this.rows.length + 1;
    const tabIndex = TABS.indexOf(this.tab);
    switch (code) {
      case 'ArrowUp':
        this.focus = (this.focus + last) % (last + 1);
        break;
      case 'ArrowDown':
        this.focus = (this.focus + 1) % (last + 1);
        break;
      case 'Tab':
        this.setTab(TABS[(tabIndex + 1) % TABS.length]);
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dir = code === 'ArrowLeft' ? -1 : 1;
        if (this.focus === 0) this.setTab(TABS[(tabIndex + dir + TABS.length) % TABS.length]);
        else if (this.focus === last) this.button = 1 - this.button;
        else this.step(this.focus - 1, dir);
        break;
      }
      case 'Space':
      case 'Enter':
        if (this.focus === 0) this.setTab(TABS[(tabIndex + 1) % TABS.length]);
        else if (this.focus === last) {
          if (this.button === 0) this.shuffle();
          else this.close();
        } else this.step(this.focus - 1, 1);
        break;
      case 'KeyR':
        this.shuffle();
        break;
      case 'Escape':
        this.close();
        break;
    }
  }

  tap(x: number, y: number): boolean {
    for (let i = 0; i < TABS.length; i++) {
      if (inside(this.tabRects[i], x, y)) {
        this.setTab(TABS[i]);
        this.focus = 0;
        return true;
      }
    }
    for (let i = 0; i < this.rows.length; i++) {
      const hit = inside(this.prevRects[i], x, y) ? -1 : inside(this.nextRects[i], x, y) || inside(this.valueRects[i], x, y) ? 1 : 0;
      if (hit !== 0) {
        this.focus = i + 1;
        this.step(i, hit);
        return true;
      }
    }
    if (inside(this.random, x, y)) {
      this.shuffle();
      return true;
    }
    if (inside(this.done, x, y)) {
      this.close();
      return true;
    }
    // taps on the panels do nothing, but they are not game input either
    return inside(this.list, x, y) || inside(this.preview, x, y);
  }

  update(dt: number): void {
    this.clock += dt;
  }

  render(): void {
    const { r, profile } = this.ctx;
    const { W, H } = r;
    const sport = profile.sport;
    const look = profile.look();
    const margin = 6;
    const landscape = W >= H * 1.25;

    r.backdrop(this.clock * 30);
    r.surfaceFront(this.clock * 30);

    const maxRows = this.maxRows;

    // pick the largest UI scale and row height that fit
    let u = r.u;
    let rowH = 0;
    let gap = 0;
    let fitted = false;
    for (let attempt = 0; attempt < FITS.length && !fitted; attempt++) {
      const fit = FITS[attempt];
      u = fit[0] === 0 ? r.u : 1;
      rowH = (GLYPH_H + fit[1]) * u;
      gap = fit[2] * u;
      const listH = maxRows * (rowH + gap) + 2 * gap;
      const need = landscape ? margin + rowH + 2 * gap + listH + margin : margin + rowH + 2 * gap + listH + 2 * gap + rowH + margin + 60;
      fitted = need <= H;
    }

    const pad = 2 * gap;
    const labelW = r.font.widthOf(this.maxLabel, u);
    const arrowW = 10 * u;
    const valueW = r.font.widthOf(VALUE_CHARS, u) + 6 * u;
    const rowW = labelW + 4 * u + arrowW + u + valueW + u + arrowW;
    const listW = Math.min(W - 2 * margin, rowW + 2 * pad);
    const listH = maxRows * (rowH + gap) + 2 * gap;

    let listX: number;
    let listY: number;
    let tabsY: number;
    let buttonsY: number;
    const buttonW = r.font.width(t.random, u) + 12 * u;
    if (landscape) {
      listX = W - margin - listW;
      tabsY = margin;
      listY = tabsY + rowH + 2 * gap;
      const leftW = listX - 2 * margin;
      buttonsY = H - margin - 2 * rowH - gap;
      setRect(this.preview, margin, margin, leftW, buttonsY - 2 * gap - margin);
      const bw = Math.min(leftW, buttonW * 1.4);
      setRect(this.random, margin + (leftW - bw) / 2, buttonsY, bw, rowH);
      setRect(this.done, margin + (leftW - bw) / 2, buttonsY + rowH + gap, bw, rowH);
    } else {
      listX = Math.round((W - listW) / 2);
      tabsY = margin;
      buttonsY = H - margin - rowH;
      listY = buttonsY - 2 * gap - listH;
      const previewY = tabsY + rowH + 2 * gap;
      setRect(this.preview, listX, previewY, listW, listY - 2 * gap - previewY);
      const bw = Math.min((listW - gap) / 2, buttonW * 1.4);
      setRect(this.random, W / 2 - gap / 2 - bw, buttonsY, bw, rowH);
      setRect(this.done, W / 2 + gap / 2, buttonsY, bw, rowH);
    }
    setRect(this.list, listX, listY, listW, listH);

    this.drawPreview(sport, u);

    // tabs above the list
    const tabW = Math.floor((listW - (TABS.length - 1) * u) / TABS.length);
    for (let i = 0; i < TABS.length; i++) {
      const rect = setRect(this.tabRects[i], listX + i * (tabW + u), tabsY, tabW, rowH);
      r.button(rect, t.tabs[TABS[i]], TABS[i] === this.tab ? 'selected' : 'normal', u, this.focus === 0 && TABS[i] === this.tab);
    }

    r.panel(this.list);
    for (let i = 0; i < this.rows.length; i++) {
      const spec = this.rows[i];
      const y = listY + gap + i * (rowH + gap);
      const focused = this.focus === i + 1;
      if (focused) r.fill(C.indigo, listX, y - Math.floor(gap / 2), listW, rowH + gap);
      const textY = y + Math.round((rowH - GLYPH_H * u) / 2);
      r.text(labelFor(spec, sport), listX + pad, textY, focused ? C.white : C.skyPale, u);
      const x0 = listX + listW - pad - rowW + labelW + 4 * u;
      const prev = setRect(this.prevRects[i], x0, y, arrowW, rowH);
      const value = setRect(this.valueRects[i], x0 + arrowW + u, y, valueW, rowH);
      const next = setRect(this.nextRects[i], value.x + valueW + u, y, arrowW, rowH);
      r.arrowButton(prev, -1, u);
      r.arrowButton(next, 1, u);
      this.drawValue(spec, optionValue(look, spec.key), value, u);
    }

    r.button(this.random, t.random, 'normal', u, this.focus === this.rows.length + 1 && this.button === 0);
    r.button(this.done, t.done, 'primary', u, this.focus === this.rows.length + 1 && this.button === 1);
  }

  private drawValue(spec: OptionSpec, v: number, rect: Rect, u: number): void {
    const r = this.ctx.r;
    const textY = rect.y + Math.round((rect.h - GLYPH_H * u) / 2);
    const cx = rect.x + rect.w / 2;
    if (spec.kind === 'character') {
      r.centered(t.characters[CHARACTERS[v]], cx, textY, C.sun, u);
    } else if (spec.kind === 'style' && spec.names) {
      r.centered(STYLE_NAMES[spec.key][spec.names[v]], cx, textY, C.white, u);
    } else if (v < 0) {
      r.centered(t.none, cx, textY, C.grey, u);
    } else {
      const sw = rect.w - 8 * u;
      r.swatch(rampsFor(spec)[v], Math.round(cx - sw / 2), rect.y + 2 * u, sw, rect.h - 4 * u);
    }
  }

  /** The athlete on a little card of sky and sea, as big as the card allows. */
  private drawPreview(sport: SportId, u: number): void {
    const r = this.ctx.r;
    const p = this.preview;
    if (p.w <= 0 || p.h <= 0) return;
    // the rider with its kite or wing is about 95 px tall and 90 px wide at scale 1
    const scale = Math.max(1, Math.min(3, Math.floor(p.h / 100), Math.floor(p.w / 90)));
    const below = 26 * scale;
    const surface = p.y + p.h - below;
    r.panel(p, C.skyLight);
    r.fill(C.skyPale, p.x, surface - 12 * scale, p.w, 12 * scale);
    r.fill(C.sea, p.x, surface, p.w, below);
    r.fill(C.turquoise, p.x, surface, p.w, scale);
    r.ctx.save();
    r.ctx.beginPath();
    r.ctx.rect(p.x, p.y, p.w, p.h);
    r.ctx.clip();
    const anchor = p.x + Math.round(p.w / 2) - (sport === 'kite' ? 10 : 6) * scale;
    r.athlete(this.ctx.player(), sport, this.pose, anchor - 8 * scale, 0, this.clock, scale, surface);
    r.ctx.restore();
    r.fill(C.white, p.x, surface + scale, p.w, scale);
    const name = t.sports[sport];
    const ts = r.font.width(name, u) + 6 * u <= p.w ? u : 1;
    r.font.draw(r.ctx, name, p.x + 3 * ts, p.y + 3 * ts, C.navy, ts);
  }
}

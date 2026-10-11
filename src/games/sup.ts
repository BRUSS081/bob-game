import { Rng } from '../core/rng.ts';
import type { AthleteConfig } from '../custom/athlete.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { ANCHOR_X, ANCHOR_Y } from '../sprites/compose.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame, rivalLooks } from './kit.ts';

/** Tuning of the SUP race. Distances in meters, times in seconds. */
export const SUP = {
  length: 500,
  /** Seconds for the marker to cross the whole timing bar. */
  sweep: 0.85,
  /** Faster bar in the final sprint. */
  sprintSweep: 0.62,
  sprintAt: 400,
  /** The good zone of the bar, and the perfect zone inside it. */
  good: [0.62, 0.82] as const,
  perfect: [0.69, 0.75] as const,
  /** Speed added by a stroke (m/s), by quality. */
  impulse: { perfect: 3.4, good: 2.1, miss: 0.8 },
  /** Water drag, per second. */
  drag: 0.5,
  /** A stroke lasts this long; taps meanwhile are ignored. */
  stroke: 0.42,
  /** Average speeds of the three rivals (m/s), before a small random spread. */
  rivals: [7.4, 8.1, 8.8] as const,
  /** Rivals push harder in the sprint too. */
  rivalSprint: 1.1,
  maxTime: 150,
} as const;

export type Stroke = 'perfect' | 'good' | 'miss';

export interface Rival {
  pos: number;
  speed: number;
  cadence: number;
  phase: number;
  finish: number;
}

/** The race itself, without drawing: one button, the timing bar, three rivals. */
export class SupRace {
  /** Marker on the timing bar, 0..1. */
  meter = 0;
  pos = 0;
  v = 0;
  time = 0;
  /** Seconds since the last stroke started. */
  strokeTime = 1;
  lastStroke: Stroke | null = null;
  finished = false;
  readonly rivals: Rival[] = [];
  private readonly rng = new Rng(1);

  constructor() {
    for (let i = 0; i < SUP.rivals.length; i++) this.rivals.push({ pos: 0, speed: 0, cadence: 0, phase: 0, finish: 0 });
    this.reset(1);
  }

  reset(seed: number): void {
    this.rng.seed(seed);
    this.meter = 0;
    this.pos = 0;
    this.v = 0;
    this.time = 0;
    this.strokeTime = 1;
    this.lastStroke = null;
    this.finished = false;
    SUP.rivals.forEach((base, i) => {
      const r = this.rivals[i];
      r.pos = 0;
      r.speed = base + this.rng.range(-0.3, 0.3);
      r.cadence = this.rng.range(0.55, 0.7);
      r.phase = this.rng.next();
      r.finish = 0;
    });
  }

  get sprint(): boolean {
    return this.pos >= SUP.sprintAt;
  }

  /** How good a tap would be right now. */
  quality(meter = this.meter): Stroke {
    if (meter >= SUP.perfect[0] && meter <= SUP.perfect[1]) return 'perfect';
    if (meter >= SUP.good[0] && meter <= SUP.good[1]) return 'good';
    return 'miss';
  }

  /** One step; returns the stroke made by a press, if any. */
  step(dt: number, pressed: boolean): Stroke | null {
    if (this.finished) return null;
    this.time += dt;
    this.strokeTime += dt;
    let made: Stroke | null = null;
    if (pressed && this.strokeTime >= SUP.stroke) {
      made = this.quality();
      this.v += SUP.impulse[made];
      this.strokeTime = 0;
      this.lastStroke = made;
      // a new rhythm starts from each stroke
      this.meter = 0;
    } else {
      this.meter += dt / (this.sprint ? SUP.sprintSweep : SUP.sweep);
      if (this.meter >= 1) this.meter -= 1;
    }
    this.v -= this.v * SUP.drag * dt;
    this.pos += this.v * dt;
    for (const r of this.rivals) {
      const boost = r.pos >= SUP.sprintAt ? SUP.rivalSprint : 1;
      // speed pulses with each stroke of the rival
      const pulse = 1 + 0.3 * Math.sin(((this.time + r.phase) / r.cadence) * Math.PI * 2);
      r.pos += r.speed * boost * pulse * dt;
      if (r.pos >= SUP.length && r.finish === 0) r.finish = this.time;
    }
    if (this.pos >= SUP.length || this.time >= SUP.maxTime) this.finished = true;
    return made;
  }

  /** 1 to 4: rivals already across the line, or ahead, beat you. */
  get place(): number {
    let p = 1;
    for (const r of this.rivals) if (r.pos > this.pos) p++;
    return p;
  }
}

/** Pixels per meter on screen. */
const PX = 10;

export class SupScreen extends MiniGame {
  readonly id = 'sup' as const;
  private readonly race = new SupRace();
  private readonly rng = new Rng(Date.now() >>> 0);
  private looks: AthleteConfig[] = [];
  private prevPos = 0;
  private sprintShown = false;

  constructor(ctx: Context) {
    super(ctx);
  }

  protected reset(): void {
    this.race.reset((this.rng.next() * 0xffffffff) >>> 0);
    this.looks = rivalLooks(3, this.rng);
    this.prevPos = 0;
    this.sprintShown = false;
  }

  protected step(dt: number, pressed: boolean): void {
    const race = this.race;
    this.prevPos = race.pos;
    const made = race.step(dt, pressed);
    this.score = race.time;
    const r = this.ctx.r;
    const x = Math.round(r.W * 0.3);
    if (made === 'perfect') this.popup(t.gameText.sup.perfect, x, r.seaY - 66, C.gold);
    else if (made === 'good') this.popup(t.gameText.sup.good, x, r.seaY - 66, C.white);
    else if (made === 'miss') this.popup(t.gameText.sup.splash, x, r.seaY - 66, C.skyPale);
    if (race.sprint && !this.sprintShown) {
      this.sprintShown = true;
      this.popup(t.gameText.sup.sprint, r.W / 2, r.seaY - 90, C.coral);
    }
    if (race.finished) {
      const place = race.place;
      this.score = race.pos >= SUP.length ? race.time : SUP.maxTime;
      this.overLines.push({ text: `${t.gameText.sup.places[place - 1]} ${t.gameText.sup.of}`, color: place === 1 ? C.gold : C.white });
      this.finish(race.pos >= SUP.length ? t.finish : t.timeUp);
    }
  }

  protected draw(alpha: number): void {
    const r = this.ctx.r;
    const race = this.race;
    const pos = this.prevPos + (race.pos - this.prevPos) * alpha;
    const scroll = pos * PX;
    r.backdrop(scroll);
    const x0 = Math.round(r.W * 0.3);
    // distance buoys every 50 m and the finish line
    for (let m = 50; m <= SUP.length; m += 50) {
      const bx = Math.round(x0 + (m - pos) * PX + 40);
      if (bx < -20 || bx > r.W + 20) continue;
      if (m === SUP.length) this.finishLine(bx);
      else this.buoy(bx, m % 100 === 0 ? m : 0);
    }
    // rivals behind the player, in their own rhythm
    for (let i = 0; i < race.rivals.length; i++) {
      const rv = race.rivals[i];
      const rx = Math.round(x0 + (rv.pos - pos) * PX);
      if (rx < -60 || rx > r.W + 60) continue;
      const frames = this.ctx.actor('paddle', this.looks[i]);
      const f = Math.floor(((this.time + rv.phase) / rv.cadence) * 4) & 3;
      this.drawPaddler(frames[f], rx, r.seaY - 2 - i * 3);
    }
    const frames = this.ctx.actor('paddle');
    const f = race.strokeTime < SUP.stroke ? Math.min(3, Math.floor((race.strokeTime / SUP.stroke) * 4)) : 0;
    this.drawPaddler(frames[f], x0, r.seaY + 1);
    r.surfaceFront(scroll);
    if (race.strokeTime < 0.2) this.splash(x0 + 16, r.seaY);
  }

  private drawPaddler(frame: HTMLCanvasElement, x: number, seaY: number): void {
    const bob = Math.round(Math.sin(this.clock * 3 + x * 0.1));
    this.ctx.r.ctx.drawImage(frame, x - ANCHOR_X, seaY - ANCHOR_Y + bob);
  }

  private splash(x: number, y: number): void {
    const r = this.ctx.r;
    const k = this.race.strokeTime / 0.2;
    for (let i = 0; i < 5; i++) r.fill(C.white, Math.round(x + i * 3 - 6 + k * (i - 2) * 4), Math.round(y - 3 - Math.sin(k * Math.PI) * (4 + i)), 1, 1);
  }

  private buoy(x: number, label: number): void {
    const r = this.ctx.r;
    const y = r.seaY;
    r.fill(C.ink, x - 4, y - 9, 9, 9);
    r.fill(C.orange, x - 3, y - 8, 7, 7);
    r.fill(C.gold, x - 3, y - 8, 7, 2);
    if (label) {
      r.fill(C.ink, x, y - 30, 1, 22);
      r.text(String(label), x + 3, y - 30, C.white, 1);
    }
  }

  private finishLine(x: number): void {
    const r = this.ctx.r;
    const y = r.seaY;
    r.fill(C.ink, x - 1, y - 62, 3, 62);
    r.fill(C.white, x, y - 62, 1, 62);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) r.fill((i + j) % 2 ? C.ink : C.white, x + 2 + i * 3, y - 62 + j * 3, 3, 3);
    for (let i = 0; i < 12; i++) r.fill(i % 2 ? C.ink : C.white, x - 1, y + 1 + i * 2, 3, 2);
  }

  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    const race = this.race;
    // race progress: everyone on one line
    const pw = Math.min(r.W - 120 * u, 200 * u);
    const px = Math.round((r.W - pw) / 2);
    const py = 6 + 3 * u;
    r.fill(C.ink, px - 1, py - 1, pw + 2, 3 * u + 2);
    r.fill(C.navy, px, py, pw, 3 * u);
    for (const rv of race.rivals) r.fill(C.silver, px + Math.round((Math.min(rv.pos, SUP.length) / SUP.length) * (pw - 2 * u)), py - u, 2 * u, 5 * u);
    r.fill(C.gold, px + Math.round((Math.min(race.pos, SUP.length) / SUP.length) * (pw - 2 * u)), py - 2 * u, 2 * u, 7 * u);
    r.text(t.gameText.sup.places[race.place - 1], px, py + 6 * u, race.place === 1 ? C.gold : C.white, u);
    // timing bar at the bottom
    const bw = Math.min(r.W - 24, 160 * u);
    const bh = 8 * u;
    const bx = Math.round((r.W - bw) / 2);
    const by = r.H - bh - 10 * u;
    r.fill(C.ink, bx - 2, by - 2, bw + 4, bh + 4);
    r.fill(C.navy, bx, by, bw, bh);
    r.fill(C.green, bx + Math.round(SUP.good[0] * bw), by, Math.round((SUP.good[1] - SUP.good[0]) * bw), bh);
    r.fill(C.sun, bx + Math.round(SUP.perfect[0] * bw), by, Math.round((SUP.perfect[1] - SUP.perfect[0]) * bw), bh);
    const mx = bx + Math.round(race.meter * bw);
    r.fill(C.ink, mx - u - 1, by - 3 * u - 1, 2 * u + 2, bh + 6 * u + 2);
    r.fill(C.white, mx - u, by - 3 * u, 2 * u, bh + 6 * u);
    if (this.time < 4) r.centered(r.touch ? t.tutorial.tap : t.tutorial.space, r.W / 2, by - (GLYPH_H + 6) * u, C.gold, u);
  }
}

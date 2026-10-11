import { Rng } from '../core/rng.ts';
import { t } from '../i18n/strings.ts';
import { C } from '../render/palette.ts';
import type { Sky } from '../render/renderer.ts';
import { slopeIndex } from '../sprites/actor.ts';
import { ANCHOR_X, ANCHOR_Y } from '../sprites/compose.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame } from './kit.ts';

/** Tuning of the swells. Pixels, seconds; altitude up from the mean sea level. */
export const SWELLS = {
  /** The day: the game ends at dark. */
  day: 90,
  /** Gravity, and how much stronger it gets while the button is held. */
  gravity: 300,
  hold: 3,
  /** Speed lost to the water, per second. */
  drag: 0.3,
  minSpeed: 60,
  maxSpeed: 430,
  startSpeed: 120,
  /** Swell wavelengths and amplitude, growing along the way. */
  long: 420,
  short: 250,
  amplitude: [16, 44] as const,
  /** Distance where the swells reach full size. */
  grow: 9000,
  /** Landing within this angle of the slope, going down, is perfect. */
  perfect: 0.3,
  /** Landing further off than this is a splash. */
  splash: 0.65,
  perfectBoost: 1.12,
  splashLoss: 0.7,
  pxPerMeter: 10,
  perfectPoints: 25,
} as const;

/** The swell surface: a pure function of x, so the same seed gives the same sea. */
export class Swell {
  private p1 = 0;
  private p2 = 0;

  seed(rng: Rng): void {
    this.p1 = rng.next() * Math.PI * 2;
    this.p2 = rng.next() * Math.PI * 2;
  }

  /** Altitude of the surface at x. */
  at(x: number): number {
    const a = SWELLS.amplitude[0] + (SWELLS.amplitude[1] - SWELLS.amplitude[0]) * Math.min(1, Math.max(0, x) / SWELLS.grow);
    return a * Math.sin((x / SWELLS.long) * Math.PI * 2 + this.p1) + a * 0.45 * Math.sin((x / SWELLS.short) * Math.PI * 2 + this.p2);
  }

  slope(x: number): number {
    return (this.at(x + 0.5) - this.at(x - 0.5)) / 1;
  }

  bend(x: number): number {
    return this.at(x + 2) - 2 * this.at(x) + this.at(x - 2);
  }
}

export type Landing = 'perfect' | 'splash' | 'ok' | null;

/** The ride itself, without drawing: one button, a surfer on long swells until dark. */
export class SwellRide {
  readonly sea = new Swell();
  x = 0;
  y = 0;
  /** Speed along the surface while riding; velocity while flying. */
  speed: number = SWELLS.startSpeed;
  vx = 0;
  vy = 0;
  air = false;
  time = 0;
  perfects = 0;
  /** Highest altitude of the current flight. */
  peak = 0;
  private readonly rng = new Rng(1);

  reset(seed: number): void {
    this.rng.seed(seed);
    this.sea.seed(this.rng);
    this.x = 0;
    this.y = this.sea.at(0);
    this.speed = SWELLS.startSpeed;
    this.vx = 0;
    this.vy = 0;
    this.air = false;
    this.time = 0;
    this.perfects = 0;
    this.peak = 0;
  }

  get over(): boolean {
    return this.time >= SWELLS.day;
  }

  get meters(): number {
    return Math.floor(this.x / SWELLS.pxPerMeter);
  }

  get score(): number {
    return this.meters + this.perfects * SWELLS.perfectPoints;
  }

  /** Board angle: positive is nose down. */
  get angle(): number {
    return this.air ? -Math.atan2(this.vy, this.vx) : -Math.atan(this.sea.slope(this.x));
  }

  step(dt: number, held: boolean): Landing {
    this.time += dt;
    const g = SWELLS.gravity * (held ? SWELLS.hold : 1);
    if (this.air) {
      this.vy -= g * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.peak = Math.max(this.peak, this.y);
      const surface = this.sea.at(this.x);
      if (this.y > surface) return null;
      // touch down: keep the part of the velocity along the slope
      const theta = Math.atan(this.sea.slope(this.x));
      const off = Math.abs(Math.atan2(this.vy, this.vx) - theta);
      this.y = surface;
      this.air = false;
      this.speed = Math.max(SWELLS.minSpeed, this.vx * Math.cos(theta) + this.vy * Math.sin(theta));
      if (off < SWELLS.perfect && theta < -0.05) {
        this.speed = Math.min(SWELLS.maxSpeed, this.speed * SWELLS.perfectBoost);
        this.perfects++;
        return 'perfect';
      }
      if (off > SWELLS.splash) {
        this.speed = Math.max(SWELLS.minSpeed, this.speed * SWELLS.splashLoss);
        return 'splash';
      }
      return 'ok';
    }
    const slope = this.sea.slope(this.x);
    const theta = Math.atan(slope);
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    this.speed += (-g * sin - SWELLS.drag * this.speed) * dt;
    this.speed = Math.min(SWELLS.maxSpeed, Math.max(SWELLS.minSpeed, this.speed));
    // over a crest, faster than gravity can bend the path: take off
    const curvature = this.sea.bend(this.x) / 4 / Math.pow(1 + slope * slope, 1.5);
    if (curvature < 0 && this.speed * this.speed * -curvature > g * cos) {
      this.air = true;
      this.vx = this.speed * cos;
      this.vy = this.speed * sin;
      this.peak = this.y;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return null;
    }
    this.x += this.speed * cos * dt;
    this.y = this.sea.at(this.x);
    return null;
  }
}

// ------------------------------------------------------------------ screen

export class SwellsScreen extends MiniGame {
  readonly id = 'swells' as const;
  private readonly ride = new SwellRide();
  private readonly rng = new Rng(Date.now() >>> 0);
  private prevX = 0;
  private prevY = 0;
  private camY = 0;

  constructor(ctx: Context) {
    super(ctx);
  }

  protected reset(): void {
    this.ride.reset((this.rng.next() * 0xffffffff) >>> 0);
    this.prevX = this.ride.x;
    this.prevY = this.ride.y;
    this.camY = 0;
  }

  protected idle(dt: number): void {
    // cruise along on the start card
    if (this.phase !== 'ready') return;
    this.prevX = this.ride.x;
    this.prevY = this.ride.y;
    this.ride.step(dt, false);
    this.ride.time = 0;
  }

  protected step(dt: number, _pressed: boolean, held: boolean): void {
    const ride = this.ride;
    this.prevX = ride.x;
    this.prevY = ride.y;
    const landing = ride.step(dt, held);
    this.score = ride.score;
    const sx = this.riderX;
    const sy = this.screenY(ride.y) - 50;
    if (landing === 'perfect') this.popup(t.gameText.swells.perfect, sx, sy, C.gold);
    else if (landing === 'splash') this.popup(t.gameText.swells.splash, sx, sy, C.skyPale);
    if (ride.over) {
      this.overLines.push({ text: `${ride.meters} ${t.gameText.swells.meters}`, color: C.white });
      this.overLines.push({ text: `${t.gameText.swells.perfects} ${ride.perfects}`, color: C.gold });
      this.finish(t.gameText.swells.dark);
    }
  }

  private get riderX(): number {
    return Math.round(this.ctx.r.W * 0.3);
  }

  /** Mean sea level on screen. */
  private get baseY(): number {
    return this.ctx.r.seaY - 6;
  }

  private screenY(alt: number): number {
    return Math.round(this.baseY - alt + this.camY);
  }

  private get sky(): Sky {
    const k = this.ride.time / SWELLS.day;
    return k < 0.5 ? 'day' : k < 0.82 ? 'sunset' : 'night';
  }

  protected draw(alpha: number): void {
    const r = this.ctx.r;
    const ride = this.ride;
    const x = this.prevX + (ride.x - this.prevX) * alpha;
    const y = this.prevY + (ride.y - this.prevY) * alpha;
    // the camera rises with big flights, so the surfer stays on screen
    const top = 40;
    const want = Math.max(0, y - (this.baseY - top));
    this.camY += (want - this.camY) * 0.15;
    const sky = this.sky;
    r.seaY = this.baseY + Math.round(this.camY) + 30;
    r.backdrop(x * 0.2, sky);
    this.birds(x);
    this.swells(x, sky);
    // the surfer on the slope, or flying
    const frames = this.ctx.actor('slope');
    const f = frames[slopeIndex(ride.angle, ride.air)];
    r.ctx.drawImage(f, this.riderX - ANCHOR_X, this.screenY(y) - ANCHOR_Y + 2);
    if (!ride.air && ride.speed > 200) this.spray(this.screenY(y));
    // a marker when the surfer is above the top of the screen
    if (this.screenY(y) < 8) {
      r.fill(C.ink, this.riderX - 3, 2, 7, 4);
      r.fill(C.sun, this.riderX - 2, 3, 5, 2);
    }
  }

  /** The swells, column by column: foam on the crest line, stepped water below. */
  private swells(camX: number, sky: Sky): void {
    const r = this.ctx.r;
    const ride = this.ride;
    const x0 = camX - this.riderX;
    const night = sky === 'night';
    const top = night ? C.teal : C.turquoise;
    const body = night ? C.deep : C.sea;
    const deep = night ? C.abyss : C.teal;
    for (let sx = 0; sx < r.W; sx++) {
      const wx = x0 + sx;
      const y = this.screenY(ride.sea.at(wx));
      const crest = ride.sea.slope(wx);
      r.fill(Math.abs(crest) < 0.06 && ride.sea.bend(wx) < 0 ? C.white : C.aqua, sx, y, 1, 2);
      r.fill(top, sx, y + 2, 1, 4);
      r.fill(body, sx, y + 6, 1, 16);
      r.fill(deep, sx, y + 22, 1, 50);
      // deeper water in steps, for tall screens
      r.fill(night ? C.navy : C.deep, sx, y + 72, 1, 90);
      r.fill(night ? C.ink : C.abyss, sx, y + 162, 1, Math.max(0, r.H - y - 162));
    }
    // streaks on the faces, moving with the water
    for (let i = 0; i < 14; i++) {
      const wx = Math.floor(x0 / 37) * 37 + i * 37 + ((i * 13) % 11);
      const sx = Math.round(wx - x0);
      const y = this.screenY(ride.sea.at(wx)) + 9 + ((i * 7) % 12);
      r.fill(night ? C.teal : C.turquoise, sx, y, 5, 1);
    }
  }

  /** How much of the day is left: the sun crossing a little bar at the top. */
  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    const w = 70 * u;
    const x = Math.round((r.W - w) / 2);
    const y = 6 + 3 * u;
    const k = Math.min(1, this.ride.time / SWELLS.day);
    r.fill(C.ink, x - 1, y - 1, w + 2, 2 * u + 2);
    r.fill(C.navy, x, y, w, 2 * u);
    r.fill(k < 0.5 ? C.gold : k < 0.82 ? C.orange : C.violet, x, y, Math.round(k * w), 2 * u);
    const sx = x + Math.round(k * w) - 3 * u;
    r.fill(C.ink, sx - 1, y - 2 * u - 1, 6 * u + 2, 6 * u + 2);
    r.fill(k < 0.82 ? C.sun : C.mist, sx, y - 2 * u, 6 * u, 6 * u);
  }

  private spray(y: number): void {
    const r = this.ctx.r;
    for (let i = 0; i < 6; i++) {
      const k = (this.clock * 3 + i / 6) % 1;
      r.fill(C.white, Math.round(this.riderX - 14 - k * 20), Math.round(y - 2 - Math.sin(k * Math.PI) * 6 - (i % 2)), 1, 1);
    }
  }

  /** Seagulls far away. */
  private birds(camX: number): void {
    const r = this.ctx.r;
    const span = r.W + 60;
    for (let i = 0; i < 3; i++) {
      const x = Math.round(((((i * 191 - camX * 0.1 + this.clock * 8) % span) + span) % span) - 30);
      const y = Math.round(r.seaY - 90 - i * 23);
      const flap = Math.floor(this.clock * 3 + i) % 2;
      r.fill(C.slate, x, y + flap, 2, 1);
      r.fill(C.slate, x + 2, y + 1, 1, 1);
      r.fill(C.slate, x + 3, y + flap, 2, 1);
    }
  }
}

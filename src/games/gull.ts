import { Rng } from '../core/rng.ts';
import type { AthleteConfig } from '../custom/athlete.ts';
import { t } from '../i18n/strings.ts';
import { ADVANCE, GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { rasterCanvas } from '../render/renderer.ts';
import { ANCHOR_X, ANCHOR_Y, KITE_W } from '../sprites/compose.ts';
import { Raster } from '../sprites/raster.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame, rivalLooks } from './kit.ts';

/** Tuning of the gull. Distances in game pixels, altitude measured up from the sea. */
export const GULL = {
  gravity: 520,
  /** Upward speed right after a flap. */
  flap: 175,
  maxFall: 260,
  /** Highest altitude: the gull glides along it. */
  ceiling: 165,
  /** Forward speed at the start and at most. */
  speed: 72,
  maxSpeed: 132,
  /** Speed gained per second of flight. */
  accel: 0.9,
  /** Space between obstacles at the start and at most speed. */
  gap: [190, 130] as const,
  /** Half size of the gull's hitbox. */
  hitW: 6,
  hitH: 3,
  /** Points for each stolen fish. */
  fishPoints: 25,
  /** Pixels per meter for the distance score. */
  pxPerMeter: 10,
  /** Extra space between a sail and a kite in a row. */
  switchRoom: 110,
} as const;

export type HazardKind = 'fishing' | 'sail' | 'kite';

export interface Hazard {
  active: boolean;
  kind: HazardKind;
  /** World x of the left edge. */
  x: number;
  /** Sail height, or the altitude of the top of the kite. */
  height: number;
  /** Fish left in the crate (fishing boats). */
  fish: number;
  /** Which rival look flies the kite or sails the boat. */
  look: number;
}

/** The gull sprite, its beak tip at (GULL_W - 1, 10). */
const GULL_W = 30;
const GULL_H = 22;

/** Lengths of the things at sea, in pixels. A kite hazard starts at its rider; the canopy flies KITE_AHEAD further on. */
export const BOAT_W = 54;
export const SAIL_W = 40;
export const KITE_AHEAD = 60;
const WIDTH: Record<HazardKind, number> = { fishing: BOAT_W, sail: SAIL_W, kite: KITE_AHEAD + KITE_W };
const POOL = 8;

/** The flight itself, without drawing: one button, boats with fish, sails and kites. */
export class GullFlight {
  alt = 90;
  vy = 0;
  distance = 0;
  speed: number = GULL.speed;
  fish = 0;
  /** Seconds since the last fish was grabbed (the gull holds it in its beak for a while). */
  sinceFish = 99;
  crashed: 'water' | 'hit' | null = null;
  readonly hazards: Hazard[] = [];
  private nextAt = 0;
  /** The previous hazard, so a sail and a kite in a row always leave room to change height. */
  private lastKind: HazardKind = 'fishing';
  private readonly rng = new Rng(1);

  constructor() {
    for (let i = 0; i < POOL; i++) this.hazards.push({ active: false, kind: 'fishing', x: 0, height: 0, fish: 0, look: 0 });
    this.reset(1);
  }

  reset(seed: number): void {
    this.rng.seed(seed);
    this.alt = 90;
    this.vy = 0;
    this.distance = 0;
    this.speed = GULL.speed;
    this.fish = 0;
    this.sinceFish = 99;
    this.crashed = null;
    for (const h of this.hazards) h.active = false;
    // the first boat comes a little later, with fish: an easy start
    this.nextAt = 320;
    this.lastKind = 'fishing';
  }

  get score(): number {
    return Math.floor(this.distance / GULL.pxPerMeter) + this.fish * GULL.fishPoints;
  }

  /** One step; true when a fish was grabbed. */
  step(dt: number, pressed: boolean, gullX: number, aheadW: number): boolean {
    if (this.crashed) return false;
    if (pressed) this.vy = GULL.flap;
    this.vy = Math.max(-GULL.maxFall, this.vy - GULL.gravity * dt);
    this.alt += this.vy * dt;
    if (this.alt > GULL.ceiling) {
      this.alt = GULL.ceiling;
      if (this.vy > 0) this.vy = 0;
    }
    this.speed = Math.min(GULL.maxSpeed, this.speed + GULL.accel * dt);
    this.distance += this.speed * dt;
    this.sinceFish += dt;
    // new hazards appear off screen to the right
    const right = this.distance + aheadW;
    while (this.nextAt < right + 40) this.spawn();
    let grabbed = false;
    const gx = this.distance + gullX;
    for (const h of this.hazards) {
      if (!h.active) continue;
      if (h.x + WIDTH[h.kind] < this.distance - 40) {
        h.active = false;
        continue;
      }
      if (h.kind === 'fishing' && h.fish > 0 && inCrate(h, gx, this.alt)) {
        h.fish--;
        this.fish++;
        this.sinceFish = 0;
        grabbed = true;
      }
      if (hits(h, gx, this.alt)) {
        this.crashed = 'hit';
        return grabbed;
      }
    }
    if (this.alt <= 0) {
      this.alt = 0;
      this.crashed = 'water';
    }
    return grabbed;
  }

  private spawn(): void {
    let slot: Hazard | null = null;
    for (const h of this.hazards) if (!h.active) slot = h;
    const progress = (this.speed - GULL.speed) / (GULL.maxSpeed - GULL.speed);
    const gap = GULL.gap[0] + (GULL.gap[1] - GULL.gap[0]) * progress + this.rng.range(0, 70);
    const roll = this.rng.next();
    // fishing boats are the reward: more of them early on
    const kind: HazardKind = this.nextAt < 700 || roll < 0.4 ? 'fishing' : roll < 0.72 ? 'sail' : 'kite';
    // between a sail (fly over) and a kite (fly under) there is room to change height
    if ((kind === 'kite' && this.lastKind === 'sail') || (kind === 'sail' && this.lastKind === 'kite')) this.nextAt += GULL.switchRoom;
    const x = this.nextAt;
    this.nextAt += WIDTH[kind] + gap;
    this.lastKind = kind;
    if (!slot) return;
    slot.active = true;
    slot.kind = kind;
    slot.x = x;
    slot.look = Math.floor(this.rng.next() * 4);
    slot.fish = kind === 'fishing' ? 1 + Math.floor(this.rng.next() * 3) : 0;
    slot.height = kind === 'sail' ? this.rng.range(70, 70 + 50 * Math.min(1, 0.4 + progress)) : kind === 'kite' ? this.rng.range(115, 150) : 0;
  }
}

/** The crate on the foredeck of a fishing boat: fly over the cabin, then dive through it to grab a fish. */
export function inCrate(h: Hazard, x: number, alt: number): boolean {
  return x >= h.x + 25 && x <= h.x + BOAT_W && alt >= 8 && alt <= 34;
}

/** Does the gull's hitbox around (x, alt) overlap the box [x0, x1] × [a0, a1]? */
function box(x: number, alt: number, x0: number, x1: number, a0: number, a1: number): boolean {
  return x + GULL.hitW >= x0 && x - GULL.hitW <= x1 && alt + GULL.hitH >= a0 && alt - GULL.hitH <= a1;
}

/** Does the gull at (x, alt) touch a hull, a cabin, a sail, a kite or its rider? */
export function hits(h: Hazard, x: number, alt: number): boolean {
  switch (h.kind) {
    case 'fishing':
      return box(x, alt, h.x, h.x + BOAT_W, 0, 6) || box(x, alt, h.x + 6, h.x + 19, 0, 20);
    case 'sail': {
      const mast = h.x + 16;
      if (box(x, alt, h.x, h.x + SAIL_W, 0, 6) || box(x, alt, mast - 1, mast + 1, 0, h.height)) return true;
      // mainsail behind the mast and jib in front: triangles narrowing to the top
      const lo = Math.max(6, alt - GULL.hitH);
      const hi = Math.min(h.height, alt + GULL.hitH);
      for (let a = lo; a <= hi; a += 1) {
        const k = 1 - a / h.height;
        if (box(x, a, mast - 2 - 14 * k, mast + 12 * k, a, a)) return true;
      }
      return false;
    }
    case 'kite': {
      const top = h.height;
      const kx = h.x + KITE_AHEAD;
      // the rider on the sea, then the canopy: an arch, high in the middle with lower tips
      return (
        box(x, alt, h.x + 2, h.x + 18, 0, 26) ||
        box(x, alt, kx + 12, kx + KITE_W - 12, top - 9, top) ||
        box(x, alt, kx + 2, kx + 14, top - 22, top - 6) ||
        box(x, alt, kx + KITE_W - 14, kx + KITE_W - 2, top - 22, top - 6)
      );
    }
  }
}

// ------------------------------------------------------------------ sprites

function ink(r: Raster): Raster {
  const src = Uint8Array.from(r.px);
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? 0 : src[y * r.w + x]);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (src[y * r.w + x] !== 0) continue;
      if (get(x - 1, y) || get(x + 1, y) || get(x, y - 1) || get(x, y + 1)) r.px[y * r.w + x] = C.ink;
    }
  }
  return r;
}

/** The gull, facing right: wings up, level and down. */
function gullRaster(frame: number): Raster {
  const r = new Raster(GULL_W, GULL_H);
  // tail, body, head
  r.polygon([[6, 11], [0, 9], [1, 14], [7, 14]], C.silver);
  r.rect(0, 9, 2, 2, C.ink);
  r.ellipse(13, 12, 8, 4, C.white);
  r.rect(7, 14, 11, 2, C.mist);
  r.ellipse(21, 9, 4, 3, C.white);
  r.rect(19, 12, 4, 2, C.white);
  // beak with the red spot, eye
  r.rect(25, 9, 4, 2, C.gold);
  r.set(28, 10, C.red);
  r.rect(25, 10, 2, 1, C.orange);
  r.set(22, 8, C.ink);
  // feet tucked under
  r.rect(12, 16, 3, 1, C.orange);
  // wing: grey with black tips
  if (frame === 0) {
    r.polygon([[9, 11], [12, 4], [17, 0], [21, 0], [18, 6], [17, 11]], C.silver);
    r.polygon([[17, 0], [21, 0], [19, 3], [16, 2]], C.ink);
    r.line(11, 9, 15, 3, C.white);
  } else if (frame === 1) {
    r.polygon([[8, 11], [2, 7], [6, 5], [14, 7], [18, 10]], C.silver);
    r.polygon([[2, 7], [6, 5], [7, 7], [4, 8]], C.ink);
    r.line(9, 10, 15, 8, C.white);
  } else {
    r.polygon([[9, 13], [11, 19], [15, 20], [17, 13]], C.silver);
    r.polygon([[11, 18], [15, 20], [15, 18], [12, 17]], C.ink);
  }
  return ink(r);
}

/** A small fishing boat, bow to the right: the wheelhouse aft and the crate on the foredeck. */
function fishingBoat(): Raster {
  const r = new Raster(BOAT_W + 2, 30);
  const sea = 29;
  r.polygon([[1, sea - 8], [BOAT_W + 1, sea - 10], [BOAT_W - 4, sea], [5, sea]], C.white);
  r.rect(2, sea - 8, BOAT_W - 2, 2, C.red);
  r.rect(6, sea - 2, BOAT_W - 12, 2, C.silver);
  // wheelhouse with windows and a little mast
  r.rect(7, sea - 21, 12, 13, C.white);
  r.rect(6, sea - 22, 14, 2, C.coral);
  r.rect(9, sea - 18, 3, 3, C.skyLight);
  r.rect(14, sea - 18, 3, 3, C.skyLight);
  r.rect(8, sea - 29, 1, 8, C.brown);
  r.rect(9, sea - 29, 4, 2, C.gold);
  // crate
  r.rect(32, sea - 13, 16, 5, C.brown);
  r.rect(32, sea - 13, 16, 1, C.tan);
  r.rect(39, sea - 12, 1, 4, C.tan);
  return ink(r);
}

// ------------------------------------------------------------------ screen

export class GullScreen extends MiniGame {
  readonly id = 'gull' as const;
  private readonly flight = new GullFlight();
  private readonly rng = new Rng(Date.now() >>> 0);
  private readonly gullFrames: HTMLCanvasElement[] = [];
  private boat: HTMLCanvasElement | null = null;
  private looks: AthleteConfig[] = [];
  private prevAlt = 90;
  private prevDistance = 0;
  private flapTime = 1;

  constructor(ctx: Context) {
    super(ctx);
  }

  private get gullX(): number {
    return Math.round(Math.min(110, this.ctx.r.W * 0.25));
  }

  protected reset(): void {
    if (this.gullFrames.length === 0) {
      for (let f = 0; f < 3; f++) this.gullFrames.push(rasterCanvas(gullRaster(f)));
      this.boat = rasterCanvas(fishingBoat());
    }
    this.flight.reset((this.rng.next() * 0xffffffff) >>> 0);
    this.looks = rivalLooks(4, this.rng);
    this.prevAlt = this.flight.alt;
    this.prevDistance = 0;
    this.flapTime = 1;
  }

  protected start(): void {
    this.flight.vy = GULL.flap;
  }

  protected idle(dt: number): void {
    // glide on the start card
    if (this.phase === 'ready') this.flight.alt = 90 + Math.sin(this.clock * 2) * 6;
    this.flapTime += dt;
  }

  protected step(dt: number, pressed: boolean): void {
    const f = this.flight;
    this.prevAlt = f.alt;
    this.prevDistance = f.distance;
    if (pressed) this.flapTime = 0;
    this.flapTime += dt;
    const grabbed = f.step(dt, pressed, this.gullX, this.ctx.r.W);
    this.score = f.score;
    const r = this.ctx.r;
    if (grabbed) this.popup(`+${GULL.fishPoints}`, this.gullX, r.seaY - f.alt - 16, C.gold);
    if (f.crashed) {
      this.overLines.push({ text: `${t.gameText.gull.fish} ${f.fish}`, color: C.gold });
      this.finish(f.crashed === 'water' ? t.gameText.gull.splash : t.gameOver);
    }
  }

  protected draw(alpha: number): void {
    const r = this.ctx.r;
    const f = this.flight;
    const distance = this.prevDistance + (f.distance - this.prevDistance) * alpha;
    r.backdrop(distance * 0.6);
    this.clouds(distance);
    for (const h of f.hazards) {
      if (!h.active) continue;
      const x = Math.round(h.x - distance);
      if (x < -140 || x > r.W + 80) continue;
      if (h.kind === 'fishing') this.drawFishing(h, x);
      else if (h.kind === 'sail') this.drawSail(h, x);
      else this.drawKite(h, x);
    }
    this.drawGull(alpha);
    r.surfaceFront(distance);
  }

  private clouds(distance: number): void {
    const r = this.ctx.r;
    const span = r.W + 120;
    for (let i = 0; i < 5; i++) {
      const x = Math.round(((((i * 173 - distance * 0.25) % span) + span) % span) - 60);
      const y = Math.round(r.seaY - 120 - ((i * 47) % 70) - (i % 2) * 30);
      const w = 22 + (i % 3) * 10;
      r.fill(C.white, x, y, w, 5);
      r.fill(C.white, x + 5, y - 4, w - 12, 4);
      r.fill(C.skyPale, x + 2, y + 5, w - 4, 2);
    }
  }

  private drawFishing(h: Hazard, x: number): void {
    const r = this.ctx.r;
    const y = r.seaY - 29 + Math.round(Math.sin(this.clock * 2 + h.x) * 1);
    if (this.boat) r.ctx.drawImage(this.boat, x, y);
    // fish sticking out of the crate
    for (let i = 0; i < h.fish; i++) {
      const fx = x + 35 + i * 4;
      r.fill(C.ink, fx - 1, y + 13, 4, 4);
      r.fill(C.silver, fx, y + 14, 2, 3);
      r.fill(C.sky, fx, y + 14, 2, 1);
    }
  }

  private drawSail(h: Hazard, x: number): void {
    const r = this.ctx.r;
    const sea = r.seaY + Math.round(Math.sin(this.clock * 2 + h.x) * 1);
    const mast = x + 16;
    const top = Math.round(sea - h.height);
    const stripe = h.look % 2 === 0 ? C.coral : C.blue;
    // sails, row by row: mainsail behind the mast, jib in front
    for (let y = top + 1; y < sea - 7; y++) {
      const k = (y - top) / (h.height - 7);
      const back = Math.round(14 * k);
      const front = Math.round(12 * k);
      r.fill(C.ink, mast - 2 - back - 1, y, back + 1, 1);
      r.fill(Math.abs(y - (top + h.height * 0.6)) < 2 ? stripe : C.white, mast - 2 - back, y, back, 1);
      r.fill(C.ink, mast + 2, y, front + 1, 1);
      r.fill(C.mist, mast + 2, y, front, 1);
    }
    r.fill(C.ink, mast - 1, top - 1, 3, h.height - 4);
    r.fill(C.brown, mast, top, 1, h.height - 6);
    r.fill(C.slate, mast - 16, sea - 8, 16, 1);
    // hull
    r.fill(C.ink, x - 1, sea - 7, SAIL_W + 2, 8);
    r.fill(C.white, x, sea - 6, SAIL_W, 6);
    r.fill(stripe, x, sea - 3, SAIL_W, 1);
    r.fill(C.ink, x + SAIL_W - 3, sea - 1, 3, 1);
  }

  private drawKite(h: Hazard, x: number): void {
    const r = this.ctx.r;
    const set = this.ctx.sprites(this.looks[h.look], 'kite', false);
    const riderX = x + 10;
    const fy = r.seaY - ANCHOR_Y + Math.round(Math.sin(this.clock * 3 + h.x));
    const kx = x + KITE_AHEAD;
    const ky = Math.round(r.seaY - h.height - 2);
    const bx = riderX - ANCHOR_X + set.barTop[0];
    const by = fy + set.barTop[1];
    r.line(kx + set.kiteTipL[0], ky + set.kiteTipL[1], bx, by, C.slate);
    r.line(kx + set.kiteTipR[0], ky + set.kiteTipR[1], bx, by + 7, C.slate);
    r.ctx.drawImage(set.kite[Math.floor(this.clock * 3) % set.kite.length], kx, ky);
    r.ctx.drawImage(set.frames.ride0, riderX - ANCHOR_X, fy);
  }

  private drawGull(alpha: number): void {
    const r = this.ctx.r;
    const f = this.flight;
    const alt = this.prevAlt + (f.alt - this.prevAlt) * alpha;
    const frame = f.crashed ? 1 : this.flapTime < 0.08 ? 0 : this.flapTime < 0.18 ? 2 : f.vy > -60 ? 1 : Math.floor(this.clock * 6) % 2 === 0 ? 1 : 0;
    const img = this.gullFrames[frame];
    if (!img) return;
    const x = this.gullX - 15;
    const y = Math.round(r.seaY - alt - 12);
    r.ctx.drawImage(img, x, y);
    if (f.sinceFish < 1.5) {
      // the stolen fish hanging from the beak
      r.fill(C.ink, x + 25, y + 11, 5, 9);
      r.fill(C.silver, x + 26, y + 12, 3, 6);
      r.fill(C.sky, x + 26, y + 12, 1, 6);
      r.fill(C.silver, x + 25, y + 18, 5, 2);
    }
  }

  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    const y = 6 + (GLYPH_H + 5) * u;
    const n = this.flight.fish;
    const x = r.W - 6 - digitCount(n) * ADVANCE * u + u;
    // a little fish, then the count
    const fx = x - 12 * u;
    r.fill(C.ink, fx - u, y, 9 * u, 7 * u);
    r.fill(C.silver, fx, y + u, 5 * u, 5 * u);
    r.fill(C.sky, fx, y + u, 5 * u, 2 * u);
    r.fill(C.silver, fx + 5 * u, y + 2 * u, 2 * u, 3 * u);
    r.fill(C.ink, fx + u, y + 2 * u, u, u);
    r.number(n, digitCount(n), x, y, C.gold, u);
  }
}

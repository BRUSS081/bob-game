import { Rng } from '../core/rng.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { newRect, setRect } from '../render/renderer.ts';
import { seaFloor, specks, underwater } from '../render/sea.ts';
import { FISH_FRAMES, rodTip } from '../sprites/actor.ts';
import { ANCHOR_X, ANCHOR_Y } from '../sprites/compose.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame } from './kit.ts';
import { RARITY_POINTS, pickCreature, type Creature } from './sealife.ts';

/** Tuning of fishing. Times in seconds, distances in pixels. */
export const FISHING = {
  session: 120,
  /** Seconds for the power meter to go from empty to full. */
  aim: 1.1,
  /** Flight of the lure. */
  flight: 0.6,
  /** Fractions of the depth per second: held sinks, released rises. */
  sink: 0.42,
  rise: 0.22,
  /** How close a fish must swim to the hook to bite, and bites per second. */
  reach: 11,
  bite: { 1: 2.5, 2: 1.6, 3: 1, 4: 0.6 } as Record<1 | 2 | 3 | 4, number>,
  /** Reeling in and the fish pulling away, in pixels per second. */
  reel: 70,
  pull: 46,
  /** Tension gained while reeling (plus the fish's pull), lost while not. */
  strain: 0.55,
  ease: 0.7,
  /** The fish escapes once this far beyond where it was hooked. */
  slack: 120,
  /** Seconds for a fish to tire: its pull drops to `tired` of its strength. */
  stamina: 9,
  tired: 0.45,
  /** Fish close to the bait turn toward it, this fast (pixels per second). */
  lure: 18,
  notice: [60, 34] as const,
  /** Seconds the catch card stays up. */
  card: 2.6,
  swimmers: 7,
  jellies: 3,
} as const;

export type FishPhase = 'aim' | 'cast' | 'sink' | 'fight' | 'card';
export type FishEvent = 'cast' | 'bite' | 'snap' | 'escape' | 'sting' | 'catch' | 'empty' | null;

export interface Swimmer {
  active: boolean;
  creature: Creature | null;
  x: number;
  /** Depth below the surface. */
  y: number;
  dir: number;
  speed: number;
  size: number;
}

export interface Jelly {
  x: number;
  y: number;
  vy: number;
}

/** A fishing session without drawing: one button for casting, sinking and reeling. */
export class FishingTrip {
  width = 480;
  depth = 180;
  /** Where the rod tip is (x) and where casts start. */
  rodX = 60;
  night = false;
  phase: FishPhase = 'aim';
  timeLeft: number = FISHING.session;
  /** Power meter 0..1 and its direction. */
  power = 0;
  private powerDir = 1;
  /** The lure: x, depth, and the cast in flight. */
  lureX = 0;
  lureY = 0;
  castFrom = 0;
  castTo = 0;
  castTime = 0;
  /** Has the hook been under water yet on this cast? Until then the float waits on the surface. */
  sunk = false;
  /** The fish on the line: how far from the rod, tension 0..1. */
  hooked: Swimmer | null = null;
  distance = 0;
  hookedAt = 0;
  tension = 0;
  pullNow = 0;
  fightTime = 0;
  /** The last catch, for the card. */
  caught: Creature | null = null;
  caughtSize = 0;
  cardTime = 0;
  score = 0;
  catches = 0;
  readonly swimmers: Swimmer[] = [];
  readonly jellies: Jelly[] = [];
  private readonly rng = new Rng(1);

  constructor() {
    for (let i = 0; i < FISHING.swimmers; i++) this.swimmers.push({ active: false, creature: null, x: 0, y: 0, dir: 1, speed: 0, size: 0 });
    for (let i = 0; i < FISHING.jellies; i++) this.jellies.push({ x: 0, y: 0, vy: 0 });
  }

  reset(seed: number, width: number, depth: number, night: boolean): void {
    this.rng.seed(seed);
    this.width = width;
    this.depth = depth;
    this.rodX = Math.round(width * 0.14) + 26;
    this.night = night;
    this.phase = 'aim';
    this.timeLeft = FISHING.session;
    this.power = 0;
    this.powerDir = 1;
    this.lureX = this.rodX;
    this.lureY = 0;
    this.hooked = null;
    this.tension = 0;
    this.caught = null;
    this.score = 0;
    this.catches = 0;
    for (const s of this.swimmers) this.spawn(s, true);
    for (const j of this.jellies) {
      j.x = this.width * (0.35 + 0.6 * this.rng.next());
      j.y = this.depth * (0.15 + 0.6 * this.rng.next());
      j.vy = this.rng.range(-6, 6);
    }
  }

  get over(): boolean {
    return this.timeLeft <= 0 && (this.phase === 'aim' || this.phase === 'sink');
  }

  /** Where a cast with this power lands. */
  castX(power: number): number {
    return this.rodX + 50 + power * (this.width * 0.9 - this.rodX - 50);
  }

  private spawn(s: Swimmer, anywhere: boolean): void {
    const d = 0.08 + 0.88 * this.rng.next();
    const c = pickCreature(this.rng, d, this.night, isHookable);
    s.active = c !== null;
    s.creature = c;
    if (!c) return;
    s.dir = this.rng.next() < 0.5 ? -1 : 1;
    s.x = anywhere ? this.width * (0.3 + 0.7 * this.rng.next()) : s.dir > 0 ? this.width * 0.25 : this.width + 30;
    s.y = d * this.depth;
    s.speed = c.speed * this.rng.range(0.5, 0.9);
    s.size = Math.round(c.size[0] + (c.size[1] - c.size[0]) * this.rng.next());
  }

  step(dt: number, pressed: boolean, held: boolean): FishEvent {
    if (this.phase !== 'card' && this.timeLeft > 0) this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.swim(dt);
    switch (this.phase) {
      case 'aim':
        this.power += (this.powerDir * dt) / FISHING.aim;
        if (this.power >= 1) {
          this.power = 1;
          this.powerDir = -1;
        } else if (this.power <= 0) {
          this.power = 0;
          this.powerDir = 1;
        }
        if (pressed && this.timeLeft > 0) {
          this.phase = 'cast';
          this.castFrom = this.rodX;
          this.castTo = this.castX(this.power);
          this.castTime = 0;
          return 'cast';
        }
        return null;
      case 'cast':
        this.castTime += dt;
        this.lureX = this.castFrom + (this.castTo - this.castFrom) * Math.min(1, this.castTime / FISHING.flight);
        if (this.castTime >= FISHING.flight) {
          this.phase = 'sink';
          this.lureY = 0;
          this.sunk = false;
        }
        return null;
      case 'sink':
        return this.sink(dt, held);
      case 'fight':
        return this.fight(dt, held);
      case 'card':
        this.cardTime += dt;
        if (this.cardTime >= FISHING.card || (pressed && this.cardTime > 0.4)) this.phase = 'aim';
        return null;
    }
  }

  private sink(dt: number, held: boolean): FishEvent {
    this.lureY += (held ? FISHING.sink : -FISHING.rise) * this.depth * dt;
    this.lureY = Math.max(0, Math.min(this.lureY, this.depth - 4));
    if (this.lureY > 6) this.sunk = true;
    if (this.sunk && this.lureY <= 0 && !held) {
      // back up with nothing: reel in for another cast
      this.phase = 'aim';
      return 'empty';
    }
    for (const j of this.jellies) {
      if (Math.abs(j.x - this.lureX) < 7 && Math.abs(j.y - this.lureY) < 9) {
        this.phase = 'aim';
        return 'sting';
      }
    }
    for (const s of this.swimmers) {
      const c = s.creature;
      if (!s.active || !c) continue;
      if (Math.abs(s.x - this.lureX) > FISHING.reach || Math.abs(s.y - this.lureY) > FISHING.reach * 0.7) continue;
      if (this.rng.next() < FISHING.bite[c.rarity] * dt) {
        this.hooked = s;
        this.distance = Math.hypot(this.lureX - this.rodX, this.lureY + 20);
        this.hookedAt = this.distance;
        this.tension = 0.2;
        this.fightTime = 0;
        this.phase = 'fight';
        return 'bite';
      }
    }
    return null;
  }

  /** How hard this fish pulls: rarer and bigger pull harder, in bursts. */
  strength(s: Swimmer): number {
    const c = s.creature as Creature;
    const big = (s.size - c.size[0]) / Math.max(1, c.size[1] - c.size[0]);
    return 0.35 + c.rarity * 0.12 + big * 0.15;
  }

  private fight(dt: number, held: boolean): FishEvent {
    const s = this.hooked as Swimmer;
    this.fightTime += dt;
    // the fish fights in bursts, and tires
    const tire = 1 - (1 - FISHING.tired) * Math.min(1, this.fightTime / FISHING.stamina);
    const burst = 0.6 + 0.6 * Math.max(0, Math.sin(this.fightTime * 3.1 + s.size)) + (this.rng.next() < 0.02 ? 1.5 : 0);
    this.pullNow = this.strength(s) * burst * tire;
    if (held) {
      // reeling against the fish: a strong one barely comes
      this.distance -= (FISHING.reel - FISHING.pull * this.pullNow * 0.8) * dt;
      this.tension += (FISHING.strain + this.pullNow * 0.6) * dt;
    } else {
      this.distance += FISHING.pull * this.pullNow * dt;
      this.tension -= FISHING.ease * dt;
    }
    this.tension = Math.max(0, this.tension);
    if (this.tension >= 1) return this.lose('snap');
    if (this.distance > this.hookedAt + FISHING.slack) return this.lose('escape');
    if (this.distance <= 18) {
      const c = s.creature as Creature;
      const big = (s.size - c.size[0]) / Math.max(1, c.size[1] - c.size[0]);
      this.score += Math.round(RARITY_POINTS[c.rarity] * (0.6 + 0.8 * big));
      this.catches++;
      this.caught = c;
      this.caughtSize = s.size;
      this.cardTime = 0;
      this.phase = 'card';
      this.hooked = null;
      this.spawn(s, false);
      return 'catch';
    }
    return null;
  }

  private lose(event: 'snap' | 'escape'): FishEvent {
    const s = this.hooked as Swimmer;
    this.hooked = null;
    this.phase = 'aim';
    this.spawn(s, false);
    return event;
  }

  private swim(dt: number): void {
    for (const s of this.swimmers) {
      if (!s.active) {
        this.spawn(s, false);
        continue;
      }
      if (s === this.hooked) continue;
      s.x += s.dir * s.speed * dt;
      // a fish that sees the bait ahead swims toward it
      if (this.phase === 'sink') {
        const dx = this.lureX - s.x;
        const dy = this.lureY - s.y;
        if (dx * s.dir > -4 && Math.abs(dx) < FISHING.notice[0] && Math.abs(dy) < FISHING.notice[1]) {
          s.y += Math.sign(dy) * Math.min(Math.abs(dy), FISHING.lure * dt);
        }
      }
      if (s.x < this.width * 0.22 - 20 || s.x > this.width + 40) this.spawn(s, false);
    }
    for (const j of this.jellies) {
      j.y += j.vy * dt;
      if (j.y < this.depth * 0.1 || j.y > this.depth * 0.85) j.vy = -j.vy;
      j.x -= 3 * dt;
      if (j.x < this.width * 0.3) j.x = this.width - 10;
    }
  }
}

function isHookable(c: Creature): boolean {
  return c.hookable;
}

// ------------------------------------------------------------------ screen

export class FishingScreen extends MiniGame {
  readonly id = 'fishing' as const;
  private readonly trip = new FishingTrip();
  private readonly rng = new Rng(Date.now() >>> 0);
  private readonly cardRect = newRect();
  private seed = 1;
  private castShown = 0;
  private fresh = false;
  private sizeText = '';

  constructor(ctx: Context) {
    super(ctx);
  }

  private get surfaceY(): number {
    const r = this.ctx.r;
    return Math.max(70 + 14 * r.u, Math.round(r.H * 0.26));
  }

  private get floorY(): number {
    const r = this.ctx.r;
    return r.H - Math.max(22, Math.round(r.H * 0.06));
  }

  protected reset(): void {
    this.seed = (this.rng.next() * 0xffffffff) >>> 0;
    this.trip.reset(this.seed, this.ctx.r.W, this.floorY - this.surfaceY, this.ctx.r.env.night);
    this.castShown = 0;
  }

  protected idle(dt: number): void {
    if (this.phase === 'ready') {
      this.trip.step(dt, false, false);
      this.trip.timeLeft = FISHING.session;
    }
  }

  protected step(dt: number, pressed: boolean, held: boolean): void {
    const trip = this.trip;
    const event = trip.step(dt, pressed, held);
    this.score = trip.score;
    if (event === 'cast') this.castShown = 0;
    this.castShown += dt;
    const x = trip.lureX;
    const y = this.surfaceY + trip.lureY - 14;
    const words = t.gameText.fishing;
    if (event === 'bite') this.popup(words.bite, x, y, C.gold);
    else if (event === 'snap') this.popup(words.snap, x, y, C.coral);
    else if (event === 'escape') this.popup(words.escape, x, y, C.skyPale);
    else if (event === 'sting') this.popup(words.sting, x, y, C.rose);
    else if (event === 'catch' && trip.caught) {
      this.fresh = this.ctx.album.catch(trip.caught.id, trip.caughtSize);
      this.sizeText = `${trip.caughtSize} ${t.cm}`;
    }
    if (trip.over) {
      this.overLines.push({ text: `${words.catches} ${trip.catches}`, color: C.gold });
      this.finish(t.timeUp);
    }
  }

  protected draw(): void {
    const r = this.ctx.r;
    const trip = this.trip;
    const surface = this.surfaceY;
    const floor = this.floorY;
    r.seaY = surface;
    r.backdrop(this.clock * 4);
    underwater(r, surface, floor, this.clock, trip.night);
    specks(r, surface + 6, floor, 0, this.clock);
    seaFloor(r, floor, 0, this.clock, trip.night, this.seed % 1000);
    for (const j of trip.jellies) r.creature('jelly', j.x, surface + j.y, Math.floor(this.clock * 2) & 1, false);
    for (const s of trip.swimmers) {
      if (!s.active || !s.creature || s === trip.hooked) continue;
      r.creature(s.creature.id, s.x, surface + s.y, Math.floor(this.clock * 4 + s.size) & 1, s.dir < 0);
    }
    this.fisher(surface);
    r.surfaceFront(this.clock * 4);
  }

  /** BOB or BOBBA on the board, the rod, the line and whatever is on it. */
  private fisher(surface: number): void {
    const r = this.ctx.r;
    const trip = this.trip;
    const frames = this.ctx.actor('fish');
    let f: number = FISH_FRAMES.hold;
    if (trip.phase === 'cast') f = this.castShown < 0.15 ? FISH_FRAMES.back : FISH_FRAMES.throw;
    else if (trip.phase === 'fight') f = this.ctx.input.held && Math.floor(this.clock * 8) % 2 === 0 ? FISH_FRAMES.reel1 : FISH_FRAMES.reel0;
    const bob = Math.round(Math.sin(this.clock * 2));
    const bx = Math.round(r.W * 0.14);
    const fx = bx - ANCHOR_X;
    const fy = surface + 1 + bob - ANCHOR_Y;
    r.ctx.drawImage(frames[f], fx, fy);
    const [tx, ty] = rodTip(f);
    const tipX = fx + tx;
    const tipY = fy + ty;
    const lure = trip.lureX;
    switch (trip.phase) {
      case 'cast': {
        // the lure flies in an arc
        const k = Math.min(1, trip.castTime / FISHING.flight);
        const ly = Math.round(tipY + (surface - tipY) * k - Math.sin(k * Math.PI) * 40);
        r.line(tipX, tipY, lure, ly, C.mist);
        this.hook(lure, ly);
        break;
      }
      case 'sink': {
        const ly = Math.round(surface + trip.lureY);
        r.line(tipX, tipY, lure, surface, C.mist);
        r.fill(C.mist, lure, surface, 1, ly - surface);
        this.float(lure, surface);
        this.hook(lure, ly);
        break;
      }
      case 'fight': {
        // the fish along the line, as far out as the fight says
        const s = trip.hooked;
        if (!s || !s.creature) break;
        const k = Math.min(1.4, trip.distance / trip.hookedAt);
        const fishX = Math.round(tipX + (s.x - tipX) * k);
        const fishY = Math.round(surface + Math.max(6, s.y * Math.min(1, k)) + Math.sin(this.clock * 9) * 2);
        r.line(tipX, tipY, fishX, fishY, trip.tension > 0.75 ? C.coral : C.mist);
        r.creature(s.creature.id, fishX + 6, fishY, Math.floor(this.clock * 10) & 1, true);
        break;
      }
    }
  }

  private float(x: number, y: number): void {
    const r = this.ctx.r;
    r.fill(C.ink, x - 2, y - 4, 5, 5);
    r.fill(C.red, x - 1, y - 3, 3, 2);
    r.fill(C.white, x - 1, y - 1, 3, 1);
  }

  private hook(x: number, y: number): void {
    const r = this.ctx.r;
    r.fill(C.silver, x, y, 1, 3);
    r.fill(C.silver, x - 1, y + 3, 1, 1);
    r.fill(C.rose, x + 1, y + 1, 2, 2);
  }

  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    const trip = this.trip;
    const words = t.gameText.fishing;
    const left = Math.ceil(trip.timeLeft);
    const scale = 2 * u;
    const digits = Math.max(1, digitCount(left));
    r.number(left, digits, Math.round((r.W - r.font.widthOf(digits, scale)) / 2), 6, left <= 10 ? C.coral : C.white, scale);
    const bw = Math.min(r.W - 24, 140 * u);
    const bh = 6 * u;
    const bx = Math.round((r.W - bw) / 2);
    const by = r.H - bh - 10 * u;
    if (trip.phase === 'aim') {
      // cast power
      this.bar(bx, by, bw, bh, trip.power, C.gold);
      r.centered(words.power, r.W / 2, by - (GLYPH_H + 5) * u, C.white, u);
    } else if (trip.phase === 'fight') {
      // tension of the line: let go before it snaps
      const k = trip.tension;
      this.bar(bx, by, bw, bh, k, k > 0.75 ? C.red : k > 0.5 ? C.orange : C.green);
      r.centered(words.tension, r.W / 2, by - (GLYPH_H + 5) * u, k > 0.75 ? C.coral : C.white, u);
    } else if (trip.phase === 'sink' && this.castShown < 3) {
      r.centered(words.sinkHint, r.W / 2, by, C.white, u);
    }
    if (trip.phase === 'card') this.card();
  }

  private bar(x: number, y: number, w: number, h: number, k: number, color: number): void {
    const r = this.ctx.r;
    r.fill(C.ink, x - 2, y - 2, w + 4, h + 4);
    r.fill(C.navy, x, y, w, h);
    r.fill(color, x, y, Math.round(Math.max(0, Math.min(1, k)) * w), h);
  }

  /** The catch: the fish twice its size, its name, its size and rarity. */
  private card(): void {
    const r = this.ctx.r;
    const u = r.u;
    const c = this.trip.caught;
    if (!c) return;
    const art = r.creatures.get(c.id);
    // as big as fits: twice the UI scale for small fish
    let scale = 2 * u;
    while (scale > 1 && art.w * scale > r.W * 0.7) scale--;
    const name = t.creatures[c.id];
    const w = Math.max(art.w * scale + 16, r.font.width(name, 2 * u) + 16 * u, 110 * u);
    const lineH = (GLYPH_H + 4) * u;
    const h = art.h * scale + 2 * lineH + 2 * (GLYPH_H + 4) * u + 18 * u;
    const x = Math.round((r.W - w) / 2);
    const y = Math.round(Math.max(6 + 30 * u, r.H * 0.42 - h / 2));
    r.panel(setRect(this.cardRect, x, y, w, h));
    let cy = y + 5 * u;
    if (this.fresh) r.centered(t.newItem, r.W / 2, cy, C.gold, u);
    cy += lineH;
    r.creature(c.id, r.W / 2, cy + (art.h * scale) / 2, Math.floor(this.clock * 3) & 1, false, scale);
    cy += art.h * scale + 4 * u;
    cy += r.centered(name, r.W / 2, cy, C.sun, 2 * u);
    cy += r.centered(this.sizeText, r.W / 2, cy, C.white, u);
    r.centered(t.rarity[c.rarity], r.W / 2, cy, c.rarity >= 3 ? C.gold : C.skyPale, u);
  }
}

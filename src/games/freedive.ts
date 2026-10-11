import { Rng } from '../core/rng.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { bubble, seaFloor, specks, underwater } from '../render/sea.ts';
import { SWIM_SIZE, swimIndex } from '../sprites/actor.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame } from './kit.ts';
import { RARITY_POINTS, pickCreature, type Creature } from './sealife.ts';
import { treasure, type Treasure } from './treasures.ts';

/** Tuning of the freedive. Pixels, seconds; depth grows downward from the surface (0). */
export const FREEDIVE = {
  dives: 3,
  /** The sea floor, and pixels per meter for the depth shown. */
  floor: 420,
  pxPerMeter: 13,
  /** The current carries everything past at this speed. */
  drift: 18,
  /** Swimming speed kicking down and floating up, and how fast the body turns. */
  kick: 80,
  float: 60,
  turn: 2.4,
  diveAngle: 1.05,
  riseAngle: -0.9,
  /** Oxygen per second: used under water (more when kicking and deeper), refilled at the surface. */
  use: 1 / 32,
  kickUse: 1 / 70,
  deepUse: 0.8,
  breathe: 0.4,
  /** Oxygen lost to a jellyfish or a sea urchin. */
  sting: 0.15,
  /** Points: shells and junk times the depth bonus, creatures seen. */
  shell: 10,
  junk: 15,
  seen: 5,
  newSeen: 30,
  /** Seconds a blackout rescue takes. */
  rescue: 2.2,
  items: 16,
  swimmers: 6,
  jellies: 4,
} as const;

export type ThingKind = 'shell' | 'junk' | 'treasure' | 'urchin';

export interface Thing {
  active: boolean;
  kind: ThingKind;
  /** Treasure or junk id. */
  id: string;
  x: number;
  y: number;
}

export interface Visitor {
  active: boolean;
  creature: Creature | null;
  x: number;
  y: number;
  dir: number;
  seen: boolean;
}

export type DiveEvent = 'shell' | 'junk' | 'treasure' | 'seen' | 'sting' | 'banked' | 'blackout' | null;

/** The dives without drawing: one button, oxygen, and what you find down there. */
export class Freedive {
  /** World x of the diver and depth. */
  x = 0;
  y = 0;
  angle = 0;
  speed = 0;
  oxygen = 1;
  divesLeft: number = FREEDIVE.dives;
  diving = false;
  rescue = 0;
  /** Points of the dive in progress (lost on a blackout) and banked ones. */
  divePoints = 0;
  score = 0;
  bestDepth = 0;
  shells = 0;
  /** What the last event was about. */
  lastId = '';
  lastPoints = 0;
  night = false;
  readonly things: Thing[] = [];
  readonly visitors: Visitor[] = [];
  readonly jellies: Thing[] = [];
  /** Creatures already seen in this run (each counts once). */
  readonly seenIds = new Set<string>();
  private nextThing = 0;
  private nextVisitor = 0;
  private stingCool = 0;
  private readonly rng = new Rng(1);

  constructor() {
    for (let i = 0; i < FREEDIVE.items; i++) this.things.push({ active: false, kind: 'shell', id: '', x: 0, y: 0 });
    for (let i = 0; i < FREEDIVE.swimmers; i++) this.visitors.push({ active: false, creature: null, x: 0, y: 0, dir: 1, seen: false });
    for (let i = 0; i < FREEDIVE.jellies; i++) this.jellies.push({ active: false, kind: 'urchin', id: 'jelly', x: 0, y: 0 });
  }

  reset(seed: number, night: boolean): void {
    this.rng.seed(seed);
    this.night = night;
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.speed = 0;
    this.oxygen = 1;
    this.divesLeft = FREEDIVE.dives;
    this.diving = false;
    this.rescue = 0;
    this.divePoints = 0;
    this.score = 0;
    this.bestDepth = 0;
    this.shells = 0;
    this.seenIds.clear();
    for (const th of this.things) th.active = false;
    for (const v of this.visitors) v.active = false;
    for (const j of this.jellies) j.active = false;
    this.nextThing = 60;
    this.nextVisitor = 80;
    this.stingCool = 0;
  }

  get over(): boolean {
    return this.divesLeft <= 0 && !this.diving && this.rescue <= 0;
  }

  get meters(): number {
    return Math.floor(this.y / FREEDIVE.pxPerMeter);
  }

  /** Points multiply with depth: twice as much on the floor. */
  get depthBonus(): number {
    return 1 + Math.min(1, this.y / FREEDIVE.floor);
  }

  step(dt: number, held: boolean, viewW: number): DiveEvent {
    this.spawn(viewW);
    this.x += FREEDIVE.drift * dt;
    this.stingCool = Math.max(0, this.stingCool - dt);
    this.drift(dt);
    if (this.rescue > 0) {
      // brought back up after a blackout
      this.rescue -= dt;
      this.y = Math.max(0, this.y - (this.y / Math.max(0.1, this.rescue + dt)) * dt);
      this.angle = 0;
      if (this.rescue <= 0) {
        this.y = 0;
        this.oxygen = 0.3;
      }
      return null;
    }
    const canDive = this.divesLeft > 0 || this.diving;
    const target = held && canDive ? FREEDIVE.diveAngle : this.y > 0 ? FREEDIVE.riseAngle : 0;
    const da = target - this.angle;
    this.angle += Math.sign(da) * Math.min(Math.abs(da), FREEDIVE.turn * dt);
    const want = held && canDive ? FREEDIVE.kick : this.y > 0 ? FREEDIVE.float : 0;
    this.speed += (want - this.speed) * Math.min(1, 3 * dt);
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y = Math.min(FREEDIVE.floor - 8, this.y + Math.sin(this.angle) * this.speed * dt);
    if (this.y > 6 && !this.diving) {
      this.diving = true;
      this.divesLeft--;
      this.divePoints = 0;
    }
    if (this.y <= 0) {
      this.y = 0;
      this.oxygen = Math.min(1, this.oxygen + FREEDIVE.breathe * dt);
      if (this.diving) {
        // back at the surface: the dive counts
        this.diving = false;
        this.score += this.divePoints;
        this.lastPoints = this.divePoints;
        this.divePoints = 0;
        return 'banked';
      }
      return null;
    }
    this.bestDepth = Math.max(this.bestDepth, this.meters);
    this.oxygen -= (FREEDIVE.use + (held ? FREEDIVE.kickUse : 0)) * (1 + (this.y / FREEDIVE.floor) * FREEDIVE.deepUse) * dt;
    if (this.oxygen <= 0) {
      this.oxygen = 0;
      this.diving = false;
      this.divePoints = 0;
      this.rescue = FREEDIVE.rescue;
      return 'blackout';
    }
    return this.touch();
  }

  /** Whatever the diver swims into. */
  private touch(): DiveEvent {
    for (const th of this.things) {
      if (!th.active || Math.abs(th.x - this.x) > 10 || Math.abs(th.y - this.y) > 10) continue;
      if (th.kind === 'urchin') {
        if (this.stingCool > 0) continue;
        return this.stung('urchin');
      }
      th.active = false;
      this.lastId = th.id;
      const bonus = this.depthBonus;
      if (th.kind === 'shell') {
        this.shells++;
        this.lastPoints = Math.round(FREEDIVE.shell * bonus);
      } else if (th.kind === 'junk') {
        this.lastPoints = Math.round(FREEDIVE.junk * bonus);
      } else {
        this.lastPoints = (treasure(th.id) as Treasure).value;
      }
      this.divePoints += this.lastPoints;
      return th.kind;
    }
    for (const j of this.jellies) {
      if (j.active && this.stingCool <= 0 && Math.abs(j.x - this.x) < 8 && Math.abs(j.y - this.y) < 10) return this.stung('jelly');
    }
    for (const v of this.visitors) {
      if (!v.active || v.seen || !v.creature || Math.abs(v.x - this.x) > 40 || Math.abs(v.y - this.y) > 26) continue;
      v.seen = true;
      const id = v.creature.id;
      if (this.seenIds.has(id)) continue;
      this.seenIds.add(id);
      this.lastId = id;
      this.lastPoints = FREEDIVE.seen + Math.round(RARITY_POINTS[v.creature.rarity] / 2);
      this.divePoints += this.lastPoints;
      return 'seen';
    }
    return null;
  }

  private stung(id: string): DiveEvent {
    this.oxygen = Math.max(0.01, this.oxygen - FREEDIVE.sting);
    this.stingCool = 1;
    this.lastId = id;
    return 'sting';
  }

  /** Things ahead of the diver, placed as the current brings new water. */
  private spawn(viewW: number): void {
    const ahead = this.x + viewW;
    while (this.nextThing < ahead) {
      const slot = this.free(this.things);
      const x = this.nextThing;
      this.nextThing += this.rng.range(40, 90);
      if (!slot) continue;
      const roll = this.rng.next();
      slot.active = true;
      slot.x = x;
      if (roll < 0.5) {
        slot.kind = 'shell';
        slot.id = 'shell';
        slot.y = FREEDIVE.floor - 6;
      } else if (roll < 0.7) {
        slot.kind = 'junk';
        slot.id = roll < 0.6 ? 'can' : 'boot';
        slot.y = this.rng.range(60, FREEDIVE.floor - 8);
      } else if (roll < 0.78) {
        slot.kind = 'treasure';
        slot.id = roll < 0.75 ? 'coin' : roll < 0.77 ? 'pearl' : 'compass';
        slot.y = FREEDIVE.floor - 7;
      } else {
        slot.kind = 'urchin';
        slot.id = 'urchin';
        slot.y = FREEDIVE.floor - 5;
      }
    }
    while (this.nextVisitor < ahead) {
      const v = this.free(this.visitors);
      const x = this.nextVisitor;
      this.nextVisitor += this.rng.range(90, 170);
      if (!v) continue;
      const depth = 0.08 + 0.9 * this.rng.next();
      const c = pickCreature(this.rng, depth, this.night, swimsFree);
      if (!c) continue;
      v.active = true;
      v.creature = c;
      v.x = x;
      v.y = c.depth[0] >= 1 ? FREEDIVE.floor - 8 : depth * (FREEDIVE.floor - 30) + 10;
      v.dir = this.rng.next() < 0.5 ? -1 : 1;
      v.seen = false;
      // jellyfish drift in the water as a hazard too
      const j = this.free(this.jellies);
      if (j && this.rng.next() < 0.45) {
        j.active = true;
        j.x = x + this.rng.range(30, 80);
        j.y = this.rng.range(40, FREEDIVE.floor - 60);
      }
    }
  }

  private free<T extends { active: boolean }>(list: readonly T[]): T | null {
    for (const it of list) if (!it.active) return it;
    return null;
  }

  private drift(dt: number): void {
    const behind = this.x - 120;
    for (const th of this.things) if (th.active && th.x < behind) th.active = false;
    for (const j of this.jellies) {
      if (!j.active) continue;
      if (j.x < behind) j.active = false;
      j.y += Math.sin(this.x * 0.01 + j.x) * 4 * dt;
    }
    for (const v of this.visitors) {
      if (!v.active || !v.creature) continue;
      v.x += v.dir * v.creature.speed * 0.4 * dt;
      if (v.x < behind || v.x > this.x + 900) v.active = false;
    }
  }
}

function swimsFree(c: Creature): boolean {
  return c.id !== 'jelly';
}

// ------------------------------------------------------------------ screen

export class FreediveScreen extends MiniGame {
  readonly id = 'freedive' as const;
  private readonly dive = new Freedive();
  private readonly rng = new Rng(Date.now() >>> 0);
  private prevX = 0;
  private prevY = 0;
  private viewTop = -60;
  private kick = 0;

  constructor(ctx: Context) {
    super(ctx);
  }

  private get diverX(): number {
    return Math.round(this.ctx.r.W * 0.32);
  }

  protected reset(): void {
    this.dive.reset((this.rng.next() * 0xffffffff) >>> 0, this.ctx.r.env.night);
    this.prevX = 0;
    this.prevY = 0;
    this.viewTop = -Math.round(this.ctx.r.H * 0.35);
  }

  protected idle(dt: number): void {
    if (this.phase !== 'ready') return;
    this.prevX = this.dive.x;
    this.prevY = this.dive.y;
    this.dive.step(dt, false, this.ctx.r.W);
  }

  protected step(dt: number, _pressed: boolean, held: boolean): void {
    const d = this.dive;
    this.prevX = d.x;
    this.prevY = d.y;
    const event = d.step(dt, held, this.ctx.r.W);
    if (held) this.kick += dt * 6;
    this.score = d.score + d.divePoints;
    const x = this.diverX;
    const y = Math.round(d.y - this.viewTop) - 22;
    // a second line of text above the first
    const y2 = y - (GLYPH_H + 4) * this.ctx.r.u;
    const words = t.gameText.freedive;
    switch (event) {
      case 'shell':
      case 'junk':
        this.popup(`+${d.lastPoints}`, x, y, event === 'junk' ? C.aqua : C.white);
        if (event === 'junk') this.popup(words.clean, x, y2, C.aqua);
        break;
      case 'treasure':
        this.popup(`+${d.lastPoints}`, x, y, C.gold);
        if (this.ctx.album.treasure(d.lastId)) this.popup(`${t.newItem} ${t.treasures[d.lastId]}`, x, y2, C.sun);
        break;
      case 'seen': {
        const fresh = this.ctx.album.see(d.lastId);
        this.popup(fresh ? `${t.newItem} ${t.creatures[d.lastId]}` : t.creatures[d.lastId], x, y2, fresh ? C.sun : C.white);
        this.popup(`+${d.lastPoints}`, x, y, C.white);
        break;
      }
      case 'sting':
        this.popup(words.ouch, x, y, C.rose);
        break;
      case 'banked':
        this.popup(`${words.banked} +${d.lastPoints}`, x, y2, C.gold);
        break;
      case 'blackout':
        this.popup(words.blackout, this.ctx.r.W / 2, Math.round(this.ctx.r.H * 0.3), C.coral);
        break;
    }
    if (d.over) {
      this.ctx.album.addShells(d.shells);
      this.overLines.push({ text: `${words.deepest} ${d.bestDepth} M`, color: C.white });
      if (d.shells > 0) this.overLines.push({ text: `${t.shells} +${d.shells}`, color: C.rose });
      this.finish(t.finish);
    }
  }

  protected draw(alpha: number): void {
    const r = this.ctx.r;
    const d = this.dive;
    const wx = this.prevX + (d.x - this.prevX) * alpha;
    const wy = this.prevY + (d.y - this.prevY) * alpha;
    // the camera follows the diver down, with the surface in view while near it
    const total = FREEDIVE.floor + 24;
    const want = Math.min(total - r.H, Math.max(-Math.round(r.H * 0.35), wy - r.H * 0.42));
    this.viewTop += (want - this.viewTop) * 0.12;
    const top = Math.round(this.viewTop);
    const surface = -top;
    const scroll = wx - this.diverX;
    if (surface > 0) {
      r.seaY = surface;
      r.backdrop(scroll * 0.5);
    }
    const waterTop = Math.max(0, surface);
    underwater(r, waterTop, r.H, this.clock, d.night, Math.max(0, top) / total, (top + r.H) / total);
    specks(r, waterTop, r.H, scroll, this.clock);
    const floorY = FREEDIVE.floor - top;
    if (floorY < r.H + 20) seaFloor(r, floorY, scroll, this.clock, d.night, 7);
    for (const th of d.things) {
      if (!th.active) continue;
      const sx = Math.round(th.x - scroll);
      const sy = Math.round(th.y - top);
      if (sx < -20 || sx > r.W + 20 || sy < -20 || sy > r.H + 20) continue;
      if (th.kind === 'shell') this.shell(sx, sy);
      else if (th.kind === 'urchin') this.urchin(sx, sy);
      else r.treasure(th.id, sx, sy);
    }
    for (const v of d.visitors) {
      if (!v.active || !v.creature) continue;
      const sx = v.x - scroll;
      const sy = v.y - top;
      if (sx < -40 || sx > r.W + 40 || sy < -30 || sy > r.H + 30) continue;
      r.creature(v.creature.id, sx, sy, Math.floor(this.clock * 3 + v.x) & 1, v.dir < 0);
    }
    for (const j of d.jellies) {
      if (j.active) r.creature('jelly', j.x - scroll, j.y - top, Math.floor(this.clock * 2) & 1, false);
    }
    // the diver, and bubbles from the snorkel while under water
    const frames = this.ctx.actor('swim');
    const angle = d.rescue > 0 ? -0.6 : d.y <= 0 ? 0 : d.angle;
    const f = frames[swimIndex(angle, Math.floor(this.kick))];
    const dy = Math.round(wy - top);
    r.ctx.drawImage(f, this.diverX - SWIM_SIZE / 2, dy - SWIM_SIZE / 2);
    if (d.y > 4) {
      for (let i = 0; i < 3; i++) {
        const k = (this.clock * 0.8 + i / 3) % 1;
        bubble(r, this.diverX + 18 + Math.sin(k * 9 + i) * 2, dy - 8 - k * 40, i === 0 ? 2 : 1);
      }
    }
    if (surface > 0) r.surfaceFront(scroll);
  }

  private shell(x: number, y: number): void {
    const r = this.ctx.r;
    r.fill(C.ink, x - 4, y - 3, 9, 5);
    r.fill(C.rose, x - 3, y - 2, 7, 3);
    r.fill(C.white, x - 2, y - 2, 1, 2);
    r.fill(C.white, x, y - 2, 1, 2);
    r.fill(C.white, x + 2, y - 2, 1, 2);
    r.fill(C.coral, x - 1, y + 1, 3, 1);
  }

  private urchin(x: number, y: number): void {
    const r = this.ctx.r;
    r.fill(C.violet, x - 3, y - 3, 7, 5);
    r.fill(C.ink, x - 6, y - 1, 13, 1);
    r.fill(C.ink, x, y - 7, 1, 13);
    r.fill(C.ink, x - 4, y - 5, 1, 2);
    r.fill(C.ink, x + 4, y - 5, 1, 2);
    r.fill(C.mauve, x - 1, y - 2, 2, 1);
  }

  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    const d = this.dive;
    const words = t.gameText.freedive;
    // oxygen at the top, with the breaths left
    const w = Math.min(120 * u, r.W - 140 * u);
    const x = Math.round((r.W - w) / 2);
    const y = 6 + 2 * u;
    const low = d.oxygen < 0.25;
    r.fill(C.ink, x - 2, y - 2, w + 4, 5 * u + 4);
    r.fill(C.navy, x, y, w, 5 * u);
    r.fill(low && Math.floor(this.clock * 6) % 2 === 0 ? C.coral : C.aqua, x, y, Math.round(d.oxygen * w), 5 * u);
    r.text(words.o2, x - r.font.width(words.o2, u) - 4 * u, y - u, C.white, u);
    for (let i = 0; i < FREEDIVE.dives; i++) {
      const used = i >= d.divesLeft + (d.diving ? 1 : 0);
      const bx = x + w + 6 * u + i * 7 * u;
      r.fill(C.ink, bx - 1, y - 1, 5 * u + 2, 5 * u + 2);
      r.fill(used ? C.slate : d.diving && i === d.divesLeft ? C.gold : C.aqua, bx, y, 5 * u, 5 * u);
    }
    // depth under the bar
    const m = d.meters;
    const ty = y + 5 * u + 4 * u;
    const mx = Math.round(r.W / 2 - ((digitCount(m) + 2) * 6 * u) / 2);
    r.number(m, digitCount(m), mx, ty, C.white, u);
    r.text('M', mx + (digitCount(m) + 1) * 6 * u, ty, C.white, u);
    if (d.y <= 0 && d.divesLeft > 0 && this.time < 3) r.centered(words.hint, r.W / 2, ty + (GLYPH_H + 5) * u, C.sun, u);
  }
}

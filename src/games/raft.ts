import { Rng } from '../core/rng.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect, type Rect, type Sky } from '../render/renderer.ts';
import { specks, underwater } from '../render/sea.ts';
import { STAND_FRAMES } from '../sprites/actor.ts';
import { ANCHOR_X, ANCHOR_Y } from '../sprites/compose.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame } from './kit.ts';

/** Tuning of the raft. Pixels and seconds; x is measured from the middle of the raft. */
export const RAFT = {
  startTiles: 3,
  maxTiles: 9,
  tileW: 14,
  /** The current brings debris from the right at this speed (faster with the sail). */
  current: 22,
  sailBoost: 1.5,
  /** Seconds for the throw to charge, and how far a throw reaches. */
  charge: 1.1,
  reach: [26, 230] as const,
  flight: 0.45,
  /** The hook comes back at this speed and grabs what is this close. */
  pull: 85,
  grab: 11,
  /** Seconds between new pieces of debris. */
  every: [1.4, 2.6] as const,
  /** A day, and the days to survive until a ship comes. */
  day: 40,
  days: 5,
  /** Seconds the shark stays away (first day, last day), circles, and bites before a plank breaks. */
  sharkAway: [16, 8] as const,
  sharkCircle: 2.5,
  sharkBite: [3, 1.7] as const,
  /** Points: each material, each plank built, each day survived. */
  material: 5,
  tilePoints: 25,
  dayPoints: 100,
  costs: {
    tile: { wood: 4, plastic: 0 },
    net: { wood: 3, plastic: 3 },
    sail: { wood: 5, plastic: 3 },
  },
} as const;

export type DebrisKind = 'plank' | 'bottle' | 'barrel' | 'crate';
export type Build = keyof typeof RAFT.costs;
export const BUILDS: readonly Build[] = ['tile', 'net', 'sail'];

/** What each piece of debris gives. */
const YIELD: Record<DebrisKind, { wood: number; plastic: number }> = {
  plank: { wood: 1, plastic: 0 },
  bottle: { wood: 0, plastic: 1 },
  barrel: { wood: 2, plastic: 1 },
  crate: { wood: 2, plastic: 0 },
};

export interface Debris {
  active: boolean;
  kind: DebrisKind;
  x: number;
  /** On the hook, coming in. */
  hooked: boolean;
}

export type HookState = 'idle' | 'charge' | 'fly' | 'pull';
export type SharkState = 'away' | 'circle' | 'bite' | 'flee';
export type RaftEvent = 'catch' | 'net' | 'repel' | 'broke' | 'day' | 'built' | null;

/** The survival without drawing: hook debris, build, keep the shark away. */
export class RaftLife {
  tiles: number = RAFT.startTiles;
  wood = 0;
  plastic = 0;
  net = false;
  sail = false;
  hook: HookState = 'idle';
  power = 0;
  private powerDir = 1;
  hookX = 0;
  private flyFrom = 0;
  private flyTo = 0;
  private flyTime = 0;
  shark: SharkState = 'away';
  sharkTime = 0;
  /** +1 bites the right end of the raft, -1 the left end. */
  sharkSide = 1;
  time = 0;
  day = 1;
  score = 0;
  over = false;
  rescued = false;
  /** Materials of the last catch, for the popup. */
  gotWood = 0;
  gotPlastic = 0;
  readonly debris: Debris[] = [];
  private wait = 0;
  private readonly rng = new Rng(1);

  constructor() {
    for (let i = 0; i < 10; i++) this.debris.push({ active: false, kind: 'plank', x: 0, hooked: false });
  }

  reset(seed: number): void {
    this.rng.seed(seed);
    this.tiles = RAFT.startTiles;
    this.wood = 0;
    this.plastic = 0;
    this.net = false;
    this.sail = false;
    this.hook = 'idle';
    this.power = 0;
    this.powerDir = 1;
    this.hookX = 0;
    this.shark = 'away';
    this.sharkTime = this.awayTime();
    this.time = 0;
    this.day = 1;
    this.score = 0;
    this.over = false;
    this.rescued = false;
    for (const d of this.debris) d.active = false;
    this.wait = 0.5;
  }

  /** Half the raft's length. */
  get half(): number {
    return (this.tiles * RAFT.tileW) / 2;
  }

  /** How far into the days, 0..1 (the shark gets bolder). */
  private get bold(): number {
    return Math.min(1, (this.day - 1) / (RAFT.days - 1));
  }

  private awayTime(): number {
    return RAFT.sharkAway[0] + (RAFT.sharkAway[1] - RAFT.sharkAway[0]) * this.bold + this.rng.range(0, 4);
  }

  canBuild(b: Build): boolean {
    if (b === 'tile' && this.tiles >= RAFT.maxTiles) return false;
    if ((b === 'net' && this.net) || (b === 'sail' && this.sail)) return false;
    const c = RAFT.costs[b];
    return this.wood >= c.wood && this.plastic >= c.plastic;
  }

  build(b: Build): boolean {
    if (!this.canBuild(b)) return false;
    const c = RAFT.costs[b];
    this.wood -= c.wood;
    this.plastic -= c.plastic;
    if (b === 'tile') {
      this.tiles++;
      this.score += RAFT.tilePoints;
    } else if (b === 'net') {
      this.net = true;
    } else {
      this.sail = true;
    }
    return true;
  }

  /** `viewRight`: how far right of the raft the screen reaches, where debris appears. */
  step(dt: number, pressed: boolean, held: boolean, viewRight: number): RaftEvent {
    if (this.over) return null;
    this.time += dt;
    let event: RaftEvent = null;
    if (this.time >= this.day * RAFT.day) {
      this.day++;
      this.score += RAFT.dayPoints;
      if (this.day > RAFT.days) {
        this.over = true;
        this.rescued = true;
        return 'day';
      }
      event = 'day';
    }
    const current = RAFT.current * (this.sail ? RAFT.sailBoost : 1);
    // new debris from the right
    this.wait -= dt * (this.sail ? RAFT.sailBoost : 1);
    if (this.wait <= 0) {
      this.spawn(viewRight);
      this.wait = this.rng.range(RAFT.every[0], RAFT.every[1]);
    }
    for (const d of this.debris) {
      if (!d.active || d.hooked) continue;
      d.x -= current * dt;
      // the net behind the raft catches what drifts into it
      if (this.net && d.x < -this.half && d.x > -this.half - 6 && d.kind !== 'barrel') {
        d.active = false;
        this.collect(d.kind);
        event = 'net';
      }
      if (d.x < -viewRight) d.active = false;
    }
    // the shark: away, circling, biting
    const biting = this.shark === 'bite';
    if (biting && pressed) {
      this.shark = 'flee';
      this.sharkTime = 1.2;
      return 'repel';
    }
    this.sharkTime -= dt;
    if (this.sharkTime <= 0) {
      switch (this.shark) {
        case 'away':
          this.shark = 'circle';
          this.sharkTime = RAFT.sharkCircle;
          this.sharkSide = this.rng.next() < 0.5 ? -1 : 1;
          break;
        case 'circle':
          this.shark = 'bite';
          this.sharkTime = RAFT.sharkBite[0] + (RAFT.sharkBite[1] - RAFT.sharkBite[0]) * this.bold;
          break;
        case 'bite':
          this.tiles--;
          this.shark = 'flee';
          this.sharkTime = 1.2;
          if (this.tiles <= 0) {
            this.tiles = 0;
            this.over = true;
          }
          return 'broke';
        case 'flee':
          this.shark = 'away';
          this.sharkTime = this.awayTime();
          break;
      }
    }
    return this.throwing(dt, held && !biting) ?? event;
  }

  private throwing(dt: number, held: boolean): RaftEvent {
    switch (this.hook) {
      case 'idle':
        if (held) {
          this.hook = 'charge';
          this.power = 0;
          this.powerDir = 1;
        }
        return null;
      case 'charge':
        if (held) {
          this.power += (this.powerDir * dt) / RAFT.charge;
          if (this.power >= 1) {
            this.power = 1;
            this.powerDir = -1;
          } else if (this.power <= 0) {
            this.power = 0;
            this.powerDir = 1;
          }
          return null;
        }
        // let go: throw
        this.hook = 'fly';
        this.flyFrom = this.half;
        this.flyTo = this.reachOf(this.power);
        this.flyTime = 0;
        this.hookX = this.flyFrom;
        return null;
      case 'fly':
        this.flyTime += dt;
        this.hookX = this.flyFrom + (this.flyTo - this.flyFrom) * Math.min(1, this.flyTime / RAFT.flight);
        if (this.flyTime >= RAFT.flight) this.hook = 'pull';
        return null;
      case 'pull': {
        this.hookX -= RAFT.pull * dt;
        for (const d of this.debris) {
          if (!d.active) continue;
          if (!d.hooked && Math.abs(d.x - this.hookX) < RAFT.grab) d.hooked = true;
          if (d.hooked) d.x = this.hookX + 4;
        }
        if (this.hookX > this.half) return null;
        this.hook = 'idle';
        this.gotWood = 0;
        this.gotPlastic = 0;
        let caught = false;
        for (const d of this.debris) {
          if (!d.active || !d.hooked) continue;
          d.active = false;
          this.collect(d.kind);
          caught = true;
        }
        return caught ? 'catch' : null;
      }
    }
  }

  /** Where a throw with this power lands (from the middle of the raft). */
  reachOf(power: number): number {
    return this.half + RAFT.reach[0] + power * (RAFT.reach[1] - RAFT.reach[0]);
  }

  private collect(kind: DebrisKind): void {
    const y = YIELD[kind];
    this.wood += y.wood;
    this.plastic += y.plastic;
    this.gotWood += y.wood;
    this.gotPlastic += y.plastic;
    this.score += (y.wood + y.plastic) * RAFT.material;
  }

  private spawn(viewRight: number): void {
    for (const d of this.debris) {
      if (d.active) continue;
      const roll = this.rng.next();
      d.active = true;
      d.hooked = false;
      d.kind = roll < 0.45 ? 'plank' : roll < 0.75 ? 'bottle' : roll < 0.9 ? 'crate' : 'barrel';
      d.x = viewRight + 10;
      return;
    }
  }
}

// ------------------------------------------------------------------ screen

export class RaftScreen extends MiniGame {
  readonly id = 'raft' as const;
  private readonly life = new RaftLife();
  private readonly rng = new Rng(Date.now() >>> 0);
  private readonly buildRects: Rect[] = [newRect(), newRect(), newRect()];
  private readonly labels: string[] = ['', '', ''];
  private throwShown = 9;

  constructor(ctx: Context) {
    super(ctx);
    const words = t.gameText.raft;
    for (let i = 0; i < BUILDS.length; i++) {
      const c = RAFT.costs[BUILDS[i]];
      const name = BUILDS[i] === 'tile' ? words.tile : BUILDS[i] === 'net' ? words.net : words.sail;
      this.labels[i] = `${name} ${c.wood}${words.w}${c.plastic ? ` ${c.plastic}${words.p}` : ''}`;
    }
  }

  private get raftX(): number {
    return Math.round(this.ctx.r.W * 0.36);
  }

  private get surfaceY(): number {
    const r = this.ctx.r;
    return Math.round(Math.min(r.seaY, r.H * 0.6));
  }

  protected reset(): void {
    this.life.reset((this.rng.next() * 0xffffffff) >>> 0);
    this.throwShown = 9;
  }

  protected onKey(code: string): void {
    const i = code === 'Digit1' ? 0 : code === 'Digit2' ? 1 : code === 'Digit3' ? 2 : -1;
    if (i >= 0 && this.phase === 'running') this.tryBuild(i);
  }

  protected onTap(x: number, y: number): boolean {
    for (let i = 0; i < this.buildRects.length; i++) {
      if (inside(this.buildRects[i], x, y)) {
        this.tryBuild(i);
        return true;
      }
    }
    return false;
  }

  private tryBuild(i: number): void {
    if (this.life.build(BUILDS[i])) this.popup(t.gameText.raft.built, this.raftX, this.surfaceY - 60, C.gold);
  }

  protected step(dt: number, pressed: boolean, held: boolean): void {
    const life = this.life;
    const before = life.hook;
    const event = life.step(dt, pressed, held, this.ctx.r.W - this.raftX);
    if (before === 'charge' && life.hook === 'fly') this.throwShown = 0;
    this.throwShown += dt;
    this.score = life.score;
    const words = t.gameText.raft;
    const x = this.raftX;
    const y = this.surfaceY - 62;
    switch (event) {
      case 'catch':
      case 'net':
        this.popup(`+${life.gotWood}${words.w} +${life.gotPlastic}${words.p}`, event === 'net' ? x - life.half : x, y, C.white);
        break;
      case 'repel':
        this.popup(words.repel, x, y - 12, C.gold);
        break;
      case 'broke':
        this.popup(words.broke, this.ctx.r.W / 2, y - 24, C.coral);
        break;
      case 'day':
        if (!life.over) this.popup(`${words.day} ${life.day}`, this.ctx.r.W / 2, y - 24, C.sun);
        break;
    }
    if (life.over) {
      this.overLines.push({ text: `${words.days} ${Math.min(life.day, RAFT.days)}`, color: C.white });
      this.finish(life.rescued ? words.rescued : words.sunk);
    }
  }

  private get sky(): Sky {
    const k = (this.life.time % RAFT.day) / RAFT.day;
    return k < 0.55 ? 'day' : k < 0.75 ? 'sunset' : k < 0.92 ? 'night' : 'dawn';
  }

  protected draw(): void {
    const r = this.ctx.r;
    const life = this.life;
    const surface = this.surfaceY;
    const sky = this.sky;
    r.seaY = surface;
    r.backdrop(life.time * RAFT.current * (life.sail ? RAFT.sailBoost : 1), sky);
    underwater(r, surface + 4, r.H, this.clock, sky === 'night', 0, 0.5);
    specks(r, surface + 6, r.H, life.time * 22, this.clock);
    const rx = this.raftX;
    if (life.net) this.drawNet(rx - life.half, surface);
    this.drawShark(rx, surface);
    for (const d of life.debris) if (d.active) this.drawDebris(d.kind, rx + Math.round(d.x), surface);
    this.drawRaft(rx, surface);
    r.surfaceFront(life.time * 22);
  }

  private drawRaft(rx: number, sea: number): void {
    const r = this.ctx.r;
    const life = this.life;
    const bob = Math.round(Math.sin(this.clock * 2));
    const x0 = rx - Math.round(life.half);
    const y = sea - 3 + bob;
    for (let i = 0; i < life.tiles; i++) {
      const x = x0 + i * RAFT.tileW;
      const edge = (life.sharkSide > 0 ? i === life.tiles - 1 : i === 0) && life.shark === 'bite';
      r.fill(C.ink, x, y - 1, RAFT.tileW, 6);
      r.fill(edge && Math.floor(this.clock * 8) % 2 === 0 ? C.orange : C.brown, x + 1, y, RAFT.tileW - 2, 4);
      r.fill(C.tan, x + 1, y, RAFT.tileW - 2, 1);
      r.fill(C.gold, x + 3, y + 1, 1, 3);
      if (edge) r.fill(C.ink, x + 6, y + 1, 1, 3);
    }
    if (life.sail) {
      // a mast with a patched sail
      const mx = x0 + 6;
      r.fill(C.ink, mx - 1, y - 52, 3, 52);
      r.fill(C.brown, mx, y - 51, 1, 50);
      for (let j = 0; j < 36; j++) {
        const w = Math.round(4 + j * 0.55);
        r.fill(C.ink, mx + 2, y - 50 + j, w + 1, 1);
        r.fill(j % 9 === 4 ? C.tan : C.mist, mx + 2, y - 50 + j, w, 1);
      }
    }
    // BOB or BOBBA on the raft
    const frames = this.ctx.actor('stand');
    const h = life.hook;
    const f =
      h === 'charge' ? STAND_FRAMES.wind : this.throwShown < 0.3 ? STAND_FRAMES.throw : h === 'pull' ? (Math.floor(this.clock * 6) % 2 === 0 ? STAND_FRAMES.pull0 : STAND_FRAMES.pull1) : STAND_FRAMES.idle;
    const fx = rx + 2 - ANCHOR_X;
    const fy = y - 1 - ANCHOR_Y;
    r.ctx.drawImage(frames[f], fx, fy);
    // the rope out to the hook
    if (h === 'fly' || h === 'pull') {
      const hx = rx + Math.round(life.hookX);
      const hy = h === 'fly' ? Math.round(sea - 2 - Math.sin(Math.min(1, (this.throwShown / RAFT.flight) * 1) * Math.PI) * 30) : sea + 1;
      r.line(rx + 14, y - 26, hx, hy, C.tan);
      r.fill(C.ink, hx - 2, hy - 2, 5, 5);
      r.fill(C.silver, hx - 1, hy - 1, 3, 3);
    }
  }

  private drawNet(x: number, sea: number): void {
    const r = this.ctx.r;
    for (let j = 0; j < 14; j += 3) r.fill(C.forest, x - 10, sea + j, 10, 1);
    for (let i = 0; i <= 10; i += 3) r.fill(C.forest, x - 10 + i, sea, 1, 14);
    r.fill(C.orange, x - 11, sea - 2, 3, 3);
  }

  private drawShark(rx: number, sea: number): void {
    const r = this.ctx.r;
    const life = this.life;
    if (life.shark === 'away') return;
    if (life.shark === 'circle' || life.shark === 'flee') {
      // the fin cutting the water around the raft
      const k = life.shark === 'flee' ? 1 + (1.2 - life.sharkTime) * 2 : 1;
      const fx = Math.round(rx + Math.cos(this.clock * 1.6) * (life.half + 40) * k);
      const left = Math.sin(this.clock * 1.6) > 0;
      r.fill(C.ink, fx - 4, sea - 9, 9, 9);
      r.fill(C.slate, fx - 3, sea - 8, 7, 8);
      r.fill(C.grey, left ? fx - 3 : fx + 1, sea - 8, 2, 8);
      r.fill(C.white, fx - 6, sea, 13, 1);
      return;
    }
    // biting the end of the raft: the shark under it, splashes around
    const side = life.sharkSide;
    const ex = rx + Math.round(side * (life.half + 14));
    r.creature('shark', ex, sea + 10, Math.floor(this.clock * 10) & 1, side > 0);
    for (let i = 0; i < 5; i++) r.fill(C.white, ex - 8 + i * 4, sea - 2 - ((i + Math.floor(this.clock * 12)) % 3), 2, 1);
  }

  private drawDebris(kind: DebrisKind, x: number, sea: number): void {
    const r = this.ctx.r;
    const y = sea + Math.round(Math.sin(this.clock * 2 + x * 0.1));
    switch (kind) {
      case 'plank':
        r.fill(C.ink, x - 9, y - 3, 18, 5);
        r.fill(C.tan, x - 8, y - 2, 16, 3);
        r.fill(C.brown, x - 8, y, 16, 1);
        break;
      case 'bottle':
        r.fill(C.ink, x - 5, y - 4, 10, 5);
        r.fill(C.sky, x - 4, y - 3, 7, 3);
        r.fill(C.white, x + 3, y - 3, 1, 1);
        r.fill(C.red, x + 4, y - 3, 1, 3);
        break;
      case 'crate':
        r.fill(C.ink, x - 7, y - 9, 14, 11);
        r.fill(C.brown, x - 6, y - 8, 12, 9);
        r.fill(C.tan, x - 6, y - 8, 12, 1);
        r.fill(C.tan, x - 1, y - 7, 2, 8);
        break;
      case 'barrel':
        r.fill(C.ink, x - 6, y - 11, 12, 13);
        r.fill(C.red, x - 5, y - 10, 10, 11);
        r.fill(C.silver, x - 5, y - 8, 10, 1);
        r.fill(C.silver, x - 5, y - 3, 10, 1);
        r.fill(C.coral, x - 4, y - 10, 2, 11);
        break;
    }
  }

  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    const life = this.life;
    const words = t.gameText.raft;
    // day, top middle
    r.centered(words.day, r.W / 2 - 4 * u, 6 + u, C.sun, u);
    r.number(life.day, digitCount(life.day), Math.round(r.W / 2 + r.font.width(words.day, u) / 2), 6 + u, C.sun, u);
    // materials under the pause button
    const y = 6 + (GLYPH_H + 9) * u;
    r.fill(C.ink, 6, y, 6 * u + 2, 6 * u + 2);
    r.fill(C.brown, 7, y + 1, 6 * u, 6 * u);
    r.fill(C.tan, 7, y + 1, 6 * u, u);
    r.number(life.wood, digitCount(life.wood), 10 + 7 * u, y + u, C.white, u);
    const y2 = y + 9 * u;
    r.fill(C.ink, 6, y2, 6 * u + 2, 6 * u + 2);
    r.fill(C.sky, 7, y2 + 1, 6 * u, 6 * u);
    r.fill(C.white, 7 + 4 * u, y2 + 2, u, u);
    r.number(life.plastic, digitCount(life.plastic), 10 + 7 * u, y2 + u, C.white, u);
    // throw power
    if (life.hook === 'charge') {
      const w = 40 * u;
      const bx = this.raftX - w / 2;
      const by = this.surfaceY - 74;
      r.fill(C.ink, bx - 1, by - 1, w + 2, 3 * u + 2);
      r.fill(C.navy, bx, by, w, 3 * u);
      r.fill(C.gold, bx, by, Math.round(life.power * w), 3 * u);
      // where it will land
      const lx = this.raftX + Math.round(life.reachOf(life.power));
      r.fill(C.gold, lx - u, this.surfaceY - 6, 2 * u + 1, 3 * u);
    }
    // the three things to build, at the bottom
    const h = (GLYPH_H + 7) * u;
    const gap = 3 * u;
    const bw = Math.floor((r.W - 12 - 2 * gap) / 3);
    const bwFit = Math.min(bw, 100 * u);
    const x0 = Math.round((r.W - (3 * bwFit + 2 * gap)) / 2);
    const by = r.H - h - 6;
    for (let i = 0; i < BUILDS.length; i++) {
      const can = life.canBuild(BUILDS[i]);
      const done = (BUILDS[i] === 'net' && life.net) || (BUILDS[i] === 'sail' && life.sail);
      r.button(setRect(this.buildRects[i], x0 + i * (bwFit + gap), by, bwFit, h), this.labels[i], can ? 'primary' : done ? 'ghost' : 'normal', u);
    }
    if (this.time < 5) r.centered(words.hint, r.W / 2, by - (GLYPH_H + 6) * u, C.white, u);
    if (life.shark === 'bite' && Math.floor(this.clock * 5) % 2 === 0) {
      // tell what to do: hit the shark
      const sx = this.raftX + Math.round(life.sharkSide * (life.half + 14));
      r.centered(r.touch ? t.tutorial.tap : t.tutorial.space, sx, this.surfaceY - 30 - 10 * u, C.coral, u);
    }
  }
}

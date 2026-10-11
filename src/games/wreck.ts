import { Rng } from '../core/rng.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { seaFloor, specks, underwater } from '../render/sea.ts';
import { STAND_FRAMES } from '../sprites/actor.ts';
import { ANCHOR_X, ANCHOR_Y } from '../sprites/compose.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame } from './kit.ts';
import type { Rarity } from './sealife.ts';
import { TREASURES, treasureRaster, type Treasure } from './treasures.ts';

/** Tuning of the wreck hook. Times in seconds; positions in pixels. */
export const WRECK = {
  time: 60,
  /** Seconds for the boat to cross the whole width. */
  cross: 7,
  /** Seconds for the hook to drop the whole depth. */
  drop: 1.4,
  /** Seconds to haul the hook up the whole depth, by weight (0 = empty). */
  haul: [0.9, 1.2, 1.9, 2.8] as const,
  /** Chance that a badly aligned grab slips, by weight. */
  slip: [0, 0, 0.3, 0.5] as const,
  /** A new item appears this long after one is taken. */
  respawn: 2.5,
  /** Deck of the wreck above the floor, and its holes into the hull (fractions of the width). */
  deck: 30,
  wreck: [0.44, 0.86] as const,
  holes: [
    [0.54, 0.615],
    [0.7, 0.755],
  ] as const,
} as const;

export type SpotKind = 'floor' | 'deck' | 'inside';

interface Spot {
  /** Fraction of the width. */
  rx: number;
  kind: SpotKind;
}

/** Where things lie: on the sand, on the wreck's deck, and inside the hull below the holes. */
const SPOTS: readonly Spot[] = [
  { rx: 0.1, kind: 'floor' },
  { rx: 0.2, kind: 'floor' },
  { rx: 0.31, kind: 'floor' },
  { rx: 0.4, kind: 'floor' },
  { rx: 0.92, kind: 'floor' },
  { rx: 0.49, kind: 'deck' },
  { rx: 0.66, kind: 'deck' },
  { rx: 0.81, kind: 'deck' },
  { rx: 0.578, kind: 'inside' },
  { rx: 0.728, kind: 'inside' },
];

/** What each kind of spot holds: rare things hide in the hull. */
const POOLS: Record<SpotKind, readonly string[]> = {
  floor: ['coin', 'bottle', 'anchor', 'compass', 'spyglass', 'amphora', 'boot', 'can', 'net'],
  deck: ['coin', 'bell', 'amphora', 'spyglass', 'compass', 'chest', 'can'],
  inside: ['pearl', 'chest', 'crown', 'compass', 'coin'],
};
const WEIGHT: Record<Rarity, number> = { 1: 10, 2: 5, 3: 2.2, 4: 0.8 };

const BY_ID = new Map(TREASURES.map((tr) => [tr.id, tr]));
/** Sprite sizes, so what you see is what the hook can grab. */
const SIZE = new Map(TREASURES.map((tr) => [tr.id, treasureRaster(tr.id)]));

export interface Item {
  active: boolean;
  id: string;
  /** Center x and the y of its bottom (depth from the surface). */
  x: number;
  bottom: number;
  w: number;
  h: number;
  /** Seconds until it appears again, when taken. */
  wait: number;
}

export type HookState = 'idle' | 'down' | 'up';
export type HaulEvent = 'grab' | 'slip' | 'miss' | 'catch' | null;

/** The game itself, without drawing: the boat sweeps, the hook drops, things come up. */
export class WreckHaul {
  width = 480;
  depth = 180;
  hookX = 40;
  hookY = 0;
  dir = 1;
  state: HookState = 'idle';
  carried: Treasure | null = null;
  timeLeft: number = WRECK.time;
  score = 0;
  hauled = 0;
  treasures = 0;
  /** The last thing brought up. */
  last: Treasure | null = null;
  readonly items: Item[] = [];
  private readonly rng = new Rng(1);

  constructor() {
    for (let i = 0; i < SPOTS.length; i++) this.items.push({ active: false, id: 'coin', x: 0, bottom: 0, w: 0, h: 0, wait: 0 });
  }

  reset(seed: number, width: number, depth: number): void {
    this.rng.seed(seed);
    this.width = width;
    this.depth = depth;
    this.hookX = width * 0.08;
    this.hookY = 0;
    this.dir = 1;
    this.state = 'idle';
    this.carried = null;
    this.timeLeft = WRECK.time;
    this.score = 0;
    this.hauled = 0;
    this.treasures = 0;
    this.last = null;
    for (let i = 0; i < SPOTS.length; i++) this.place(i);
  }

  /** The screen changed size: keep everything in the same place relative to it. */
  resize(width: number, depth: number): void {
    if (width === this.width && depth === this.depth) return;
    const kx = width / this.width;
    const ky = depth / this.depth;
    this.hookX *= kx;
    this.hookY *= ky;
    this.width = width;
    this.depth = depth;
    for (let i = 0; i < SPOTS.length; i++) {
      const it = this.items[i];
      it.x = SPOTS[i].rx * width;
      it.bottom = this.restY(SPOTS[i].kind);
    }
  }

  get over(): boolean {
    return this.timeLeft <= 0 && this.state === 'idle';
  }

  /** Depth of the surface something rests on. */
  restY(kind: SpotKind): number {
    return kind === 'deck' ? this.depth - WRECK.deck : this.depth;
  }

  /** Depth where the hook stops when it hits nothing: the sand, or the deck except over its holes. */
  bottomAt(x: number): number {
    const rx = x / this.width;
    if (rx < WRECK.wreck[0] || rx > WRECK.wreck[1]) return this.depth;
    for (const [a, b] of WRECK.holes) if (rx > a && rx < b) return this.depth;
    return this.depth - WRECK.deck;
  }

  private place(i: number): void {
    const spot = SPOTS[i];
    const pool = POOLS[spot.kind];
    let total = 0;
    for (const id of pool) total += WEIGHT[(BY_ID.get(id) as Treasure).rarity];
    let roll = this.rng.next() * total;
    let id = pool[0];
    for (const p of pool) {
      roll -= WEIGHT[(BY_ID.get(p) as Treasure).rarity];
      if (roll <= 0) {
        id = p;
        break;
      }
    }
    const size = SIZE.get(id);
    const it = this.items[i];
    it.active = true;
    it.id = id;
    it.x = spot.rx * this.width;
    it.bottom = this.restY(spot.kind);
    it.w = size ? size.w : 10;
    it.h = size ? size.h : 10;
    it.wait = 0;
  }

  step(dt: number, pressed: boolean): HaulEvent {
    if (this.timeLeft > 0) this.timeLeft = Math.max(0, this.timeLeft - dt);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.active || it.wait <= 0) continue;
      it.wait -= dt;
      if (it.wait <= 0) this.place(i);
    }
    switch (this.state) {
      case 'idle': {
        const speed = this.width / WRECK.cross;
        this.hookX += this.dir * speed * dt;
        const lo = this.width * 0.05;
        const hi = this.width * 0.95;
        if (this.hookX < lo) {
          this.hookX = lo;
          this.dir = 1;
        } else if (this.hookX > hi) {
          this.hookX = hi;
          this.dir = -1;
        }
        if (pressed && this.timeLeft > 0) this.state = 'down';
        return null;
      }
      case 'down': {
        this.hookY += (this.depth / WRECK.drop) * dt;
        for (const it of this.items) {
          if (!it.active || Math.abs(this.hookX - it.x) > it.w / 2 + 1 || this.hookY < it.bottom - it.h) continue;
          // touched something: does the claw hold it?
          const tr = BY_ID.get(it.id) as Treasure;
          const aligned = Math.abs(this.hookX - it.x) <= it.w / 4;
          this.state = 'up';
          if (!aligned && this.rng.next() < WRECK.slip[tr.weight]) return 'slip';
          this.carried = tr;
          it.active = false;
          it.wait = WRECK.respawn;
          return 'grab';
        }
        const bottom = this.bottomAt(this.hookX);
        if (this.hookY >= bottom) {
          this.hookY = bottom;
          this.state = 'up';
          return 'miss';
        }
        return null;
      }
      case 'up': {
        this.hookY -= (this.depth / WRECK.haul[this.carried ? this.carried.weight : 0]) * dt;
        if (this.hookY > 0) return null;
        this.hookY = 0;
        this.state = 'idle';
        if (!this.carried) return null;
        this.score += this.carried.value;
        this.hauled++;
        if (!this.carried.junk) this.treasures++;
        this.last = this.carried;
        this.carried = null;
        return 'catch';
      }
    }
  }
}

// ------------------------------------------------------------------ screen

/** Fish swimming by in the background. */
const AMBIENT = 6;
const SWIMMERS = ['sardine', 'bream', 'tang', 'clownfish', 'parrotfish', 'butterflyfish', 'mackerel'] as const;

export class WreckScreen extends MiniGame {
  readonly id = 'wreck' as const;
  private readonly haul = new WreckHaul();
  private readonly rng = new Rng(Date.now() >>> 0);
  private prevX = 0;
  private prevY = 0;
  private cheer = 0;
  private seed = 1;
  /** Fish swimming by, just for life in the water: position, speed, kind. */
  private readonly fishX = new Float32Array(AMBIENT);
  private readonly fishY = new Float32Array(AMBIENT);
  private readonly fishV = new Float32Array(AMBIENT);
  private readonly fishKind = new Uint8Array(AMBIENT);

  constructor(ctx: Context) {
    super(ctx);
  }

  /** Sea surface and sea floor on this screen: room above the water for the timer, the boat and the athlete. */
  private get surfaceY(): number {
    const r = this.ctx.r;
    return Math.max(70 + 14 * r.u, Math.round(r.H * 0.26));
  }

  private get floorY(): number {
    const r = this.ctx.r;
    return r.H - Math.max(24, Math.round(r.H * 0.07));
  }

  protected reset(): void {
    this.seed = (this.rng.next() * 0xffffffff) >>> 0;
    this.haul.reset(this.seed, this.ctx.r.W, this.floorY - this.surfaceY);
    this.prevX = this.haul.hookX;
    this.prevY = 0;
    this.cheer = 0;
    for (let i = 0; i < AMBIENT; i++) {
      this.fishX[i] = this.rng.next() * this.ctx.r.W;
      this.fishY[i] = 0.15 + 0.7 * this.rng.next();
      this.fishV[i] = (this.rng.next() < 0.5 ? -1 : 1) * (8 + this.rng.next() * 14);
      this.fishKind[i] = Math.floor(this.rng.next() * SWIMMERS.length);
    }
  }

  private swim(dt: number): void {
    const W = this.ctx.r.W;
    for (let i = 0; i < AMBIENT; i++) {
      this.fishX[i] += this.fishV[i] * dt;
      if (this.fishX[i] < -30) this.fishX[i] = W + 30;
      else if (this.fishX[i] > W + 30) this.fishX[i] = -30;
    }
  }

  protected step(dt: number, pressed: boolean): void {
    const h = this.haul;
    h.resize(this.ctx.r.W, this.floorY - this.surfaceY);
    this.prevX = h.hookX;
    this.prevY = h.hookY;
    const event = h.step(dt, pressed);
    this.swim(dt);
    this.score = h.score;
    if (this.cheer > 0) this.cheer -= dt;
    const x = h.hookX;
    const y = this.surfaceY + h.hookY;
    if (event === 'slip') this.popup(t.gameText.wreck.slipped, x, y - 10, C.skyPale);
    else if (event === 'catch' && h.last) {
      const tr = h.last;
      const sy = this.surfaceY - 40;
      if (tr.junk) {
        this.popup(`${t.gameText.wreck.clean} +${tr.value}`, x, sy, C.aqua);
      } else {
        const fresh = this.ctx.album.treasure(tr.id);
        this.popup(`+${tr.value}`, x, sy, C.gold);
        this.popup(fresh ? `${t.newItem} ${t.treasures[tr.id]}` : t.treasures[tr.id], this.ctx.r.W / 2, sy + 20, fresh ? C.sun : C.white);
        this.cheer = 0.8;
      }
    }
    if (h.over) {
      this.overLines.push({ text: `${t.gameText.wreck.treasures} ${h.treasures}`, color: C.gold });
      this.finish(t.timeUp);
    }
  }

  protected idle(dt: number): void {
    // the boat keeps sweeping on the start card
    this.swim(dt);
    if (this.phase !== 'ready') return;
    const h = this.haul;
    h.resize(this.ctx.r.W, this.floorY - this.surfaceY);
    this.prevX = h.hookX;
    h.step(dt, false);
    h.timeLeft = WRECK.time;
  }

  protected draw(alpha: number): void {
    const r = this.ctx.r;
    const h = this.haul;
    const surface = this.surfaceY;
    const floor = this.floorY;
    // sky and horizon above the surface, then the cut-away sea
    r.seaY = surface;
    r.backdrop(this.clock * 6);
    underwater(r, surface, floor, this.clock, false);
    specks(r, surface + 6, floor, 0, this.clock);
    seaFloor(r, floor, 0, this.clock, false, this.seed % 1000);
    for (let i = 0; i < AMBIENT; i++) {
      const y = Math.round(surface + 12 + this.fishY[i] * (floor - surface - 70));
      r.creature(SWIMMERS[this.fishKind[i]], this.fishX[i], y, Math.floor(this.clock * 4 + i) & 1, this.fishV[i] < 0);
    }
    this.wreckBack(floor);
    for (const it of h.items) {
      if (!it.active) continue;
      const tr = BY_ID.get(it.id) as Treasure;
      const sway = tr.weight === 1 ? Math.round(Math.sin(this.clock * 1.6 + it.x) * 1) : 0;
      r.treasure(it.id, it.x + sway, surface + it.bottom - it.h / 2);
    }
    this.wreckFront(floor);
    const hx = Math.round(this.prevX + (h.hookX - this.prevX) * alpha);
    const hy = Math.round(surface + this.prevY + (h.hookY - this.prevY) * alpha);
    this.boat(hx, surface);
    // rope and claw, with whatever it holds
    r.fill(C.slate, hx, surface - 24, 1, hy - surface + 24);
    if (h.carried) r.treasure(h.carried.id, hx, hy + 8, 1);
    this.claw(hx, hy, h.state !== 'down' && h.carried !== null);
    r.surfaceFront(this.clock * 6);
  }

  /** The hull's dark inside and its back wall, behind the things inside. */
  private wreckBack(floor: number): void {
    const r = this.ctx.r;
    const x0 = Math.round(WRECK.wreck[0] * r.W);
    const x1 = Math.round(WRECK.wreck[1] * r.W);
    const top = floor - WRECK.deck;
    r.fill(C.navy, x0 + 4, top, x1 - x0 - 8, WRECK.deck);
    for (let x = x0 + 8; x < x1 - 8; x += 9) r.fill(C.indigo, x, top + 2, 1, WRECK.deck - 2);
    // a broken mast leaning out of the deck
    const mx = Math.round(r.W * 0.665);
    for (let i = 0; i < 70; i++) r.fill(i % 9 === 0 ? C.ink : C.brown, mx - Math.round(i * 0.45), top - i, 3, 1);
    r.fill(C.brown, mx - 30, top - 54, 22, 2);
  }

  /** The deck in pieces, the bow and the stern, drawn over the things inside the hull. */
  private wreckFront(floor: number): void {
    const r = this.ctx.r;
    const W = r.W;
    const top = floor - WRECK.deck;
    const x0 = Math.round(WRECK.wreck[0] * W);
    const x1 = Math.round(WRECK.wreck[1] * W);
    let from = x0;
    for (const [a, b] of WRECK.holes) {
      this.plank(from, Math.round(a * W), top);
      from = Math.round(b * W);
    }
    this.plank(from, x1, top);
    // stern and bow walls, broken and leaning, with portholes
    r.fill(C.ink, x0 - 1, top - 1, 7, WRECK.deck + 1);
    r.fill(C.brown, x0, top, 5, WRECK.deck);
    r.fill(C.ink, x1 - 6, top - 9, 7, WRECK.deck + 9);
    r.fill(C.brown, x1 - 5, top - 8, 5, WRECK.deck + 8);
    r.fill(C.tan, x1 - 5, top - 8, 5, 1);
    this.porthole(x0 + 2, top + 10);
    this.porthole(x1 - 3, top + 10);
    // seaweed on the wreck
    for (let i = 0; i < 4; i++) {
      const sx = x0 + 14 + i * Math.round((x1 - x0) / 4);
      for (let j = 0; j < 8; j++) r.fill(j % 3 === 0 ? C.forest : C.green, sx + Math.round(Math.sin(this.clock * 1.2 + i + j * 0.4)), top - 2 - j, 1, 1);
    }
  }

  private porthole(x: number, y: number): void {
    const r = this.ctx.r;
    r.fill(C.gold, x - 1, y - 1, 3, 3);
    r.fill(C.navy, x, y, 1, 1);
  }

  private plank(x0: number, x1: number, top: number): void {
    if (x1 <= x0) return;
    const r = this.ctx.r;
    r.fill(C.ink, x0, top - 1, x1 - x0, 6);
    r.fill(C.brown, x0, top, x1 - x0, 4);
    r.fill(C.tan, x0, top, x1 - x0, 1);
    for (let x = x0 + 5; x < x1 - 1; x += 8) r.fill(C.ink, x, top + 1, 1, 3);
    // jagged broken ends
    r.fill(C.brown, x0, top + 4, 2, 2);
    r.fill(C.brown, x1 - 2, top + 4, 2, 3);
  }

  /** The boat at the surface with its crane; BOB or BOBBA hauls the rope. */
  private boat(hx: number, surface: number): void {
    const r = this.ctx.r;
    const bob = Math.round(Math.sin(this.clock * 2));
    const y = surface + bob;
    const x = hx - 46;
    // hull
    r.fill(C.ink, x - 1, y - 9, 52, 11);
    r.fill(C.white, x, y - 8, 50, 7);
    r.fill(C.blue, x, y - 8, 50, 2);
    r.fill(C.silver, x + 3, y - 1, 44, 2);
    // crane: post and arm out to the rope
    r.fill(C.ink, x + 37, y - 33, 4, 25);
    r.fill(C.gold, x + 38, y - 32, 2, 24);
    r.fill(C.ink, x + 37, y - 33, 11, 3);
    r.fill(C.gold, x + 38, y - 32, 9, 1);
    r.fill(C.slate, hx - 1, y - 30, 3, 3);
    // the athlete on deck
    const frames = this.ctx.actor('stand');
    const h = this.haul;
    const f = this.cheer > 0 ? STAND_FRAMES.cheer : h.state === 'up' ? (Math.floor(this.clock * 6) % 2 === 0 ? STAND_FRAMES.pull0 : STAND_FRAMES.pull1) : STAND_FRAMES.idle;
    r.ctx.drawImage(frames[f], x + 18 - ANCHOR_X, y - 8 - ANCHOR_Y);
  }

  private claw(x: number, y: number, closed: boolean): void {
    const r = this.ctx.r;
    r.fill(C.ink, x - 3, y - 1, 7, 4);
    r.fill(C.silver, x - 2, y, 5, 2);
    if (closed) {
      r.fill(C.grey, x - 3, y + 3, 2, 5);
      r.fill(C.grey, x + 2, y + 3, 2, 5);
      r.fill(C.grey, x - 2, y + 8, 5, 1);
    } else {
      r.fill(C.grey, x - 4, y + 3, 2, 4);
      r.fill(C.grey, x - 5, y + 6, 1, 2);
      r.fill(C.grey, x + 3, y + 3, 2, 4);
      r.fill(C.grey, x + 5, y + 6, 1, 2);
    }
  }

  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    // big seconds left at the top, red in the last ten
    const left = Math.ceil(this.haul.timeLeft);
    const scale = 2 * u;
    const digits = Math.max(1, digitCount(left));
    r.number(left, digits, Math.round((r.W - r.font.widthOf(digits, scale)) / 2), 6, left <= 10 ? C.coral : C.white, scale);
    if (this.haul.timeLeft <= 0) r.centered(t.gameText.wreck.last, r.W / 2, 6 + (GLYPH_H + 4) * scale, C.sun, u);
  }
}

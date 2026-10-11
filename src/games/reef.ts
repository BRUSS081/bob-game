import { Rng } from '../core/rng.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect, type Rect } from '../render/renderer.ts';
import { specks, underwater } from '../render/sea.ts';
import { SWIM_SIZE, swimIndex } from '../sprites/actor.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame } from './kit.ts';

/**
 * Tuning of the reef guard. The field is LENGTH units long: trash comes
 * in at LENGTH and the reef is at 0; three lanes at different depths.
 */
export const REEF = {
  length: 1000,
  /** Trash past this reaches the reef. */
  reefX: 70,
  lanes: 3,
  /** Build spots along each lane. */
  slots: [330, 560, 790] as const,
  health: 20,
  startShells: 30,
  waves: 10,
  /** Seconds of calm between waves (a press starts the next one sooner). */
  calm: 7,
  /** Shells for each piece stopped and for each wave cleared. */
  reward: 2,
  waveReward: 6,
  /** Points: each piece stopped, each wave, each bit of reef health at the end. */
  points: 10,
  wavePoints: 50,
  healthPoints: 20,
} as const;

export type HelperKind = 'net' | 'turtle' | 'diver';
export const HELPERS: readonly HelperKind[] = ['net', 'turtle', 'diver'];

/** Cost, upgrade cost, reach (units) and seconds between catches, by level 1 and 2. */
export const HELPER: Record<HelperKind, { cost: number; upgrade: number; reach: number; every: readonly [number, number] }> = {
  net: { cost: 10, upgrade: 10, reach: 14, every: [0, 0] },
  turtle: { cost: 15, upgrade: 15, reach: 130, every: [1.0, 0.6] },
  diver: { cost: 20, upgrade: 20, reach: 120, every: [1.6, 1.0] },
};

/** A net holds this many pieces (by level), then takes a while to empty. */
const NET_HOLDS = [5, 9] as const;
const NET_EMPTY = 5;

export type TrashKind = 'bag' | 'bottle' | 'can' | 'ghostnet' | 'jelly';

/** Speed (units per second), toughness and harm to the reef, by kind. */
export const TRASH: Record<TrashKind, { speed: number; hp: number; harm: number }> = {
  bag: { speed: 46, hp: 1, harm: 1 },
  bottle: { speed: 54, hp: 1, harm: 1 },
  can: { speed: 50, hp: 1, harm: 1 },
  ghostnet: { speed: 26, hp: 3, harm: 3 },
  jelly: { speed: 34, hp: 1, harm: 2 },
};

export interface Helper {
  kind: HelperKind | null;
  level: number;
  /** Seconds until it can catch again (nets: until emptied). */
  rest: number;
  /** Pieces in a net. */
  held: number;
  /** Seconds since its last catch (for the animation). */
  since: number;
}

export interface Trash {
  active: boolean;
  kind: TrashKind;
  lane: number;
  x: number;
  hp: number;
  speed: number;
}

export type ReefEvent = 'stopped' | 'hurt' | 'wave' | 'won' | 'lost' | null;

/** The defense without drawing: waves of trash, helpers on the spots, the reef's health. */
export class ReefDefense {
  /** Spots: lane * slots + slot. */
  readonly helpers: Helper[] = [];
  readonly trash: Trash[] = [];
  shells: number = REEF.startShells;
  health: number = REEF.health;
  wave = 0;
  calm = 3;
  stopped = 0;
  score = 0;
  over = false;
  won = false;
  private toSpawn = 0;
  private spawnWait = 0;
  private readonly rng = new Rng(1);

  constructor() {
    for (let i = 0; i < REEF.lanes * REEF.slots.length; i++) this.helpers.push({ kind: null, level: 1, rest: 0, held: 0, since: 9 });
    for (let i = 0; i < 40; i++) this.trash.push({ active: false, kind: 'bag', lane: 0, x: 0, hp: 1, speed: 0 });
  }

  reset(seed: number): void {
    this.rng.seed(seed);
    for (const h of this.helpers) {
      h.kind = null;
      h.level = 1;
      h.rest = 0;
      h.held = 0;
      h.since = 9;
    }
    for (const tr of this.trash) tr.active = false;
    this.shells = REEF.startShells;
    this.health = REEF.health;
    this.wave = 0;
    this.calm = 4;
    this.stopped = 0;
    this.score = 0;
    this.over = false;
    this.won = false;
    this.toSpawn = 0;
  }

  get calming(): boolean {
    return this.toSpawn === 0 && !this.anyTrash();
  }

  private anyTrash(): boolean {
    for (const tr of this.trash) if (tr.active) return true;
    return false;
  }

  /** Builds a helper on an empty spot, or upgrades the one there. */
  build(spot: number, kind: HelperKind): boolean {
    const h = this.helpers[spot];
    if (!h) return false;
    if (h.kind === null) {
      if (this.shells < HELPER[kind].cost) return false;
      this.shells -= HELPER[kind].cost;
      h.kind = kind;
      h.level = 1;
      h.rest = 0;
      h.held = 0;
      return true;
    }
    return this.upgrade(spot);
  }

  upgrade(spot: number): boolean {
    const h = this.helpers[spot];
    if (!h || h.kind === null || h.level >= 2 || this.shells < HELPER[h.kind].upgrade) return false;
    this.shells -= HELPER[h.kind].upgrade;
    h.level = 2;
    return true;
  }

  step(dt: number, pressed: boolean): ReefEvent {
    if (this.over) return null;
    let event: ReefEvent = null;
    // calm between waves; a press starts the next one now
    if (this.calming) {
      this.calm -= dt;
      if (this.calm <= 0 || pressed) this.startWave();
    }
    if (this.toSpawn > 0) {
      this.spawnWait -= dt;
      if (this.spawnWait <= 0) {
        this.spawn();
        this.toSpawn--;
        this.spawnWait = Math.max(0.7, 2.2 - this.wave * 0.13) * this.rng.range(0.6, 1.4);
      }
    }
    for (const h of this.helpers) {
      h.rest = Math.max(0, h.rest - dt);
      h.since += dt;
      if (h.kind === 'net' && h.rest <= 0 && h.held >= NET_HOLDS[h.level - 1]) h.held = 0;
    }
    for (const tr of this.trash) {
      if (!tr.active) continue;
      const before = tr.x;
      tr.x -= tr.speed * dt;
      if (this.helpersCatch(tr, before)) {
        event = 'stopped';
        continue;
      }
      if (tr.x <= REEF.reefX) {
        tr.active = false;
        this.health = Math.max(0, this.health - TRASH[tr.kind].harm);
        event = 'hurt';
        if (this.health <= 0) {
          this.over = true;
          return 'lost';
        }
      }
    }
    // a wave is cleared when nothing is left to come
    if (this.wave > 0 && this.toSpawn === 0 && !this.anyTrash() && this.calm <= 0) {
      this.shells += REEF.waveReward;
      this.score += REEF.wavePoints;
      if (this.wave >= REEF.waves) {
        this.over = true;
        this.won = true;
        this.score += this.health * REEF.healthPoints;
        return 'won';
      }
      this.calm = REEF.calm;
      event = 'wave';
    }
    return event;
  }

  /** The helpers of a piece's lane try to stop it; true when it is gone. */
  private helpersCatch(tr: Trash, before: number): boolean {
    for (let s = 0; s < REEF.slots.length; s++) {
      const h = this.helpers[tr.lane * REEF.slots.length + s];
      if (!h.kind) continue;
      const sx = REEF.slots[s];
      const spec = HELPER[h.kind];
      if (h.kind === 'net') {
        // a net stops small trash crossing it, until it is full
        if (tr.kind === 'ghostnet' || tr.kind === 'jelly') continue;
        if (before >= sx && tr.x < sx && h.held < NET_HOLDS[h.level - 1]) {
          h.held++;
          h.since = 0;
          if (h.held >= NET_HOLDS[h.level - 1]) h.rest = NET_EMPTY;
          return this.stop(tr);
        }
        continue;
      }
      if (h.rest > 0 || tr.x < sx - 20 || tr.x > sx + spec.reach) continue;
      // turtles eat jellyfish; divers take everything else
      if ((h.kind === 'turtle') !== (tr.kind === 'jelly')) continue;
      h.rest = spec.every[h.level - 1];
      h.since = 0;
      tr.hp--;
      if (tr.hp <= 0) return this.stop(tr);
    }
    return false;
  }

  private stop(tr: Trash): boolean {
    tr.active = false;
    this.stopped++;
    this.shells += REEF.reward;
    this.score += REEF.points;
    return true;
  }

  private startWave(): void {
    this.wave++;
    this.toSpawn = 5 + this.wave * 2;
    this.spawnWait = 0.5;
    this.calm = 0;
  }

  private spawn(): void {
    for (const tr of this.trash) {
      if (tr.active) continue;
      const roll = this.rng.next();
      const w = this.wave;
      tr.kind = w >= 4 && roll < 0.12 ? 'ghostnet' : w >= 2 && roll < 0.32 ? 'jelly' : roll < 0.55 ? 'bag' : roll < 0.8 ? 'bottle' : 'can';
      tr.lane = Math.floor(this.rng.next() * REEF.lanes);
      tr.x = REEF.length;
      tr.hp = TRASH[tr.kind].hp;
      tr.speed = TRASH[tr.kind].speed * (1 + w * 0.05);
      tr.active = true;
      return;
    }
  }
}

// ------------------------------------------------------------------ screen

export class ReefScreen extends MiniGame {
  readonly id = 'reef' as const;

  protected get outdoors(): boolean {
    return false;
  }
  private readonly field = new ReefDefense();
  private readonly rng = new Rng(Date.now() >>> 0);
  private selected = -1;
  private readonly spotRects: Rect[] = [];
  private readonly barRects: Rect[] = [newRect(), newRect(), newRect()];
  private readonly labels: string[] = [];
  private upgradeLabel = '';

  constructor(ctx: Context) {
    super(ctx);
    for (let i = 0; i < REEF.lanes * REEF.slots.length; i++) this.spotRects.push(newRect());
    const words = t.gameText.reef;
    for (const k of HELPERS) this.labels.push(`${words[k]} ${HELPER[k].cost}`);
  }

  protected reset(): void {
    this.field.reset((this.rng.next() * 0xffffffff) >>> 0);
    this.selected = 4;
    this.updateLabel();
  }

  private updateLabel(): void {
    const h = this.field.helpers[this.selected];
    this.upgradeLabel = h && h.kind ? (h.level >= 2 ? t.gameText.reef.max : `${t.gameText.reef.upgrade} ${HELPER[h.kind].upgrade}`) : '';
  }

  /** Field geometry on screen. */
  private get top(): number {
    return 6 + (GLYPH_H + 8) * 2 * this.ctx.r.u;
  }

  private get bottom(): number {
    return this.ctx.r.H - (GLYPH_H + 9) * this.ctx.r.u - 10;
  }

  private laneY(lane: number): number {
    const top = this.top + 16;
    return Math.round(top + ((lane + 0.5) / REEF.lanes) * (this.bottom - top - 8));
  }

  private screenX(x: number): number {
    const r = this.ctx.r;
    const left = Math.round(r.W * 0.12);
    return Math.round(left + (x / REEF.length) * (r.W - left - 8));
  }

  protected onKey(code: string): void {
    const n = REEF.lanes * REEF.slots.length;
    if (code === 'ArrowRight' || code === 'KeyD') this.selected = (this.selected + 1) % n;
    else if (code === 'ArrowLeft' || code === 'KeyA') this.selected = (this.selected - 1 + n) % n;
    else if (code === 'ArrowDown') this.selected = (this.selected + REEF.slots.length) % n;
    else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') this.choose(Number(code[5]) - 1);
    this.updateLabel();
  }

  protected onTap(x: number, y: number): boolean {
    for (let i = 0; i < this.spotRects.length; i++) {
      if (inside(this.spotRects[i], x, y)) {
        this.selected = i;
        this.updateLabel();
        return true;
      }
    }
    for (let i = 0; i < this.barRects.length; i++) {
      if (inside(this.barRects[i], x, y)) {
        this.choose(i);
        return true;
      }
    }
    return false;
  }

  /** A bar button: build that helper on the selected spot, or upgrade what is there. */
  private choose(i: number): void {
    const f = this.field;
    const h = f.helpers[this.selected];
    if (!h) return;
    const ok = h.kind ? f.upgrade(this.selected) : f.build(this.selected, HELPERS[i]);
    if (ok) {
      const lane = Math.floor(this.selected / REEF.slots.length);
      const slot = this.selected % REEF.slots.length;
      this.popup(h.level === 2 && h.kind ? t.gameText.reef.upgraded : t.gameText.reef.built, this.screenX(REEF.slots[slot]), this.laneY(lane) - 22, C.gold);
    }
    this.updateLabel();
  }

  protected step(dt: number, pressed: boolean): void {
    const f = this.field;
    const wave = f.wave;
    const event = f.step(dt, pressed);
    this.score = f.score;
    const words = t.gameText.reef;
    if (f.wave !== wave) this.popup(`${words.wave} ${f.wave}`, this.ctx.r.W / 2, this.top + 20, C.sun);
    if (event === 'hurt') this.popup(words.hurt, this.screenX(REEF.reefX) + 10, this.top + 34, C.coral);
    if (f.over) {
      this.overLines.push({ text: `${words.stopped} ${f.stopped}`, color: C.white });
      this.overLines.push({ text: `${words.wave} ${f.wave}/${REEF.waves}`, color: C.gold });
      this.finish(f.won ? words.saved : words.lost);
    }
  }

  protected draw(): void {
    const r = this.ctx.r;
    const f = this.field;
    underwater(r, 0, r.H, this.clock, false, 0.2, 0.8);
    specks(r, 0, r.H, this.clock * 10, this.clock);
    r.fill(C.tan, 0, this.bottom + 4, r.W, r.H - this.bottom - 4);
    r.fill(C.brown, 0, this.bottom + 4, r.W, 1);
    this.drawReef();
    for (let lane = 0; lane < REEF.lanes; lane++) {
      const y = this.laneY(lane);
      for (let x = this.screenX(REEF.reefX) + 8; x < r.W; x += 12) r.fill(C.teal, x, y + 9, 5, 1);
      for (let s = 0; s < REEF.slots.length; s++) this.drawSpot(lane, s, this.screenX(REEF.slots[s]), y);
    }
    for (const tr of f.trash) if (tr.active) this.drawTrash(tr, this.screenX(tr.x), this.laneY(tr.lane));
  }

  /** The reef: a rock wall covered in corals, which go pale as it is hurt, and its clownfish. */
  private drawReef(): void {
    const r = this.ctx.r;
    const f = this.field;
    const edge = this.screenX(REEF.reefX);
    const top = this.top + 6;
    const bottom = this.bottom + 4;
    // the rock: a bulging wall, rough at the face
    for (let y = top; y < bottom; y += 2) {
      const k = (y - top) / (bottom - top);
      const w = Math.round(edge * (0.55 + 0.45 * Math.sin(k * Math.PI * 0.85 + 0.25)) + ((y * 7) % 5) - 2);
      r.fill(C.ink, 0, y, w + 1, 2);
      r.fill(C.slate, 0, y, w, 2);
      for (let x = ((y >> 1) % 4) * 3; x < w - 4; x += 11) r.fill(C.indigo, x, y, 4, 2);
      if ((y >> 1) % 3 === 0) r.fill(C.grey, Math.max(0, w - 6), y, 3, 1);
    }
    // corals along the face; the first ones bleach as the reef is hurt
    const pale = 1 - f.health / REEF.health;
    const n = Math.max(8, Math.round((bottom - top) / 16));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const y = Math.round(top + k * (bottom - top - 10));
      const w = Math.round(edge * (0.55 + 0.45 * Math.sin(k * Math.PI * 0.85 + 0.25)));
      // two rows of corals: on the face and further in
      this.coralPiece(i % 4, w - 5, y, ((i * 5) % n) / n < pale);
      this.coralPiece((i + 2) % 4, Math.round(w * 0.45) + ((i * 7) % 9), y + 6, ((i * 5 + 3) % n) / n < pale);
    }
    // clownfish home
    for (let i = 0; i < 3; i++) {
      const fx = edge - 6 + Math.sin(this.clock * 1.3 + i * 2) * 10;
      const fy = this.top + 30 + i * ((this.bottom - this.top) / 3) + Math.cos(this.clock + i) * 6;
      r.creature('clownfish', fx, fy, Math.floor(this.clock * 4 + i) & 1, Math.sin(this.clock * 1.3 + i * 2) < 0);
    }
  }

  /** One coral: 0 brain, 1 branching, 2 sea fan, 3 anemone. Bleached ones are pale grey. */
  private coralPiece(kind: number, x: number, y: number, bleached: boolean): void {
    const r = this.ctx.r;
    const sway = Math.round(Math.sin(this.clock * 1.5 + x + y) * 1);
    switch (kind) {
      case 0: {
        const c = bleached ? C.silver : C.mauve;
        const line = bleached ? C.mist : C.rose;
        r.fill(C.ink, x - 7, y - 5, 15, 10);
        r.fill(c, x - 6, y - 4, 13, 8);
        r.fill(c, x - 4, y - 6, 9, 2);
        for (let j = -3; j <= 3; j += 2) r.fill(line, x - 5 + ((j + 3) & 2), y + j, 10, 1);
        break;
      }
      case 1: {
        const c = bleached ? C.silver : C.coral;
        const tip = bleached ? C.white : C.gold;
        r.fill(c, x, y - 12, 2, 12);
        r.fill(c, x - 5 + sway, y - 9, 5, 2);
        r.fill(c, x - 5 + sway, y - 15, 2, 7);
        r.fill(c, x + 2 + sway, y - 7, 5, 2);
        r.fill(c, x + 5 + sway, y - 13, 2, 7);
        r.fill(tip, x - 5 + sway, y - 16, 2, 1);
        r.fill(tip, x + 5 + sway, y - 14, 2, 1);
        r.fill(tip, x, y - 13, 2, 1);
        break;
      }
      case 2: {
        const c = bleached ? C.mist : C.violet;
        r.fill(c, x, y - 2, 1, 4);
        for (let j = 0; j < 12; j += 2) {
          const half = Math.round(Math.sin((j / 12) * Math.PI) * 7);
          r.fill(c, x - half + sway, y - 4 - j, half * 2 + 1, 1);
          if (j % 4 === 0) r.fill(bleached ? C.silver : C.mauve, x - half + 1 + sway, y - 5 - j, Math.max(1, half * 2 - 1), 1);
        }
        break;
      }
      case 3: {
        const c = bleached ? C.silver : C.green;
        const tip = bleached ? C.mist : C.aqua;
        r.fill(C.ink, x - 5, y - 2, 11, 4);
        r.fill(bleached ? C.grey : C.forest, x - 4, y - 1, 9, 2);
        for (let j = -4; j <= 4; j += 2) {
          const h = 6 + ((j + 4) % 3);
          const bend = Math.round(Math.sin(this.clock * 2 + j) * 1.5);
          r.fill(c, x + j + bend, y - h, 1, h - 1);
          r.fill(tip, x + j + bend, y - h, 1, 1);
        }
        break;
      }
    }
  }

  private drawSpot(lane: number, slot: number, x: number, y: number): void {
    const r = this.ctx.r;
    const index = lane * REEF.slots.length + slot;
    const h = this.field.helpers[index];
    const sel = index === this.selected;
    const size = 26;
    setRect(this.spotRects[index], x - size / 2, y - size / 2, size, size);
    // a rock to stand on
    r.fill(C.ink, x - 9, y + 7, 19, 5);
    r.fill(C.slate, x - 8, y + 8, 17, 3);
    if (!h.kind) {
      for (let a = 0; a < 12; a++) {
        if (a % 2) continue;
        const ang = (a / 12) * Math.PI * 2;
        r.fill(sel ? C.gold : C.aqua, Math.round(x + Math.cos(ang) * 9), Math.round(y + Math.sin(ang) * 9), 2, 2);
      }
    } else {
      this.drawHelper(h, x, y);
      if (h.level >= 2) r.fill(C.gold, x + 8, y - 12, 3, 3);
    }
    if (sel) {
      const b = size / 2 + 2;
      r.fill(C.gold, x - b, y - b, 5, 1);
      r.fill(C.gold, x - b, y - b, 1, 5);
      r.fill(C.gold, x + b - 4, y - b, 5, 1);
      r.fill(C.gold, x + b, y - b, 1, 5);
      r.fill(C.gold, x - b, y + b, 5, 1);
      r.fill(C.gold, x - b, y + b - 4, 1, 5);
      r.fill(C.gold, x + b - 4, y + b, 5, 1);
      r.fill(C.gold, x + b, y + b - 4, 1, 5);
    }
  }

  private drawHelper(h: Helper, x: number, y: number): void {
    const r = this.ctx.r;
    switch (h.kind) {
      case 'net': {
        // a net hanging from a float, filling up
        const full = h.held / NET_HOLDS[h.level - 1];
        r.fill(C.orange, x - 2, y - 13, 5, 3);
        for (let j = -10; j <= 8; j += 3) r.fill(C.forest, x - 1, y + j, 3, 1);
        r.fill(C.green, x, y - 10, 1, 18);
        if (full > 0) r.fill(C.mist, x - 2, y + 8 - Math.round(full * 14), 5, Math.round(full * 14));
        if (h.rest > 0 && Math.floor(this.clock * 4) % 2 === 0) r.fill(C.coral, x - 3, y - 16, 7, 1);
        break;
      }
      case 'turtle':
        r.creature('turtle', x, y - 2 + Math.round(Math.sin(this.clock * 2) * 1), h.since < 0.3 ? 1 : Math.floor(this.clock * 2) & 1, false);
        break;
      case 'diver': {
        const frames = this.ctx.actor('swim');
        const kick = Math.floor(this.clock * (h.since < 0.4 ? 10 : 3));
        const f = frames[swimIndex(Math.sin(this.clock) * 0.15, kick)];
        r.ctx.drawImage(f, x - SWIM_SIZE / 2 + 4, y - 2 - SWIM_SIZE / 2);
        break;
      }
    }
  }

  private drawTrash(tr: Trash, x: number, y: number): void {
    const r = this.ctx.r;
    const bob = Math.round(Math.sin(this.clock * 2 + tr.x * 0.05) * 2);
    y += bob;
    switch (tr.kind) {
      case 'bag':
        r.fill(C.ink, x - 5, y - 6, 11, 11);
        r.fill(C.mist, x - 4, y - 5, 9, 9);
        r.fill(C.white, x - 4, y - 5, 2, 2);
        r.fill(C.mist, x - 3, y + 4, 2, 3);
        r.fill(C.mist, x + 2, y + 4, 2, 2);
        break;
      case 'bottle':
        r.fill(C.ink, x - 6, y - 3, 13, 6);
        r.fill(C.sky, x - 5, y - 2, 9, 4);
        r.fill(C.white, x - 4, y - 2, 6, 1);
        r.fill(C.blue, x + 4, y - 1, 2, 2);
        break;
      case 'can':
        r.fill(C.ink, x - 4, y - 5, 9, 11);
        r.fill(C.silver, x - 3, y - 4, 7, 9);
        r.fill(C.red, x - 3, y - 2, 7, 4);
        break;
      case 'ghostnet':
        for (let i = -10; i <= 10; i += 4) {
          r.fill(C.forest, x + i, y - 9, 1, 19);
          r.fill(C.forest, x - 10, y + i * 0.9, 21, 1);
        }
        r.fill(C.orange, x - 11, y - 10, 3, 3);
        for (let k = 0; k < tr.hp; k++) r.fill(C.coral, x - 4 + k * 4, y - 14, 3, 2);
        break;
      case 'jelly':
        r.creature('jelly', x, y, Math.floor(this.clock * 3) & 1, false);
        break;
    }
  }

  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    const f = this.field;
    const words = t.gameText.reef;
    // wave and the reef's health, under the top bar
    const y = 6 + (GLYPH_H + 9) * u;
    r.text(words.wave, 6, y, C.sun, u);
    const wx = 6 + r.font.width(words.wave, u) + 4 * u;
    r.number(Math.max(1, f.wave), digitCount(Math.max(1, f.wave)), wx, y, C.sun, u);
    const hw = 60 * u;
    const hx = Math.round((r.W - hw) / 2);
    r.fill(C.ink, hx - 1, 6 + u - 1, hw + 2, 4 * u + 2);
    r.fill(C.navy, hx, 6 + u, hw, 4 * u);
    r.fill(f.health > REEF.health * 0.3 ? C.coral : C.red, hx, 6 + u, Math.round((f.health / REEF.health) * hw), 4 * u);
    r.centered(words.reef, r.W / 2, 6 + 6 * u, C.white, u);
    // shells to spend
    const sx = r.W - 6 - (digitCount(f.shells) + 1) * 6 * u;
    r.fill(C.ink, sx - 9 * u, y - u, 7 * u + 2, 6 * u + 2);
    r.fill(C.rose, sx - 9 * u + 1, y, 7 * u, 6 * u);
    r.fill(C.white, sx - 7 * u, y + u, u, 4 * u);
    r.number(f.shells, digitCount(f.shells), sx, y, C.rose, u);
    // the build bar for the selected spot
    const h = f.helpers[this.selected];
    const bh = (GLYPH_H + 7) * u;
    const by = r.H - bh - 6;
    const gap = 3 * u;
    if (h && h.kind) {
      const w = Math.min(r.W - 12, r.font.width(this.upgradeLabel, u) + 20 * u);
      const ok = h.level < 2 && f.shells >= HELPER[h.kind].upgrade;
      r.button(setRect(this.barRects[0], (r.W - w) / 2, by, w, bh), this.upgradeLabel, ok ? 'primary' : 'normal', u);
      setRect(this.barRects[1], 0, 0, 0, 0);
      setRect(this.barRects[2], 0, 0, 0, 0);
    } else {
      const bw = Math.min(Math.floor((r.W - 12 - 2 * gap) / 3), 90 * u);
      const x0 = Math.round((r.W - (3 * bw + 2 * gap)) / 2);
      for (let i = 0; i < HELPERS.length; i++) {
        const ok = f.shells >= HELPER[HELPERS[i]].cost;
        r.button(setRect(this.barRects[i], x0 + i * (bw + gap), by, bw, bh), this.labels[i], ok ? 'primary' : 'normal', u);
      }
    }
    if (f.calming && f.wave > 0 && f.wave < REEF.waves && Math.floor(this.clock * 2) % 2 === 0) {
      r.centered(r.touch ? words.nextTouch : words.nextKey, r.W / 2, by - (GLYPH_H + 6) * u, C.white, u);
    }
  }
}

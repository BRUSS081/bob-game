import type { Rng } from '../core/rng.ts';
import { C } from '../render/palette.ts';
import { AIR, HIGH, SURFACE, UNDER } from './athletes.ts';
import type { RunConfig } from './config.ts';
import type { SportId } from './sport.ts';

export type ObstacleName =
  | 'jellyfish'
  | 'seaweed'
  | 'rock'
  | 'buoy'
  | 'rival'
  | 'gull'
  | 'boat'
  | 'kiter'
  | 'smallbuoy'
  | 'lowrock'
  | 'plank'
  | 'deepjelly'
  | 'kelp';

export interface ObstacleKind {
  readonly name: ObstacleName;
  readonly w: number;
  readonly h: number;
  /** Which hitboxes it can hit (see athletes.ts). */
  readonly layer: number;
  /** Altitude range of its bottom edge; negative is underwater. */
  readonly minY: number;
  readonly maxY: number;
  /** Extra speed toward the player (gulls fly). */
  readonly vx: number;
  /** Placeholder color for debugging and fallbacks. */
  readonly color: number;
  /** Appears only from this run speed on. */
  readonly minSpeed: number;
  readonly weight: number;
  /** Small surf obstacles may come in pairs at high speed. */
  readonly pairable: boolean;
  /** Points for flying over it (big obstacles). */
  readonly bonus: number;
  /** Rivals hop once far ahead of the player: hop height, 0 for none. */
  readonly hops: number;
}

function kind(k: Partial<ObstacleKind> & Pick<ObstacleKind, 'name' | 'w' | 'h' | 'color'>): ObstacleKind {
  return { layer: SURFACE, minY: 0, maxY: 0, vx: 0, minSpeed: 0, weight: 1, pairable: false, bonus: 0, hops: 0, ...k };
}

/** Surf: everything sits on the surface. */
export const SURF_OBSTACLES: readonly ObstacleKind[] = [
  kind({ name: 'jellyfish', w: 12, h: 8, color: C.rose, weight: 2, pairable: true }),
  kind({ name: 'seaweed', w: 22, h: 8, color: C.green, weight: 2, pairable: true }),
  kind({ name: 'rock', w: 26, h: 16, color: C.grey, weight: 3 }),
  kind({ name: 'buoy', w: 10, h: 26, color: C.red, minSpeed: 215, weight: 2 }),
  kind({ name: 'rival', w: 18, h: 34, color: C.navy, minSpeed: 250, weight: 1, bonus: 50, hops: 16 }),
];

/**
 * Kitesurf: surface obstacles to jump, low gulls that hit a jumping rider,
 * high gulls that hit the kite unless a jump lifts it above them.
 */
export const KITE_OBSTACLES: readonly ObstacleKind[] = [
  kind({ name: 'rock', w: 26, h: 16, color: C.grey, weight: 3 }),
  kind({ name: 'buoy', w: 10, h: 26, color: C.red, minSpeed: 220, weight: 2 }),
  kind({ name: 'boat', w: 44, h: 22, color: C.white, minSpeed: 250, weight: 1, bonus: 50 }),
  kind({ name: 'kiter', w: 18, h: 34, color: C.navy, minSpeed: 270, weight: 1, bonus: 50, hops: 26 }),
  kind({ name: 'gull', w: 14, h: 8, color: C.white, layer: AIR, minY: 40, maxY: 48, vx: 45, minSpeed: 230, weight: 2 }),
  kind({ name: 'gull', w: 14, h: 8, color: C.white, layer: HIGH, minY: 80, maxY: 92, vx: 45, weight: 2 }),
];

/**
 * Wing foil: surface obstacles to fly over, underwater ones that catch a
 * foil flying too low, gulls that hit a rider flying too high.
 */
export const WING_OBSTACLES: readonly ObstacleKind[] = [
  kind({ name: 'plank', w: 30, h: 5, color: C.brown, weight: 2 }),
  kind({ name: 'lowrock', w: 24, h: 9, color: C.grey, weight: 2 }),
  kind({ name: 'smallbuoy', w: 8, h: 12, color: C.red, minSpeed: 200, weight: 2 }),
  kind({ name: 'kelp', w: 14, h: 20, color: C.forest, layer: UNDER, minY: -32, maxY: -32, weight: 2 }),
  kind({ name: 'deepjelly', w: 12, h: 8, color: C.mauve, layer: UNDER, minY: -16, maxY: -16, minSpeed: 210, weight: 2 }),
  kind({ name: 'gull', w: 14, h: 8, color: C.white, layer: AIR, minY: 48, maxY: 54, vx: 40, minSpeed: 220, weight: 2 }),
];

export function obstaclesFor(sport: SportId): readonly ObstacleKind[] {
  return sport === 'surf' ? SURF_OBSTACLES : sport === 'kite' ? KITE_OBSTACLES : WING_OBSTACLES;
}

const PAIR_SPEED = 280;
const PAIR_CHANCE = 0.25;
const PAIR_SPACING = 4;

export interface Obstacle {
  active: boolean;
  kind: ObstacleKind;
  x: number;
  prevX: number;
  /** Altitude of the bottom edge. */
  y: number;
  /** Smallest gap to the athlete seen while passing it (near misses). */
  closest: number;
  /** The athlete went over it. */
  over: boolean;
  /** Already behind the athlete and scored. */
  passed: boolean;
  /** Seconds into its hop, -1 when not hopping. */
  hop: number;
  hopped: boolean;
}

/**
 * Rhythm: the run alternates normal stretches, dense "sets" and calm
 * breathers good for tricks. The minimum gap never changes, so every
 * section stays fair; only how often gaps come close to it does.
 */
export type Section = 'normal' | 'set' | 'calm';
const SECTION_ORDER: readonly Section[] = ['normal', 'set', 'calm'];
const SECTION_TIME: Record<Section, readonly [number, number]> = {
  normal: [5, 8],
  set: [4, 6],
  calm: [2, 3],
};
/** Rivals hop between these distances ahead of the player, and land well before reaching them. */
const HOP_START = 380;
const HOP_TIME = 0.4;

/** What the last spawn produced, so the game can place a power-up in the gap. */
export interface SpawnInfo {
  spawned: boolean;
  /** Right edge of the new group. */
  groupEnd: number;
  /** Free distance after the group. */
  gap: number;
}

/**
 * Fixed-size pool of obstacles. Spawning is driven by distance travelled,
 * so spacing does not depend on the screen width. Flying obstacles close
 * in faster, so the gap before them is stretched by the distance they
 * gain before reaching the player.
 */
export class Obstacles {
  readonly items: Obstacle[];
  readonly lastSpawn: SpawnInfo = { spawned: false, groupEnd: 0, gap: 0 };
  private table: readonly ObstacleKind[];
  private untilNext = 0;
  private next: ObstacleKind;
  section: Section = 'normal';
  private sectionIndex = 0;
  private sectionLeft = 0;

  constructor(table: readonly ObstacleKind[] = SURF_OBSTACLES, capacity = 16) {
    this.table = table;
    this.next = table[0];
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      this.items.push({ active: false, kind: table[0], x: 0, prevX: 0, y: 0, closest: Infinity, over: false, passed: false, hop: -1, hopped: false });
    }
  }

  /** Switches to another sport's obstacles; call reset after. */
  setTable(table: readonly ObstacleKind[]): void {
    this.table = table;
    for (let i = 0; i < this.items.length; i++) this.items[i].active = false;
  }

  reset(firstGap: number, rng?: Rng, speed = 0): void {
    for (let i = 0; i < this.items.length; i++) this.items[i].active = false;
    this.untilNext = firstGap;
    this.lastSpawn.spawned = false;
    this.next = rng ? this.pickKind(speed, rng) : this.table[0];
    this.sectionIndex = 0;
    this.section = 'normal';
    // the first stretch is a little longer: time to warm up
    this.sectionLeft = Math.max(speed, 1) * (rng ? rng.range(6, 9) : 7);
  }

  private nextSection(speed: number, rng: Rng): void {
    this.sectionIndex = (this.sectionIndex + 1) % SECTION_ORDER.length;
    this.section = SECTION_ORDER[this.sectionIndex];
    const [lo, hi] = SECTION_TIME[this.section];
    this.sectionLeft = speed * rng.range(lo, hi);
  }

  /** Moves obstacles, recycles those off screen and spawns new ones at spawnX. */
  update(dt: number, speed: number, spawnX: number, playerX: number, rng: Rng, cfg: RunConfig): SpawnInfo {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      if (!o.active) continue;
      o.prevX = o.x;
      o.x -= (speed + o.kind.vx) * dt;
      if (o.x + o.kind.w < -16) o.active = false;
      else if (o.kind.hops > 0) this.hopUpdate(o, dt, playerX);
    }
    this.lastSpawn.spawned = false;
    this.sectionLeft -= speed * dt;
    if (this.sectionLeft <= 0) this.nextSection(speed, rng);
    this.untilNext -= speed * dt;
    if (this.untilNext > 0) return this.lastSpawn;

    const k = this.next;
    let width = k.w;
    if (!this.add(k, spawnX, this.altitude(k, rng))) return this.lastSpawn;
    const pairChance = this.section === 'set' ? PAIR_CHANCE * 1.6 : this.section === 'calm' ? 0 : PAIR_CHANCE;
    if (k.pairable && speed >= PAIR_SPEED && rng.next() < pairChance) {
      const second = this.pairPartner(rng);
      if (second && this.add(second, spawnX + width + PAIR_SPACING, 0)) width += PAIR_SPACING + second.w;
    }

    const difficulty = clamp01((speed - cfg.startSpeed) / (cfg.maxSpeed - cfg.startSpeed));
    const maxGapTime = cfg.maxGapTimeStart + (cfg.maxGapTimeEnd - cfg.maxGapTimeStart) * difficulty;
    const gap =
      this.section === 'set'
        ? speed * rng.range(cfg.minGapTime, cfg.minGapTime + (maxGapTime - cfg.minGapTime) * 0.45)
        : this.section === 'calm'
          ? speed * rng.range(maxGapTime, maxGapTime * 1.4)
          : speed * rng.range(cfg.minGapTime, maxGapTime);
    this.next = this.pickKind(speed, rng);
    // a flyer gains (vx / speed) of the way to the player; leave it that much more room
    const closing = this.next.vx > 0 ? (this.next.vx / speed) * Math.max(0, spawnX - playerX) : 0;
    this.untilNext = width + gap + closing;
    this.lastSpawn.spawned = true;
    this.lastSpawn.groupEnd = spawnX + width;
    this.lastSpawn.gap = gap;
    return this.lastSpawn;
  }

  /** One hop far ahead of the player, visible but always landed long before it matters. */
  private hopUpdate(o: Obstacle, dt: number, playerX: number): void {
    if (o.hop < 0) {
      if (!o.hopped && o.x < playerX + HOP_START) o.hop = 0;
      return;
    }
    o.hop += dt;
    const u = o.hop / HOP_TIME;
    if (u >= 1) {
      o.y = 0;
      o.hop = -1;
      o.hopped = true;
    } else {
      o.y = Math.round(4 * o.kind.hops * u * (1 - u));
    }
  }

  private altitude(k: ObstacleKind, rng: Rng): number {
    return k.minY === k.maxY ? k.minY : Math.round(k.minY + rng.next() * (k.maxY - k.minY));
  }

  private pairPartner(rng: Rng): ObstacleKind | null {
    let count = 0;
    for (let i = 0; i < this.table.length; i++) if (this.table[i].pairable) count++;
    if (count === 0) return null;
    let pick = Math.floor(rng.next() * count);
    for (let i = 0; i < this.table.length; i++) {
      if (!this.table[i].pairable) continue;
      if (pick-- === 0) return this.table[i];
    }
    return null;
  }

  private add(k: ObstacleKind, x: number, y: number): boolean {
    for (let i = 0; i < this.items.length; i++) {
      const o = this.items[i];
      if (o.active) continue;
      o.active = true;
      o.kind = k;
      o.x = o.prevX = x;
      o.y = y;
      o.closest = Infinity;
      o.over = false;
      o.passed = false;
      o.hop = -1;
      o.hopped = false;
      return true;
    }
    return false;
  }

  private pickKind(speed: number, rng: Rng): ObstacleKind {
    const t = this.table;
    let total = 0;
    for (let i = 0; i < t.length; i++) if (speed >= t[i].minSpeed) total += t[i].weight;
    let r = rng.next() * total;
    for (let i = 0; i < t.length; i++) {
      if (speed < t[i].minSpeed) continue;
      r -= t[i].weight;
      if (r < 0) return t[i];
    }
    return t[0];
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

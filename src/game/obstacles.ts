import { C } from '../render/palette.ts';
import type { Rng } from '../core/rng.ts';
import type { SurfConfig } from './config.ts';

export interface ObstacleKind {
  readonly name: 'jellyfish' | 'seaweed' | 'rock' | 'buoy' | 'rival';
  readonly w: number;
  readonly h: number;
  /** Placeholder color until the sprites exist. */
  readonly color: number;
  /** Appears only from this speed on. */
  readonly minSpeed: number;
  readonly weight: number;
}

/** Surf obstacles, all sitting on the surface. */
export const SURF_OBSTACLES: readonly ObstacleKind[] = [
  { name: 'jellyfish', w: 12, h: 8, color: C.rose, minSpeed: 0, weight: 2 },
  { name: 'seaweed', w: 22, h: 8, color: C.green, minSpeed: 0, weight: 2 },
  { name: 'rock', w: 26, h: 16, color: C.grey, minSpeed: 0, weight: 3 },
  { name: 'buoy', w: 10, h: 26, color: C.red, minSpeed: 215, weight: 2 },
  { name: 'rival', w: 18, h: 34, color: C.navy, minSpeed: 250, weight: 1 },
];

/** Small obstacles can come in pairs at higher speed. */
const PAIR_SPEED = 280;
const PAIR_CHANCE = 0.25;
const PAIR_SPACING = 4;

export interface Obstacle {
  active: boolean;
  kind: ObstacleKind;
  x: number;
  prevX: number;
}

/** What the last spawn produced, so the game can place a power-up in the gap. */
export interface SpawnInfo {
  spawned: boolean;
  /** Right edge of the new group. */
  groupEnd: number;
  /** Free distance after the group. */
  gap: number;
}

/**
 * Fixed-size pool of obstacles. Spawning is driven by distance travelled, so
 * spacing does not depend on the screen width.
 */
export class Obstacles {
  readonly items: Obstacle[];
  readonly lastSpawn: SpawnInfo = { spawned: false, groupEnd: 0, gap: 0 };
  private untilNext = 0;

  constructor(capacity = 16) {
    this.items = [];
    for (let i = 0; i < capacity; i++) this.items.push({ active: false, kind: SURF_OBSTACLES[0], x: 0, prevX: 0 });
  }

  reset(firstGap: number): void {
    for (let i = 0; i < this.items.length; i++) this.items[i].active = false;
    this.untilNext = firstGap;
    this.lastSpawn.spawned = false;
  }

  /** Moves obstacles left by `speed·dt`, recycles those off screen and spawns new ones at spawnX. */
  update(dt: number, speed: number, spawnX: number, rng: Rng, cfg: SurfConfig): SpawnInfo {
    const dx = speed * dt;
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      if (!o.active) continue;
      o.prevX = o.x;
      o.x -= dx;
      if (o.x + o.kind.w < -16) o.active = false;
    }
    this.lastSpawn.spawned = false;
    this.untilNext -= dx;
    if (this.untilNext > 0) return this.lastSpawn;

    const kind = pickKind(speed, rng);
    let width = kind.w;
    if (!this.add(kind, spawnX)) return this.lastSpawn;
    if (kind.h <= 8 && speed >= PAIR_SPEED && rng.next() < PAIR_CHANCE) {
      const second = SURF_OBSTACLES[rng.next() < 0.5 ? 0 : 1];
      if (this.add(second, spawnX + width + PAIR_SPACING)) width += PAIR_SPACING + second.w;
    }

    const difficulty = (speed - cfg.startSpeed) / (cfg.maxSpeed - cfg.startSpeed);
    const maxGapTime = cfg.maxGapTimeStart + (cfg.maxGapTimeEnd - cfg.maxGapTimeStart) * clamp01(difficulty);
    const gap = speed * rng.range(cfg.minGapTime, maxGapTime);
    this.untilNext = width + gap;
    this.lastSpawn.spawned = true;
    this.lastSpawn.groupEnd = spawnX + width;
    this.lastSpawn.gap = gap;
    return this.lastSpawn;
  }

  private add(kind: ObstacleKind, x: number): boolean {
    for (let i = 0; i < this.items.length; i++) {
      const o = this.items[i];
      if (o.active) continue;
      o.active = true;
      o.kind = kind;
      o.x = o.prevX = x;
      return true;
    }
    return false;
  }
}

function pickKind(speed: number, rng: Rng): ObstacleKind {
  let total = 0;
  for (let i = 0; i < SURF_OBSTACLES.length; i++) if (speed >= SURF_OBSTACLES[i].minSpeed) total += SURF_OBSTACLES[i].weight;
  let r = rng.next() * total;
  for (let i = 0; i < SURF_OBSTACLES.length; i++) {
    const k = SURF_OBSTACLES[i];
    if (speed < k.minSpeed) continue;
    r -= k.weight;
    if (r < 0) return k;
  }
  return SURF_OBSTACLES[0];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

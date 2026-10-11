import type { Rng } from '../core/rng.ts';

/** Dolphins in a pod. */
export const DOLPHIN_COUNT = 3;
/** Seconds the pod stays with the athlete. */
const DURATION = 11;
/** How fast the pod overtakes the athlete, px/s. */
const OVERTAKE = 60;
/** Jump cycle: airborne for AIR seconds every PERIOD seconds. */
const PERIOD = 1.5;
const AIR = 0.7;
const HEIGHT = 22;
const SPACING = 30;
/** Seconds before the first pod, and between pods. */
const FIRST: readonly [number, number] = [20, 35];
const BETWEEN: readonly [number, number] = [40, 70];

/**
 * A rare, harmless event: a pod of dolphins swims past, jumping. Jumping
 * at the same time next to one of them gives a bonus. Positions are
 * relative to the athlete, so they do not depend on the screen.
 */
export class Dolphins {
  active = false;
  time = 0;
  /** The bonus of this pod was already given. */
  scored = false;
  private wait = 0;

  reset(rng: Rng): void {
    this.active = false;
    this.time = 0;
    this.scored = false;
    this.wait = rng.range(FIRST[0], FIRST[1]);
  }

  update(dt: number, rng: Rng): void {
    if (this.active) {
      this.time += dt;
      if (this.time >= DURATION) {
        this.active = false;
        this.wait = rng.range(BETWEEN[0], BETWEEN[1]);
      }
      return;
    }
    this.wait -= dt;
    if (this.wait <= 0) {
      this.active = true;
      this.time = 0;
      this.scored = false;
    }
  }

  /** Horizontal offset of dolphin i from the athlete's left edge. */
  offset(i: number, time = this.time): number {
    return -60 - i * SPACING + time * OVERTAKE;
  }

  /** Seconds into dolphin i's jump cycle. */
  private cycle(i: number, time: number): number {
    return (time + i * 0.45) % PERIOD;
  }

  /** Altitude of dolphin i's belly; below zero while swimming. */
  altitude(i: number, time = this.time): number {
    const c = this.cycle(i, time);
    if (c >= AIR) return -4;
    const u = c / AIR;
    return 4 * HEIGHT * u * (1 - u);
  }

  /** 0 rising, 1 top, 2 diving, -1 underwater. */
  pose(i: number, time = this.time): number {
    const c = this.cycle(i, time);
    if (c >= AIR) return -1;
    const u = c / AIR;
    return u < 0.35 ? 0 : u < 0.65 ? 1 : 2;
  }

  /** Is any airborne dolphin within `range` px of the athlete? */
  jumpingNear(range: number): boolean {
    if (!this.active) return false;
    for (let i = 0; i < DOLPHIN_COUNT; i++) {
      if (this.altitude(i) > 4 && Math.abs(this.offset(i)) < range) return true;
    }
    return false;
  }
}

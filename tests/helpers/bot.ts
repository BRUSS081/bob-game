import { STEP } from '../../src/core/loop.ts';
import { AIR, SURFACE, UNDER, createAthlete, newBoxes, type Athlete } from '../../src/game/athletes.ts';
import { overlaps } from '../../src/game/collision.ts';
import { WING } from '../../src/game/config.ts';
import type { Game } from '../../src/game/game.ts';

const HOLDS = [0, 0.05, 0.1, 0.15, 0.2];

interface Sim {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  layer: number;
}

/**
 * A simple perfect player, used to prove the obstacle generator never
 * builds an impossible sequence. Surf and kite: when riding on would end
 * in a hit, it simulates the jump options and takes the first one that
 * clears that obstacle without touching anything. Wing foil: it flies at
 * the middle of the altitude window the next obstacles leave open.
 */
export class Bot {
  private holdLeft = 0;
  private readonly boxes = newBoxes();

  decide(g: Game): [boolean, boolean] {
    return g.sport === 'wing' ? this.wing(g) : this.jumper(g);
  }

  // ---------------------------------------------------------- surf and kite

  private jumper(g: Game): [boolean, boolean] {
    if (this.holdLeft > 0) {
      this.holdLeft -= STEP;
      return [false, this.holdLeft > 0];
    }
    if (g.athlete.state !== 'ride') return [false, false];
    const obs = this.snapshot(g);
    const threat = this.firstHit(g, obs, null, 1.2);
    if (threat < 0) return [false, false];
    const holds = g.sport === 'surf' ? HOLDS : [0];
    for (const hold of holds) {
      if (this.jumpClears(g, obs, hold, threat)) {
        this.holdLeft = hold;
        return [true, hold > 0];
      }
    }
    return [false, false];
  }

  private snapshot(g: Game): Sim[] {
    const inset = g.cfg.hitboxInset;
    return g.obstacles.items
      .filter((o) => o.active)
      .map((o) => ({ x: o.x + inset, y: o.y, w: o.kind.w - 2 * inset, h: o.kind.h - 1, vx: o.kind.vx, layer: o.kind.layer }));
  }

  /** Index of the first obstacle hit while simply riding on for `seconds`, or -1. */
  private firstHit(g: Game, obs: Sim[], athlete: Athlete | null, seconds: number, shift: number[] = []): number {
    const a = athlete ?? createAthlete(g.sport);
    for (let t = 0; t < seconds; t += STEP) {
      a.update(STEP, false, false);
      const hit = this.collide(g, a, obs, shift, true);
      if (hit >= 0) return hit;
    }
    return -1;
  }

  /** Advances obstacles one step (into `shift`) and returns the index hit, if any. */
  private collide(g: Game, a: Athlete, obs: Sim[], shift: number[], advance: boolean): number {
    const n = a.boxes(g.cfg.playerX, this.boxes);
    for (let i = 0; i < obs.length; i++) {
      if (advance) shift[i] = (shift[i] ?? 0) + (g.speed + obs[i].vx) * STEP;
      const o = obs[i];
      for (let b = 0; b < n; b++) {
        const box = this.boxes[b];
        if ((box.layers & o.layer) === 0) continue;
        // one pixel of margin for the speed ramp during the simulation
        if (overlaps(box.x - 1, box.y, box.w + 2, box.h, o.x - shift[i], o.y, o.w, o.h)) return i;
      }
    }
    return -1;
  }

  private jumpClears(g: Game, obs: Sim[], hold: number, threat: number): boolean {
    const a = createAthlete(g.sport);
    const shift: number[] = [];
    let t = 0;
    let pressed = true;
    for (let i = 0; i < 400; i++) {
      a.update(STEP, pressed, t < hold);
      pressed = false;
      t += STEP;
      if (this.collide(g, a, obs, shift, true) >= 0) return false;
      if (a.state === 'ride') break;
    }
    // useful only if the threatening obstacle is behind us after landing
    return this.firstHit(g, obs.map((o, i) => ({ ...o, x: o.x - (shift[i] ?? 0) })), a, 0.6) !== threat;
  }

  // ---------------------------------------------------------- wing foil

  private wing(g: Game): [boolean, boolean] {
    const a = g.athlete as Athlete & { vy: number };
    const [lo, hi] = this.window(g);
    const target = (lo + hi) / 2;
    const desired = Math.max(-60, Math.min(60, (target - a.y) * 9));
    return [false, a.vy < desired];
  }

  /** Altitude window the obstacles arriving in the next moment leave open. */
  private window(g: Game): [number, number] {
    let lo = 1;
    let hi = WING.breach - 2;
    const px = g.cfg.playerX;
    const inset = g.cfg.hitboxInset;
    for (const o of g.obstacles.items) {
      if (!o.active) continue;
      const k = o.kind;
      const ahead = o.x + inset - (px + 30);
      const behind = o.x + k.w - inset - (px - 10);
      // only obstacles between "about to arrive" and "not yet passed"
      if (behind < 0 || ahead > (g.speed + k.vx) * 0.55) continue;
      const top = o.y + k.h - 1;
      if (k.layer & SURFACE) lo = Math.max(lo, top + 1);
      if (k.layer & UNDER) lo = Math.max(lo, top + WING.mastLength + 2);
      if (k.layer & AIR) hi = Math.min(hi, o.y - 45);
    }
    return lo <= hi ? [lo, hi] : [hi, hi];
  }
}

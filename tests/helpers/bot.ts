import { STEP } from '../../src/core/loop.ts';
import { overlaps } from '../../src/game/collision.ts';
import { SURF } from '../../src/game/config.ts';
import type { Game } from '../../src/game/game.ts';
import { createSurfer, updateSurfer } from '../../src/game/surfer.ts';

const HOLDS = [0, 0.05, 0.1, 0.15, 0.2];
const inset = SURF.hitboxInset;
const px = SURF.playerX + inset;
const pw = SURF.playerW - 2 * inset;
const ph = SURF.playerH - inset;

/**
 * A simple perfect player: before each obstacle it simulates the jump
 * options against the obstacles on screen and takes the first one that
 * clears the next obstacle without touching anything. Used to prove the
 * obstacle generator never builds an impossible sequence.
 */
export class Bot {
  private holdLeft = 0;

  /** Returns [pressed, held] for this step. */
  decide(g: Game): [boolean, boolean] {
    if (this.holdLeft > 0) {
      this.holdLeft -= STEP;
      return [false, this.holdLeft > 0];
    }
    if (g.surfer.state !== 'ride') return [false, false];
    const next = this.nextObstacle(g);
    if (next < 0) return [false, false];
    // not worth jumping yet if the obstacle is more than a full jump away
    if (next - px > g.speed * 0.7) return [false, false];
    for (const hold of HOLDS) {
      if (this.safe(g, hold)) {
        this.holdLeft = hold;
        return [true, hold > 0];
      }
    }
    return [false, false];
  }

  /** x of the nearest obstacle not yet passed, or -1. */
  private nextObstacle(g: Game): number {
    let best = -1;
    for (const o of g.obstacles.items) {
      if (!o.active || o.x + o.kind.w - inset <= px) continue;
      if (best < 0 || o.x < best) best = o.x;
    }
    return best;
  }

  private safe(g: Game, hold: number): boolean {
    const s = createSurfer();
    const obs = g.obstacles.items.filter((o) => o.active).map((o) => ({ x: o.x, w: o.kind.w, h: o.kind.h }));
    const nearest = Math.min(...obs.filter((o) => o.x + o.w - inset > px).map((o) => o.x));
    let t = 0;
    let shift = 0;
    let pressed = true;
    for (let i = 0; i < 200; i++) {
      updateSurfer(s, STEP, pressed, t < hold, SURF);
      pressed = false;
      t += STEP;
      shift += g.speed * STEP;
      for (const o of obs) {
        // one extra pixel of margin for the speed ramp during the jump
        if (overlaps(px - 1, s.y, pw + 2, ph, o.x - shift + inset, 0, o.w - 2 * inset, o.h)) return false;
      }
      if (s.state === 'ride') {
        const passed = obs.filter((o) => o.x === nearest).every((o) => o.x - shift + o.w - inset <= px);
        return passed;
      }
    }
    return false;
  }
}

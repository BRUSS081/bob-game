import { STEP } from '../../src/core/loop.ts';
import { SURF } from '../../src/game/config.ts';
import { createSurfer, updateSurfer, type SurferEvent } from '../../src/game/surfer.ts';

export interface JumpProfile {
  /** Altitude after each step, until landing. */
  altitudes: number[];
  apex: number;
  airtime: number;
  landing: SurferEvent;
}

/**
 * Simulates one jump: press, hold for `hold` seconds, then release.
 * Optionally taps again `trickAt` seconds after takeoff.
 */
export function simulateJump(hold: number, trickAt = -1): JumpProfile {
  const s = createSurfer();
  const altitudes: number[] = [];
  let t = 0;
  let event: SurferEvent = updateSurfer(s, STEP, true, hold > 0, SURF);
  altitudes.push(s.y);
  let tricked = false;
  while (s.state === 'air' && altitudes.length < 10000) {
    t += STEP;
    const pressed = trickAt >= 0 && !tricked && t >= trickAt;
    if (pressed) tricked = true;
    event = updateSurfer(s, STEP, pressed, t < hold, SURF);
    altitudes.push(s.y);
  }
  return { altitudes, apex: Math.max(...altitudes), airtime: altitudes.length * STEP, landing: event };
}

/** Longest continuous time spent at or above `height`. */
export function timeAbove(p: JumpProfile, height: number): number {
  let best = 0;
  let run = 0;
  for (const y of p.altitudes) {
    run = y >= height ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best * STEP;
}

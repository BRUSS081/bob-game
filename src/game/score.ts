import { SCORING } from './config.ts';

/**
 * Score = distance points + trick points. Each clean trick in a row raises
 * the multiplier (x1, x2, ... up to the max); a jump landed without a trick
 * breaks the chain.
 */
export interface Score {
  distancePoints: number;
  trickPoints: number;
  /** Clean tricks in a row. */
  combo: number;
}

export function createScore(): Score {
  return { distancePoints: 0, trickPoints: 0, combo: 0 };
}

export function resetScore(s: Score): void {
  s.distancePoints = 0;
  s.trickPoints = 0;
  s.combo = 0;
}

export function addDistance(s: Score, px: number, boosted: boolean): void {
  s.distancePoints += px * SCORING.pointsPerPx * (boosted ? SCORING.powerFactor : 1);
}

/** Current multiplier for the next clean trick. */
export function nextMultiplier(s: Score): number {
  return Math.min(s.combo + 1, SCORING.maxMultiplier);
}

/** Records a clean trick landing; returns the points awarded. */
export function landTrick(s: Score, boosted: boolean): number {
  const points = SCORING.trickBase * nextMultiplier(s) * (boosted ? SCORING.powerFactor : 1);
  s.combo++;
  s.trickPoints += points;
  return points;
}

/** A jump landed without a trick ends the combo. */
export function landPlain(s: Score): void {
  s.combo = 0;
}

export function total(s: Score): number {
  return Math.floor(s.distancePoints) + s.trickPoints;
}

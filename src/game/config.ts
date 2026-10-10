/**
 * Surf tuning. Distances in game pixels, times in seconds, speeds in px/s.
 * Altitudes are measured upward from the sea surface the athlete rides on.
 */
export const SURF = {
  /** Player hitbox: left edge in the view, size. */
  playerX: 48,
  playerW: 16,
  playerH: 38,

  /** Tap: low and fast jump. Holding lowers gravity for up to maxHoldTime. */
  jumpVelocity: 270,
  gravity: 1500,
  holdGravity: 450,
  maxHoldTime: 0.2,

  /** A second tap in the air starts one full rotation. */
  trickDuration: 0.3,
  /** Landing with at most this share of the rotation left still counts as clean. */
  trickTolerance: 0.2,

  startSpeed: 190,
  maxSpeed: 450,
  acceleration: 3,

  /** Time between obstacle groups at the current speed: min, and max at start / at top speed. */
  minGapTime: 0.8,
  maxGapTimeStart: 1.9,
  maxGapTimeEnd: 1.2,
  /** Distance before the first obstacle. */
  firstGap: 320,
  /** Forgiveness: hitboxes shrink by this much on each side. */
  hitboxInset: 2,

  /** "Perfect wave" power-up. */
  powerUpSize: 12,
  powerUpMinInterval: 15,
  powerUpChance: 0.4,
  perfectWaveTime: 6,
  /** Extra protection when it ends, so an obstacle already overlapping is not an instant wipeout. */
  powerGrace: 0.8,

  /** Presses are ignored this long after a wipeout, so a late tap does not restart by mistake. */
  restartDelay: 0.5,
} as const;

export type SurfConfig = typeof SURF;

export const SCORING = {
  /** Distance points per pixel travelled. */
  pointsPerPx: 0.1,
  /** Points for a clean trick, times the combo multiplier. */
  trickBase: 100,
  maxMultiplier: 5,
  /** Points factor while the perfect wave is active. */
  powerFactor: 2,
} as const;

/** Height of the water band below the surface line, in game pixels. */
export const SEA_DEPTH = 58;
/** Views taller than this (portrait phones) split the extra height between sky and sea. */
const BAND_HEIGHT = 300;

/** Y of the surface line the athlete rides on, for a view of the given height. */
export function surfaceY(height: number): number {
  const extra = Math.max(0, height - BAND_HEIGHT);
  return height - SEA_DEPTH - Math.round(extra * 0.5);
}

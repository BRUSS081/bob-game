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

/** Settings every sport shares: speed ramp, obstacle spacing, hitbox, power-ups. */
export interface RunConfig {
  readonly playerX: number;
  readonly playerW: number;
  readonly playerH: number;
  readonly hitboxInset: number;
  readonly startSpeed: number;
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly minGapTime: number;
  readonly maxGapTimeStart: number;
  readonly maxGapTimeEnd: number;
  readonly firstGap: number;
  readonly powerUpSize: number;
  readonly powerUpMinInterval: number;
  readonly powerUpChance: number;
  readonly perfectWaveTime: number;
  readonly powerGrace: number;
  readonly restartDelay: number;
}

/**
 * Kitesurf: a tap is a high jump with long hangtime; pressing and holding
 * again in the air spins, one or more full turns. The kite flies above
 * and ahead of the rider and has its own hitbox.
 */
export const KITE = {
  ...SURF,
  jumpVelocity: 300,
  gravity: 620,
  /** Seconds per full spin while the button is held in the air. */
  spinTime: 0.42,
  /** Landing with this share of a turn left (or past) is still clean. */
  spinTolerance: 0.15,
  /** Kite hitbox relative to the rider: left edge, bottom altitude, size. */
  kiteX: 12,
  kiteY: 86,
  kiteW: 38,
  kiteH: 11,
  startSpeed: 200,
  maxSpeed: 460,
  acceleration: 3,
  // a kite jump lasts about a second, so obstacles need more room
  minGapTime: 1.15,
  maxGapTimeStart: 2.3,
  maxGapTimeEnd: 1.6,
  firstGap: 380,
  /** Wind gust power-up: mega jump, untouchable until landing. */
  gustVelocity: 380,
} as const;

export type KiteConfig = typeof KITE;

/**
 * Wing foil: holding the button lifts the foil, releasing lets it sink.
 * The board flies between the water (slows you down) and the breach
 * height (the foil leaves the water: wipeout).
 */
export const WING = {
  ...SURF,
  lift: 440,
  sink: 400,
  maxClimb: 60,
  /** Board altitude where the foil breaches. */
  breach: 20,
  /** From the board's underside to the foil wing. */
  mastLength: 22,
  startAltitude: 10,
  /** Speed while the board drags in the water, recovering per second after. */
  dragFactor: 0.6,
  dragRecovery: 0.8,
  startSpeed: 180,
  maxSpeed: 420,
  acceleration: 2.8,
  minGapTime: 0.8,
  maxGapTimeStart: 1.9,
  maxGapTimeEnd: 1.25,
  firstGap: 340,
  /** Wind gust power-up: faster, higher breach limit, untouchable. */
  gustTime: 5,
  gustSpeed: 1.25,
  gustBreach: 34,
} as const;

export type WingConfig = typeof WING;

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

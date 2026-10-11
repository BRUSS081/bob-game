/** Every game on the home carousel, in order. The runner has its own setup screen. */
export const GAME_IDS = [
  'runner',
  'swells',
  'fishing',
  'freedive',
  'snap',
  'sup',
  'regatta',
  'slalom',
  'wreck',
  'raft',
  'reef',
  'gull',
  'aquarium',
] as const;

export type GameId = (typeof GAME_IDS)[number];
/** Games with their own screen (everything but the runner). */
export type MiniGameId = Exclude<GameId, 'runner'>;

export function isGameId(v: unknown): v is GameId {
  return typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);
}

/** Games whose score is a time: lower is better. */
export const LOWER_IS_BETTER: ReadonlySet<GameId> = new Set<GameId>(['sup', 'regatta']);

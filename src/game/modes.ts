/** Ways to play the runner, in the order of the mode selector. */
export const RUN_MODES = ['endless', 'daily', 'triathlon', 'sixty', 'bigwave', 'tour', 'freeride'] as const;
export type RunMode = (typeof RUN_MODES)[number];

export function isRunMode(v: unknown): v is RunMode {
  return typeof v === 'string' && (RUN_MODES as readonly string[]).includes(v);
}

/** Modes that ignore the chosen sport. */
export function modeHasSport(mode: RunMode): boolean {
  return mode !== 'triathlon' && mode !== 'tour';
}

/** Key of the saved best score for a mode and sport, or null when the mode keeps none. */
export function modeBestKey(mode: RunMode, sport: string): string | null {
  switch (mode) {
    case 'endless':
      return sport;
    case 'triathlon':
      return 'triathlon';
    case 'sixty':
    case 'bigwave':
      return `${mode}.${sport}`;
    default:
      return null;
  }
}

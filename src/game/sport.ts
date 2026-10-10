export const SPORTS = ['surf', 'kite', 'wing'] as const;
export type SportId = (typeof SPORTS)[number];

export function isSport(value: unknown): value is SportId {
  return typeof value === 'string' && (SPORTS as readonly string[]).includes(value);
}

/** Next or previous sport in the list, wrapping around. */
export function cycleSport(sport: SportId, step: number): SportId {
  const i = SPORTS.indexOf(sport);
  return SPORTS[(i + step + SPORTS.length) % SPORTS.length];
}

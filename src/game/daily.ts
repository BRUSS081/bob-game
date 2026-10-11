import type { SportId } from './sport.ts';

/** Local calendar day, "YYYY-MM-DD": the daily challenge changes at the player's midnight. */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Seed of the daily challenge: the same run for everyone on the same day and sport. */
export function dailySeed(day: string, sport: SportId): number {
  // FNV-1a, 32 bit
  let h = 0x811c9dc5;
  const text = `bob:${day}:${sport}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}

import type { Sky } from '../render/renderer.ts';
import type { SportId } from './sport.ts';

/**
 * The world tour: twelve spots in a row, each a fixed run (seed) of one
 * sport and time of day, with a finish line. Finishing gives one star;
 * scoring past two thresholds gives the second and the third.
 */
export interface TourSpot {
  readonly id: string;
  readonly name: string;
  readonly sport: SportId;
  readonly sky: Sky;
  readonly seed: number;
  /** Distance of the finish line, in game pixels. */
  readonly finish: number;
  /** Points for the second and third star. */
  readonly stars: readonly [number, number];
}

const list: [string, SportId, Sky][] = [
  ['BIARRITZ', 'surf', 'dawn'],
  ['TARIFA', 'kite', 'day'],
  ['MAUI', 'wing', 'day'],
  ['PENICHE', 'surf', 'sunset'],
  ['DAKHLA', 'kite', 'sunset'],
  ['SARDINIA', 'wing', 'dawn'],
  ['BALI', 'surf', 'day'],
  ['CAPE TOWN', 'kite', 'day'],
  ['HOOKIPA', 'wing', 'sunset'],
  ['TEAHUPOO', 'surf', 'night'],
  ['CABARETE', 'kite', 'night'],
  ['NAZARE', 'surf', 'day'],
];

function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  return h || 1;
}

export const TOUR_SPOTS: readonly TourSpot[] = list.map(([name, sport, sky], i) => {
  const finish = 3000 + i * 600;
  // distance alone gives finish * 0.1 points; the stars ask for tricks and close calls on top
  const base = finish * 0.1;
  return { id: name.toLowerCase().replace(/ /g, '-'), name, sport, sky, seed: seedOf(name), finish, stars: [Math.round(base * 1.6), Math.round(base * 2.6)] };
});

/** Stars earned by a finished run of a spot. */
export function starsFor(spot: TourSpot, points: number, finished: boolean): number {
  if (!finished) return 0;
  return points >= spot.stars[1] ? 3 : points >= spot.stars[0] ? 2 : 1;
}

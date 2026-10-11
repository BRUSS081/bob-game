import type { Rng } from '../core/rng.ts';
import { C } from '../render/palette.ts';

/**
 * Every creature of the sea games, shared by fishing, freedive, snap, the
 * aquarium and the album. Fish are drawn by one generator from a few
 * numbers (see sprites/fish.ts); the other creatures have their own drawings.
 */

export type Rarity = 1 | 2 | 3 | 4;
export type Body = 'torpedo' | 'oval' | 'disc' | 'long' | 'round';
export type Tail = 'fork' | 'lunate' | 'round' | 'fan' | 'clip' | 'shark' | 'none';
export type Fin = 'low' | 'tall' | 'sail' | 'spiky' | 'long' | 'shark';
export type Pattern = 'plain' | 'vstripes' | 'hstripes' | 'spots' | 'bands' | 'scales' | 'mask';

export interface FishLook {
  /** Body length and height in pixels, without tail and fins. */
  len: number;
  h: number;
  body: Body;
  tail: Tail;
  fin: Fin;
  pattern: Pattern;
  back: number;
  side: number;
  belly: number;
  accent: number;
  fins: number;
  /** Fins under the body too (disc fish). */
  anal?: boolean;
  bill?: boolean;
  lure?: boolean;
  wings?: boolean;
  gills?: boolean;
}

export type CreatureKind = 'fish' | 'turtle' | 'manta' | 'octopus' | 'jelly' | 'seahorse' | 'dolphin' | 'squid' | 'crab' | 'star';

export interface Creature {
  id: string;
  kind: CreatureKind;
  rarity: Rarity;
  /** Size range in centimeters (fishing). */
  size: readonly [number, number];
  /** Depth range, 0 at the surface and 1 at the sea floor. */
  depth: readonly [number, number];
  /** Only at night (true) or only by day (false); undefined: always. */
  night?: boolean;
  /** Can it be caught with a hook? */
  hookable: boolean;
  /** Swimming speed in pixels per second. */
  speed: number;
  look?: FishLook;
}

const fish = (
  id: string,
  rarity: Rarity,
  size: readonly [number, number],
  depth: readonly [number, number],
  speed: number,
  look: FishLook,
  night?: boolean,
): Creature => ({ id, kind: 'fish', rarity, size, depth, speed, look, night, hookable: true });

const other = (id: CreatureKind, rarity: Rarity, depth: readonly [number, number], speed: number, night?: boolean): Creature => ({
  id,
  kind: id,
  rarity,
  size: [0, 0],
  depth,
  speed,
  night,
  hookable: false,
});

export const CREATURES: readonly Creature[] = [
  fish('sardine', 1, [12, 20], [0, 0.35], 34, { len: 11, h: 4, body: 'torpedo', tail: 'fork', fin: 'low', pattern: 'plain', back: C.blue, side: C.silver, belly: C.white, accent: C.blue, fins: C.silver }),
  fish('mackerel', 1, [25, 40], [0.05, 0.45], 40, { len: 15, h: 5, body: 'torpedo', tail: 'fork', fin: 'low', pattern: 'hstripes', back: C.teal, side: C.silver, belly: C.white, accent: C.deep, fins: C.grey }),
  fish('bream', 1, [20, 45], [0.3, 0.75], 24, { len: 15, h: 8, body: 'oval', tail: 'fork', fin: 'spiky', pattern: 'mask', back: C.grey, side: C.silver, belly: C.white, accent: C.gold, fins: C.grey }),
  fish('bass', 1, [30, 70], [0.2, 0.65], 28, { len: 18, h: 6, body: 'torpedo', tail: 'fork', fin: 'spiky', pattern: 'plain', back: C.slate, side: C.silver, belly: C.white, accent: C.grey, fins: C.grey }),
  fish('clownfish', 2, [8, 11], [0.55, 0.95], 18, { len: 10, h: 5, body: 'oval', tail: 'round', fin: 'low', pattern: 'bands', back: C.orange, side: C.orange, belly: C.orange, accent: C.white, fins: C.orange }),
  fish('tang', 2, [15, 30], [0.4, 0.85], 22, { len: 13, h: 8, body: 'disc', tail: 'lunate', fin: 'long', pattern: 'mask', back: C.navy, side: C.blue, belly: C.sky, accent: C.navy, fins: C.gold, anal: true }),
  fish('butterflyfish', 2, [10, 20], [0.5, 0.95], 16, { len: 11, h: 10, body: 'disc', tail: 'round', fin: 'tall', pattern: 'mask', back: C.gold, side: C.gold, belly: C.sun, accent: C.ink, fins: C.gold, anal: true }),
  fish('angelfish', 3, [15, 30], [0.6, 1], 14, { len: 11, h: 11, body: 'disc', tail: 'fan', fin: 'sail', pattern: 'vstripes', back: C.sun, side: C.sun, belly: C.white, accent: C.navy, fins: C.gold, anal: true }),
  fish('parrotfish', 2, [30, 60], [0.4, 0.85], 20, { len: 17, h: 8, body: 'oval', tail: 'lunate', fin: 'low', pattern: 'scales', back: C.sea, side: C.turquoise, belly: C.rose, accent: C.rose, fins: C.rose }),
  fish('lionfish', 3, [20, 35], [0.6, 1], 12, { len: 13, h: 7, body: 'oval', tail: 'fan', fin: 'spiky', pattern: 'vstripes', back: C.red, side: C.coral, belly: C.rose, accent: C.white, fins: C.coral, anal: true, wings: true }),
  fish('pufferfish', 2, [15, 35], [0.3, 0.8], 12, { len: 11, h: 10, body: 'round', tail: 'round', fin: 'low', pattern: 'spots', back: C.brown, side: C.tan, belly: C.white, accent: C.ink, fins: C.tan }),
  fish('moray', 3, [60, 150], [0.8, 1], 14, { len: 30, h: 5, body: 'long', tail: 'none', fin: 'long', pattern: 'spots', back: C.forest, side: C.green, belly: C.green, accent: C.gold, fins: C.forest }, true),
  fish('flyingfish', 2, [20, 35], [0, 0.2], 46, { len: 13, h: 4, body: 'torpedo', tail: 'fork', fin: 'low', pattern: 'plain', back: C.blue, side: C.sky, belly: C.white, accent: C.blue, fins: C.skyLight, wings: true }, false),
  fish('tuna', 3, [80, 200], [0.25, 0.75], 44, { len: 27, h: 10, body: 'torpedo', tail: 'lunate', fin: 'low', pattern: 'plain', back: C.navy, side: C.silver, belly: C.white, accent: C.gold, fins: C.gold }),
  fish('mahimahi', 3, [60, 120], [0.05, 0.4], 40, { len: 23, h: 9, body: 'oval', tail: 'fork', fin: 'long', pattern: 'spots', back: C.teal, side: C.green, belly: C.gold, accent: C.blue, fins: C.teal }),
  fish('barracuda', 2, [60, 150], [0.25, 0.7], 38, { len: 27, h: 5, body: 'long', tail: 'fork', fin: 'low', pattern: 'vstripes', back: C.slate, side: C.silver, belly: C.white, accent: C.grey, fins: C.grey }),
  fish('grouper', 3, [50, 120], [0.7, 1], 14, { len: 23, h: 11, body: 'oval', tail: 'round', fin: 'spiky', pattern: 'spots', back: C.brown, side: C.tan, belly: C.tan, accent: C.brown, fins: C.brown }),
  fish('snapper', 2, [30, 70], [0.5, 0.9], 24, { len: 17, h: 8, body: 'oval', tail: 'fork', fin: 'spiky', pattern: 'plain', back: C.red, side: C.coral, belly: C.rose, accent: C.red, fins: C.coral }),
  fish('trevally', 2, [40, 90], [0.2, 0.6], 36, { len: 19, h: 9, body: 'oval', tail: 'lunate', fin: 'low', pattern: 'plain', back: C.sky, side: C.silver, belly: C.white, accent: C.gold, fins: C.gold }),
  fish('swordfish', 4, [150, 300], [0.6, 1], 42, { len: 33, h: 9, body: 'torpedo', tail: 'lunate', fin: 'tall', pattern: 'plain', back: C.indigo, side: C.grey, belly: C.silver, accent: C.slate, fins: C.indigo, bill: true }),
  fish('marlin', 4, [200, 400], [0.3, 0.7], 46, { len: 35, h: 10, body: 'torpedo', tail: 'lunate', fin: 'sail', pattern: 'vstripes', back: C.navy, side: C.blue, belly: C.white, accent: C.skyLight, fins: C.navy, bill: true }),
  fish('anglerfish', 4, [20, 60], [0.85, 1], 8, { len: 13, h: 10, body: 'round', tail: 'round', fin: 'low', pattern: 'plain', back: C.navy, side: C.indigo, belly: C.slate, accent: C.sun, fins: C.indigo, lure: true }, true),
  fish('lanternfish', 2, [5, 12], [0.6, 1], 26, { len: 9, h: 4, body: 'torpedo', tail: 'fork', fin: 'low', pattern: 'spots', back: C.navy, side: C.indigo, belly: C.slate, accent: C.aqua, fins: C.indigo }, true),
  fish('sunfish', 4, [150, 250], [0.1, 0.5], 10, { len: 20, h: 18, body: 'disc', tail: 'clip', fin: 'sail', pattern: 'plain', back: C.grey, side: C.silver, belly: C.mist, accent: C.grey, fins: C.grey, anal: true }, false),
  fish('shark', 3, [100, 250], [0.3, 0.9], 34, { len: 34, h: 9, body: 'torpedo', tail: 'shark', fin: 'shark', pattern: 'plain', back: C.slate, side: C.grey, belly: C.mist, accent: C.slate, fins: C.slate, gills: true }),
  other('turtle', 3, [0.2, 0.8], 14),
  other('manta', 4, [0.3, 0.8], 18),
  other('octopus', 3, [0.8, 1], 8),
  other('jelly', 1, [0.1, 0.8], 6),
  other('seahorse', 3, [0.7, 1], 4),
  other('dolphin', 2, [0, 0.3], 60, false),
  other('squid', 2, [0.4, 1], 20, true),
  other('crab', 1, [1, 1], 6),
  other('star', 1, [1, 1], 0),
];

export const CREATURE_IDS: readonly string[] = CREATURES.map((c) => c.id);
const BY_ID = new Map(CREATURES.map((c) => [c.id, c]));

export function creature(id: string): Creature | undefined {
  return BY_ID.get(id);
}

/** Points of a creature in the games: rarer is worth more. */
export const RARITY_POINTS: Record<Rarity, number> = { 1: 10, 2: 25, 3: 60, 4: 150 };

/** Can this creature be met at this depth and time? */
export function lives(c: Creature, depth: number, night: boolean): boolean {
  if (c.night === true && !night) return false;
  if (c.night === false && night) return false;
  return depth >= c.depth[0] - 0.05 && depth <= c.depth[1] + 0.05;
}

/** Weight of a rarity when picking at random: commons are everywhere, legends are rare. */
const WEIGHT: Record<Rarity, number> = { 1: 10, 2: 5, 3: 2, 4: 0.6 };

/**
 * Picks a creature living at `depth` (0..1); `filter` narrows the list
 * (hookable fish, swimmers...). No allocation: two passes over the list.
 */
export function pickCreature(rng: Rng, depth: number, night: boolean, filter: (c: Creature) => boolean): Creature | null {
  let total = 0;
  for (const c of CREATURES) if (filter(c) && lives(c, depth, night)) total += WEIGHT[c.rarity];
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const c of CREATURES) {
    if (!filter(c) || !lives(c, depth, night)) continue;
    roll -= WEIGHT[c.rarity];
    if (roll <= 0) return c;
  }
  return null;
}

/** Real local time decides day or night in the sea games (no data leaves the device). */
export function isNight(date: Date = new Date()): boolean {
  const h = date.getHours();
  return h >= 20 || h < 6;
}

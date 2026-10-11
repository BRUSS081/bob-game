import type { Rng } from '../core/rng.ts';
import type { SportId } from '../game/sport.ts';
import { BASE_GEAR_COUNT, GEAR_COLORS, HAIR_COLORS, LENS_COLORS, SKIN_TONES, type SlotRamps } from '../sprites/ramps.ts';

/** Special gear colors the player has unlocked (indices into GEAR_COLORS). */
export type Unlocked = ReadonlySet<number>;
const NONE_UNLOCKED: Unlocked = new Set();

/** Can this option take this value? Special gear colors need to be unlocked. */
export function available(spec: OptionSpec, v: number, unlocked: Unlocked = NONE_UNLOCKED): boolean {
  return spec.kind !== 'gear' || v < BASE_GEAR_COUNT || unlocked.has(v);
}

export type CharacterId = 'bob' | 'bobba';
export const CHARACTERS: readonly CharacterId[] = ['bob', 'bobba'];

export const HAIR_STYLES = ['short', 'mohawk', 'ponytail', 'long', 'bun', 'curly'] as const;
export const SUIT_STYLES = ['full', 'shorty', 'rashguard', 'swimsuit', 'bikini'] as const;
/** Suit styles a random BOB look picks from (anyone can choose any style by hand). */
const BOB_RANDOM_SUITS = [0, 1, 2];
export const BOARD_ART = ['none', 'stripe', 'split', 'rails', 'dots'] as const;
export const GEAR_PATTERNS = ['solid', 'split', 'stripes', 'tips'] as const;

/** Everything a player can change. Numbers index the lists above or the color ramps; -1 means "none". */
export interface AthleteConfig {
  character: CharacterId;
  skin: number;
  hairStyle: number;
  hairColor: number;
  suitStyle: number;
  suitA: number;
  suitB: number;
  helmet: number;
  glasses: number;
  harness: number;
  board: number;
  boardArt: number;
  boardArtColor: number;
  /** Kite or wing canopy. */
  gearA: number;
  /** Kite or wing leading edge and pattern. */
  gearB: number;
  gearPattern: number;
  foil: number;
}

export type OptionKey = Exclude<keyof AthleteConfig, 'character'> | 'character';
export type OptionKind = 'character' | 'style' | 'skin' | 'hair' | 'gear' | 'lens';

/** Customization tabs: who the athlete is, what they wear, what they ride. */
export type Tab = 'athlete' | 'suit' | 'gear';
export const TABS: readonly Tab[] = ['athlete', 'suit', 'gear'];

export interface OptionSpec {
  key: OptionKey;
  tab: Tab;
  kind: OptionKind;
  /** Number of values; with `none`, -1 is allowed too. */
  count: number;
  none: boolean;
  /** Sports where the option shows. */
  sports: readonly SportId[];
  /** Names for 'style' options. */
  names?: readonly string[];
}

const ALL: readonly SportId[] = ['surf', 'kite', 'wing'];

export const OPTIONS: readonly OptionSpec[] = [
  { key: 'character', tab: 'athlete', kind: 'character', count: CHARACTERS.length, none: false, sports: ALL },
  { key: 'skin', tab: 'athlete', kind: 'skin', count: SKIN_TONES.length, none: false, sports: ALL },
  { key: 'hairStyle', tab: 'athlete', kind: 'style', count: HAIR_STYLES.length, none: false, sports: ALL, names: HAIR_STYLES },
  { key: 'hairColor', tab: 'athlete', kind: 'hair', count: HAIR_COLORS.length, none: false, sports: ALL },
  { key: 'suitStyle', tab: 'suit', kind: 'style', count: SUIT_STYLES.length, none: false, sports: ALL, names: SUIT_STYLES },
  { key: 'suitA', tab: 'suit', kind: 'gear', count: GEAR_COLORS.length, none: false, sports: ALL },
  { key: 'suitB', tab: 'suit', kind: 'gear', count: GEAR_COLORS.length, none: false, sports: ALL },
  { key: 'helmet', tab: 'athlete', kind: 'gear', count: GEAR_COLORS.length, none: true, sports: ALL },
  { key: 'glasses', tab: 'athlete', kind: 'lens', count: LENS_COLORS.length, none: true, sports: ALL },
  { key: 'harness', tab: 'suit', kind: 'gear', count: GEAR_COLORS.length, none: false, sports: ['kite', 'wing'] },
  { key: 'board', tab: 'gear', kind: 'gear', count: GEAR_COLORS.length, none: false, sports: ALL },
  { key: 'boardArt', tab: 'gear', kind: 'style', count: BOARD_ART.length, none: false, sports: ALL, names: BOARD_ART },
  { key: 'boardArtColor', tab: 'gear', kind: 'gear', count: GEAR_COLORS.length, none: false, sports: ALL },
  { key: 'gearA', tab: 'gear', kind: 'gear', count: GEAR_COLORS.length, none: false, sports: ['kite', 'wing'] },
  { key: 'gearB', tab: 'gear', kind: 'gear', count: GEAR_COLORS.length, none: false, sports: ['kite', 'wing'] },
  { key: 'gearPattern', tab: 'gear', kind: 'style', count: GEAR_PATTERNS.length, none: false, sports: ['kite', 'wing'], names: GEAR_PATTERNS },
  { key: 'foil', tab: 'gear', kind: 'gear', count: GEAR_COLORS.length, none: false, sports: ['wing'] },
];

/** Options of the athlete tab (the body): the same in every sport. Suit and gear stay per sport. */
export const BODY_KEYS: readonly Exclude<OptionKey, 'character'>[] = OPTIONS.filter((o) => o.tab === 'athlete' && o.key !== 'character').map(
  (o) => o.key as Exclude<OptionKey, 'character'>,
);

/** Gear color indices, named for readability. */
const G = { black: 0, navy: 1, coral: 2, red: 3, gold: 4, orange: 5, green: 6, violet: 7, magenta: 8, sky: 9, white: 10 } as const;

/**
 * Signature looks. BOB: tan skin, short dark-brown quiff, navy and coral.
 * BOBBA: brown skin, black high ponytail, violet and gold. Same faces and
 * colors in every sport, only the suit cut and the gear change.
 */
export function defaultConfig(character: CharacterId, sport: SportId): AthleteConfig {
  const bob = character === 'bob';
  const base: AthleteConfig = {
    character,
    skin: bob ? 2 : 5,
    hairStyle: bob ? 0 : 2,
    hairColor: bob ? 1 : 0,
    // BOB: rash guard and board shorts; BOBBA: a sporty one-piece swimsuit
    suitStyle: bob ? 2 : 3,
    suitA: bob ? G.coral : G.violet,
    suitB: bob ? G.navy : G.gold,
    helmet: -1,
    glasses: -1,
    harness: bob ? G.coral : G.gold,
    board: G.white,
    boardArt: bob ? 1 : 2,
    boardArtColor: bob ? G.coral : G.violet,
    gearA: bob ? G.coral : G.violet,
    gearB: bob ? G.gold : G.gold,
    gearPattern: bob ? 1 : 3,
    foil: G.black,
  };
  if (sport === 'kite') {
    base.suitStyle = 0;
    base.suitA = bob ? G.navy : G.violet;
    base.suitB = bob ? G.coral : G.gold;
    base.board = bob ? G.navy : G.magenta;
    base.boardArtColor = bob ? G.coral : G.gold;
  } else if (sport === 'wing') {
    base.suitStyle = 1;
    base.suitA = bob ? G.navy : G.violet;
    base.suitB = bob ? G.coral : G.gold;
  }
  return base;
}

export function optionValue(c: AthleteConfig, key: OptionKey): number {
  return key === 'character' ? CHARACTERS.indexOf(c.character) : c[key];
}

/** Steps an option forward or back, wrapping around (through "none" where allowed), skipping locked colors. */
export function stepOption(c: AthleteConfig, spec: OptionSpec, step: number, unlocked: Unlocked = NONE_UNLOCKED): void {
  const min = spec.none ? -1 : 0;
  const span = spec.count - min;
  let next = optionValue(c, spec.key);
  for (let i = 0; i < span; i++) {
    next = ((next - min + step) % span + span) % span + min;
    if (available(spec, next, unlocked)) break;
  }
  if (spec.key === 'character') c.character = CHARACTERS[next];
  else c[spec.key] = next;
}

/** Random look that keeps the character (BOB stays BOB) and only touches options this sport shows. */
export function randomize(c: AthleteConfig, sport: SportId, rng: Rng, unlocked: Unlocked = NONE_UNLOCKED): void {
  for (const spec of OPTIONS) {
    if (spec.key === 'character' || !spec.sports.includes(sport)) continue;
    const min = spec.none ? -1 : 0;
    // "none" is less likely, so most random looks show some gear
    let v = min + Math.floor(rng.next() * (spec.count - min));
    if (spec.none && v === -1 && rng.next() < 0.5) v = Math.floor(rng.next() * spec.count);
    // a locked color falls back to an open one
    if (!available(spec, v, unlocked)) v = v % BASE_GEAR_COUNT;
    if (spec.key === 'suitStyle' && c.character === 'bob') v = BOB_RANDOM_SUITS[Math.floor(rng.next() * BOB_RANDOM_SUITS.length)];
    c[spec.key] = v;
  }
  // keep suit colors distinct so the two-tone suit reads
  if (c.suitA === c.suitB) c.suitB = (c.suitB + 3) % BASE_GEAR_COUNT;
}

/** Turns anything read from storage into a valid config, falling back to the default look. */
export function sanitize(raw: unknown, sport: SportId, unlocked: Unlocked = NONE_UNLOCKED): AthleteConfig {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const character: CharacterId = obj.character === 'bobba' ? 'bobba' : 'bob';
  const out = defaultConfig(character, sport);
  for (const spec of OPTIONS) {
    if (spec.key === 'character') continue;
    const v = obj[spec.key];
    if (typeof v === 'number' && Number.isInteger(v) && v >= (spec.none ? -1 : 0) && v < spec.count && available(spec, v, unlocked)) out[spec.key] = v;
  }
  return out;
}

export function cloneConfig(c: AthleteConfig): AthleteConfig {
  return { ...c };
}

/** Stable key for sprite caching. */
export function configKey(c: AthleteConfig, sport: SportId): string {
  return `${sport}:${c.character}:${OPTIONS.filter((o) => o.key !== 'character').map((o) => c[o.key as Exclude<OptionKey, 'character'>]).join(',')}`;
}

/** Colors for every sprite slot. "None" options fall back to a hidden color. */
export function resolveRamps(c: AthleteConfig): SlotRamps {
  return {
    skin: SKIN_TONES[c.skin],
    hair: HAIR_COLORS[c.hairColor],
    suitA: GEAR_COLORS[c.suitA],
    suitB: GEAR_COLORS[c.suitB],
    helmet: GEAR_COLORS[Math.max(0, c.helmet)],
    harness: GEAR_COLORS[c.harness],
    board: GEAR_COLORS[c.board],
    boardArt: GEAR_COLORS[c.boardArtColor],
    gearA: GEAR_COLORS[c.gearA],
    gearB: GEAR_COLORS[c.gearB],
    foil: GEAR_COLORS[c.foil],
    lens: LENS_COLORS[Math.max(0, c.glasses)],
  };
}

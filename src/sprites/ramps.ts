import { PALETTE } from '../render/palette.ts';

/**
 * Sprite pixels store an index: 1..32 is the master palette, 64.. are
 * "slots" filled from the athlete's customization. Each slot ramp has three
 * tones: base + 0 = light, + 1 = mid, + 2 = shadow. Customizing an athlete
 * is a palette swap: the same pixels, different ramps.
 */
export const SLOT = {
  skin: 64,
  hair: 67,
  suitA: 70,
  suitB: 73,
  helmet: 76,
  harness: 79,
  board: 82,
  boardArt: 85,
  gearA: 88,
  gearB: 91,
  foil: 94,
  lens: 97,
} as const;

export type SlotName = keyof typeof SLOT;

export const LIGHT = 0;
export const MID = 1;
export const SHADE = 2;

/** Three tones, light to shadow, as 0xRRGGBB. */
export type Ramp = readonly [number, number, number];

export const SKIN_TONES: readonly Ramp[] = [
  [0xffe0cc, 0xf4c0a4, 0xcf917a],
  [0xf8cfa6, 0xe3aa80, 0xb77c5c],
  [0xefb984, 0xd0915e, 0xa16844],
  [0xdba56e, 0xb88050, 0x845a38],
  [0xc68955, 0xa1683c, 0x734828],
  [0xa66c44, 0x80502f, 0x58341e],
  [0x7e4c2e, 0x5e381f, 0x3e2414],
  [0x5e3a24, 0x442818, 0x2c180e],
];

export const HAIR_COLORS: readonly Ramp[] = [
  [0x5c566e, 0x37324a, 0x1e1b2a],
  [0x7a5032, 0x553620, 0x352214],
  [0xa8703e, 0x7e522c, 0x56361c],
  [0xc8683a, 0x984a26, 0x663018],
  [0xf6dc86, 0xd8ae52, 0xa47e34],
  [0xf6f2e8, 0xd6cebe, 0xaaa292],
  [0xff9fbe, 0xd96c98, 0xa84870],
  [0x86c9f4, 0x4fa6ec, 0x2f7fd6],
];

/** Colors for suits, helmets, harnesses, boards, kites, wings and foils. */
export const GEAR_COLORS: readonly Ramp[] = [
  [0x4a5470, 0x2a3048, 0x151a2a],
  [0x4e6cb0, 0x31488a, 0x1f2c5c],
  [0xffa08c, 0xff6f5e, 0xc84848],
  [0xf26262, 0xd9363e, 0x8c1f3a],
  [0xffe37e, 0xffc83c, 0xd9922a],
  [0xffc078, 0xff9f43, 0xd06a24],
  [0x74c882, 0x46a85a, 0x23674a],
  [0xa880d4, 0x7a4aa8, 0x4e2c78],
  [0xe882cc, 0xc060a8, 0x8a3a78],
  [0x96d4f8, 0x4fa6ec, 0x2f7fd6],
  [0xffffff, 0xdbe2ec, 0xa6b0c2],
];

/** Sunglasses: frame (light slot) and lens (mid slot). */
export const LENS_COLORS: readonly Ramp[] = [
  [0x1b2440, 0x1b2440, 0x0d1321],
  [0x1b2440, 0xff9f43, 0xc85a24],
  [0xf7fafc, 0x4fa6ec, 0x2f7fd6],
  [0xd9363e, 0xffd447, 0xc8902a],
];

/** Colors of a resolved athlete, slot by slot. */
export type SlotRamps = Record<SlotName, Ramp>;

/**
 * Builds a 256-entry RGBA lookup (little-endian 0xAABBGGRR, as ImageData
 * expects on every common platform) from the master palette and the ramps.
 */
export function buildLut(ramps: SlotRamps, out = new Uint32Array(256)): Uint32Array {
  out.fill(0);
  for (let i = 1; i < PALETTE.length; i++) out[i] = rgba(PALETTE[i]);
  for (const name of Object.keys(SLOT) as SlotName[]) {
    const base = SLOT[name];
    const ramp = ramps[name];
    for (let k = 0; k < 3; k++) out[base + k] = rgba(ramp[k]);
  }
  return out;
}

function rgba(rgb: number): number {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Index of a slot tone. */
export function slot(name: SlotName, tone: number): number {
  return SLOT[name] + tone;
}

/** The slot ramp a pixel belongs to, or -1 for master palette pixels. */
export function slotBase(index: number): number {
  return index >= 64 && index < 100 ? 64 + Math.floor((index - 64) / 3) * 3 : -1;
}

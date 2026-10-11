import type { Rarity } from './sealife.ts';
import { C } from '../render/palette.ts';
import { Raster } from '../sprites/raster.ts';

/**
 * Things on the sea floor: treasures for the album (wreck hook, freedive)
 * and junk worth fishing out to keep the sea clean.
 */
export interface Treasure {
  id: string;
  /** Points when brought up. */
  value: number;
  /** 1 light, 2 medium, 3 heavy: heavy things come up slowly. */
  weight: 1 | 2 | 3;
  rarity: Rarity;
  /** Plastic and lost things: a few points for a cleaner sea, not in the album. */
  junk?: boolean;
}

export const TREASURES: readonly Treasure[] = [
  { id: 'coin', value: 10, weight: 1, rarity: 1 },
  { id: 'bottle', value: 15, weight: 1, rarity: 1 },
  { id: 'anchor', value: 25, weight: 3, rarity: 1 },
  { id: 'compass', value: 30, weight: 1, rarity: 2 },
  { id: 'spyglass', value: 30, weight: 1, rarity: 2 },
  { id: 'amphora', value: 35, weight: 2, rarity: 2 },
  { id: 'bell', value: 45, weight: 2, rarity: 2 },
  { id: 'pearl', value: 60, weight: 1, rarity: 3 },
  { id: 'chest', value: 120, weight: 3, rarity: 3 },
  { id: 'crown', value: 250, weight: 2, rarity: 4 },
  { id: 'boot', value: 5, weight: 1, rarity: 1, junk: true },
  { id: 'can', value: 5, weight: 1, rarity: 1, junk: true },
  { id: 'net', value: 8, weight: 2, rarity: 1, junk: true },
];

/** The treasures that go in the album (no junk). */
export const ALBUM_TREASURES: readonly Treasure[] = TREASURES.filter((t) => !t.junk);

const BY_ID = new Map(TREASURES.map((t) => [t.id, t]));

export function treasure(id: string): Treasure | undefined {
  return BY_ID.get(id);
}

function ink(r: Raster): Raster {
  const src = Uint8Array.from(r.px);
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? 0 : src[y * r.w + x]);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (src[y * r.w + x] !== 0) continue;
      if (get(x - 1, y) || get(x + 1, y) || get(x, y - 1) || get(x, y + 1)) r.px[y * r.w + x] = C.ink;
    }
  }
  return r;
}

const DRAW: Record<string, (r: Raster) => void> = {
  coin(r) {
    r.circle(5, 5, 4, C.gold);
    r.circle(5, 5, 2, C.sun);
    r.set(5, 5, C.gold);
  },
  bottle(r) {
    r.rect(4, 0, 3, 3, C.brown);
    r.rect(3, 3, 5, 2, C.green);
    r.rect(2, 5, 7, 9, C.green);
    r.rect(3, 7, 5, 4, C.mist);
    r.rect(4, 8, 3, 1, C.grey);
    r.set(3, 6, C.aqua);
  },
  anchor(r) {
    r.rect(7, 2, 2, 14, C.slate);
    r.rect(4, 4, 8, 2, C.slate);
    r.circle(8, 1, 1, C.slate);
    r.polygon([[1, 12], [8, 17], [15, 12], [13, 11], [8, 15], [3, 11]], C.slate);
    r.set(7, 3, C.grey);
  },
  compass(r) {
    r.circle(6, 6, 5, C.gold);
    r.circle(6, 6, 4, C.mist);
    r.line(6, 3, 6, 6, C.red);
    r.line(6, 6, 6, 9, C.slate);
    r.set(6, 0, C.gold);
  },
  spyglass(r) {
    r.polygon([[0, 6], [14, 2], [15, 5], [1, 9]], C.gold);
    r.line(4, 5, 5, 8, C.brown);
    r.line(9, 4, 10, 7, C.brown);
    r.rect(14, 2, 2, 4, C.skyLight);
  },
  amphora(r) {
    r.rect(4, 0, 4, 2, C.orange);
    r.rect(5, 2, 2, 2, C.orange);
    r.ellipse(6, 9, 5, 6, C.orange);
    r.rect(5, 15, 2, 2, C.orange);
    r.line(2, 2, 3, 6, C.orange);
    r.line(9, 2, 8, 6, C.orange);
    for (let x = 2; x < 11; x += 2) r.set(x, 9, C.brown);
  },
  bell(r) {
    r.rect(5, 0, 2, 2, C.gold);
    r.polygon([[3, 2], [9, 2], [10, 9], [12, 12], [0, 12], [2, 9]], C.gold);
    r.rect(1, 12, 10, 1, C.orange);
    r.rect(5, 13, 2, 2, C.brown);
    r.line(4, 4, 3, 9, C.sun);
  },
  pearl(r) {
    r.polygon([[0, 8], [3, 3], [10, 3], [13, 8], [10, 12], [3, 12]], C.mauve);
    r.polygon([[1, 8], [4, 5], [9, 5], [12, 8]], C.rose);
    r.circle(6, 8, 2, C.white);
    r.set(5, 7, C.mist);
  },
  chest(r) {
    r.rect(1, 6, 16, 9, C.brown);
    r.ellipse(9, 6, 8, 4, C.brown);
    r.rect(1, 6, 16, 1, C.gold);
    r.rect(3, 3, 2, 12, C.gold);
    r.rect(13, 3, 2, 12, C.gold);
    r.rect(8, 7, 2, 3, C.gold);
    r.set(4, 2, C.sun);
    r.set(10, 4, C.sun);
  },
  crown(r) {
    r.polygon([[1, 4], [4, 8], [8, 1], [12, 8], [15, 4], [14, 12], [2, 12]], C.gold);
    r.rect(2, 11, 13, 2, C.orange);
    r.set(8, 6, C.red);
    r.set(5, 10, C.blue);
    r.set(11, 10, C.green);
    r.set(1, 3, C.sun);
    r.set(15, 3, C.sun);
    r.set(8, 0, C.sun);
  },
  boot(r) {
    r.rect(3, 0, 6, 10, C.forest);
    r.rect(3, 9, 11, 4, C.forest);
    r.rect(3, 12, 11, 1, C.ink);
    r.rect(4, 2, 4, 1, C.green);
  },
  can(r) {
    r.rect(2, 1, 7, 11, C.silver);
    r.rect(2, 4, 7, 5, C.red);
    r.rect(3, 0, 5, 1, C.grey);
    r.set(4, 6, C.white);
  },
  net(r) {
    for (let i = 0; i < 16; i += 3) {
      r.line(i, 0, i + 4, 12, C.forest);
      r.line(i + 4, 0, i, 12, C.forest);
    }
    r.circle(2, 2, 1, C.orange);
  },
};

/** A treasure's raster (palette indices), 12 to 18 pixels wide. */
export function treasureRaster(id: string): Raster {
  const r = new Raster(18, 18);
  (DRAW[id] ?? DRAW.coin)(r);
  // crop to the drawn pixels, keeping one pixel for the outline
  let x0 = 18;
  let y0 = 18;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 18; x++) {
      if (!r.get(x, y)) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const out = new Raster(x1 - x0 + 3, y1 - y0 + 3);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.set(x - x0 + 1, y - y0 + 1, r.get(x, y));
  return ink(out);
}

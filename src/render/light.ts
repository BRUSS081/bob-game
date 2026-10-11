import type { Sky } from '../env/sky.ts';
import { SKY_NAMES } from '../env/sky.ts';

/**
 * The light of the scene on the sprites: the same pixel art recolored for
 * the time of day and the weather, a palette swap of the final colors done
 * once when a sprite is cached. Daylight in clear weather leaves the art as
 * drawn; dawn and sunset warm it and put a rim of sunlight on the side that
 * faces the low sun; the night cools and darkens it, with a pale rim of
 * moonlight from above; under rain clouds the light is flat and grey.
 */
export interface Light {
  /** Cache key, 0..7. */
  readonly id: number;
  /** Per channel: out = in * mul + add. */
  readonly mul: readonly [number, number, number];
  readonly add: readonly [number, number, number];
  /** How much of the color turns grey first, 0..1. */
  readonly grey: number;
  /** Rim light color (0xRRGGBB), how strongly it covers the edge, and where the light comes from. */
  readonly rim: number;
  readonly rimStrength: number;
  readonly rimDir: readonly [number, number];
}

type Recipe = Omit<Light, 'id'>;

const NO_RIM = { rim: 0, rimStrength: 0, rimDir: [0, 0] as const };

const CLEAR: Record<Sky, Recipe> = {
  day: { mul: [1, 1, 1], add: [0, 0, 0], grey: 0, ...NO_RIM },
  dawn: { mul: [1, 0.9, 0.93], add: [10, 0, 12], grey: 0, rim: 0xffc890, rimStrength: 0.55, rimDir: [-1, 0] },
  sunset: { mul: [1, 0.8, 0.68], add: [12, 0, 8], grey: 0.05, rim: 0xffb048, rimStrength: 0.62, rimDir: [1, 0] },
  night: { mul: [0.52, 0.58, 0.74], add: [14, 18, 36], grey: 0.25, rim: 0xc4d6ff, rimStrength: 0.6, rimDir: [0, -1] },
};

const OVERCAST: Record<Sky, Recipe> = {
  day: { mul: [0.9, 0.93, 0.97], add: [0, 0, 4], grey: 0.3, ...NO_RIM },
  dawn: { mul: [0.88, 0.84, 0.9], add: [6, 0, 8], grey: 0.32, ...NO_RIM },
  sunset: { mul: [0.82, 0.76, 0.8], add: [8, 0, 8], grey: 0.35, ...NO_RIM },
  night: { mul: [0.44, 0.5, 0.68], add: [12, 14, 32], grey: 0.3, ...NO_RIM },
};

const LIGHTS: readonly Light[] = SKY_NAMES.flatMap((sky, i) => [
  { id: i * 2, ...CLEAR[sky] },
  { id: i * 2 + 1, ...OVERCAST[sky] },
]);

export function lightFor(sky: Sky, overcast: boolean): Light {
  return LIGHTS[SKY_NAMES.indexOf(sky) * 2 + (overcast ? 1 : 0)];
}

/** Clear daylight: the art exactly as drawn. */
export const DAYLIGHT: Light = lightFor('day', false);

/** A lightning strike: everything washed out in cold white for an instant. */
export const LIGHTNING: Light = { id: 8, mul: [1.1, 1.12, 1.2], add: [52, 56, 74], grey: 0.45, ...NO_RIM };

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** One color (0xRRGGBB) under a light, without the rim. */
export function shade(rgb: number, l: Light): number {
  let r = (rgb >> 16) & 0xff;
  let g = (rgb >> 8) & 0xff;
  let b = rgb & 0xff;
  if (l.grey > 0) {
    const y = 0.3 * r + 0.59 * g + 0.11 * b;
    r += (y - r) * l.grey;
    g += (y - g) * l.grey;
    b += (y - b) * l.grey;
  }
  return (clamp(r * l.mul[0] + l.add[0]) << 16) | (clamp(g * l.mul[1] + l.add[1]) << 8) | clamp(b * l.mul[2] + l.add[2]);
}

/** Dark enough to be an outline: the rim goes on the first pixel inside it. */
function isInk(data: Uint8ClampedArray, i: number): boolean {
  return data[i] + data[i + 1] + data[i + 2] < 120;
}

/**
 * Relights RGBA pixels in place. The rim falls on opaque pixels whose
 * neighbor towards the light is empty, or is an outline with empty space
 * beyond it, so the outline itself stays and the silhouette keeps reading.
 */
export function lightPixels(data: Uint8ClampedArray, w: number, h: number, l: Light): void {
  if (l === DAYLIGHT) return;
  const [dx, dy] = l.rimDir;
  const rim = l.rimStrength > 0 ? new Uint8Array(w * h) : null;
  const empty = (x: number, y: number): boolean => x < 0 || y < 0 || x >= w || y >= h || data[(y * w + x) * 4 + 3] === 0;
  if (rim) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] === 0 || isInk(data, i)) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (empty(nx, ny) || (isInk(data, (ny * w + nx) * 4) && empty(nx + dx, ny + dy))) rim[y * w + x] = 1;
      }
    }
  }
  const rr = (l.rim >> 16) & 0xff;
  const rg = (l.rim >> 8) & 0xff;
  const rb = l.rim & 0xff;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (data[i + 3] === 0) continue;
    const c = shade((data[i] << 16) | (data[i + 1] << 8) | data[i + 2], l);
    let r = (c >> 16) & 0xff;
    let g = (c >> 8) & 0xff;
    let b = c & 0xff;
    if (rim && rim[p]) {
      // the rim lifts the lit color towards the light, it never darkens it
      r = Math.max(r, Math.round(r + (rr - r) * l.rimStrength));
      g = Math.max(g, Math.round(g + (rg - g) * l.rimStrength));
      b = Math.max(b, Math.round(b + (rb - b) * l.rimStrength));
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

import { Raster } from '../sprites/raster.ts';
import { C } from './palette.ts';

/** The sea from dark to light. */
export const WATER = [C.abyss, C.deep, C.teal, C.sea, C.turquoise, C.aqua, C.foamShadow] as const;

/** The water tone `steps` lighter (or darker, if negative) than `c`, within the sea ramp. */
export function waterStep(c: number, steps: number): number {
  const at = WATER.indexOf(c as (typeof WATER)[number]);
  if (at < 0) return c;
  return WATER[Math.max(0, Math.min(WATER.length - 1, at + steps))];
}

/**
 * Rolling swells in the foreground water, as in the key art: bands that
 * alternate two tones of the sea, each with a crest line, foam on the peaks
 * and a light streak on the face. Lower bands are nearer, so they are
 * taller and scroll faster (parallax).
 */
export const WAVE_BANDS = [
  { top: 13, length: 112, amp: 4, speed: 1.15 },
  { top: 30, length: 150, amp: 5, speed: 1.35 },
  { top: 51, length: 196, amp: 7, speed: 1.6 },
] as const;

/** Rows of a band's tile below its lowest crest point. */
export const WAVE_BODY = 4;

/** One pre-rendered crest strip per band, rebuilt only when its colors or height change. */
export class WaveTiles {
  private readonly tiles: (HTMLCanvasElement | null)[] = WAVE_BANDS.map(() => null);
  private readonly keys: number[] = WAVE_BANDS.map(() => -1);
  private readonly toCanvas: (r: Raster) => HTMLCanvasElement;

  constructor(toCanvas: (r: Raster) => HTMLCanvasElement) {
    this.toCanvas = toCanvas;
  }

  get(band: number, amp: number, fill: number, crest: number, foam: number): HTMLCanvasElement {
    const key = ((amp * 64 + fill) * 64 + crest) * 64 + foam;
    const hit = this.tiles[band];
    if (hit && this.keys[band] === key) return hit;
    const tile = this.toCanvas(waveStrip(WAVE_BANDS[band].length, amp, fill, crest, foam));
    this.tiles[band] = tile;
    this.keys[band] = key;
    return tile;
  }
}

/**
 * One wavelength of a swell: peaks narrow and troughs broad (a trochoid
 * more than a sine), a two-pixel bright top on the peak with foam and a
 * little spray, a light streak on the face. Rows above the crest are empty.
 */
export function waveStrip(length: number, amp: number, fill: number, crest: number, foam: number): Raster {
  const h = amp + 2 + WAVE_BODY;
  const r = new Raster(length, h);
  for (let x = 0; x < length; x++) {
    const s = 0.5 + 0.5 * Math.cos((x / length) * Math.PI * 2);
    const y = 1 + Math.round(amp * (1 - s * s));
    r.rect(x, y, 1, h - y, fill);
    r.set(x, y, crest);
    if (s > 0.8) r.set(x, y + 1, crest);
    if (s > 0.93) r.set(x, y, foam);
    // a few drops of spray over the peak
    if (s > 0.97 && x % 5 === 1) r.set(x, y - 1, foam);
    // the light streak runs down the face behind the peak
    const t = x / length;
    if (t > 0.58 && t < 0.74) r.set(x, Math.min(h - 1, y + 2 + Math.round((t - 0.58) * 10)), crest);
  }
  return r;
}

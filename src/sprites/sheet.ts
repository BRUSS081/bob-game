import { configKey, resolveRamps, type AthleteConfig } from '../custom/athlete.ts';
import type { SportId } from '../game/sport.ts';
import {
  FRAME_H,
  FRAME_NAMES,
  FRAME_W,
  KITE_H,
  KITE_W,
  composeFrame,
  composeKite,
  frameInfo,
  rotateFrame,
  type FrameName,
} from './compose.ts';
import { buildLut } from './ramps.ts';
import type { Raster } from './raster.ts';

/** Number of pre-rendered trick angles per full turn. */
export const SPIN_STEPS = 16;

export interface AthleteSprites {
  readonly frames: Record<FrameName, HTMLCanvasElement>;
  /** The air frame rotated by k/SPIN_STEPS of a turn. */
  readonly spins: readonly HTMLCanvasElement[];
  /** Kite canopy, two flex frames (kitesurf only). */
  readonly kite: readonly HTMLCanvasElement[];
  readonly kiteTipL: readonly [number, number];
  readonly kiteTipR: readonly [number, number];
  readonly barTop: readonly [number, number];
}

function toCanvas(r: Raster, lut: Uint32Array): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(r.w, r.h);
  const out = new Uint32Array(img.data.buffer);
  for (let i = 0; i < r.px.length; i++) out[i] = lut[r.px[i]];
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Pre-renders every frame of one athlete look once and caches it, so the
 * game loop only blits canvases. A small LRU keeps the player, the
 * customization preview and a few rivals.
 */
export class SpriteCache {
  private readonly cache = new Map<string, AthleteSprites>();
  private readonly limit: number;

  constructor(limit = 8) {
    this.limit = limit;
  }

  /** `spins` false skips the trick rotations (rivals never spin). */
  get(config: AthleteConfig, sport: SportId, spins = true): AthleteSprites {
    const key = spins ? configKey(config, sport) : configKey(config, sport) + ':ns';
    const hit = this.cache.get(key);
    if (hit) {
      // refresh LRU order
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const built = build(config, sport, spins);
    this.cache.set(key, built);
    if (this.cache.size > this.limit) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return built;
  }
}

function build(c: AthleteConfig, sport: SportId, withSpins: boolean): AthleteSprites {
  const lut = buildLut(resolveRamps(c));
  const rasters = {} as Record<FrameName, Raster>;
  for (const name of FRAME_NAMES) rasters[name] = composeFrame(c, sport, name);
  const frames = {} as Record<FrameName, HTMLCanvasElement>;
  for (const name of FRAME_NAMES) frames[name] = toCanvas(rasters[name], lut);
  const spins: HTMLCanvasElement[] = [];
  if (withSpins && sport !== 'wing') {
    for (let k = 0; k < SPIN_STEPS; k++) spins.push(toCanvas(rotateFrame(rasters.air, (k / SPIN_STEPS) * Math.PI * 2), lut));
  }
  const kite: HTMLCanvasElement[] = [];
  let tipL: readonly [number, number] = [0, 0];
  let tipR: readonly [number, number] = [0, 0];
  if (sport === 'kite') {
    for (let f = 0; f < 2; f++) {
      const k = composeKite(c, f);
      kite.push(toCanvas(k.raster, lut));
      tipL = k.tipL;
      tipR = k.tipR;
    }
  }
  return { frames, spins, kite, kiteTipL: tipL, kiteTipR: tipR, barTop: frameInfo(sport, 'ride0').barTop };
}

export { FRAME_W, FRAME_H, KITE_W, KITE_H };

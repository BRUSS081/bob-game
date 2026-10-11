import { C } from './palette.ts';
import type { Renderer } from './renderer.ts';

/**
 * Side views under the surface, shared by the sea games: stepped water
 * from the surface down to the floor, light shafts, a sand floor with
 * rocks, corals and kelp. Decorations come from a hash of their world
 * slot, so they stay put while the view scrolls and nothing is allocated.
 */

export function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const DAY = [C.sea, C.teal, C.deep, C.abyss] as const;
const NIGHT = [C.deep, C.abyss, C.navy, C.ink] as const;

/** Water from `top` (the surface) to `bottom`, lighter near the top. `depth0` and `depth1` (0..1) say which part of the full depth is on screen. */
export function underwater(r: Renderer, top: number, bottom: number, clock: number, night: boolean, depth0 = 0, depth1 = 1): void {
  const colors = night ? NIGHT : DAY;
  const h = bottom - top;
  if (h <= 0) return;
  // each color owns a quarter of the full depth; draw the part on screen
  for (let b = 0; b < 4; b++) {
    const d0 = Math.max(depth0, b / 4);
    const d1 = Math.min(depth1, (b + 1) / 4);
    if (d1 <= d0) continue;
    const y0 = Math.round(top + ((d0 - depth0) / (depth1 - depth0)) * h);
    const y1 = Math.round(top + ((d1 - depth0) / (depth1 - depth0)) * h);
    r.fill(colors[b], 0, y0, r.W, y1 - y0);
    // dithered seam with the next band
    if (b < 3 && d1 === (b + 1) / 4 && d1 < depth1) {
      for (let x = 0; x < r.W; x += 2) {
        r.fill(colors[b + 1], x, y1 - 2, 1, 1);
        r.fill(colors[b], x + 1, y1, 1, 1);
      }
    }
  }
  // caustics: the net of light the waves throw just under the surface
  if (depth0 < 0.1) {
    const rows = Math.min(h, Math.round(((0.1 - depth0) / (depth1 - depth0)) * h));
    const light = night ? C.teal : C.aqua;
    for (let y = 2; y < rows; y += 3) {
      const fade = y / rows;
      const step = 9 + Math.round(fade * 10);
      const shift = Math.round(Math.sin(clock * 1.7 + y * 0.45) * 4 + clock * 6);
      for (let x = -step + (((shift % step) + step) % step); x < r.W; x += step) {
        if (hash(Math.floor((x - shift) / step) * 13 + y) % 3 === 0) continue;
        r.fill(light, x, top + y, 3 - Math.round(fade * 2), 1);
      }
    }
  }
  // light shafts from the surface, swaying slowly
  if (depth0 < 0.4) {
    const len = Math.min(h, Math.round((0.4 - depth0) / (depth1 - depth0) * h));
    const shaft = night ? C.teal : C.turquoise;
    for (let i = 0; i < 5; i++) {
      const x0 = ((i * 97 + 31) % (r.W + 60)) - 30 + Math.round(Math.sin(clock * 0.4 + i) * 6);
      for (let y = 0; y < len; y += 2) {
        if (((y >> 1) + i) % 3 === 0) continue;
        r.fill(shaft, x0 + Math.round(y * 0.35), top + y, 2 + (i % 2), 1);
      }
    }
  }
}

/** Specks drifting in the water, for a sense of motion. */
export function specks(r: Renderer, top: number, bottom: number, scroll: number, clock: number): void {
  const h = bottom - top;
  if (h <= 0) return;
  for (let i = 0; i < 24; i++) {
    const hv = hash(i + 7);
    const x = (((hv % 997) - scroll * (0.6 + (i % 3) * 0.2) + clock * 3) % (r.W + 8) + r.W + 8) % (r.W + 8) - 4;
    const y = top + ((hv >>> 10) % 1000) / 1000 * h + Math.sin(clock + i) * 2;
    r.fill(i % 4 === 0 ? C.aqua : C.turquoise, Math.round(x), Math.round(y), 1, 1);
  }
}

/** A rising bubble. */
export function bubble(r: Renderer, x: number, y: number, size: number): void {
  x = Math.round(x);
  y = Math.round(y);
  if (size <= 1) {
    r.fill(C.aqua, x, y, 1, 1);
    return;
  }
  r.fill(C.aqua, x - 1, y, 1, 2);
  r.fill(C.aqua, x + 2, y, 1, 2);
  r.fill(C.aqua, x, y - 1, 2, 1);
  r.fill(C.aqua, x, y + 2, 2, 1);
  r.fill(C.white, x, y, 1, 1);
}

const SLOT = 22;

/**
 * The sea floor from y down: sand with ripples, and in each slot of the
 * world maybe a rock, a coral, a kelp or a shell. `scroll` is the world x
 * at the left edge of the screen.
 */
export function seaFloor(r: Renderer, y: number, scroll: number, clock: number, night: boolean, seed = 0): void {
  const sand = night ? C.slate : C.tan;
  const dark = night ? C.indigo : C.brown;
  r.fill(sand, 0, y, r.W, r.H - y);
  for (let x = -((scroll | 0) % 7) - 7; x < r.W; x += 7) r.fill(dark, x, y + 3 + ((x + (scroll | 0)) & 4 ? 1 : 0), 3, 1);
  // dapples of light on the sand, drifting with the waves above
  const dapple = night ? C.grey : C.sun;
  for (let i = 0; i < 18; i++) {
    const hv = hash(i * 7 + 101);
    const span = r.W + 20;
    const x = Math.round(((((hv % 997) - scroll + Math.sin(clock * 0.9 + i) * 5) % span) + span) % span) - 10;
    const dy = 1 + ((hv >>> 10) % 6);
    if (y + dy >= r.H) continue;
    r.fill(dapple, x, y + dy, 2 + ((hv >>> 4) % 3), 1);
  }
  const first = Math.floor(scroll / SLOT) - 2;
  const last = Math.ceil((scroll + r.W) / SLOT) + 1;
  for (let k = first; k <= last; k++) {
    const h = hash(k * 31 + seed);
    const x = Math.round(k * SLOT - scroll + (h % 9));
    switch ((h >>> 8) % 8) {
      case 0:
      case 1:
        rock(r, x, y, 6 + ((h >>> 12) % 8), night);
        break;
      case 2:
        coral(r, x, y, (h >>> 12) % 3, night);
        break;
      case 3:
      case 4:
        kelp(r, x, y, 14 + ((h >>> 12) % 26), clock + k, night);
        break;
      case 5:
        r.fill(night ? C.grey : C.rose, x, y - 1, 3, 1);
        r.fill(night ? C.grey : C.coral, x + 1, y - 2, 1, 1);
        break;
    }
  }
}

function rock(r: Renderer, x: number, y: number, w: number, night: boolean): void {
  const h = Math.round(w * 0.6);
  for (let j = 0; j < h; j++) {
    const half = Math.round(w * Math.sqrt(1 - (j / h) ** 2) * 0.5);
    r.fill(j > h * 0.6 ? (night ? C.indigo : C.grey) : night ? C.navy : C.slate, x - half, y - j, half * 2 + 1, 1);
  }
  r.fill(C.ink, x - Math.round(w / 2) - 1, y, w + 3, 1);
}

function coral(r: Renderer, x: number, y: number, kind: number, night: boolean): void {
  const c = night ? C.violet : kind === 0 ? C.coral : kind === 1 ? C.mauve : C.rose;
  const tip = night ? C.mauve : kind === 0 ? C.rose : kind === 1 ? C.rose : C.white;
  // a trunk and three branches
  r.fill(c, x, y - 8, 2, 8);
  r.fill(c, x - 4, y - 6, 4, 2);
  r.fill(c, x - 4, y - 12, 2, 6);
  r.fill(c, x + 2, y - 10, 4, 2);
  r.fill(c, x + 4, y - 15, 2, 5);
  r.fill(c, x, y - 13, 2, 5);
  r.fill(tip, x - 4, y - 13, 2, 1);
  r.fill(tip, x + 4, y - 16, 2, 1);
  r.fill(tip, x, y - 14, 2, 1);
}

function kelp(r: Renderer, x: number, y: number, h: number, t: number, night: boolean): void {
  const c = night ? C.forest : C.green;
  const d = night ? C.navy : C.forest;
  for (let j = 0; j < h; j += 2) {
    const sway = Math.round(Math.sin(t * 1.3 + j * 0.15) * (j / h) * 4);
    r.fill(j % 6 === 0 ? d : c, x + sway, y - j - 2, 2, 2);
    if (j % 8 === 4) r.fill(c, x + sway + 2, y - j - 2, 2, 1);
  }
}

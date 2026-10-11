/**
 * App icons for the PWA and the favicon, drawn in code like every sprite:
 *   node scripts/render-icons.ts
 * A 32×32 pixel scene (sky bands, sun, the runner's wave and board on the
 * sea) scaled up by whole numbers into public/icons.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { C, PALETTE } from '../src/render/palette.ts';
import { iconRaster } from '../src/sprites/icons.ts';
import { Raster } from '../src/sprites/raster.ts';
import { encodeRgbaPng } from './reference/png.ts';

const SIZE = 32;

/** The icon scene. */
function scene(): Raster {
  const r = new Raster(SIZE, SIZE);
  r.bands(0, 20, [C.blue, C.sky, C.skyLight, C.skyPale], 2);
  r.circle(24, 7, 3, C.sun);
  r.rect(0, 20, SIZE, 12, C.sea);
  r.rect(0, 20, SIZE, 1, C.turquoise);
  for (let x = 2; x < SIZE; x += 7) r.set(x, 24, C.aqua);
  for (let x = 5; x < SIZE; x += 9) r.set(x, 28, C.turquoise);
  // the runner's wave and board from the home carousel icon
  const art = iconRaster('runner');
  const ox = Math.round((SIZE - art.w) / 2);
  const oy = 21 - 11;
  for (let y = 0; y < art.h; y++) {
    for (let x = 0; x < art.w; x++) {
      const v = art.px[y * art.w + x];
      // the icon's own sea is replaced by the scene's
      if (!v || y >= 11) continue;
      r.set(ox + x, oy + y, v);
    }
  }
  return r;
}

function rgba(c: number): number {
  const v = PALETTE[c];
  return ((0xff << 24) | ((v & 0xff) << 16) | (((v >> 8) & 0xff) << 8) | ((v >> 16) & 0xff)) >>> 0;
}

function png(r: Raster, size: number, pad = 0): Uint8Array {
  const scale = Math.floor((size - 2 * pad) / r.w);
  const off = Math.floor((size - r.w * scale) / 2);
  const out = new Uint32Array(size * size).fill(rgba(C.ink));
  for (let y = 0; y < r.h * scale; y++) {
    for (let x = 0; x < r.w * scale; x++) {
      const v = r.px[Math.floor(y / scale) * r.w + Math.floor(x / scale)];
      if (v) out[(y + off) * size + x + off] = rgba(v);
    }
  }
  return encodeRgbaPng(size, size, out);
}

mkdirSync('public/icons', { recursive: true });
const art = scene();
writeFileSync('public/icons/icon-32.png', png(art, 32));
writeFileSync('public/icons/icon-192.png', png(art, 192));
writeFileSync('public/icons/icon-512.png', png(art, 512));
// maskable: launchers crop to a circle or a squircle, so keep a margin of ink around the scene
writeFileSync('public/icons/icon-maskable-512.png', png(art, 512, 64));
console.log('icons written to public/icons');

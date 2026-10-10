/**
 * Renders the phase 1 pixel art references into /reference.
 * They are style, palette and lighting references only, never game assets.
 *
 *   npm run reference
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { C, PALETTE } from '../src/render/palette.ts';
import { encodeIndexedPng } from './reference/png.ts';
import { Raster } from './reference/raster.ts';
import { H, LIGHTINGS, W, renderPaletteSheet, renderScene } from './reference/scene.ts';

const OUT = new URL('../reference/', import.meta.url);
mkdirSync(OUT, { recursive: true });

function save(name: string, r: Raster, scale: number): void {
  const s = r.scaled(scale);
  writeFileSync(new URL(name, OUT), encodeIndexedPng(s.w, s.h, s.px, PALETTE));
  console.log(`${name}  ${s.w}x${s.h} (x${scale})`);
}

save('00-palette.png', renderPaletteSheet(PALETTE), 4);

const midday = LIGHTINGS.find((l) => l.name === 'midday')!;
save('01-keyart.png', renderScene(midday, true), 4);

const grid = new Raster(W * 3 + 8, H * 2 + 6);
grid.rect(0, 0, grid.w, grid.h, C.ink);
LIGHTINGS.forEach((L, i) => {
  grid.draw(renderScene(L, false), (i % 3) * (W + 4), Math.floor(i / 3) * (H + 6));
});
save('02-timeweather.png', grid, 2);

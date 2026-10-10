/**
 * Renders a contact sheet of every athlete frame for review:
 *   node scripts/render-sprites.ts [out.png] [scale]
 */
import { writeFileSync } from 'node:fs';
import { defaultConfig, resolveRamps, type AthleteConfig } from '../src/custom/athlete.ts';
import { SPORTS, type SportId } from '../src/game/sport.ts';
import { FRAME_H, FRAME_NAMES, FRAME_W, composeFrame, composeKite, KITE_W, KITE_H } from '../src/sprites/compose.ts';
import { buildLut } from '../src/sprites/ramps.ts';
import { encodeRgbaPng } from './reference/png.ts';

const out = process.argv[2] ?? 'sprites.png';
const scale = Number(process.argv[3] ?? 3);
const BG = 0xffc4b896; // sky-ish background (ABGR)

const rows: { c: AthleteConfig; sport: SportId }[] = [];
for (const sport of SPORTS) for (const ch of ['bob', 'bobba'] as const) rows.push({ c: defaultConfig(ch, sport), sport });

const cols = FRAME_NAMES.length + 1;
const W = cols * FRAME_W;
const H = rows.length * FRAME_H;
const img = new Uint32Array(W * H).fill(BG);
rows.forEach(({ c, sport }, r) => {
  const lut = buildLut(resolveRamps(c));
  FRAME_NAMES.forEach((name, i) => {
    const f = composeFrame(c, sport, name);
    for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
      const v = f.px[y * FRAME_W + x];
      if (v) img[(r * FRAME_H + y) * W + i * FRAME_W + x] = lut[v];
    }
  });
  if (sport === 'kite') {
    const k = composeKite(c, 0).raster;
    for (let y = 0; y < KITE_H; y++) for (let x = 0; x < KITE_W; x++) {
      const v = k.px[y * KITE_W + x];
      if (v) img[(r * FRAME_H + y + 4) * W + FRAME_NAMES.length * FRAME_W + x + 10] = lut[v];
    }
  }
});
const big = new Uint32Array(W * scale * H * scale);
for (let y = 0; y < H * scale; y++) for (let x = 0; x < W * scale; x++) big[y * W * scale + x] = img[Math.floor(y / scale) * W + Math.floor(x / scale)];
writeFileSync(out, encodeRgbaPng(W * scale, H * scale, big));
console.log(out, W * scale, 'x', H * scale);

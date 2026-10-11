import type { ObstacleName } from '../game/obstacles.ts';
import { C } from '../render/palette.ts';
import { Raster, sprite } from './raster.ts';

/**
 * Obstacle and power-up sprites in master-palette indices. Each obstacle
 * sprite has the size of its hitbox, so what you see is what hits you.
 */

function outlineInk(r: Raster): Raster {
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

function fromSprite(rows: readonly string[], legend: Record<string, number>): Raster {
  const s = sprite(rows, legend);
  const r = new Raster(s.w, s.h);
  r.px.set(s.px);
  return r;
}

const BUOY_ROWS = [
  '....yy....',
  '....kk....',
  '...kkkk...',
  '....rr....',
  '...rrrR...',
  '...rrrR...',
  '..rrrrRR..',
  '..rrrrRR..',
  '.rrrrrrRR.',
  '.rrrrrrRR.',
  '.wwwwwwss.',
  '.wwwwwwss.',
  '.wwwwwwss.',
  '.rrrrrrRR.',
  '.rrrrrrRR.',
  '.rrrrrrRR.',
  '.rrrrrrRR.',
  'rrrrrrrrRR',
  'RRRRRRRRRR',
  'FFFFFFFFFF',
  'f.ffffff.f',
  '..ffffff..',
  '...ffff...',
  '..........',
  '..........',
  '..........',
];

function buoy(): Raster {
  return outlineInk(fromSprite(BUOY_ROWS, { y: C.gold, k: C.slate, r: C.red, R: C.wine, w: C.white, s: C.silver, F: C.white, f: C.foamShadow }));
}

function smallBuoy(): Raster {
  return outlineInk(
    fromSprite(
      ['...yy...', '...kk...', '..rrrR..', '.rrrrRR.', '.wwwwss.', '.wwwwss.', '.rrrrRR.', '.rrrrRR.', 'rrrrrrRR', 'FFFFFFFF', '.ffffff.', '........'],
      { y: C.gold, k: C.slate, r: C.coral, R: C.red, w: C.white, s: C.silver, F: C.white, f: C.foamShadow },
    ),
  );
}

function rock(w: number, h: number): Raster {
  const r = new Raster(w, h);
  const base = h - 2;
  r.polygon([[0, base], [w * 0.15, h * 0.45], [w * 0.38, 0.5], [w * 0.62, h * 0.12], [w * 0.88, h * 0.5], [w, base]], C.grey);
  r.polygon([[w * 0.55, h * 0.18], [w * 0.62, h * 0.12], [w * 0.88, h * 0.5], [w, base], [w * 0.6, base]], C.slate);
  r.line(w * 0.16, h * 0.42, w * 0.37, 1, C.silver);
  r.line(w * 0.38, 1, w * 0.55, h * 0.18, C.silver);
  outlineInk(r);
  r.rect(0, h - 2, w, 1, C.white);
  r.rect(1, h - 1, w - 2, 1, C.foamShadow);
  return r;
}

function seaweed(): Raster {
  const r = new Raster(22, 8);
  r.rect(0, 5, 22, 3, C.forest);
  for (let i = 0; i < 6; i++) {
    const x = 1 + i * 4;
    r.line(x, 5, x + 1, 1 + (i % 2), C.green);
    r.line(x + 1, 5, x + 2, 2 + (i % 2), C.green);
  }
  outlineInk(r);
  r.rect(0, 7, 22, 1, C.foamShadow);
  return r;
}

function jelly(w: number, h: number, dome: number, dark: number, deep: boolean): Raster {
  const r = new Raster(w, h);
  r.ellipse(Math.floor(w / 2), 3, Math.floor(w / 2) - 1, 3, dome);
  r.rect(1, 3, w - 2, 2, dome);
  for (let x = 2; x < w - 2; x += 3) r.line(x, 5, x + (x % 2), h - 1, dark);
  r.set(Math.floor(w / 2) - 2, 1, deep ? C.rose : C.white);
  return outlineInk(r);
}

function kelp(): Raster {
  const r = new Raster(14, 20);
  for (let i = 0; i < 4; i++) {
    const x0 = 2 + i * 3;
    for (let y = 19; y >= 1 + (i % 2) * 3; y--) {
      const x = x0 + Math.round(Math.sin(y * 0.6 + i) * 1.2);
      r.set(x, y, i % 2 ? C.forest : C.green);
      if (y % 4 === 0) r.set(x + 1, y, C.green);
    }
  }
  return outlineInk(r);
}

function plank(): Raster {
  const r = new Raster(30, 5);
  r.rect(0, 0, 30, 3, C.tan);
  r.rect(0, 2, 30, 1, C.brown);
  for (let x = 5; x < 30; x += 9) r.set(x, 1, C.brown);
  r.set(27, 0, C.brown);
  outlineInk(r);
  r.rect(0, 4, 30, 1, C.foamShadow);
  return r;
}

function boat(): Raster {
  const r = new Raster(44, 22);
  // mast and cabin
  r.rect(26, 1, 1, 9, C.brown);
  r.rect(20, 7, 12, 6, C.white);
  r.rect(22, 9, 3, 2, C.skyLight);
  r.rect(27, 9, 3, 2, C.skyLight);
  r.rect(19, 6, 14, 1, C.coral);
  // hull
  r.polygon([[1, 12], [43, 12], [39, 20], [5, 20]], C.white);
  r.polygon([[1, 12], [43, 12], [42, 15], [2, 15]], C.red);
  r.rect(5, 18, 34, 2, C.silver);
  outlineInk(r);
  r.rect(0, 21, 44, 1, C.white);
  return r;
}

function gull(frame: number): Raster {
  const rows =
    frame === 0
      ? ['ss..........ss', '.sww......wws.', '..wwwwwwwwww..', '....wwwwwwo...', '.....ww.......', '..............', '..............', '..............']
      : ['..............', '..............', '..wwwwwwwwww..', '.sww.wwwwwwo..', 'ss...ww....ss.', '..............', '..............', '..............'];
  return outlineInk(fromSprite(rows, { s: C.grey, w: C.white, o: C.orange }));
}

const DOLPHIN_ROWS = [
  '..........dd..........',
  '.........ddd..........',
  '.......ddddddddd......',
  'd....dddddddddddddd...',
  'dd.ddddddddddddddkddd.',
  '.dddddbbbbbbbbbbbbbddd',
  'dd..dbbbbbbbbbbbbbb...',
  'd......bbbb..bbb......',
  '........bb............',
];

/** Nearest-neighbor rotation around the center, on a canvas big enough for any angle. */
function rotated(src: Raster, angle: number): Raster {
  const size = Math.ceil(Math.hypot(src.w, src.h)) + 2;
  const out = new Raster(size, size);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = src.w / 2;
  const cy = src.h / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - size / 2;
      const dy = y + 0.5 - size / 2;
      const sx = Math.floor(cos * dx + sin * dy + cx);
      const sy = Math.floor(-sin * dx + cos * dy + cy);
      if (sx >= 0 && sy >= 0 && sx < src.w && sy < src.h) out.px[y * size + x] = src.px[sy * src.w + sx];
    }
  }
  return out;
}

/**
 * Dolphin poses, all on the same square canvas: rising (nose up), top
 * of the jump, diving; then the dorsal fin cutting the surface.
 */
export function dolphinRasters(): Raster[] {
  const body = fromSprite(DOLPHIN_ROWS, { d: C.slate, b: C.silver, k: C.ink });
  const poses = [rotated(body, -0.45), rotated(body, 0), rotated(body, 0.45)].map(outlineInk);
  const fin = fromSprite(['..d..', '.dd..', 'ddd..', 'wwwww'], { d: C.slate, w: C.white });
  return [...poses, outlineInk(fin)];
}

/** Obstacle sprites by name. Gulls have two frames; the rest one. */
export function propRasters(name: ObstacleName): Raster[] {
  switch (name) {
    case 'buoy':
      return [buoy()];
    case 'smallbuoy':
      return [smallBuoy()];
    case 'rock':
      return [rock(26, 16)];
    case 'lowrock':
      return [rock(24, 9)];
    case 'seaweed':
      return [seaweed()];
    case 'jellyfish':
      return [jelly(12, 8, C.rose, C.mauve, false)];
    case 'deepjelly':
      return [jelly(12, 8, C.violet, C.indigo, true)];
    case 'kelp':
      return [kelp()];
    case 'plank':
      return [plank()];
    case 'boat':
      return [boat()];
    case 'gull':
      return [gull(0), gull(1)];
    case 'rival':
    case 'kiter':
      // drawn as composed athletes with random looks
      return [];
  }
}

/** Power-up icons, 12×12: the perfect wave and the wind gust. */
export function powerRaster(kind: 'wave' | 'gust'): Raster {
  const rows =
    kind === 'wave'
      ? ['....aaaa....', '..aawwwwa...', '.aww....wa..', '.aw..aa..a..', 'aw..a..a....', 'aw..a.ww....', 'aw...a.w....', 'aaw...aw...a', '.aaww..wwaa.', '..aaaawwaa..', '...aaaaaa...', '............']
      : ['............', '..wwwwwww...', '.........w..', '..........w.', '..wwwwwwww..', '............', 'wwwwwwwwww..', '..........w.', '.........w..', '...wwwwww...', '............', '............'];
  const r = new Raster(12, 12);
  r.rect(0, 0, 12, 12, kind === 'wave' ? C.gold : C.sky);
  r.rect(1, 1, 10, 10, kind === 'wave' ? C.sun : C.skyPale);
  const icon = sprite(rows, { a: kind === 'wave' ? C.sea : C.blue, w: kind === 'wave' ? C.white : C.blue });
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (icon.px[y * 12 + x]) r.set(x, y, icon.px[y * 12 + x]);
  return outlineInk(r);
}

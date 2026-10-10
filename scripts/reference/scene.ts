import { C } from '../../src/render/palette.ts';
import { Raster, rng, sprite } from './raster.ts';

export const W = 480;
export const H = 270;
/** Horizon line. */
const HY = 150;

type Body = { kind: 'sun' | 'moon'; x: number; y: number; r: number; core: number; rim: number; halo: number };

export interface Lighting {
  name: string;
  sky: readonly number[];
  cloud: { hi: number; base: number; shadow: number };
  overcast: boolean;
  seaFar: readonly [number, number];
  seaMid: readonly [number, number];
  seaFg: readonly [number, number, number];
  crest: number;
  foam: number;
  foamShadow: number;
  glint: number;
  body: Body | null;
  stars: boolean;
  rain: number;
  lightning: boolean;
  waves: number;
  /** Rim light color for figures and props. */
  rim: number;
  /** Remaps object colors for the light condition. */
  shade: Partial<Record<number, number>>;
}

const NIGHT_SHADE: Partial<Record<number, number>> = {
  [C.white]: C.silver,
  [C.mist]: C.grey,
  [C.silver]: C.grey,
  [C.grey]: C.slate,
  [C.slate]: C.indigo,
  [C.indigo]: C.navy,
  [C.navy]: C.ink,
  [C.red]: C.wine,
  [C.coral]: C.red,
  [C.orange]: C.coral,
  [C.gold]: C.orange,
  [C.sun]: C.gold,
  [C.rose]: C.mauve,
  [C.mauve]: C.violet,
  [C.violet]: C.indigo,
  [C.green]: C.forest,
  [C.tan]: C.brown,
  [C.aqua]: C.sea,
  [C.turquoise]: C.teal,
};

export const LIGHTINGS: readonly Lighting[] = [
  {
    name: 'dawn',
    sky: [C.violet, C.mauve, C.rose, C.gold, C.sun],
    cloud: { hi: C.sun, base: C.rose, shadow: C.mauve },
    overcast: false,
    seaFar: [C.deep, C.rose],
    seaMid: [C.teal, C.sea],
    seaFg: [C.teal, C.sea, C.turquoise],
    crest: C.rose,
    foam: C.white,
    foamShadow: C.rose,
    glint: C.gold,
    body: { kind: 'sun', x: 96, y: HY - 2, r: 11, core: C.sun, rim: C.gold, halo: C.sun },
    stars: false,
    rain: 0,
    lightning: false,
    waves: 1,
    rim: C.sun,
    shade: { [C.white]: C.sun },
  },
  {
    name: 'midday',
    sky: [C.blue, C.sky, C.skyLight, C.skyPale],
    cloud: { hi: C.white, base: C.white, shadow: C.skyPale },
    overcast: false,
    seaFar: [C.deep, C.teal],
    seaMid: [C.teal, C.sea],
    seaFg: [C.sea, C.turquoise, C.aqua],
    crest: C.aqua,
    foam: C.white,
    foamShadow: C.foamShadow,
    glint: C.white,
    body: { kind: 'sun', x: 404, y: 36, r: 10, core: C.white, rim: C.sun, halo: C.skyPale },
    stars: false,
    rain: 0,
    lightning: false,
    waves: 1,
    rim: C.white,
    shade: {},
  },
  {
    name: 'sunset',
    sky: [C.indigo, C.violet, C.mauve, C.coral, C.orange],
    cloud: { hi: C.orange, base: C.coral, shadow: C.violet },
    overcast: false,
    seaFar: [C.deep, C.orange],
    seaMid: [C.deep, C.teal],
    seaFg: [C.deep, C.teal, C.sea],
    crest: C.orange,
    foam: C.sun,
    foamShadow: C.coral,
    glint: C.gold,
    body: { kind: 'sun', x: 372, y: HY - 4, r: 12, core: C.sun, rim: C.gold, halo: C.orange },
    stars: false,
    rain: 0,
    lightning: false,
    waves: 1,
    rim: C.gold,
    shade: { [C.white]: C.sun, [C.mist]: C.rose },
  },
  {
    name: 'night',
    sky: [C.ink, C.navy, C.navy, C.indigo],
    cloud: { hi: C.slate, base: C.indigo, shadow: C.navy },
    overcast: false,
    seaFar: [C.abyss, C.deep],
    seaMid: [C.abyss, C.deep],
    seaFg: [C.abyss, C.deep, C.teal],
    crest: C.teal,
    foam: C.silver,
    foamShadow: C.grey,
    glint: C.silver,
    body: { kind: 'moon', x: 110, y: 46, r: 10, core: C.white, rim: C.mist, halo: C.indigo },
    stars: true,
    rain: 0,
    lightning: false,
    waves: 1,
    rim: C.silver,
    shade: NIGHT_SHADE,
  },
  {
    name: 'rain',
    sky: [C.slate, C.grey, C.grey, C.silver],
    cloud: { hi: C.silver, base: C.grey, shadow: C.slate },
    overcast: true,
    seaFar: [C.deep, C.grey],
    seaMid: [C.teal, C.teal],
    seaFg: [C.teal, C.sea, C.turquoise],
    crest: C.turquoise,
    foam: C.mist,
    foamShadow: C.silver,
    glint: C.silver,
    body: null,
    stars: false,
    rain: C.mist,
    lightning: false,
    waves: 1.3,
    rim: C.mist,
    shade: { [C.white]: C.mist },
  },
  {
    name: 'storm',
    sky: [C.ink, C.navy, C.indigo, C.slate],
    cloud: { hi: C.grey, base: C.slate, shadow: C.navy },
    overcast: true,
    seaFar: [C.abyss, C.slate],
    seaMid: [C.abyss, C.deep],
    seaFg: [C.abyss, C.deep, C.teal],
    crest: C.turquoise,
    foam: C.silver,
    foamShadow: C.grey,
    glint: C.mauve,
    body: null,
    stars: false,
    rain: C.grey,
    lightning: true,
    waves: 1.7,
    rim: C.mauve,
    shade: NIGHT_SHADE,
  },
];

// ---------------------------------------------------------------- clouds

type Cloud = { x: number; base: number; puffs: readonly (readonly [number, number, number])[] };

const CLOUDS: readonly Cloud[] = [
  { x: 36, base: 62, puffs: [[-10, -5, 7], [0, -10, 11], [15, -18, 14], [31, -12, 11], [44, -7, 8], [54, -4, 5]] },
  { x: 214, base: 40, puffs: [[0, -7, 8], [12, -14, 11], [26, -10, 9], [37, -5, 6]] },
  { x: 318, base: 92, puffs: [[0, -4, 5], [9, -9, 8], [19, -6, 6], [27, -3, 4]] },
  { x: 150, base: 134, puffs: [[0, -2, 3], [6, -4, 5], [13, -2, 3]] },
  { x: 432, base: 138, puffs: [[0, -2, 3], [5, -3, 4], [11, -1, 3]] },
  { x: 14, base: 128, puffs: [[0, -2, 3], [7, -4, 5], [15, -3, 4], [21, -1, 3]] },
];

const OVERCAST: readonly Cloud[] = [
  { x: -10, base: 34, puffs: [[0, -14, 18], [26, -20, 22], [56, -14, 18], [84, -20, 22], [112, -12, 16]] },
  { x: 120, base: 28, puffs: [[0, -14, 18], [30, -20, 24], [62, -14, 18], [92, -18, 22], [124, -12, 16]] },
  { x: 268, base: 36, puffs: [[0, -14, 18], [30, -22, 24], [62, -16, 20], [96, -20, 22], [128, -12, 16], [160, -16, 20], [196, -12, 16]] },
  { x: 60, base: 70, puffs: [[0, -6, 8], [14, -10, 11], [30, -6, 8]] },
  { x: 380, base: 80, puffs: [[0, -5, 7], [12, -9, 10], [26, -5, 7]] },
];

function drawCloud(r: Raster, cl: Cloud, L: Lighting): void {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  for (const [dx, dy, rad] of cl.puffs) {
    minX = Math.min(minX, cl.x + dx - rad);
    maxX = Math.max(maxX, cl.x + dx + rad);
    minY = Math.min(minY, cl.base + dy - rad);
  }
  const ox = minX - 2;
  const oy = minY - 2;
  const mw = maxX - minX + 5;
  const mh = cl.base - minY + 3;
  const mask = new Raster(mw, mh);
  for (const [dx, dy, rad] of cl.puffs) mask.circle(cl.x + dx - ox, cl.base + dy - oy, rad, 1);
  const inside = (x: number, y: number) => y + oy <= cl.base && mask.get(x, y) === 1;
  const height = cl.base - minY;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (!inside(x, y)) continue;
      let c = L.cloud.base;
      const fromBase = cl.base - (y + oy);
      if (fromBase < Math.max(2, height * 0.28) || !inside(x + 2, y + 2)) c = L.cloud.shadow;
      if (!inside(x - 1, y - 2)) c = L.cloud.hi;
      r.set(x + ox, y + oy, c);
    }
  }
}

// ---------------------------------------------------------------- sky

function drawSky(r: Raster, L: Lighting): void {
  r.bands(0, HY, L.sky, 7, L.sky.map((_, i) => 1 + i * 0.35));
  const rand = rng(7);
  if (L.stars) {
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(rand() * W);
      const y = Math.floor(rand() * (HY - 40));
      r.set(x, y, rand() < 0.25 ? C.white : C.silver);
      if (rand() < 0.08) {
        r.set(x - 1, y, C.grey);
        r.set(x + 1, y, C.grey);
        r.set(x, y - 1, C.grey);
        r.set(x, y + 1, C.grey);
      }
    }
  }
  const b = L.body;
  if (b) {
    r.circle(b.x, b.y, b.r + 4, b.halo);
    r.circle(b.x, b.y, b.r, b.rim);
    r.circle(b.x, b.y, b.r - 2, b.core);
    if (b.kind === 'moon') {
      r.circle(b.x - 3, b.y - 2, 2, b.rim);
      r.circle(b.x + 3, b.y + 3, 1, b.rim);
      r.set(b.x + 4, b.y - 4, C.silver);
    }
  }
  if (L.overcast) for (const cl of OVERCAST) drawCloud(r, cl, L);
  for (const cl of CLOUDS) drawCloud(r, cl, L);
}

// ---------------------------------------------------------------- sea

/** Top edge of the foreground water at column x (with the surfable swell). */
export function fgTop(x: number, L: Lighting): number {
  const a = L.waves;
  const swell = 26 * Math.exp(-(((x - 150) / 52) ** 2));
  return Math.round(214 + a * (3 * Math.sin(x * 0.045) + 2 * Math.sin(x * 0.11 + 1.3)) - swell);
}

function drawSea(r: Raster, L: Lighting): void {
  const rand = rng(11);
  // far sea: flat band with thin horizontal glints
  r.rect(0, HY, W, 20, L.seaFar[0]);
  r.rect(0, HY, W, 1, L.sky[L.sky.length - 1]);
  for (let y = HY + 2; y < HY + 20; y += 2 + Math.floor(rand() * 2)) {
    for (let x = Math.floor(rand() * 20); x < W; x += 14 + Math.floor(rand() * 26)) {
      const len = 2 + Math.floor(rand() * 5);
      r.rect(x, y, len, 1, L.seaFar[1]);
    }
  }
  // mid sea: two stepped bands with wavy crest dashes
  r.bands(HY + 20, H, L.seaMid, 3, [1, 1.6]);
  for (let row = 0; row < 7; row++) {
    const y0 = HY + 24 + row * 6 + row * row * 0.15;
    const phase = row * 1.7;
    for (let x = 0; x < W; x++) {
      const s = Math.sin(x * 0.09 + phase) + 0.6 * Math.sin(x * 0.031 + row);
      if (s > 0.9) r.set(x, y0 + Math.round(Math.sin(x * 0.2 + phase)), L.crest);
    }
  }
  // glints under the sun or the moon
  const b = L.body;
  if (b) {
    for (let y = HY + 1; y < HY + 62; y += 2) {
      const spread = 6 + (y - HY) * 0.45;
      for (let i = 0; i < 3; i++) {
        if (rand() < 0.6) {
          const x = Math.round(b.x + (rand() * 2 - 1) * spread);
          r.rect(x, y, 1 + Math.floor(rand() * 4), 1, L.glint);
        }
      }
    }
  }
  // foreground: rolling swell with a crest line and foam
  for (let x = 0; x < W; x++) {
    const top = fgTop(x, L);
    const breaking = x > 118 && x < 168;
    for (let y = top; y < H; y++) {
      const d = y - top;
      let c: number;
      if (d === 0) c = breaking ? L.foam : L.crest;
      else if (d === 1 && breaking) c = L.foamShadow;
      else if (d < 5) c = L.seaFg[2];
      else if (d < 22) c = L.seaFg[1];
      else c = L.seaFg[0];
      r.set(x, y, c);
    }
    // foam spilling down the face of the breaking swell
    if (breaking) {
      const spill = Math.max(0, Math.round(5 * Math.sin(((x - 118) / 50) * Math.PI)));
      for (let k = 0; k < spill; k++) if ((x + k) % 3 !== 0) r.set(x, top + 1 + k, k < 2 ? L.foam : L.foamShadow);
    }
  }
  // near rolling wave at the bottom edge
  for (let x = 0; x < W; x++) {
    const top = Math.round(252 - 3 * L.waves * Math.sin(x * 0.07 + 2) - 2 * Math.sin(x * 0.023));
    for (let y = top; y < H; y++) {
      const d = y - top;
      r.set(x, y, d === 0 ? L.foam : d < 3 ? L.seaFg[2] : L.seaFg[1]);
    }
    if (Math.sin(x * 0.07 + 2) > 0.55) r.set(x, top - 1, L.foamShadow);
  }
  // foam streaks on the foreground body
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rand() * W);
    const y = fgTop(x, L) + 7 + Math.floor(rand() * 26);
    const len = 3 + Math.floor(rand() * 7);
    for (let k = 0; k < len; k++) {
      if (y < 250) r.set(x + k, y + Math.round(Math.sin((x + k) * 0.3)), k === 0 || k === len - 1 ? L.foamShadow : L.crest);
    }
  }
}

// ---------------------------------------------------------------- props and figures

const shadeOf = (L: Lighting) => (c: number) => L.shade[c] ?? c;

/** Adds a one-pixel rim light on the upper-right edge of the opaque pixels of `fig`. */
function rimLight(fig: Raster, rim: number, skip: readonly number[] = []): void {
  const copy = Uint8Array.from(fig.px);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= fig.w || y >= fig.h ? 0 : copy[y * fig.w + x]);
  for (let y = 0; y < fig.h; y++) {
    for (let x = 0; x < fig.w; x++) {
      const c = at(x, y);
      if (c !== 0 && !skip.includes(c) && at(x + 1, y - 1) === 0 && at(x, y - 1) === 0) fig.set(x, y, rim);
    }
  }
}

function thick(r: Raster, x0: number, y0: number, x1: number, y1: number, c: number, w = 2): void {
  for (let i = 0; i < w; i++) r.line(x0 + i - (w >> 1), y0, x1 + i - (w >> 1), y1, c);
}

/** Head facing right: skin block, hair cap and back of the head, one-pixel eye. */
function head(r: Raster, x: number, y: number, skin: number, hair: number): void {
  r.rect(x, y + 1, 5, 5, skin);
  r.set(x + 5, y + 3, skin);
  r.rect(x, y, 5, 2, hair);
  r.rect(x - 1, y + 1, 2, 4, hair);
  r.set(x + 5, y + 1, hair);
  r.set(x + 3, y + 3, C.ink);
  r.rect(x + 1, y + 6, 3, 1, skin);
}

function finish(f: Raster, L: Lighting, skipRim: readonly number[] = []): Raster {
  for (let i = 0; i < f.px.length; i++) f.px[i] = shadeOf(L)(f.px[i]);
  rimLight(f, L.rim, skipRim.map(shadeOf(L)));
  return f;
}

/** Surfer riding, crouched, arms out for balance. Board bottom is the last row. */
function surfer(L: Lighting): Raster {
  const f = new Raster(40, 34);
  // board with nose rocker and a stripe
  f.rect(4, 30, 30, 1, C.white);
  f.rect(3, 31, 32, 1, C.white);
  f.rect(32, 29, 4, 1, C.white);
  f.rect(35, 28, 2, 1, C.white);
  f.rect(5, 32, 28, 1, C.silver);
  f.rect(17, 30, 2, 2, C.coral);
  // legs (wetsuit shorts) bent into the stance
  thick(f, 11, 29, 13, 24, C.navy, 3);
  thick(f, 13, 24, 18, 19, C.navy, 3);
  thick(f, 25, 29, 25, 24, C.navy, 3);
  thick(f, 25, 24, 21, 19, C.navy, 3);
  f.rect(10, 29, 3, 1, C.tan);
  f.rect(24, 29, 3, 1, C.tan);
  // torso (rash guard), leaning forward
  f.polygon([[15, 21], [22, 21], [25, 11], [19, 10]], C.coral);
  f.line(16, 20, 21, 20, C.red);
  // arms: back arm up behind, front arm low ahead
  thick(f, 19, 12, 14, 13, C.tan);
  thick(f, 14, 13, 9, 9, C.tan);
  thick(f, 24, 12, 28, 15, C.tan);
  thick(f, 28, 15, 32, 16, C.tan);
  f.rect(22, 9, 2, 2, C.tan);
  head(f, 21, 2, C.tan, C.brown);
  return finish(f, L);
}

/** Kitesurfer in the air, legs tucked, leaning back on the bar. */
function kitesurfer(L: Lighting): Raster {
  const f = new Raster(34, 38);
  // twin tip board, tilted
  thick(f, 3, 34, 29, 28, C.gold, 2);
  f.line(4, 35, 29, 29, C.brown);
  // tucked legs
  thick(f, 10, 32, 13, 25, C.navy, 3);
  thick(f, 13, 25, 17, 21, C.navy, 3);
  thick(f, 22, 29, 23, 23, C.navy, 3);
  thick(f, 23, 23, 18, 21, C.navy, 3);
  // torso leaning back, harness with spreader hook
  f.polygon([[14, 22], [21, 22], [19, 11], [13, 11]], C.navy);
  f.rect(14, 18, 7, 3, C.gold);
  f.set(21, 19, C.ink);
  // arms to the bar
  thick(f, 17, 12, 26, 8, C.tan);
  thick(f, 16, 15, 26, 11, C.tan);
  f.line(25, 4, 28, 13, C.grey);
  f.rect(16, 9, 2, 2, C.tan);
  head(f, 14, 3, C.tan, C.brown);
  return finish(f, L);
}

/** Wing foiler standing on a foil board, holding an inflatable wing; mast and foil hang below the board. */
function wingFoiler(L: Lighting): Raster {
  const f = new Raster(50, 62);
  // wing: canopy, leading edge tube, strut and clear window
  f.polygon([[22, 2], [38, 10], [47, 28], [40, 34], [30, 25], [24, 14]], C.coral);
  thick(f, 22, 2, 38, 10, C.gold, 3);
  thick(f, 38, 10, 47, 28, C.gold, 3);
  f.polygon([[29, 13], [37, 17], [39, 25], [32, 22]], C.aqua);
  thick(f, 30, 6, 38, 30, C.red, 2);
  // board
  f.rect(4, 44, 34, 2, C.white);
  f.rect(37, 43, 3, 1, C.white);
  f.rect(5, 46, 32, 1, C.silver);
  // mast, fuselage, front wing and stabilizer
  f.rect(20, 47, 2, 11, C.grey);
  f.rect(8, 58, 24, 1, C.slate);
  f.rect(23, 57, 10, 2, C.slate);
  f.rect(6, 57, 5, 1, C.slate);
  // legs
  thick(f, 12, 43, 14, 36, C.navy, 3);
  thick(f, 14, 36, 18, 31, C.navy, 3);
  thick(f, 26, 43, 25, 36, C.navy, 3);
  thick(f, 25, 36, 21, 31, C.navy, 3);
  // torso (rash guard) and arms to the wing handles
  f.polygon([[15, 33], [22, 33], [22, 20], [16, 20]], C.violet);
  thick(f, 21, 22, 31, 20, C.tan);
  thick(f, 21, 26, 34, 26, C.tan);
  f.rect(18, 18, 2, 2, C.tan);
  head(f, 17, 11, C.tan, C.ink);
  return finish(f, L, [C.aqua]);
}

const BUOY = sprite(
  [
    '...k...',
    '..kgk..',
    '...k...',
    '..krk..',
    '..krk..',
    '.krrRk.',
    '.krrRk.',
    'krrrrRk',
    'kwwwwBk',
    'krrrrRk',
    'krrrrRk',
    'kRRRRRk',
    '.kkkkk.',
  ],
  { k: C.ink, g: C.gold, r: C.red, R: C.wine, w: C.white, B: C.silver },
);

const GULL = sprite(
  [
    'ss.......ss',
    '.sww...wws.',
    '...wwowww..',
    '.....w.....',
  ],
  { s: C.grey, w: C.white, o: C.orange },
);

function drawRock(r: Raster, x: number, base: number, L: Lighting): void {
  const s = shadeOf(L);
  r.polygon([[x, base], [x + 4, base - 7], [x + 10, base - 11], [x + 17, base - 9], [x + 24, base - 3], [x + 27, base]], s(C.grey));
  r.polygon([[x + 13, base - 10], [x + 17, base - 9], [x + 24, base - 3], [x + 27, base], [x + 15, base]], s(C.slate));
  r.line(x + 4, base - 7, x + 10, base - 11, s(C.silver));
  r.line(x + 1, base - 1, x + 4, base - 6, s(C.silver));
  r.rect(x - 2, base, 32, 1, L.foam);
  r.rect(x + 1, base + 1, 4, 1, L.foamShadow);
  r.rect(x + 20, base + 1, 6, 1, L.foamShadow);
}

function drawKite(r: Raster, cx: number, cy: number, L: Lighting): [number, number, number, number] {
  const s = shadeOf(L);
  const R = 30;
  const inner = 23;
  for (let y = -R; y <= 2; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > R + 0.3 || d < inner) continue;
      const ang = Math.atan2(y, x);
      if (ang > -0.25 || ang < -Math.PI + 0.25) continue;
      let c = d > R - 2.2 ? s(C.gold) : s(C.coral);
      if (c === s(C.coral) && Math.abs(Math.round(x / 9) * 9 - x) < 1 && d < R - 2) c = s(C.red);
      if (c === s(C.coral) && x > 8) c = s(C.violet);
      r.set(cx + x, cy + y, c);
    }
  }
  const tipY = cy - Math.round(Math.sin(0.25) * R);
  return [cx - R + 2, tipY, cx + R - 2, tipY];
}

function drawRain(r: Raster, L: Lighting): void {
  const rand = rng(23);
  const n = L.lightning ? 260 : 200;
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rand() * (W + 40));
    const y = Math.floor(rand() * H);
    r.line(x, y, x - 2, y + 5, L.rain);
  }
}

function drawLightning(r: Raster): void {
  const rand = rng(5);
  const pts: [number, number][] = [[336, 30]];
  let x = 336;
  for (let y = 30; y < HY; ) {
    y += 8 + Math.floor(rand() * 8);
    x += Math.floor(rand() * 13) - 6;
    pts.push([x, Math.min(y, HY)]);
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    r.line(ax - 1, ay, bx - 1, by, C.mauve);
    r.line(ax + 1, ay, bx + 1, by, C.mauve);
  }
  for (let i = 0; i + 1 < pts.length; i++) r.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], C.white);
  const [fx, fy] = pts[3];
  r.line(fx, fy, fx + 14, fy + 12, C.sun);
}

// ---------------------------------------------------------------- scenes

/** Open sea scene: sky, clouds, sea, buoy and rock; optionally the three athletes. */
export function renderScene(L: Lighting, withAthletes: boolean): Raster {
  const r = new Raster(W, H);
  const s = shadeOf(L);
  drawSky(r, L);
  if (L.lightning) drawLightning(r);
  drawSea(r, L);
  drawRock(r, 330, 176, L);
  r.blit(BUOY, 238, 186, s);
  r.rect(237, 199, 9, 1, L.foam);
  r.rect(239, 200, 5, 1, s(C.wine));

  if (withAthletes) {
    r.blit(GULL, 182, 72, s);
    r.blit(GULL, 200, 62, s);
    r.blit(GULL, 458, 104, s);

    // kitesurfer high in the air, kite up and to the right
    const kx = 286;
    const ky = 86;
    const tips = drawKite(r, 352, 42, L);
    r.line(tips[0], tips[1], kx + 25, ky + 4, s(C.slate));
    r.line(tips[2], tips[3], kx + 28, ky + 13, s(C.slate));
    r.draw(kitesurfer(L), kx, ky);

    // surfer on the face of the breaking swell
    const sx = 112;
    r.draw(surfer(L), sx, fgTop(sx + 20, L) - 32);

    // wing foiler gliding above the water, mast and foil below the surface
    const wx = 392;
    const fig = wingFoiler(L);
    const boardY = fgTop(wx + 21, L) - 9;
    r.draw(fig, wx, boardY - 44);
    for (let x = wx; x < wx + fig.w; x++) {
      const top = fgTop(x, L);
      for (let y = top; y < boardY + 18; y++) {
        const c = r.get(x, y);
        if (c === s(C.grey) || c === s(C.slate)) r.set(x, y, L.seaFar[0]);
      }
    }
    r.rect(wx + 16, fgTop(wx + 21, L) - 1, 10, 1, L.foam);
  }
  if (L.rain) drawRain(r, L);
  return r;
}

/** Palette sheet: the 32 master colors plus the environment ramps per light condition. */
export function renderPaletteSheet(palette: readonly number[]): Raster {
  const cell = 12;
  const r = new Raster(18 * cell + 8, 2 * cell + 8 + LIGHTINGS.length * (cell + 4) + 8);
  r.rect(0, 0, r.w, r.h, C.grey);
  for (let i = 1; i < palette.length; i++) {
    const col = (i - 1) % 16;
    const row = Math.floor((i - 1) / 16);
    r.rect(4 + col * cell, 4 + row * cell, cell - 1, cell - 1, i);
  }
  LIGHTINGS.forEach((L, k) => {
    const y = 2 * cell + 12 + k * (cell + 4);
    const ramp = [...L.sky, L.cloud.hi, L.cloud.base, L.cloud.shadow, ...L.seaFar, ...L.seaMid, ...L.seaFg, L.crest, L.foam];
    ramp.forEach((c, i) => r.rect(4 + i * cell, y, cell - 1, cell, c));
  });
  return r;
}

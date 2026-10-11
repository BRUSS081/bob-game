import { creature, type Creature, type FishLook } from '../games/sealife.ts';
import { C } from '../render/palette.ts';
import { Raster } from './raster.ts';

/**
 * Sea creatures drawn in code. Fish come from one generator (body
 * profile, tail, fins, pattern and colors); turtles, rays, octopuses and
 * the rest have their own small drawings. Everything faces right; frame 1
 * is the tail or the legs halfway through a stroke.
 */

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

const PROFILE: Record<FishLook['body'], { peak: number; blunt: number; neck: number }> = {
  torpedo: { peak: 0.55, blunt: 0.7, neck: 0.14 },
  oval: { peak: 0.55, blunt: 0.55, neck: 0.16 },
  disc: { peak: 0.5, blunt: 0.42, neck: 0.16 },
  long: { peak: 0.6, blunt: 0.28, neck: 0.3 },
  round: { peak: 0.5, blunt: 0.36, neck: 0.2 },
};

/** Half height of the body at t (0 at the tail joint, 1 at the snout). */
function half(look: FishLook, t: number): number {
  const p = PROFILE[look.body];
  const k = Math.log(0.5) / Math.log(p.peak);
  const s = Math.sin(Math.PI * Math.min(1, Math.max(0, t) ** k));
  const h = (look.h / 2) * s ** p.blunt;
  return t < 0.3 ? Math.max(h, (look.h / 2) * p.neck) : h;
}

function hash(x: number, y: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  h ^= h >>> 13;
  return (h >>> 0) % 97;
}

export function fishRaster(look: FishLook, frame: number): Raster {
  const L = look.len;
  const H = look.h;
  const tailLen = look.tail === 'none' ? 0 : look.tail === 'clip' ? 3 : Math.max(3, Math.round(L * (look.tail === 'shark' ? 0.32 : 0.24)));
  const finUp = look.fin === 'sail' ? Math.round(H * 0.8) : look.fin === 'tall' || look.fin === 'shark' ? Math.round(H * 0.5) : Math.max(2, Math.round(H * 0.3));
  const finDown = look.anal ? (look.fin === 'sail' ? Math.round(H * 0.7) : Math.round(H * 0.35)) : 2;
  const bill = look.bill ? Math.round(L * 0.3) : 0;
  const lureUp = look.lure ? 6 : 0;
  const W = tailLen + L + bill + 4;
  const Ht = H + finUp + finDown + lureUp + 4;
  const r = new Raster(W, Ht);
  const bx0 = 2 + tailLen;
  const cy = 2 + finUp + lureUp + Math.floor(H / 2);
  const flex = frame === 1 ? 1 : 0;
  const tailH = Math.max(2, Math.round(H * (look.body === 'long' ? 0.5 : 0.48)));

  // tail
  const tx = bx0 - tailLen;
  switch (look.tail) {
    case 'fork':
      r.polygon([[bx0 + 1, cy - 1], [tx, cy - tailH + flex], [tx + Math.ceil(tailLen / 2), cy + flex], [tx, cy + tailH + 1 + flex], [bx0 + 1, cy + 2]], look.fins);
      break;
    case 'lunate':
      r.polygon([[bx0 + 1, cy - 1], [tx, cy - tailH - 1 + flex], [tx + Math.ceil(tailLen * 0.7), cy + flex], [tx, cy + tailH + 2 + flex], [bx0 + 1, cy + 2]], look.fins);
      break;
    case 'shark':
      r.polygon([[bx0 + 1, cy - 1], [tx, cy - tailH - 2 + flex], [tx + Math.ceil(tailLen * 0.6), cy + flex], [tx + 2, cy + Math.ceil(tailH * 0.6) + flex], [bx0 + 1, cy + 2]], look.fins);
      break;
    case 'round':
      r.ellipse(tx + Math.floor(tailLen / 2), cy + flex, Math.ceil(tailLen / 2), Math.max(2, Math.round(tailH * 0.75)), look.fins);
      break;
    case 'fan':
      r.polygon([[bx0 + 1, cy - 1], [tx, cy - tailH + flex], [tx, cy + tailH + 1 + flex], [bx0 + 1, cy + 2]], look.fins);
      break;
    case 'clip':
      r.rect(tx, cy - Math.round(H * 0.4) + flex, tailLen, Math.round(H * 0.8), look.fins);
      break;
  }

  // dorsal and anal fins
  const xAt = (t: number) => Math.round(bx0 + t * (L - 1));
  const topAt = (t: number) => Math.round(cy - half(look, t));
  const botAt = (t: number) => Math.round(cy + half(look, t));
  switch (look.fin) {
    case 'low':
      r.polygon([[xAt(0.32), topAt(0.32) + 1], [xAt(0.42), topAt(0.42) - finUp], [xAt(0.62), topAt(0.62) + 1]], look.fins);
      break;
    case 'tall':
    case 'shark':
      r.polygon([[xAt(0.38), topAt(0.38) + 1], [xAt(look.fin === 'shark' ? 0.44 : 0.5), topAt(0.5) - finUp], [xAt(0.62), topAt(0.62) + 1]], look.fins);
      break;
    case 'sail':
      r.polygon([[xAt(0.18), topAt(0.18) + 1], [xAt(0.3), topAt(0.3) - finUp], [xAt(0.62), topAt(0.62) - Math.round(finUp * 0.5)], [xAt(0.8), topAt(0.8) + 1]], look.fins);
      break;
    case 'spiky':
      for (let t = 0.25; t <= 0.7; t += 0.06) {
        const x = xAt(t);
        const top = topAt(t);
        const spike = Math.round(finUp * (Math.round(t * 50) % 2 === 0 ? 1.4 : 0.8));
        for (let y = top - spike; y <= top; y++) r.set(x, y, look.fins);
        r.set(x + 1, top - 1, look.fins);
      }
      break;
    case 'long':
      for (let t = 0.08; t <= 0.85; t += 1 / L) {
        const x = xAt(t);
        r.rect(x, topAt(t) - 2, 1, 3, look.fins);
      }
      break;
  }
  if (look.anal) {
    if (look.fin === 'sail') r.polygon([[xAt(0.2), botAt(0.2) - 1], [xAt(0.3), botAt(0.3) + finDown], [xAt(0.55), botAt(0.55) - 1]], look.fins);
    else r.polygon([[xAt(0.18), botAt(0.18) - 1], [xAt(0.3), botAt(0.3) + finDown], [xAt(0.5), botAt(0.5) - 1]], look.fins);
  } else if (look.body !== 'long') {
    r.polygon([[xAt(0.2), botAt(0.2) - 1], [xAt(0.28), botAt(0.28) + 2], [xAt(0.38), botAt(0.38) - 1]], look.fins);
  }

  // body with back, side and belly tones and the pattern
  for (let x = bx0; x < bx0 + L; x++) {
    const t = (x - bx0) / (L - 1);
    const hh = half(look, t);
    if (hh < 0.5) continue;
    for (let y = Math.round(cy - hh); y <= Math.round(cy + hh); y++) {
      const v = (y - cy) / hh;
      let c = v < -0.42 ? look.back : v > 0.45 ? look.belly : look.side;
      switch (look.pattern) {
        case 'vstripes':
          if (t > 0.12 && t < 0.82 && v < 0.6 && (x - bx0) % 5 < 2) c = look.accent;
          break;
        case 'hstripes':
          if (v < -0.1 && (x + Math.round(Math.sin(y * 1.3) * 1.5)) % 4 === 0) c = look.accent;
          break;
        case 'spots':
          if (v < 0.5 && hash(x, y) < 14) c = look.accent;
          break;
        case 'bands':
          if ((t > 0.26 && t < 0.38) || (t > 0.62 && t < 0.74)) c = look.accent;
          else if ((t > 0.22 && t <= 0.26) || (t >= 0.38 && t < 0.42) || (t > 0.58 && t <= 0.62) || (t >= 0.74 && t < 0.78)) c = C.ink;
          break;
        case 'scales':
          if (v > -0.42 && v < 0.45 && (x + y * 2) % 4 === 0) c = look.accent;
          break;
        case 'mask':
          if (t > 0.74 && t < 0.84) c = look.accent;
          break;
      }
      r.set(x, y, c);
    }
  }

  // pectoral fin, wings, gills
  const px = xAt(0.66);
  if (look.wings) {
    r.polygon([[px + 2, cy], [px - Math.round(L * 0.5), cy - Math.round(H * 0.9) - flex], [px - Math.round(L * 0.35), cy + 1]], look.fins);
  } else {
    r.polygon([[px + 1, cy + 1], [px - 3, cy + 2 + flex], [px - 1, cy + 3]], look.fins);
  }
  if (look.gills) for (let i = 0; i < 3; i++) r.set(xAt(0.74) + i * 2, cy, look.back);

  // eye and mouth
  const ex = xAt(L > 20 ? 0.86 : 0.82);
  const ey = Math.round(cy - half(look, 0.84) * 0.35);
  if (L >= 20) {
    r.set(ex, ey, C.white);
    r.set(ex + 1, ey, C.ink);
  } else {
    r.set(ex, ey, C.ink);
  }
  r.set(bx0 + L - 1, Math.round(cy + Math.max(1, half(look, 0.98) * 0.4)), look.body === 'round' ? C.ink : look.back);
  if (look.bill) {
    for (let i = 0; i < bill; i++) r.set(bx0 + L + i, cy - 1, i > bill - 3 ? C.silver : C.grey);
  }
  if (look.lure) {
    const hx = xAt(0.85);
    const ht = topAt(0.85);
    r.line(hx, ht, hx + 2, ht - lureUp + 1, look.back);
    r.line(hx + 2, ht - lureUp + 1, hx + 5, ht - lureUp + 2, look.back);
    r.rect(hx + 5, ht - lureUp + 2, 2, 2, look.accent);
  }
  ink(r);
  if (look.lure) {
    // the light keeps glowing over the outline
    const hx = xAt(0.85) + 5;
    const hy = topAt(0.85) - lureUp + 2;
    r.set(hx - 1, hy, C.gold);
  }
  return r;
}

// ------------------------------------------------------------------ other creatures

function turtle(frame: number): Raster {
  const r = new Raster(30, 16);
  const f = frame === 1 ? 2 : 0;
  // flippers
  r.polygon([[16, 6], [8 + f, 1], [12 + f, 6]], C.green);
  r.polygon([[11, 10], [5, 14 - f], [9, 10]], C.green);
  r.polygon([[19, 10], [22, 14 - f], [15, 10]], C.green);
  // shell and head
  r.ellipse(14, 8, 9, 4, C.forest);
  for (let x = 8; x < 22; x += 4) r.line(x, 5, x + 1, 10, C.brown);
  r.rect(7, 10, 15, 1, C.tan);
  r.ellipse(25, 7, 3, 2, C.green);
  r.set(26, 6, C.ink);
  r.polygon([[5, 8], [2, 9], [5, 10]], C.green);
  return ink(r);
}

function manta(frame: number): Raster {
  const r = new Raster(36, 18);
  const f = frame === 1 ? 3 : 0;
  r.polygon([[14, 8], [3, 2 + f], [9, 10], [18, 12], [27, 10], [33, 2 + f], [22, 8], [20, 6], [16, 6]], C.navy);
  r.polygon([[16, 11], [20, 11], [18, 14]], C.slate);
  r.line(18, 13, 18, 17, C.navy);
  r.rect(15, 9, 6, 2, C.mist);
  r.set(16, 7, C.ink);
  r.set(20, 7, C.ink);
  return ink(r);
}

function octopus(frame: number): Raster {
  const r = new Raster(20, 22);
  r.ellipse(10, 6, 6, 5, C.mauve);
  r.rect(6, 9, 9, 3, C.mauve);
  for (let i = 0; i < 4; i++) {
    const x0 = 6 + i * 3;
    for (let y = 12; y < 21; y++) {
      const sway = Math.round(Math.sin((y + i * 2 + frame * 3) * 0.6) * 1.5);
      r.set(x0 + sway, y, C.mauve);
      if (y % 3 === 0) r.set(x0 + sway + 1, y, C.rose);
    }
  }
  r.set(8, 7, C.white);
  r.set(12, 7, C.white);
  r.set(8, 8, C.ink);
  r.set(12, 8, C.ink);
  r.set(13, 3, C.rose);
  return ink(r);
}

function jellyfish(frame: number): Raster {
  const r = new Raster(14, 20);
  const squeeze = frame === 1 ? 1 : 0;
  r.ellipse(7, 4, 5 - squeeze, 3 + squeeze, C.rose);
  r.rect(2 + squeeze, 4, 11 - 2 * squeeze, 2, C.rose);
  for (let x = 3; x < 12; x += 2) {
    for (let y = 7; y < 19 - ((x * 3) % 5); y++) r.set(x + (((y >> 2) + frame) & 1), y, C.mauve);
  }
  r.set(5, 2, C.white);
  return ink(r);
}

function seahorse(frame: number): Raster {
  const r = new Raster(12, 22);
  const rows = [
    '....ggg.....',
    '...gggggg...',
    '..ggkgg.ggg.',
    '...ggg......',
    '...gggg.....',
    '..ggyggg....',
    '..gyyggg....',
    '..gyygg.....',
    '..gyygg.....',
    '...yygg.....',
    '...yggg.....',
    '....ggg.....',
    '....gg......',
    '...gg.......',
    '..gg..g.....',
    '..g...g.....',
    '...ggg......',
  ];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === 'g') r.set(x, y + 2 + (frame === 1 && y > 3 ? 0 : 0), C.gold);
      else if (ch === 'y') r.set(x, y + 2, C.sun);
      else if (ch === 'k') r.set(x, y + 2, C.ink);
    }
  });
  if (frame === 1) r.set(6, 8, C.orange);
  r.set(7, 7, C.orange);
  return ink(r);
}

function dolphin(frame: number): Raster {
  const r = new Raster(34, 14);
  const f = frame === 1 ? 1 : 0;
  r.polygon([[4, 5 - f], [1, 2 - f], [2, 7], [1, 11 + f], [5, 8]], C.grey);
  r.ellipse(17, 7, 13, 4, C.grey);
  r.rect(10, 8, 16, 2, C.mist);
  r.polygon([[15, 4], [19, 0], [20, 4]], C.grey);
  r.polygon([[19, 10], [16, 13], [22, 10]], C.grey);
  r.rect(29, 7, 4, 2, C.grey);
  r.set(26, 6, C.ink);
  return ink(r);
}

function squid(frame: number): Raster {
  const r = new Raster(28, 12);
  r.polygon([[2, 6], [6, 1], [7, 11]], C.coral);
  r.ellipse(12, 6, 7, 3, C.coral);
  for (let i = 0; i < 4; i++) {
    const y = 4 + i * 1.3;
    r.line(19, Math.round(y), 26 - (frame === 1 ? 2 : 0) - (i % 2), Math.round(4 + i * 1.6), C.coral);
  }
  r.set(17, 5, C.white);
  r.set(17, 6, C.ink);
  for (let x = 8; x < 16; x += 3) r.set(x, 5, C.rose);
  return ink(r);
}

function crab(frame: number): Raster {
  const r = new Raster(18, 11);
  r.ellipse(9, 6, 5, 3, C.red);
  for (let i = 0; i < 3; i++) {
    r.line(4 - i, 7 + (i === 1 ? frame : 0), 1 - i + 1, 10, C.red);
    r.line(14 + i, 7 + (i === 1 ? frame : 0), 16 + i - 1, 10, C.red);
  }
  r.rect(1, 2 - frame, 3, 2, C.coral);
  r.rect(14, 2 - frame, 3, 2, C.coral);
  r.set(7, 2, C.ink);
  r.set(11, 2, C.ink);
  r.set(7, 3, C.red);
  r.set(11, 3, C.red);
  return ink(r);
}

function star(): Raster {
  const r = new Raster(14, 14);
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? 6 : 2.6;
    pts.push([7 + Math.cos(a) * rad, 7.5 + Math.sin(a) * rad]);
  }
  r.polygon(pts, C.orange);
  r.set(7, 7, C.gold);
  r.set(5, 8, C.gold);
  r.set(9, 8, C.gold);
  return ink(r);
}

/** One creature's raster (frame 0 or 1), facing right. */
export function creatureRaster(c: Creature, frame: number): Raster {
  switch (c.kind) {
    case 'fish':
      return fishRaster(c.look as FishLook, frame);
    case 'turtle':
      return turtle(frame);
    case 'manta':
      return manta(frame);
    case 'octopus':
      return octopus(frame);
    case 'jelly':
      return jellyfish(frame);
    case 'seahorse':
      return seahorse(frame);
    case 'dolphin':
      return dolphin(frame);
    case 'squid':
      return squid(frame);
    case 'crab':
      return crab(frame);
    case 'star':
      return star();
  }
}

/** The creature filled with one color: an unknown entry in the album. */
export function silhouette(r: Raster, color: number): Raster {
  const out = new Raster(r.w, r.h);
  for (let i = 0; i < r.px.length; i++) if (r.px[i]) out.px[i] = color;
  return out;
}

export interface CreatureArt {
  /** [frame 0 right, frame 1 right, frame 0 left, frame 1 left] */
  readonly canvases: readonly HTMLCanvasElement[];
  readonly w: number;
  readonly h: number;
}

/**
 * Canvases for every creature, built on first use: two frames facing
 * right and the same two mirrored. `toCanvas` comes from the renderer.
 */
export class CreatureCache {
  private readonly art = new Map<string, CreatureArt>();
  private readonly shadows = new Map<string, HTMLCanvasElement>();
  private readonly toCanvas: (r: Raster) => HTMLCanvasElement;

  constructor(toCanvas: (r: Raster) => HTMLCanvasElement) {
    this.toCanvas = toCanvas;
  }

  get(id: string): CreatureArt {
    let a = this.art.get(id);
    if (!a) {
      const c = creature(id);
      if (!c) throw new Error(`unknown creature ${id}`);
      const f0 = creatureRaster(c, 0);
      const f1 = creatureRaster(c, 1);
      a = { canvases: [this.toCanvas(f0), this.toCanvas(f1), this.toCanvas(mirror(f0)), this.toCanvas(mirror(f1))], w: f0.w, h: f0.h };
      this.art.set(id, a);
    }
    return a;
  }

  /** The silhouette of a creature not found yet. */
  shadow(id: string, color: number): HTMLCanvasElement {
    const key = id + ':' + color;
    let s = this.shadows.get(key);
    if (!s) {
      const c = creature(id);
      if (!c) throw new Error(`unknown creature ${id}`);
      s = this.toCanvas(silhouette(creatureRaster(c, 0), color));
      this.shadows.set(key, s);
    }
    return s;
  }
}

export function mirror(r: Raster): Raster {
  const out = new Raster(r.w, r.h);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) out.px[y * r.w + x] = r.px[y * r.w + r.w - 1 - x];
  return out;
}

/** 4x4 ordered (Bayer) dither thresholds, 0..15. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export interface Sprite {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;
}

/**
 * Builds a sprite from rows of characters; `legend` maps characters to
 * palette indices, any other character is transparent.
 */
export function sprite(rows: readonly string[], legend: Record<string, number>): Sprite {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const px = new Uint8Array(w * h);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) px[y * w + x] = legend[row[x]] ?? 0;
  });
  return { w, h, px };
}

/** An indexed-color pixel buffer with hard-edged drawing primitives. */
export class Raster {
  readonly px: Uint8Array;
  readonly w: number;
  readonly h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h);
  }

  set(x: number, y: number, c: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (c === 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.px[y * this.w + x];
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Fills the rectangle mixing c1 and c2 with ordered dithering; level 0..16 is the share of c2. */
  dither(x: number, y: number, w: number, h: number, c1: number, c2: number, level: number): void {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const px = x + i;
        const py = y + j;
        this.set(px, py, BAYER4[(py & 3) * 4 + (px & 3)] < level ? c2 : c1);
      }
    }
  }

  /**
   * Vertical stepped gradient through `colors` from y0 to y1, with a short
   * ordered-dither transition between consecutive bands.
   */
  bands(y0: number, y1: number, colors: readonly number[], ditherRows = 4, weights?: readonly number[]): void {
    const n = colors.length;
    const ws = weights ?? colors.map(() => 1);
    const total = ws.reduce((a, b) => a + b, 0);
    let y = y0;
    for (let b = 0; b < n; b++) {
      const end = b === n - 1 ? y1 : Math.round(y + ((y1 - y0) * ws[b]) / total);
      this.rect(0, y, this.w, end - y, colors[b]);
      if (b < n - 1) {
        for (let r = 0; r < ditherRows; r++) {
          const level = Math.round(((r + 1) * 16) / (ditherRows + 1));
          this.dither(0, end - ditherRows + r, this.w, 1, colors[b], colors[b + 1], level);
        }
      }
      y = end;
    }
  }

  circle(cx: number, cy: number, r: number, c: number): void {
    const rr = r * r + r * 0.8;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) if (x * x + y * y <= rr) this.set(cx + x, cy + y, c);
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: number): void {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) this.set(cx + x, cy + y, c);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Scanline polygon fill (even-odd), pixel centers. */
  polygon(points: readonly (readonly [number, number])[], c: number): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const xs: number[] = [];
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, c);
      }
    }
  }

  /** Draws a sprite; `map` optionally remaps palette indices (e.g. for lighting). */
  blit(s: Sprite, x: number, y: number, map?: (c: number) => number, flipX = false): void {
    for (let j = 0; j < s.h; j++) {
      for (let i = 0; i < s.w; i++) {
        const c = s.px[j * s.w + (flipX ? s.w - 1 - i : i)];
        if (c !== 0) this.set(x + i, y + j, map ? map(c) : c);
      }
    }
  }

  /** Copies another raster into this one at (x, y), skipping transparent pixels. */
  draw(src: Raster, x: number, y: number): void {
    for (let j = 0; j < src.h; j++) {
      for (let i = 0; i < src.w; i++) {
        const c = src.px[j * src.w + i];
        if (c !== 0) this.set(x + i, y + j, c);
      }
    }
  }

  /** Nearest-neighbor integer upscale. */
  scaled(k: number): Raster {
    const out = new Raster(this.w * k, this.h * k);
    for (let y = 0; y < out.h; y++) {
      const row = Math.floor(y / k) * this.w;
      for (let x = 0; x < out.w; x++) out.px[y * out.w + x] = this.px[row + Math.floor(x / k)];
    }
    return out;
  }
}

/** Small deterministic PRNG (mulberry32) so reference renders are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

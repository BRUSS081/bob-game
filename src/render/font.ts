import { PALETTE_CSS } from './palette.ts';

/** 5×7 pixel font, drawn in code like every other sprite. */
const GLYPHS: Record<string, readonly string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** Horizontal advance per character. */
export const ADVANCE = 6;

const ORDER = Object.keys(GLYPHS);

/**
 * Bitmap font with one pre-rendered atlas per color, so drawing text is a
 * few drawImage calls with integer coordinates and no allocations.
 */
export class BitmapFont {
  private readonly atlases: (HTMLCanvasElement | undefined)[] = [];
  private readonly index = new Int16Array(128).fill(-1);

  constructor() {
    ORDER.forEach((ch, i) => {
      this.index[ch.charCodeAt(0)] = i;
    });
    // lowercase falls back to uppercase, except the "x" used for multipliers
    for (let c = 97; c <= 122; c++) if (this.index[c] < 0) this.index[c] = this.index[c - 32];
  }

  /** Width in pixels of `length` characters. */
  widthOf(length: number, scale = 1): number {
    return length <= 0 ? 0 : (length * ADVANCE - 1) * scale;
  }

  width(text: string, scale = 1): number {
    return this.widthOf(text.length, scale);
  }

  /** Draws text[start, end) without creating substrings. */
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: number, scale = 1, start = 0, end = text.length): void {
    const atlas = this.atlas(color);
    for (let i = start; i < end; i++) {
      const code = text.charCodeAt(i);
      const g = code < 128 ? this.index[code] : -1;
      if (g < 0) continue;
      ctx.drawImage(atlas, g * GLYPH_W, 0, GLYPH_W, GLYPH_H, x + (i - start) * ADVANCE * scale, y, GLYPH_W * scale, GLYPH_H * scale);
    }
  }

  /** Text with a drop shadow, for legibility on any background. */
  drawShadowed(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: number,
    shadow: number,
    scale = 1,
    start = 0,
    end = text.length,
  ): void {
    this.draw(ctx, text, x + scale, y + scale, shadow, scale, start, end);
    this.draw(ctx, text, x, y, color, scale, start, end);
  }

  /** Draws a non-negative integer zero-padded to `digits`, without building a string. */
  drawNumber(ctx: CanvasRenderingContext2D, value: number, digits: number, x: number, y: number, color: number, scale = 1): void {
    const atlas = this.atlas(color);
    let v = Math.max(0, Math.floor(value));
    const zero = this.index[48];
    for (let i = digits - 1; i >= 0; i--) {
      const d = v % 10;
      v = Math.floor(v / 10);
      ctx.drawImage(atlas, (zero + d) * GLYPH_W, 0, GLYPH_W, GLYPH_H, x + i * ADVANCE * scale, y, GLYPH_W * scale, GLYPH_H * scale);
    }
  }

  private atlas(color: number): HTMLCanvasElement {
    let atlas = this.atlases[color];
    if (atlas) return atlas;
    atlas = document.createElement('canvas');
    atlas.width = ORDER.length * GLYPH_W;
    atlas.height = GLYPH_H;
    const ctx = atlas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = PALETTE_CSS[color];
      ORDER.forEach((ch, g) => {
        GLYPHS[ch].forEach((row, y) => {
          for (let x = 0; x < GLYPH_W; x++) if (row[x] === '#') ctx.fillRect(g * GLYPH_W + x, y, 1, 1);
        });
      });
    }
    this.atlases[color] = atlas;
    return atlas;
  }
}

/**
 * Where to break `text` into two lines: the space closest to the middle,
 * or -1 if there is none.
 */
export function splitPoint(text: string): number {
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 32 && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return best;
}

/** Number of decimal digits of a non-negative integer. */
export function digitCount(value: number): number {
  let v = Math.max(0, Math.floor(value));
  let n = 1;
  while (v >= 10) {
    v = Math.floor(v / 10);
    n++;
  }
  return n;
}

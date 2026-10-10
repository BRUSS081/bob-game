/**
 * Hand-drawn sprite parts, one string per row, one character per pixel.
 * Legend:
 *   .  transparent
 *   S  skin (shaded automatically: light top-right, shadow bottom-left)
 *   z  skin shadow (fixed: ear, mouth)
 *   k  ink (eyes, details)
 *   h  hair            m  helmet          g  glasses frame    G  lens
 *   o  board deck      O  board body      u  board underside  f  fin / foil
 * Parts facing right; heads are 10×10 and overlays use a 16×20 grid whose
 * point (3, 3) is the head's top-left corner.
 */

export const HEAD_W = 10;
export const HEAD_H = 10;
export const OVERLAY_OFFSET = 3;

export const HEADS = {
  bob: [
    '..SSSSS...',
    '.SSSSSSSS.',
    'SSSSSSSSS.',
    'SSSSSSSkS.',
    'SzSSSSSSSS',
    'SzSSSSSSS.',
    '.SSSSSSzS.',
    '.SSSSSSS..',
    '..SSSSS...',
    '...SSS....',
  ],
  bobba: [
    '..SSSSS...',
    '.SSSSSSS..',
    'SSSSSSSkS.',
    'SSSSSSSkS.',
    'SzSSSSSSSS',
    'SzSSSSSSS.',
    '.SSSSSSzS.',
    '.SSSSSSS..',
    '..SSSSS...',
    '...SSS....',
  ],
} as const;

/** Hair styles, in the order of HAIR_STYLES. */
export const HAIR: readonly (readonly string[])[] = [
  // short: messy quiff
  [
    '................',
    '........hh......',
    '......hhhhhh....',
    '....hhhhhhhhhh..',
    '...hhhhhhhhhhhh.',
    '...hhhhhhhhh....',
    '...hhhhhh.......',
    '...hhh..........',
    '...hh...........',
  ],
  // buzz
  [
    '................',
    '................',
    '................',
    '.....hhhhh......',
    '....hhhhhhhh....',
    '...hhhhhhhhh....',
    '...hhhhh........',
    '...hhh..........',
  ],
  // ponytail: high, streaming back in the wind
  [
    '................',
    '................',
    '.....hhhhh......',
    '...hhhhhhhhhh...',
    '.hhhhhhhhhhhhh..',
    'hhhhhhhhhhhh....',
    'hh..hhhhh.......',
    'h...hhhh........',
    'h...hhh.........',
  ],
  // long
  [
    '................',
    '................',
    '.....hhhhhh.....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '..hhhhhhhhhhh...',
    '..hhhhhhh.......',
    '..hhhhhh........',
    '..hhhhh.........',
    '..hhhhh.........',
    '..hhhh..........',
    '..hhhh..........',
    '...hhh..........',
    '...hh...........',
  ],
  // bun
  [
    '....hhh.........',
    '...hhhhh........',
    '...hhhhhhhh.....',
    '...hhhhhhhhhh...',
    '...hhhhhhhhhhh..',
    '...hhhhhhhhh....',
    '...hhhhh........',
    '...hhh..........',
  ],
  // curly
  [
    '................',
    '....hh.hh.hh....',
    '..hhhhhhhhhhhh..',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhh...',
    'hhhhhhhhh.......',
    '.hhhhhhh........',
    '.hhhhhh.........',
    '..hhh...........',
  ],
];

export const HELMET: readonly string[] = [
  '................',
  '.....mmmmm......',
  '...mmmmmmmmm....',
  '..mmmmmmmmmmm...',
  '.mmmmmmmmmmmmm..',
  '.mmmmmmmmmmmmmm.',
  '.mmmmmm.........',
  '..mmm...........',
];

export const GLASSES: readonly string[] = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '....gggggGGGg...',
  '.........GGG....',
];

/** Surfboard (shortboard), nose to the right. */
export const SURFBOARD: readonly string[] = [
  '...........................oo...',
  '..ooooooooooooooooooooooooooOoo.',
  '.uOOOOOOOOOOOOOOOOOOOOOOOOOOOOu.',
  '..uuuuuuuuuuuuuuuuuuuuuuuuuuu...',
  '...ff...........................',
];

/** Kite twin-tip, symmetric with raised tips. */
export const TWINTIP: readonly string[] = [
  'oo......................oo',
  '.oooooooooooooooooooooooo.',
  '.uOOOOOOOOOOOOOOOOOOOOOOu.',
  '..uuuuuuuuuuuuuuuuuuuuuu..',
  '..ff..................ff..',
];

/** Foil board; mast and wings are added by the composer. */
export const FOILBOARD: readonly string[] = [
  '............................o.',
  '.oooooooooooooooooooooooooooOo',
  'uOOOOOOOOOOOOOOOOOOOOOOOOOOOOu',
  '.uuuuuuuuuuuuuuuuuuuuuuuuuuuu.',
];

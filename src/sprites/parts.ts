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
  // lashes over the eye and colored lips
  bobba: [
    '..SSSSS...',
    '.SSSSSSSk.',
    'SSSSSSSkS.',
    'SSSSSSSkS.',
    'SzSSSSSSSS',
    'SzSSSSSSS.',
    '.SSSSSSlS.',
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
  // mohawk: a spiky crest from the forehead to the nape, shaved sides
  [
    '....h...h.......',
    '...hhh.hhh.h....',
    '...hhhhhhhhhh...',
    '...hhhhhhhhh....',
    '...hh...........',
    '...h............',
  ],
  // ponytail: high and long, falling behind the neck to the shoulders; the face stays clear
  [
    '................',
    '.....hhhhh......',
    '...hhhhhhhhh....',
    '.hhhhhhhhhhhh...',
    'hhhhhhhhhhh.....',
    'hhhhhhh.........',
    'hhh.hh..........',
    'hhh.............',
    'hhh.............',
    '.hhh............',
    '.hhh............',
    '..hh............',
    '..hh............',
    '...h............',
  ],
  // long: down the back to the shoulders
  [
    '................',
    '.....hhhhh......',
    '...hhhhhhhhh....',
    '..hhhhhhhhhhh...',
    '.hhhhhhhhhh.....',
    '.hhhhhhh........',
    '.hhhhh..........',
    '.hhhh...........',
    '.hhhh...........',
    '.hhhh...........',
    '.hhhh...........',
    '.hhh............',
    '.hhh............',
    '..hh............',
    '..h.............',
  ],
  // bun
  [
    '..hhh...........',
    '.hhhhhhhh.......',
    '.hhhhhhhhhhh....',
    '..hhhhhhhhhhh...',
    '...hhhhhhhh.....',
    '...hhhh.........',
    '...hh...........',
  ],
  // curly: lots of volume
  [
    '...h.hh.hh......',
    '..hhhhhhhhhh....',
    '.hhhhhhhhhhhh...',
    'hhhhhhhhhhhhhh..',
    'hhhhhhhhhhhh....',
    'hhhhhhh.........',
    'hhhhhh..........',
    '.hhhh...........',
    '.hhh............',
    '..h.............',
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

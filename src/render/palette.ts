/**
 * The single master palette of the game: 32 colors, index 0 is transparent.
 * Sprites and environment are drawn with palette indices; lighting (time of
 * day, weather) remaps indices instead of introducing new colors.
 * Customizable parts (skin, hair, suits, gear) get their own ramps later.
 */
export const PALETTE: readonly number[] = [
  0x000000, // 0  transparent
  // neutrals
  0x0d1321, // 1  ink
  0x1b2440, // 2  navy
  0x2e3566, // 3  indigo
  0x4a5675, // 4  slate
  0x7a86a0, // 5  grey
  0xaeb8c9, // 6  silver
  0xdbe2ec, // 7  mist
  0xf7fafc, // 8  white
  // sea
  0x0b4a63, // 9  abyss
  0x0f6f86, // 10 deep
  0x179aa8, // 11 teal
  0x2cc0c4, // 12 sea
  0x5ad8d0, // 13 turquoise
  0x9aeee2, // 14 aqua
  0xd2f7f1, // 15 foam shadow
  // sky
  0x2f7fd6, // 16 blue
  0x4fa6ec, // 17 sky
  0x86c9f4, // 18 sky light
  0xc0e6fb, // 19 sky pale
  // warm light
  0xfff4b8, // 20 sun
  0xffd447, // 21 gold
  0xff9f43, // 22 orange
  0xff6f5e, // 23 coral
  0xd9363e, // 24 red
  0x8c1f3a, // 25 wine
  0xff9fbe, // 26 rose
  0xc060a8, // 27 mauve
  0x7a4aa8, // 28 violet
  // nature
  0x46a85a, // 29 green
  0x23674a, // 30 forest
  0xd9a066, // 31 tan
  0x7b4a2e, // 32 brown
];

/** Named palette indices. */
export const C = {
  clear: 0,
  ink: 1,
  navy: 2,
  indigo: 3,
  slate: 4,
  grey: 5,
  silver: 6,
  mist: 7,
  white: 8,
  abyss: 9,
  deep: 10,
  teal: 11,
  sea: 12,
  turquoise: 13,
  aqua: 14,
  foamShadow: 15,
  blue: 16,
  sky: 17,
  skyLight: 18,
  skyPale: 19,
  sun: 20,
  gold: 21,
  orange: 22,
  coral: 23,
  red: 24,
  wine: 25,
  rose: 26,
  mauve: 27,
  violet: 28,
  green: 29,
  forest: 30,
  tan: 31,
  brown: 32,
} as const;

/** CSS color strings for canvas fillStyle, precomputed once. */
export const PALETTE_CSS: readonly string[] = PALETTE.map(
  (rgb) => '#' + rgb.toString(16).padStart(6, '0'),
);

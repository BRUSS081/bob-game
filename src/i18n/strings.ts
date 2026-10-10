/**
 * Every UI string lives here. English is the default; Italian and
 * Portuguese arrive in phase 7. The pixel font is uppercase only for now.
 */
export const STRINGS = {
  en: {
    title: 'BOB',
    sports: { surf: 'SURF', kite: 'KITESURF', wing: 'WING FOIL' },
    characters: { bob: 'BOB', bobba: 'BOBBA' },
    play: 'PLAY',
    customize: 'CUSTOMIZE',
    home: 'HOME',
    done: 'DONE',
    random: 'RANDOM',
    resume: 'RESUME',
    again: 'AGAIN',
    tabs: { athlete: 'ATHLETE', suit: 'SUIT', gear: 'GEAR' },
    none: 'NONE',
    startDesktop: 'SPACE OR CLICK TO PLAY',
    startTouch: 'TAP PLAY TO START',
    hints: {
      surf: ['TAP TO JUMP, HOLD TO JUMP HIGHER', 'TAP AGAIN IN THE AIR FOR A TRICK'],
      kite: ['TAP FOR A BIG JUMP', 'PRESS AND HOLD IN THE AIR TO SPIN'],
      wing: ['HOLD TO RISE, LET GO TO SINK', 'TOO HIGH BREACHES, TOO LOW DRAGS'],
    },
    paused: 'PAUSED',
    resumeDesktop: 'PRESS SPACE OR CLICK TO RESUME',
    resumeTouch: 'TAP TO RESUME',
    wipeout: 'WIPEOUT!',
    restartDesktop: 'PRESS SPACE OR CLICK TO GO AGAIN',
    restartTouch: 'TAP TO GO AGAIN',
    hi: 'HI',
    newBest: 'NEW BEST!',
    power: { wave: 'PERFECT WAVE', gust: 'WIND GUST' },
    spins: 'SPINS',
    labels: {
      character: 'RIDER',
      skin: 'SKIN',
      hairStyle: 'HAIR',
      hairColor: 'HAIR COLOR',
      suitStyle: 'STYLE',
      suitA: 'SUIT 1',
      suitB: 'SUIT 2',
      helmet: 'HELMET',
      glasses: 'GLASSES',
      harness: 'HARNESS',
      board: 'BOARD',
      boardArt: 'BOARD ART',
      boardArtColor: 'ART COLOR',
      gearA: { kite: 'KITE 1', wing: 'WING 1', surf: '' },
      gearB: { kite: 'KITE 2', wing: 'WING 2', surf: '' },
      gearPattern: { kite: 'KITE ART', wing: 'WING ART', surf: '' },
      foil: 'FOIL',
    },
    styles: {
      hairStyle: { short: 'SHORT', buzz: 'BUZZ', ponytail: 'PONYTAIL', long: 'LONG', bun: 'BUN', curly: 'CURLY' },
      suitStyle: { full: 'FULL SUIT', shorty: 'SHORTY', rashguard: 'RASH TOP' },
      boardArt: { none: 'PLAIN', stripe: 'STRIPE', split: 'SPLIT', rails: 'RAILS', dots: 'DOTS' },
      gearPattern: { solid: 'SOLID', split: 'SPLIT', stripes: 'STRIPES', tips: 'TIPS' },
    },
  },
} as const;

export type Lang = keyof typeof STRINGS;
export type Strings = (typeof STRINGS)[Lang];

export const t: Strings = STRINGS.en;

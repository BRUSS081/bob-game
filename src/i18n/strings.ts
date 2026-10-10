/**
 * Every UI string lives here. English is the default; Italian and
 * Portuguese arrive in phase 7. The pixel font is uppercase only for now.
 */
export const STRINGS = {
  en: {
    title: 'BOB',
    sport: 'SURF',
    startDesktop: 'PRESS SPACE OR CLICK TO SURF',
    startTouch: 'TAP TO SURF',
    hintHold: 'HOLD TO JUMP HIGHER',
    hintTrick: 'TAP AGAIN IN THE AIR FOR A TRICK',
    paused: 'PAUSED',
    resumeDesktop: 'PRESS SPACE OR CLICK TO RESUME',
    resumeTouch: 'TAP TO RESUME',
    wipeout: 'WIPEOUT!',
    restartDesktop: 'PRESS SPACE OR CLICK TO SURF AGAIN',
    restartTouch: 'TAP TO SURF AGAIN',
    hi: 'HI',
    newBest: 'NEW BEST!',
    perfectWave: 'PERFECT WAVE',
  },
} as const;

export type Lang = keyof typeof STRINGS;
export type Strings = (typeof STRINGS)[Lang];

export const t: Strings = STRINGS.en;

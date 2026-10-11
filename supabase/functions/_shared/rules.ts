/**
 * Leaderboard rules shared by the game and the Edge Function: boards,
 * nicknames and their filter, the week key, the plausible score limit.
 * Plain TypeScript without imports, so both Vite and Deno can load it.
 */

/** One leaderboard per sport of the endless runner. */
export const BOARDS = ['surf', 'kite', 'wing'] as const;
export type Board = (typeof BOARDS)[number];

export const RIDERS = ['bob', 'bobba'] as const;
export type Rider = (typeof RIDERS)[number];

/** All time, and the current week. */
export const PERIODS = ['all', 'week'] as const;
export type Period = (typeof PERIODS)[number];

export const NICK_MIN = 3;
export const NICK_MAX = 12;
/** Letters, digits and the underscore: what the pixel font can draw. */
export const NICK_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';

export function isBoard(v: unknown): v is Board {
  return typeof v === 'string' && (BOARDS as readonly string[]).includes(v);
}

export function isRider(v: unknown): v is Rider {
  return typeof v === 'string' && (RIDERS as readonly string[]).includes(v);
}

/** Uppercase, only the allowed characters, at most NICK_MAX long. */
export function cleanNickname(raw: string): string {
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (NICK_CHARS.includes(ch)) out += ch;
    if (out.length === NICK_MAX) break;
  }
  return out;
}

/**
 * Words nobody should see on the board, in English, Italian, Portuguese and
 * Spanish. STRONG ones are refused anywhere in a nickname; SHORT ones only
 * as the whole nickname, because they hide inside innocent words
 * ("deputato", "pacifica", "nazionale", "cockpit").
 */
const STRONG = [
  // English
  'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard', 'bastard', 'asshole',
  'wanker', 'twat', 'hitler', 'penis', 'vagina', 'porn', 'dildo', 'blowjob', 'boobs',
  // Italian
  'cazzo', 'merda', 'stronzo', 'stronza', 'puttana', 'troia', 'vaffanculo', 'fanculo', 'coglion', 'minchia', 'porcodio',
  'diocane', 'frocio', 'ricchione', 'zoccola', 'mignotta', 'bastardo', 'pompino', 'fottiti',
  // Portuguese
  'porra', 'caralho', 'buceta', 'fodase', 'arrombado', 'piroca', 'cacete', 'filhodaputa', 'vagabunda', 'viado',
  // Spanish
  'mierda', 'joder', 'pendejo', 'cabron', 'chingar', 'chingada', 'culero', 'maricon', 'gilipollas', 'hijoputa', 'follar',
];
const SHORT = [
  'ass', 'dick', 'cock', 'fag', 'cum', 'sex', 'anal', 'rape', 'nazi', 'tits', 'puta', 'puto', 'culo', 'figa', 'fica', 'sega',
  'cu', 'foda', 'pica', 'bosta', 'cono', 'polla', 'verga', 'zorra', 'concha', 'negro', 'mona', 'kkk',
];

/** Lowercase letters only, with look-alike digits read as letters and repeated letters squeezed. */
export function normalizeWord(s: string): string {
  const leet: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' };
  let out = '';
  for (const raw of s.toLowerCase()) {
    const ch = leet[raw] ?? raw;
    if (ch < 'a' || ch > 'z') continue;
    if (out.length > 0 && out[out.length - 1] === ch) continue;
    out += ch;
  }
  return out;
}

const STRONG_N = STRONG.map(normalizeWord);
const SHORT_N = SHORT.map(normalizeWord);

export function isRude(nickname: string): boolean {
  const n = normalizeWord(nickname);
  if (STRONG_N.some((w) => n.includes(w))) return true;
  return SHORT_N.includes(n);
}

export type NickProblem = 'short' | 'chars' | 'rude';

/** Why a nickname cannot be used, or null when it is fine. */
export function nicknameProblem(nickname: string): NickProblem | null {
  if (cleanNickname(nickname) !== nickname || nickname.length > NICK_MAX) return 'chars';
  if (nickname.length < NICK_MIN) return 'short';
  if (isRude(nickname)) return 'rude';
  return null;
}

/** The ISO week of a date in UTC, like "2026-W41": the weekly board's key. */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of this week decides the year
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week < 10 ? '0' : ''}${week}`;
}

/**
 * The most points per second a perfect player could score on each board:
 * distance at top speed with the power-up (and the wing's full flow), a
 * clean spin every spin time at the top multiplier with the power-up, and
 * room for bonuses (near misses, rivals, dolphins). Generous on purpose:
 * it stops impossible scores, never a great run. Tests check these
 * numbers against the game's tuning.
 */
export const SCORE_RATE: Record<Board, { distance: number; tricks: number; bonus: number }> = {
  // 450 px/s * 0.1 * 2;  100 * 5 * 2 / 0.3 s (a jump lasts longer than a spin anyway)
  surf: { distance: 90, tricks: 3334, bonus: 400 },
  // 460 px/s * 0.1 * 2;  100 * 5 * 2 / (0.42 s * 0.85: a turn may land 15% short)
  kite: { distance: 92, tricks: 2802, bonus: 400 },
  // 420 px/s * 0.1 * 2 * 3 (flow);  wing foil has no tricks
  wing: { distance: 252, tricks: 0, bonus: 400 },
};

/** Points a run of `seconds` can reach at most on a board. */
export function maxScore(board: Board, seconds: number): number {
  const r = SCORE_RATE[board];
  return Math.ceil(Math.max(0, seconds) * (r.distance + r.tricks + r.bonus)) + 500;
}

/** Runs shorter than this cannot be sent; longer than this, the session has expired. */
export const MIN_RUN_SECONDS = 1;
export const MAX_SESSION_SECONDS = 3 * 60 * 60;
/** Clock slack between the device and the server, in seconds. */
export const CLOCK_SLACK = 5;

/** A player's secret: 32 lowercase hex digits, kept on the device. */
export function isSecret(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
}

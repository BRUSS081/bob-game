import { BOARDS, PERIODS, isoWeek, type Board, type Period, type Rider } from '../../supabase/functions/_shared/rules.ts';
import { LEADERBOARD_KEY, LEADERBOARD_URL } from './config.ts';

export interface Entry {
  readonly nickname: string;
  readonly rider: Rider;
  readonly score: number;
  readonly player: string;
}

export interface Place {
  readonly rank: number;
  readonly score: number;
}

/** off: no leaderboard configured; offline: no network or the server did not answer. */
export type ViewStatus = 'off' | 'idle' | 'loading' | 'ready' | 'offline';

/** One board and period as the ranks screen shows it, refreshed by load(). */
export interface BoardView {
  status: ViewStatus;
  top: Entry[];
  me: Place | null;
  /** When it was last loaded (ms), to avoid asking again too soon. */
  loadedAt: number;
}

export type SubmitOutcome =
  | { readonly kind: 'ok'; readonly all: Place | null; readonly week: Place | null }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'offline' };

export interface RunToSend {
  readonly token: string;
  readonly board: Board;
  readonly score: number;
  readonly seconds: number;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Places shown on a board. */
export const TOP = 50;
/** Seconds before a board is asked for again. */
const FRESH = 20;
const TIMEOUT = 6000;

/**
 * Talks to the global leaderboard: reads boards straight from the database
 * (public read), and starts and sends runs through the Edge Function. Every
 * call has a timeout and never throws: without a network the game plays on.
 */
export class LeaderboardClient {
  private readonly url: string;
  private readonly key: string;
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;
  private readonly views: BoardView[] = [];

  constructor(url = LEADERBOARD_URL, key = LEADERBOARD_KEY, fetchFn?: FetchLike, now: () => number = Date.now) {
    this.url = url.replace(/\/+$/, '');
    this.key = key;
    this.fetchFn = fetchFn ?? ((u, init) => fetch(u, init));
    this.now = now;
    for (let i = 0; i < BOARDS.length * PERIODS.length; i++) this.views.push({ status: this.configured ? 'idle' : 'off', top: [], me: null, loadedAt: 0 });
  }

  get configured(): boolean {
    return this.url !== '' && this.key !== '';
  }

  /** The browser says we are offline (or there is no leaderboard at all). */
  get reachable(): boolean {
    return this.configured && (typeof navigator === 'undefined' || navigator.onLine !== false);
  }

  /** The view of a board and period; the same object every time, so screens can read it each frame. */
  view(board: Board, period: Period): BoardView {
    return this.views[BOARDS.indexOf(board) * PERIODS.length + PERIODS.indexOf(period)];
  }

  /** The period key the server uses: 'all' or this week's ISO week. */
  periodKey(period: Period): string {
    return period === 'all' ? 'all' : isoWeek(new Date(this.now()));
  }

  private async request(path: string, init: RequestInit): Promise<Response | null> {
    const abort = typeof AbortController === 'undefined' ? null : new AbortController();
    const timer = abort ? setTimeout(() => abort.abort(), TIMEOUT) : 0;
    try {
      return await this.fetchFn(this.url + path, { ...init, signal: abort?.signal });
    } catch {
      return null;
    } finally {
      if (abort) clearTimeout(timer);
    }
  }

  private async callFunction(body: Record<string, unknown>): Promise<Response | null> {
    return this.request('/functions/v1/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.key },
      body: JSON.stringify(body),
    });
  }

  /** Loads the top places and the player's own place, unless loaded a moment ago. */
  async load(board: Board, period: Period, player: string, force = false): Promise<void> {
    const v = this.view(board, period);
    if (!this.configured) return;
    if (!this.reachable) {
      v.status = 'offline';
      return;
    }
    if (v.status === 'loading' || (!force && v.status === 'ready' && this.now() - v.loadedAt < FRESH * 1000)) return;
    v.status = 'loading';
    const key = encodeURIComponent(this.periodKey(period));
    const headers = { apikey: this.key };
    const [topRes, meRes] = await Promise.all([
      this.request(
        `/rest/v1/scores?select=nickname,rider,score,player&board=eq.${board}&period=eq.${key}&order=score.desc,updated_at.asc&limit=${TOP}`,
        { headers },
      ),
      player
        ? this.request('/rest/v1/rpc/rank_of', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_board: board, p_period: this.periodKey(period), p_player: player }),
          })
        : Promise.resolve(null),
    ]);
    if (!topRes || !topRes.ok) {
      v.status = 'offline';
      return;
    }
    try {
      const rows = (await topRes.json()) as Entry[];
      v.top = Array.isArray(rows) ? rows.filter(validEntry) : [];
      const mine = meRes && meRes.ok ? ((await meRes.json()) as { rank: number; score: number }[]) : [];
      v.me = Array.isArray(mine) && mine.length > 0 ? { rank: Number(mine[0].rank), score: Number(mine[0].score) } : null;
      v.status = 'ready';
      v.loadedAt = this.now();
    } catch {
      v.status = 'offline';
    }
  }

  /** Asks for a session token when a run starts; null when offline or refused. */
  async start(secret: string, board: Board): Promise<string | null> {
    if (!this.reachable) return null;
    const res = await this.callFunction({ action: 'start', secret, board });
    if (!res || !res.ok) return null;
    try {
      const body = (await res.json()) as { token?: unknown };
      return typeof body.token === 'string' ? body.token : null;
    } catch {
      return null;
    }
  }

  /** Sends a finished run. */
  async submit(secret: string, run: RunToSend, nickname: string, rider: Rider): Promise<SubmitOutcome> {
    if (!this.reachable) return { kind: 'offline' };
    const res = await this.callFunction({
      action: 'submit',
      secret,
      token: run.token,
      board: run.board,
      nickname,
      rider,
      score: run.score,
      seconds: run.seconds,
    });
    if (!res) return { kind: 'offline' };
    try {
      const body = (await res.json()) as { error?: string; all?: Place | null; week?: Place | null };
      if (!res.ok) return res.status >= 500 ? { kind: 'offline' } : { kind: 'rejected', reason: body.error ?? 'unknown' };
      // the board changed: ask again next time it is shown
      for (const period of PERIODS) this.view(run.board, period).loadedAt = 0;
      return { kind: 'ok', all: body.all ?? null, week: body.week ?? null };
    } catch {
      return { kind: 'offline' };
    }
  }
}

function validEntry(e: unknown): e is Entry {
  if (typeof e !== 'object' || e === null) return false;
  const r = e as Record<string, unknown>;
  return typeof r.nickname === 'string' && (r.rider === 'bob' || r.rider === 'bobba') && typeof r.score === 'number' && typeof r.player === 'string';
}

/** SHA-256 of the player's secret, as the server stores it. */
export async function playerHash(secret: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)));
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** A new random secret for this device: 32 hex digits. */
export function newSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

// The leaderboard function's logic; index.ts wires it to Deno.serve.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  CLOCK_SLACK,
  MAX_SESSION_SECONDS,
  MIN_RUN_SECONDS,
  isBoard,
  isRider,
  isSecret,
  isoWeek,
  maxScore,
  nicknameProblem,
} from '../_shared/rules.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** At most this many runs started per player per hour, and one every two seconds. */
export const STARTS_PER_HOUR = 240;
export const MIN_START_GAP = 2;

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

export async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The request handler, given the database (service role) and a clock, so tests can fake both. */
export function createHandler(db: SupabaseClient, now: () => number = Date.now): (req: Request) => Promise<Response> {
  const iso = (ms: number) => new Date(ms).toISOString();

  async function start(player: string, board: string): Promise<Response> {
    const { data: recent, error } = await db
      .from('sessions')
      .select('started_at')
      .eq('player', player)
      .gte('started_at', iso(now() - 3600_000))
      .order('started_at', { ascending: false })
      .limit(STARTS_PER_HOUR);
    if (error || !recent) return reply({ error: 'db' }, 500);
    if (recent.length >= STARTS_PER_HOUR) return reply({ error: 'rate' }, 429);
    if (recent.length > 0 && now() - Date.parse(recent[0].started_at) < MIN_START_GAP * 1000) return reply({ error: 'rate' }, 429);

    const { data, error: insertError } = await db.from('sessions').insert({ player, board, started_at: iso(now()) }).select('id').single();
    if (insertError || !data) return reply({ error: 'db' }, 500);
    // now and then, forget sessions older than a day
    if (Math.random() < 0.02) await db.from('sessions').delete().lt('started_at', iso(now() - 86400_000));
    return reply({ token: data.id });
  }

  async function rank(board: string, period: string, player: string): Promise<{ rank: number; score: number } | null> {
    const { data } = await db.rpc('rank_of', { p_board: board, p_period: period, p_player: player });
    const row = Array.isArray(data) ? data[0] : null;
    return row ? { rank: Number(row.rank), score: Number(row.score) } : null;
  }

  async function submit(player: string, body: Record<string, unknown>): Promise<Response> {
    const { token, board, nickname, rider, score, seconds } = body;
    if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/.test(token)) return reply({ error: 'token' }, 400);
    if (!isBoard(board) || !isRider(rider)) return reply({ error: 'input' }, 400);
    if (typeof nickname !== 'string' || nicknameProblem(nickname)) return reply({ error: 'nickname' }, 400);
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0) return reply({ error: 'input' }, 400);
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return reply({ error: 'input' }, 400);

    // the session is used once: whoever marks it first wins
    const { data: session, error } = await db
      .from('sessions')
      .update({ used_at: iso(now()) })
      .eq('id', token)
      .eq('player', player)
      .eq('board', board)
      .is('used_at', null)
      .select('started_at')
      .maybeSingle();
    if (error) return reply({ error: 'db' }, 500);
    if (!session) return reply({ error: 'token' }, 403);

    const elapsed = (now() - Date.parse(session.started_at)) / 1000;
    if (elapsed > MAX_SESSION_SECONDS) return reply({ error: 'expired' }, 403);
    if (seconds < MIN_RUN_SECONDS || seconds > elapsed + CLOCK_SLACK) return reply({ error: 'time' }, 403);
    if (score > maxScore(board, seconds)) return reply({ error: 'score' }, 403);

    const week = isoWeek(new Date(now()));
    for (const period of ['all', week]) {
      const { error: e } = await db.rpc('submit_score', {
        p_board: board,
        p_period: period,
        p_player: player,
        p_nickname: nickname,
        p_rider: rider,
        p_score: score,
      });
      if (e) return reply({ error: 'db' }, 500);
    }
    return reply({ all: await rank(board, 'all', player), week: await rank(board, week, player), period: week });
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return reply({ error: 'method' }, 405);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return reply({ error: 'json' }, 400);
    }
    if (typeof body !== 'object' || body === null) return reply({ error: 'json' }, 400);
    if (!isSecret(body.secret) || !isBoard(body.board)) return reply({ error: 'input' }, 400);
    const player = await sha256(body.secret);
    if (body.action === 'start') return start(player, body.board);
    if (body.action === 'submit') return submit(player, body);
    return reply({ error: 'action' }, 400);
  };
}

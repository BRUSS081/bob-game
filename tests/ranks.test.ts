import { describe, expect, it } from 'vitest';
import {
  BOARDS,
  SCORE_RATE,
  cleanNickname,
  isRude,
  isoWeek,
  maxScore,
  nicknameProblem,
} from '../supabase/functions/_shared/rules.ts';
import { STEP } from '../src/core/loop.ts';
import { FLOW, KITE, SCORING, SURF, WING } from '../src/game/config.ts';
import { Game } from '../src/game/game.ts';
import { LeaderboardClient, newSecret, playerHash } from '../src/net/leaderboard.ts';
import { Ranks } from '../src/net/ranks.ts';
import { Bot } from './helpers/bot.ts';

describe('nicknames', () => {
  it('keep only letters, digits and the underscore, uppercase, at most 12', () => {
    expect(cleanNickname('bob the surfer!')).toBe('BOBTHESURFER');
    expect(cleanNickname('a-b_c.d')).toBe('AB_CD');
    expect(cleanNickname('x'.repeat(20))).toHaveLength(12);
  });

  it('must be 3 to 12 allowed characters and polite', () => {
    expect(nicknameProblem('AL')).toBe('short');
    expect(nicknameProblem('ALE')).toBeNull();
    expect(nicknameProblem('SURF_KING_99')).toBeNull();
    expect(nicknameProblem('lowercase')).toBe('chars');
    expect(nicknameProblem('TOOLONGNAME13')).toBe('chars');
    expect(nicknameProblem('CAZZONE')).toBe('rude');
  });

  it('catch rude words in four languages, even disguised', () => {
    for (const bad of ['FUCK', 'F_U_C_K', 'FUUUCK', 'SH1T', 'MERDA', 'STR0NZO', 'CARALHO', 'PORRA', 'MIERDA', 'JODER', 'PUTA', 'XXCAZZOXX']) {
      expect(isRude(bad), bad).toBe(true);
    }
  });

  it('let innocent words through', () => {
    for (const ok of ['DEPUTATO', 'PACIFICA', 'NAZIONALE', 'COCKPIT', 'CLASSIC', 'ANALISI', 'ESSEX', 'PICASSO', 'BOBBA', 'SURFER', 'COMPUTO']) {
      expect(isRude(ok), ok).toBe(false);
    }
  });
});

describe('weekly board', () => {
  it('uses ISO weeks in UTC', () => {
    expect(isoWeek(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-W01');
    expect(isoWeek(new Date(Date.UTC(2021, 0, 3)))).toBe('2020-W53');
    expect(isoWeek(new Date(Date.UTC(2026, 9, 11, 23, 59)))).toBe('2026-W41');
    expect(isoWeek(new Date(Date.UTC(2026, 9, 12, 0, 1)))).toBe('2026-W42');
  });
});

describe('plausible scores', () => {
  it('the limits follow the game tuning', () => {
    const power = SCORING.powerFactor;
    const top = SCORING.trickBase * SCORING.maxMultiplier * power;
    expect(SCORE_RATE.surf.distance).toBeGreaterThanOrEqual(SURF.maxSpeed * SCORING.pointsPerPx * power);
    expect(SCORE_RATE.kite.distance).toBeGreaterThanOrEqual(KITE.maxSpeed * SCORING.pointsPerPx * power);
    expect(SCORE_RATE.wing.distance).toBeGreaterThanOrEqual(WING.maxSpeed * SCORING.pointsPerPx * power * FLOW.maxFactor);
    expect(SCORE_RATE.surf.tricks).toBeGreaterThanOrEqual(top / SURF.trickDuration);
    expect(SCORE_RATE.kite.tricks).toBeGreaterThanOrEqual(top / (KITE.spinTime * (1 - KITE.spinTolerance)));
    for (const b of BOARDS) expect(SCORE_RATE[b].bonus).toBeGreaterThanOrEqual(SCORING.dolphinPoints * power);
  });

  it('a perfect player is always plausible, an impossible score is not', () => {
    for (const sport of BOARDS) {
      const g = new Game(sport, 0, {}, {});
      const bot = new Bot();
      g.start(7);
      for (let i = 0; i < 90 / STEP && g.phase === 'running'; i++) {
        const [pressed, held] = bot.decide(g);
        g.update(STEP, pressed, held);
      }
      expect(g.points).toBeLessThanOrEqual(maxScore(sport, g.time));
      expect(maxScore(sport, 30)).toBeLessThan(1_000_000);
    }
  });
});

/** A fake server: answers by path, records what it was asked. */
function fakeServer(routes: Record<string, (body: Record<string, unknown> | null) => [number, unknown]>) {
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    const path = url.replace('https://x.supabase.co', '').split('?')[0];
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ path, body });
    const route = routes[path + (body && typeof body.action === 'string' ? '#' + body.action : '')] ?? routes[path];
    if (!route) throw new Error('no route ' + path);
    const [status, json] = route(body);
    return new Response(JSON.stringify(json), { status });
  };
  return { calls, fetchFn };
}

describe('leaderboard client', () => {
  it('stays off and silent without a project', async () => {
    const { calls, fetchFn } = fakeServer({});
    const c = new LeaderboardClient('', '', fetchFn);
    expect(c.configured).toBe(false);
    expect(c.view('surf', 'all').status).toBe('off');
    await c.load('surf', 'all', 'p');
    expect(await c.start(newSecret(), 'surf')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('loads the top places and your own', async () => {
    const { calls, fetchFn } = fakeServer({
      '/rest/v1/scores': () => [200, [{ nickname: 'ALE', rider: 'bobba', score: 900, player: 'a' }, { nickname: 'BOB_1', rider: 'bob', score: 500, player: 'b' }, { junk: true }]],
      '/rest/v1/rpc/rank_of': () => [200, [{ rank: 2, score: 500 }]],
    });
    const c = new LeaderboardClient('https://x.supabase.co', 'key', fetchFn);
    await c.load('kite', 'week', 'b');
    const v = c.view('kite', 'week');
    expect(v.status).toBe('ready');
    expect(v.top).toHaveLength(2);
    expect(v.me).toEqual({ rank: 2, score: 500 });
    expect(calls.find((x) => x.path === '/rest/v1/rpc/rank_of')?.body?.p_period).toMatch(/^\d{4}-W\d{2}$/);
    // loaded a moment ago: no new request
    await c.load('kite', 'week', 'b');
    expect(calls).toHaveLength(2);
  });

  it('shows offline when the network fails', async () => {
    const c = new LeaderboardClient('https://x.supabase.co', 'key', async () => {
      throw new TypeError('network');
    });
    await c.load('surf', 'all', 'p');
    expect(c.view('surf', 'all').status).toBe('offline');
    expect(await c.start(newSecret(), 'surf')).toBeNull();
    const out = await c.submit(newSecret(), { token: 't', board: 'surf', score: 1, seconds: 2 }, 'ALE', 'bob');
    expect(out.kind).toBe('offline');
  });

  it('tells a refused run from a server error', async () => {
    let status = 403;
    const { fetchFn } = fakeServer({ '/functions/v1/leaderboard': () => [status, { error: 'score' }] });
    const c = new LeaderboardClient('https://x.supabase.co', 'key', fetchFn);
    const run = { token: 't', board: 'wing' as const, score: 10, seconds: 5 };
    expect(await c.submit(newSecret(), run, 'ALE', 'bob')).toEqual({ kind: 'rejected', reason: 'score' });
    status = 503;
    expect((await c.submit(newSecret(), run, 'ALE', 'bob')).kind).toBe('offline');
  });

  it('hashes the secret the way the server does', async () => {
    const s = newSecret();
    expect(s).toMatch(/^[0-9a-f]{32}$/);
    expect(await playerHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('runs and the leaderboard', () => {
  function setup(nickname: string) {
    const sent: Record<string, unknown>[] = [];
    const { fetchFn } = fakeServer({
      '/functions/v1/leaderboard#start': () => [200, { token: '11111111-2222-3333-4444-555555555555' }],
      '/functions/v1/leaderboard#submit': (body) => {
        sent.push(body ?? {});
        return [200, { all: { rank: 7, score: Number(body?.score) }, week: { rank: 2, score: Number(body?.score) } }];
      },
    });
    const profile = { nickname, rider: 'bobba' as const, playerSecret: () => '0123456789abcdef0123456789abcdef' };
    const ranks = new Ranks(profile, new LeaderboardClient('https://x.supabase.co', 'key', fetchFn));
    return { ranks, sent, profile };
  }

  it('sends a finished run and keeps where it landed', async () => {
    const { ranks, sent } = setup('ALE');
    ranks.runStarted('surf');
    await ranks.runEnded('surf', 1234, 40);
    expect(ranks.status).toBe('sent');
    expect(ranks.all?.rank).toBe(7);
    expect(ranks.week?.rank).toBe(2);
    expect(sent[0]).toMatchObject({ action: 'submit', board: 'surf', score: 1234, seconds: 40, nickname: 'ALE', rider: 'bobba' });
  });

  it('keeps the best run per board until there is a nickname', async () => {
    const { ranks, sent, profile } = setup('');
    for (const score of [300, 900, 500]) {
      ranks.runStarted('kite');
      await ranks.runEnded('kite', score, 30);
      expect(ranks.status).toBe('nickname');
    }
    expect(sent).toHaveLength(0);
    expect(ranks.waiting).toBe(1);
    (profile as { nickname: string }).nickname = 'NEWBIE';
    await ranks.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ score: 900, nickname: 'NEWBIE' });
    expect(ranks.waiting).toBe(0);
  });
});

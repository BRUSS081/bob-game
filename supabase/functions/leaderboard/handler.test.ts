// deno test supabase/functions/leaderboard/handler.test.ts
// The handler against an in-memory database that understands the few
// query shapes it uses, with a clock the test moves by hand.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createHandler, sha256 } from './handler.ts';
import { isoWeek, maxScore } from '../_shared/rules.ts';

type Row = Record<string, unknown>;

function assertEquals(actual: unknown, expected: unknown, msg = ''): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}

class FakeQuery {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private patch: Row = {};
  private filters: ((r: Row) => boolean)[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max = Infinity;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  constructor(private readonly db: FakeDb, private readonly table: string) {}
  select(_cols?: string) {
    return this;
  }
  insert(row: Row) {
    this.op = 'insert';
    this.patch = row;
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  gte(c: string, v: string) {
    this.filters.push((r) => String(r[c]) >= v);
    return this;
  }
  lt(c: string, v: string) {
    this.filters.push((r) => String(r[c]) < v);
    return this;
  }
  is(c: string, v: null) {
    this.filters.push((r) => (r[c] ?? null) === v);
    return this;
  }
  order(col: string, o: { ascending: boolean }) {
    this.orderBy = { col, asc: o.ascending };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }
  then<T>(resolve: (v: { data: unknown; error: null }) => T) {
    return Promise.resolve(this.run()).then(resolve);
  }
  private run(): { data: unknown; error: null } {
    const rows = this.db.tables[this.table];
    let out: Row[];
    if (this.op === 'insert') {
      const row = { id: crypto.randomUUID(), used_at: null, ...this.patch };
      rows.push(row);
      out = [row];
    } else {
      out = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === 'update') for (const r of out) Object.assign(r, this.patch);
      if (this.op === 'delete') this.db.tables[this.table] = rows.filter((r) => !out.includes(r));
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    out = out.slice(0, this.max);
    if (this.mode === 'many') return { data: out, error: null };
    return { data: out[0] ?? null, error: null };
  }
}

class FakeDb {
  tables: Record<string, Row[]> = { sessions: [], scores: [] };
  from(table: string) {
    return new FakeQuery(this, table);
  }
  rpc(name: string, a: Row) {
    const scores = this.tables.scores;
    const same = (r: Row) => r.board === a.p_board && r.period === a.p_period;
    if (name === 'submit_score') {
      const row = scores.find((r) => same(r) && r.player === a.p_player);
      if (!row) scores.push({ board: a.p_board, period: a.p_period, player: a.p_player, nickname: a.p_nickname, rider: a.p_rider, score: a.p_score });
      else Object.assign(row, { nickname: a.p_nickname, rider: a.p_rider, score: Math.max(Number(row.score), Number(a.p_score)) });
      return Promise.resolve({ data: null, error: null });
    }
    if (name === 'rank_of') {
      const me = scores.find((r) => same(r) && r.player === a.p_player);
      if (!me) return Promise.resolve({ data: [], error: null });
      const above = scores.filter((r) => same(r) && Number(r.score) > Number(me.score)).length;
      return Promise.resolve({ data: [{ rank: above + 1, score: me.score }], error: null });
    }
    throw new Error('unknown rpc ' + name);
  }
}

const A = '0123456789abcdef0123456789abcdef';
const B = 'fedcba9876543210fedcba9876543210';

function setup() {
  const db = new FakeDb();
  let clock = Date.UTC(2026, 9, 11, 12);
  const handle = createHandler(db as unknown as SupabaseClient, () => clock);
  const call = async (body: Row) => {
    const res = await handle(new Request('http://x/', { method: 'POST', body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  const tick = (s: number) => (clock += s * 1000);
  return { db, call, tick, week: () => isoWeek(new Date(clock)) };
}

async function startRun(call: (b: Row) => Promise<{ status: number; body: Row }>, secret = A, board = 'surf') {
  const r = await call({ action: 'start', secret, board });
  assertEquals(r.status, 200, 'start');
  return String(r.body.token);
}

const run = (token: string, extra: Row = {}) => ({ action: 'submit', secret: A, token, board: 'surf', nickname: 'ALE', rider: 'bobba', score: 1500, seconds: 30, ...extra });

Deno.test('a run is sent and ranked on both boards', async () => {
  const { db, call, tick, week } = setup();
  const token = await startRun(call);
  tick(31);
  const r = await call(run(token));
  assertEquals(r.status, 200);
  assertEquals(r.body.all, { rank: 1, score: 1500 });
  assertEquals(r.body.week, { rank: 1, score: 1500 });
  assertEquals(db.tables.scores.map((s) => s.period).sort(), ['all', week()].sort());
  assertEquals(db.tables.scores[0].player, await sha256(A), 'only the hash is stored');
});

Deno.test('a token works once, for its player and board only', async () => {
  const { call, tick } = setup();
  const token = await startRun(call);
  tick(31);
  assertEquals((await call({ ...run(token), secret: B })).status, 403, 'other player');
  assertEquals((await call(run(token, { board: 'kite' }))).status, 403, 'other board');
  assertEquals((await call(run(token))).status, 200, 'first use');
  assertEquals((await call(run(token))).body.error, 'token', 'second use');
});

Deno.test('a run cannot last longer than the time that passed', async () => {
  const { call, tick } = setup();
  const token = await startRun(call);
  tick(10);
  assertEquals((await call(run(token, { seconds: 60 }))).body.error, 'time');
});

Deno.test('an impossible score is refused, a great one is not', async () => {
  const { call, tick } = setup();
  let token = await startRun(call);
  tick(61);
  assertEquals((await call(run(token, { seconds: 60, score: maxScore('surf', 60) + 1 }))).body.error, 'score');
  tick(3);
  token = await startRun(call);
  tick(61);
  assertEquals((await call(run(token, { seconds: 60, score: maxScore('surf', 60) }))).status, 200);
});

Deno.test('rude or malformed nicknames are refused', async () => {
  const { call, tick } = setup();
  const token = await startRun(call);
  tick(31);
  assertEquals((await call(run(token, { nickname: 'MERDA' }))).body.error, 'nickname');
  assertEquals((await call(run(token, { nickname: 'ab' }))).body.error, 'nickname');
  assertEquals((await call(run(token, { nickname: 'ALE' }))).status, 200, 'the token was not spent by the refusals');
});

Deno.test('starting runs too fast is rate limited', async () => {
  const { call, tick } = setup();
  await startRun(call);
  assertEquals((await call({ action: 'start', secret: A, board: 'surf' })).status, 429);
  tick(3);
  assertEquals((await call({ action: 'start', secret: A, board: 'surf' })).status, 200);
});

Deno.test('the best score stays, the nickname follows the latest run, ranks count higher scores', async () => {
  const { db, call, tick } = setup();
  let token = await startRun(call);
  tick(31);
  await call(run(token, { score: 2000 }));
  tick(3);
  token = await startRun(call);
  tick(31);
  const r = await call(run(token, { score: 900, nickname: 'ALE_2' }));
  assertEquals(r.body.all, { rank: 1, score: 2000 });
  assertEquals(db.tables.scores.find((s) => s.period === 'all')?.nickname, 'ALE_2');
  const other = await call({ action: 'start', secret: B, board: 'surf' });
  tick(31);
  const r2 = await call({ ...run(String(other.body.token)), secret: B, score: 3000 });
  assertEquals(r2.body.all, { rank: 1, score: 3000 });
});

Deno.test('bad requests get clear errors', async () => {
  const { call } = setup();
  assertEquals((await call({ action: 'start', secret: 'nope', board: 'surf' })).body.error, 'input');
  assertEquals((await call({ action: 'start', secret: A, board: 'snow' })).body.error, 'input');
  assertEquals((await call({ action: 'dance', secret: A, board: 'surf' })).body.error, 'action');
});

-- Global leaderboard: one board per sport of the endless runner, all time
-- and per ISO week. Everyone can read; only the `leaderboard` Edge Function
-- (service role) writes. No personal data: a nickname, BOB or BOBBA, the
-- score, and the SHA-256 of a random secret that only the player's device
-- knows (so it can find its own row).

create table public.scores (
  board text not null check (board in ('surf', 'kite', 'wing')),
  -- 'all', or an ISO week like '2026-W41'
  period text not null check (period = 'all' or period ~ '^[0-9]{4}-W[0-9]{2}$'),
  player text not null check (player ~ '^[0-9a-f]{64}$'),
  nickname text not null check (nickname ~ '^[A-Z0-9_]{3,12}$'),
  rider text not null check (rider in ('bob', 'bobba')),
  score integer not null check (score >= 0),
  updated_at timestamptz not null default now(),
  primary key (board, period, player)
);

create index scores_rank on public.scores (board, period, score desc, updated_at);

alter table public.scores enable row level security;

create policy "Anyone can read the leaderboard"
  on public.scores for select
  to anon, authenticated
  using (true);

-- A run in progress: issued by the Edge Function when a run starts, used
-- once when the score is sent. Nobody but the service role can touch it.
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  player text not null,
  board text not null,
  started_at timestamptz not null default now(),
  used_at timestamptz
);

create index sessions_player on public.sessions (player, started_at desc);
create index sessions_started on public.sessions (started_at);

alter table public.sessions enable row level security;

-- Keeps the best score of a player per board and period; the nickname and
-- BOB / BOBBA always follow the latest run.
create or replace function public.submit_score(
  p_board text, p_period text, p_player text, p_nickname text, p_rider text, p_score integer
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.scores (board, period, player, nickname, rider, score)
  values (p_board, p_period, p_player, p_nickname, p_rider, p_score)
  on conflict (board, period, player) do update set
    nickname = excluded.nickname,
    rider = excluded.rider,
    score = greatest(public.scores.score, excluded.score),
    updated_at = case when excluded.score > public.scores.score then now() else public.scores.updated_at end;
$$;

revoke execute on function public.submit_score(text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.submit_score(text, text, text, text, text, integer) to service_role;

-- A player's place on a board: 1 + the players with a higher score.
create or replace function public.rank_of(p_board text, p_period text, p_player text)
returns table (rank bigint, score integer)
language sql
stable
set search_path = public
as $$
  select
    (select count(*) from public.scores o
      where o.board = s.board and o.period = s.period and o.score > s.score) + 1,
    s.score
  from public.scores s
  where s.board = p_board and s.period = p_period and s.player = p_player;
$$;

grant execute on function public.rank_of(text, text, text) to anon, authenticated;

// Leaderboard Edge Function: the only way to write a score.
//
//   POST { action: 'start',  secret, board }                         -> { token }
//   POST { action: 'submit', secret, token, board, nickname, rider,
//          score, seconds }                                           -> { all, week }
//
// Base anti-cheat (see docs/BRIEF.md): a session token issued when the run
// starts, checked once when it ends against the real time that passed and
// the most points a run that long can score; rate limits per player.
// Deploy with verify_jwt off: the game calls it with no account.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHandler } from './handler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(createHandler(db));

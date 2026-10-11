# Global leaderboard (Supabase)

Phase 6 of the brief. Everything here is ready; it goes live once a
Supabase project exists (free plan) and is wired in.

- `migrations/20261011000000_leaderboard.sql`: table `scores` (public read
  through RLS, no writes), table `sessions` (service role only), functions
  `submit_score` (service role only, keeps the best score) and `rank_of`.
- `functions/leaderboard/`: the Edge Function (`index.ts` wires
  `handler.ts` to `Deno.serve`). Deploy with **verify_jwt off**.
- `functions/_shared/rules.ts`: boards, nickname rules and filter, ISO
  week, plausible score limits. Imported by the game too.

## Go live

1. Create a project on the free plan (organization `BRUSS081's Org`,
   region `eu-central-1`).
2. Apply the migration.
3. Deploy the `leaderboard` function with files `index.ts`, `handler.ts`
   and `../_shared/rules.ts`, verify_jwt off.
4. Put the project URL and the publishable (anon) key in
   `src/net/config.ts`, commit, deploy.

## Tests

- Game side: `npx vitest run tests/ranks.test.ts`.
- Function: `deno test supabase/functions/leaderboard/handler.test.ts`
  (from a folder without `node_modules`, or with `--node-modules-dir=none`).

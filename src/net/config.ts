/**
 * Where the global leaderboard lives: the Supabase project URL and its
 * publishable (anon) key. Both are public by design: the key can only
 * read, and scores are written by the `leaderboard` Edge Function alone.
 * While they are empty the game plays on and the leaderboard shows as
 * not available yet.
 */
export const LEADERBOARD_URL = '';
export const LEADERBOARD_KEY = '';

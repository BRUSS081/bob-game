import type { Board, Rider } from '../../supabase/functions/_shared/rules.ts';
import { LeaderboardClient, playerHash, type Place, type RunToSend } from './leaderboard.ts';

/** What happened to the last finished run, for the game over screen. */
export type SendStatus = 'none' | 'sending' | 'sent' | 'offline' | 'rejected' | 'nickname';

/** The parts of the profile the leaderboard needs. */
export interface RanksProfile {
  readonly nickname: string;
  readonly rider: Rider;
  playerSecret(): string;
}

/**
 * The game's side of the global leaderboard: a session token when an
 * endless run starts, the score sent when it ends, and the runs that ended
 * before the player had a nickname, kept (the best per board) and sent as
 * soon as one is chosen.
 */
export class Ranks {
  readonly client: LeaderboardClient;
  /** SHA-256 of the device's secret, as the boards store it; empty until known. */
  player = '';
  status: SendStatus = 'none';
  /** Places of the last run sent. */
  all: Place | null = null;
  week: Place | null = null;
  private readonly profile: RanksProfile;
  private run = 0;
  private token: Promise<string | null> | null = null;
  private readonly pending = new Map<Board, RunToSend>();

  constructor(profile: RanksProfile, client = new LeaderboardClient()) {
    this.profile = profile;
    this.client = client;
    if (client.configured) {
      playerHash(profile.playerSecret()).then(
        (h) => (this.player = h),
        () => undefined,
      );
    }
  }

  /** A run that counts for the leaderboard has started. */
  runStarted(board: Board): void {
    this.run++;
    this.status = 'none';
    this.all = this.week = null;
    this.token = this.client.reachable ? this.client.start(this.profile.playerSecret(), board) : null;
  }

  /** The run ended: send it, or keep it until there is a nickname. */
  async runEnded(board: Board, score: number, seconds: number): Promise<void> {
    if (!this.client.configured) return;
    const run = this.run;
    this.status = 'sending';
    const token = this.token ? await this.token : null;
    if (run !== this.run) return;
    if (!token) {
      this.status = 'offline';
      return;
    }
    const toSend: RunToSend = { token, board, score, seconds };
    if (!this.profile.nickname) {
      const kept = this.pending.get(board);
      if (!kept || kept.score < score) this.pending.set(board, toSend);
      this.status = 'nickname';
      return;
    }
    await this.send(toSend, run);
  }

  private async send(toSend: RunToSend, run: number): Promise<void> {
    const outcome = await this.client.submit(this.profile.playerSecret(), toSend, this.profile.nickname, this.profile.rider);
    if (run !== this.run) return;
    if (outcome.kind === 'ok') {
      this.status = 'sent';
      this.all = outcome.all;
      this.week = outcome.week;
    } else {
      this.status = outcome.kind;
    }
  }

  /** Runs waiting for a nickname. */
  get waiting(): number {
    return this.pending.size;
  }

  /** A nickname was just chosen: send the runs that were waiting for it. */
  async flush(): Promise<void> {
    if (!this.profile.nickname) return;
    const runs = [...this.pending.values()];
    this.pending.clear();
    for (const r of runs) await this.client.submit(this.profile.playerSecret(), r, this.profile.nickname, this.profile.rider);
  }
}

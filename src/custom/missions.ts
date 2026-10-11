import { load, save } from '../core/storage.ts';
import type { RunStats } from '../game/game.ts';
import type { SportId } from '../game/sport.ts';
import { BASE_GEAR_COUNT } from '../sprites/ramps.ts';

/** What a run achieved, as missions see it. Reused, not reallocated. */
export interface RunResult {
  sport: SportId;
  points: number;
  daily: boolean;
  stats: RunStats;
}

export type MissionId =
  | 'score500'
  | 'close3'
  | 'combo3'
  | 'daily'
  | 'flow'
  | 'spin2'
  | 'over3'
  | 'dolphins'
  | 'power2'
  | 'score3000'
  | 'tricks10'
  | 'close10';

export interface Mission {
  readonly id: MissionId;
  /** Sport it must be done in, or null for any. */
  readonly sport: SportId | null;
  readonly goal: number;
  /** How far a run got toward the goal. */
  readonly measure: (r: RunResult) => number;
  /** Special gear color it unlocks (index into GEAR_COLORS). */
  readonly reward: number;
}

const list: [MissionId, SportId | null, number, (r: RunResult) => number][] = [
  ['score500', null, 500, (r) => r.points],
  ['close3', null, 3, (r) => r.stats.closeCalls],
  ['combo3', null, 3, (r) => r.stats.bestCombo],
  ['daily', null, 1, (r) => (r.daily ? 1 : 0)],
  ['flow', 'wing', 1, (r) => (r.stats.maxFlow >= 1 ? 1 : 0)],
  ['spin2', 'kite', 2, (r) => r.stats.maxSpins],
  ['over3', null, 3, (r) => r.stats.overs],
  ['dolphins', null, 1, (r) => r.stats.dolphins],
  ['power2', null, 2, (r) => r.stats.powerUps],
  ['score3000', null, 3000, (r) => r.points],
  ['tricks10', null, 10, (r) => r.stats.tricks],
  ['close10', null, 10, (r) => r.stats.closeCalls],
];

/** Every mission, in the order they become active. Each one unlocks one special color. */
export const MISSIONS: readonly Mission[] = list.map(([id, sport, goal, measure], i) => ({ id, sport, goal, measure, reward: BASE_GEAR_COUNT + i }));

/** How many missions are open at once. */
export const ACTIVE_MISSIONS = 3;

/**
 * Missions done so far, saved in localStorage. The open ones are the
 * first three not yet done; finishing one opens the next and unlocks its
 * color. Everything in the base catalogue stays unlocked from the start.
 */
export class MissionLog {
  readonly done = new Set<MissionId>();
  readonly unlocked = new Set<number>();
  /** Open missions, refreshed when one is completed. */
  readonly active: Mission[] = [];

  constructor() {
    const saved = load<unknown>('bob.missions', []);
    if (Array.isArray(saved)) {
      for (const id of saved) {
        const m = MISSIONS.find((x) => x.id === id);
        if (m) this.mark(m);
      }
    }
    this.refresh();
  }

  private mark(m: Mission): void {
    this.done.add(m.id);
    this.unlocked.add(m.reward);
  }

  private refresh(): void {
    this.active.length = 0;
    for (let i = 0; i < MISSIONS.length && this.active.length < ACTIVE_MISSIONS; i++) {
      if (!this.done.has(MISSIONS[i].id)) this.active.push(MISSIONS[i]);
    }
  }

  /** Progress of a run toward a mission, 0 when it is for another sport. */
  progress(m: Mission, r: RunResult): number {
    return m.sport && m.sport !== r.sport ? 0 : Math.min(m.goal, m.measure(r));
  }

  /**
   * Completes the open missions this run has reached. Writes the newly
   * completed ones into `out` (cleared first) and returns how many. Cheap
   * enough to call every step: no allocations when nothing is completed.
   */
  check(r: RunResult, out: Mission[]): number {
    out.length = 0;
    for (let i = 0; i < this.active.length; i++) {
      const m = this.active[i];
      if (this.progress(m, r) >= m.goal) out.push(m);
    }
    if (out.length === 0) return 0;
    for (const m of out) this.mark(m);
    this.refresh();
    save('bob.missions', [...this.done]);
    return out.length;
  }
}

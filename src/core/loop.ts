/** Fixed simulation step: 60 Hz. */
export const STEP = 1 / 60;
/** Most time simulated in one frame; longer gaps (tab switch, debugger) are dropped. */
export const MAX_FRAME = 0.25;

export interface Accumulated {
  steps: number;
  rest: number;
}

/**
 * Adds one frame of time to the accumulator and reports how many fixed
 * steps to run and the time left over. Writes into `out` so the frame loop
 * allocates nothing.
 */
export function accumulate(accumulator: number, frameSeconds: number, out: Accumulated): Accumulated {
  let acc = Math.min(accumulator + Math.min(Math.max(frameSeconds, 0), MAX_FRAME), MAX_FRAME);
  let steps = 0;
  while (acc >= STEP) {
    acc -= STEP;
    steps++;
  }
  out.steps = steps;
  out.rest = acc;
  return out;
}

/**
 * requestAnimationFrame loop with a fixed timestep and interpolated
 * rendering: update(STEP) runs 0..n times per frame, then render(alpha)
 * with alpha in [0, 1), the fraction of the next step already elapsed.
 */
export class Loop {
  private last = -1;
  private raf = 0;
  private readonly acc: Accumulated = { steps: 0, rest: 0 };
  private readonly update: (dt: number) => void;
  private readonly render: (alpha: number) => void;

  constructor(update: (dt: number) => void, render: (alpha: number) => void) {
    this.update = update;
    this.render = render;
  }

  start(): void {
    if (this.raf) return;
    this.last = -1;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly frame = (now: number): void => {
    const dt = this.last < 0 ? 0 : (now - this.last) / 1000;
    this.last = now;
    accumulate(this.acc.rest, dt, this.acc);
    for (let i = 0; i < this.acc.steps; i++) this.update(STEP);
    this.render(this.acc.rest / STEP);
    this.raf = requestAnimationFrame(this.frame);
  };
}

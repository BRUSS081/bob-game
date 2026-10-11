import type { Rng } from '../core/rng.ts';

/**
 * A fixed pool of pixel particles for splashes, spray and the wake: no
 * allocation while playing. Positions are screen pixels; when the pool is
 * full the oldest particle is reused.
 */
export class Particles {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Float32Array;
  readonly max: Float32Array;
  readonly color: Uint8Array;
  readonly gravity: Float32Array;
  readonly size: Uint8Array;
  readonly capacity: number;
  private next = 0;

  constructor(capacity = 160) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.color = new Uint8Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.size = new Uint8Array(capacity);
  }

  clear(): void {
    this.life.fill(0);
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, color: number, gravity = 300, size = 1): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.color[i] = color;
    this.gravity[i] = gravity;
    this.size[i] = size;
  }

  /** A splash of `n` drops thrown up from (x, y), wider with `spread`. */
  splash(rng: Rng, x: number, y: number, n: number, spread: number, push: number, colors: readonly number[]): void {
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (rng.next() - 0.5) * spread;
      const v = 40 + rng.next() * 70;
      this.spawn(x + (rng.next() - 0.5) * 10, y, Math.cos(a) * v + push, Math.sin(a) * v, 0.35 + rng.next() * 0.35, colors[k % colors.length], 320, rng.next() < 0.25 ? 2 : 1);
    }
  }

  update(dt: number, floor: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vy[i] += this.gravity[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      // drops that fall back into the sea are gone
      if (this.vy[i] > 0 && this.y[i] > floor && this.gravity[i] > 0) this.life[i] = 0;
    }
  }

  draw(r: { fill(c: number, x: number, y: number, w: number, h: number): void }): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      const s = this.life[i] < this.max[i] * 0.3 ? 1 : this.size[i];
      r.fill(this.color[i], Math.round(this.x[i]), Math.round(this.y[i]), s, s);
    }
  }
}

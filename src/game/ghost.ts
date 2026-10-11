/** Samples per second of a ghost run. */
export const GHOST_RATE = 20;
const MAX_SECONDS = 600;
const CAPACITY = GHOST_RATE * MAX_SECONDS;
const VERSION = 1;
const BYTES_PER_SAMPLE = 9;

export const GHOST_RIDE = 0;
export const GHOST_AIR = 1;
export const GHOST_CRASH = 2;

export interface GhostSample {
  distance: number;
  y: number;
  rotation: number;
  state: number;
}

export function newGhostSample(): GhostSample {
  return { distance: 0, y: 0, rotation: 0, state: GHOST_RIDE };
}

/**
 * A run recorded as a trajectory at GHOST_RATE samples per second:
 * distance, altitude, trick rotation and state. Preallocated, so recording
 * allocates nothing during play; encoded compactly (about 9 bytes per
 * sample) for localStorage.
 */
export class GhostTrack {
  count = 0;
  readonly distance = new Float32Array(CAPACITY);
  readonly y = new Float32Array(CAPACITY);
  readonly rotation = new Float32Array(CAPACITY);
  readonly state = new Uint8Array(CAPACITY);

  clear(): void {
    this.count = 0;
  }

  /** Seconds covered by the recording. */
  get duration(): number {
    return this.count / GHOST_RATE;
  }

  /** Fills every sample up to `time` (seconds since the start) with this pose. */
  record(time: number, distance: number, y: number, rotation: number, state: number): void {
    const target = Math.min(CAPACITY - 1, Math.floor(time * GHOST_RATE));
    while (this.count <= target) {
      const i = this.count++;
      this.distance[i] = distance;
      this.y[i] = y;
      this.rotation[i] = rotation;
      this.state[i] = state;
    }
  }

  /** Interpolated pose at `time`; false when there is nothing recorded. */
  sample(time: number, out: GhostSample): boolean {
    if (this.count === 0) return false;
    const f = Math.max(0, time * GHOST_RATE);
    const i = Math.floor(f);
    if (i >= this.count - 1) {
      const last = this.count - 1;
      out.distance = this.distance[last];
      out.y = this.y[last];
      out.rotation = this.rotation[last];
      out.state = this.state[last];
      return true;
    }
    const k = f - i;
    out.distance = this.distance[i] + (this.distance[i + 1] - this.distance[i]) * k;
    out.y = this.y[i] + (this.y[i + 1] - this.y[i]) * k;
    // a trick rotation wraps at whole turns: never interpolate across a landing
    const r0 = this.rotation[i];
    const r1 = this.rotation[i + 1];
    out.rotation = r1 >= r0 ? r0 + (r1 - r0) * k : r0;
    out.state = this.state[i];
    return true;
  }

  copyFrom(other: GhostTrack): void {
    this.count = other.count;
    this.distance.set(other.distance.subarray(0, other.count));
    this.y.set(other.y.subarray(0, other.count));
    this.rotation.set(other.rotation.subarray(0, other.count));
    this.state.set(other.state.subarray(0, other.count));
  }

  encode(): string {
    const bytes = new Uint8Array(3 + this.count * BYTES_PER_SAMPLE);
    const view = new DataView(bytes.buffer);
    view.setUint8(0, VERSION);
    view.setUint16(1, this.count, true);
    for (let i = 0, o = 3; i < this.count; i++, o += BYTES_PER_SAMPLE) {
      view.setUint32(o, Math.max(0, Math.round(this.distance[i] * 4)), true);
      view.setInt16(o + 4, Math.max(-32768, Math.min(32767, Math.round(this.y[i] * 4))), true);
      view.setUint16(o + 6, Math.max(0, Math.min(65535, Math.round(this.rotation[i] * 64))), true);
      view.setUint8(o + 8, this.state[i]);
    }
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
  }

  /** Reads an encoded track; false (and empty) when the data is not valid. */
  decode(data: unknown): boolean {
    this.count = 0;
    if (typeof data !== 'string' || data.length === 0) return false;
    let bytes: Uint8Array;
    try {
      const text = atob(data);
      bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    } catch {
      return false;
    }
    if (bytes.length < 3) return false;
    const view = new DataView(bytes.buffer);
    const count = view.getUint16(1, true);
    if (view.getUint8(0) !== VERSION || count > CAPACITY || bytes.length !== 3 + count * BYTES_PER_SAMPLE) return false;
    for (let i = 0, o = 3; i < count; i++, o += BYTES_PER_SAMPLE) {
      this.distance[i] = view.getUint32(o, true) / 4;
      this.y[i] = view.getInt16(o + 4, true) / 4;
      this.rotation[i] = view.getUint16(o + 6, true) / 64;
      this.state[i] = Math.min(GHOST_CRASH, view.getUint8(o + 8));
    }
    this.count = count;
    return true;
  }
}

/** Fixed-capacity float32 ring buffer for continuous mic pre-roll. */

export class RingBuffer {
  private buf: Float32Array;
  private writePos = 0;
  private filled = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buf = new Float32Array(capacity);
  }

  get length(): number {
    return this.filled;
  }

  push(samples: Float32Array | number[]): void {
    for (let i = 0; i < samples.length; i++) {
      this.buf[this.writePos] = samples[i]!;
      this.writePos = (this.writePos + 1) % this.capacity;
      if (this.filled < this.capacity) this.filled++;
    }
  }

  /** Snapshot the last `n` samples (or all if shorter). */
  snapshot(n?: number): Float32Array {
    const count = Math.min(n ?? this.filled, this.filled);
    const out = new Float32Array(count);
    const start = (this.writePos - count + this.capacity) % this.capacity;
    for (let i = 0; i < count; i++) {
      out[i] = this.buf[(start + i) % this.capacity]!;
    }
    return out;
  }

  clear(): void {
    this.writePos = 0;
    this.filled = 0;
    this.buf.fill(0);
  }
}

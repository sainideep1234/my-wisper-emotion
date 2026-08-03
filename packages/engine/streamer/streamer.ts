import EventEmitter from 'events';
import { LocalAgreement } from './local-agreement.ts';

export type TranscribeFn = (pcm: Float32Array) => Promise<string>;

export interface StreamerConfig {
  intervalMs?: number;
  minAudioS?: number;
  sampleRate?: number;
  agreementN?: number;
  transcribe: TranscribeFn;
  getPcm: () => Float32Array;
}

/**
 * Rolling re-transcription + LocalAgreement-2 word commit.
 * Emits `partial` with { committed, pending, delta }.
 */
export class Streamer extends EventEmitter {
  private readonly intervalMs: number;
  private readonly minSamples: number;
  private readonly transcribe: TranscribeFn;
  private readonly getPcm: () => Float32Array;
  private readonly agreement: LocalAgreement;

  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private active = false;

  constructor(config: StreamerConfig) {
    super();
    const sampleRate = config.sampleRate ?? 16_000;
    this.intervalMs = config.intervalMs ?? 180;
    this.minSamples = Math.round((config.minAudioS ?? 0.35) * sampleRate);
    this.transcribe = config.transcribe;
    this.getPcm = config.getPcm;
    this.agreement = new LocalAgreement(config.agreementN ?? 2);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.busy = false;
    this.agreement.reset();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getCommitted(): string {
    return this.agreement.getCommitted();
  }

  reset(): void {
    this.agreement.reset();
  }

  private async tick(): Promise<void> {
    if (!this.active || this.busy) return;
    const pcm = this.getPcm();
    if (pcm.length < this.minSamples) return;

    this.busy = true;
    try {
      const hyp = await this.transcribe(pcm);
      if (!this.active) return;
      if (!hyp) return;
      const result = this.agreement.push(hyp);
      this.emit('partial', result);
    } catch (e) {
      console.error('streamer tick', e);
    } finally {
      this.busy = false;
    }
  }
}

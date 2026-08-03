import { EventEmitter } from 'events';
import { bufferToFloat32, pcmRms } from '../audio-utils.ts';
import { RingBuffer } from './ring-buffer.ts';

export interface RecorderConfig {
  sampleRate?: number;
  prerollMs?: number;
  maxSeconds?: number;
  framesPerBuffer?: number;
  getAudio: () => any;
}

/**
 * Always-on mic capture into a pre-roll ring buffer.
 * On utterance start, copies pre-roll then accumulates until stop.
 */
export class Recorder extends EventEmitter {
  private readonly sampleRate: number;
  private readonly prerollSamples: number;
  private readonly maxSamples: number;
  private readonly framesPerBuffer: number;
  private readonly getAudio: () => any;

  private ring: RingBuffer;
  private stream: any = null;
  private running = false;
  private capturing = false;
  private utteranceBuffer: Float32Array;
  private utteranceLength = 0;
  private peakRms = 0;
  private pending: number[] = [];

  constructor(config: RecorderConfig) {
    super();
    this.sampleRate = config.sampleRate ?? 16_000;
    this.prerollSamples = Math.round(((config.prerollMs ?? 1000) / 1000) * this.sampleRate);
    this.maxSamples = (config.maxSeconds ?? 600) * this.sampleRate;
    this.framesPerBuffer = config.framesPerBuffer ?? 320;
    this.getAudio = config.getAudio;
    this.utteranceBuffer = new Float32Array(this.maxSamples);
    // Keep ~ preroll + a little headroom in the always-on ring
    this.ring = new RingBuffer(Math.max(this.prerollSamples * 2, this.sampleRate * 2));
  }

  get isCapturing(): boolean {
    return this.capturing;
  }

  get isRunning(): boolean {
    return this.running;
  }

  startMic(): void {
    if (this.running) return;

    const audio = this.getAudio();
    const inputs = audio.getDevices().filter((d: { maxInputChannels: number }) => d.maxInputChannels > 0);
    const deviceId = -1; // Always use default device (-1) for better reliability on macOS
    if (inputs.length > 0) {
      console.log(`mic [default] using default device (found ${inputs.length} inputs)`);
    } else {
      console.warn('no microphone input devices found');
    }

    this.stream = audio.AudioIO({
      inOptions: {
        channelCount: 1,
        sampleFormat: audio.SampleFormat16Bit as number,
        sampleRate: this.sampleRate,
        deviceId,
        framesPerBuffer: this.framesPerBuffer,
        closeOnError: false,
      },
    });

    this.stream.on('data', (chunk: Buffer) => this.onChunk(chunk));
    this.stream.on('error', (err: Error) => {
      console.error('Microphone error:', err.message);
      this.emit('error', `Microphone error: ${err.message}`);
    });

    this.stream.start();
    this.running = true;
    this.emit('mic_started');
  }

  stopMic(): void {
    this.capturing = false;
    this.running = false;
    if (this.stream) {
      try {
        this.stream.quit();
      } catch {
        // ignore
      }
      this.stream = null;
    }
  }

  /** Begin an utterance — includes ~prerollMs of audio from before the hotkey. */
  beginUtterance(): void {
    const preroll = this.ring.snapshot(this.prerollSamples);
    this.utteranceLength = preroll.length;
    this.utteranceBuffer.set(preroll, 0);
    this.peakRms = pcmRms(preroll);
    this.capturing = true;
    this.emit('utterance_started', { prerollSamples: preroll.length });
  }

  /** End utterance and return the full PCM (pre-roll + spoken). Wait for a short flush to capture trailing OS audio buffers. */
  async endUtterance(flushMs: number = 300): Promise<{ pcm: Float32Array; peakRms: number }> {
    // Wait briefly to allow in-transit OS audio chunks to arrive
    await new Promise((resolve) => setTimeout(resolve, flushMs));
    this.capturing = false;
    const pcm = this.utteranceBuffer.slice(0, this.utteranceLength);
    const peakRms = this.peakRms;
    this.utteranceLength = 0;
    this.emit('utterance_ended', { samples: pcm.length, peakRms });
    return { pcm, peakRms };
  }

  /** Live snapshot of the current utterance buffer (for streaming passes). */
  snapshotUtterance(): Float32Array {
    return this.utteranceBuffer.slice(0, this.utteranceLength);
  }

  private onChunk(chunk: Buffer): void {
    if (!this.running) return;

    for (let i = 0; i < chunk.length; i++) this.pending.push(chunk[i]!);
    const frameBytes = this.framesPerBuffer * 2;

    while (this.pending.length >= frameBytes) {
      const frame = bufferToFloat32(Buffer.from(this.pending.splice(0, frameBytes)));
      const rms = pcmRms(frame);
      this.ring.push(frame);

      if (this.capturing) {
        if (rms > this.peakRms) this.peakRms = rms;
        if (this.utteranceLength + frame.length <= this.maxSamples) {
          this.utteranceBuffer.set(frame, this.utteranceLength);
          this.utteranceLength += frame.length;
        } else {
          // Overflow shift
          const space = this.maxSamples - frame.length;
          this.utteranceBuffer.copyWithin(0, frame.length, this.utteranceLength);
          this.utteranceBuffer.set(frame, space);
          this.utteranceLength = this.maxSamples;
        }
        this.emit('audio_level', Math.min(1.0, rms * 5.0));
        this.emit('samples', frame);
      } else {
        // Idle levels for overlay idle animation (quieter)
        this.emit('idle_level', Math.min(1.0, rms * 5.0));
      }
    }
  }

}

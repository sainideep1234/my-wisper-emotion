/** Convert raw int16 LE bytes to float32 PCM (same as working index.ts). */
export function int16BytesToFloat32(bytes: ArrayLike<number>, sampleCount: number): Float32Array {
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const lo = bytes[i * 2]!;
    const hi = bytes[i * 2 + 1]!;
    let sample = (hi << 8) | lo;
    if (sample >= 0x8000) sample -= 0x10000;
    out[i] = sample / 32768;
  }
  return out;
}

export function bufferToFloat32(chunk: Buffer): Float32Array {
  const sampleCount = chunk.length / 2;
  const bytes: number[] = new Array(chunk.length);
  for (let i = 0; i < chunk.length; i++) bytes[i] = chunk[i]!;
  return int16BytesToFloat32(bytes, sampleCount);
}

export function pcmRms(pcm: Float32Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!;
  return Math.sqrt(sum / pcm.length);
}

/** macOS blocks mic without permission — PortAudio still runs but returns silence. */
export const SILENCE_RMS_THRESHOLD = 0.001;

export function isSilentPcm(pcm: Float32Array): boolean {
  return pcmRms(pcm) < SILENCE_RMS_THRESHOLD;
}

/**
 * Trims leading and trailing silence from Float32Array PCM data with a protective safety margin.
 * Keeps marginMs of audio before first active speech frame and after last active speech frame.
 */
export function trimSilencePcm(
  pcm: Float32Array,
  sampleRate: number = 16_000,
  marginMs: number = 150,
  rmsThreshold: number = 0.003,
): Float32Array {
  if (pcm.length < sampleRate * 0.2) return pcm;

  const frameSize = Math.round(sampleRate * 0.02); // 20ms frame (320 samples @ 16kHz)
  const marginSamples = Math.round((marginMs / 1000) * sampleRate);

  let startSample = 0;
  let endSample = pcm.length;

  // Find start of speech
  for (let i = 0; i <= pcm.length - frameSize; i += frameSize) {
    let sum = 0;
    for (let j = 0; j < frameSize; j++) {
      const val = pcm[i + j]!;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / frameSize);
    if (rms >= rmsThreshold) {
      startSample = Math.max(0, i - marginSamples);
      break;
    }
  }

  // Find end of speech
  for (let i = pcm.length - frameSize; i >= 0; i -= frameSize) {
    let sum = 0;
    for (let j = 0; j < frameSize; j++) {
      const val = pcm[i + j]!;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / frameSize);
    if (rms >= rmsThreshold) {
      endSample = Math.min(pcm.length, i + frameSize + marginSamples);
      break;
    }
  }

  if (startSample >= endSample || endSample - startSample < sampleRate * 0.2) {
    return pcm;
  }

  return pcm.subarray(startSample, endSample);
}


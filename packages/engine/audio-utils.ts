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

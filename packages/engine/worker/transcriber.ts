import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { trimSilencePcm } from '../audio-utils.ts';


const require =
  typeof (globalThis as any).require === 'function'
    ? (globalThis as any).require
    : createRequire(typeof __filename !== 'undefined' ? __filename : path.join(process.cwd(), 'index.js'));

export interface TranscriberConfig {
  modelPath: string;
  language?: string;
  useGpu?: boolean;
}

type WhisperResult = { transcription?: [string, string, string][]; language?: string };
type WhisperFn = (
  params: Record<string, unknown>,
  cb: (err: Error | null, result: WhisperResult) => void,
) => void;

/**
 * Whisper.cpp native addon wrapper (in-memory pcmf32 — never writes audio to disk).
 */
export class Transcriber {
  private whisper: WhisperFn | null = null;
  private modelPath: string;
  private language: string;
  private useGpu: boolean;
  private warmed = false;
  private prompt = '';
  /** Raw vocabulary string, so setPrompt can skip work when nothing changed. */
  private promptSource = '';
  /**
   * Cached BPE token ids for `prompt`, tied to the currently loaded model's
   * vocabulary. Null means "not derived yet". Invalidated whenever the
   * vocabulary or the model changes.
   */
  private promptTokens: Int32Array | null = null;

  constructor(config: TranscriberConfig) {
    this.modelPath = config.modelPath;
    this.language = config.language ?? 'en';
    this.useGpu = config.useGpu ?? true;
  }

  static tryLoadAddon(candidates: string[]): WhisperFn | null {
    for (const addonPath of candidates) {
      if (!fs.existsSync(addonPath)) continue;
      try {
        const mod = require(addonPath) as { whisper: WhisperFn };
        if (typeof mod.whisper === 'function') {
          console.log('✓ whisper.cpp addon loaded from', addonPath);
          return mod.whisper;
        }
      } catch (e: any) {
        console.warn('whisper.cpp addon failed:', e?.message || e);
      }
    }
    return null;
  }

  setAddon(fn: WhisperFn | null) {
    this.whisper = fn;
  }

  setModelPath(modelPath: string) {
    if (modelPath === this.modelPath) return;
    this.modelPath = modelPath;
    this.warmed = false;
    // A different model file means a different vocabulary; token ids derived
    // from the previous one would decode to the wrong words.
    this.invalidatePromptCache();
  }

  /**
   * Vocabulary fed to whisper as initial_prompt. whisper.cpp caps the prompt at
   * n_text_ctx/2 (224 tokens for these models) and silently drops the overflow,
   * so keep it short — an over-stuffed prompt also makes the model hallucinate
   * these words into unrelated speech.
   *
   * The normalised prompt is memoised: the dictionary rarely changes but
   * transcribe() runs on every utterance, so this is recomputed only when the
   * vocabulary actually differs. setModelPath() also clears it, since a
   * different model can carry a different vocabulary and any derived token IDs
   * would no longer be valid for it.
   */
  setPrompt(prompt: string) {
    const raw = prompt || '';
    if (raw === this.promptSource) return; // unchanged — keep the cached form
    this.promptSource = raw;
    this.prompt = raw.trim().slice(0, 800);
    this.promptTokens = null;
  }

  /** Drop anything derived from the current vocabulary/model pairing. */
  private invalidatePromptCache() {
    this.promptTokens = null;
  }

  getModelPath(): string {
    return this.modelPath;
  }

  isReady(): boolean {
    return !!this.whisper && !!this.modelPath && fs.existsSync(this.modelPath);
  }

  async warmup(): Promise<void> {
    if (this.warmed || !this.isReady()) return;
    const silence = new Float32Array(16_000); // 1s silence
    await this.transcribe(silence);
    this.warmed = true;
  }

  async transcribe(pcm: Float32Array): Promise<string> {
    if (!this.whisper) {
      return '';
    }
    if (!this.modelPath || !fs.existsSync(this.modelPath)) {
      return '';
    }
    const trimmedPcm = trimSilencePcm(pcm);
    if (trimmedPcm.length < 16_000 * 0.2) return '';

    return new Promise((resolve) => {
      try {
        this.whisper!(
          {
            language: this.language,
            model: this.modelPath,
            fname_inp: 'buffer',
            pcmf32: trimmedPcm,
            ...(this.prompt ? { prompt: this.prompt } : {}),
            use_gpu: this.useGpu,
            flash_attn: false,
            no_prints: true,
            no_timestamps: true,
            detect_language: false,
          },

          (err, result) => {
            if (err || !result) {
              if (err) console.error('Whisper error:', err);
              resolve('');
              return;
            }
            const text = (result.transcription ?? [])
              .map((seg) => seg[2] ?? '')
              .join(' ')
              .replace(/\[[^\]]*\]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            resolve(text);
          },
        );
      } catch (e: any) {
        console.error('Whisper exception:', e?.message || e);
        resolve('');
      }
    });
  }
}

export function resolveModelPath(filename: string, searchRoots: string[]): string | null {
  const candidates = searchRoots.flatMap((root) => [
    path.join(root, 'models', filename),
    path.join(root, 'models', 'whisper', filename),
    path.join(root, filename),
  ]);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        if (fs.statSync(p).size > 10 * 1024 * 1024) return p;
      } catch {
        // skip
      }
    }
  }
  return null;
}

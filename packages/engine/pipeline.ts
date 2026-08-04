import path from 'path';
import fs from 'fs';
import EventEmitter from 'events';
import { createRequire } from 'module';
import { isSilentPcm, SILENCE_RMS_THRESHOLD } from './audio-utils.ts';
import { ContextProvider } from './context/provider.ts';
import { emptyContext, type UtteranceContext } from './context/utterance.ts';
import { Recorder } from './recorder/recorder.ts';
import { Streamer } from './streamer/streamer.ts';
import { Chain } from './stages/base.ts';
import { stripFillers } from './stages/fillers.ts';
import { retractions } from './stages/retract.ts';
import { numberedLists } from './stages/lists.ts';
import { lightPunctuation } from './stages/punctuation.ts';
import { perAppRules } from './stages/per-app.ts';
import { createDictionaryStage } from './stages/dictionary.ts';
import { Transcriber, resolveModelPath } from './worker/transcriber.ts';
import { UtteranceQueue, injectDeltaAfterLive, type WorkerResult } from './worker/queue.ts';
import { detectEmotion, type EmotionResult } from './emotion.ts';
import { HistoryStore } from './history.ts';

// esbuild CJS bundle empties import.meta — fall back to Node's require when present
const require =
  typeof (globalThis as any).require === 'function'
    ? (globalThis as any).require
    : createRequire(typeof __filename !== 'undefined' ? __filename : path.join(process.cwd(), 'index.js'));

export type { EmotionResult, EmotionLabel } from './emotion.ts';
export type { UtteranceContext } from './context/utterance.ts';

export interface ModelInfo {
  id: string;
  name: string;
  weightSize: string;
  ramRequired: string;
  filename: string;
  downloadUrl: string;
  downloaded: boolean;
  description: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'tiny.en',
    name: 'Whisper Tiny (English)',
    weightSize: '75 MB',
    ramRequired: '~300 MB',
    filename: 'ggml-tiny.en.bin',
    downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    downloaded: false,
    description: 'Ultra lightweight, fastest transcription for simple commands',
  },
  {
    id: 'base.en',
    name: 'Whisper Base (English)',
    weightSize: '142 MB',
    ramRequired: '~500 MB',
    filename: 'ggml-base.en.bin',
    downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    downloaded: false,
    description: 'Recommended default: high speed and reliable everyday accuracy',
  },
  {
    id: 'small.en',
    name: 'Whisper Small (English)',
    weightSize: '466 MB',
    ramRequired: '~1.2 GB',
    filename: 'ggml-small.en.bin',
    downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    downloaded: false,
    description: 'High accuracy for technical terminology and fast speech',
  },
  {
    id: 'medium.en',
    name: 'Whisper Medium (English)',
    weightSize: '1.5 GB',
    ramRequired: '~2.6 GB',
    filename: 'ggml-medium.en.bin',
    downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
    downloaded: false,
    description: 'Superior precision for accents and noisy backgrounds',
  },
  {
    id: 'large-v3',
    name: 'Whisper Large v3 (Multilingual)',
    weightSize: '3.1 GB',
    ramRequired: '~4.5 GB',
    filename: 'ggml-large-v3.bin',
    downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
    downloaded: false,
    description: 'Benchmark maximum precision across 99+ languages',
  },
];

export interface AudioPipelineConfig {
  modelId?: string;
  sampleRate?: number;
  prerollMs?: number;
  streamIntervalMs?: number;
  streamMinAudioS?: number;
  dictionary?: { replacements?: Record<string, string>; snippets?: Record<string, string> };
}

function loadNativeModule(name: string, roots: string[]): any {
  for (const base of roots) {
    try {
      const modPath = require.resolve(name, { paths: [base] });
      return require(modPath);
    } catch {
      // try next
    }
  }
  return require(name);
}

/**
 * Composition root for the Svara-style architecture:
 *
 *   hotkey → Recorder (pre-roll) → streamer (LocalAgreement-2) → injector
 *              ↓                         ↓
 *        ContextProvider            queue → worker
 *              ↓                         ├─ Transcriber
 *        UtteranceContext ───────────────┼─ Chain (cleanup)
 *                                        └─ History
 */
export class AudioPipeline extends EventEmitter {
  private rootDir: string;
  private repoRoot: string;
  private activeModelId: string;
  private isRecording = false;
  private ctx: UtteranceContext = emptyContext();
  private liveCommitted = '';

  private audioModule: any = null;
  private contextProvider = new ContextProvider();
  private recorder: Recorder;
  private streamer: Streamer | null = null;
  private transcriber: Transcriber;
  private chain: Chain;
  private queue = new UtteranceQueue();
  private history = new HistoryStore();
  private liveEmotionInterval: any = null;

  constructor(rootDir: string = process.cwd(), config?: AudioPipelineConfig) {
    super();
    this.rootDir = rootDir;
    let current = rootDir;
    while (current !== '/' && !fs.existsSync(path.join(current, 'whisper.cpp'))) {
      current = path.dirname(current);
    }
    this.repoRoot = fs.existsSync(path.join(current, 'whisper.cpp')) ? current : path.resolve(rootDir, '..');
    this.activeModelId = config?.modelId || 'base.en';

    this.transcriber = new Transcriber({ modelPath: '' });

    this.chain = new Chain([
      stripFillers,
      retractions,
      numberedLists,
      lightPunctuation,
      perAppRules,
      createDictionaryStage(config?.dictionary ?? {
        replacements: { swara: 'Svara', 'get hub': 'GitHub', wispr: 'Wispr' },
        snippets: {},
      }),
    ]);

    this.recorder = new Recorder({
      sampleRate: config?.sampleRate ?? 16_000,
      prerollMs: config?.prerollMs ?? 1000,
      getAudio: () => this.getAudio(),
    });

    this.recorder.on('audio_level', (level: number) => this.emit('audio_level', level));
    this.recorder.on('error', (msg: string) => this.emit('error', msg));

    this.queue.setHandler(async (job) => this.processJob(job));
  }

  private searchRoots(): string[] {
    return [
      this.rootDir,
      this.repoRoot,
      process.cwd(),
      path.resolve(process.cwd(), '..'),
      path.resolve(process.cwd(), '../../packages/engine'),
    ];
  }

  private getAudio(): any {
    if (!this.audioModule) {
      this.audioModule = loadNativeModule('naudiodon', this.searchRoots());
    }
    return this.audioModule;
  }

  public async initialize(): Promise<void> {
    try {
      this.refreshModelStatuses();

      const addon = Transcriber.tryLoadAddon([
        path.join(this.repoRoot, 'whisper.cpp', 'build', 'Release', 'addon.node'),
        path.join(this.rootDir, 'whisper.cpp', 'build', 'Release', 'addon.node'),
        path.join(this.repoRoot, 'whisper.cpp', 'build', 'addon.node'),
      ]);
      this.transcriber.setAddon(addon);

      const modelObj = AVAILABLE_MODELS.find((m) => m.id === this.activeModelId) || AVAILABLE_MODELS[1]!;
      const modelPath = resolveModelPath(modelObj.filename, this.searchRoots());
      if (modelPath) {
        this.transcriber.setModelPath(modelPath);
      }

      if (!addon) {
        console.warn('whisper.cpp addon not found — run: bun run build:whisper-addon');
      }

      // Always-on mic → pre-roll ring buffer
      try {
        this.recorder.startMic();
      } catch (e: any) {
        console.warn('Mic start failed (will retry on record):', e?.message || e);
      }

      if (this.transcriber.isReady()) {
        void this.transcriber.warmup().catch(() => {});
      }

      this.emit('ready', { activeModel: this.activeModelId });
    } catch (err: any) {
      console.error('AudioPipeline initialize error:', err.message || err);
      this.emit('ready', { activeModel: this.activeModelId });
    }
  }

  public refreshModelStatuses(): ModelInfo[] {
    return AVAILABLE_MODELS.map((m) => {
      m.downloaded = resolveModelPath(m.filename, this.searchRoots()) !== null;
      return m;
    });
  }

  public setModel(modelId: string): boolean {
    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) return false;
    const modelPath = resolveModelPath(model.filename, this.searchRoots());
    if (!modelPath) return false;
    this.activeModelId = modelId;
    this.transcriber.setModelPath(modelPath);
    void this.transcriber.warmup().catch(() => {});
    this.emit('model_changed', this.activeModelId);
    return true;
  }

  public getActiveModelId(): string {
    return this.activeModelId;
  }

  public getHistory(): HistoryStore {
    return this.history;
  }

  public getContext(): UtteranceContext {
    return this.ctx;
  }

  /** hotkey → ContextProvider + Recorder.begin (with pre-roll) + optional Streamer */
  public async startRecording(): Promise<void> {
    if (this.isRecording) return;
    this.isRecording = true;
    this.liveCommitted = '';

    try {
      if (!this.recorder.isRunning) {
        this.recorder.startMic();
      }
    } catch (err: any) {
      this.isRecording = false;
      this.emit('error', `Microphone capture failed: ${err.message}`);
      return;
    }

    this.ctx = await this.contextProvider.capture();
    this.emit('context', this.ctx);

    this.recorder.beginUtterance();
    this.emit('recording_started', { context: this.ctx });

    this.liveEmotionInterval = setInterval(() => {
      if (this.isRecording) {
        const pcm = this.recorder.snapshotUtterance();
        if (pcm.length > 16000 * 0.5) {
          const emo = detectEmotion(pcm);
          this.emit('live_emotion', emo);
        }
      }
    }, 1000);

    // Batch mode: final Whisper pass on stop only (paste once into focused app).
    // Live streaming stays available later via config; UI must not show a transcript modal.
  }

  /**
   * Stop → queue → worker (Transcriber → Chain) → History.
   * Returns cleaned text + inject delta (after any live-committed words).
   */
  public async stopRecording(): Promise<{
    text: string;
    emotion: EmotionResult;
    injectText: string;
    context: UtteranceContext;
    rawText: string;
  }> {
    if (this.liveEmotionInterval) {
      clearInterval(this.liveEmotionInterval);
      this.liveEmotionInterval = null;
    }

    if (!this.isRecording) {
      return {
        text: '',
        emotion: detectEmotion(new Float32Array(0)),
        injectText: '',
        context: this.ctx,
        rawText: '',
      };
    }

    this.isRecording = false;
    if (this.streamer) {
      this.streamer.stop();
      this.streamer = null;
    }

    const committedLive = this.liveCommitted;
    const { pcm, peakRms } = await this.recorder.endUtterance();
    this.emit('recording_stopped');

    if (isSilentPcm(pcm)) {
      const msg =
        `No microphone signal detected (peak RMS ${peakRms.toFixed(6)}, need > ${SILENCE_RMS_THRESHOLD}). ` +
        'On macOS: System Settings → Privacy & Security → Microphone → enable Electron.';
      console.error(msg);
      this.emit('error', msg);
      return {
        text: '',
        emotion: detectEmotion(pcm),
        injectText: '',
        context: this.ctx,
        rawText: '',
      };
    }

    const result = await this.queue.enqueue({
      id: String(Date.now()),
      pcm,
      ctx: this.ctx,
      committedLive,
      peakRms,
    });

    this.emit('final_result', result);
    return {
      text: result.text,
      emotion: result.emotion,
      injectText: result.injectText,
      context: result.ctx,
      rawText: result.rawText,
    };
  }

  private async processJob(job: {
    id: string;
    pcm: Float32Array;
    ctx: UtteranceContext;
    committedLive: string;
    peakRms: number;
  }): Promise<WorkerResult> {
    const rawText = await this.transcriber.transcribe(job.pcm);
    const text = rawText ? await this.chain.run(rawText, job.ctx) : '';
    const emotion = detectEmotion(job.pcm);

    let injectText = '';
    if (text) {
      if (job.ctx.allowLiveStream && job.committedLive) {
        injectText = injectDeltaAfterLive(text, job.committedLive);
      } else {
        injectText = text;
      }
    }

    if (text) {
      if (process.env.VITE_DEV_SERVER_URL !== undefined) {
        console.log('');
        console.log(text);
        if (job.ctx.exe) console.log(`  → ${job.ctx.exe}${job.ctx.isTerminal ? ' (terminal)' : ''}`);
      }
      this.history.add({
        text,
        rawText,
        exe: job.ctx.exe,
        title: job.ctx.title,
        kind: job.ctx.kind,
        emotionLabel: emotion.label,
      });
    }

    return {
      id: job.id,
      rawText,
      text,
      injectText,
      emotion,
      ctx: job.ctx,
    };
  }

  public shutdown(): void {
    if (this.liveEmotionInterval) {
      clearInterval(this.liveEmotionInterval);
      this.liveEmotionInterval = null;
    }
    this.streamer?.stop();
    this.recorder.stopMic();
  }
}

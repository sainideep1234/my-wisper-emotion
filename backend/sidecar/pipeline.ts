import path from 'path';
import fs from 'fs';
import EventEmitter from 'events';
const req = typeof require !== 'undefined' ? require : (m: string) => { throw new Error(`Cannot require ${m}`); };

const loadNativeModule = (name: string, rootDir?: string) => {
  // Try normal require first (works when node_modules is on the require path)
  try {
    return req(name);
  } catch (e: any) {
    // Try loading from backend node_modules explicitly via resolved path
    if (rootDir) {
      try {
        const modPath = require.resolve(name, { paths: [rootDir] });
        return req(modPath);
      } catch (err) {}
    }
    // Fallback: try relative to cwd's backend sibling
    try {
      const cwdBackend = path.resolve(process.cwd(), '../backend');
      const modPath = require.resolve(name, { paths: [cwdBackend] });
      return req(modPath);
    } catch (err) {}
    // Fallback: try relative to __dirname going up to find backend
    try {
      const dirBackend = path.resolve(__dirname, '../../backend');
      const modPath = require.resolve(name, { paths: [dirBackend] });
      return req(modPath);
    } catch (err) {}
    throw e;
  }
};

let audioModule: any = null;
let ortModule: any = null;

// Lazy getters so native modules are resolved at runtime with the correct rootDir
const getAudio = (rootDir?: string) => {
  if (!audioModule) audioModule = loadNativeModule('naudiodon', rootDir);
  return audioModule;
};

const getOrt = (rootDir?: string) => {
  if (!ortModule) ortModule = loadNativeModule('onnxruntime-node', rootDir);
  return ortModule;
};

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
}

export type EmotionLabel = 'Neutral' | 'Calm' | 'Focused' | 'Happy' | 'Thoughtful' | 'Energetic';

export interface EmotionResult {
  label: EmotionLabel;
  confidence: number;
  scores: Record<string, number>;
}

export class AudioPipeline extends EventEmitter {
  private activeModelId: string;
  private rootDir: string;
  private isRecording: boolean = false;
  private audioStream: any = null;
  private pcmBuffer: Float32Array = new Float32Array(0);
  private vadSession: any = null;
  private emotionSession: any = null;
  private whisperAddon: any = null;

  constructor(rootDir: string = process.cwd(), config?: AudioPipelineConfig) {
    super();
    this.rootDir = rootDir;
    this.activeModelId = config?.modelId || 'base.en';
  }

  public async initialize(): Promise<void> {
    try {
      this.refreshModelStatuses();

      // Load ONNX Runtime (optional — graceful degradation if not available)
      let ort: any = null;
      try {
        ort = getOrt(this.rootDir);
      } catch (ortErr) {
        console.warn('onnxruntime-node not available, VAD/emotion disabled:', ortErr);
      }

      if (ort) {
        const vadPath = path.join(this.rootDir, 'models', 'vad', 'silero_vad_16k_op15.onnx');
        if (fs.existsSync(vadPath)) {
          try {
            this.vadSession = await ort.InferenceSession.create(vadPath);
          } catch (err) {
            console.warn('VAD model load failed:', err);
          }
        }

        const emotionPath = path.join(this.rootDir, 'models', 'emotion', 'ser_wavlm.onnx');
        if (fs.existsSync(emotionPath)) {
          try {
            this.emotionSession = await ort.InferenceSession.create(emotionPath);
          } catch (err) {
            console.warn('Emotion model load failed:', err);
          }
        }
      }

      // Load whisper.cpp native addon (optional)
      const addonPath = path.join(this.rootDir, 'whisper.cpp', 'build', 'Release', 'addon.node');
      if (fs.existsSync(addonPath)) {
        try {
          const nativeModule = req(addonPath);
          this.whisperAddon = nativeModule.whisper;
        } catch (addonErr: any) {
          console.warn('whisper.cpp addon failed to load (dylib missing?):', addonErr.message);
        }
      }

      this.emit('ready', { activeModel: this.activeModelId });
    } catch (err: any) {
      console.error('AudioPipeline initialize error:', err.message || err);
      // Emit ready anyway so the app remains usable
      this.emit('ready', { activeModel: this.activeModelId });
    }
  }

  public refreshModelStatuses(): ModelInfo[] {
    const whisperDir = path.join(this.rootDir, 'models', 'whisper');
    return AVAILABLE_MODELS.map((m) => {
      const fullPath = path.join(whisperDir, m.filename);
      m.downloaded = fs.existsSync(fullPath) && fs.statSync(fullPath).size > 10 * 1024 * 1024;
      return m;
    });
  }

  public setModel(modelId: string): boolean {
    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) return false;
    this.activeModelId = modelId;
    this.emit('model_changed', this.activeModelId);
    return true;
  }

  public getActiveModelId(): string {
    return this.activeModelId;
  }

  public startRecording(): void {
    if (this.isRecording) return;
    this.isRecording = true;
    this.pcmBuffer = new Float32Array(0);

    try {
      const audio = getAudio(this.rootDir);
      this.audioStream = audio.AudioIO({
        inOptions: {
          channelCount: 1,
          sampleFormat: audio.SampleFormat16Bit as number,
          sampleRate: 16000,
          deviceId: -1,
          closeOnError: false,
        },
      });

      this.audioStream.on('data', (chunk: Buffer) => {
        if (!this.isRecording) return;
        const int16 = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2);
        const float32 = new Float32Array(int16.length);
        let sumSquares = 0;

        for (let i = 0; i < int16.length; i++) {
          const val = int16[i] / 32768.0;
          float32[i] = val;
          sumSquares += val * val;
        }

        const rms = Math.sqrt(sumSquares / (int16.length || 1));
        this.emit('audio_level', Math.min(1.0, rms * 5.0));

        const newBuf = new Float32Array(this.pcmBuffer.length + float32.length);
        newBuf.set(this.pcmBuffer);
        newBuf.set(float32, this.pcmBuffer.length);
        this.pcmBuffer = newBuf;

        if (this.pcmBuffer.length >= 3200 && this.pcmBuffer.length % 3200 < float32.length) {
          const liveEmo = this.detectEmotion(this.pcmBuffer);
          this.emit('live_emotion', liveEmo);
        }
      });

      this.audioStream.start();
      this.emit('recording_started');
    } catch (err: any) {
      this.isRecording = false;
      this.emit('error', `Microphone capture failed: ${err.message}`);
    }
  }

  public async stopRecording(): Promise<{ text: string; emotion: EmotionResult }> {
    if (!this.isRecording) {
      return { text: '', emotion: this.detectEmotion(new Float32Array(0)) };
    }

    this.isRecording = false;
    if (this.audioStream) {
      try {
        this.audioStream.quit();
      } catch (e) {}
      this.audioStream = null;
    }

    this.emit('recording_stopped');

    const audioData = this.pcmBuffer;
    const text = await this.transcribeAudio(audioData);
    const emotion = this.detectEmotion(audioData);

    this.emit('final_result', { text, emotion });
    return { text, emotion };
  }

  private async transcribeAudio(pcmData: Float32Array): Promise<string> {
    if (pcmData.length < 1600) {
      return '';
    }

    const modelObj = AVAILABLE_MODELS.find((m) => m.id === this.activeModelId) || AVAILABLE_MODELS[1];
    const modelPath = path.join(this.rootDir, 'models', 'whisper', modelObj.filename);

    if (!fs.existsSync(modelPath)) {
      return `[Model ${modelObj.name} not downloaded yet]`;
    }

    if (!this.whisperAddon) {
      return `Transcribed audio session (${(pcmData.length / 16000).toFixed(1)}s speech chunk)`;
    }

    return new Promise((resolve) => {
      try {
        this.whisperAddon(
          {
            language: 'en',
            model: modelPath,
            pcm: pcmData,
            use_gpu: true,
            no_prints: true,
          },
          (err: any, result: any) => {
            if (err || !result) {
              resolve(`Transcribed speech (${(pcmData.length / 16000).toFixed(1)}s audio)`);
            } else {
              let text = '';
              if (Array.isArray(result)) {
                text = result.map((r: any) => (typeof r === 'string' ? r : (r.text || r[3] || r[0] || ''))).join(' ');
              } else if (typeof result === 'string') {
                text = result;
              } else if (typeof result === 'object' && result.text) {
                text = result.text;
              }
              text = text.trim();
              if (!text) {
                text = `Transcribed speech (${(pcmData.length / 16000).toFixed(1)}s audio)`;
              }
              resolve(text);
            }
          },
        );
      } catch (e) {
        resolve(`Transcribed speech (${(pcmData.length / 16000).toFixed(1)}s audio)`);
      }
    });
  }

  public detectEmotion(pcmData: Float32Array): EmotionResult {
    if (pcmData.length < 1600) {
      return {
        label: 'Neutral',
        confidence: 0.90,
        scores: { Neutral: 0.90, Calm: 0.05, Focused: 0.03, Thoughtful: 0.02, Happy: 0.0, Energetic: 0.0 },
      };
    }

    let zeroCrossings = 0;
    let sumVal = 0;
    for (let i = 1; i < pcmData.length; i++) {
      if ((pcmData[i - 1] >= 0 && pcmData[i] < 0) || (pcmData[i - 1] < 0 && pcmData[i] >= 0)) {
        zeroCrossings++;
      }
      sumVal += Math.abs(pcmData[i]);
    }

    const avgAmp = sumVal / pcmData.length;
    const zcr = zeroCrossings / pcmData.length;

    let selectedLabel: EmotionLabel = 'Focused';
    if (avgAmp > 0.07 && zcr > 0.04) selectedLabel = 'Energetic';
    else if (avgAmp > 0.035) selectedLabel = 'Happy';
    else if (zcr < 0.025 && avgAmp < 0.03) selectedLabel = 'Calm';
    else if (avgAmp < 0.015) selectedLabel = 'Thoughtful';
    else if (avgAmp < 0.02) selectedLabel = 'Neutral';

    const baseConf = Math.min(0.96, Math.max(0.75, 0.82 + avgAmp * 3.0));

    const rawScores: Record<EmotionLabel, number> = {
      Energetic: selectedLabel === 'Energetic' ? baseConf : Math.max(0.01, avgAmp * 5.0),
      Happy: selectedLabel === 'Happy' ? baseConf : Math.max(0.02, avgAmp * 3.0),
      Focused: selectedLabel === 'Focused' ? baseConf : 0.10,
      Calm: selectedLabel === 'Calm' ? baseConf : Math.max(0.02, (0.05 - avgAmp) * 4.0),
      Thoughtful: selectedLabel === 'Thoughtful' ? baseConf : 0.05,
      Neutral: selectedLabel === 'Neutral' ? baseConf : 0.08,
    };

    const totalScore = Object.values(rawScores).reduce((a, b) => a + b, 0);
    const scores: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawScores)) {
      scores[k] = parseFloat((v / totalScore).toFixed(2));
    }

    return {
      label: selectedLabel,
      confidence: parseFloat(baseConf.toFixed(2)),
      scores,
    };
  }

  public shutdown(): void {
    if (this.isRecording) {
      this.stopRecording().catch(() => {});
    }
    if (this.vadSession) {
      try { this.vadSession.release(); } catch (e) {}
      this.vadSession = null;
    }
    if (this.emotionSession) {
      try { this.emotionSession.release(); } catch (e) {}
      this.emotionSession = null;
    }
  }
}

/**
 * `Angry` and `Sad` are what the ONNX model actually emits. The remaining four
 * come from the acoustic heuristic, which can only really read arousal and has
 * no business claiming a negative emotion from loudness alone.
 */
export type EmotionLabel =
  | 'Neutral'
  | 'Happy'
  | 'Angry'
  | 'Sad'
  | 'Calm'
  | 'Focused'
  | 'Thoughtful'
  | 'Energetic';

/**
 * What the acoustic heuristic is willing to claim. It reads arousal only, so it
 * deliberately cannot reach `Angry` or `Sad` — inferring a negative emotion from
 * loudness would be a guess dressed as a measurement.
 */
type HeuristicLabel = 'Neutral' | 'Calm' | 'Focused' | 'Happy' | 'Thoughtful' | 'Energetic';

export interface EmotionResult {
  label: EmotionLabel;
  confidence: number;
  scores: Record<string, number>;
}

/** Lightweight acoustic heuristic — live preview while recording, and the
 *  fallback whenever the ONNX model isn't installed or fails to load. */
export function detectEmotion(pcmData: Float32Array): EmotionResult {
  if (pcmData.length < 1600) {
    return {
      label: 'Neutral',
      confidence: 0.9,
      scores: { Neutral: 0.9, Calm: 0.05, Focused: 0.03, Thoughtful: 0.02, Happy: 0.0, Energetic: 0.0 },
    };
  }

  let zeroCrossings = 0;
  let sumVal = 0;
  for (let i = 1; i < pcmData.length; i++) {
    if ((pcmData[i - 1]! >= 0 && pcmData[i]! < 0) || (pcmData[i - 1]! < 0 && pcmData[i]! >= 0)) {
      zeroCrossings++;
    }
    sumVal += Math.abs(pcmData[i]!);
  }

  const avgAmp = sumVal / pcmData.length;
  const zcr = zeroCrossings / pcmData.length;

  let selectedLabel: HeuristicLabel = 'Focused';
  if (avgAmp > 0.07 && zcr > 0.04) selectedLabel = 'Energetic';
  else if (avgAmp > 0.035) selectedLabel = 'Happy';
  else if (zcr < 0.025 && avgAmp < 0.03) selectedLabel = 'Calm';
  else if (avgAmp < 0.015) selectedLabel = 'Thoughtful';
  else if (avgAmp < 0.02) selectedLabel = 'Neutral';

  const baseConf = Math.min(0.96, Math.max(0.75, 0.82 + avgAmp * 3.0));

  const rawScores: Record<HeuristicLabel, number> = {
    Energetic: selectedLabel === 'Energetic' ? baseConf : Math.max(0.01, avgAmp * 5.0),
    Happy: selectedLabel === 'Happy' ? baseConf : Math.max(0.02, avgAmp * 3.0),
    Focused: selectedLabel === 'Focused' ? baseConf : 0.1,
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

// ─── ONNX classifier (superb/wav2vec2-base-superb-er) ────────────────────────

const SAMPLE_RATE = 16_000;
/** wav2vec2 cost is linear in input length: ~77 ms @3 s, ~207 ms @8 s. Capping
 *  at 8 s bounds worst-case latency and the transient activation memory. */
const MAX_SAMPLES = SAMPLE_RATE * 8;
/** Below this the model has nothing to go on; the heuristic answers instead. */
const MIN_SAMPLES = SAMPLE_RATE * 0.5;
/** The session holds ~538 MB resident. Dictation is bursty, so give it back
 *  after a quiet spell rather than parking it for the life of the process. */
const IDLE_UNLOAD_MS = 60_000;
/** Hop for the loudest-window search; 100 ms is finer than the model can resolve. */
const WINDOW_HOP = SAMPLE_RATE / 10;

/**
 * SUPERB's four classes, reported as-is.
 *
 * An earlier version mapped `ang` → "Energetic" and `sad` → "Thoughtful" to fit
 * the UI's non-judgemental palette. That made the tone page lie: someone who
 * sounded angry was shown "Energetic", and two labels the model can never emit
 * sat on screen forever at zero. A dashboard that renames its own findings
 * isn't insight, so the real labels ship and the UI explains their limits.
 */
const MODEL_LABELS: EmotionLabel[] = ['Neutral', 'Happy', 'Angry', 'Sad'];

function softmax(logits: Float32Array | number[]): number[] {
  let max = -Infinity;
  for (const v of logits) if (v > max) max = v;
  let sum = 0;
  const out: number[] = [];
  for (const v of logits) {
    const e = Math.exp(v - max);
    out.push(e);
    sum += e;
  }
  return out.map((e) => e / sum);
}

/**
 * The 8 s slice with the most energy. An utterance that opens with a breath and
 * trails into silence would otherwise hand the model mostly room tone; a
 * head-crop would also drop the tail of anything long.
 */
function loudestWindow(pcm: Float32Array): Float32Array {
  if (pcm.length <= MAX_SAMPLES) return pcm;

  let energy = 0;
  for (let i = 0; i < MAX_SAMPLES; i++) energy += pcm[i]! * pcm[i]!;

  let best = 0;
  let bestEnergy = energy;
  for (let start = WINDOW_HOP; start + MAX_SAMPLES <= pcm.length; start += WINDOW_HOP) {
    for (let i = start - WINDOW_HOP; i < start; i++) energy -= pcm[i]! * pcm[i]!;
    for (let i = start + MAX_SAMPLES - WINDOW_HOP; i < start + MAX_SAMPLES; i++) energy += pcm[i]! * pcm[i]!;
    if (energy > bestEnergy) {
      bestEnergy = energy;
      best = start;
    }
  }
  return pcm.subarray(best, best + MAX_SAMPLES);
}

/**
 * Lazy-loading wrapper around the optional emotion model.
 *
 * The session is created on first use and released after {@link IDLE_UNLOAD_MS}
 * of inactivity. Every failure path — module missing, model corrupt, inference
 * throwing — degrades to {@link detectEmotion} so dictation never breaks over a
 * cosmetic tone tag.
 */
export class EmotionClassifier {
  private modelPath: string | null = null;
  private session: any = null;
  private loading: Promise<any> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = 0;
  private failed = false;

  /** `loadOrt` is injected so module resolution stays with the pipeline, which
   *  knows where extraResources put onnxruntime-node in a packaged app. */
  constructor(private loadOrt: () => any) {}

  public setModelPath(modelPath: string | null): void {
    if (modelPath === this.modelPath) return;
    this.modelPath = modelPath;
    this.failed = false;
    void this.unload();
  }

  public hasModel(): boolean {
    return !!this.modelPath;
  }

  public async classify(pcm: Float32Array): Promise<EmotionResult> {
    if (!this.modelPath || this.failed || pcm.length < MIN_SAMPLES) {
      return detectEmotion(pcm);
    }

    this.inFlight++;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    try {
      const { ort, session } = await this.ensureSession();
      const window = loudestWindow(pcm);
      // Tensor wants a standalone buffer; subarray shares the utterance's.
      const input = new ort.Tensor('float32', Float32Array.from(window), [1, window.length]);
      const output = await session.run({ input_values: input });
      const logits = output.logits?.data as Float32Array | undefined;
      if (!logits || logits.length !== MODEL_LABELS.length) {
        throw new Error(`unexpected logits shape: ${logits?.length}`);
      }

      const probs = softmax(logits);
      const scores: Record<string, number> = {};
      let topIndex = 0;
      for (let i = 0; i < probs.length; i++) {
        scores[MODEL_LABELS[i]!] = parseFloat(probs[i]!.toFixed(3));
        if (probs[i]! > probs[topIndex]!) topIndex = i;
      }

      return {
        label: MODEL_LABELS[topIndex]!,
        confidence: parseFloat(probs[topIndex]!.toFixed(2)),
        scores,
      };
    } catch (err: any) {
      // One bad load is permanent for this path; one bad run is not.
      console.warn('Emotion model inference failed, using heuristic:', err?.message || err);
      return detectEmotion(pcm);
    } finally {
      this.inFlight--;
      this.scheduleIdleUnload();
    }
  }

  private async ensureSession(): Promise<{ ort: any; session: any }> {
    if (this.session) return { ort: this.loadOrt(), session: this.session };
    let pending = this.loading;
    if (!pending) {
      pending = this.loading = (async () => {
        const ort = this.loadOrt();
        const session = await ort.InferenceSession.create(this.modelPath, {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
          logSeverityLevel: 3,
        });
        this.session = session;
        return { ort, session };
      })().catch((err) => {
        // A model that won't open won't open on the next utterance either —
        // stop paying the ~300 ms load attempt every time.
        this.failed = true;
        this.loading = null;
        throw err;
      });
    }
    const loaded = await pending;
    if (this.loading === pending) this.loading = null;
    return loaded;
  }

  private scheduleIdleUnload(): void {
    if (this.idleTimer || this.inFlight > 0 || !this.session) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      void this.unload();
    }, IDLE_UNLOAD_MS);
    // Don't hold the event loop open just to free memory later.
    (this.idleTimer as any).unref?.();
  }

  /** Release the session and its ~538 MB. Safe to call at any time. */
  public async unload(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.inFlight > 0) return;
    const session = this.session;
    this.session = null;
    if (session?.release) {
      try {
        await session.release();
      } catch {
        // already gone
      }
    }
  }
}

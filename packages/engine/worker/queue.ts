import type { UtteranceContext } from '../context/utterance.ts';
import type { EmotionResult } from '../emotion.ts';

export interface WorkerJob {
  id: string;
  pcm: Float32Array;
  ctx: UtteranceContext;
  committedLive: string;
  peakRms: number;
}

export interface WorkerResult {
  id: string;
  rawText: string;
  text: string;
  /** Text that still needs injection after live partials (suffix / full). */
  injectText: string;
  emotion: EmotionResult;
  ctx: UtteranceContext;
}

type JobHandler = (job: WorkerJob) => Promise<WorkerResult>;

/**
 * Serial utterance queue — one worker at a time so Whisper isn't re-entered.
 */
export class UtteranceQueue {
  private queue: WorkerJob[] = [];
  private busy = false;
  private handler: JobHandler | null = null;

  setHandler(handler: JobHandler) {
    this.handler = handler;
  }

  enqueue(job: WorkerJob): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      const wrapped: WorkerJob = job;
      const run = async () => {
        if (!this.handler) {
          reject(new Error('No worker handler'));
          return;
        }
        try {
          const result = await this.handler(wrapped);
          resolve(result);
        } catch (e) {
          reject(e);
        } finally {
          this.busy = false;
          this.pump();
        }
      };

      this.queue.push(wrapped);
      // Attach run via side channel
      (wrapped as any).__run = run;
      this.pump();
    });
  }

  private pump() {
    if (this.busy || this.queue.length === 0) return;
    this.busy = true;
    const job = this.queue.shift()!;
    const run = (job as any).__run as () => Promise<void>;
    void run();
  }
}

/** Prefer injecting only the part after the live-committed prefix. */
export function injectDeltaAfterLive(finalText: string, committedLive: string): string {
  if (!committedLive.trim()) return finalText;
  if (!finalText.trim()) return '';

  const finalWords = finalText.trim().split(/\s+/);
  const liveWords = committedLive.trim().split(/\s+/);

  let i = 0;
  while (i < liveWords.length && i < finalWords.length) {
    if (liveWords[i]!.toLowerCase() !== finalWords[i]!.toLowerCase()) break;
    i++;
  }

  // If live prefix diverged early, inject full final (caller may choose to skip re-paste)
  if (i < Math.min(3, liveWords.length) && liveWords.length > 3) {
    return finalText;
  }

  return finalWords.slice(i).join(' ');
}

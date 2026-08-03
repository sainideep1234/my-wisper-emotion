/**
 * LocalAgreement-n: commit a word only when n consecutive ASR hypotheses agree on it.
 * Keeps streamed text stable instead of flickering as the rolling window re-transcribes.
 */

export interface AgreementResult {
  committed: string;
  pending: string;
  /** Newly committed text since the previous call (for delta injection). */
  delta: string;
  committedWords: string[];
}

function tokenize(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export class LocalAgreement {
  private readonly n: number;
  private history: string[][] = [];
  private committedWords: string[] = [];

  constructor(n = 2) {
    this.n = Math.max(2, n);
  }

  reset(): void {
    this.history = [];
    this.committedWords = [];
  }

  getCommitted(): string {
    return this.committedWords.join(' ');
  }

  push(hypothesis: string): AgreementResult {
    const words = tokenize(hypothesis);
    this.history.push(words);
    if (this.history.length > this.n) {
      this.history.shift();
    }

    if (this.history.length < this.n) {
      return {
        committed: this.getCommitted(),
        pending: words.slice(this.committedWords.length).join(' '),
        delta: '',
        committedWords: [...this.committedWords],
      };
    }

    // Longest common prefix across the last n hypotheses
    let agreeLen = 0;
    const first = this.history[0]!;
    outer: while (agreeLen < first.length) {
      const w = first[agreeLen]!;
      for (let h = 1; h < this.history.length; h++) {
        const hyp = this.history[h]!;
        if (agreeLen >= hyp.length || hyp[agreeLen] !== w) break outer;
      }
      agreeLen++;
    }

    // Never un-commit; only extend
    const prevLen = this.committedWords.length;
    if (agreeLen > prevLen) {
      this.committedWords = first.slice(0, agreeLen);
    }

    const deltaWords = this.committedWords.slice(prevLen);
    const latest = this.history[this.history.length - 1]!;
    const pending = latest.slice(this.committedWords.length).join(' ');

    return {
      committed: this.getCommitted(),
      pending,
      delta: deltaWords.join(' '),
      committedWords: [...this.committedWords],
    };
  }
}

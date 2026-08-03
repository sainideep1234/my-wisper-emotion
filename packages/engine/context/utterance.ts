/** Frozen per-utterance context shared by every pipeline stage. */

export type AppKind = 'terminal' | 'chat' | 'editor' | 'browser' | 'other';

export interface UtteranceContext {
  readonly startedAt: number;
  readonly exe: string;
  readonly title: string;
  readonly bundleId: string;
  readonly kind: AppKind;
  readonly isTerminal: boolean;
  readonly isChat: boolean;
  readonly isElevated: boolean;
  readonly locale: string;
  readonly caretText: string | null;
  readonly allowLiveStream: boolean;
}

export function freezeContext(partial: Omit<UtteranceContext, 'allowLiveStream'> & { allowLiveStream?: boolean }): UtteranceContext {
  const isTerminal = partial.isTerminal || partial.kind === 'terminal';
  const isElevated = partial.isElevated;
  return Object.freeze({
    ...partial,
    isTerminal,
    allowLiveStream: partial.allowLiveStream ?? !(isTerminal || isElevated),
  });
}

export function emptyContext(): UtteranceContext {
  return freezeContext({
    startedAt: Date.now(),
    exe: '',
    title: '',
    bundleId: '',
    kind: 'other',
    isTerminal: false,
    isChat: false,
    isElevated: false,
    locale: 'en-US',
    caretText: null,
  });
}

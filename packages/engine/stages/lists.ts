import type { Stage } from './base.ts';
import type { UtteranceContext } from '../context/utterance.ts';

const ORDINALS: Record<string, string> = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
};

/** "First … Second …" → "1. … 2. …" when they look like list markers. */
export const numberedLists: Stage = {
  name: 'numbered_lists',
  run(text: string, _ctx: UtteranceContext): string {
    return text.replace(
      /\b(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)\b(?:ly)?[,:]?\s+/gi,
      (_m, word: string) => {
        const n = ORDINALS[word.toLowerCase()];
        return n ? `${n}. ` : `${word} `;
      },
    );
  },
};

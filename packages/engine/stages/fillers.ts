import type { Stage } from './base.ts';
import type { UtteranceContext } from '../context/utterance.ts';

const FILLERS = /\b(um+|uh+|erm+|uhh+|hmm+|ah+|eh+)\b/gi;

/** Remove um / uh / erm … */
export const stripFillers: Stage = {
  name: 'strip_fillers',
  run(text: string, _ctx: UtteranceContext): string {
    return text
      .replace(FILLERS, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trim();
  },
};

import type { Stage } from './base.ts';
import type { UtteranceContext } from '../context/utterance.ts';

/**
 * Basic "scratch that" / "delete that" retractions:
 * drops the clause before the retraction phrase.
 */
export const retractions: Stage = {
  name: 'retractions',
  run(text: string, _ctx: UtteranceContext): string {
    const patterns = [
      /\bscratch that\b/i,
      /\bdelete that\b/i,
      /\bignore that\b/i,
      /\bno wait\b/i,
      /\bforget that\b/i,
    ];
    let out = text;
    for (const re of patterns) {
      const m = re.exec(out);
      if (m && m.index != null) {
        // Keep only text after the retraction marker
        out = out.slice(m.index + m[0].length);
      }
    }
    return out.replace(/\s{2,}/g, ' ').trim();
  },
};

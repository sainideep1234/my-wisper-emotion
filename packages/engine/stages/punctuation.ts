import type { Stage } from './base.ts';
import type { UtteranceContext } from '../context/utterance.ts';

/** Light punctuation tidy: capitalize sentence starts, ensure terminal period for prose. */
export const lightPunctuation: Stage = {
  name: 'light_punctuation',
  run(text: string, ctx: UtteranceContext): string {
    if (ctx.isTerminal) return text.trim();

    let out = text.trim();
    if (!out) return out;

    // Capitalize first letter
    out = out.charAt(0).toUpperCase() + out.slice(1);

    // Capitalize after sentence enders
    out = out.replace(/([.!?]\s+)([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());

    return out;
  },
};

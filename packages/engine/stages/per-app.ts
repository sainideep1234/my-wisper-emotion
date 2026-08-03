import type { Stage } from './base.ts';
import type { UtteranceContext } from '../context/utterance.ts';

/**
 * Chat apps lose the passive-aggressive trailing period on short messages.
 * Terminals: collapse newlines to spaces (line-safe).
 */
export const perAppRules: Stage = {
  name: 'per_app_rules',
  run(text: string, ctx: UtteranceContext): string {
    let out = text;

    if (ctx.isTerminal) {
      out = out.replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      // Never leave a trailing newline that would submit a shell command
      out = out.replace(/\n+$/g, '');
    }

    if (ctx.isChat) {
      // Strip a single trailing period on short one-liners (no other sentence enders)
      if (out.length < 120 && /^[^.!?]*\.$/.test(out) && (out.match(/\./g) || []).length === 1) {
        out = out.slice(0, -1);
      }
    }

    return out;
  },
};

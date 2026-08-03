import type { Stage } from './base.ts';
import type { UtteranceContext } from '../context/utterance.ts';

export interface DictionaryConfig {
  replacements?: Record<string, string>;
  snippets?: Record<string, string>;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Exact whole-word replacements + spoken snippets. Runs last so spellings always win. */
export function createDictionaryStage(config: DictionaryConfig = {}): Stage {
  const replacements = config.replacements ?? {};
  const snippets = config.snippets ?? {};

  return {
    name: 'dictionary',
    run(text: string, _ctx: UtteranceContext): string {
      let out = text;

      for (const [from, to] of Object.entries(snippets)) {
        const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi');
        out = out.replace(re, to);
      }

      for (const [from, to] of Object.entries(replacements)) {
        const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi');
        out = out.replace(re, to);
      }

      return out;
    },
  };
}

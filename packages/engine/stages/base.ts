import type { UtteranceContext } from '../context/utterance.ts';

export interface Stage {
  readonly name: string;
  run(text: string, ctx: UtteranceContext): string | Promise<string>;
}

/**
 * Fail-safe ordered cleanup chain. A stage error leaves text unchanged.
 */
export class Chain {
  private readonly stages: Stage[];

  constructor(stages: Stage[]) {
    this.stages = stages;
  }

  async run(text: string, ctx: UtteranceContext): Promise<string> {
    let out = text;
    for (const stage of this.stages) {
      try {
        out = await stage.run(out, ctx);
      } catch (e) {
        console.warn(`cleanup stage "${stage.name}" failed:`, e);
      }
    }
    return out.trim();
  }
}

import type { QuestionBlueprint } from '../types/questionBlueprint';
import { BLUEPRINTS } from './blueprints/library';

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 0xFFFFFFFF);
  };
}

export interface SelectorRequest {
  topic: string;
  difficulty: 'Basic'|'Intermediate'|'Advanced';
  diversity?: { leadInMix?: boolean; topicSpread?: boolean; includeImages?: boolean };
  seed?: number;
}

export function selectBlueprint(req: SelectorRequest): QuestionBlueprint {
  const pool = BLUEPRINTS.filter(b => b.constraints.difficulty === req.difficulty);
  const prefersImage = !!req.diversity?.includeImages;
  const filtered = prefersImage ? pool.filter(b => b.a11y?.imageRequired) : pool;
  const candidates = filtered.length > 0 ? filtered : pool;
  const rnd = req.seed ? seededRandom(req.seed) : Math.random;
  const idx = Math.floor((typeof rnd === 'function' ? (rnd as any)() : Math.random()) * candidates.length);
  return candidates[Math.max(0, Math.min(idx, candidates.length - 1))];
}

export type Confidence = 'Low' | 'Medium' | 'High';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function logistic(x: number) {
  return 1 / (1 + Math.exp(-x));
}

export function confidenceWeight(conf: Confidence): number {
  if (conf === 'High') return 1.2;
  if (conf === 'Low') return 0.8;
  return 1.0;
}

export function timeModulatedWeight(base: number, timeSec: number, p2: number, p98: number) {
  if (timeSec <= p2 || timeSec >= p98) return Math.min(base, 0.8);
  return base;
}

export function updateElo(
  theta: number,
  beta: number,
  correct: boolean,
  conf: Confidence,
  timeSec: number,
  itemP2: number,
  itemP98: number,
  kUser = 0.06,
  kItem = 0.02,
) {
  const pHat = logistic(theta - beta);
  const r = correct ? 1 : 0;
  const w = timeModulatedWeight(confidenceWeight(conf), timeSec, itemP2, itemP98);
  const delta = w * (r - pHat);
  const theta2 = clamp(theta + kUser * delta, -3.0, 3.0);
  const beta2 = clamp(beta - kItem * delta, -3.0, 3.0);
  return { theta: theta2, beta: beta2, pHat };
}

export type BKTParams = { T: number; s: number; g: number };

export function updateBKT(
  pMastery: number,
  correct: boolean,
  conf: Confidence,
  params: BKTParams = { T: 0.08, s: 0.1, g: 0.2 }
) {
  const { T, s, g } = params;
  const pCorrect = pMastery * (1 - s) + (1 - pMastery) * g;
  let posterior: number;
  if (correct) {
    posterior = (pMastery * (1 - s)) / pCorrect;
  } else {
    posterior = (pMastery * s) / (1 - pCorrect);
  }
  const confScale = conf === 'High' ? 1.1 : conf === 'Low' ? 0.9 : 1.0;
  const learned = posterior + (1 - posterior) * (T * confScale);
  return clamp(learned, 0, 1);
}

export type SRSState = { ease: number; intervalDays: number; dueAt: number };

export function fsrsUpdate(state: SRSState, grade: 1|2|3|4) {
  let ease = state.ease + (0.1 - (4 - grade) * (0.08 + (4 - grade) * 0.02));
  ease = clamp(ease, 1.3, 2.6);
  let interval = state.intervalDays;
  if (grade < 3) {
    interval = 1;
  } else {
    if (interval === 0) interval = 1;
    else interval = Math.round(interval * ease);
  }
  const dueAt = Date.now() + interval * 24 * 60 * 60 * 1000;
  return { ease, intervalDays: interval, dueAt } as SRSState;
}

export function ensureFiveOptions(options: any): string[] {
  const arr = Array.isArray(options)
    ? options
    : options && typeof options === 'object'
      ? ['A','B','C','D','E'].map(k => options[k]).filter((v:any)=>typeof v==='string'&&v.trim().length>0)
      : [];
  return arr.slice(0,5);
}

export function hasSingleBestAnswer(correct: any): boolean {
  if (typeof correct === 'number') return correct>=0 && correct<5;
  if (typeof correct === 'string') return /^[A-E]$/.test(correct.toUpperCase());
  return false;
}

export function checkHomogeneous(options: string[]): boolean {
  const t = (s:string)=>s.toLowerCase();
  const categorize = (s:string):'test'|'treatment'|'diagnosis' => {
    const x = t(s);
    if (/(biopsy|koh|culture|pcr|dermoscop|test|scan|ct|mri|cbc|histolog)/.test(x)) return 'test';
    if (/(topical|systemic|corticosteroid|steroid|methotrexate|isotretinoin|therapy|dose|mg|treatment)/.test(x)) return 'treatment';
    return 'diagnosis';
  };
  const cats = new Set(options.map(categorize));
  return cats.size === 1;
}

export function checkCoverTheOptions(leadIn: string, stem: string): boolean {
  // Heuristic: lead-in contains direct ask; stem length and presence of specifics suggest answerability.
  if (!leadIn || !stem) return false;
  const hasAsk = /(most likely|best|appropriate|next step|confirm|diagnosis|definitive)/i.test(leadIn);
  const sufficientStem = stem.trim().length >= 120; // conservative minimum
  return hasAsk && sufficientStem;
}

export function guardNegativeLeadIn(leadIn: string): { ok: boolean; reason?: string } {
  if (!leadIn) return { ok: false, reason: 'empty lead-in' };
  if (/(except|least|not)/i.test(leadIn)) return { ok: false, reason: 'negative lead-in' };
  return { ok: true };
}

export function detectDuplicateOptions(options: string[]): number[] {
  const seen = new Map<string, number>();
  const dups: number[] = [];
  options.forEach((o, i) => {
    const k = o.trim().toLowerCase();
    if (seen.has(k)) dups.push(i);
    else seen.set(k, i);
  });
  return dups;
}

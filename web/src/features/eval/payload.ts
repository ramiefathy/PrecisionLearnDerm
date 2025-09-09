export type Difficulty = 'Basic' | 'Intermediate' | 'Advanced';

export interface Counts {
  Basic: number;
  Intermediate: number;
  Advanced: number;
}

export interface TaxonomySelectionEntry {
  category: string;
  subcategories: string[];
  subSubcategories: Record<string, string[]>;
}

export interface TaxonomySelectionSummary {
  categories: string[];
  subcategories: string[];
  topics: string[];
}

export interface DiversityPrefs {
  leadInMix?: boolean;
  topicSpread?: boolean;
  includeImages?: boolean;
}

export interface EvaluationRequestV2 {
  pipelines: string[];
  counts?: Counts;
  taxonomySelection?: TaxonomySelectionSummary;
  topics?: string[];
  difficulty?: Difficulty; // legacy fallback
  count?: number; // legacy fallback
  seed?: number;
  diversity?: DiversityPrefs;
}

export function validateCounts(counts: Counts): { ok: boolean; errors: string[]; total: number } {
  const errors: string[] = [];
  const vals = [counts.Basic, counts.Intermediate, counts.Advanced];
  const names: Difficulty[] = ['Basic', 'Intermediate', 'Advanced'];
  vals.forEach((v, i) => {
    if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`${names[i]} count must be a number`);
    else if (v < 0 || v > 50) errors.push(`${names[i]} count must be between 0 and 50`);
  });
  const total = vals.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  if (total > 50) errors.push('Total of counts must be ≤ 50');
  if (vals.every(v => (v || 0) === 0)) errors.push('At least one difficulty count must be > 0');
  return { ok: errors.length === 0, errors, total };
}

export function buildTopicsFromTaxonomy(value: TaxonomySelectionEntry[]): string[] {
  const topics = new Set<string>();
  for (const cat of value) {
    const map = cat.subSubcategories || {};
    Object.keys(map).forEach(subcat => {
      (map[subcat] || []).forEach(topic => topics.add(topic));
    });
  }
  return Array.from(topics);
}

export function buildTaxonomySelection(value: TaxonomySelectionEntry[]): TaxonomySelectionSummary {
  const categories = new Set<string>();
  const subcategories = new Set<string>();
  const topics = new Set<string>();
  for (const cat of value) {
    if ((cat.subcategories || []).length > 0) categories.add(cat.category);
    (cat.subcategories || []).forEach(sc => subcategories.add(sc));
    const map = cat.subSubcategories || {};
    Object.keys(map).forEach(subcat => {
      (map[subcat] || []).forEach(topic => topics.add(topic));
    });
  }
  return {
    categories: Array.from(categories),
    subcategories: Array.from(subcategories),
    topics: Array.from(topics)
  };
}

export function buildEvaluationRequestPayload(input: {
  pipelines: string[];
  counts: Counts;
  taxonomyValue: TaxonomySelectionEntry[];
  seed?: number;
  diversity?: DiversityPrefs;
}): EvaluationRequestV2 {
  const taxonomySelection = buildTaxonomySelection(input.taxonomyValue);
  const topics = taxonomySelection.topics;
  return {
    pipelines: input.pipelines,
    counts: input.counts,
    taxonomySelection,
    topics: topics.length > 0 ? topics : undefined,
    seed: input.seed,
    diversity: input.diversity
  };
}



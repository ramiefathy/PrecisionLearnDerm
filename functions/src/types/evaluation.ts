export interface EvaluationRequest {
  pipelines: string[];
  difficulty?: 'Basic' | 'Intermediate' | 'Advanced';
  count?: number;
  topics?: string[];
  tags?: string[];
  seed?: number;
  diversity?: { leadInMix?: boolean; topicSpread?: boolean; includeImages?: boolean };
  counts?: { Basic: number; Intermediate: number; Advanced: number };
  taxonomySelection?: { categories: string[]; subcategories: string[]; topics: string[] };
}

export interface EvaluationJobExtra {
  request?: EvaluationRequest;
}

import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

export interface EvaluationRequest {
  pipelines: string[];
  difficulty?: 'Basic'|'Intermediate'|'Advanced';
  count?: number;
  topics?: string[];
  tags?: string[];
  seed?: number;
  diversity?: { leadInMix?: boolean; topicSpread?: boolean; includeImages?: boolean };
  counts?: { Basic: number; Intermediate: number; Advanced: number };
  taxonomySelection?: { categories: string[]; subcategories: string[]; topics: string[] };
}

export function useRunEvaluation() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (req: EvaluationRequest): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const callable = httpsCallable(functions, 'startPipelineEvaluation');
      const res: any = await callable(req);
      if (res?.data?.success && res.data.jobId) {
        return res.data.jobId as string;
      }
      throw new Error(res?.data?.message || 'Failed to start evaluation');
    } catch (e: any) {
      setError(e?.message || 'Failed to start evaluation');
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { start, isLoading, error };
}

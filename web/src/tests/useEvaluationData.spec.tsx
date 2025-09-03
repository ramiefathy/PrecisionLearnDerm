import { useEffect } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { useEvaluationData } from '../hooks/useEvaluationData';
import type { EvaluationFilters } from '../types';

// Access the firestore mock to override onSnapshot behavior
import * as firestore from 'firebase/firestore';

function TestHarness({ jobId, onResult }:{ jobId: string; onResult: (res:any)=>void }){
  const filters: EvaluationFilters = { pipelines: [], topics: [], difficulties: [] };
  const result = useEvaluationData(jobId, filters);
  useEffect(() => { onResult(result); }, [JSON.stringify(result)]);
  return null;
}

describe('useEvaluationData', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('maps ai using aiScoresFlat with fallback to aiScores and aggregates by pipeline', async () => {
    const docs = [
      {
        id: 't1',
        data: () => ({
          aiScoresFlat: { overall: 80, boardReadiness: 'ready' },
          latency: 5000,
          createdAt: Date.now(),
          testCase: { topic: 'Psoriasis', difficulty: 'Basic', pipeline: 'boardStyle' }
        })
      },
      {
        id: 't2',
        data: () => ({
          aiScores: { overall: 70, metadata: { boardReadiness: 'minor_revision' } },
          latency: 10000,
          createdAt: Date.now(),
          testCase: { topic: 'Melanoma diagnosis', difficulty: 'Advanced', pipeline: 'optimizedOrchestrator' }
        })
      }
    ];

    // Override onSnapshot to feed our dataset regardless of ref
    vi.spyOn(firestore, 'onSnapshot').mockImplementation((_ref: any, callback: any) => {
      const snapshot = {
        forEach: (fn: (d:any)=>void) => docs.forEach(d => fn(d))
      } as any;
      callback(snapshot);
      return vi.fn();
    });

    let latest: any = null;
    const onResult = (res:any) => { latest = res; };
    render(<TestHarness jobId="job1" onResult={onResult} />);

    await waitFor(() => {
      expect(latest).toBeTruthy();
      expect(latest.samples.length).toBe(2);
    });

    // Samples: first uses aiScoresFlat (80), second falls back to aiScores (70)
    const aiValues = latest.samples.map((s:any) => s.ai).sort((a:number,b:number)=>a-b);
    expect(aiValues).toEqual([70, 80]);

    // Aggregates: byPipeline should contain both pipelines with avgAI equal to their sample
    const byPipeline = latest.aggregates.byPipeline;
    const bs = byPipeline.find((p:any) => p.pipeline === 'boardStyle');
    const oo = byPipeline.find((p:any) => p.pipeline === 'optimizedOrchestrator');
    expect(Math.round(bs.avgAI)).toBe(80);
    expect(Math.round(oo.avgAI)).toBe(70);

    // Failures proxy uses readiness; none should be major/reject so empty
    expect(latest.failures.length).toBe(0);
  });
});

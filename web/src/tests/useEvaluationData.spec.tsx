import './firebase-mocks';
import { useEffect } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { useEvaluationData } from '../hooks/useEvaluationData';
import type { EvaluationDataResult } from '../hooks/useEvaluationData';
import type { EvaluationFilters } from '../types';

// Access the firestore mock to override onSnapshot behavior
import * as firestore from 'firebase/firestore';

function TestHarness({ jobId, onResult }: { jobId: string; onResult: (res: EvaluationDataResult) => void }) {
  const filters: EvaluationFilters = { pipelines: [], topics: [], difficulties: [] };
  const result = useEvaluationData(jobId, filters);
  useEffect(() => {
    onResult(result);
  }, [result, onResult]);
  return null;
}

describe('useEvaluationData', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses aiScoresFlat for all results and aggregates by pipeline', async () => {
    interface MockDocData {
      aiScoresFlat: { overall: number; boardReadiness: string };
      latency: number;
      createdAt: number;
      testCase: { topic: string; difficulty: string; pipeline: string };
    }
    interface MockDoc {
      id: string;
      data: () => MockDocData;
    }
    const docs: MockDoc[] = [
      {
        id: 't1',
        data: () => ({
          aiScoresFlat: { overall: 80, boardReadiness: 'ready' },
          latency: 5000,
          createdAt: Date.now(),
          testCase: { topic: 'Psoriasis', difficulty: 'Basic', pipeline: 'boardStyle' },
        }),
      },
      {
        id: 't2',
        data: () => ({
          aiScoresFlat: { overall: 50, boardReadiness: 'minor_revision' },
          latency: 10000,
          createdAt: Date.now(),
          testCase: { topic: 'Melanoma diagnosis', difficulty: 'Advanced', pipeline: 'optimizedOrchestrator' },
        }),
      },
    ];

    // Ensure every mocked doc contains aiScoresFlat
    docs.forEach(d => expect(d.data().aiScoresFlat).toBeTruthy());

    // Override onSnapshot to feed our dataset regardless of ref
    vi.spyOn(firestore, 'onSnapshot').mockImplementation(
      (_ref: unknown, callback: (snap: { forEach: (fn: (d: MockDoc) => void) => void }) => void) => {
        const snapshot = {
          forEach: (fn: (d: MockDoc) => void) => docs.forEach(d => fn(d)),
        };
        callback(snapshot);
        return vi.fn();
      }
    );

    let latest: EvaluationDataResult | null = null;
    const onResult = (res: EvaluationDataResult) => { latest = res; };
    render(<TestHarness jobId="job1" onResult={onResult} />);

    await waitFor(() => {
      expect(latest).toBeTruthy();
      expect(latest.samples.length).toBe(2);
    });

    // Samples should reflect aiScoresFlat values [50, 80]
    const aiValues = latest!.samples.map(s => s.ai).sort((a, b) => a - b);
    expect(aiValues).toEqual([50, 80]);

    // Aggregates: byPipeline should contain both pipelines with avgAI equal to their sample
    const byPipeline = latest!.aggregates.byPipeline;
    const bs = byPipeline.find(p => p.pipeline === 'boardStyle')!;
    const oo = byPipeline.find(p => p.pipeline === 'optimizedOrchestrator')!;
    expect(Math.round(bs.avgAI)).toBe(80);
    expect(Math.round(oo.avgAI)).toBe(50);

    // Failures proxy uses readiness; none should be major/reject so empty
    expect(latest!.failures.length).toBe(0);
  });
});

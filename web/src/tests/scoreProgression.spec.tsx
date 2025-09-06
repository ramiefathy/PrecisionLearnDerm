import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScoreProgression } from '../components/evaluation/ScoreProgression';
import type { TestResult } from '../components/evaluation/EvaluationDashboard';

const makeResult = (pipeline: string, overall: number): TestResult => ({
  id: `${pipeline}-${overall}`,
  testCase: { pipeline, topic: 't', difficulty: 'd' },
  success: true,
  latency: 1,
  aiScoresFlat: { overall, clinicalRealism: overall, medicalAccuracy: overall, distractorQuality: overall, cueingAbsence: overall }
});

describe('ScoreProgression', () => {
  it('renders one chart per pipeline', () => {
    const results: TestResult[] = [
      makeResult('p1', 80),
      makeResult('p1', 85),
      makeResult('p2', 70)
    ];
    render(<ScoreProgression testResults={results} />);
    const canvases = screen.getAllByRole('img', { hidden: true });
    expect(canvases).toHaveLength(2);
  });
});


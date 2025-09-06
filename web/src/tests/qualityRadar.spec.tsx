import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QualityRadar } from '../components/evaluation/QualityRadar';
import type { TestResult } from '../components/evaluation/EvaluationDashboard';

const makeResult = (pipeline: string, idx: number, score: number): TestResult => ({
  id: `${pipeline}-${idx}`,
  testCase: { pipeline, topic: 't', difficulty: 'd' },
  success: true,
  latency: 1,
  aiScoresFlat: {
    overall: score,
    clinicalRealism: score,
    medicalAccuracy: score,
    distractorQuality: score,
    cueingAbsence: score
  }
});

describe('QualityRadar', () => {
  it('renders average and per-question radars for each pipeline', () => {
    const results: TestResult[] = [
      makeResult('p1', 0, 80),
      makeResult('p1', 1, 90),
      makeResult('p2', 0, 70),
      makeResult('p2', 1, 75)
    ];
    render(<QualityRadar testResults={results} />);
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(2);
  });
});


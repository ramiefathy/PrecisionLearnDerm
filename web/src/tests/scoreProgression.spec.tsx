import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScoreProgression } from '../components/evaluation/ScoreProgression';

vi.mock('react-chartjs-2', () => ({
  Line: (props: any) => <div data-testid="line-chart">{JSON.stringify(props.data)}</div>
}));

const results = [
  {
    testCase: { pipeline: 'Pipeline A' },
    aiScoresFlat: {
      overall: 80,
      clinicalRealism: 70,
      medicalAccuracy: 90,
      distractorQuality: 85,
      cueingAbsence: 75
    }
  },
  {
    testCase: { pipeline: 'Pipeline B' },
    aiScoresFlat: {
      overall: 60,
      clinicalRealism: 50,
      medicalAccuracy: 65,
      distractorQuality: 70,
      cueingAbsence: 55
    }
  },
  {
    testCase: { pipeline: 'Pipeline A' },
    aiScoresFlat: {
      overall: 90,
      clinicalRealism: 80,
      medicalAccuracy: 95,
      distractorQuality: 88,
      cueingAbsence: 82
    }
  }
];

const resultsWithEmpty = [
  ...results,
  {
    testCase: { pipeline: 'Pipeline C' },
    aiScoresFlat: { overall: null }
  }
];

describe('ScoreProgression', () => {
  it('renders one chart per pipeline', () => {
    render(<ScoreProgression results={results as any} />);
    const charts = screen.getAllByTestId('line-chart');
    expect(charts).toHaveLength(2);
    expect(screen.getByText('Pipeline A')).toBeInTheDocument();
    expect(screen.getByText('Pipeline B')).toBeInTheDocument();
  });

  it('omits pipelines without valid points', () => {
    render(<ScoreProgression results={resultsWithEmpty as any} />);
    const charts = screen.getAllByTestId('line-chart');
    expect(charts).toHaveLength(2);
    expect(screen.queryByText('Pipeline C')).not.toBeInTheDocument();
  });
});

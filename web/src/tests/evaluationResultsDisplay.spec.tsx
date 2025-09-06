import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { renderWithProviders } from './utils';
import { EvaluationResultsDisplay } from '../components/evaluation/EvaluationResultsDisplay';
import type { EvaluationResults } from '../components/evaluation/EvaluationResultsDisplay';

const mockResults: EvaluationResults = {
  byPipeline: {
    p1: {
      pipeline: 'Pipeline 1',
      successRate: 0.9,
      avgLatency: 1500,
      avgQuality: 85,
      totalTests: 10,
      successCount: 9,
      failures: []
    }
  },
  byCategory: {
    c1: {
      category: 'Category 1',
      successRate: 0.8,
      avgLatency: 1500,
      avgQuality: 80,
      testCount: 5
    }
  },
  overall: {
    totalTests: 10,
    totalSuccesses: 9,
    overallSuccessRate: 0.9,
    avgLatency: 1500,
    avgQuality: 85,
    totalDuration: 15000
  },
  errors: []
};

describe('EvaluationResultsDisplay', () => {
  it('renders evaluation header', () => {
    renderWithProviders(
      <div style={{ width: 1000, height: 500 }}>
        <EvaluationResultsDisplay results={mockResults} jobId="job" />
      </div>
    );
    expect(screen.getByText(/Evaluation Results/i)).toBeInTheDocument();
  });

  it('renders recommendation score normalized to 100', () => {
    renderWithProviders(
      <div style={{ width: 1000, height: 500 }}>
        <EvaluationResultsDisplay results={mockResults} jobId="job" />
      </div>
    );
    expect(screen.getByText(/highest score of 90.0\/100/i)).toBeInTheDocument();
  });

  it('displays partial result details when present', async () => {
    const resultsWithError: EvaluationResults = {
      ...mockResults,
      errors: [
        {
          timestamp: new Date().toISOString(),
          pipeline: 'Pipeline 1',
          topic: 'Topic 1',
          difficulty: 'Basic',
          error: { message: 'Failed' },
          context: { attemptNumber: 1, partialResult: { testIndex: 0 } }
        }
      ]
    };

    renderWithProviders(
      <div style={{ width: 1000, height: 500 }}>
        <EvaluationResultsDisplay results={resultsWithError} jobId="job" />
      </div>
    );

    await userEvent.click(screen.getByRole('tab', { name: /Error Analysis/i }));
    const summaryButton = screen.getByText('Topic 1').closest('button');
    if (!summaryButton) throw new Error('Accordion summary not found');
    await userEvent.click(summaryButton);
    expect(screen.getByText(/"testIndex": 0/)).toBeInTheDocument();
  });
});

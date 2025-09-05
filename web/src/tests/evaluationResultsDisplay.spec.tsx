/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EvaluationResultsDisplay } from '../components/evaluation/EvaluationResultsDisplay';

const mockResults = {
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
  it('renders separate charts for success, latency, and quality', () => {
    render(
      <div style={{ width: 1000, height: 500 }}>
        <EvaluationResultsDisplay results={mockResults as any} jobId="job" />
      </div>
    );
    expect(screen.getByText('Success Rate by Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Average Latency by Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Average Quality by Pipeline')).toBeInTheDocument();
  });
});

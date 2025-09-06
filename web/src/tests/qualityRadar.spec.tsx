import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QualityRadar } from '../components/evaluation/QualityRadar';

vi.mock('react-chartjs-2', () => ({
  Radar: (props: any) => <div data-testid="radar-chart">{JSON.stringify(props.data)}</div>
}));

const results = [
  {
    testCase: { pipeline: 'Pipeline A' },
    aiScoresFlat: {
      clinicalRealism: 80,
      medicalAccuracy: 90,
      distractorQuality: 85,
      cueingAbsence: 70
    }
  },
  {
    testCase: { pipeline: 'Pipeline A' },
    aiScoresFlat: {
      clinicalRealism: 60,
      medicalAccuracy: 70,
      distractorQuality: 65,
      cueingAbsence: 55
    }
  },
  {
    testCase: { pipeline: 'Pipeline B' },
    aiScoresFlat: {
      clinicalRealism: 75,
      medicalAccuracy: 80,
      distractorQuality: 78,
      cueingAbsence: 72
    }
  }
];

describe('QualityRadar', () => {
  it('renders radars and sliders per pipeline', () => {
    render(<QualityRadar results={results as any} />);
    const radars = screen.getAllByTestId('radar-chart');
    expect(radars.length).toBe(4);
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBe(2);
    expect(screen.getByText('Pipeline A')).toBeInTheDocument();
    expect(screen.getByText('Pipeline B')).toBeInTheDocument();
  });

  it('initializes indices for new pipelines while preserving existing values', () => {
    const initial = results.slice(0, 2);
    const { rerender } = render(<QualityRadar results={initial as any} />);

    const sliderA = screen.getByRole('slider');
    fireEvent.change(sliderA, { target: { value: 1 } });
    expect(sliderA).toHaveAttribute('aria-valuenow', '1');

    rerender(<QualityRadar results={results as any} />);
    const sliders = screen.getAllByRole('slider');
    expect(sliders[0]).toHaveAttribute('aria-valuenow', '1');
    expect(sliders[1]).toHaveAttribute('aria-valuenow', '0');
  });
});

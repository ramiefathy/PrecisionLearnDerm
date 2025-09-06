import React, { useState, useMemo } from 'react';
import { Box, Grid, Slider, Typography } from '@mui/material';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface TestResult {
  testCase: { pipeline: string };
  aiScoresFlat?: {
    clinicalRealism?: number | null;
    medicalAccuracy?: number | null;
    distractorQuality?: number | null;
    cueingAbsence?: number | null;
  };
}

const metrics = ['clinicalRealism', 'medicalAccuracy', 'distractorQuality', 'cueingAbsence'] as const;
const labels = ['Clinical Realism', 'Medical Accuracy', 'Distractor Quality', 'Cueing Absence'];

export interface QualityRadarProps {
  results: TestResult[];
}

export const QualityRadar: React.FC<QualityRadarProps> = ({ results }) => {
  const pipelines = Array.from(new Set(results.map(r => r.testCase.pipeline)));
  const [indices, setIndices] = useState<Record<string, number>>(
    Object.fromEntries(pipelines.map(p => [p, 0]))
  );

  const radarOptions: ChartOptions<'radar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: { r: { beginAtZero: true, max: 100 } }
    }),
    []
  );

  const renderAverageRadar = (pipeline: string) => {
    const valid = results
      .filter(r => r.testCase.pipeline === pipeline)
      .filter(r => metrics.every(m => typeof r.aiScoresFlat?.[m] === 'number')) as TestResult[];
    if (valid.length === 0) return null;

    const avgValues = metrics.map(m =>
      valid.reduce((sum, r) => sum + (r.aiScoresFlat![m] as number), 0) / valid.length
    );

    const data = {
      labels,
      datasets: [
        {
          label: pipeline,
          data: avgValues,
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)'
        }
      ]
    };

    return (
      <Box key={pipeline} sx={{ mb: 4, height: 300 }}>
        <Typography variant="subtitle1" gutterBottom>
          {pipeline}
        </Typography>
        <Radar data={data} options={radarOptions} />
      </Box>
    );
  };

  const renderQuestionRadar = (pipeline: string) => {
    const valid = results
      .filter(r => r.testCase.pipeline === pipeline)
      .filter(r => metrics.every(m => typeof r.aiScoresFlat?.[m] === 'number')) as TestResult[];
    if (valid.length === 0) return null;

    const idx = Math.min(indices[pipeline] ?? 0, valid.length - 1);
    const q = valid[idx];

    const data = {
      labels,
      datasets: [
        {
          label: `${pipeline} Q${idx + 1}`,
          data: metrics.map(m => q.aiScoresFlat![m] as number),
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)'
        }
      ]
    };

    return (
      <Box key={pipeline} sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          {pipeline} - Question {idx + 1}
        </Typography>
        <Slider
          value={idx}
          min={0}
          max={valid.length - 1}
          step={1}
          marks
          onChange={(_, v) => setIndices({ ...indices, [pipeline]: v as number })}
          sx={{ mb: 2 }}
        />
        <Box sx={{ height: 300 }}>
          <Radar data={data} options={radarOptions} />
        </Box>
      </Box>
    );
  };

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        {pipelines.map(p => renderAverageRadar(p))}
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        {pipelines.map(p => renderQuestionRadar(p))}
      </Grid>
    </Grid>
  );
};

export default QualityRadar;

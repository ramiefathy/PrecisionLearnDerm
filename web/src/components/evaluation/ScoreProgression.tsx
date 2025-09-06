import React, { useState } from 'react';
import { Box, FormControl, InputLabel, MenuItem, Select, Typography } from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface TestResult {
  testCase: { pipeline: string };
  aiScoresFlat?: {
    overall?: number | null;
    clinicalRealism?: number | null;
    medicalAccuracy?: number | null;
    distractorQuality?: number | null;
    cueingAbsence?: number | null;
  };
}

type Metric =
  | 'overall'
  | 'clinicalRealism'
  | 'medicalAccuracy'
  | 'distractorQuality'
  | 'cueingAbsence';

const metricLabels: Record<Metric, string> = {
  overall: 'AI Score',
  clinicalRealism: 'Clinical Realism',
  medicalAccuracy: 'Medical Accuracy',
  distractorQuality: 'Distractor Quality',
  cueingAbsence: 'Cueing Absence'
};

export interface ScoreProgressionProps {
  results: TestResult[];
}

export const ScoreProgression: React.FC<ScoreProgressionProps> = ({ results }) => {
  const [metric, setMetric] = useState<Metric>('overall');
  const pipelines = Array.from(new Set(results.map(r => r.testCase.pipeline)));

  return (
    <Box>
      <FormControl size="small" sx={{ mb: 2, minWidth: 200 }}>
        <InputLabel id="metric-select-label">Metric</InputLabel>
        <Select
          labelId="metric-select-label"
          label="Metric"
          value={metric}
          onChange={e => setMetric(e.target.value as Metric)}
        >
          {Object.entries(metricLabels).map(([key, label]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {pipelines.map(pipeline => {
        const pipelineResults = results.filter(r => r.testCase.pipeline === pipeline);
        const points = pipelineResults
          .map((r, idx) => ({ x: idx + 1, y: r.aiScoresFlat?.[metric] ?? null }))
          .filter(pt => pt.y != null) as { x: number; y: number }[];

        if (points.length === 0) return null;

        const data = {
          labels: points.map(pt => pt.x),
          datasets: [
            {
              label: metricLabels[metric],
              data: points.map(pt => pt.y),
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              tension: 0.1
            }
          ]
        };

        const options = {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              title: { display: true, text: 'Question #' }
            },
            y: {
              beginAtZero: true,
              max: 100
            }
          }
        };

        return (
          <Box key={pipeline} sx={{ mb: 4 }}>
            <Typography variant="subtitle1" gutterBottom>
              {pipeline}
            </Typography>
            <Box sx={{ height: 300 }}>
              <Line data={data} options={options} />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export default ScoreProgression;

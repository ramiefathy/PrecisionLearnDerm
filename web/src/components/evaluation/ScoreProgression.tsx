import React, { useMemo, useState } from 'react';
import { Box, MenuItem, Select, Typography } from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

import type { TestResult } from './EvaluationDashboard';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

interface ScoreProgressionProps {
  testResults: TestResult[];
}

const metrics = [
  { key: 'overall', label: 'AI Score' },
  { key: 'clinicalRealism', label: 'Clinical Realism' },
  { key: 'medicalAccuracy', label: 'Medical Accuracy' },
  { key: 'distractorQuality', label: 'Distractor Quality' },
  { key: 'cueingAbsence', label: 'Cueing Absence' }
] as const;

export const ScoreProgression: React.FC<ScoreProgressionProps> = ({ testResults }) => {
  const [metric, setMetric] = useState<typeof metrics[number]['key']>('overall');

  const pipelines = useMemo(
    () => Array.from(new Set(testResults.map(r => r.testCase.pipeline))),
    [testResults]
  );

  const colors = ['rgb(75,192,192)', 'rgb(255,99,132)', 'rgb(54,162,235)'];

  const charts = useMemo(() => {
    return pipelines.map((p, idx) => {
      const prs = testResults.filter(r => r.testCase.pipeline === p);
      const dataPoints = prs
        .map(r => r.aiScoresFlat?.[metric] ?? null)
        .filter((v): v is number => v != null);
      if (dataPoints.length === 0) return null;
      const labels = dataPoints.map((_, i) => `${i + 1}`);
      const data = {
        labels,
        datasets: [
          {
            label: metrics.find(m => m.key === metric)?.label,
            data: dataPoints,
            borderColor: colors[idx % colors.length],
            backgroundColor: 'rgba(0,0,0,0)',
            tension: 0.1
          }
        ]
      };
      return { pipeline: p, data, color: colors[idx % colors.length] };
    });
  }, [pipelines, testResults, metric]);

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Select
          size="small"
          value={metric}
          onChange={e => setMetric(e.target.value as typeof metric)}
        >
          {metrics.map(m => (
            <MenuItem key={m.key} value={m.key}>
              {m.label}
            </MenuItem>
          ))}
        </Select>
      </Box>
      {charts.map((c, idx) =>
        c ? (
          <Box key={c.pipeline} sx={{ mb: 4 }}>
            <Typography variant="subtitle1" gutterBottom>
              {c.pipeline}
            </Typography>
            <Box sx={{ height: 300 }}>
              <Line
                data={c.data}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: { beginAtZero: true, max: 100 },
                    x: { title: { display: true, text: 'Question #' } }
                  }
                }}
              />
            </Box>
          </Box>
        ) : null
      )}
    </Box>
  );
};


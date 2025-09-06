import React, { useMemo, useState } from 'react';
import { Box, Slider, Typography, Grid } from '@mui/material';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip as ChartTooltip,
  Legend
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

import type { TestResult } from './EvaluationDashboard';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, ChartTooltip, Legend);

interface QualityRadarProps {
  testResults: TestResult[];
}

const dimensions = [
  { key: 'clinicalRealism', label: 'Clinical Realism' },
  { key: 'medicalAccuracy', label: 'Medical Accuracy' },
  { key: 'distractorQuality', label: 'Distractor Quality' },
  { key: 'cueingAbsence', label: 'Cueing Absence' }
] as const;

export const QualityRadar: React.FC<QualityRadarProps> = ({ testResults }) => {
  const pipelines = useMemo(
    () => Array.from(new Set(testResults.map(r => r.testCase.pipeline))),
    [testResults]
  );

  const validResults = useMemo(() => {
    return pipelines.map(p => {
      const prs = testResults.filter(r => r.testCase.pipeline === p);
      const filtered = prs.filter(r =>
        dimensions.every(d => r.aiScoresFlat?.[d.key] != null)
      );
      return { pipeline: p, results: filtered };
    });
  }, [pipelines, testResults]);

  const [indices, setIndices] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    validResults.forEach(v => {
      init[v.pipeline] = 0;
    });
    return init;
  });

  const avgData = (res: TestResult[]) => {
    const avg = (key: typeof dimensions[number]['key']) =>
      res.reduce((sum, r) => sum + (r.aiScoresFlat![key]! || 0), 0) / res.length;
    return dimensions.map(d => avg(d.key));
  };

  const radarData = (scores: number[]) => ({
    labels: dimensions.map(d => d.label),
    datasets: [
      {
        label: 'Score',
        data: scores,
        borderColor: 'rgb(75,192,192)',
        backgroundColor: 'rgba(75,192,192,0.2)',
        pointBackgroundColor: 'rgb(75,192,192)'
      }
    ]
  });

  return (
    <Grid container spacing={2}>
      {validResults.map(({ pipeline, results }) => {
        if (results.length === 0) return null;
        const idx = indices[pipeline] ?? 0;
        const current = results[idx];
        return (
          <React.Fragment key={pipeline}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="subtitle1" gutterBottom>
                {pipeline} Average
              </Typography>
              <Radar
                data={radarData(avgData(results))}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: { r: { beginAtZero: true, max: 100 } }
                }}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="subtitle1" gutterBottom>
                {pipeline} Q{idx + 1}
              </Typography>
              <Radar
                data={radarData(dimensions.map(d => current.aiScoresFlat![d.key]!))}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: { r: { beginAtZero: true, max: 100 } }
                }}
              />
              {results.length > 1 && (
                <Box sx={{ px: 2 }}>
                  <Slider
                    min={0}
                    max={results.length - 1}
                    value={idx}
                    onChange={(_, v) =>
                      setIndices(prev => ({ ...prev, [pipeline]: v as number }))
                    }
                    marks
                  />
                </Box>
              )}
            </Grid>
          </React.Fragment>
        );
      })}
    </Grid>
  );
};


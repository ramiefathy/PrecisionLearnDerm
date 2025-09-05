import { Card, CardContent, Grid, Typography } from '@mui/material';
import type { PipelineAggregate } from '../../types';

export function OverviewKPIs({ overall }: { overall: PipelineAggregate | null }) {
  const totalTests = overall?.testCount;
  const avgAI = overall?.avgAI;
  const avgLatency = overall?.avgLatency;
  const successRate =
    overall && overall.testCount > 0
      ? (((overall.readiness?.ready ?? 0) + (overall.readiness?.minor ?? 0)) / overall.testCount) * 100
      : undefined;

  return (
    <Grid container spacing={2} sx={{ mb: 2 }}>
      <Grid size={{ xs: 12, md: 3 }}>
        <Card><CardContent>
          <Typography variant="subtitle2" color="text.secondary">Success Rate</Typography>
          <Typography variant="h4">{successRate !== undefined ? `${successRate.toFixed(1)}%` : 'N/A'}</Typography>
          <Typography variant="caption" color="text.secondary">ready + minor / total</Typography>
        </CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <Card><CardContent>
          <Typography variant="subtitle2" color="text.secondary">Avg AI Score</Typography>
          <Typography variant="h4">{avgAI !== undefined ? `${avgAI.toFixed(1)}%` : 'N/A'}</Typography>
          <Typography variant="caption" color="text.secondary">mean over tests</Typography>
        </CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <Card><CardContent>
          <Typography variant="subtitle2" color="text.secondary">Avg Latency</Typography>
          <Typography variant="h4">{avgLatency !== undefined ? `${(avgLatency / 1000).toFixed(1)}s` : 'N/A'}</Typography>
          <Typography variant="caption" color="text.secondary">per question</Typography>
        </CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <Card><CardContent>
          <Typography variant="subtitle2" color="text.secondary">Total Tests</Typography>
          <Typography variant="h4">{totalTests !== undefined ? totalTests : 'N/A'}</Typography>
          <Typography variant="caption" color="text.secondary">across pipelines</Typography>
        </CardContent></Card>
      </Grid>
    </Grid>
  );
}

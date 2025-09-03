import { Card, CardContent, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import type { PipelineAggregate } from '../../types';

export function OverviewKPIs({ overall }: { overall: PipelineAggregate | null }) {
  const totalTests = overall?.testCount ?? 0;
  const avgAI = overall ? overall.avgAI : 0;
  const avgLatency = overall ? overall.avgLatency : 0;
  const successRate = overall ? ((overall.readiness.ready + overall.readiness.minor) / Math.max(1, totalTests)) * 100 : 0;

  return (
    <Grid container spacing={2} sx={{ mb: 2 }}>
      <Grid size={{ xs: 12, md: 3 }}>
        <Card><CardContent>
          <Typography variant="subtitle2" color="text.secondary">Success Rate</Typography>
          <Typography variant="h4">{successRate.toFixed(1)}%</Typography>
          <Typography variant="caption" color="text.secondary">ready + minor / total</Typography>
        </CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <Card><CardContent>
          <Typography variant="subtitle2" color="text.secondary">Avg AI Score</Typography>
          <Typography variant="h4">{avgAI.toFixed(1)}%</Typography>
          <Typography variant="caption" color="text.secondary">mean over tests</Typography>
        </CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <Card><CardContent>
          <Typography variant="subtitle2" color="text.secondary">Avg Latency</Typography>
          <Typography variant="h4">{(avgLatency/1000).toFixed(1)}s</Typography>
          <Typography variant="caption" color="text.secondary">per question</Typography>
        </CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <Card><CardContent>
          <Typography variant="subtitle2" color="text.secondary">Total Tests</Typography>
          <Typography variant="h4">{totalTests}</Typography>
          <Typography variant="caption" color="text.secondary">across pipelines</Typography>
        </CardContent></Card>
      </Grid>
    </Grid>
  );
}

import { Card, CardContent, List, ListItem, ListItemButton, ListItemText, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import type { ScoreSample } from '../../types';

export function OutliersFailures({ worstAI, slowest, failures, onOpen }:{ worstAI: ScoreSample[]; slowest: ScoreSample[]; failures: ScoreSample[]; onOpen: (s: ScoreSample)=>void }){
  const renderList = (items: ScoreSample[], formatter: (s:ScoreSample)=>string) => (
    <List dense>
      {items.map(s => (
        <ListItem key={s.id} disablePadding>
          <ListItemButton onClick={()=>onOpen(s)}>
            <ListItemText primary={formatter(s)} secondary={`${s.pipeline} • ${s.topic} (${s.difficulty})`} />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Outliers & Failures</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2">Lowest AI Scores</Typography>
            {renderList(worstAI, s=>`AI ${s.ai.toFixed(1)}% • ${(s.latency/1000).toFixed(1)}s`)}
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2">Slowest Latency</Typography>
            {renderList(slowest, s=>`${(s.latency/1000).toFixed(1)}s • AI ${s.ai.toFixed(1)}%`)}
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2">Failures (Major/Reject)</Typography>
            {renderList(failures, s=>`${s.ready ?? 'N/A'} • AI ${s.ai.toFixed(1)}% • ${(s.latency/1000).toFixed(1)}s`)}
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

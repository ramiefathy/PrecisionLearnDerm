import { Box, Card, CardContent, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { Metric, TopicDifficultyCell } from '../../types';
import { useMemo, useState } from 'react';

export function TopicDifficultyHeatmap({ cells }:{ cells: TopicDifficultyCell[] }){
  const [metric, setMetric] = useState<Metric>('successRate');
  const difficulties = ['Basic','Advanced','Very Difficult'];
  const topics = useMemo(()=> Array.from(new Set(cells.map(c=>c.topic))).sort(), [cells]);
  const value = (c: TopicDifficultyCell) => metric==='successRate' ? (c.successRate*100) : metric==='ai' ? (c.ai ?? 0) : c.latency;

  const cellMap = new Map<string, TopicDifficultyCell>();
  cells.forEach(c=> cellMap.set(`${c.topic}||${c.difficulty}`, c));

  const colorFor = (v:number) => {
    if (metric === 'latency') {
      const t = Math.max(0, Math.min(1, 1 - (v/30000)));
      return `hsl(${120*t} 70% 50% / 0.85)`;
    } else {
      const t = Math.max(0, Math.min(1, (v/100)));
      return `hsl(${120*t} 70% 50% / 0.85)`;
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Performance Heatmap</Typography>
        <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_,v)=> v && setMetric(v)} sx={{ mb: 2 }}>
          <ToggleButton value="successRate">Success Rate</ToggleButton>
          <ToggleButton value="ai">AI Score</ToggleButton>
          <ToggleButton value="latency">Latency</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: `180px repeat(${difficulties.length}, 120px)`, gap: 1 }}>
            <Box />
            {difficulties.map(d => (
              <Box key={d} sx={{ fontWeight: 600, textAlign: 'center' }}>{d}</Box>
            ))}
            {topics.map(topic => (
              <>
                <Box key={`${topic}-label`} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{topic}</Box>
                {difficulties.map(d => {
                  const c = cellMap.get(`${topic}||${d}`);
                  const v = c ? value(c) : 0;
                  return (
                    <Box key={`${topic}-${d}`} title={`${topic} • ${d}: ${metric==='latency'? (v/1000).toFixed(1)+'s' : v.toFixed(1)+'%'}`}
                      sx={{ height: 32, borderRadius: 1, backgroundColor: colorFor(v), display:'grid', placeItems:'center', color:'#000', fontSize:'0.75rem' }}>
                      {c ? (metric==='latency'? (v/1000).toFixed(1)+'s' : Math.round(v)+'%') : '—'}
                    </Box>
                  );
                })}
              </>
            ))}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

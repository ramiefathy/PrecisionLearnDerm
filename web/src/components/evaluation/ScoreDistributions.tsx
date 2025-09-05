import { Card, CardContent, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import type { PipelineId, ScoreSample } from '../../types';
import { useMemo, useState } from 'react';

function makeBins(metric: 'ai'|'latency') {
  if (metric === 'ai') {
    // 10 bins: 0-10, ..., 90-100
    const edges = Array.from({length:11}, (_,i)=> i*10);
    const labels = edges.slice(0,10).map((e,i)=> `${e}-${edges[i+1]}`);
    return { edges, labels };
  } else {
    // Latency bins in ms
    const edges = [0, 2000, 5000, 10000, 20000, 60000];
    const labels = ['0-2s','2-5s','5-10s','10-20s','20-60s'];
    return { edges, labels };
  }
}

export function ScoreDistributions({ samples }:{ samples: ScoreSample[] }){
  const [metric, setMetric] = useState<'ai'|'latency'>('ai');
  const { edges, labels } = useMemo(()=> makeBins(metric), [metric]);

  const byPipelineCounts = useMemo(() => {
    const map = new Map<PipelineId, number[]>();
    const binIndex = (val:number) => {
      for (let i=0; i<edges.length-1; i++) if (val >= edges[i] && val < edges[i+1]) return i;
      return edges.length-2; // last bin fallback
    };
    samples.forEach(s => {
      const val = metric==='ai' ? s.ai : s.latency;
      if (typeof val !== 'number' || !Number.isFinite(val)) return;
      if (!map.has(s.pipeline)) map.set(s.pipeline, Array(labels.length).fill(0));
      const idx = binIndex(val);
      map.get(s.pipeline)![idx] += 1;
    });
    return map;
  }, [samples, metric, edges, labels.length]);

  const datasets = Array.from(byPipelineCounts.entries()).map(([pipeline, counts], i) => ({
    label: String(pipeline),
    data: counts,
    backgroundColor: `hsl(${(i*97)%360} 70% 55% / 0.6)`,
    borderColor: `hsl(${(i*97)%360} 70% 45%)`
  }));

  const chartData:any = { labels, datasets };
  const options:any = {
    responsive:true,
    plugins:{ legend:{ position:'bottom' }, title:{ display:true, text: metric==='ai'?'AI Score Histogram by Pipeline':'Latency Histogram by Pipeline' } },
    scales:{ y:{ beginAtZero:true, title:{ display:true, text:'Count' } } }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Distributions</Typography>
        <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_,v)=> v && setMetric(v)} sx={{ mb: 2 }}>
          <ToggleButton value="ai">AI</ToggleButton>
          <ToggleButton value="latency">Latency</ToggleButton>
        </ToggleButtonGroup>
        <div style={{ height: 360 }}>
          <Bar data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  );
}

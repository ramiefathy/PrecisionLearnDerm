import { Card, CardContent, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Chart as ChartJSComponent } from 'react-chartjs-2';
import type { PipelineId, ScoreSample } from '../../types';
import { useMemo, useState } from 'react';

export function ScoreDistributions({ samples }:{ samples: ScoreSample[] }){
  const [metric, setMetric] = useState<'ai'|'latency'>('ai');
  const byPipeline = useMemo(() => {
    const m = new Map<PipelineId, number[]>();
    samples.forEach(s => {
      if (!m.has(s.pipeline)) m.set(s.pipeline, []);
      m.get(s.pipeline)!.push(metric === 'ai' ? s.ai : s.latency);
    });
    return m;
  }, [samples, metric]);

  const labels = Array.from(byPipeline.keys());
  const data = Array.from(byPipeline.values()).map(arr => arr.filter(n=>Number.isFinite(n)));
  const colors = labels.map((_,i)=>`hsl(${(i*97)%360} 70% 50%)`);

  const chartData:any = {
    labels,
    datasets: [{
      label: metric === 'ai' ? 'AI Score (%)' : 'Latency (ms)',
      data,
      backgroundColor: colors,
      borderColor: colors,
      outlierColor: colors,
      padding: 10,
      itemRadius: 2,
      type: 'boxplot'
    }]
  };

  const options:any = {
    responsive:true,
    plugins:{ legend:{ display:false }, title:{ display:true, text: metric==='ai'?'AI Score Distribution by Pipeline':'Latency Distribution by Pipeline' } },
    scales:{ y:{ beginAtZero:true, title:{ display:true, text: metric==='ai'?'AI (%)':'Latency (ms)'} } }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Distributions</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={metric}
          onChange={(_,v)=> v && setMetric(v)}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="ai">AI</ToggleButton>
          <ToggleButton value="latency">Latency</ToggleButton>
        </ToggleButtonGroup>
        <ChartJSComponent type='boxplot' data={chartData} options={options} />
      </CardContent>
    </Card>
  );
}


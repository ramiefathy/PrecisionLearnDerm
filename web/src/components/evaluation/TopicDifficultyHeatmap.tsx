import { Card, CardContent, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Chart as ChartJSComponent } from 'react-chartjs-2';
import type { Metric, TopicDifficultyCell } from '../../types';
import { useMemo, useState } from 'react';

export function TopicDifficultyHeatmap({ cells }:{ cells: TopicDifficultyCell[] }){
  const [metric, setMetric] = useState<Metric>('successRate');
  const difficulties = ['Basic','Advanced','Very Difficult'];
  const topics = useMemo(()=> Array.from(new Set(cells.map(c=>c.topic))).sort(), [cells]);
  const value = (c: TopicDifficultyCell) => metric==='successRate' ? (c.successRate*100) : metric==='ai' ? c.ai : c.latency;

  const dataPoints = cells.map(c => ({ x: difficulties.indexOf(c.difficulty), y: topics.indexOf(c.topic), v: value(c) }));
  const chartData:any = {
    datasets: [{
      label: 'Heatmap',
      data: dataPoints,
      backgroundColor: (ctx:any) => {
        const v = ctx.raw.v || 0;
        if (metric === 'latency') {
          // lower is better: green to red
          const t = Math.max(0, Math.min(1, 1 - (v/30000)));
          return `hsl(${120*t} 70% 50% / 0.85)`;
        } else {
          // higher is better: red to green
          const t = Math.max(0, Math.min(1, (v/(metric==='ai'?100:100))));
          return `hsl(${120*t} 70% 50% / 0.85)`;
        }
      },
      width: ({chart}:any) => (chart.chartArea?.width || 0) / difficulties.length - 2,
      height: ({chart}:any) => (chart.chartArea?.height || 0) / Math.max(1, topics.length) - 2,
      borderWidth: 1,
      type: 'matrix'
    }]
  };
  const options:any = {
    responsive:true,
    plugins:{ legend:{ display:false }, tooltip:{ callbacks: { label:(ctx:any)=> {
      const x = ctx.raw.x; const y = ctx.raw.y; const topic = topics[y]; const diff = difficulties[x];
      const v = ctx.raw.v;
      return `${topic} • ${diff}: ${metric==='latency'? (v/1000).toFixed(1)+'s' : v.toFixed(1)+'%'}`;
    } } }, title:{ display:true, text:`Topic × Difficulty (${metric})` } },
    scales:{
      x:{ ticks:{ callback:(val:any)=> difficulties[val] } },
      y:{ ticks:{ callback:(val:any)=> topics[val] } }
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
        <ChartJSComponent type='matrix' data={chartData} options={options} />
      </CardContent>
    </Card>
  );
}


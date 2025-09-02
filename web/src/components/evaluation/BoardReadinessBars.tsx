import { Card, CardContent, Typography } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import type { PipelineAggregate } from '../../types';

export function BoardReadinessBars({ data }:{ data: PipelineAggregate[] }) {
  const labels = data.map(d => d.pipeline);
  const totals = data.map(d => d.readiness.ready + d.readiness.minor + d.readiness.major + d.readiness.reject || 1);
  const toPct = (v:number, i:number) => (v/Math.max(1, totals[i]))*100;
  const chartData = {
    labels,
    datasets: [
      { label:'Ready', data: data.map((d,i)=> toPct(d.readiness.ready, i)), backgroundColor: 'rgba(76,175,80,0.8)' },
      { label:'Minor', data: data.map((d,i)=> toPct(d.readiness.minor, i)), backgroundColor: 'rgba(33,150,243,0.8)' },
      { label:'Major', data: data.map((d,i)=> toPct(d.readiness.major, i)), backgroundColor: 'rgba(255,193,7,0.8)' },
      { label:'Reject', data: data.map((d,i)=> toPct(d.readiness.reject, i)), backgroundColor: 'rgba(244,67,54,0.8)' }
    ]
  };
  const options:any = {
    responsive:true,
    plugins:{ legend:{ position:'bottom' }, tooltip:{ callbacks:{ label:(ctx:any)=> `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } }},
    scales:{ x:{ stacked:true }, y:{ stacked:true, max:100, title:{ display:true, text:'Percent' } } }
  };
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Board Readiness Distribution</Typography>
        <Bar data={chartData} options={options} />
      </CardContent>
    </Card>
  );
}


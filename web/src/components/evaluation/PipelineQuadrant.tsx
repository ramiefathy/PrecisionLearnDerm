import { Card, CardContent, Typography } from '@mui/material';
import { Bubble } from 'react-chartjs-2';
import type { PipelineAggregate } from '../../types';

export function PipelineQuadrant({ data, onSelect }:{ data: PipelineAggregate[]; onSelect?: (pipeline: string)=>void }) {
  const chartData = {
    datasets: data.map((p, idx) => ({
      label: p.pipeline,
      data: [{ x: p.avgLatency, y: p.avgAI, r: Math.max(4, Math.sqrt(p.testCount)) }],
      backgroundColor: `hsl(${(idx*97)%360} 70% 55% / 0.5)`,
      borderColor: `hsl(${(idx*97)%360} 70% 45%)`
    }))
  };
  const options: any = {
    responsive: true,
    scales: {
      x: { title: { display:true, text:'Avg Latency (ms)' } },
      y: { title: { display:true, text:'Avg AI Score (%)' }, min:0, max:100 }
    },
    plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: {
      label: (ctx:any) => `${ctx.dataset.label}: AI ${ctx.raw.y.toFixed(1)}% • Lat ${(ctx.raw.x/1000).toFixed(1)}s • n≈${Math.round(Math.pow(ctx.raw.r,2))}`
    } } },
    onClick: (_evt:any, elems:any[]) => {
      if (!onSelect || !elems?.length) return;
      const dsIdx = elems[0].datasetIndex;
      const pl = data[dsIdx]?.pipeline;
      if (pl) onSelect(pl);
    }
  };
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Quality vs Latency</Typography>
        <Bubble data={chartData} options={options} />
      </CardContent>
    </Card>
  );
}


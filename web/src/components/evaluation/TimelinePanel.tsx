import { Card, CardContent, Typography } from '@mui/material';
import { Line } from 'react-chartjs-2';

export function TimelinePanel({ aiSeries, latencySeries }:{ aiSeries: { x:number; y:number }[]; latencySeries: { x:number; y:number }[] }){
  const labels = aiSeries.map(p=> new Date(p.x).toLocaleTimeString());
  const chartData = {
    labels,
    datasets: [
      { label:'AI (%)', data: aiSeries.map(p=>p.y), yAxisID: 'y1', borderColor: 'rgb(75,192,192)', backgroundColor:'rgba(75,192,192,0.2)' },
      { label:'Latency (s)', data: latencySeries.map(p=>p.y/1000), yAxisID: 'y2', borderColor: 'rgb(255,99,132)', backgroundColor:'rgba(255,99,132,0.2)' }
    ]
  } as any;
  const options:any = {
    responsive:true,
    plugins:{ legend:{ position:'bottom' } },
    scales:{ y1:{ type:'linear', position:'left', min:0, max:100, title:{ display:true, text:'AI (%)' } }, y2:{ type:'linear', position:'right', title:{ display:true, text:'Latency (s)' } } },
    interaction: { mode:'index', intersect:false },
    maintainAspectRatio:false
  };
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Timeline</Typography>
        <div style={{ height: 400 }}>
          <Line data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  );
}

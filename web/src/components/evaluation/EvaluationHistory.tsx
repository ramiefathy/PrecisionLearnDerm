import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Card, CardContent, Typography, Grid } from '@mui/material';
import { Line } from 'react-chartjs-2';

interface SummaryDoc {
  id: string;
  createdAt?: any;
  overall?: { avgLatency: number; avgQuality: number; overallSuccessRate: number; totalTests: number };
  byPipeline?: Record<string, { avgAI:number; avgLatency:number; testCount:number }>;
}

export function EvaluationHistory({ max=10 }:{ max?: number }){
  const [summaries, setSummaries] = useState<SummaryDoc[]>([]);
  useEffect(()=>{
    const ref = collection(db, 'evaluationSummaries');
    const q = query(ref, orderBy('createdAt','desc'), limit(max));
    const unsub = onSnapshot(q, snap => {
      const arr: SummaryDoc[] = [];
      snap.forEach(doc=> arr.push({ id: doc.id, ...doc.data() } as any));
      setSummaries(arr.reverse());
    });
    return ()=>unsub();
  },[max]);

  const labels = summaries.map(s=> new Date(s.createdAt?.toMillis?.() ?? Date.now()).toLocaleString());
  const aiSeries = summaries.map(s=> (s.overall?.avgQuality ?? 0));
  const latencySeries = summaries.map(s=> (s.overall?.avgLatency ?? 0)/1000);
  const successSeries = summaries.map(s=> (s.overall?.overallSuccessRate ?? 0)*100);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card><CardContent>
          <Typography variant='subtitle1' gutterBottom>Avg AI Score (history)</Typography>
          <Line data={{ labels, datasets:[{ label:'AI (%)', data: aiSeries, borderColor:'rgb(75,192,192)'}] }} options={{ responsive:true, plugins:{ legend:{ display:false } } }} />
        </CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card><CardContent>
          <Typography variant='subtitle1' gutterBottom>Avg Latency (history)</Typography>
          <Line data={{ labels, datasets:[{ label:'Latency (s)', data: latencySeries, borderColor:'rgb(255,99,132)'}] }} options={{ responsive:true, plugins:{ legend:{ display:false } } }} />
        </CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card><CardContent>
          <Typography variant='subtitle1' gutterBottom>Success Rate (history)</Typography>
          <Line data={{ labels, datasets:[{ label:'Success (%)', data: successSeries, borderColor:'rgb(54,162,235)'}] }} options={{ responsive:true, plugins:{ legend:{ display:false } } }} />
        </CardContent></Card>
      </Grid>
    </Grid>
  );
}

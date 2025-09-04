import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit as fsLimit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { EvaluationFilters, PipelineAggregate, PipelineId, ScoreSample, TopicDifficultyCell } from '../types';

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
}

export interface EvaluationDataResult {
  samples: ScoreSample[];
  aggregates: { byPipeline: PipelineAggregate[]; topicDifficulty: TopicDifficultyCell[]; overall: PipelineAggregate | null };
  outliers: { worstAI: ScoreSample[]; slowest: ScoreSample[] };
  failures: ScoreSample[];
}

export function useEvaluationData(jobId: string, filters: EvaluationFilters): EvaluationDataResult {
  const [samples, setSamples] = useState<ScoreSample[]>([]);
  const MAX_RESULTS = 1000;

  useEffect(() => {
    if (!jobId) return;
    const ref = collection(db, 'evaluationJobs', jobId, 'testResults');
    const q = query(ref, orderBy('createdAt', 'asc'), fsLimit(MAX_RESULTS));
    const unsub = onSnapshot(q, snap => {
      const arr: ScoreSample[] = [];
      snap.forEach(doc => {
        const d: any = doc.data();
        const ai = Number(d.aiScoresFlat?.overall ?? d.aiScores?.overall ?? 0);
        const latency = Number(d.latency ?? 0);
        const ready = (
          d.aiScoresFlat?.boardReadiness ??
          d.aiScores?.boardReadiness ??
          d.aiScores?.metadata?.boardReadiness ??
          null
        ) as string | null;
        const createdAt = (d.createdAt?.toMillis?.() ?? (typeof d.createdAt === 'number' ? d.createdAt : Date.now())) as number;
        const topic = d.testCase?.topic ?? 'Unknown';
        const difficulty = d.testCase?.difficulty ?? 'Unknown';
        const pipeline = (d.testCase?.pipeline ?? 'unknown') as PipelineId;
        arr.push({ ai, latency, ready, createdAt, topic, difficulty, pipeline, id: doc.id });
      });
      setSamples(arr);
    });
    return () => unsub();
  }, [jobId]);

  const filtered = useMemo(() => {
    return samples.filter(s => {
      if (filters.pipelines?.length && !filters.pipelines.includes(s.pipeline)) return false;
      if (filters.topics?.length && !filters.topics.includes(s.topic)) return false;
      if (filters.difficulties?.length && !filters.difficulties.includes(s.difficulty)) return false;
      if (filters.timeRange) {
        if (s.createdAt < filters.timeRange.from || s.createdAt > filters.timeRange.to) return false;
      }
      return true;
    });
  }, [samples, filters]);

  const aggregates = useMemo(() => {
    const byPipeMap = new Map<string, ScoreSample[]>();
    filtered.forEach(s => {
      if (!byPipeMap.has(s.pipeline)) byPipeMap.set(s.pipeline, []);
      byPipeMap.get(s.pipeline)!.push(s);
    });
    const byPipeline: PipelineAggregate[] = [];
    let overallCount = 0, overallAISum = 0, overallLatSum = 0;
    let overallReady = 0, overallMinor = 0, overallMajor = 0, overallReject = 0;
    byPipeMap.forEach((arr, pipeline) => {
      const aiArr = arr.map(a => a.ai).filter(n => Number.isFinite(n)).sort((a,b)=>a-b);
      const latArr = arr.map(a => a.latency).filter(n => Number.isFinite(n)).sort((a,b)=>a-b);
      const avgAI = aiArr.length ? aiArr.reduce((a,b)=>a+b,0)/aiArr.length : 0;
      const p50AI = quantile(aiArr, 0.5);
      const p90AI = quantile(aiArr, 0.9);
      const avgLatency = latArr.length ? latArr.reduce((a,b)=>a+b,0)/latArr.length : 0;
      const p50Latency = quantile(latArr, 0.5);
      const p90Latency = quantile(latArr, 0.9);
      const readiness = { ready:0, minor:0, major:0, reject:0 };
      arr.forEach(s => {
        if (s.ready === 'ready') readiness.ready++;
        else if (s.ready === 'minor_revision') readiness.minor++;
        else if (s.ready === 'major_revision') readiness.major++;
        else if (s.ready === 'reject') readiness.reject++;
      });
      overallCount += arr.length;
      overallAISum += avgAI * arr.length;
      overallLatSum += avgLatency * arr.length;
      overallReady += readiness.ready; overallMinor += readiness.minor; overallMajor += readiness.major; overallReject += readiness.reject;
      byPipeline.push({ pipeline, avgAI, p50AI, p90AI, avgLatency, p50Latency, p90Latency, testCount: arr.length, readiness });
    });

    const topicDiffMap = new Map<string, { sumAI:number; sumLat:number; count:number; success:number }>();
    filtered.forEach(s => {
      const key = `${s.topic}||${s.difficulty}`;
      if (!topicDiffMap.has(key)) topicDiffMap.set(key, { sumAI:0, sumLat:0, count:0, success:0 });
      const cell = topicDiffMap.get(key)!;
      cell.sumAI += s.ai || 0; cell.sumLat += s.latency || 0; cell.count += 1;
      // Approximate success: ready or minor as success; tweak as needed
      if (s.ready === 'ready' || s.ready === 'minor_revision') cell.success += 1;
    });
    const topicDifficulty: TopicDifficultyCell[] = [];
    topicDiffMap.forEach((v, key) => {
      const [topic, difficulty] = key.split('||');
      topicDifficulty.push({ topic, difficulty, successRate: v.count? v.success/v.count:0, ai: v.count? v.sumAI/v.count:0, latency: v.count? v.sumLat/v.count:0, count: v.count });
    });

    const overall: PipelineAggregate | null = overallCount ? {
      pipeline: 'overall',
      avgAI: overallAISum/overallCount,
      p50AI: 0, // optional: compute across all
      p90AI: 0,
      avgLatency: overallLatSum/overallCount,
      p50Latency: 0,
      p90Latency: 0,
      testCount: overallCount,
      readiness: { ready: overallReady, minor: overallMinor, major: overallMajor, reject: overallReject }
    } : null;

    return { byPipeline, topicDifficulty, overall };
  }, [filtered]);

  const outliers = useMemo(() => {
    const worstAI = [...filtered].sort((a,b)=> (a.ai)-(b.ai)).slice(0, 10);
    const slowest = [...filtered].sort((a,b)=> (b.latency)-(a.latency)).slice(0, 10);
    return { worstAI, slowest };
  }, [filtered]);

  const failures = useMemo(() => {
    // If later we annotate failures explicitly, consume them here. For now, use reject/major as proxy.
    return filtered.filter(s => s.ready === 'reject' || s.ready === 'major_revision');
  }, [filtered]);

  return { samples: filtered, aggregates, outliers, failures };
}

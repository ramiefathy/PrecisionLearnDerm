import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, limit, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface PipelineAgg {
  pipeline: string;
  testCount: number;
  avgAI: number;
  p50AI: number;
  p90AI: number;
  avgLatency: number;
  p50Latency: number;
  p90Latency: number;
  readiness?: any;
}

export default function AdminEvalDashboard() {
  const [summaries, setSummaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const qs = await getDocs(query(collection(db, 'evaluationSummaries'), orderBy('createdAt', 'desc'), limit(10)));
        setSummaries(qs.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load evaluation summaries', e);
        setSummaries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Evaluation & Review Metrics</h1>
      <p className="text-gray-600 mb-6">Recent pipeline performance and review outcomes</p>

      {loading ? (
        <div className="p-6 bg-white rounded-xl shadow">Loading...</div>
      ) : summaries.length === 0 ? (
        <div className="p-6 bg-white rounded-xl shadow">No summaries found.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {summaries.map(sum => (
            <div key={sum.id} className="p-5 bg-white rounded-xl shadow border">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Job {sum.id}</div>
                <div className="text-sm text-gray-500">Tests: {sum.overall?.totalTests ?? 0}</div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                <div>
                  <div className="text-gray-500">Success rate</div>
                  <div className="font-semibold">{((sum.overall?.overallSuccessRate ?? 0) * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-gray-500">Avg latency</div>
                  <div className="font-semibold">{(sum.overall?.avgLatency ?? 0).toFixed(0)} ms</div>
                </div>
                <div>
                  <div className="text-gray-500">Avg AI score</div>
                  <div className="font-semibold">{(sum.byPipeline ? avgAI(sum.byPipeline) : 0).toFixed(1)}</div>
                </div>
              </div>
              <div className="space-y-2">
                {Object.values(sum.byPipeline || {}).map((p: any) => (
                  <div key={p.pipeline} className="flex items-center justify-between text-sm">
                    <div className="text-gray-700">{p.pipeline}</div>
                    <div className="text-gray-500">AI {p.avgAI?.toFixed?.(1) ?? 0} • Lat {p.avgLatency?.toFixed?.(0) ?? 0}ms • Ready {p.readiness?.ready ?? 0}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function avgAI(byPipeline: Record<string, PipelineAgg>) {
  const arr = Object.values(byPipeline || {});
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + (b.avgAI || 0), 0) / arr.length;
}



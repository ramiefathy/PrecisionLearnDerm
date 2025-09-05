import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { saveAttempt, type StoredQuestionAttempt } from "../lib/attempts";
import PageShell from "../components/ui/PageShell";
import SectionCard from "../components/ui/SectionCard";
import { GradientButton, MutedButton } from "../components/ui/Buttons";

interface PreviewItem { itemId: string }
interface ExamOption { text: string }
interface ExamItem {
  stem?: string;
  leadIn?: string;
  options?: ExamOption[];
  keyIndex?: number;
  topicIds?: string[];
  explanation?: string;
}
interface QueueItem { itemId: string; fullItem: ExamItem }

type Loader = (topicIds: string[], count: number) => Promise<PreviewItem[]>;
type ItemLoader = (itemId: string) => Promise<ExamItem>;
type AnswerMap = Record<number, number | null>;
interface NextItemsResponse { items?: PreviewItem[] }

interface MockExamPageProps {
  loadBatch?: Loader;
  loadItem?: ItemLoader;
}

type StartHandler = () => Promise<void>;
type ChooseHandler = (index: number, option: number) => void;

export default function MockExamPage({ loadBatch, loadItem }: MockExamPageProps = {}) {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(150 * 60);
  const [topics, setTopics] = useState<string>("psoriasis.plaque:0.4,acne.vulgaris:0.3,tinea.corporis:0.3");
  const [numQ, setNumQ] = useState(75);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [startedAt, setStartedAt] = useState<number>(0);

  useEffect(() => {
    if (!running || paused) return;
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running, paused]);

  const submit = useCallback(async () => {
    const itemsAttempts: StoredQuestionAttempt[] = queue.map((q, i) => {
      const chosenIndex = answers[i] ?? -1;
      const correctIndex = Number(q.fullItem?.keyIndex ?? -1);
      return {
        itemRef: q.itemId,
        topicIds: q.fullItem?.topicIds || [],
        chosenIndex,
        correctIndex,
        correct: chosenIndex === correctIndex,
        confidence: 'Medium',
        timeToAnswerSec: 0,
        ratings: { question: null, explanation: null, reasons: [] }
      };
    });
    const numCorrect = itemsAttempts.filter(a => a.correct).length;
    const score = Math.round((numCorrect / (queue.length || 1)) * 100);
    const attemptId = await saveAttempt({
      startedAt,
      finishedAt: Date.now(),
      score,
      durationSec: Math.round((Date.now() - startedAt) / 1000),
      items: itemsAttempts
    });
    window.location.href = `/quiz/summary/${attemptId}`;
  }, [answers, queue, startedAt]);

  useEffect(() => {
    if (running && secondsLeft === 0) {
      submit();
    }
  }, [running, secondsLeft, submit]);

  const start: StartHandler = async () => {
    setRunning(true); setPaused(false); setSecondsLeft(150 * 60); setStartedAt(Date.now());
    const weights = topics.split(",").map(p => p.trim()).map(p => { const [id, w] = p.split(":"); return { id, w: Number(w || 0) }; });
    const items: QueueItem[] = [];
    let remaining = numQ;
    while (remaining > 0) {
      const batchSize = Math.min(remaining, 25);
      const sampleTopics = Array.from({ length: batchSize }, () => weightedPick(weights));
      let previews: PreviewItem[] = [];
      if (loadBatch) {
        previews = await loadBatch(Array.from(new Set(sampleTopics)), batchSize);
      } else {
        const nextItems = api.pe.nextItems as unknown as (payload: { topicIds: string[]; count: number }) => Promise<NextItemsResponse>;
        const res = await nextItems({ topicIds: Array.from(new Set(sampleTopics)), count: batchSize });
        previews = Array.isArray(res.items) ? res.items : [];
      }
      for (const p of previews) {
        if (p?.itemId) {
          const full = loadItem ? await loadItem(p.itemId) : await api.items.get(p.itemId);
          items.push({ itemId: p.itemId, fullItem: full });
        }
      }
      remaining -= batchSize;
    }
    setQueue(items.slice(0, numQ));
  };

  function weightedPick(ws: { id: string; w: number }[]) {
    const s = ws.reduce((a, b) => a + b.w, 0) || 1;
    const r = Math.random() * s; let acc = 0;
    for (const x of ws) { acc += x.w; if (r <= acc) return x.id; }
    return ws[0].id;
  }

  const choose: ChooseHandler = (i, opt) => { setAnswers(prev => ({ ...prev, [i]: opt })); };

  const mm = Math.floor(secondsLeft/60).toString().padStart(2,'0');
  const ss = (secondsLeft%60).toString().padStart(2,'0');

  return (
    <PageShell title="Mock Exam" subtitle="Board-style exam with timed sections" maxWidth="5xl">
      {!running && (
        <SectionCard title="Configure Exam">
          <div className="grid gap-2 max-w-xl">
            <label className="text-sm">Blueprint (topicId:weight, comma-separated)</label>
            <input value={topics} onChange={e=>setTopics(e.target.value)} className="border rounded-lg p-2"/>
            <label className="text-sm">Number of questions</label>
            <input type="number" value={numQ} onChange={e=>setNumQ(Number(e.target.value||75))} className="border rounded-lg p-2"/>
            <GradientButton onClick={start}>Start</GradientButton>
          </div>
        </SectionCard>
      )}
      {running && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-xl font-mono">
            <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${secondsLeft<=60?'bg-red-100 text-red-700':'bg-blue-100 text-blue-700'}`}>⏱ {mm}:{ss}</span>
            <MutedButton onClick={()=>setPaused(p=>!p)}>{paused?'Resume':'Pause'}</MutedButton>
          </div>
          <SectionCard title="Questions">
            <div className="grid gap-3">
              {queue.map((q, i)=>(
                <div key={q.itemId} className="border rounded-xl p-3 bg-white/70">
                  <div className="font-medium">Q{i+1}. {q.fullItem?.stem}</div>
                  <div className="mt-2 grid gap-2">
                    {(q.fullItem?.options||[]).map((opt: ExamOption, j: number)=>(
                      <button key={j} onClick={()=>choose(i,j)} className={`text-left border rounded-lg p-2 ${answers[i]===j?'border-blue-600 bg-blue-50':''}`}>{opt.text}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <GradientButton onClick={submit}>Submit</GradientButton>
            </div>
          </SectionCard>
        </div>
      )}
    </PageShell>
  );
}

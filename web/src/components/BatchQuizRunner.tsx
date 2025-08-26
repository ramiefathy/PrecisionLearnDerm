import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { saveAttempt, type StoredQuestionAttempt } from '../lib/attempts';
import { addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { saveFeedback } from '../lib/feedback';
import { useAppStore } from '../app/store';

export function BatchQuizRunner() {
  const activeQuiz = useAppStore(s => s.activeQuiz);
  const [queue, setQueue] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<number, { chosenIndex: number|null; confidence: 'Low'|'Medium'|'High'; timeSec: number; ratingQ?: number|null; ratingE?: number|null; reasons?: string; note?: string; makeCard?: boolean }>>({});
  const [start, setStart] = useState<number>(Date.now());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadItems(n = 5) {
    setLoading(true);
    try {
      const items: any[] = [];
      
      // Build request based on quiz config
      const nextItemRequest: any = {};
      if (activeQuiz?.config?.taxonomyFilter) {
        nextItemRequest.taxonomyFilter = activeQuiz.config.taxonomyFilter;
      } else if (activeQuiz?.config?.topicIds?.length && activeQuiz.config.topicIds.length > 0) {
        nextItemRequest.topicIds = activeQuiz.config.topicIds;
      }
      
      for (let i=0;i<n;i++) {
        const preview: any = await api.pe.nextItem(nextItemRequest);
        if (preview?.itemId) {
          const full = await api.items.get(preview.itemId);
          items.push({ itemId: preview.itemId, fullItem: full });
        }
      }
      setQueue(items);
      setAnswers({});
      setStart(Date.now());
    } finally { setLoading(false); }
  }

  useEffect(()=>{ loadItems(5); }, []);

  function choose(i: number, opt: number) {
    setAnswers(prev => ({ ...prev, [i]: { ...(prev[i]||{ confidence: 'Medium', timeSec: 0 }), chosenIndex: opt, timeSec: Math.round((Date.now()-start)/1000) }}));
  }

  async function submitAll() {
    if (!queue.length) return;
    setSubmitting(true);
    try {
      const itemsAttempts: StoredQuestionAttempt[] = queue.map((q, i) => {
        const chosenIndex = answers[i]?.chosenIndex ?? -1;
        const correctIndex = Number(q.fullItem?.keyIndex ?? -1);
        const correct = chosenIndex === correctIndex;
        return {
          itemRef: q.itemId,
          topicIds: q.fullItem?.topicIds || [],
          chosenIndex,
          correctIndex,
          correct,
          confidence: (answers[i]?.confidence ?? 'Medium') as any,
          timeToAnswerSec: answers[i]?.timeSec ?? 0,
          ratings: { question: (answers[i]?.ratingQ ?? null) as any, explanation: (answers[i]?.ratingE ?? null) as any, reasons: (answers[i]?.reasons ? String(answers[i]?.reasons).split(',').map(s=>s.trim()).filter(Boolean) : []) },
          note: answers[i]?.note || undefined,
        };
      });
      const numCorrect = itemsAttempts.filter(a => a.correct).length;
      const score = Math.round((numCorrect / itemsAttempts.length) * 100);
      const attemptId = await saveAttempt({
        startedAt: start,
        finishedAt: Date.now(),
        score,
        durationSec: Math.round((Date.now()-start)/1000),
        items: itemsAttempts
      });

      // Create flashcards and save feedback for marked items
      const uid = auth.currentUser?.uid;
      if (uid) {
        const cardsCol = collection(db, 'flashcards', uid, 'cards');
        for (let i=0;i<queue.length;i++) {
          const q = queue[i];
          if (answers[i]?.makeCard) {
            const correctIndex = Number(q.fullItem?.keyIndex ?? -1);
            const front = q.fullItem?.stem || 'Card';
            const back = `Answer: ${q.fullItem?.options?.[correctIndex]?.text || ''}\n\n${q.fullItem?.explanation || ''}`;
            await addDoc(cardsCol, {
              front,
              back,
              topicIds: q.fullItem?.topicIds || [],
              ease: 2.3,
              intervalDays: 0,
              dueAt: Date.now(),
              reviewHistory: []
            });
          }
          const fb = answers[i];
          if (fb && (fb.ratingQ != null || fb.ratingE != null || (fb.reasons && fb.reasons.length) || fb.note)) {
            try {
              await saveFeedback(String(q.itemId), {
                questionStars: (fb.ratingQ ?? null) as any,
                explanationStars: (fb.ratingE ?? null) as any,
                reasons: fb.reasons ? String(fb.reasons).split(',').map(s=>s.trim()).filter(Boolean) : [],
                comment: fb.note || undefined,
                confidence: fb.confidence,
                timeToAnswerSec: fb.timeSec
              });
            } catch {}
          }
        }
      }

      window.location.href = `/quiz/summary/${attemptId}`;
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      {loading && <div>Loading…</div>}
      {!loading && (
        <div className="space-y-3">
          {queue.map((q, i) => (
            <div key={q.itemId} className="border rounded p-4">
              <div className="font-medium">{q.fullItem?.stem}</div>
              <div className="text-sm mt-1">{q.fullItem?.leadIn}</div>
              <div className="mt-3 grid gap-2">
                {(q.fullItem?.options || []).map((opt: any, j: number) => (
                  <button key={j} onClick={()=>choose(i, j)} className={`text-left border rounded p-3 ${answers[i]?.chosenIndex===j?'border-brand-600 bg-brand-50':''}`}>
                    {opt.text}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-500">Confidence: {answers[i]?.confidence ?? 'Medium'}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-1">Rate Q:
                  <select onChange={e=>setAnswers(prev=>({ ...prev, [i]: { ...(prev[i]||{ chosenIndex:-1, confidence:'Medium', timeSec:0 }), ratingQ: Number(e.target.value)||null }}))} className="border rounded p-1"><option value="">-</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select>
                </label>
                <label className="flex items-center gap-1">Rate Expl:
                  <select onChange={e=>setAnswers(prev=>({ ...prev, [i]: { ...(prev[i]||{ chosenIndex:-1, confidence:'Medium', timeSec:0 }), ratingE: Number(e.target.value)||null }}))} className="border rounded p-1"><option value="">-</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select>
                </label>
                <input placeholder="Reasons (comma-separated)" onChange={e=>setAnswers(prev=>({ ...prev, [i]: { ...(prev[i]||{ chosenIndex:-1, confidence:'Medium', timeSec:0 }), reasons: e.target.value } }))} className="border rounded p-1 flex-1"/>
                <input placeholder="Add note" onChange={e=>setAnswers(prev=>({ ...prev, [i]: { ...(prev[i]||{ chosenIndex:-1, confidence:'Medium', timeSec:0 }), note: e.target.value } }))} className="border rounded p-1 flex-1"/>
                <label className="flex items-center gap-1"><input type="checkbox" onChange={e=>setAnswers(prev=>({ ...prev, [i]: { ...(prev[i]||{ chosenIndex:-1, confidence:'Medium', timeSec:0 }), makeCard: e.target.checked } }))}/> Flashcard</label>
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <button onClick={submitAll} disabled={submitting || !queue.length} className="px-3 py-2 rounded bg-brand-700 text-white disabled:opacity-50">Submit All</button>
          </div>
        </div>
      )}
    </div>
  );
} 
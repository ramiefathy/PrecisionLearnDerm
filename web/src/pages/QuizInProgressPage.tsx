import { useEffect, useMemo, useState } from 'react';
import { QuizRunner } from '../components/QuizRunner';
import { BatchQuizRunner } from '../components/BatchQuizRunner';
import { useAppStore } from '../app/store';

export default function Page() {
  const { activeQuiz } = useAppStore();
  const [remainingSec, setRemainingSec] = useState<number | null>(null);

  const config = activeQuiz?.config || {
    numQuestions: 10,
    timed: false,
    durationMins: 30,
    progressionMode: 'one-by-one' as const,
    captureConfidence: true,
    topicIds: [] as string[],
  };

  const mode: 'one-by-one'|'batch' = config.progressionMode || 'one-by-one';
  const timed = !!config.timed;
  const totalSec = timed ? Math.max(1, Number(config.durationMins || 30) * 60) : null;

  useEffect(() => {
    if (!timed || !totalSec) return;
    setRemainingSec(totalSec);
    const i = setInterval(() => {
      setRemainingSec(prev => {
        if (prev == null) return prev;
        if (prev <= 1) {
          clearInterval(i);
          // Let runners listen for time up via event
          document.dispatchEvent(new CustomEvent('quiz-timeup'));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(i);
  }, [timed, totalSec]);

  const prettyTime = useMemo(() => {
    if (!timed || remainingSec == null) return null;
    const m = Math.floor(remainingSec / 60).toString().padStart(2, '0');
    const s = Math.floor(remainingSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [timed, remainingSec]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Quiz</h1>
            <p className="text-gray-600 text-sm">Mode: {mode === 'one-by-one' ? 'Step-by-Step (Immediate Feedback)' : 'Exam Style (Review at End)'}</p>
          </div>
          {timed && (
            <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${remainingSec && remainingSec <= 60 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              ⏱ {prettyTime}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {mode === 'batch' ? <BatchQuizRunner /> : <QuizRunner />}
      </div>
    </main>
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { saveFeedback } from '../lib/feedback';
import PageShell from '../components/ui/PageShell';
import SectionCard from '../components/ui/SectionCard';
import type { StoredQuestionAttempt } from '../lib/attempts';

interface AttemptItem extends Omit<StoredQuestionAttempt, 'itemRef'> { itemRef: string }
interface QuizAttempt {
  score: number;
  durationSec: number;
  items: AttemptItem[];
}

type LoadAttempt = () => Promise<void>;
type FeedbackHandler = (ref: string, attempt: AttemptItem) => Promise<void>;

export default function QuizSummaryPage() {
  const { attemptId } = useParams();
  const [data, setData] = useState<QuizAttempt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load: LoadAttempt = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid || !attemptId) return;
      const ref = doc(db, 'quizzes', uid, 'attempts', attemptId);
      const snap = await getDoc(ref);
      if (snap.exists()) setData(snap.data() as QuizAttempt);
      setLoading(false);
    };
    load();
  }, [attemptId]);

  if (loading) return <PageShell title="Quiz Summary"><div>Loading…</div></PageShell>;
  if (!data) return <PageShell title="Quiz Summary"><div>Not found</div></PageShell>;

  const correct = (data.items || []).filter(it => it.correct).length;
  const total = (data.items || []).length;

  const handleSaveFeedback: FeedbackHandler = async (ref, attempt) => {
    await saveFeedback(ref, {
      questionStars: attempt.ratings?.question ?? null,
      explanationStars: attempt.ratings?.explanation ?? null,
      reasons: attempt.ratings?.reasons ?? [],
      comment: attempt.note,
    });
  };

  return (
    <PageShell title="Quiz Summary" subtitle="Review your performance and learn from explanations" maxWidth="5xl">
      <div className="space-y-6">
        <SectionCard>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-3xl font-bold text-green-700">{data.score}%</div>
              <div className="text-sm text-green-800">Score</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-700">{correct}/{total}</div>
              <div className="text-sm text-blue-800">Correct</div>
            </div>
            <div className="text-center p-4 bg-amber-50 rounded-lg">
              <div className="text-3xl font-bold text-amber-700">{data.durationSec}s</div>
              <div className="text-sm text-amber-800">Duration</div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Questions Review">
          <div className="space-y-3">
            {(data.items || []).map((it, idx) => (
              <div key={idx} className="border rounded-xl p-4 bg-white/70">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Q{idx + 1}: {String(it.correct ? '✅ Correct' : '❌ Incorrect')}</div>
                  <div className="text-sm text-gray-600">Chosen {it.chosenIndex}, Correct {it.correctIndex}</div>
                </div>
                {it.note && <div className="mt-2 text-sm text-gray-700">Note: {it.note}</div>}
                <div className="mt-2 flex gap-2 items-center">
                  <button onClick={() => handleSaveFeedback(String(it.itemRef), it)} className="px-3 py-1.5 rounded-lg border text-sm">
                    Save Feedback
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}

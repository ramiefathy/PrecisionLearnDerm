import { useEffect, useMemo, useState } from 'react';
import PageShell from '../components/ui/PageShell';
import SectionCard from '../components/ui/SectionCard';
import { auth, db } from '../lib/firebase';
import { collection, getDocs, orderBy, query, type Timestamp } from 'firebase/firestore';
import type { StoredQuestionAttempt } from '../lib/attempts';

interface TopicMasteryRow {
  topicId: string;
  correct: number;
  total: number;
}

interface AttemptItem extends Omit<StoredQuestionAttempt, 'itemRef'> {
  itemRef: string;
}

interface QuizAttempt {
  id: string;
  score: number;
  finishedAt: Timestamp | Date | number;
  items: AttemptItem[];
}

type LoadAttempts = () => Promise<void>;

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [mastery, setMastery] = useState<TopicMasteryRow[]>([]);

  useEffect(() => {
    const load: LoadAttempts = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) { setLoading(false); return; }
      try {
        const attemptsQ = query(collection(db, 'quizzes', uid, 'attempts'), orderBy('finishedAt', 'desc'));
        const snaps = await getDocs(attemptsQ);
        const items: QuizAttempt[] = snaps.docs.map(d => ({ id: d.id, ...(d.data() as Omit<QuizAttempt, 'id'>) }));

        setCount(items.length);

        // Average score
        if (items.length > 0) {
          const avg = items.reduce((a, b) => a + (Number(b.score) || 0), 0) / items.length;
          setAvgScore(Math.round(avg));
        } else {
          setAvgScore(null);
        }

        // Streak (simple daily streak based on finishedAt date)
        const daysSet = new Set<string>();
        items.forEach(it => {
          const dt = it.finishedAt?.toDate ? it.finishedAt.toDate() : new Date(it.finishedAt);
          if (dt) daysSet.add(dt.toISOString().slice(0, 10));
        });
        // Count consecutive days up to today
        let s = 0;
        const today = new Date();
        for (let i = 0; i < 365; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          if (daysSet.has(key)) s++;
          else break;
        }
        setStreak(s);

        // Topic mastery: aggregate by topicId across last N attempts
        const topicStats: Record<string, { correct: number; total: number }> = {};
        items.slice(0, 20).forEach(it => {
          (it.items || []).forEach((qi: AttemptItem) => {
            const tIds: string[] = qi.topicIds || [];
            tIds.forEach(tid => {
              if (!topicStats[tid]) topicStats[tid] = { correct: 0, total: 0 };
              topicStats[tid].total += 1;
              if (qi.correct) topicStats[tid].correct += 1;
            });
          });
        });
        const masteryRows = Object.entries(topicStats)
          .map(([topicId, v]) => ({ topicId, correct: v.correct, total: v.total }))
          .sort((a, b) => (a.correct / a.total) - (b.correct / b.total))
          .slice(0, 8);
        setMastery(masteryRows);

      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const avgScoreDisplay = useMemo(() => avgScore == null ? '--' : `${avgScore}%`, [avgScore]);

  return (
    <PageShell title="Performance" subtitle="Your learning analytics and progress" maxWidth="7xl">
      <div className="grid md:grid-cols-3 gap-6">
        <SectionCard>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-3xl font-bold text-blue-700">{avgScoreDisplay}</div>
            <div className="text-sm text-blue-800">Average Score</div>
          </div>
        </SectionCard>
        <SectionCard>
          <div className="text-center p-4 bg-teal-50 rounded-lg">
            <div className="text-3xl font-bold text-teal-700">{loading ? '--' : count}</div>
            <div className="text-sm text-teal-800">Quizzes Taken</div>
          </div>
        </SectionCard>
        <SectionCard>
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <div className="text-3xl font-bold text-amber-700">{loading ? '--' : `${streak} day${streak === 1 ? '' : 's'}`}</div>
            <div className="text-sm text-amber-800">Streak</div>
          </div>
        </SectionCard>
      </div>
      <div className="mt-6 grid md:grid-cols-2 gap-6">
        <SectionCard title="Topic Mastery">
          {loading ? (
            <div className="h-40 bg-gray-50 rounded-lg grid place-items-center text-sm text-gray-500">Loading...</div>
          ) : mastery.length === 0 ? (
            <div className="h-40 bg-gray-50 rounded-lg grid place-items-center text-sm text-gray-500">No data yet</div>
          ) : (
            <div className="space-y-2">
              {mastery.map(row => (
                <div key={row.topicId} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="truncate max-w-[60%]" title={row.topicId}>{row.topicId}</div>
                  <div className="flex items-center gap-2">
                    <div className="text-gray-600">{row.correct}/{row.total}</div>
                    <div className="w-32 h-2 bg-white border border-gray-200 rounded overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${(row.correct / row.total) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Answer Speed">
          <div className="h-40 bg-gray-50 rounded-lg grid place-items-center text-sm text-gray-500">Coming soon</div>
        </SectionCard>
      </div>
    </PageShell>
  );
}

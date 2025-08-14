import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { TOPICS } from '../constants/topics';
import PageShell from '../components/ui/PageShell';
import SectionCard from '../components/ui/SectionCard';
import { MutedButton } from '../components/ui/Buttons';

export default function FlashcardsPage() {
  const [topicFilter, setTopicFilter] = useState<string>('');
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadDue() {
    setLoading(true);
    try {
      const res: any = await (api as any).pe.srsDue({ topicIds: topicFilter ? [topicFilter] : [] });
      setCards(res?.cards || []);
    } finally { setLoading(false); }
  }

  useEffect(()=>{ loadDue(); }, [topicFilter]);

  function whyInterval(card: any) {
    const ease = Number(card.ease ?? 2.3);
    const interval = Number(card.intervalDays ?? 0);
    return `Based on ease ${ease.toFixed(2)} and prior interval, next interval is ${interval} day(s).`;
  }

  return (
    <PageShell title="Flashcards" subtitle="Spaced repetition with FSRS" maxWidth="5xl">
      <SectionCard title="Due Cards" headerRight={
        <div className="flex gap-2 items-center">
          <select className="border rounded-lg p-2" value={topicFilter} onChange={e=>setTopicFilter(e.target.value)}>
            <option value="">All topics</option>
            {TOPICS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <MutedButton onClick={loadDue} loading={loading}>Refresh</MutedButton>
        </div>
      }>
        {loading && <div>Loading…</div>}
        {!loading && (
          <div className="grid gap-3">
            {cards.map((c: any) => (
              <div key={c.id} className="border rounded-xl p-4 bg-white/70">
                <div className="font-medium">Card {c.id}</div>
                <div className="text-xs text-gray-600" title={whyInterval(c)}>Why this interval: hover to see details</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={()=> (api as any).pe.srsUpdate({ cardId: c.id, grade: 1 }).then(loadDue)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm">Again</button>
                  <button onClick={()=> (api as any).pe.srsUpdate({ cardId: c.id, grade: 2 }).then(loadDue)} className="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-sm">Hard</button>
                  <button onClick={()=> (api as any).pe.srsUpdate({ cardId: c.id, grade: 3 }).then(loadDue)} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm">Good</button>
                  <button onClick={()=> (api as any).pe.srsUpdate({ cardId: c.id, grade: 4 }).then(loadDue)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm">Easy</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}

import { useEffect, useState } from 'react';
import PageShell from '../components/ui/PageShell';
import SectionCard from '../components/ui/SectionCard';
import { api } from '../lib/api';
import { listCategoryOptions, listTopicOptions, listSubtopicOptions } from '../lib/taxonomy';

export default function AdminTaxonomyPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Array<any>>([]);
  const [selected, setSelected] = useState<Record<string, { categoryId?: string; topicId?: string; subtopicId?: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await api.admin.listUncategorized({ limit: 100 }) as any;
      setItems(res.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function setSel(id: string, patch: Partial<{ categoryId: string; topicId: string; subtopicId: string }>) {
    setSelected(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function apply(id: string) {
    const s = selected[id] || {};
    if (!s.categoryId || !s.topicId || !s.subtopicId) return;
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      await api.admin.setItemTaxonomy({ itemId: id, ...s });
      setItems(prev => prev.filter(x => x.id !== id));
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }));
    }
  }

  return (
    <PageShell title="Taxonomy Mapping" subtitle="Tag uncategorized items with category/topic/subtopic" maxWidth="7xl">
      <SectionCard title="Uncategorized Items" subtitle="Quickly assign taxonomy to improve targeting" >
        {loading ? (
          <div className="py-12 text-center text-gray-600">Loading...</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-gray-600">All set — no uncategorized items found.</div>
        ) : (
          <div className="space-y-4">
            {items.map((it) => {
              const current = selected[it.id] || {};
              const catOptions = listCategoryOptions();
              const topicOptions = current.categoryId ? listTopicOptions(current.categoryId) : [];
              const subOptions = current.topicId ? listSubtopicOptions(current.topicId) : [];
              return (
                <div key={it.id} className="bg-white/80 border border-gray-100 rounded-xl p-4 shadow-sm">
                  <div className="text-sm text-gray-500 mb-2">{it.id}</div>
                  <div className="font-medium text-gray-900 mb-3 line-clamp-2">{it.stem || '(no stem)'}</div>
                  <div className="grid md:grid-cols-4 gap-3">
                    <select value={current.categoryId || ''} onChange={e => setSel(it.id, { categoryId: e.target.value, topicId: undefined, subtopicId: undefined })} className="w-full border rounded-lg p-2 text-sm">
                      <option value="">Category</option>
                      {catOptions.map((opt: { value: string; label: string }) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <select value={current.topicId || ''} onChange={e => setSel(it.id, { topicId: e.target.value, subtopicId: undefined })} className="w-full border rounded-lg p-2 text-sm" disabled={!current.categoryId}>
                      <option value="">Topic</option>
                      {topicOptions.map((opt: { value: string; label: string }) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <select value={current.subtopicId || ''} onChange={e => setSel(it.id, { subtopicId: e.target.value })} className="w-full border rounded-lg p-2 text-sm" disabled={!current.topicId}>
                      <option value="">Subtopic</option>
                      {subOptions.map((opt: { value: string; label: string }) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <div className="flex items-center">
                      <button onClick={() => apply(it.id)} disabled={!current.categoryId || !current.topicId || !current.subtopicId || saving[it.id]} className="px-4 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-50">
                        {saving[it.id] ? 'Saving…' : 'Apply'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
} 
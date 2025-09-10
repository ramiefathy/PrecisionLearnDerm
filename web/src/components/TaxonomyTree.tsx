import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

export interface TaxonomySelection {
  category: string;
  subcategories: string[];
  subSubcategories: Record<string, string[]>;
}

interface TaxonomyTreeProps {
  value: TaxonomySelection[];
  onChange: (value: TaxonomySelection[]) => void;
}

interface FlatEntity { name: string; category: string; subcategory: string; sub_subcategory: string }

const CACHE_KEY = 'taxonomy_flat_cache_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function loadFromCache(): { entities: FlatEntity[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.timestamp || !Array.isArray(data?.entities)) return null;
    if (Date.now() - data.timestamp > CACHE_TTL_MS) return null;
    return { entities: data.entities as FlatEntity[] };
  } catch {
    return null;
  }
}

function saveToCache(entities: FlatEntity[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), entities }));
  } catch {}
}

export default function TaxonomyTree({ value, onChange }: TaxonomyTreeProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entities, setEntities] = useState<FlatEntity[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const cached = loadFromCache();
        if (cached) {
          setEntities(cached.entities);
        } else {
          // Prefer public callable to avoid admin-gating dependency
          const res = await api.kb.getTaxonomyFlatPublic();
          if (res?.success && Array.isArray(res.entities)) {
            setEntities(res.entities);
            saveToCache(res.entities);
          } else {
            // Fallback to admin-get if needed
            const adminRes = await api.admin.getTaxonomyFlat();
            if (adminRes?.success && Array.isArray((adminRes as any).entities)) {
              const list = (adminRes as any).entities as FlatEntity[];
              setEntities(list);
              saveToCache(list);
            } else {
              throw new Error('Failed to load taxonomy');
            }
          }
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load taxonomy');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const structure = useMemo(() => {
    const map: Record<string, Record<string, Record<string, string[]>>> = {};
    for (const e of entities) {
      map[e.category] = map[e.category] || {};
      map[e.category][e.subcategory] = map[e.category][e.subcategory] || {};
      map[e.category][e.subcategory][e.sub_subcategory] = map[e.category][e.subcategory][e.sub_subcategory] || [];
      map[e.category][e.subcategory][e.sub_subcategory].push(e.name);
    }
    return map;
  }, [entities]);

  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [openSubs, setOpenSubs] = useState<Record<string, Record<string, boolean>>>({});

  function toggleCat(cat: string) {
    setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  }
  function toggleSub(cat: string, sub: string) {
    setOpenSubs(prev => ({ ...prev, [cat]: { ...(prev[cat] || {}), [sub]: !prev[cat]?.[sub] } }));
  }

  function onSelectCategory(cat: string) {
    // Selecting a category radio clears sub-selections and stores category-level selection
    const next: TaxonomySelection[] = [{ category: cat, subcategories: [], subSubcategories: {} }];
    onChange(next);
  }
  function onSelectSubcategory(cat: string, sub: string) {
    const next: TaxonomySelection[] = [{ category: cat, subcategories: [sub], subSubcategories: {} }];
    onChange(next);
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p className="text-sm text-gray-600 mt-2">Loading taxonomy...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
    );
  }

  const selected = value?.[0];

  return (
    <div className="space-y-3">
      {Object.keys(structure).sort().map(cat => (
        <div key={cat} className="border rounded-md">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
              <input
                type="radio"
                name="taxonomy-category"
                checked={selected?.category === cat && (selected?.subcategories.length ?? 0) === 0}
                onChange={() => onSelectCategory(cat)}
              />
              <span>{cat}</span>
            </label>
            <button
              type="button"
              onClick={() => toggleCat(cat)}
              className="text-xs text-blue-600 hover:underline"
            >
              {openCats[cat] ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {openCats[cat] && (
            <div className="p-3 space-y-3">
              {Object.keys(structure[cat]).sort().map(sub => (
                <div key={sub} className="border rounded">
                  <div className="flex items-center justify-between px-3 py-2 bg-white">
                    <label className="flex items-center gap-2 text-sm text-gray-800">
                      <input
                        type="radio"
                        name={`taxonomy-sub-${cat}`}
                        checked={selected?.category === cat && selected?.subcategories?.[0] === sub}
                        onChange={() => onSelectSubcategory(cat, sub)}
                      />
                      <span>{sub}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleSub(cat, sub)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {openSubs[cat]?.[sub] ? 'Hide topics' : 'Show topics'}
                    </button>
                  </div>
                  {openSubs[cat]?.[sub] && (
                    <div className="px-3 py-2 bg-gray-50 space-y-2">
                      {Object.keys(structure[cat][sub]).sort().map(subsub => (
                        <div key={subsub} className="text-sm">
                          <div className="font-semibold text-gray-800 mb-1">{subsub}</div>
                          <div className="flex flex-wrap gap-2">
                            {structure[cat][sub][subsub].map(topicName => (
                              <span
                                key={topicName}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-700"
                              >
                                {topicName}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

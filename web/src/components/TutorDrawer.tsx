import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { api } from '../lib/api';

type Citation = { type: string; ref: string; title?: string };

export function TutorDrawer({ itemId, topicIds }: { itemId?: string; topicIds?: string[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string>('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [domain, setDomain] = useState<string>('');
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await api.ai.chatExplain({ itemId, topicIds, userQuery: query });
      const data = res as any;
      setAnswer(data.answerMarkdown || '');
      setCitations(Array.isArray(data.citations) ? data.citations : []);
      setDomain(data.domain || '');
    } finally {
      setLoading(false);
    }
  }

  const outOfScope = domain === 'out-of-scope';

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button aria-label="Open AI Tutor" className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:border-gray-400 hover:text-gray-900 transition-colors">
          💬 Ask Tutor
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 max-h-[80vh] bg-white shadow-2xl rounded-t-2xl overflow-hidden" aria-label="AI Tutor Drawer">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-xl font-semibold text-gray-900">AI Tutor</Dialog.Title>
              <Dialog.Close aria-label="Close" className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Dialog.Close>
            </div>
            <p className="text-sm text-gray-600 mt-2">Ask about this item’s topic. The tutor cites knowledge base anchors for answers.</p>
          </div>
          
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="tutor-question">Your Question</label>
              <textarea
                id="tutor-question"
                className="w-full border border-gray-300 rounded-lg p-3 min-h-[100px] focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-colors resize-none"
                placeholder="Ask about this question, related concepts, or anything you'd like to understand better..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            
            <button 
              onClick={ask} 
              disabled={loading || !query.trim()} 
              className="w-full px-4 py-3 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Thinking...
                </div>
              ) : (
                'Ask Tutor'
              )}
            </button>
            
            {answer && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Tutor Response</h4>
                {outOfScope && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-yellow-50 text-yellow-800 text-sm">This question appears unrelated to dermatology. I can help with dermatology/STI topics only.</div>
                )}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {answer}
                  </div>
                  {citations.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2" aria-label="Citations">
                      {citations.map((c, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                          📎 {c.type}:{' '}
                          <span className="font-medium">{c.title || c.ref}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 text-xs text-gray-500">Educational use only. Always verify with authoritative sources.</div>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
} 
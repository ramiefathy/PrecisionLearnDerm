import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../components/Toast';
import { handleAdminError } from '../lib/errorHandler';

interface QueuedQuestion {
  id: string;
  draftItem: {
    stem: string;
    leadIn: string;
    options: Array<{ text: string }>;
    keyIndex: number;
    explanation: string;
  };
}

interface ConversationEntry {
  role: 'admin' | 'ai';
  content: string;
  question?: any;
  timestamp: number;
}

export default function AdminQuestionIterationPage() {
  const [question, setQuestion] = useState<QueuedQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadQuestion();
  }, []);

  async function loadQuestion() {
    try {
      setLoading(true);
      const res = (await api.admin.getQuestionQueue({})) as any;
      setQuestion(res.questions?.[0] || null);
      setConversation([]);
    } catch (e: any) {
      handleAdminError(e, 'load question');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!prompt.trim() || !question) return;
    const feedback = prompt.trim();
    setConversation(prev => [...prev, { role: 'admin', content: feedback, timestamp: Date.now() }]);
    setSending(true);
    try {
      const res = (await api.admin.regenerateQuestion({
        questionId: question.id,
        questionData: question.draftItem,
        adminFeedback: feedback,
      })) as any;
      if (res.success) {
        const regen = res.regeneratedQuestion || {};
        const updated: QueuedQuestion = {
          ...question,
          draftItem: {
            stem: regen.stem || regen.IMPROVED_STEM || question.draftItem.stem,
            leadIn: regen.leadIn || regen.IMPROVED_LEAD_IN || question.draftItem.leadIn,
            options: regen.options || regen.IMPROVED_OPTIONS || question.draftItem.options,
            keyIndex: typeof regen.keyIndex === 'number'
              ? regen.keyIndex
              : regen.correctAnswer
              ? ['A', 'B', 'C', 'D', 'E'].indexOf(String(regen.correctAnswer).toUpperCase())
              : question.draftItem.keyIndex,
            explanation: regen.explanation || regen.IMPROVED_EXPLANATION || question.draftItem.explanation,
          },
        };
        setQuestion(updated);
        setConversation(prev => [
          ...prev,
          { role: 'ai', content: 'Regenerated question', question: regen, timestamp: Date.now() }
        ]);
      } else {
        toast.error('Regeneration failed', res.error || 'Unable to regenerate');
      }
    } catch (e: any) {
      handleAdminError(e, 'regenerate question');
    } finally {
      setPrompt('');
      setSending(false);
    }
  }

  async function handleApprove() {
    if (!question) return;
    if (!confirm('Approve this question?')) return;
    try {
      await api.admin.reviewQuestion({ questionId: question.id, action: 'approve', notes: '' });
      toast.success('Question approved', 'Added to reference bank');
      await loadQuestion();
    } catch (e: any) {
      handleAdminError(e, 'approve question');
    }
  }

  if (loading) return <div className="p-4">Loading...</div>;
  if (!question) return <div className="p-4">No questions available</div>;

  return (
    <div className="p-4 space-y-4">
      <div className="border p-4 rounded-lg bg-white">
        <h2 className="font-semibold mb-2">Current Question</h2>
        <p className="mb-2">{question.draftItem.stem}</p>
        <p className="mb-2 font-medium">{question.draftItem.leadIn}</p>
        <ol className="list-decimal pl-5 space-y-1 mb-2">
          {question.draftItem.options?.map((o, idx) => (
            <li key={idx} className={idx === question.draftItem.keyIndex ? 'font-bold' : ''}>{o.text}</li>
          ))}
        </ol>
        <p className="text-sm text-gray-600">{question.draftItem.explanation}</p>
      </div>

      <div className="border rounded-lg p-4 bg-white h-96 flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-2">
          {conversation.map((m, idx) => (
            <div key={idx} className={`p-2 rounded max-w-[80%] ${m.role === 'admin' ? 'ml-auto bg-blue-100 text-blue-900' : 'bg-gray-100'}`}>
              {m.role === 'ai' && m.question?.changesMade ? (
                <div>
                  <div className="font-semibold mb-1">AI Changes</div>
                  <ul className="list-disc pl-4 text-sm">
                    {m.question.changesMade.map((c: string, i: number) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              ) : (
                m.content
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 border rounded px-3 py-2"
            placeholder="Enter feedback"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <button
            onClick={handleSend}
            disabled={sending || !prompt.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {sending ? '...' : 'Send'}
          </button>
          <button
            onClick={handleApprove}
            className="px-4 py-2 bg-green-600 text-white rounded"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

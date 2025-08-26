import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '../components/Toast';
import { api } from '../lib/api';
import { handleAdminError, handleLoadingError } from '../lib/errorHandler';
import PipelineViewer from '../components/PipelineViewer';
import EnhancedPipelineViewer from '../components/EnhancedPipelineViewer';

interface QueuedQuestion {
  id: string;
  draftItem: {
    type: string;
    stem: string;
    leadIn: string;
    options: Array<{ text: string }>;
    keyIndex: number;
    explanation: string;
    citations: Array<{ source: string }>;
    difficulty: number;
    qualityScore: number;
    iterationHistory?: any[];
    scoringData?: any;
  };
  status: 'pending' | 'approved' | 'rejected';
  topicHierarchy: {
    category: string;
    topic: string;
    subtopic: string;
    fullTopicId: string;
  };
  kbSource: {
    entity: string;
    completenessScore: number;
  };
  pipelineOutputs?: {
    generation?: any;
    validation?: any;
    review?: any;
    scoring?: any;
  };
  createdAt: any;
  priority: number;
}

interface QueueStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export default function AdminQuestionReviewPage() {
  const [questions, setQuestions] = useState<QueuedQuestion[]>([]);
  const [stats, setStats] = useState<QueueStats>({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState<QueuedQuestion | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showPipelineDetails, setShowPipelineDetails] = useState(false);

  useEffect(() => {
    loadQuestionQueue();
  }, []);

  const loadQuestionQueue = async () => {
    try {
      setLoading(true);
      const result = await api.admin.getQuestionQueue({}) as any;
      
      // Set questions - ensure loadedQuestions is always an array
      const loadedQuestions = Array.isArray(result.questions) ? result.questions : [];
      setQuestions(loadedQuestions);
      
      // Calculate stats from questions if not provided by backend
      if (result.stats) {
        setStats(result.stats);
      } else {
        // Calculate stats from the questions array with null safety
        const calculatedStats = {
          pending: (loadedQuestions || []).filter((q: any) => q.status === 'pending').length,
          approved: (loadedQuestions || []).filter((q: any) => q.status === 'approved').length,
          rejected: (loadedQuestions || []).filter((q: any) => q.status === 'rejected').length,
          total: (loadedQuestions || []).length
        };
        setStats(calculatedStats);
      }
    } catch (error: any) {
      handleLoadingError(
        error,
        'load question queue',
        undefined,
        setQuestions,
        []
      );
      setStats({ pending: 0, approved: 0, rejected: 0, total: 0 });
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (questionId: string, action: 'approve' | 'reject') => {
    try {
      setReviewing(questionId);

      const result = await api.admin.reviewQuestion({
        questionId,
        action,
        notes: reviewNotes
      }) as any;

      if (result.shouldRefill) {
        await loadQuestionQueue();
      } else {
        setQuestions(prev => prev.filter(q => q.id !== questionId));
      }

      setSelectedQuestion(null);
      setReviewNotes('');
      toast.success(`Question ${action}d`, `Successfully ${action}d the question`);

    } catch (error: any) {
      handleAdminError(error, `${action} question`);
    } finally {
      setReviewing(null);
    }
  };

  const handleGenerateMore = async () => {
    try {
      setGenerating(true);
      console.log('Calling generateQuestionQueue...');
      const result = await api.admin.generateQuestionQueue({ count: 25 }) as any;
      console.log('Generation result:', result);
      await loadQuestionQueue();
      toast.success('Generated new questions', `Added ${result.generated} questions to review queue`);
    } catch (error: any) {
      handleAdminError(error, 'generate questions');
    } finally {
      setGenerating(false);
    }
  };

  const handleGeneratePerTopic = async () => {
    try {
      setGenerating(true);
      console.log('Calling generatePerTopic...');
      const result = await api.admin.generatePerTopic({ perTopic: 5 }) as any;
      console.log('Per-topic generation result:', result);
      
      await loadQuestionQueue();
      toast.success('Per-topic generation complete', `Generated ${result.totalGenerated || 0} items across topics`);
    } catch (error: any) {
      handleAdminError(error, 'generate per-topic questions');
    } finally {
      setGenerating(false);
    }
  };


  const getTopicBreadcrumb = (hierarchy: any) => {
    if (!hierarchy) return 'Uncategorized';
    const parts = [
      hierarchy.category,
      hierarchy.topic,
      hierarchy.subtopic
    ].filter(Boolean);

    return parts.map(part =>
      part.split('-').map((word: string) =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    ).join(' → ');
  };

  const getQualityColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50';
    if (score >= 80) return 'text-blue-600 bg-blue-50';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Question Review Queue</h1>
              <p className="text-gray-600">Review AI-generated questions for the question bank</p>
            </div>

            <div className="flex items-center gap-4">
              {/* Stats */}
              <div className="flex items-center gap-4 text-sm">
                <div className="bg-blue-50 px-3 py-1 rounded-lg">
                  <span className="text-blue-600 font-semibold">{stats?.pending || 0}</span>
                  <span className="text-blue-500 ml-1">Pending</span>
                </div>
                <div className="bg-green-50 px-3 py-1 rounded-lg">
                  <span className="text-green-600 font-semibold">{stats?.approved || 0}</span>
                  <span className="text-green-500 ml-1">Approved</span>
                </div>
                <div className="bg-red-50 px-3 py-1 rounded-lg">
                  <span className="text-red-600 font-semibold">{stats?.rejected || 0}</span>
                  <span className="text-red-500 ml-1">Rejected</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">

                <button
                  onClick={handleGenerateMore}
                  disabled={generating}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {generating ? 'Generating...' : 'Generate More'}
                </button>

                <button
                  onClick={handleGeneratePerTopic}
                  disabled={generating}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {generating ? 'Working...' : 'Generate per topic (×5)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-gray-400 to-gray-500 grid place-items-center text-white text-2xl mx-auto mb-4 animate-spin">
              ⚙️
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Loading Questions...</h2>
            <p className="text-gray-600 mb-6">Please wait while we fetch the review queue.</p>
          </div>
        ) : !questions || !Array.isArray(questions) || questions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-gray-400 to-gray-500 grid place-items-center text-white text-2xl mx-auto mb-4">
              📝
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No Questions to Review</h2>
            <p className="text-gray-600 mb-6">The review queue is empty. Generate some questions to get started.</p>
            <button
              onClick={handleGenerateMore}
              disabled={generating}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Questions'}
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Question List */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Pending Questions ({Array.isArray(questions) ? questions.length : 0})</h2>

              {(questions || []).map((question, index) => (
                <motion.div
                  key={question.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`bg-white/80 backdrop-blur rounded-2xl p-4 cursor-pointer transition-all hover:shadow-lg border-2 ${
                    selectedQuestion?.id === question.id
                      ? 'border-purple-300 shadow-lg'
                      : 'border-gray-200/50 hover:border-purple-200'
                  }`}
                  onClick={() => setSelectedQuestion(question)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`px-2 py-1 rounded text-xs font-semibold ${getQualityColor(question.kbSource?.completenessScore || 0)}`}>
                      Quality: {question.kbSource?.completenessScore || 0}
                    </div>
                    <div className="text-xs text-gray-500">#{index + 1}</div>
                  </div>

                  <div className="text-xs text-gray-500 mb-2">
                    {question.topicHierarchy ? getTopicBreadcrumb(question.topicHierarchy) : 'Unknown Topic'}
                  </div>

                  <div className="font-semibold text-gray-900 mb-2 line-clamp-2">
                    {question.kbSource?.entity || 'Unknown Entity'}
                  </div>

                  <div className="text-sm text-gray-600 line-clamp-3">
                    {question.draftItem?.stem || 'No stem available'}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Question Detail */}
            <div className="lg:col-span-2">
              {selectedQuestion ? (
                <div className="bg-white/80 backdrop-blur rounded-3xl p-8 shadow-xl border border-gray-200/50">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedQuestion.kbSource?.entity || 'Unknown Entity'}</h2>
                      <p className="text-gray-600">{selectedQuestion.topicHierarchy ? getTopicBreadcrumb(selectedQuestion.topicHierarchy) : 'Unknown Topic'}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-lg text-sm font-semibold ${getQualityColor(selectedQuestion.kbSource?.completenessScore || 0)}`}>
                      KB Score: {selectedQuestion.kbSource?.completenessScore || 0}
                    </div>
                  </div>

                  {/* Question Content */}
                  <div className="space-y-6">
                    {/* Stem */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Clinical Vignette</h3>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-gray-700">{selectedQuestion.draftItem?.stem || 'No stem available'}</p>
                      </div>
                    </div>

                    {/* Lead-in and Options */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Question</h3>
                      <div className="bg-blue-50 rounded-xl p-4">
                        <p className="font-medium text-blue-900 mb-4">{selectedQuestion.draftItem?.leadIn || 'No lead-in available'}</p>
                        <div className="space-y-2">
                          {(selectedQuestion.draftItem?.options || []).map((option: { text: string }, index: number) => (
                            <div
                              key={index}
                              className={`p-3 rounded-lg border-2 ${
                                index === (selectedQuestion.draftItem?.keyIndex || -1)
                                  ? 'border-green-300 bg-green-50 text-green-900'
                                  : 'border-gray-200 bg-white text-gray-700'
                              }`}
                            >
                              <span className="font-medium mr-2">
                                {String.fromCharCode(65 + index)}.
                              </span>
                              {option.text}
                              {index === (selectedQuestion.draftItem?.keyIndex || -1) && (
                                <span className="ml-2 text-green-600 font-semibold">✓ Correct</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Explanation */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Explanation</h3>
                      <div className="prose prose-sm max-w-none">
                        <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded border text-gray-700">
                          {selectedQuestion.draftItem?.explanation || 'No explanation available'}
                        </pre>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-purple-50 rounded-xl p-4">
                        <h4 className="font-semibold text-purple-900 mb-2">Question Metadata</h4>
                        <div className="space-y-1 text-sm">
                          <div><span className="text-purple-600">Type:</span> {selectedQuestion.draftItem?.type || 'Unknown'}</div>
                          <div><span className="text-purple-600">Difficulty:</span> {selectedQuestion.draftItem?.difficulty ? selectedQuestion.draftItem.difficulty.toFixed(2) : 'N/A'}</div>
                          <div><span className="text-purple-600">Quality Score:</span> {selectedQuestion.draftItem?.qualityScore || 0}/100</div>
                        </div>
                      </div>

                      <div className="bg-indigo-50 rounded-xl p-4">
                        <h4 className="font-semibold text-indigo-900 mb-2">Citations</h4>
                        <div className="space-y-1 text-sm">
                          {(selectedQuestion.draftItem?.citations || []).map((citation: { source: string }, index: number) => (
                            <div key={index} className="text-indigo-600">{citation.source}</div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Pipeline Details */}
                    {(selectedQuestion.pipelineOutputs || selectedQuestion.draftItem?.iterationHistory) && (
                      <div className="border-t pt-6">
                        <PipelineViewer 
                          pipelineOutputs={selectedQuestion.pipelineOutputs}
                          iterationHistory={selectedQuestion.draftItem?.iterationHistory}
                          scoringData={selectedQuestion.draftItem?.scoringData}
                        />
                      </div>
                    )}

                    {/* Pipeline Data Section */}
                    {selectedQuestion.pipelineOutputs && (
                      <div className="mt-6 border-t pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <span>🔬</span> Generation Pipeline Analysis
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                              {selectedQuestion.pipelineOutputs.generation?.method || 'Unknown'}
                            </span>
                            <button
                              onClick={() => setShowPipelineDetails(!showPipelineDetails)}
                              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              {showPipelineDetails ? 'Hide' : 'Show'} Details
                            </button>
                          </div>
                        </div>
                        
                        {showPipelineDetails && (
                          <AnimatePresence>
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                            >
                              <EnhancedPipelineViewer 
                                pipelineOutputs={selectedQuestion.pipelineOutputs}
                              />
                            </motion.div>
                          </AnimatePresence>
                        )}
                      </div>
                    )}

                    {/* Review Actions */}
                    <div className="border-t pt-6 mt-6">
                      <h3 className="font-semibold text-gray-900 mb-4">Review Decision</h3>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Review Notes (Optional)
                        </label>
                        <textarea
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Add notes about your decision..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          rows={3}
                        />
                      </div>

                      <div className="flex gap-4">
                        <button
                          onClick={() => handleReview(selectedQuestion.id, 'approve')}
                          disabled={reviewing !== null}
                          className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                        >
                          {reviewing === selectedQuestion.id ? 'Approving...' : '✓ Approve & Add to Bank'}
                        </button>

                        <button
                          onClick={() => handleReview(selectedQuestion.id, 'reject')}
                          disabled={reviewing !== null}
                          className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                        >
                          {reviewing === selectedQuestion.id ? 'Rejecting...' : '✗ Reject'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/50 backdrop-blur rounded-3xl p-12 text-center border border-gray-200/50">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 grid place-items-center text-white text-2xl mx-auto mb-4">
                    👈
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Select a Question</h2>
                  <p className="text-gray-600">Choose a question from the list to review its content and make a decision.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
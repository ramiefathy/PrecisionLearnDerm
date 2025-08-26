import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { toast } from '../components/Toast';
import { handleAdminError } from '../lib/errorHandler';

interface Item {
  id: string;
  stem?: string;
  leadIn?: string;
  options?: { A: string; B: string; C: string; D: string; E?: string };
  correctAnswer?: string;
  explanation?: string;
  difficulty?: number;
  status?: string;
  topics?: string[];
  telemetry?: {
    attempts: number;
    pCorrect: number;
    avgTimeSec: number;
    lastUsed?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface Draft {
  id: string;
  status: string;
  content?: any;
  createdAt?: string;
  topicId?: string;
}

type Tab = 'items' | 'drafts' | 'actions';
type SortField = 'createdAt' | 'difficulty' | 'attempts' | 'pCorrect';
type SortOrder = 'asc' | 'desc';

export default function AdminItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('items');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  
  // Action form states
  const [proposeTopics, setProposeTopics] = useState('');
  const [selectedItemForRevision, setSelectedItemForRevision] = useState<Item | null>(null);
  const [revisionInstructions, setRevisionInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadItems = async () => {
    try {
      setLoading(true);
      
      // Load real items from database
      const itemsResponse = await api.items.list({ limit: 50, status: 'active' });
      const realItems: Item[] = (itemsResponse as any).items?.map((item: any) => ({
        id: item.id,
        stem: item.stem || 'Question stem not available',
        leadIn: item.leadIn,
        options: item.options ? (
          Array.isArray(item.options) 
            ? item.options.reduce((acc: any, opt: any, idx: number) => {
                const letter = String.fromCharCode(65 + idx); // A, B, C, D, E
                acc[letter] = opt.text;
                return acc;
              }, {})
            : item.options
        ) : {},
        correctAnswer: item.options ? (
          Array.isArray(item.options) 
            ? String.fromCharCode(65 + item.options.findIndex((opt: any) => opt.isCorrect))
            : item.correctAnswer
        ) : 'A',
        explanation: item.explanation || 'Explanation not available',
        difficulty: item.difficulty || 0.5,
        status: item.status || 'active',
        topics: item.topicIds || [],
        telemetry: item.telemetry || {
          attempts: 0,
          pCorrect: 0,
          avgTimeSec: 0,
          lastUsed: null
        },
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString()
      })) || [];

      // Load drafts from database (no mock data fallbacks)
      let realDrafts: Draft[] = [];
      try {
        // TODO: Implement real drafts API call when drafts endpoint is available
        // const draftsResponse = await api.admin.getDrafts({ limit: 50 });
        // realDrafts = draftsResponse.drafts || [];
      } catch (error) {
        console.warn('Drafts endpoint not yet implemented:', error);
        realDrafts = [];
      }
      
      setItems(realItems);
      setDrafts(realDrafts);
    } catch (error) {
      console.error('Error loading items:', error);
      handleAdminError(error, 'load items');
      
      // No fallbacks - set to empty arrays on error
      setItems([]);
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const filteredItems = items.filter(item => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.id.toLowerCase().includes(query) ||
      item.stem?.toLowerCase().includes(query) ||
      item.topics?.some(topic => topic.toLowerCase().includes(query))
    );
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    let aValue: any, bValue: any;
    
    switch (sortField) {
      case 'difficulty':
        aValue = a.difficulty || 0;
        bValue = b.difficulty || 0;
        break;
      case 'attempts':
        aValue = a.telemetry?.attempts || 0;
        bValue = b.telemetry?.attempts || 0;
        break;
      case 'pCorrect':
        aValue = a.telemetry?.pCorrect || 0;
        bValue = b.telemetry?.pCorrect || 0;
        break;
      default:
        aValue = new Date(a.createdAt || 0).getTime();
        bValue = new Date(b.createdAt || 0).getTime();
    }
    
    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const filteredDrafts = drafts.filter(draft => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      draft.id.toLowerCase().includes(query) ||
      draft.status.toLowerCase().includes(query) ||
      draft.topicId?.toLowerCase().includes(query)
    );
  });

  const handleProposeTopics = async () => {
    if (!proposeTopics.trim()) {
      toast.error('Topics required', 'Please enter topic IDs to propose');
      return;
    }

    setSubmitting(true);
    try {
      const topicIds = proposeTopics.split(',').map(s => s.trim()).filter(Boolean);
      await api.items.propose({ topicIds });
      toast.success('Topics proposed', `Proposed ${topicIds.length} topics for question generation`);
      setProposeTopics('');
      await loadItems();
    } catch (error) {
      handleAdminError(error, 'propose topics');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviseItem = async () => {
    if (!selectedItemForRevision || !revisionInstructions.trim()) {
      toast.error('Revision details required', 'Please select an item and provide instructions');
      return;
    }

    setSubmitting(true);
    try {
      await api.items.revise({
        itemId: selectedItemForRevision.id,
        instructions: revisionInstructions
      });
      toast.success('Item revision requested', 'The item has been queued for revision');
      setSelectedItemForRevision(null);
      setRevisionInstructions('');
      await loadItems();
    } catch (error) {
      handleAdminError(error, 'revise item');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePromoteDraft = async (draft: Draft) => {
    if (draft.status !== 'approved') {
      toast.error('Draft not approved', 'Only approved drafts can be promoted to active items');
      return;
    }

    setSubmitting(true);
    try {
      await api.items.promote({ draftId: draft.id });
      toast.success('Draft promoted', 'Draft has been promoted to an active item');
      await loadItems();
    } catch (error) {
      handleAdminError(error, 'promote draft');
    } finally {
      setSubmitting(false);
    }
  };

  const getDifficultyColor = (difficulty: number) => {
    if (difficulty < 0.4) return 'text-green-600 bg-green-50';
    if (difficulty < 0.7) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getDifficultyLabel = (difficulty: number) => {
    if (difficulty < 0.4) return 'Easy';
    if (difficulty < 0.7) return 'Medium';
    return 'Hard';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-green-600 bg-green-50 border-green-200';
      case 'pending': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'review': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'rejected': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Content Management</h1>
              <p className="text-gray-600">Manage quiz questions, drafts, and content lifecycle</p>
            </div>
            
            <button
              onClick={loadItems}
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              {[{ id: 'items', label: 'Active Items', count: items.length }, { id: 'drafts', label: 'Drafts', count: drafts.length }, { id: 'actions', label: 'Actions', count: null }].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={`py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {tab.count !== null && (
                    <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                      activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Search and Filters */}
        {(activeTab === 'items' || activeTab === 'drafts') && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${activeTab}...`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {activeTab === 'items' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sort by</label>
                    <select
                      value={sortField}
                      onChange={(e) => setSortField(e.target.value as SortField)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="createdAt">Created Date</option>
                      <option value="difficulty">Difficulty</option>
                      <option value="attempts">Usage Count</option>
                      <option value="pCorrect">Success Rate</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Order</label>
                    <select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            
            <div className="mt-4 text-sm text-gray-600">
              {activeTab === 'items' ? `${sortedItems.length} items found` : `${filteredDrafts.length} drafts found`}
            </div>
          </div>
        )}

        {/* Content based on active tab */}
        <AnimatePresence mode="wait">
          {activeTab === 'items' && (
            <motion.div
              key="items"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {sortedItems.map((item) => (
                <div key={item.id} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="font-mono text-sm text-gray-500">{item.id}</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getDifficultyColor(item.difficulty || 0)}`}>
                          {getDifficultyLabel(item.difficulty || 0)}
                        </span>
                        {item.topics?.map(topic => (
                          <span key={topic} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                            {topic}
                          </span>
                        ))}
                      </div>
                      
                      <p className="text-gray-900 mb-3 line-clamp-2">{item.stem}</p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Usage:</span>
                          <div>{item.telemetry?.attempts || 0} attempts</div>
                        </div>
                        <div>
                          <span className="font-medium">Success Rate:</span>
                          <div>{((item.telemetry?.pCorrect || 0) * 100).toFixed(1)}%</div>
                        </div>
                        <div>
                          <span className="font-medium">Avg Time:</span>
                          <div>{item.telemetry?.avgTimeSec || 0}s</div>
                        </div>
                        <div>
                          <span className="font-medium">Last Used:</span>
                          <div>{item.telemetry?.lastUsed ? new Date(item.telemetry.lastUsed).toLocaleDateString() : 'Never'}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => {
                          setSelectedItem(item);
                          setShowPreview(true);
                        }}
                        className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => setSelectedItemForRevision(item)}
                        className="px-3 py-1 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                      >
                        Revise
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {sortedItems.length === 0 && !loading && (
                <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Items Found</h3>
                  <p className="text-gray-600">Try adjusting your search terms or create new content</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'drafts' && (
            <motion.div
              key="drafts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {filteredDrafts.map((draft) => (
                <div key={draft.id} className="bg-white rounded-xl shadow-lg p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="font-mono text-sm text-gray-500">{draft.id}</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(draft.status)}`}>
                          {draft.status.toUpperCase()}
                        </span>
                        {draft.topicId && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                            {draft.topicId}
                          </span>
                        )}
                      </div>
                      
                      {draft.content?.stem && (
                        <p className="text-gray-900 mb-3 line-clamp-2">{draft.content.stem}</p>
                      )}
                      
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Created:</span> {new Date(draft.createdAt || '').toLocaleDateString()}
                        {draft.content?.difficulty && (
                          <span className="ml-4">
                            <span className="font-medium">Difficulty:</span> {draft.content.difficulty.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      {draft.status === 'approved' && (
                        <button
                          onClick={() => handlePromoteDraft(draft)}
                          disabled={submitting}
                          className="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
                        >
                          Promote
                        </button>
                      )}
                      <button
                        onClick={() => {
                          // Preview draft functionality could be added here
                          toast.info('Coming Soon', 'Draft preview functionality will be added');
                        }}
                        className="px-3 py-1 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredDrafts.length === 0 && !loading && (
                <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                  <div className="text-6xl mb-4">✏️</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Drafts Found</h3>
                  <p className="text-gray-600">No drafts match your current search criteria</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'actions' && (
            <motion.div
              key="actions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Propose New Topics */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">💡 Propose New Topics</h3>
                <p className="text-gray-600 mb-4">
                  Generate new questions for specific dermatology topics. Enter comma-separated topic IDs.
                </p>
                
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={proposeTopics}
                    onChange={(e) => setProposeTopics(e.target.value)}
                    placeholder="e.g. psoriasis, acne, melanoma"
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleProposeTopics}
                    disabled={submitting || !proposeTopics.trim()}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? 'Proposing...' : 'Propose Topics'}
                  </button>
                </div>
                
                <div className="mt-3 text-xs text-gray-500">
                  Topics will be queued for AI question generation. This may take several minutes.
                </div>
              </div>

              {/* Revise Item */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">🔧 Revise Existing Item</h3>
                <p className="text-gray-600 mb-4">
                  Request revisions to an existing question. Select an item and provide specific instructions.
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Selected Item</label>
                    <div className="relative">
                      <button
                        onClick={() => {
                          if (items.length === 0) {
                            toast.info('No Items', 'Load items first to select one for revision');
                            return;
                          }
                          // For demo, just select the first item
                          setSelectedItemForRevision(items[0]);
                        }}
                        className="w-full px-4 py-3 text-left border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {selectedItemForRevision ? (
                          <div>
                            <span className="font-mono text-sm">{selectedItemForRevision.id}</span>
                            <p className="text-gray-600 text-sm mt-1 line-clamp-1">{selectedItemForRevision.stem}</p>
                          </div>
                        ) : (
                          <span className="text-gray-500">Click to select an item...</span>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Revision Instructions</label>
                    <textarea
                      value={revisionInstructions}
                      onChange={(e) => setRevisionInstructions(e.target.value)}
                      placeholder="Describe the specific changes needed (e.g., 'Make the question more challenging', 'Update the explanation with recent guidelines', 'Fix the distractor options')"
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <button
                    onClick={handleReviseItem}
                    disabled={submitting || !selectedItemForRevision || !revisionInstructions.trim()}
                    className="w-full px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? 'Requesting Revision...' : 'Request Revision'}
                  </button>
                </div>
                
                <div className="mt-3 text-xs text-gray-500">
                  Revision requests are processed by AI and may take several minutes to complete.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Content</h3>
            <p className="text-gray-600">Fetching items and drafts...</p>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Question Preview</h3>
                <button
                  onClick={() => {
                    setShowPreview(false);
                    setSelectedItem(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-500">Question ID:</span>
                  <p className="font-mono text-sm">{selectedItem.id}</p>
                </div>
                
                <div>
                  <span className="text-sm text-gray-500">Clinical Scenario:</span>
                  <p className="mt-1">{selectedItem.stem}</p>
                </div>
                
                {selectedItem.leadIn && (
                  <div>
                    <span className="text-sm text-gray-500">Question:</span>
                    <p className="mt-1 font-medium">{selectedItem.leadIn}</p>
                  </div>
                )}
                
                {selectedItem.options && (
                  <div>
                    <span className="text-sm text-gray-500">Answer Options:</span>
                    <div className="mt-2 space-y-2">
                      {Object.entries(selectedItem.options).map(([key, value]) => (
                        <div
                          key={key}
                          className={`p-3 rounded-lg border ${
                            selectedItem.correctAnswer === key
                              ? 'bg-green-50 border-green-200'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <span className="font-medium">{key}.</span> {value}
                          {selectedItem.correctAnswer === key && (
                            <span className="ml-2 text-green-600 text-sm">✓ Correct</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedItem.explanation && (
                  <div>
                    <span className="text-sm text-gray-500">Explanation:</span>
                    <p className="mt-1 text-gray-700">{selectedItem.explanation}</p>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <span className="text-sm text-gray-500">Difficulty:</span>
                    <p>{getDifficultyLabel(selectedItem.difficulty || 0)} ({(selectedItem.difficulty || 0).toFixed(2)})</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Success Rate:</span>
                    <p>{((selectedItem.telemetry?.pCorrect || 0) * 100).toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
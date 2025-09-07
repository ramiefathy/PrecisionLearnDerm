import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { toast } from '../components/Toast';
import { handleAdminError } from '../lib/errorHandler';
import TaxonomySelector from '../components/TaxonomySelector';

interface QuestionBankStats {
  totalQuestions: number;
  legacyImported: number;
  aiGenerated: number;
  categories: Record<string, number>;
  averageQuality: number;
  qualityRange: { min: number; max: number } | null;
}

interface Question {
  id: string;
  stem: string;
  options: Array<{ text: string }>;
  correctIndex: number;
  explanation: string;
  topic: string;
  difficulty: number;
  tags: string[];
  qualityMetrics?: {
    overallScore: number;
    clinicalRelevance: number;
    diagnosticDifficulty: number;
    educationalValue: number;
  };
  taxonomyCategory?: string;
  taxonomySubcategory?: string;
  taxonomySubSubcategory?: string;
  taxonomyEntity?: string;
}

export default function AdminQuestionBankPage() {
  const [stats, setStats] = useState<QuestionBankStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  
  // Taxonomy filtering state
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [selectedSubSubcategory, setSelectedSubSubcategory] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  
  // Question browsing state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const result = await api.admin.getQuestionBankStats({}) as any;
      setStats(result);
    } catch (error: any) {
      handleAdminError(error, 'load question bank stats');
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async (filters: any = {}) => {
    try {
      setQuestionsLoading(true);
      
      // TODO: Replace with actual API call when implemented
      console.log('Loading questions with filters:', filters);
      // For now, we'll show a placeholder
      const mockQuestions: Question[] = [];
      
      setQuestions(mockQuestions);
      setShowQuestions(true);
    } catch (error: any) {
      handleAdminError(error, 'load questions');
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleBrowseQuestions = () => {
    const filters = {
      category: selectedCategory || undefined,
      subcategory: selectedSubcategory || undefined,
      subSubcategory: selectedSubSubcategory || undefined,
      entity: selectedEntity?.name || undefined
    };
    
    loadQuestions(filters);
  };

  const handleImportLegacyQuestions = async () => {
    if (!confirm('This will import 5 high-quality sample questions from the legacy question bank. Continue?')) {
      return;
    }

    try {
      setImporting(true);
      const result = await api.admin.importLegacyQuestions({}) as any;
      
      toast.success('Import Complete', result.message);
      
      // Reload stats
      await loadStats();
      
    } catch (error: any) {
      handleAdminError(error, 'import legacy questions');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 grid place-items-center text-white font-bold animate-pulse mx-auto mb-4">
            QB
          </div>
          <p className="text-gray-600">Loading question bank statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Question Bank Management</h1>
              <p className="text-gray-600">Import and manage the dermatology question database</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        
        {/* Overview Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Questions</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.totalQuestions}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-blue-100 grid place-items-center">
                  <span className="text-blue-600 text-xl">📚</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Legacy Imported</p>
                  <p className="text-3xl font-bold text-green-600">{stats.legacyImported}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-green-100 grid place-items-center">
                  <span className="text-green-600 text-xl">📥</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">AI Generated</p>
                  <p className="text-3xl font-bold text-purple-600">{stats.aiGenerated}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-purple-100 grid place-items-center">
                  <span className="text-purple-600 text-xl">🤖</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Avg. Quality</p>
                  <p className="text-3xl font-bold text-orange-600">{stats.averageQuality}/10</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-orange-100 grid place-items-center">
                  <span className="text-orange-600 text-xl">⭐</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Import Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl p-8 shadow-lg border border-gray-100"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-6">Import Legacy Questions</h2>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-blue-500 grid place-items-center text-white text-sm font-bold mt-0.5">
                ℹ️
              </div>
              <div>
                <h3 className="font-semibold text-blue-900 mb-2">Legacy Question Bank Analysis Complete</h3>
                <div className="text-blue-800 space-y-1">
                  <p>• Analyzed <strong>2,086 questions</strong> from your previous question bank</p>
                  <p>• Identified <strong>95 high-quality questions</strong> (quality score ≥7.5/10)</p>
                  <p>• Categories: Medical Dermatology (62), Dermatopathology (20), Oncology (11), Pediatric (2)</p>
                  <p>• Ready to import the top-quality questions with proper categorization</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">Sample Import (5 Questions)</h4>
                <p className="text-gray-600 text-sm mb-3">
                  Import 5 highest-quality sample questions to test the system
                </p>
                <button
                  onClick={handleImportLegacyQuestions}
                  disabled={importing}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {importing ? 'Importing...' : 'Import Sample Questions'}
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold text-gray-700 mb-2">Full Import (95 Questions)</h4>
                <p className="text-gray-600 text-sm mb-3">
                  Import all 95 high-quality questions (coming soon)
                </p>
                <button
                  disabled
                  className="w-full px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed"
                >
                  Coming Soon
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Category Breakdown */}
        {stats && Object.keys(stats.categories).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-xl p-8 shadow-lg border border-gray-100"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-6">Question Categories</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(stats.categories).map(([category, count]) => {
                const percentage = ((count / stats.totalQuestions) * 100).toFixed(1);
                return (
                  <div key={category} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 capitalize">
                        {category.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm text-gray-600">{percentage}% of total</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">{count}</p>
                      <p className="text-xs text-gray-500">questions</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Quality Analysis */}
        {stats && stats.qualityRange && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white rounded-xl p-8 shadow-lg border border-gray-100"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-6">Quality Analysis</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-3xl font-bold text-green-600">{stats.averageQuality}</p>
                <p className="text-sm text-green-700">Average Quality</p>
              </div>
              
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-3xl font-bold text-blue-600">{stats.qualityRange.max}</p>
                <p className="text-sm text-blue-700">Highest Quality</p>
              </div>
              
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <p className="text-3xl font-bold text-orange-600">{stats.qualityRange.min}</p>
                <p className="text-sm text-orange-700">Lowest Quality</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Question Browser */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white rounded-xl p-8 shadow-lg border border-gray-100"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Browse Questions by Topic</h2>
              <p className="text-gray-600">Filter and explore questions using the taxonomy structure</p>
            </div>
            <div className="text-sm text-gray-500">
              Based on 1,274 medical entities
            </div>
          </div>
          
          <div className="space-y-6">
            {/* Taxonomy Selector */}
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <TaxonomySelector
                selectedCategory={selectedCategory}
                selectedSubcategory={selectedSubcategory}
                selectedSubSubcategory={selectedSubSubcategory}
                selectedEntity={selectedEntity?.name}
                onCategoryChange={setSelectedCategory}
                onSubcategoryChange={setSelectedSubcategory}
                onSubSubcategoryChange={setSelectedSubSubcategory}
                onEntityChange={setSelectedEntity}
                showEntitySelector={false}
                showStats={true}
              />
            </div>

            {/* Browse Button */}
            <div className="flex justify-center">
              <button
                onClick={handleBrowseQuestions}
                disabled={questionsLoading}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {questionsLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Loading Questions...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>🔍</span>
                    Browse Questions
                  </div>
                )}
              </button>
            </div>

            {/* Questions Display */}
            {showQuestions && (
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Filtered Questions ({questions.length})
                  </h3>
                  {(selectedCategory || selectedSubcategory || selectedSubSubcategory) && (
                    <div className="text-sm text-gray-600">
                      Filters: {selectedCategory && `${selectedCategory}`}
                      {selectedSubcategory && ` → ${selectedSubcategory}`}
                      {selectedSubSubcategory && ` → ${selectedSubSubcategory}`}
                    </div>
                  )}
                </div>

                {questions.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-gray-400 to-gray-500 grid place-items-center text-white text-2xl mx-auto mb-4">
                      📋
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">No Questions Found</h4>
                    <p className="text-gray-600 max-w-md mx-auto">
                      No questions match the selected filters. Try broadening your selection or check the Review Queue for questions awaiting approval.
                    </p>
                    <div className="mt-4 space-x-3">
                      <a
                        href="/admin/review"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        <span>📋</span>
                        Review Queue
                      </a>
                      <a
                        href="/admin/generate"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                      >
                        <span>✨</span>
                        Generate Questions
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {questions.map((question, index) => (
                      <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 mb-1">
                              Question {index + 1}
                            </h4>
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {question.stem}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {question.qualityMetrics && (
                              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                                Quality: {Math.round(question.qualityMetrics.overallScore)}/10
                              </span>
                            )}
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                              Difficulty: {question.difficulty}
                            </span>
                          </div>
                        </div>
                        
                        {question.taxonomyCategory && (
                          <div className="text-xs text-gray-500">
                            📁 {question.taxonomyCategory}
                            {question.taxonomySubcategory && ` → ${question.taxonomySubcategory}`}
                            {question.taxonomySubSubcategory && ` → ${question.taxonomySubSubcategory}`}
                            {question.taxonomyEntity && ` → ${question.taxonomyEntity}`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>

      </div>
    </main>
  );
} 
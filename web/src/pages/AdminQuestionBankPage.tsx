import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { toast } from '../components/Toast';

interface QuestionBankStats {
  totalQuestions: number;
  legacyImported: number;
  aiGenerated: number;
  categories: Record<string, number>;
  averageQuality: number;
  qualityRange: { min: number; max: number } | null;
}

export default function AdminQuestionBankPage() {
  const [stats, setStats] = useState<QuestionBankStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const result = await api.admin.getQuestionBankStats({}) as any;
      setStats(result);
    } catch (error: any) {
      console.error('Failed to load question bank stats:', error);
      toast.error('Failed to load stats', error.message);
    } finally {
      setLoading(false);
    }
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
      console.error('Failed to import legacy questions:', error);
      toast.error('Import Failed', error.message);
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

      </div>
    </main>
  );
} 
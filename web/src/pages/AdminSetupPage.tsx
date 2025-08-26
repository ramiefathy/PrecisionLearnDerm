import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { toast } from '../components/Toast';
import { handleAdminError } from '../lib/errorHandler';
import { Link } from 'react-router-dom';

interface SystemHealth {
  database: 'healthy' | 'warning' | 'error';
  functions: 'healthy' | 'warning' | 'error';
  lastChecked: Date;
}

interface DashboardStats {
  totalQuestions: number;
  pendingReviews: number;
  avgQuality: number;
  recentActivity: string;
}

export default function AdminSetupPage() {
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    database: 'healthy',
    functions: 'healthy',
    lastChecked: new Date()
  });
  const [stats, setStats] = useState<DashboardStats>({
    totalQuestions: 0,
    pendingReviews: 0,
    avgQuality: 0,
    recentActivity: 'Loading...'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load system health
      await checkSystemHealth();
      
      // Load dashboard stats
      const [queueResult, bankResult] = await Promise.all([
        api.admin.getQuestionQueue({}).catch(() => ({ questions: [] })),
        api.admin.getQuestionBankStats({}).catch(() => ({ totalQuestions: 0, averageQuality: 0 }))
      ]);

      setStats({
        totalQuestions: (bankResult as any).totalQuestions || 0,
        pendingReviews: (queueResult as any).questions?.length || 0,
        avgQuality: (bankResult as any).averageQuality || 0,
        recentActivity: 'System operational'
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkSystemHealth = async () => {
    let databaseHealth: 'healthy' | 'warning' | 'error' = 'healthy';
    let functionsHealth: 'healthy' | 'warning' | 'error' = 'healthy';

    try {
      // Test database connectivity by checking question queue
      await api.admin.getQuestionQueue({ limit: 1 });
      console.log('✅ Database connectivity test passed');
    } catch (dbError) {
      console.warn('❌ Database connectivity test failed:', dbError);
      databaseHealth = 'error';
    }

    try {
      // Test Cloud Functions using working admin function
      console.log('Testing Cloud Functions...');
      await api.admin.listAdmins();
      console.log('✅ Cloud Functions test passed');
    } catch (funcError) {
      console.warn('❌ Cloud Functions test failed:', funcError);
      functionsHealth = 'error';
    }

    setSystemHealth({
      database: databaseHealth,
      functions: functionsHealth,
      lastChecked: new Date()
    });
  };

  const handleSeedDatabase = async () => {
    if (seeded) {
      toast.warning('Already seeded', 'Database has already been seeded with sample data.');
      return;
    }

    setSeeding(true);
    try {
      const result = await api.util.seedDatabase();
      console.log('Seed result:', result);
      
      toast.success(
        'Database seeded successfully!', 
        `Created ${(result as any).itemsCreated} sample dermatology questions.`
      );
      setSeeded(true);
      
      // Reload dashboard data
      await loadDashboardData();
    } catch (error: any) {
      handleAdminError(error, 'seed database');
    } finally {
      setSeeding(false);
    }
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'error': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '❓';
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">System overview and management</p>
            </div>
            <button
              onClick={loadDashboardData}
              className="px-4 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        
        {/* System Health Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {/* Database Health */}
          <div className={`border rounded-xl p-6 ${getHealthColor(systemHealth.database)}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Database</h3>
                <p className="text-sm opacity-80">Firestore connectivity</p>
              </div>
              <div className="text-2xl">{getHealthIcon(systemHealth.database)}</div>
            </div>
          </div>

          {/* Functions Health */}
          <div className={`border rounded-xl p-6 ${getHealthColor(systemHealth.functions)}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">AI Functions</h3>
                <p className="text-sm opacity-80">Cloud Functions status</p>
              </div>
              <div className="text-2xl">{getHealthIcon(systemHealth.functions)}</div>
            </div>
          </div>

          {/* Last Checked */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Last Checked</h3>
                <p className="text-sm text-gray-600">{systemHealth.lastChecked.toLocaleTimeString()}</p>
              </div>
              <div className="text-2xl">🕐</div>
            </div>
          </div>
        </motion.div>

        {/* Key Metrics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6"
        >
          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Questions</p>
                <p className="text-3xl font-bold text-gray-900">{loading ? '...' : stats.totalQuestions}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-blue-100 grid place-items-center">
                <span className="text-blue-600 text-xl">📚</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Pending Reviews</p>
                <p className="text-3xl font-bold text-orange-600">{loading ? '...' : stats.pendingReviews}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-orange-100 grid place-items-center">
                <span className="text-orange-600 text-xl">⏳</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Avg Quality</p>
                <p className="text-3xl font-bold text-green-600">{loading ? '...' : stats.avgQuality}/10</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-green-100 grid place-items-center">
                <span className="text-green-600 text-xl">⭐</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">System Status</p>
                <p className="text-lg font-semibold text-gray-900">{stats.recentActivity}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-purple-100 grid place-items-center">
                <span className="text-purple-600 text-xl">🚀</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl p-8 shadow-lg border border-gray-100"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-6">Quick Actions</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              to="/admin/review"
              className="flex items-center gap-3 p-4 rounded-xl border-2 border-purple-200 hover:border-purple-300 hover:bg-purple-50 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-purple-100 grid place-items-center">
                <span className="text-purple-600">🤖</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Review Questions</h3>
                <p className="text-sm text-gray-600">{stats.pendingReviews} pending</p>
              </div>
            </Link>

            <Link
              to="/admin/testing"
              className="flex items-center gap-3 p-4 rounded-xl border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-100 grid place-items-center">
                <span className="text-blue-600">🔧</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Test AI Pipeline</h3>
                <p className="text-sm text-gray-600">Debug & test</p>
              </div>
            </Link>

            <Link
              to="/admin/question-bank"
              className="flex items-center gap-3 p-4 rounded-xl border-2 border-green-200 hover:border-green-300 hover:bg-green-50 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-green-100 grid place-items-center">
                <span className="text-green-600">📊</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Question Bank</h3>
                <p className="text-sm text-gray-600">{stats.totalQuestions} total</p>
              </div>
            </Link>

            <Link
              to="/admin/items"
              className="flex items-center gap-3 p-4 rounded-xl border-2 border-orange-200 hover:border-orange-300 hover:bg-orange-50 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-orange-100 grid place-items-center">
                <span className="text-orange-600">📝</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Manage Content</h3>
                <p className="text-sm text-gray-600">Items & drafts</p>
              </div>
            </Link>
          </div>
        </motion.div>

        {/* Database Setup Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl p-8 shadow-lg border border-gray-100"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-6">Database Management</h2>
          
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">🚀 Database Initialization</h3>
            <p className="text-blue-800 mb-4">
              Populate the database with sample dermatology quiz questions for testing and demonstration.
            </p>
            
            <div className="bg-white/50 rounded-lg p-4 mb-4">
              <h4 className="font-semibold text-gray-900 mb-2">What will be created:</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• 5 Sample dermatology questions (Psoriasis, Acne, Tinea, Atopic Dermatitis, Melanoma)</li>
                <li>• Proper item structure with explanations and citations</li>
                <li>• Realistic telemetry data for testing personalization</li>
                <li>• Test admin user account</li>
              </ul>
            </div>

            <button
              onClick={handleSeedDatabase}
              disabled={seeding || seeded}
              className={`w-full px-6 py-4 rounded-xl font-semibold text-lg transition-all duration-300 ${
                seeded 
                  ? 'bg-green-500 text-white cursor-not-allowed'
                  : seeding
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:shadow-xl hover:scale-105'
              }`}
            >
              {seeding ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Seeding Database...
                </div>
              ) : seeded ? (
                <div className="flex items-center justify-center gap-2">
                  ✅ Database Seeded Successfully
                </div>
              ) : (
                '🌱 Seed Database with Sample Questions'
              )}
            </button>
          </div>

          {seeded && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 mt-6">
              <h3 className="text-lg font-semibold text-green-900 mb-3">🎉 Setup Complete!</h3>
              <p className="text-green-800 mb-4">
                The database has been successfully initialized. You can now:
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white/50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">✅ Test Quiz Functionality</h4>
                  <p className="text-sm text-gray-700">Navigate to the quiz section and start a quiz to test the system.</p>
                </div>
                <div className="bg-white/50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">📚 Review Sample Questions</h4>
                  <p className="text-sm text-gray-700">Check the Admin Items page to see the created questions.</p>
                </div>
              </div>
            </div>
          )}
        </motion.div>

      </div>
    </main>
  );
}
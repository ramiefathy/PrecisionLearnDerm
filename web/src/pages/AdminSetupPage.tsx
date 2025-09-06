import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { toast } from '../components/Toast';
import { handleAdminError } from '../lib/errorHandler';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';

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

interface AdminUser {
  uid: string;
  email: string;
  adminGrantedAt: Date | null;
  adminGrantedBy: string;
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
  
  // Admin user management state
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [grantingAdmin, setGrantingAdmin] = useState(false);
  const [revokingAdmin, setRevokingAdmin] = useState<string | null>(null);
  const [dialogEmail, setDialogEmail] = useState<string | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [setupKey, setSetupKey] = useState('');

  useEffect(() => {
    loadDashboardData();
    loadAdminUsers();
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

  const loadAdminUsers = async () => {
    const previousAdmins = adminUsers;
    try {
      setLoadingAdmins(true);
      const result = await api.admin.listAdmins();

      if (result.success && result.data?.admins) {
        setAdminUsers(result.data.admins);
      } else {
        setAdminUsers(previousAdmins);
        handleAdminError(new Error(result.message || 'Unknown error'), 'load admin users');
      }
    } catch (error: any) {
      setAdminUsers(previousAdmins);
      handleAdminError(error, 'load admin users');
    } finally {
      setLoadingAdmins(false);
    }
  };

  const handleGrantAdminRole = async () => {
    if (!newAdminEmail.trim()) {
      toast.error('Email required', 'Please enter an email address');
      return;
    }

    if (!setupKey.trim()) {
      toast.error('Setup key required', 'Please enter the setup key');
      return;
    }

    setGrantingAdmin(true);
    try {
      const result = await api.admin.grantAdminRole({
        email: newAdminEmail.trim(),
        setupKey: setupKey.trim()
      });

      if (result.success) {
        toast.success('Admin role granted!', `${newAdminEmail} now has admin access`);
        setNewAdminEmail('');
        setSetupKey('');
        await loadAdminUsers();
      } else {
        toast.error('Failed to grant admin role', result.message || 'Unknown error');
      }
    } catch (error: any) {
      handleAdminError(error, 'grant admin role');
    } finally {
      setGrantingAdmin(false);
    }
  };

  const handleRevokeAdminRole = (email: string) => {
    setDialogEmail(email);
  };

  const confirmRevokeAdminRole = async () => {
    if (!dialogEmail) return;
    setRevokingAdmin(dialogEmail);
    try {
      const result = await api.admin.revokeAdminRole({ email: dialogEmail });

      if (result.success) {
        toast.success('Admin role revoked', `${dialogEmail} no longer has admin access`);
        await loadAdminUsers();
      } else {
        toast.error('Failed to revoke admin role', result.message || 'Unknown error');
      }
    } catch (error: any) {
      handleAdminError(error, 'revoke admin role');
    } finally {
      setRevokingAdmin(null);
      setDialogEmail(null);
    }
  };

  const cancelRevokeAdminRole = () => {
    setDialogEmail(null);
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
      <ConfirmDialog
        open={!!dialogEmail}
        title="Revoke Admin Access"
        description={`Are you sure you want to revoke admin access for ${dialogEmail}?`}
        confirmText="Revoke"
        cancelText="Cancel"
        onConfirm={confirmRevokeAdminRole}
        onCancel={cancelRevokeAdminRole}
      />
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
              to="/admin/evaluation"
              className="flex items-center gap-3 p-4 rounded-xl border-2 border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-100 grid place-items-center">
                <span className="text-indigo-600">📈</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Pipeline Evaluation (Legacy)</h3>
                <p className="text-sm text-gray-600">Current system</p>
              </div>
            </Link>

            <Link
              to="/admin/evaluation-v2"
              className="flex items-center gap-3 p-4 rounded-xl border-2 border-purple-200 hover:border-purple-300 hover:bg-purple-50 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-purple-100 grid place-items-center">
                <span className="text-purple-600">✨</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Pipeline Evaluation V2</h3>
                <p className="text-sm text-gray-600">New beta system</p>
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

        {/* Admin User Management */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl p-8 shadow-lg border border-gray-100"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-6">Admin User Management</h2>
          
          {/* Grant Admin Role Section */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-orange-900 mb-3">🔑 Grant Admin Access</h3>
            <p className="text-orange-800 mb-4">
              Grant admin privileges to a registered user. Requires the setup key for security.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Setup Key</label>
                <input
                  type="password"
                  value={setupKey}
                  onChange={(e) => setSetupKey(e.target.value)}
                  placeholder="Enter setup key"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <button
              onClick={handleGrantAdminRole}
              disabled={grantingAdmin || !newAdminEmail.trim() || !setupKey.trim()}
              className="w-full px-6 py-3 rounded-xl font-semibold text-lg transition-all duration-300 bg-gradient-to-r from-orange-500 to-red-500 text-white hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {grantingAdmin ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Granting Admin Role...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  🔑 Grant Admin Role
                </div>
              )}
            </button>
          </div>

          {/* Current Admin Users */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-blue-900">👥 Current Admin Users</h3>
              <button
                onClick={loadAdminUsers}
                disabled={loadingAdmins}
                className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {loadingAdmins ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {loadingAdmins ? (
              <div className="text-center py-4">
                <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-blue-700">Loading admin users...</p>
              </div>
            ) : adminUsers.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-blue-100 grid place-items-center text-blue-600 text-2xl mx-auto mb-4">
                  👤
                </div>
                <h4 className="font-semibold text-blue-900 mb-2">No Admin Users Found</h4>
                <p className="text-blue-700 text-sm">Grant admin access to the first user to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {adminUsers.map((admin) => (
                  <div
                    key={admin.uid}
                    className="bg-white/60 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{admin.email}</div>
                      <div className="text-xs text-gray-500">
                        {admin.adminGrantedAt ? `Admin since ${admin.adminGrantedAt.toLocaleDateString()}` : 'Admin'}
                        {admin.adminGrantedBy && ` • Granted by ${admin.adminGrantedBy}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeAdminRole(admin.email)}
                      disabled={revokingAdmin === admin.email}
                      className="px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors text-sm disabled:opacity-50"
                    >
                      {revokingAdmin === admin.email ? 'Revoking...' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            )}
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
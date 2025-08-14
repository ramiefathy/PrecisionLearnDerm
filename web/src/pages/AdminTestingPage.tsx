import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { toast } from '../components/Toast';

export default function AdminTestingPage() {
  const [testResults, setTestResults] = useState<any>(null);
  const [healthResults, setHealthResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Test configuration
  const [testEntity] = useState('Psoriasis');
  const [useAI, setUseAI] = useState(true);

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const result = await api.test.systemHealth() as any;
      setHealthResults(result);
    } catch (error: any) {
      console.error('Error checking health:', error);
    }
  };

  const runTest = async () => {
    try {
      setLoading(true);
      
      const result = await api.test.simpleTest({
        testEntity,
        useAI
      }) as any;
      
      setTestResults(result);
      toast.success('Test completed!', 
        result.success ? 'All systems working' : `${result.errors.length} issues found`
      );
      
    } catch (error: any) {
      console.error('Error running tests:', error);
      toast.error('Test failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">System Testing & Health</h1>
              <p className="text-gray-600">Monitor AI system performance and run diagnostics</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* System Health */}
          <div className="bg-white/80 backdrop-blur rounded-3xl p-6 shadow-xl border border-gray-200/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">System Health</h2>
              <button
                onClick={checkHealth}
                className="px-3 py-1 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 transition-all"
              >
                Refresh
              </button>
            </div>
            
            {healthResults && (
              <div className="space-y-3">
                <div className={`flex items-center justify-between p-3 rounded-lg ${
                  healthResults.checks.firestore ? 'bg-green-50' : 'bg-red-50'
                }`}>
                  <span className="font-medium">Firestore Database</span>
                  <span className={`text-sm font-semibold ${
                    healthResults.checks.firestore ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {healthResults.checks.firestore ? '✓ Online' : '✗ Offline'}
                  </span>
                </div>
                
                <div className={`flex items-center justify-between p-3 rounded-lg ${
                  healthResults.checks.knowledgeBase ? 'bg-green-50' : 'bg-red-50'
                }`}>
                  <span className="font-medium">Knowledge Base</span>
                  <span className={`text-sm font-semibold ${
                    healthResults.checks.knowledgeBase ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {healthResults.checks.knowledgeBase ? '✓ Loaded' : '✗ Missing'}
                  </span>
                </div>
                
                <div className={`flex items-center justify-between p-3 rounded-lg ${
                  healthResults.checks.cloudFunctions ? 'bg-green-50' : 'bg-red-50'
                }`}>
                  <span className="font-medium">Cloud Functions</span>
                  <span className={`text-sm font-semibold ${
                    healthResults.checks.cloudFunctions ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {healthResults.checks.cloudFunctions ? '✓ Active' : '✗ Inactive'}
                  </span>
                </div>
                
                <div className={`flex items-center justify-between p-3 rounded-lg ${
                  healthResults.checks.adminAccess ? 'bg-green-50' : 'bg-red-50'
                }`}>
                  <span className="font-medium">Admin Access</span>
                  <span className={`text-sm font-semibold ${
                    healthResults.checks.adminAccess ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {healthResults.checks.adminAccess ? '✓ Configured' : '✗ Not Found'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Testing Interface */}
          <div className="bg-white/80 backdrop-blur rounded-3xl p-6 shadow-xl border border-gray-200/50">
            <h2 className="text-xl font-bold text-gray-900 mb-4">System Test</h2>
            
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useAI"
                  checked={useAI}
                  onChange={(e) => setUseAI(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="useAI" className="text-sm font-medium text-gray-700">
                  Use AI Enhancement
                </label>
              </div>
              
              <button
                onClick={runTest}
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
              >
                {loading ? 'Running Test...' : 'Run System Test'}
              </button>
            </div>
            
            {testResults && (
              <div className="border-t pt-4">
                <div className={`p-4 rounded-lg mb-4 ${
                  testResults.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Overall Status</span>
                    <span className={`font-bold ${
                      testResults.success ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {testResults.success ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Completed in {testResults.totalTime}ms
                  </div>
                </div>
                
                <div className="space-y-2">
                  {testResults.phases && testResults.phases.map((phase: any, index: number) => (
                    <div key={index} className={`p-3 rounded-lg border ${
                      phase.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">{phase.phase.replace('_', ' ')}</span>
                        <span className={`text-sm font-semibold ${
                          phase.success ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {phase.success ? '✓' : '✗'}
                        </span>
                      </div>
                      {phase.error && (
                        <div className="text-sm text-red-600 mt-1">{phase.error}</div>
                      )}
                    </div>
                  ))}
                </div>
                
                {testResults.errors && testResults.errors.length > 0 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="font-semibold text-red-900 mb-2">Errors:</div>
                    <ul className="text-sm text-red-700 space-y-1">
                      {testResults.errors.map((error: string, index: number) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
} 
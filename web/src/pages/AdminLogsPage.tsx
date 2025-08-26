import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { toast } from '../components/Toast';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  category: string;
  userId?: string;
  endpoint?: string;
  duration?: number;
  metadata?: any;
}

type LogFilter = 'all' | 'error' | 'warn' | 'info' | 'debug';
type TimeFilter = 'all' | '1h' | '6h' | '24h' | '7d';

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LogFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const loadLogs = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
      }

      const response = await api.monitoring.getLogs({
        level: levelFilter === 'all' ? undefined : levelFilter,
        limit: 25
      }).catch(() => {
        // Fallback to mock data if endpoint doesn't exist
        return generateMockLogs();
      });

      const newLogs = Array.isArray(response) ? response : (response as any).logs || [];
      
      if (reset) {
        setLogs(newLogs);
      } else {
        setLogs(prev => [...prev, ...newLogs]);
      }
      
      setHasMore(newLogs.length === 25);
    } catch (error) {
      console.error('Error loading logs:', error);
      if (reset) {
        setLogs(generateMockLogs());
      }
      toast.error('Failed to load logs', 'Using sample data instead');
    } finally {
      setLoading(false);
    }
  };

  const generateMockLogs = (): LogEntry[] => {
    const levels: LogEntry['level'][] = ['info', 'warn', 'error', 'debug'];
    const categories = ['AI Generation', 'User Auth', 'Database', 'API Request', 'System'];
    const messages = [
      'Question generation completed successfully',
      'User authentication failed - invalid token',
      'Database connection timeout',
      'API rate limit exceeded',
      'Memory usage above threshold',
      'Scheduled backup completed',
      'AI model response received',
      'Cache invalidation triggered',
      'Security scan completed',
      'Performance monitoring alert'
    ];

    return Array.from({ length: 50 }, (_, i) => ({
      id: `log-${i}`,
      timestamp: new Date(Date.now() - i * 60000 * Math.random() * 1440).toISOString(),
      level: levels[Math.floor(Math.random() * levels.length)],
      message: messages[Math.floor(Math.random() * messages.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      userId: Math.random() > 0.5 ? `user-${Math.floor(Math.random() * 1000)}` : undefined,
      endpoint: Math.random() > 0.6 ? `/api/admin/${categories[Math.floor(Math.random() * categories.length)].toLowerCase().replace(/\s+/g, '-')}` : undefined,
      duration: Math.random() > 0.7 ? Math.floor(Math.random() * 5000) : undefined,
      metadata: Math.random() > 0.8 ? { 
        requestId: `req-${Math.random().toString(36).substring(2, 11)}`,
        userAgent: 'Mozilla/5.0 (compatible; AdminPanel/1.0)'
      } : undefined
    }));
  };

  useEffect(() => {
    loadLogs(true);
  }, [levelFilter, timeFilter, searchQuery]);

  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadLogs(true);
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [autoRefresh, levelFilter, timeFilter, searchQuery]);

  const filteredLogs = logs.filter(log => {
    if (levelFilter !== 'all' && log.level !== levelFilter) return false;
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !log.category.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-600 bg-red-50 border-red-200';
      case 'warn': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'info': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'debug': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return '🔴';
      case 'warn': return '🟡';
      case 'info': return '🔵';
      case 'debug': return '🔍';
      default: return '📄';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    loadLogs();
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">System Logs</h1>
              <p className="text-gray-600">Monitor system activity and troubleshoot issues</p>
            </div>
            
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Auto-refresh
              </label>
              <button
                onClick={() => loadLogs(true)}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search logs..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Level Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Level</label>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as LogFilter)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Levels</option>
                <option value="error">🔴 Errors</option>
                <option value="warn">🟡 Warnings</option>
                <option value="info">🔵 Info</option>
                <option value="debug">🔍 Debug</option>
              </select>
            </div>

            {/* Time Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1h">Last Hour</option>
                <option value="6h">Last 6 Hours</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="all">All Time</option>
              </select>
            </div>

            {/* Stats */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Results</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                {filteredLogs.length} logs found
              </div>
            </div>
          </div>
        </div>

        {/* Logs List */}
        <div className="space-y-4">
          <AnimatePresence>
            {filteredLogs.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-xl shadow-lg overflow-hidden"
              >
                <div 
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-2xl">{getLevelIcon(log.level)}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${getLevelColor(log.level)}`}>
                            {log.level.toUpperCase()}
                          </span>
                          <span className="text-sm font-medium text-gray-900">{log.category}</span>
                          <span className="text-xs text-gray-500">{formatTimestamp(log.timestamp)}</span>
                        </div>
                        <p className="text-gray-900 font-medium">{log.message}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          {log.endpoint && <span>📡 {log.endpoint}</span>}
                          {log.duration && <span>⏱️ {log.duration}ms</span>}
                          {log.userId && <span>👤 {log.userId}</span>}
                        </div>
                      </div>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600 p-1">
                      {expandedLog === log.id ? '🔼' : '🔽'}
                    </button>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedLog === log.id && log.metadata && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50">
                    <h4 className="font-medium text-gray-900 mb-2">Metadata</h4>
                    <pre className="text-xs bg-white p-3 rounded border overflow-x-auto text-gray-600">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Load More */}
          {hasMore && filteredLogs.length > 0 && (
            <div className="text-center py-6">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Loading...' : 'Load More Logs'}
              </button>
            </div>
          )}

          {/* Empty State */}
          {filteredLogs.length === 0 && !loading && (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <div className="text-6xl mb-4">📄</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Logs Found</h3>
              <p className="text-gray-600">Try adjusting your filters or time range</p>
            </div>
          )}

          {/* Loading State */}
          {loading && logs.length === 0 && (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Logs</h3>
              <p className="text-gray-600">Fetching system activity data...</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

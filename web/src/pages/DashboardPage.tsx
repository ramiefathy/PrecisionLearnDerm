import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import AdaptiveNotifications from '../components/AdaptiveNotifications';

interface UserActivity {
  id: string;
  type: 'quiz_completion' | 'flashcard_session' | 'mock_exam_attempt' | 'study_session' | 'question_answered';
  timestamp: Date;
  data: {
    title: string;
    score?: number;
    totalQuestions?: number;
    correctAnswers?: number;
    timeSpent?: number;
    difficulty?: string;
    topicIds?: string[];
  };
}

export default function DashboardPage() {
  const { profile, user } = useAuth();
  const [suggestion, setSuggestion] = useState<any | null>(null);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  useEffect(() => {
    api.pe.nextItem({}).then(setSuggestion).catch(()=>setSuggestion(null));
  }, []);

  useEffect(() => {
    // Fetch user activities
    const fetchActivities = async () => {
      try {
        setActivitiesLoading(true);
        setActivitiesError(null);
        const response = await api.activities.get({ limit: 10 }) as any;
        
        if (response.success) {
          // Convert timestamp strings to Date objects and sort by most recent
          const activitiesWithDates = response.activities.map((activity: any) => ({
            ...activity,
            timestamp: new Date(activity.timestamp)
          })).sort((a: UserActivity, b: UserActivity) => 
            b.timestamp.getTime() - a.timestamp.getTime()
          );
          
          setActivities(activitiesWithDates);
        } else {
          setActivitiesError('Failed to load activities');
        }
      } catch (error) {
        console.error('Error fetching activities:', error);
        setActivitiesError('Failed to load activities');
        setActivities([]); // Set empty array as fallback
      } finally {
        setActivitiesLoading(false);
      }
    };

    fetchActivities();
  }, []);

  const greeting = useMemo(() => {
    const name = profile?.displayName || 'there';
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return `${timeOfDay}, ${name}`;
  }, [profile]);

  const progress = useMemo(() => {
    const quizzes = profile?.stats.quizzesTaken || 0;
    const score = profile?.stats.averageScore || 0;
    const streak = profile?.stats.streak || 0;
    return { quizzes, score, streak };
  }, [profile]);

  interface QuickAction {
    title: string;
    desc: string;
    href: string;
    gradient: string;
    icon: string;
  }

  // Check if user is admin - check multiple conditions
  const isAdmin = useMemo(() => {
    return profile?.isAdmin || 
           profile?.role === 'admin' || 
           user?.email === 'ramiefathy@gmail.com';
  }, [profile, user]);

  const quickActions: QuickAction[] = useMemo(() => {
    const baseActions: QuickAction[] = [
      { title: 'Start Quiz', desc: 'Adaptive learning', href: '/quiz/topics', gradient: 'from-blue-500 to-indigo-500', icon: '🧠' },
      { title: 'Flashcards', desc: 'Spaced repetition', href: '/flashcards', gradient: 'from-teal-500 to-cyan-500', icon: '💡' },
      { title: 'Mock Exam', desc: 'Test readiness', href: '/mock-exam', gradient: 'from-slate-500 to-gray-600', icon: '📝' },
      { title: 'Patient Sim', desc: 'Real scenarios', href: '/patient-sim', gradient: 'from-indigo-500 to-purple-500', icon: '👥' },
    ];
    
    // Admin Panel removed from Quick Actions as requested
    return baseActions;
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 grid place-items-center text-white font-bold">
                PL
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{greeting}</h1>
                <p className="text-sm text-gray-500">Ready to continue your learning journey?</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {isAdmin && (
                <Link 
                  to="/admin/setup"
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md font-medium text-sm"
                >
                  Admin Panel
                </Link>
              )}
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 text-orange-700 text-sm font-medium"
              >
                🔥 {progress.streak} day streak
              </motion.div>
              <AdaptiveNotifications />
              <Link to="/profile" className="w-8 h-8 rounded-lg bg-gray-200 hover:bg-gray-300 transition-colors" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Quick Actions */}
        <motion.section 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action, i) => (
              <motion.div
                key={action.title}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
              >
                <Link
                  to={action.href}
                  className={`block p-6 rounded-2xl bg-gradient-to-br ${action.gradient} text-white shadow-xl hover:shadow-2xl transition-all duration-300`}
                >
                  <div className="text-3xl mb-3">{action.icon}</div>
                  <h3 className="font-bold text-lg mb-1">{action.title}</h3>
                  <p className="text-sm opacity-90">{action.desc}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Progress Overview */}
        <motion.section 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Progress</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <StatsCard
              title="Quizzes Completed"
              value={progress.quizzes}
              subtitle="Keep the momentum going!"
              gradient="from-blue-500 to-indigo-500"
              icon="📊"
            />
            <StatsCard
              title="Average Score"
              value={`${Math.round(progress.score * 100)}%`}
              subtitle={progress.score >= 0.8 ? "Excellent work!" : "You're improving!"}
              gradient="from-teal-500 to-cyan-500"
              icon="🎯"
            />
            <StatsCard
              title="Study Streak"
              value={`${progress.streak} days`}
              subtitle={progress.streak > 0 ? "Consistency is key!" : "Start your streak today!"}
              gradient="from-amber-500 to-orange-500"
              icon="🔥"
            />
          </div>
        </motion.section>

        {/* Personalized Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* AI Suggestion */}
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="lg:col-span-2"
          >
            <div className="bg-white/80 backdrop-blur rounded-2xl p-8 shadow-lg border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 grid place-items-center text-white text-xl">
                  🤖
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">AI Recommendation</h3>
                  <p className="text-gray-600">Personalized just for you</p>
                </div>
              </div>
              
              {suggestion?.preview ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
                    <h4 className="font-semibold text-gray-900 mb-2">Next Question Preview</h4>
                    <p className="text-gray-700">{suggestion.preview.leadIn}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      Why: {suggestion.preview.whySelected}
                    </div>
                    <Link 
                      to="/quiz/play"
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:shadow-lg transition-all"
                    >
                      Start Learning
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-8 bg-gray-200 rounded-xl w-32" />
                </div>
              )}
            </div>
          </motion.div>

          {/* Learning Activity */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {activitiesLoading ? (
                  // Loading state
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                        <div className="flex-1">
                          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                        <div className="h-4 bg-gray-200 rounded w-12"></div>
                      </div>
                    </div>
                  ))
                ) : activitiesError ? (
                  // Error state
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">{activitiesError}</p>
                    <button 
                      onClick={() => window.location.reload()} 
                      className="mt-2 text-blue-600 text-sm hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : activities.length === 0 ? (
                  // Empty state
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-3xl mb-2">📚</div>
                    <p className="text-sm mb-2">No activities yet</p>
                    <p className="text-xs text-gray-400">Complete a quiz or review flashcards to see your activity here</p>
                  </div>
                ) : (
                  // Real activities
                  activities.slice(0, 3).map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{activity.data.title}</p>
                        <p className="text-xs text-gray-500">{formatRelativeTime(activity.timestamp)}</p>
                      </div>
                      <span className="text-sm font-semibold text-blue-600">
                        {formatActivityScore(activity)}
                      </span>
                    </div>
                  ))
                )}
              </div>
              {activities.length > 3 && (
                <div className="mt-4 text-center">
                  <Link 
                    to="/profile" 
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    View all activities →
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Motivational Quote */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-8"
        >
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white text-center">
            <div className="text-4xl mb-4">💫</div>
            <blockquote className="text-xl font-medium mb-4">
              "The expert in anything was once a beginner."
            </blockquote>
            <p className="text-blue-100">Keep learning, keep growing. Every question makes you stronger.</p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}

// Utility function to format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInMilliseconds = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMilliseconds / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) {
    return 'Just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
  } else if (diffInDays === 1) {
    return 'Yesterday';
  } else if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// Utility function to format activity score display
function formatActivityScore(activity: UserActivity): string {
  switch (activity.type) {
    case 'quiz_completion':
      if (activity.data.score !== undefined) {
        return `${Math.round(activity.data.score * 100)}%`;
      }
      return `${activity.data.correctAnswers || 0}/${activity.data.totalQuestions || 0}`;
    
    case 'flashcard_session':
      return `${activity.data.totalQuestions || 0} cards`;
    
    case 'mock_exam_attempt':
      if (activity.data.score !== undefined) {
        return `${Math.round(activity.data.score * 100)}%`;
      }
      return `${activity.data.correctAnswers || 0}/${activity.data.totalQuestions || 0}`;
    
    case 'study_session':
      const timeInMin = Math.round((activity.data.timeSpent || 0) / 60);
      return `${timeInMin} min`;
    
    default:
      return '';
  }
}

function StatsCard({ title, value, subtitle, gradient, icon }: {
  title: string;
  value: string | number;
  subtitle: string;
  gradient: string;
  icon: string;
}) {
  return (
    <motion.div 
      whileHover={{ scale: 1.02, y: -4 }}
      className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg border border-gray-100"
    >
      <div className="flex items-center gap-4 mb-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${gradient} grid place-items-center text-white text-xl`}>
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-gray-600 text-sm">{title}</h3>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </motion.div>
  );
}

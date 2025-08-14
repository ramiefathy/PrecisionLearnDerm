import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../app/store';
import { api } from '../lib/api';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import AdaptiveNotifications from '../components/AdaptiveNotifications';

export default function DashboardPage() {
  const profile = useAppStore(s => s.profile);
  const [suggestion, setSuggestion] = useState<any | null>(null);

  useEffect(() => {
    api.pe.nextItem({}).then(setSuggestion).catch(()=>setSuggestion(null));
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
            {[
              { title: 'Start Quiz', desc: 'Adaptive learning', href: '/quiz/topics', gradient: 'from-blue-500 to-indigo-500', icon: '🧠' },
              { title: 'Flashcards', desc: 'Spaced repetition', href: '/flashcards', gradient: 'from-teal-500 to-cyan-500', icon: '💡' },
              { title: 'Mock Exam', desc: 'Test readiness', href: '/mock-exam', gradient: 'from-slate-500 to-gray-600', icon: '📝' },
              { title: 'Patient Sim', desc: 'Real scenarios', href: '/patient-sim', gradient: 'from-indigo-500 to-purple-500', icon: '👥' },
            ].map((action, i) => (
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
                {[
                  { activity: 'Completed Psoriasis Quiz', time: '2 hours ago', score: '85%' },
                  { activity: 'Reviewed Flashcards', time: 'Yesterday', score: '12 cards' },
                  { activity: 'Mock Exam Attempt', time: '3 days ago', score: '78%' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{item.activity}</p>
                      <p className="text-xs text-gray-500">{item.time}</p>
                    </div>
                    <span className="text-sm font-semibold text-blue-600">{item.score}</span>
                  </div>
                ))}
              </div>
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

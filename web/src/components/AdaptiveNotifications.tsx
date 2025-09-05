import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { auth } from '../lib/firebase';
import type { User } from 'firebase/auth';

interface PersonalizedQuestion {
  generatedAt: string;
}

interface PersonalizedQuestionsResponse {
  success: boolean;
  questions: PersonalizedQuestion[];
  count: number;
  totalAvailable: number;
  error?: string;
}

function isPersonalizedQuestionsResponse(value: unknown): value is PersonalizedQuestionsResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).questions)
  );
}

interface AdaptiveNotification {
  id: string;
  type: 'personalized_questions' | 'gap_analysis' | 'quality_improvement' | 'milestone';
  title: string;
  message: string;
  actionText?: string;
  actionUrl?: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  read: boolean;
  data?: Record<string, unknown>;
}

interface PersonalizedQueueStatus {
  pendingQuestions: number;
  lastGenerated: Date | null;
  topGaps: Array<{
    topic: string;
    type: string;
    severity: string;
  }>;
}

export default function AdaptiveNotifications() {
  const [user, setUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<AdaptiveNotification[]>([]);
  const [queueStatus, setQueueStatus] = useState<PersonalizedQueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        checkAdaptiveStatus();
        const interval = setInterval(checkAdaptiveStatus, 5 * 60 * 1000); // Check every 5 minutes
        return () => clearInterval(interval);
      }
    });
    
    return () => unsubscribe();
  }, []);

  const checkAdaptiveStatus = async () => {
    try {
      setLoading(true);

      // Get personalized question status
      const result: unknown = await api.pe.getPersonalizedQuestions({ limit: 10 });
      if (!isPersonalizedQuestionsResponse(result)) {
        throw new Error('Invalid personalized questions response');
      }
      const personalizedQuestions = result.questions || [];
      
      // Create notifications based on adaptive status
      const newNotifications: AdaptiveNotification[] = [];
      
      // Check for pending personalized questions
      if (personalizedQuestions.length > 0) {
        newNotifications.push({
          id: 'personalized_ready',
          type: 'personalized_questions',
          title: '🎯 Personalized Questions Ready!',
          message: `We've created ${personalizedQuestions.length} personalized questions based on your learning patterns.`,
          actionText: 'Take Quiz',
          actionUrl: '/quiz/play',
          priority: 'high',
          createdAt: new Date(),
          read: false,
          data: { questionCount: personalizedQuestions.length }
        });
      }

      setNotifications(newNotifications);
      setQueueStatus({
        pendingQuestions: personalizedQuestions.length,
        lastGenerated: personalizedQuestions.length > 0 ? new Date(personalizedQuestions[0].generatedAt) : null,
        topGaps: []
      });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to check adaptive status:', message);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      )
    );
  };

  const dismissNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const handleActionClick = (notification: AdaptiveNotification) => {
    markAsRead(notification.id);
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const highPriorityCount = notifications.filter(n => !n.read && n.priority === 'high').length;

  if (!user || loading) return null;

  return (
    <>
      {/* Notification Bell */}
      <div className="relative">
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          
          {unreadCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold text-white flex items-center justify-center ${
                highPriorityCount > 0 ? 'bg-red-500' : 'bg-blue-500'
              }`}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.div>
          )}
        </button>

        {/* Notifications Dropdown */}
        <AnimatePresence>
          {showNotifications && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-96 overflow-hidden"
            >
              {/* Header */}
              <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">🧠 Learning Insights</h3>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                {queueStatus && (
                  <div className="mt-2 text-sm text-gray-600">
                    {queueStatus.pendingQuestions > 0 ? (
                      <span className="text-green-600 font-medium">
                        {queueStatus.pendingQuestions} personalized questions ready
                      </span>
                    ) : (
                      <span>No pending personalized questions</span>
                    )}
                  </div>
                )}
              </div>

              {/* Notifications List */}
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <div className="text-3xl mb-2">🎯</div>
                    <p>All caught up!</p>
                    <p className="text-sm">Keep learning to unlock personalized insights</p>
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                        !notification.read ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className={`font-medium ${
                              notification.priority === 'high' ? 'text-red-700' :
                              notification.priority === 'medium' ? 'text-yellow-700' :
                              'text-gray-700'
                            }`}>
                              {notification.title}
                            </h4>
                            {!notification.read && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-600 mt-1">
                            {notification.message}
                          </p>
                          
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs text-gray-400">
                              {notification.createdAt.toLocaleTimeString()}
                            </span>
                            
                            <div className="flex space-x-2">
                              {notification.actionText && (
                                <button
                                  onClick={() => handleActionClick(notification)}
                                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-700 transition-colors"
                                >
                                  {notification.actionText}
                                </button>
                              )}
                              
                              <button
                                onClick={() => dismissNotification(notification.id)}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                  <button
                    onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Mark all as read
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* High Priority Toast Notifications */}
      <AnimatePresence>
        {notifications.filter(n => n.priority === 'high' && !n.read).map(notification => (
          <motion.div
            key={`toast-${notification.id}`}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 right-4 z-50"
          >
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-sm">
              <div className="flex items-start space-x-3">
                <div className="text-2xl">🎯</div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{notification.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                  
                  <div className="flex space-x-2 mt-3">
                    {notification.actionText && (
                      <button
                        onClick={() => handleActionClick(notification)}
                        className="text-sm bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-700 transition-colors"
                      >
                        {notification.actionText}
                      </button>
                    )}
                    <button
                      onClick={() => markAsRead(notification.id)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Later
                    </button>
                  </div>
                </div>
                
                <button
                  onClick={() => dismissNotification(notification.id)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
} 
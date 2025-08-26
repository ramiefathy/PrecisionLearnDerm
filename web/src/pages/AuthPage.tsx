import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/Toast';
import { handleError } from '../lib/errorHandler';

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  if (user) {
    return <Navigate to="/app" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success('Welcome back!', 'Successfully signed in');
        // Force navigation after successful sign-in
        setTimeout(() => {
          navigate('/app', { replace: true });
        }, 500);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        toast.success('Welcome!', 'Account created successfully');
        // Force navigation after successful sign-up
        setTimeout(() => {
          navigate('/app', { replace: true });
        }, 500);
      }
    } catch (error: any) {
      handleError(error, {
        title: 'Authentication Failed',
        message: 'Please check your credentials and try again',
        context: 'Auth',
      });
      setLoading(false);
    }
    // Don't set loading to false on success - let the navigation handle it
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Side - Brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-800"></div>
        <div className="relative z-10 flex flex-col justify-center px-12 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-4">
                Master Dermatology with Intelligence
              </h1>
              <p className="text-gray-300 text-lg leading-relaxed">
                Join thousands of medical professionals advancing their knowledge through 
                AI-powered adaptive learning designed specifically for dermatology.
              </p>
            </div>

            <div className="space-y-6">
              {[
                { icon: '🎯', text: 'Personalized question bank adapts to your learning style' },
                { icon: '📊', text: 'Detailed analytics track your progress and identify gaps' },
                { icon: '🧠', text: 'Spaced repetition algorithm optimizes retention' },
                { icon: '⏱️', text: 'Board-style mock exams prepare you for success' }
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
                  className="flex items-center space-x-3"
                >
                  <span className="text-2xl">{feature.icon}</span>
                  <span className="text-gray-300">{feature.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Logo for mobile */}
          <div className="text-center mb-8 lg:hidden">
            <h1 className="text-2xl font-bold text-gray-900">PrecisionLearnDerm</h1>
            <p className="text-gray-600 mt-2">Intelligent dermatology education</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                {mode === 'signin' ? 'Welcome back' : 'Create account'}
              </h2>
              <p className="text-gray-600">
                {mode === 'signin' 
                  ? 'Sign in to continue your learning journey' 
                  : 'Start your dermatology mastery today'
                }
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-colors"
                  placeholder="Enter your email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-colors"
                  placeholder="Enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-800 focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                  </div>
                ) : (
                  mode === 'signin' ? 'Sign in' : 'Create account'
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    {mode === 'signin' ? "Don't have an account?" : "Already have an account?"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                className="mt-4 text-gray-900 font-medium hover:text-gray-700 transition-colors"
              >
                {mode === 'signin' ? 'Create account' : 'Sign in'}
              </button>
            </div>

            {mode === 'signup' && (
              <div className="mt-6 text-xs text-gray-500 text-center">
                By creating an account, you agree to our{' '}
                <a href="#" className="text-gray-900 hover:underline">Terms of Service</a> and{' '}
                <a href="#" className="text-gray-900 hover:underline">Privacy Policy</a>
              </div>
            )}
          </div>

        </motion.div>
      </div>
    </div>
  );
}

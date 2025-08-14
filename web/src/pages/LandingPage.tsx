import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 overflow-hidden">
      {/* Header */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative z-50 max-w-7xl mx-auto px-4 py-6 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 grid place-items-center text-white font-bold text-lg shadow-lg">
            PL
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">
            PrecisionLearnDerm
          </span>
        </div>
        <nav className="hidden sm:flex items-center gap-6 text-sm">
          <a className="text-gray-600 hover:text-blue-600 transition-colors font-medium" href="#features">Features</a>
          <a className="text-gray-600 hover:text-blue-600 transition-colors font-medium" href="#how">How it works</a>
          <a className="text-gray-600 hover:text-blue-600 transition-colors font-medium" href="#science">The Science</a>
          <Link className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md" to="/auth">
            Login
          </Link>
        </nav>
      </motion.header>

      {/* Hero Section */}
      <section className="relative max-w-7xl mx-auto px-4 pt-12 pb-20 md:pt-20 md:pb-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative z-10"
          >
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-700 text-sm font-medium mb-6"
            >
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              AI-Powered Learning Platform
            </motion.div>

            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight mb-6">
              <span className="text-gray-900">Master</span>
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Dermatology
              </span>
              <br />
              <span className="text-gray-700">with Confidence</span>
            </h1>

            <p className="text-xl text-gray-600 max-w-xl leading-relaxed mb-8">
              Advanced AI adapts to your learning style, tracks your progress, and delivers personalized content designed to accelerate your board exam preparation.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <Link
                to="/auth"
                className="group px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
              >
                <span className="flex items-center gap-2">
                  Start Learning Free
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </Link>
              <Link
                to="/auth"
                className="px-8 py-4 rounded-xl border-2 border-gray-300 hover:border-blue-400 bg-white/80 backdrop-blur font-semibold text-gray-700 hover:text-blue-600 transition-all duration-300 hover:shadow-lg"
              >
                Watch Demo
              </Link>
            </div>

            <div className="flex items-center gap-6 text-sm text-gray-500">
              <div className="flex -space-x-3">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-10 h-10 rounded-full bg-gradient-to-r from-slate-400 to-slate-500 border-2 border-white shadow-lg" />
                ))}
              </div>
              <span className="font-medium">Join 2,000+ medical professionals</span>
            </div>
          </motion.div>

          {/* Animated Feature Cards */}
          <motion.div 
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="relative"
          >
            <div className="grid grid-cols-2 gap-4">
              {[
                { title: 'Smart Quizzes', desc: 'Adaptive questions that evolve', color: 'from-blue-500 to-blue-600', icon: '🧠' },
                { title: 'Spaced Learning', desc: 'Optimized retention algorithm', color: 'from-indigo-500 to-purple-600', icon: '🎯' },
                { title: 'Case Studies', desc: 'Real clinical scenarios', color: 'from-teal-500 to-cyan-600', icon: '📋' },
                { title: 'Progress Analytics', desc: 'Track your mastery', color: 'from-slate-500 to-gray-600', icon: '📊' },
              ].map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.6 + i * 0.1 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className={`p-6 rounded-2xl bg-gradient-to-br ${feature.color} text-white shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer`}
                >
                  <div className="text-3xl mb-3">{feature.icon}</div>
                  <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
                  <p className="text-sm opacity-90">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative bg-white/50 backdrop-blur py-20">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div 
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Why Choose PrecisionLearnDerm?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Built by dermatologists, powered by AI, designed for your success
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { title: 'Personalized Learning Path', desc: 'AI analyzes your strengths and adapts content to maximize retention and understanding.', icon: '🎯', gradient: 'from-blue-500 to-indigo-500' },
              { title: 'Evidence-Based Content', desc: 'Every question backed by current literature with citations to PubMed and dermatology textbooks.', icon: '📚', gradient: 'from-teal-500 to-cyan-500' },
              { title: 'Instant Feedback', desc: 'Get detailed explanations immediately, not just right/wrong but why and how.', icon: '⚡', gradient: 'from-slate-500 to-gray-600' },
              { title: 'Progress Analytics', desc: 'Track mastery across topics with detailed insights into your learning patterns.', icon: '📊', gradient: 'from-indigo-500 to-purple-500' },
              { title: 'Expert Support', desc: 'Connect with board-certified dermatologists for guidance and clarification.', icon: '👨‍⚕️', gradient: 'from-blue-600 to-blue-700' },
              { title: 'Mobile Optimized', desc: 'Study anywhere, anytime with our responsive design and offline capabilities.', icon: '📱', gradient: 'from-gray-600 to-slate-700' },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ y: 40, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                whileHover={{ y: -8 }}
                className="group p-8 rounded-2xl bg-white border border-gray-200 hover:border-blue-300 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-r ${feature.gradient} text-white text-2xl mb-6 group-hover:scale-110 transition-transform`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-20 bg-gradient-to-r from-blue-600 to-indigo-600 overflow-hidden">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to Transform Your Learning?
            </h2>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
              Join thousands of medical professionals who are mastering dermatology with AI-powered personalization.
            </p>
            <Link
              to="/auth"
              className="inline-flex items-center gap-3 px-10 py-5 rounded-xl bg-white text-blue-600 font-bold text-lg hover:bg-gray-50 transition-all shadow-xl hover:shadow-2xl hover:scale-105"
            >
              Start Your Journey
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-500 grid place-items-center text-white font-bold">
              PL
            </div>
            <span className="text-lg font-bold text-white">PrecisionLearnDerm</span>
          </div>
          <p className="text-sm">
            © {new Date().getFullYear()} PrecisionLearnDerm. Empowering the next generation of dermatologists.
          </p>
        </div>
      </footer>
    </main>
  );
} 
import { Suspense, lazy } from 'react';
import { Route, Routes, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { ProtectedRoute, AdminRoute } from './app/routes';
import { AnimatePresence, motion } from 'framer-motion';
import { ErrorBoundary } from 'react-error-boundary';
import { ToastContainer } from './components/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// --- LAZY-LOADED PAGE COMPONENTS (No changes here) ---
const LandingPage = lazy(() => import('./pages/LandingPage.tsx'));
const AuthPage = lazy(() => import('./pages/AuthPage.tsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.tsx'));
const TopicSelectionPage = lazy(() => import('./pages/TopicSelectionPage.tsx'));
const QuizConfigPage = lazy(() => import('./pages/QuizConfigPage.tsx'));
const QuizInProgressPage = lazy(() => import('./pages/QuizInProgressPage.tsx'));
const QuizSummaryPage = lazy(() => import('./pages/QuizSummaryPage.tsx'));
const FlashcardsPage = lazy(() => import('./pages/FlashcardsPage.tsx'));
const MockExamPage = lazy(() => import('./pages/MockExamPage.tsx'));
const PatientSimulationPage = lazy(() => import('./pages/PatientSimulationPage.tsx'));
const PerformancePage = lazy(() => import('./pages/PerformancePage.tsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.tsx'));
const AdminSetupPage = lazy(() => import('./pages/AdminSetupPage.tsx'));
const AdminItemsPage = lazy(() => import('./pages/AdminItemsPage.tsx'));
const AdminQuestionReviewPage = lazy(() => import('./pages/AdminQuestionReviewPage'));
const AdminQuestionGenerationPage = lazy(() => import('./pages/AdminQuestionGenerationPage'));
const AdminQuestionIterationPage = lazy(() => import('./pages/AdminQuestionIterationPage.tsx'));
const AdminQuestionBankPage = lazy(() => import('./pages/AdminQuestionBankPage'));
const AdminTestingPage = lazy(() => import('./pages/AdminTestingPage.tsx'));
const AdminTaxonomyPage = lazy(() => import('./pages/AdminTaxonomyPage.tsx'));
const AdminLogsPage = lazy(() => import('./pages/AdminLogsPage.tsx'));
const AdminEvaluationV2Page = lazy(() => import('./pages/AdminEvaluationV2Page.tsx'));
// Legacy evaluation dashboard
const AdminPipelineEvaluation = lazy(() => import('./pages/AdminPipelineEvaluation.tsx'));

// --- UI COMPONENTS (Loading, Error) ---

function LoadingFallback() {
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 grid place-items-center text-white font-bold animate-pulse">
          PL
        </div>
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
        <p className="text-gray-600 text-sm">Loading your learning experience...</p>
      </div>
    </div>
  );
}

// --- IMPROVED: ErrorFallback now uses useNavigate for SPA-friendly navigation ---
function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  const navigate = useNavigate();

  const handleGoHome = () => {
    // Navigate home and then reset the error boundary state
    navigate('/');
    resetErrorBoundary();
  };
  
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-red-500 to-orange-500 grid place-items-center text-white text-2xl mx-auto mb-4">
          ⚠️
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h1>
        <p className="text-gray-600 mb-6">We encountered an unexpected error. Don't worry, we're here to help!</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={resetErrorBoundary}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg transition-all"
          >
            Try Again
          </button>
          <button
            onClick={handleGoHome} // Use the new handler
            className="px-6 py-3 rounded-xl border-2 border-gray-300 bg-white font-semibold hover:bg-gray-50 transition-all duration-300 hover:shadow-lg"
          >
            Go Home
          </button>
        </div>
        <details className="mt-6 text-left">
          <summary className="text-sm text-gray-500 cursor-pointer">Technical Details</summary>
          <pre className="mt-2 text-xs text-gray-400 bg-gray-100 p-3 rounded overflow-auto">
            {error.message}
          </pre>
        </details>
      </div>
    </div>
  );
}

// --- NEW: CatchAllRoute handles undefined paths based on auth state ---
function CatchAllRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingFallback />;
  }

  // If user is authenticated, redirect to dashboard, otherwise to landing page
  return <Navigate to={user ? "/app" : "/"} replace />;
}

// --- NEW: A layout component to apply page transitions consistently ---
function PageLayout() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -8 }} 
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{ willChange: 'transform, opacity' }}
    >
      {/* Renders the child route's element */}
      <Outlet />
    </motion.div>
  );
}

// --- APP ROUTES COMPONENT ---
function AppRoutes() {
  const location = useLocation();
  
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
      <Suspense fallback={<LoadingFallback />}>
        <AnimatePresence mode="wait" initial={false}>
          {/* The key on Routes ensures transitions happen on navigation */}
          <Routes location={location} key={location.pathname}>
            {/* Public routes that don't need protection */}
            <Route element={<PageLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<AuthPage />} />
            </Route>

            {/* Protected user routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<PageLayout />}>
                <Route path="/app" element={<DashboardPage />} />
                <Route path="/quiz/topics" element={<TopicSelectionPage />} />
                <Route path="/quiz/config" element={<QuizConfigPage />} />
                <Route path="/quiz/play" element={<QuizInProgressPage />} />
                <Route path="/quiz/summary/:attemptId" element={<QuizSummaryPage />} />
                <Route path="/flashcards" element={<FlashcardsPage />} />
                <Route path="/mock-exam" element={<MockExamPage />} />
                <Route path="/patient-sim" element={<PatientSimulationPage />} />
                <Route path="/performance" element={<PerformancePage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
            </Route>

            {/* Protected admin routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<PageLayout />}>
                <Route
                  path="/admin/setup"
                  element={
                    <AdminRoute>
                      <AdminSetupPage />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/items"
                  element={
                    <AdminRoute>
                      <AdminItemsPage />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/review"
                  element={
                    <AdminRoute>
                      <AdminQuestionReviewPage />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/iteration"
                  element={
                    <AdminRoute>
                      <AdminQuestionIterationPage />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/generate"
                  element={
                    <AdminRoute>
                      <AdminQuestionGenerationPage />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/testing"
                  element={
                    <AdminRoute>
                      <AdminTestingPage />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/question-bank"
                  element={
                    <AdminRoute>
                      <AdminQuestionBankPage />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/taxonomy"
                  element={
                    <AdminRoute>
                      <AdminTaxonomyPage />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/logs"
                  element={
                    <AdminRoute>
                      <AdminLogsPage />
                    </AdminRoute>
                  }
                />
                {/* Legacy evaluation dashboard */}
                <Route
                  path="/admin/evaluation"
                  element={
                    <AdminRoute>
                      <AdminPipelineEvaluation />
                    </AdminRoute>
                  }
                />
                {/* New evaluation system */}
                <Route
                  path="/admin/evaluation-v2"
                  element={
                    <AdminRoute>
                      <AdminEvaluationV2Page />
                    </AdminRoute>
                  }
                />
                <Route path="/admin" element={<Navigate to="/admin/setup" replace />} />
              </Route>
            </Route>
            
            {/* Fallback route for any undefined paths - redirect to app if logged in, otherwise to landing */}
            <Route path="*" element={<CatchAllRoute />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
      
      {/* Global Toast Container */}
      <ToastContainer />
    </ErrorBoundary>
  );
}

// --- MAIN APP COMPONENT ---
export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

import { Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';


function AdminNavigation() {
  const location = useLocation();
  
  const tabs = [
    { 
      name: 'Overview', 
      href: '/admin/setup', 
      icon: '🏠', 
      description: 'System setup & status'
    },
    { 
      name: 'Content', 
      href: '/admin/items', 
      icon: '📝', 
      description: 'Items, taxonomy & content management',
      subPages: [
        { name: 'Items', href: '/admin/items', icon: '📄' },
        { name: 'Taxonomy', href: '/admin/taxonomy', icon: '🏷️' }
      ]
    },
    { 
      name: 'Question Generation', 
      href: '/admin/generate', 
      icon: '✨', 
      description: 'AI-powered question generation'
    },
    {
      name: 'Review Queue',
      href: '/admin/review',
      icon: '📋',
      description: 'Review AI-generated questions'
    },
    {
      name: 'Iteration',
      href: '/admin/iteration',
      icon: '🔄',
      description: 'Chat-based question refinement'
    },
    {
      name: 'Question Bank',
      href: '/admin/question-bank',
      icon: '📚',
      description: 'Statistics & question library'
    },
    {
      name: 'Pipeline Evaluation',
      href: '/admin/evaluation',
      icon: '📊',
      description: 'Test & compare AI pipelines',
      subPages: [
        { name: 'Legacy', href: '/admin/evaluation', icon: '🕰️' },
        { name: 'V2 (Beta)', href: '/admin/evaluation-v2', icon: '🆕' }
      ]
    },
    { 
      name: 'Development', 
      href: '/admin/testing', 
      icon: '🔧', 
      description: 'AI testing & system diagnostics',
      subPages: [
        { name: 'Testing', href: '/admin/testing', icon: '🧪' },
        { name: 'Logs', href: '/admin/logs', icon: '📋' }
      ]
    },
  ];

  return (
    <div className="bg-white/95 backdrop-blur-md border-b border-gray-200/70 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-sm text-gray-600 mt-1">Manage your PrecisionLearnDerm platform</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              System Operational
            </span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.href || 
              (tab.subPages && tab.subPages.some(sub => sub.href === location.pathname));
            
            return (
              <Link
                key={tab.href}
                to={tab.href}
                className={`group flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200 hover:border-gray-300'
                }`}
                title={tab.description}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{tab.icon}</span>
                  <span>{tab.name}</span>
                </div>
              </Link>
            );
          })}
        </div>
        
        {/* Sub-navigation for active tab with sub-pages */}
        {tabs
          .filter(tab => tab.subPages && (location.pathname === tab.href || tab.subPages.some(sub => sub.href === location.pathname)))
          .map(activeTab => (
            <div key={activeTab.href} className="mt-3 flex items-center gap-2">
              <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
              <div className="flex items-center gap-1 overflow-x-auto">
                {activeTab.subPages?.map(subPage => {
                  const isSubActive = location.pathname === subPage.href;
                  return (
                    <Link
                      key={subPage.href}
                      to={subPage.href}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        isSubActive
                          ? 'bg-blue-100 text-blue-700 border border-blue-200'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-sm">{subPage.icon}</span>
                      <span>{subPage.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

export function AdminRoute() {
  const { profile, user } = useAuth();
  
  if (!profile) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-orange-50 via-red-50 to-pink-50">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 grid place-items-center text-white text-2xl mx-auto mb-4">
            🔒
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Profile Loading</h1>
          <p className="text-gray-600">Please wait while we verify your access permissions...</p>
        </div>
      </div>
    );
  }

  // Check admin role
  const isAdminRole = profile.role === 'admin' || profile.isAdmin;

  if (!isAdminRole) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-orange-50 via-red-50 to-pink-50">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 grid place-items-center text-white text-2xl mx-auto mb-4">
            🚫
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Restricted</h1>
          <p className="text-gray-600 mb-6">
            You don't have permission to access this area. Admin access is required.
            {user?.email && (
              <><br /><span className="text-sm">Signed in as: {user.email}</span></>
            )}
          </p>
          <button 
            onClick={() => window.history.back()}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg transition-all"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <AdminNavigation />
      <Outlet />
    </div>
  );
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
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
          <p className="text-gray-600 text-sm">Preparing your profile...</p>
        </div>
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to="/auth" replace />;
}

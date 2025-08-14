import { useState, useEffect } from 'react';
import { Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, getUserProfile, createUserProfile } from '../lib/firebase';
import { useAppStore } from './store';

export function useAuthUser() {
  const [loading, setLoading] = useState(true);
  const { authUser, setAuthUser, setProfile, setProfileLoading } = useAppStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);

      if (user) {
        setProfileLoading(true);
        try {
          // Try to get existing profile
          let profile = await getUserProfile(user.uid);

          // If no profile exists, create one
          if (!profile) {
            profile = await createUserProfile(
              user.uid,
              user.email || '',
              user.displayName || undefined
            );
          }

          setProfile(profile);
        } catch (error) {
          console.error('Error loading/creating profile:', error);
          setProfile(null);
        } finally {
          setProfileLoading(false);
        }
      } else {
        setProfile(null);
        setProfileLoading(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [setAuthUser, setProfile, setProfileLoading]);

  return { user: authUser, loading };
}

function AdminNavigation() {
  const location = useLocation();
  
  const tabs = [
    { name: 'Setup', href: '/admin/setup', icon: '⚙️' },
    { name: 'Items', href: '/admin/items', icon: '🗃️' },
    { name: 'Questions', href: '/admin/questions', icon: '📝' },
    { name: 'Question Bank', href: '/admin/question-bank', icon: '📚' },
    { name: 'Taxonomy', href: '/admin/taxonomy', icon: '🏷️' },
    { name: 'AI Testing', href: '/admin/testing', icon: '🧪' },
  ];

  return (
    <div className="bg-white/90 backdrop-blur border-b border-gray-200/50 mb-4">
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              to={tab.href}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                location.pathname === tab.href
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminRoute() {
  const { profile, authUser } = useAppStore();
  
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

  // Check both role and specific email authorization
  const isAdminRole = profile.role === 'admin';
  const isAuthorizedEmail = authUser?.email === 'ramiefathy@gmail.com';

  if (!isAdminRole && !isAuthorizedEmail) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-orange-50 via-red-50 to-pink-50">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 grid place-items-center text-white text-2xl mx-auto mb-4">
            🚫
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Restricted</h1>
          <p className="text-gray-600 mb-6">
            You don't have permission to access this area. Admin access is required.
            {authUser?.email && (
              <><br/><span className="text-sm">Signed in as: {authUser.email}</span></>
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
  const { user, loading } = useAuthUser();

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

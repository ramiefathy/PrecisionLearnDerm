import { useEffect } from 'react';

export default function AdminGenerationRedirect() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.location.replace('/admin/generate');
    }
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 grid place-items-center text-white text-2xl mx-auto mb-4 animate-pulse">
          ↗️
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Redirecting...</h1>
        <p className="text-gray-600">Taking you to the updated admin generation page...</p>
      </div>
    </div>
  );
}
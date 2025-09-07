/**
 * Example integration of defensive patterns
 * Shows how to apply defensive rendering to existing components
 */

import React from 'react';
import { MinimalFallback, withDefensiveRendering } from '../components/MinimalFallback';

// Example: Defensive version of a complex admin component
const AdminDashboard = () => {
  // This could potentially fail due to missing data, API errors, etc.
  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      {/* Complex admin functionality */}
    </div>
  );
};

// Example: Defensive version with custom error handling
const SafeAdminDashboard = withDefensiveRendering(AdminDashboard, {
  errorFallback: (
    <div className="p-6 text-center">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Admin Dashboard Unavailable
      </h2>
      <p className="text-gray-600 mb-4">
        The admin dashboard is temporarily unavailable. Please try again later.
      </p>
      <a 
        href="/admin" 
        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Back to Admin Home
      </a>
    </div>
  ),
  onError: (error, errorInfo) => {
    // Log to monitoring service
    console.error('Admin Dashboard Error:', error, errorInfo);
    // Could send to error tracking service here
  }
});

// Example: Component that uses defensive wrapper hook
const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="admin-layout">
      <header className="admin-header">
        <h1>PrecisionLearnDerm Admin</h1>
      </header>
      
      <main className="admin-main">
        {/* Wrap potentially failing content sections */}
        <MinimalFallback
          errorFallback={
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800">This section is temporarily unavailable.</p>
            </div>
          }
        >
          {children}
        </MinimalFallback>
      </main>
    </div>
  );
};

// Example: Defensive API component
const AdminMetricsWidget = () => {
  const [metrics, setMetrics] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    // Potentially failing API call
    fetchAdminMetrics()
      .then(setMetrics)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="metrics-widget-loading">
        <div className="animate-pulse bg-gray-200 h-32 rounded-md"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="metrics-widget-error p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-yellow-800">Metrics temporarily unavailable</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-2 text-sm text-yellow-700 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="metrics-widget">
      {/* Metrics display */}
      <pre>{JSON.stringify(metrics, null, 2)}</pre>
    </div>
  );
};

// Mock API function
async function fetchAdminMetrics() {
  // Simulate API call that could fail
  await new Promise(resolve => setTimeout(resolve, 1000));
  if (Math.random() > 0.7) {
    throw new Error('API temporarily unavailable');
  }
  return { users: 100, questions: 500, activeTests: 25 };
}

// Safe version with defensive rendering
const SafeAdminMetricsWidget = withDefensiveRendering(AdminMetricsWidget, {
  loadingFallback: (
    <div className="p-4 bg-gray-50 rounded-md">
      <div className="animate-pulse bg-gray-200 h-32 rounded-md"></div>
      <p className="mt-2 text-sm text-gray-600">Loading metrics...</p>
    </div>
  ),
  errorFallback: (
    <div className="p-4 bg-red-50 border border-red-200 rounded-md">
      <h3 className="font-medium text-red-900">Metrics Unavailable</h3>
      <p className="text-red-700 text-sm mt-1">
        Unable to load admin metrics. The service may be temporarily down.
      </p>
      <button 
        onClick={() => window.location.reload()}
        className="mt-3 text-sm bg-red-100 text-red-800 px-3 py-1 rounded hover:bg-red-200"
      >
        Reload Page
      </button>
    </div>
  )
});

// Example usage in an admin page
export const ExampleAdminPage = () => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <SafeAdminDashboard />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SafeAdminMetricsWidget />
          
          {/* Other admin widgets wrapped defensively */}
          <MinimalFallback>
            <AdminMetricsWidget />
          </MinimalFallback>
        </div>
      </div>
    </AdminLayout>
  );
};

export default ExampleAdminPage;
import React, { Suspense } from 'react';
import type { ReactNode } from 'react';
import ErrorBoundary from './ErrorBoundary';

interface MinimalFallbackProps {
  children: ReactNode;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * Enhanced fallback wrapper that provides both loading and error states
 * with minimal UI that works even when styling systems fail
 */
const MinimalLoadingFallback = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px',
    padding: '20px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    margin: '16px'
  }}>
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px'
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        border: '3px solid #e5e7eb',
        borderTop: '3px solid #3b82f6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <span style={{
        fontSize: '14px',
        color: '#6b7280',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        Loading...
      </span>
    </div>
  </div>
);

/**
 * Minimal error fallback that works without external dependencies
 */
const MinimalErrorFallback = ({ resetError }: { error?: Error; resetError?: () => void }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px',
    padding: '20px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    margin: '16px'
  }}>
      <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      textAlign: 'center',
      maxWidth: '400px'
    }}>
      <div style={{
        fontSize: '24px',
        marginBottom: '8px'
      }}>⚠️</div>
      <h3 style={{
        margin: '0',
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#991b1b',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        Something went wrong
      </h3>
      <p style={{
        margin: '0',
        fontSize: '14px',
        color: '#7f1d1d',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        This section couldn't load properly. You can try refreshing the page or continue using other parts of the application.
      </p>
      {resetError && (
        <button
          onClick={resetError}
          type="button"
          style={{
            padding: '8px 16px',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            cursor: 'pointer',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#b91c1c';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#dc2626';
          }}
        >
          Try Again
        </button>
      )}
    </div>
  </div>
);

/**
 * Comprehensive fallback component that handles both loading and error states
 * with minimal styling that doesn't depend on external CSS frameworks
 */
export const MinimalFallback: React.FC<MinimalFallbackProps> = ({
  children,
  loadingFallback,
  errorFallback,
  onError
}) => {
  return (
    <ErrorBoundary
      fallback={errorFallback || <MinimalErrorFallback />}
      onError={onError}
    >
      <Suspense fallback={loadingFallback || <MinimalLoadingFallback />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
};

/**
 * Hook for creating defensive component wrappers
 */
export function useDefensiveWrapper() {
  const wrapComponent = React.useCallback((
    component: ReactNode,
    options?: {
      loadingFallback?: ReactNode;
      errorFallback?: ReactNode;
      onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
    }
  ) => (
    <MinimalFallback {...options}>
      {component}
    </MinimalFallback>
  ), []);

  return { wrapComponent };
}

/**
 * Higher-order component for defensive rendering
 */
export function withDefensiveRendering<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    loadingFallback?: ReactNode;
    errorFallback?: ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  }
) {
  return React.memo((props: P) => (
    <MinimalFallback {...options}>
      <Component {...props} />
    </MinimalFallback>
  ));
}

export default MinimalFallback;
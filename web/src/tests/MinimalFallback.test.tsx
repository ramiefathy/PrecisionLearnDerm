import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MinimalFallback, { withDefensiveRendering, useDefensiveWrapper } from '../components/MinimalFallback';

// Component that throws an error for testing
const ErrorThrowingComponent = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error for MinimalFallback');
  }
  return <div>Component loaded successfully</div>;
};

// Component that never resolves (for testing Suspense)
const NeverLoadingComponent = React.lazy(() => new Promise<{ default: React.ComponentType<any> }>(() => {}));

// Component that loads after delay
const DelayedComponent = React.lazy(() => 
  new Promise<{ default: React.ComponentType<any> }>(resolve => 
    setTimeout(() => resolve({ default: () => <div>Delayed component loaded</div> }), 100)
  )
);

describe('MinimalFallback', () => {
  beforeEach(() => {
    // Mock console.error to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error Boundary Functionality', () => {
    it('should show error fallback when child component throws', () => {
      render(
        <MinimalFallback>
          <ErrorThrowingComponent />
        </MinimalFallback>
      );

      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
      expect(screen.getByText(/Try Again/)).toBeInTheDocument();
    });

    it('should show custom error fallback when provided', () => {
      const customError = <div>Custom error message</div>;
      
      render(
        <MinimalFallback errorFallback={customError}>
          <ErrorThrowingComponent />
        </MinimalFallback>
      );

      expect(screen.getByText('Custom error message')).toBeInTheDocument();
      expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
    });

    it('should call onError callback when error occurs', () => {
      const onError = vi.fn();
      
      render(
        <MinimalFallback onError={onError}>
          <ErrorThrowingComponent />
        </MinimalFallback>
      );

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ componentStack: expect.any(String) })
      );
    });

    it('should allow retry after error', () => {
      let shouldThrow = true;
      const TestComponent = () => <ErrorThrowingComponent shouldThrow={shouldThrow} />;
      
      const { rerender } = render(
        <MinimalFallback>
          <TestComponent />
        </MinimalFallback>
      );

      // Initially shows error
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();

      // Fix the component and retry
      shouldThrow = false;
      const retryButton = screen.getByText(/Try Again/);
      fireEvent.click(retryButton);

      rerender(
        <MinimalFallback>
          <TestComponent />
        </MinimalFallback>
      );

      // Should show the successful component
      expect(screen.getByText('Component loaded successfully')).toBeInTheDocument();
    });
  });

  describe('Loading Boundary Functionality', () => {
    it('should show loading fallback for lazy components', () => {
      render(
        <MinimalFallback>
          <NeverLoadingComponent />
        </MinimalFallback>
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should show custom loading fallback when provided', () => {
      const customLoading = <div>Custom loading message</div>;
      
      render(
        <MinimalFallback loadingFallback={customLoading}>
          <NeverLoadingComponent />
        </MinimalFallback>
      );

      expect(screen.getByText('Custom loading message')).toBeInTheDocument();
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    it('should transition from loading to loaded state', async () => {
      render(
        <MinimalFallback>
          <DelayedComponent />
        </MinimalFallback>
      );

      // Initially shows loading
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Wait for component to load
      await screen.findByText('Delayed component loaded');
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  describe('Normal Operation', () => {
    it('should render children normally when no errors or loading', () => {
      render(
        <MinimalFallback>
          <ErrorThrowingComponent shouldThrow={false} />
        </MinimalFallback>
      );

      expect(screen.getByText('Component loaded successfully')).toBeInTheDocument();
      expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  describe('withDefensiveRendering HOC', () => {
    it('should wrap component with defensive rendering', () => {
      const TestComponent = () => <ErrorThrowingComponent />;
      const SafeComponent = withDefensiveRendering(TestComponent);

      render(<SafeComponent />);

      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });

    it('should pass props correctly through HOC', () => {
      const TestComponent = ({ message }: { message: string }) => <div>{message}</div>;
      const SafeComponent = withDefensiveRendering(TestComponent);

      render(<SafeComponent message="Test message" />);

      expect(screen.getByText('Test message')).toBeInTheDocument();
    });

    it('should use custom options in HOC', () => {
      const TestComponent = () => <ErrorThrowingComponent />;
      const customError = <div>HOC custom error</div>;
      const SafeComponent = withDefensiveRendering(TestComponent, {
        errorFallback: customError
      });

      render(<SafeComponent />);

      expect(screen.getByText('HOC custom error')).toBeInTheDocument();
    });
  });

  describe('useDefensiveWrapper Hook', () => {
    it('should provide component wrapper', () => {
      const TestContainer = () => {
        const { wrapComponent } = useDefensiveWrapper();
        return wrapComponent(<ErrorThrowingComponent />);
      };

      render(<TestContainer />);

      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });

    it('should apply custom options', () => {
      const TestContainer = () => {
        const { wrapComponent } = useDefensiveWrapper();
        return wrapComponent(
          <ErrorThrowingComponent />,
          { errorFallback: <div>Hook custom error</div> }
        );
      };

      render(<TestContainer />);

      expect(screen.getByText('Hook custom error')).toBeInTheDocument();
    });
  });

  describe('Styling and Accessibility', () => {
    it('should use inline styles that work without external CSS', () => {
      render(
        <MinimalFallback>
          <ErrorThrowingComponent />
        </MinimalFallback>
      );

      const errorContainer = screen.getByText(/Something went wrong/).closest('div');
      expect(errorContainer).toHaveStyle({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      });
    });

    it('should have accessible button text', () => {
      render(
        <MinimalFallback>
          <ErrorThrowingComponent />
        </MinimalFallback>
      );

      const retryButton = screen.getByRole('button', { name: /Try Again/ });
      expect(retryButton).toBeInTheDocument();
      expect(retryButton).toHaveAttribute('type', 'button');
    });

    it('should show loading spinner with proper styling', () => {
      render(
        <MinimalFallback>
          <NeverLoadingComponent />
        </MinimalFallback>
      );

      const loadingContainer = screen.getByText('Loading...').closest('div');
      expect(loadingContainer).toHaveStyle({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      });
    });
  });
});
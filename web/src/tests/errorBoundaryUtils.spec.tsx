import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { withErrorBoundary, useErrorHandler } from '../components/ErrorBoundaryUtils';
import ErrorBoundary from '../components/ErrorBoundary';

describe('withErrorBoundary', () => {
  it('renders fallback when wrapped component throws', () => {
    const Thrower = () => {
      throw new Error('boom');
    };
    const Wrapped = withErrorBoundary(Thrower, <div>fallback</div>);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Wrapped />);
    expect(screen.getByText('fallback')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});

describe('useErrorHandler', () => {
  it('renders fallback when hook throws', async () => {
    const TestComponent = () => {
      const { throwError } = useErrorHandler();
      React.useEffect(() => {
        throwError(new Error('boom'));
      }, [throwError]);
      return <div>no error</div>;
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div>fallback</div>}>
        <TestComponent />
      </ErrorBoundary>
    );
    expect(await screen.findByText('fallback')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});

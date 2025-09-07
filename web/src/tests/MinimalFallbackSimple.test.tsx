/**
 * Simple integration test for MinimalFallback component
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MinimalFallback from '../components/MinimalFallback';

// Simple test component
const WorkingComponent = () => <div>Component works!</div>;

describe('MinimalFallback Basic Tests', () => {
  it('should render children when no errors occur', () => {
    render(
      <MinimalFallback>
        <WorkingComponent />
      </MinimalFallback>
    );

    expect(screen.getByText('Component works!')).toBeInTheDocument();
  });

  it('should exist and be importable', () => {
    expect(MinimalFallback).toBeDefined();
    expect(typeof MinimalFallback).toBe('function');
  });
});
import { screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from './utils';
import App from '../App';

vi.mock('../lib/firebase', () => ({
  functions: {},
  db: {},
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: () => async () => ({ data: { success: true, jobId: '1' } }),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
}));

describe('Admin evaluation v2 route', () => {
  it('renders evaluation dashboard for admin user', async () => {
    renderWithProviders(<App />, {
      route: '/admin/evaluation-v2',
      auth: {
        user: { uid: '1', email: 'admin@example.com' } as any,
        profile: { role: 'admin', isAdmin: true } as any,
      },
    });

    expect(
      await screen.findByText(/Pipeline Evaluation System/i, undefined, { timeout: 5000 })
    ).toBeInTheDocument();
  });
});
